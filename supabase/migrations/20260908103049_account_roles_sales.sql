begin;
create table private.equipo_vendedores (
 usuario_id uuid primary key references auth.users(id) on delete cascade,
 activo boolean not null default true,
 creado_en timestamptz not null default now()
);
alter table private.equipo_vendedores enable row level security;
revoke all on private.equipo_vendedores from public,anon,authenticated,service_role;
grant select on private.equipo_vendedores to service_role;
create function public.mb_rol(p_usuario_id uuid) returns text
language sql stable security invoker set search_path='' as $$
 select case when public.mb_inventario_autorizado(p_usuario_id) then 'administrador'
 when exists(select 1 from private.equipo_vendedores where usuario_id=p_usuario_id and activo) then 'vendedor'
 else 'cliente' end;
$$;
create function public.mb_carrito_cantidad(p_token_hash text,p_usuario_id uuid) returns integer
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(i.cantidad),0)::integer from public.carrito c join public.carrito_item i on i.carrito_id=c.id
 where c.token_hash=p_token_hash and c.estado='abierto' and c.expira_en>now()
 and (c.usuario_id is null or c.usuario_id=p_usuario_id);
$$;
revoke all on function public.mb_rol(uuid),public.mb_carrito_cantidad(text,uuid) from public,anon,authenticated;
grant execute on function public.mb_rol(uuid),public.mb_carrito_cantidad(text,uuid) to service_role;

create table public.email_contacto (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references auth.users(id) on delete cascade,
 email text not null check(length(email)<=254 and email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 creado_en timestamptz not null default now(),
 unique(usuario_id,email)
);
alter table public.email_contacto enable row level security;
revoke all on public.email_contacto from public,anon,authenticated;
grant select,insert,delete on public.email_contacto to authenticated;
create policy email_propio_leer on public.email_contacto for select to authenticated using(usuario_id=(select auth.uid()));
create policy email_propio_crear on public.email_contacto for insert to authenticated with check(usuario_id=(select auth.uid()));
create policy email_propio_eliminar on public.email_contacto for delete to authenticated using(usuario_id=(select auth.uid()));
create table private.venta_manual (
 id uuid primary key default gen_random_uuid(),
 operacion_id uuid not null unique,
 vendedor_id uuid references auth.users(id) on delete set null,
 vendedor_nombre text not null,
 cliente text not null check(length(trim(cliente)) between 2 and 150),
 telefono text not null default '' check(length(telefono)<=40),
 estado text not null check(estado in ('por_grabar','por_entregar','entregada')),
 metodo_pago text not null check(metodo_pago in ('efectivo','transferencia','tarjeta','otro')),
 total numeric(14,2) not null check(total>0),
 moneda text not null default 'UYU' check(moneda='UYU'),
 notas text not null default '' check(length(notas)<=1000),
 solicitud jsonb not null,
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 entregada_en timestamptz
);
create index venta_manual_vendedor_fecha_idx on private.venta_manual(vendedor_id,creado_en desc);
create table private.venta_manual_item (
 venta_id uuid not null references private.venta_manual(id) on delete restrict,
 linea integer not null,
 producto_id bigint not null references public.producto_simple(id_producto) on delete restrict,
 nombre text not null,
 cantidad integer not null check(cantidad between 1 and 10000),
 precio_unitario numeric(12,2) not null check(precio_unitario>0 and precio_unitario<=1000000),
 personalizacion text not null default '' check(length(personalizacion)<=500),
 primary key(venta_id,linea)
);
create index venta_manual_item_producto_idx on private.venta_manual_item(producto_id,venta_id);
create table private.venta_manual_evento (
 id uuid primary key default gen_random_uuid(),
 venta_id uuid not null references private.venta_manual(id) on delete restrict,
 actor_id uuid references auth.users(id) on delete set null,
 estado text not null,
 creado_en timestamptz not null default now(),
 unique(venta_id,estado)
);
create index venta_manual_evento_actor_idx on private.venta_manual_evento(actor_id);
alter table private.venta_manual enable row level security;
alter table private.venta_manual_item enable row level security;
alter table private.venta_manual_evento enable row level security;
revoke all on private.venta_manual,private.venta_manual_item,private.venta_manual_evento from public,anon,authenticated,service_role;
grant select,insert on private.venta_manual,private.venta_manual_item,private.venta_manual_evento to service_role;
grant update(estado,actualizado_en,entregada_en) on private.venta_manual to service_role;

create or replace function private.inventario_reservado(p_producto_id bigint)
returns integer language sql stable security invoker set search_path='' as $$
 select ((select coalesce(sum(s.cantidad),0) from public.pedido_stock s join public.pedido p on p.id=s.pedido_id
  where s.producto_simple_id=p_producto_id and p.estado in ('pendiente_pago','pagado','en_preparacion'))+
 (select coalesce(sum(i.cantidad),0) from private.venta_manual_item i join private.venta_manual v on v.id=i.venta_id
  where i.producto_id=p_producto_id and v.estado in ('por_grabar','por_entregar')))::integer;
$$;

create function public.mb_ventas(p_usuario_id uuid,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v private.venta_manual; r record; item jsonb; v_items jsonb:='[]'; v_total numeric:=0;
 v_operacion uuid; v_estado text; v_nombre text; v_stock integer; v_reservado integer; v_linea integer:=0;
 v_id bigint; v_qty integer; v_precio numeric; v_grabado text;
begin
 if p_usuario_id is null or public.mb_rol(p_usuario_id)<>'vendedor' then
  raise exception using errcode='42501',message='Esta operacion requiere una cuenta de vendedor';
 end if;
 if p_accion='productos' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from (
   select f.producto_id::text id,f.sku,p.nombre,p.precio from private.inventario_ficha f
   join public.producto p on p.id_producto=f.producto_id
  )x),'[]');
 end if;
 if p_accion='listar' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by (x.estado='entregada'),x.creado_en desc) from (
   select vm.id,vm.cliente,vm.telefono,vm.estado,vm.total,vm.moneda,vm.metodo_pago,vm.notas,vm.creado_en,
   (select jsonb_agg(jsonb_build_object('nombre',vi.nombre,'cantidad',vi.cantidad,'precio_unitario',vi.precio_unitario,'personalizacion',vi.personalizacion) order by vi.linea)
    from private.venta_manual_item vi where vi.venta_id=vm.id) items
   from private.venta_manual vm where vm.vendedor_id=p_usuario_id order by (vm.estado='entregada'),vm.creado_en desc limit 200
  )x),'[]');
 end if;
 perform pg_advisory_xact_lock(782204, 1);
 if p_accion='estado' then
  select * into v from private.venta_manual where id=(p_datos->>'id')::uuid and vendedor_id=p_usuario_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  v_estado:=p_datos->>'estado';
  if v_estado is null or v_estado not in ('por_entregar','entregada') then raise exception 'Estado invalido'; end if;
  if v.estado=v_estado then return jsonb_build_object('id',v.id,'estado',v.estado); end if;
  if not ((v.estado='por_grabar' and v_estado='por_entregar') or (v.estado='por_entregar' and v_estado='entregada')) then raise exception 'La venta debe pasar de grabado a entrega, y luego a entregada'; end if;
  if v_estado='entregada' then
   for r in select vi.producto_id,sum(vi.cantidad)::integer cantidad from private.venta_manual_item vi where vi.venta_id=v.id group by vi.producto_id order by vi.producto_id loop
    select stock into v_stock from public.producto_simple where id_producto=r.producto_id for update;
    v_reservado:=private.inventario_reservado(r.producto_id);
    insert into private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,cantidad_declarada,disponible_anterior,disponible_nuevo,reservado,motivo)
     values(gen_random_uuid(),r.producto_id,p_usuario_id,v.vendedor_nombre,'egreso',0,v_stock,v_stock,v_reservado,
      'Entrega de venta '||v.id::text||': salen '||r.cantidad||' unidades ya reservadas');
   end loop;
  end if;
  update private.venta_manual set estado=v_estado,actualizado_en=now(),entregada_en=case when v_estado='entregada' then now() else null end where id=v.id;
  insert into private.venta_manual_evento(venta_id,actor_id,estado) values(v.id,p_usuario_id,v_estado);
  return jsonb_build_object('id',v.id,'estado',v_estado);
 end if;
 if p_accion is distinct from 'registrar' then raise exception 'Operacion invalida'; end if;
 v_operacion:=(p_datos->>'idempotencia')::uuid;
 if v_operacion is null then raise exception 'Falta identificador de la venta'; end if;
 select * into v from private.venta_manual where operacion_id=v_operacion;
 if found then
  if v.vendedor_id is distinct from p_usuario_id or v.solicitud<>p_datos then raise exception 'Ese identificador ya corresponde a otra venta'; end if;
  return jsonb_build_object('id',v.id,'estado',v.estado,'total',v.total);
 end if;
 v_estado:=p_datos->>'estado';
 if v_estado is null or v_estado not in ('por_grabar','por_entregar','entregada') or
  p_datos->>'cliente' is null or length(trim(p_datos->>'cliente')) not between 2 and 150 or
  p_datos->>'metodo_pago' is null or p_datos->>'metodo_pago' not in ('efectivo','transferencia','tarjeta','otro') or
  jsonb_typeof(p_datos->'items') is distinct from 'array' then raise exception 'Revisa los datos de la venta'; end if;
 if jsonb_array_length(p_datos->'items') not between 1 and 50 then raise exception 'Agrega entre 1 y 50 lineas'; end if;
 for item in select value from jsonb_array_elements(p_datos->'items') loop
  if coalesce(item->>'cantidad','') !~ '^[0-9]+$' then raise exception 'Cantidad invalida'; end if;
  v_id:=(item->>'producto_id')::bigint; v_qty:=(item->>'cantidad')::integer; v_precio:=(item->>'precio_unitario')::numeric;
  v_grabado:=coalesce(trim(item->>'personalizacion'),'');
  if v_id is null or v_qty not between 1 and 10000 or v_precio is null or v_precio<=0 or v_precio>1000000 or
   v_precio<>round(v_precio,2) or length(v_grabado)>500 then raise exception 'Producto, cantidad o precio invalido'; end if;
  select p.nombre into v_nombre from private.inventario_ficha f join public.producto p on p.id_producto=f.producto_id where f.producto_id=v_id;
  if not found then raise exception 'Producto no encontrado'; end if;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('producto_id',v_id,'cantidad',v_qty,'precio_unitario',v_precio,'nombre',v_nombre,'personalizacion',v_grabado));
  v_total:=v_total+v_qty*v_precio;
 end loop;
 if v_estado='por_grabar' and not exists(select 1 from jsonb_array_elements(v_items) x where x->>'personalizacion'<>'') then raise exception 'Indica el grabado solicitado'; end if;
 v_nombre:=coalesce(nullif((select nombre from public.perfil where id=p_usuario_id),''),'Vendedor '||p_usuario_id::text);
 for r in select (x->>'producto_id')::bigint producto_id,sum((x->>'cantidad')::integer)::integer cantidad from jsonb_array_elements(v_items)x group by 1 order by 1 loop
  select stock into v_stock from public.producto_simple where id_producto=r.producto_id for update;
  if v_stock<r.cantidad then raise exception 'Stock insuficiente para registrar esta venta'; end if;
  v_reservado:=private.inventario_reservado(r.producto_id);
  update public.producto_simple set stock=stock-r.cantidad where id_producto=r.producto_id;
  update private.inventario_ficha set actualizado_en=now() where producto_id=r.producto_id;
  insert into private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,cantidad_declarada,disponible_anterior,disponible_nuevo,reservado,motivo)
   values(gen_random_uuid(),r.producto_id,p_usuario_id,v_nombre,'egreso',r.cantidad,v_stock,v_stock-r.cantidad,v_reservado,
    case when v_estado='entregada' then 'Venta entregada ' else 'Reserva de venta ' end||v_operacion::text);
 end loop;
 insert into private.venta_manual(operacion_id,vendedor_id,vendedor_nombre,cliente,telefono,estado,metodo_pago,total,notas,solicitud,entregada_en)
  values(v_operacion,p_usuario_id,v_nombre,trim(p_datos->>'cliente'),coalesce(p_datos->>'telefono',''),v_estado,p_datos->>'metodo_pago',v_total,
   coalesce(p_datos->>'notas',''),p_datos,case when v_estado='entregada' then now() else null end) returning * into v;
 for item in select value from jsonb_array_elements(v_items) loop
  v_linea:=v_linea+1;
  insert into private.venta_manual_item(venta_id,linea,producto_id,nombre,cantidad,precio_unitario,personalizacion)
  values(v.id,v_linea,(item->>'producto_id')::bigint,item->>'nombre',(item->>'cantidad')::integer,(item->>'precio_unitario')::numeric,item->>'personalizacion');
 end loop;
 insert into private.venta_manual_evento(venta_id,actor_id,estado) values(v.id,p_usuario_id,v_estado);
 return jsonb_build_object('id',v.id,'estado',v.estado,'total',v.total);
end $$;
revoke all on function public.mb_ventas(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mb_ventas(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
