-- Stock-backed units remain reserved in pedido_stock. A pedido shortages are
-- obligations, never negative or invented physical stock.
create table public.pedido_abastecimiento (
 pedido_id uuid not null references public.pedido(id) on delete restrict,
 producto_simple_id bigint not null references public.producto_simple(id_producto) on delete restrict,
 cantidad_solicitada integer not null check(cantidad_solicitada>0),
 cantidad_pendiente integer not null check(cantidad_pendiente>=0 and cantidad_pendiente<=cantidad_solicitada),
 creado_en timestamptz not null default now(),
 primary key(pedido_id,producto_simple_id)
);
create index pedido_abastecimiento_pendiente_idx on public.pedido_abastecimiento(producto_simple_id,creado_en) where cantidad_pendiente>0;
-- Several actual deliveries may reserve parts of the same order line.
alter table public.movimiento_stock drop constraint movimiento_stock_pedido_id_producto_simple_id_motivo_key;
create index movimiento_stock_pedido_producto_motivo_idx on public.movimiento_stock(pedido_id,producto_simple_id,motivo);
alter table public.pedido_abastecimiento enable row level security;
revoke all on public.pedido_abastecimiento from public,anon,authenticated;
grant select,insert,update on public.pedido_abastecimiento to service_role;

create or replace function public.mb_catalogo_disponibilidad()
returns table(variante_id bigint,comprable boolean,con_stock boolean)
language sql stable security invoker set search_path='' as $$
 select cv.id,
  coalesce(m.aprobado,false) and p.activo and cp.publicado and cv.vigente and cv.disponible and cv.precio is not null
   and p.moneda='ARS' and exists(select 1 from public.catalogo_variante_componente c where c.variante_id=cv.id)
   and not exists(select 1 from public.catalogo_variante_componente c left join public.producto_simple s on s.id_producto=c.producto_simple_id
    left join private.inventario_ficha f on f.producto_id=c.producto_simple_id
    where c.variante_id=cv.id and (s.stock is null or f.producto_id is null or f.abastecimiento not in ('stock','a_pedido'))) as comprable,
  not exists(select 1 from public.catalogo_variante_componente c join public.producto_simple s on s.id_producto=c.producto_simple_id
   join private.inventario_ficha f on f.producto_id=s.id_producto
   where c.variante_id=cv.id and (s.stock is null or (f.abastecimiento='stock' and s.stock<c.cantidad))) as con_stock
 from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
 join public.catalogo_producto cp on cp.producto_id=p.id_producto left join public.catalogo_variante_mapeo m on m.variante_id=cv.id;
$$;

-- Allocating arrived units is the same stock reservation as checkout. It is
-- limited to paid orders and serialized by the existing global inventory lock.
create function public.mb_asignar_abastecimiento(p_producto_id bigint default null,p_pedido_id uuid default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare row_demand record; available integer; assigned integer; total integer:=0;
begin
 perform pg_advisory_xact_lock(782204,1);
 for row_demand in
  select d.pedido_id,d.producto_simple_id,d.cantidad_pendiente
  from public.pedido_abastecimiento d join public.pedido p on p.id=d.pedido_id
  where d.cantidad_pendiente>0 and p.estado in ('pagado','en_preparacion')
   and (p_producto_id is null or d.producto_simple_id=p_producto_id)
   and (p_pedido_id is null or d.pedido_id=p_pedido_id)
  order by p.creado_en,d.producto_simple_id for update of d
 loop
  select s.stock into available from public.producto_simple s
   where s.id_producto=row_demand.producto_simple_id for update;
  assigned:=least(coalesce(available,0),row_demand.cantidad_pendiente);
  if assigned<=0 then continue; end if;
  update public.producto_simple set stock=stock-assigned where id_producto=row_demand.producto_simple_id;
  update public.pedido_abastecimiento set cantidad_pendiente=cantidad_pendiente-assigned
   where pedido_id=row_demand.pedido_id and producto_simple_id=row_demand.producto_simple_id;
  insert into public.pedido_stock(pedido_id,producto_simple_id,cantidad)
   values(row_demand.pedido_id,row_demand.producto_simple_id,assigned)
   on conflict(pedido_id,producto_simple_id) do update set cantidad=public.pedido_stock.cantidad+excluded.cantidad;
  insert into public.movimiento_stock(pedido_id,producto_simple_id,cantidad,motivo)
   values(row_demand.pedido_id,row_demand.producto_simple_id,-assigned,'reserva');
  total:=total+assigned;
 end loop;
 return total;
end $$;
revoke all on function public.mb_asignar_abastecimiento(bigint,uuid) from public,anon,authenticated;
grant execute on function public.mb_asignar_abastecimiento(bigint,uuid) to service_role;

-- Order-line preparation tracks the blank piece and the actual engraving job.
create table public.pedido_preparacion (
 id uuid primary key default gen_random_uuid(),
 pedido_item_id uuid not null references public.pedido_item(id) on delete restrict,
 pedido_id uuid not null references public.pedido(id) on delete restrict,
 producto_simple_id bigint not null references public.producto_simple(id_producto) on delete restrict,
 cantidad integer not null check(cantidad>0),
 estado text not null default 'pendiente_pago' check(estado in
  ('pendiente_pago','pendiente_preparar','enviado_grabar','grabado_recibido','listo_despachar','despachado','entregado','cancelado')),
 actualizado_en timestamptz not null default now(),
 unique(pedido_item_id,producto_simple_id)
);
create index pedido_preparacion_estado_idx on public.pedido_preparacion(estado,pedido_id);
alter table public.pedido_preparacion enable row level security;
revoke all on public.pedido_preparacion from public,anon,authenticated;
grant select,insert,update on public.pedido_preparacion to service_role;
create table private.preparacion_evento (
 id bigint generated always as identity primary key,
 preparacion_id uuid not null references public.pedido_preparacion(id),
 actor_id uuid references auth.users(id),
 estado_anterior text not null,estado_nuevo text not null,
 nota text not null default '',creado_en timestamptz not null default now()
);
alter table private.preparacion_evento enable row level security;
revoke all on private.preparacion_evento from public,anon,authenticated;
grant select,insert on private.preparacion_evento to service_role;

create function public.mb_crear_preparacion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.variante_id is not null then
  insert into public.pedido_preparacion(pedido_item_id,pedido_id,producto_simple_id,cantidad)
  select new.id,new.pedido_id,c.producto_simple_id,new.cantidad*c.cantidad
  from public.catalogo_variante_componente c where c.variante_id=new.variante_id and c.requiere_grabado;
 end if;
 return new;
end $$;
create trigger pedido_item_preparacion after insert on public.pedido_item
for each row execute function public.mb_crear_preparacion();
revoke all on function public.mb_crear_preparacion() from public,anon,authenticated;

create function public.mb_estado_preparacion_pedido() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.estado='pagado' and old.estado='pendiente_pago' then
  update public.pedido_preparacion set estado='pendiente_preparar',actualizado_en=now()
   where pedido_id=new.id and estado='pendiente_pago';
  perform public.mb_asignar_abastecimiento(null,new.id);
 elsif new.estado='cancelado' then
  update public.pedido_preparacion set estado='cancelado',actualizado_en=now()
   where pedido_id=new.id and estado='pendiente_pago';
 elsif new.estado='enviado' then
  update public.pedido_preparacion set estado='despachado',actualizado_en=now()
   where pedido_id=new.id and estado='listo_despachar';
 elsif new.estado='entregado' then
  update public.pedido_preparacion set estado='entregado',actualizado_en=now()
   where pedido_id=new.id and estado='despachado';
 end if;
 return new;
end $$;
create trigger pedido_preparacion_estado after update of estado on public.pedido
for each row when(old.estado is distinct from new.estado) execute function public.mb_estado_preparacion_pedido();
revoke all on function public.mb_estado_preparacion_pedido() from public,anon,authenticated;

create function public.mb_validar_despacho() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.estado in ('enviado','entregado') and old.estado is distinct from new.estado then
  if exists(select 1 from public.pedido_abastecimiento d where d.pedido_id=new.id and d.cantidad_pendiente>0)
   then raise exception 'Pedido con componentes pendientes de abastecimiento'; end if;
  if exists(select 1 from public.pedido_preparacion p where p.pedido_id=new.id and p.estado<>'listo_despachar'
   and new.estado='enviado') then raise exception 'Pedido con grabados pendientes'; end if;
 end if;
 return new;
end $$;
create trigger pedido_validar_despacho before update of estado on public.pedido
for each row execute function public.mb_validar_despacho();
revoke all on function public.mb_validar_despacho() from public,anon,authenticated;

-- Catalog checkout retains price, identity, idempotency and cart semantics.
create or replace function public.mb_checkout_catalogo(p_token_hash text,p_usuario_id uuid,p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.carrito; o public.pedido; e public.metodo_envio; d public.direccion;
 v_quote jsonb; v_items jsonb; v_need jsonb; v_reserved jsonb:='[]'; v_unfilled jsonb:='[]';
 v_cost numeric; v_promo boolean; item jsonb; r record; v_mode text; v_available integer; v_take integer; v_pending integer;
begin
 if p_usuario_id is null then raise exception 'Inicia sesion'; end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Sesion invalida'; end if;
 if nullif(p_datos->>'idempotencia','') is null then raise exception 'Falta idempotencia'; end if;
 -- Exactly the same inventory lock used by adjustments, sales, expiration,
 -- payment confirmation and the legacy commerce RPC.
 perform pg_advisory_xact_lock(782204,1);
 perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text,0));
 select * into o from public.pedido where usuario_id=p_usuario_id and idempotencia=(p_datos->>'idempotencia')::uuid;
 if found then return to_jsonb(o); end if;
 select * into c from public.carrito where token_hash=p_token_hash for update;
 if not found or c.usuario_id is not null and c.usuario_id<>p_usuario_id then raise exception 'Sesion invalida'; end if;
 if c.expira_en<=now() then raise exception 'El carrito vencio'; end if;
 if c.estado='convertido' then
  select * into o from public.pedido where carrito_id=c.id and usuario_id=p_usuario_id;
  if found then return to_jsonb(o); end if;
  raise exception 'Carrito ya confirmado';
 end if;
 if not exists(select 1 from public.carrito_variante where carrito_id=c.id) then raise exception 'Carrito sin variantes'; end if;
 if exists(select 1 from public.carrito_item i join public.producto p on p.id_producto=i.producto_id
   where i.carrito_id=c.id and (not p.activo or p.moneda<>'ARS')) then raise exception 'Producto no disponible'; end if;
 select * into e from public.metodo_envio where codigo=p_datos->>'envio' and activo for share;
 if not found then raise exception 'Metodo de envio no disponible'; end if;
 perform 1 from public.metodo_pago where codigo=p_datos->>'pago' and activo for share;
 if not found or p_datos->>'pago'='mercadopago' then raise exception 'Metodo de pago no disponible'; end if;
 if p_datos->>'pago'='efectivo' and e.requiere_direccion then raise exception 'Efectivo solo al retirar'; end if;
 if e.requiere_direccion then
  select * into d from public.direccion where id=(p_datos->>'direccion_id')::uuid and usuario_id=p_usuario_id for share;
  if not found then raise exception 'Direccion no encontrada'; end if;
  if d.pais<>e.pais then raise exception 'Destino fuera de cobertura'; end if;
 end if;
 -- Freeze prices and mapping while taking the order snapshot.
 perform 1 from public.carrito_variante i join public.catalogo_variante cv on cv.id=i.variante_id
  join public.producto p on p.id_producto=cv.producto_id
  where i.carrito_id=c.id order by cv.id for share of cv,p;
 perform 1 from public.catalogo_variante_componente mc join public.carrito_variante i on i.variante_id=mc.variante_id
  where i.carrito_id=c.id order by mc.producto_simple_id for share of mc;
 for r in select i.variante_id,disp.comprable,disp.con_stock from public.carrito_variante i
  join public.mb_catalogo_disponibilidad() disp on disp.variante_id=i.variante_id where i.carrito_id=c.id loop
  if not r.comprable then raise exception 'Variante sin relacion de inventario aprobada'; end if;
  if not r.con_stock then raise exception 'Stock insuficiente'; end if;
 end loop;
 if exists(select 1 from public.carrito_variante i left join public.mb_catalogo_disponibilidad() disp on disp.variante_id=i.variante_id
  where i.carrito_id=c.id and disp.variante_id is null) then raise exception 'Variante sin relacion de inventario aprobada'; end if;
 v_quote:=public.mb_cotizar_catalogo(c.id,p_datos->>'pago');v_items:=v_quote->'items';
 if jsonb_array_length(v_items)=0 then raise exception 'Carrito vacio'; end if;
 if (v_quote->>'subtotal')::numeric<=0 then raise exception 'Precio invalido'; end if;
 select jsonb_agg(to_jsonb(x)) into v_need from (
  select producto_simple_id,sum(cantidad)::integer cantidad from (
   select i.producto_id producto_simple_id,i.cantidad from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id and p.tipo='simple'
   union all select ci.id_producto_simple,i.cantidad*ci.cantidad from public.carrito_item i join public.combo_item ci on ci.id_combo=i.producto_id where i.carrito_id=c.id
   union all select mc.producto_simple_id,i.cantidad*mc.cantidad from public.carrito_variante i join public.catalogo_variante_componente mc on mc.variante_id=i.variante_id where i.carrito_id=c.id
  ) n group by producto_simple_id
 ) x;
 if v_need is null then raise exception 'Carrito sin componentes fisicos'; end if;
 for r in select * from jsonb_to_recordset(v_need) as n(producto_simple_id bigint,cantidad integer) order by producto_simple_id loop
  select f.abastecimiento,s.stock into v_mode,v_available from private.inventario_ficha f
   join public.producto_simple s on s.id_producto=f.producto_id
   where f.producto_id=r.producto_simple_id for update of s;
  if not found or v_available is null then raise exception 'Insumo físico no disponible'; end if;
  if v_mode='stock' and v_available<r.cantidad then raise exception 'Stock insuficiente para producto %',r.producto_simple_id; end if;
  v_take:=case when v_mode='a_pedido' then least(v_available,r.cantidad) else r.cantidad end;
  v_pending:=r.cantidad-v_take;
  if v_take>0 then
   update public.producto_simple set stock=stock-v_take where id_producto=r.producto_simple_id and stock>=v_take;
   if not found then raise exception 'Stock insuficiente para producto %',r.producto_simple_id; end if;
   v_reserved:=v_reserved||jsonb_build_array(jsonb_build_object('producto_simple_id',r.producto_simple_id,'cantidad',v_take));
  end if;
  if v_pending>0 then
   v_unfilled:=v_unfilled||jsonb_build_array(jsonb_build_object('producto_simple_id',r.producto_simple_id,'cantidad',v_pending));
  end if;
 end loop;
 -- Shipping promotion only when every catalog line explicitly has free shipping.
 select coalesce(bool_and(cp.envio_gratis is true),false) into v_promo from public.carrito_variante i
  join public.catalogo_variante cv on cv.id=i.variante_id
  join public.catalogo_producto cp on cp.producto_id=cv.producto_id where i.carrito_id=c.id;
 v_cost:=case when not exists(select 1 from public.carrito_item where carrito_id=c.id) and v_promo then 0 else e.costo end;
 update public.carrito set usuario_id=coalesce(usuario_id,p_usuario_id),actualizado_en=now() where id=c.id;
 insert into public.pedido(usuario_id,carrito_id,idempotencia,subtotal,costo_envio,direccion_entrega,moneda)
 values(p_usuario_id,c.id,(p_datos->>'idempotencia')::uuid,(v_quote->>'subtotal')::numeric,v_cost,
  case when e.requiere_direccion then to_jsonb(d)-'usuario_id'-'id'-'creado_en' else jsonb_build_object('retiro',e.nombre) end,'ARS') returning * into o;
 for item in select value from jsonb_array_elements(v_items) loop
  insert into public.pedido_item(pedido_id,producto_id,variante_id,nombre,precio_unitario,cantidad,opciones,personalizacion)
  values(o.id,(item->>'producto_id')::bigint,(item->>'variante_id')::bigint,item->>'nombre',
   (item->>'precio_unitario')::numeric,(item->>'cantidad')::integer,item->'opciones',item->>'personalizacion');
 end loop;
 insert into public.pedido_stock(pedido_id,producto_simple_id,cantidad)
 select o.id,producto_simple_id,cantidad from jsonb_to_recordset(v_reserved) as n(producto_simple_id bigint,cantidad integer);
 insert into public.movimiento_stock(pedido_id,producto_simple_id,cantidad,motivo)
 select o.id,producto_simple_id,-cantidad,'reserva' from jsonb_to_recordset(v_reserved) as n(producto_simple_id bigint,cantidad integer);
 insert into public.pedido_abastecimiento(pedido_id,producto_simple_id,cantidad_solicitada,cantidad_pendiente)
 select o.id,producto_simple_id,cantidad,cantidad from jsonb_to_recordset(v_unfilled) as n(producto_simple_id bigint,cantidad integer);
 insert into public.pago(pedido_id,metodo,importe,moneda) values(o.id,p_datos->>'pago',o.total,'ARS');
 insert into public.envio(pedido_id,metodo) values(o.id,e.codigo);
 update public.carrito set estado='convertido' where id=c.id;
 return to_jsonb(o);
end $$;
