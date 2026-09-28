-- MateBreak2. Additive migration; existing product data is preserved.
begin;
create table public.perfil (
 id uuid primary key references auth.users(id) on delete cascade,
 nombre text not null default '' check(length(nombre)<=150),
 telefono text not null default '' check(length(telefono)<=40),
 creado_en timestamptz not null default now()
);
create table public.direccion (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references auth.users(id) on delete cascade,
 destinatario text not null check(length(trim(destinatario)) between 1 and 150),
 telefono text not null check(length(trim(telefono)) between 1 and 40),
 calle text not null check(length(trim(calle)) between 1 and 250),
 ciudad text not null check(length(trim(ciudad)) between 1 and 100),
 departamento text not null check(length(trim(departamento)) between 1 and 100),
 codigo_postal text not null default '' check(length(codigo_postal)<=20),
 pais char(2) not null default 'UY' check(pais ~ '^[A-Z]{2}$'),
 indicaciones text not null default '' check(length(indicaciones)<=500),
 creado_en timestamptz not null default now()
);
create index direccion_usuario_idx on public.direccion(usuario_id);
create table public.carrito (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 usuario_id uuid references auth.users(id) on delete cascade,
 estado text not null default 'abierto' check(estado in ('abierto','convertido')),
 expira_en timestamptz not null default now()+interval '30 days',
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now()
);
create index carrito_usuario_idx on public.carrito(usuario_id);
create index carrito_expira_idx on public.carrito(expira_en) where estado='abierto';
create table public.carrito_item (
 carrito_id uuid not null references public.carrito(id) on delete cascade,
 producto_id bigint not null references public.producto(id_producto) on delete restrict,
 cantidad integer not null check(cantidad between 1 and 99),
 primary key(carrito_id,producto_id)
);
create index carrito_item_producto_idx on public.carrito_item(producto_id);
create table public.metodo_pago (
 codigo text primary key, nombre text not null, activo boolean not null default false,
 instrucciones text not null default ''
);
insert into public.metodo_pago(codigo,nombre) values
 ('transferencia','Transferencia bancaria'),('mercadopago','Mercado Pago'),('efectivo','Efectivo al retirar');
create table public.metodo_envio (
 codigo text primary key, nombre text not null, costo numeric(12,2) not null check(costo>=0),
 requiere_direccion boolean not null default true, activo boolean not null default false,
 pais char(2) not null default 'UY'
);
insert into public.metodo_envio(codigo,nombre,costo,requiere_direccion) values
 ('retiro','Retiro coordinado',0,false);
create table public.pedido (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references auth.users(id) on delete restrict,
 carrito_id uuid not null unique references public.carrito(id) on delete restrict,
 idempotencia uuid not null,
 estado text not null default 'pendiente_pago' check(estado in ('pendiente_pago','pagado','en_preparacion','enviado','entregado','cancelado')),
 moneda char(3) not null default 'UYU' check(moneda='UYU'),
 subtotal numeric(12,2) not null check(subtotal>=0),
 costo_envio numeric(12,2) not null check(costo_envio>=0),
 total numeric(12,2) generated always as (subtotal+costo_envio) stored,
 direccion_entrega jsonb not null,
 creado_en timestamptz not null default now(),
 reserva_hasta timestamptz not null default now()+interval '24 hours',
 unique(usuario_id,idempotencia)
);
create index pedido_usuario_fecha_idx on public.pedido(usuario_id,creado_en desc);
create index pedido_reserva_idx on public.pedido(reserva_hasta) where estado='pendiente_pago';
create table public.pedido_item (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references public.pedido(id) on delete restrict,
 producto_id bigint not null references public.producto(id_producto) on delete restrict,
 nombre text not null,
 precio_unitario numeric(12,2) not null check(precio_unitario>=0),
 cantidad integer not null check(cantidad between 1 and 99),
 subtotal numeric(12,2) generated always as (precio_unitario*cantidad) stored,
 unique(pedido_id,producto_id)
);
create index pedido_item_producto_idx on public.pedido_item(producto_id);
create table public.pago (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references public.pedido(id) on delete restrict,
 metodo text not null references public.metodo_pago(codigo),
 estado text not null default 'pendiente' check(estado in ('pendiente','aprobado','rechazado','cancelado','reembolsado')),
 importe numeric(12,2) not null check(importe>=0),
 moneda char(3) not null default 'UYU' check(moneda='UYU'),
 referencia_externa text,
 creado_en timestamptz not null default now(),
 confirmado_en timestamptz,
 unique(metodo,referencia_externa)
);
create index pago_pedido_idx on public.pago(pedido_id);
create index pago_metodo_idx on public.pago(metodo);
create unique index pago_unico_aprobado_idx on public.pago(pedido_id) where estado='aprobado';
create table public.envio (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null unique references public.pedido(id) on delete restrict,
 metodo text not null references public.metodo_envio(codigo),
 estado text not null default 'pendiente' check(estado in ('pendiente','preparando','enviado','entregado','cancelado')),
 transportista text, seguimiento text,
 actualizado_en timestamptz not null default now()
);
create index envio_metodo_idx on public.envio(metodo);
create table public.pedido_stock (
 pedido_id uuid not null references public.pedido(id) on delete restrict,
 producto_simple_id bigint not null references public.producto_simple(id_producto) on delete restrict,
 cantidad integer not null check(cantidad>0),
 primary key(pedido_id,producto_simple_id)
);
create index pedido_stock_producto_idx on public.pedido_stock(producto_simple_id);
create table public.movimiento_stock (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references public.pedido(id) on delete restrict,
 producto_simple_id bigint not null references public.producto_simple(id_producto) on delete restrict,
 cantidad integer not null check(cantidad<>0),
 motivo text not null check(motivo in ('reserva','liberacion')),
 creado_en timestamptz not null default now(),
 unique(pedido_id,producto_simple_id,motivo)
);
create index movimiento_stock_producto_idx on public.movimiento_stock(producto_simple_id);

-- Server-only RPC. SECURITY INVOKER: no privilege escalation. The BFF verifies
-- Supabase Auth and supplies usuario_id; the browser cannot call this function.
create function public.mb_comercio(p_token_hash text, p_usuario_id uuid, p_accion text, p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 c public.carrito; o public.pedido; e public.metodo_envio; d public.direccion;
 r record; v_producto bigint; v_cantidad integer; v_id uuid; v_total numeric(12,2);
 v_result jsonb; v_necesidades jsonb;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Sesion invalida'; end if;
 if p_accion in ('pedidos','checkout','cancelar') and p_usuario_id is null then raise exception 'Inicia sesion'; end if;
 if p_accion='pedidos' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
   select p.*, (select jsonb_agg(to_jsonb(i)) from public.pedido_item i where i.pedido_id=p.id) items,
    (select jsonb_agg(to_jsonb(g)) from public.pago g where g.pedido_id=p.id) pagos,
    (select to_jsonb(s) from public.envio s where s.pedido_id=p.id) envio
   from public.pedido p where p.usuario_id=p_usuario_id order by p.creado_en desc limit 100
  )x),'[]');
 end if;
 if p_accion='cancelar' then
  select * into o from public.pedido where id=(p_datos->>'id')::uuid and usuario_id=p_usuario_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if o.estado='cancelado' then return to_jsonb(o); end if;
  if o.estado<>'pendiente_pago' then raise exception 'El pedido ya no admite cancelacion automatica'; end if;
  for r in select * from public.pedido_stock where pedido_id=o.id order by producto_simple_id loop
   update public.producto_simple set stock=stock+r.cantidad where id_producto=r.producto_simple_id;
   insert into public.movimiento_stock(pedido_id,producto_simple_id,cantidad,motivo) values(o.id,r.producto_simple_id,r.cantidad,'liberacion');
  end loop;
  update public.pedido set estado='cancelado' where id=o.id returning * into o;
  update public.pago set estado='cancelado' where pedido_id=o.id and estado='pendiente';
  update public.envio set estado='cancelado',actualizado_en=now() where pedido_id=o.id;
  return to_jsonb(o);
 end if;
 if p_accion not in ('carrito','cantidad','checkout','vincular') then raise exception 'Accion invalida'; end if;
 if p_accion='checkout' then
  if nullif(p_datos->>'idempotencia','') is null then raise exception 'Falta idempotencia'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text,0));
  select * into o from public.pedido where usuario_id=p_usuario_id and idempotencia=(p_datos->>'idempotencia')::uuid;
  if found then return to_jsonb(o); end if;
 end if;
 insert into public.carrito(token_hash,usuario_id) values(p_token_hash,p_usuario_id) on conflict(token_hash) do nothing;
 select * into c from public.carrito where token_hash=p_token_hash for update;
 if c.usuario_id is not null and c.usuario_id is distinct from p_usuario_id then raise exception 'Sesion invalida'; end if;
 if c.expira_en<=now() then raise exception 'El carrito vencio'; end if;
 if c.estado='convertido' then
  if p_accion='checkout' then
   select * into o from public.pedido where carrito_id=c.id and usuario_id=p_usuario_id;
   return to_jsonb(o);
  elsif p_accion='cantidad' then raise exception 'El carrito ya fue confirmado';
  else return jsonb_build_object('id',c.id,'estado','convertido','items','[]'::jsonb,'total',0); end if;
 end if;
 update public.carrito set usuario_id=coalesce(usuario_id,p_usuario_id),actualizado_en=now() where id=c.id;
 if p_accion='cantidad' then
  v_producto:=(p_datos->>'producto_id')::bigint; v_cantidad:=(p_datos->>'cantidad')::integer;
  if v_cantidad is null or v_cantidad not between 0 and 99 then raise exception 'Cantidad invalida'; end if;
  if v_cantidad=0 then delete from public.carrito_item where carrito_id=c.id and producto_id=v_producto;
  else
   if not exists(select 1 from public.producto where id_producto=v_producto and activo) then raise exception 'Producto no disponible'; end if;
   if (select count(*) from public.carrito_item where carrito_id=c.id)>=100 and not exists(select 1 from public.carrito_item where carrito_id=c.id and producto_id=v_producto) then raise exception 'Carrito lleno'; end if;
   insert into public.carrito_item(carrito_id,producto_id,cantidad) values(c.id,v_producto,v_cantidad)
    on conflict(carrito_id,producto_id) do update set cantidad=excluded.cantidad;
  end if;
 end if;
 if p_accion='checkout' then
  if not exists(select 1 from public.carrito_item where carrito_id=c.id) then raise exception 'Carrito vacio'; end if;
  select * into e from public.metodo_envio where codigo=p_datos->>'envio' and activo for share;
  if not found then raise exception 'Metodo de envio no disponible'; end if;
  perform 1 from public.metodo_pago where codigo=p_datos->>'pago' and activo for share;
  if not found then raise exception 'Metodo de pago no disponible'; end if;
  if p_datos->>'pago'='efectivo' and e.requiere_direccion then raise exception 'Efectivo solo al retirar'; end if;
  if e.requiere_direccion then
   select * into d from public.direccion where id=(p_datos->>'direccion_id')::uuid and usuario_id=p_usuario_id for share;
   if not found then raise exception 'Direccion no encontrada'; end if;
   if d.pais<>e.pais then raise exception 'Destino fuera de cobertura'; end if;
  end if;
  -- Lock prices and composition while taking a historical snapshot.
  perform 1 from public.producto p join public.carrito_item i on i.producto_id=p.id_producto where i.carrito_id=c.id order by p.id_producto for share of p;
  if exists(select 1 from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id and not p.activo) then raise exception 'Producto no disponible'; end if;
  perform 1 from public.combo_item ci join public.carrito_item i on i.producto_id=ci.id_combo where i.carrito_id=c.id order by ci.id_combo,ci.id_producto_simple for share of ci;
  if exists(select 1 from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id and
   ((p.tipo='simple' and not exists(select 1 from public.producto_simple s where s.id_producto=p.id_producto)) or
    (p.tipo='combo' and (not exists(select 1 from public.combo where id_producto=p.id_producto) or not exists(select 1 from public.combo_item where id_combo=p.id_producto))))) then raise exception 'Producto sin inventario o combo vacio'; end if;
  select jsonb_agg(to_jsonb(n)) into v_necesidades from (
   select producto_simple_id,sum(cantidad)::integer cantidad from (
    select p.id_producto producto_simple_id,i.cantidad from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id and p.tipo='simple'
    union all
    select ci.id_producto_simple,ci.cantidad*i.cantidad from public.carrito_item i join public.producto p on p.id_producto=i.producto_id join public.combo_item ci on ci.id_combo=p.id_producto where i.carrito_id=c.id and p.tipo='combo'
   )a group by producto_simple_id
  )n;
  for r in select * from jsonb_to_recordset(v_necesidades) as n(producto_simple_id bigint,cantidad integer) order by producto_simple_id loop
   update public.producto_simple set stock=stock-r.cantidad where id_producto=r.producto_simple_id and stock>=r.cantidad;
   if not found then raise exception 'Stock insuficiente para producto %',r.producto_simple_id; end if;
  end loop;
  select sum(p.precio*i.cantidad) into v_total from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id;
  insert into public.pedido(usuario_id,carrito_id,idempotencia,subtotal,costo_envio,direccion_entrega)
   values(p_usuario_id,c.id,(p_datos->>'idempotencia')::uuid,v_total,e.costo,
   case when e.requiere_direccion then to_jsonb(d)-'usuario_id'-'id'-'creado_en' else jsonb_build_object('retiro',e.nombre) end) returning * into o;
  insert into public.pedido_item(pedido_id,producto_id,nombre,precio_unitario,cantidad)
   select o.id,p.id_producto,p.nombre,p.precio,i.cantidad from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id;
  insert into public.pedido_stock select o.id,n.producto_simple_id,n.cantidad from jsonb_to_recordset(v_necesidades) as n(producto_simple_id bigint,cantidad integer);
  insert into public.movimiento_stock(pedido_id,producto_simple_id,cantidad,motivo) select o.id,producto_simple_id,-cantidad,'reserva' from public.pedido_stock where pedido_id=o.id;
  insert into public.pago(pedido_id,metodo,importe) values(o.id,p_datos->>'pago',o.total);
  insert into public.envio(pedido_id,metodo) values(o.id,e.codigo);
  update public.carrito set estado='convertido' where id=c.id;
  return to_jsonb(o);
 end if;
 select jsonb_build_object('id',c.id,'estado','abierto','items',coalesce(jsonb_agg(jsonb_build_object('producto_id',p.id_producto::text,'nombre',p.nombre,'cantidad',i.cantidad,'precio',p.precio,'activo',p.activo,'subtotal',p.precio*i.cantidad)),'[]'),'total',coalesce(sum(p.precio*i.cantidad),0)) into v_result
 from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id;
 return v_result;
end $$;

-- Only trusted operators / verified payment integrations may confirm payment.
create function public.mb_confirmar_pago(p_pago_id uuid,p_referencia text,p_importe numeric,p_moneda text)
returns void language plpgsql security invoker set search_path='' as $$
declare g public.pago; o public.pedido;
begin
 select * into g from public.pago where id=p_pago_id;
 if not found then raise exception 'Pago inexistente'; end if;
 select * into o from public.pedido where id=g.pedido_id for update;
 select * into g from public.pago where id=p_pago_id for update;
 if nullif(trim(p_referencia),'') is null or p_importe is distinct from g.importe or p_moneda is distinct from g.moneda then raise exception 'Pago no coincide'; end if;
 if g.estado='aprobado' and g.referencia_externa=p_referencia then return; end if;
 if g.estado<>'pendiente' or o.estado<>'pendiente_pago' or o.reserva_hasta<=now() then raise exception 'Pago requiere revision manual'; end if;
 update public.pago set estado='aprobado',referencia_externa=p_referencia,confirmado_en=now() where id=g.id;
 update public.pedido set estado='pagado' where id=o.id;
end $$;
create function public.mb_actualizar_envio(p_pedido_id uuid,p_estado text,p_transportista text default null,p_seguimiento text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.pedido;
begin
 select * into o from public.pedido where id=p_pedido_id for update;
 if not found then raise exception 'Pedido inexistente'; end if;
 if not ((o.estado='pagado' and p_estado='preparando') or (o.estado='en_preparacion' and p_estado='enviado') or (o.estado='enviado' and p_estado='entregado')) then raise exception 'Transicion de envio invalida'; end if;
 update public.envio set estado=p_estado,transportista=coalesce(p_transportista,transportista),seguimiento=coalesce(p_seguimiento,seguimiento),actualizado_en=now() where pedido_id=o.id;
 update public.pedido set estado=case p_estado when 'preparando' then 'en_preparacion' else p_estado end where id=o.id;
end $$;
create function public.mb_expirar_reservas() returns integer language plpgsql security invoker set search_path='' as $$
declare r record; n integer:=0;
begin
 for r in select id,usuario_id from public.pedido where estado='pendiente_pago' and reserva_hasta<=now() order by reserva_hasta limit 100 for update skip locked loop
  perform public.mb_comercio(repeat('0',64),r.usuario_id,'cancelar',jsonb_build_object('id',r.id)); n:=n+1;
 end loop;
 return n;
end $$;

-- Every new table starts closed to public clients. Customer-owned reads use RLS.
do $$ declare t text; begin
 foreach t in array array['perfil','direccion','carrito','carrito_item','metodo_pago','metodo_envio','pedido','pedido_item','pago','envio','pedido_stock','movimiento_stock'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
grant select,insert,update on public.perfil to authenticated;
create policy perfil_propio on public.perfil for all to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant select,insert,update,delete on public.direccion to authenticated;
create policy direccion_propia on public.direccion for all to authenticated using(usuario_id=(select auth.uid())) with check(usuario_id=(select auth.uid()));
grant select on public.pedido,public.pedido_item,public.pago,public.envio to authenticated;
create policy pedido_propio on public.pedido for select to authenticated using(usuario_id=(select auth.uid()));
create policy items_propios on public.pedido_item for select to authenticated using(exists(select 1 from public.pedido p where p.id=pedido_id and p.usuario_id=(select auth.uid())));
create policy pagos_propios on public.pago for select to authenticated using(exists(select 1 from public.pedido p where p.id=pedido_id and p.usuario_id=(select auth.uid())));
create policy envios_propios on public.envio for select to authenticated using(exists(select 1 from public.pedido p where p.id=pedido_id and p.usuario_id=(select auth.uid())));
revoke all on function public.mb_comercio(text,uuid,text,jsonb),public.mb_confirmar_pago(uuid,text,numeric,text),public.mb_actualizar_envio(uuid,text,text,text),public.mb_expirar_reservas() from public,anon,authenticated;
grant execute on function public.mb_comercio(text,uuid,text,jsonb),public.mb_confirmar_pago(uuid,text,numeric,text),public.mb_actualizar_envio(uuid,text,text,text),public.mb_expirar_reservas() to service_role;
grant select on public.producto,public.combo,public.combo_item to service_role;
grant select,update on public.producto_simple to service_role;
notify pgrst,'reload schema';
commit;
