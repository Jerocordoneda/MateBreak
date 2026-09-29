-- Each physically checked delivery keeps its own ARS unit cost and actor.
create table private.inventario_recepcion (
 operacion_id uuid primary key,
 ajuste_id uuid not null unique references private.inventario_ajuste(id),
 producto_id bigint not null references private.inventario_ficha(producto_id),
 cantidad integer not null check(cantidad between 1 and 1000000),
 costo_unitario numeric(14,2) not null check(costo_unitario>=0),
 moneda text not null default 'ARS' check(moneda='ARS'),
 fecha date not null,
 actor_id uuid not null references auth.users(id),
 actor_nombre text not null,
 proveedor text,
 motivo text not null check(length(trim(motivo)) between 3 and 500),
 creado_en timestamptz not null default now()
);
create index inventario_recepcion_producto_fecha_idx on private.inventario_recepcion(producto_id,fecha desc);
alter table private.inventario_recepcion enable row level security;
revoke all on private.inventario_recepcion from public,anon,authenticated;
grant select,insert on private.inventario_recepcion to service_role;

create function public.mb_registrar_recepcion(p_actor_id uuid,p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt private.inventario_recepcion; adjustment private.inventario_ajuste;
 v_product_id bigint; v_operation uuid; v_quantity integer; v_cost numeric(14,2);
 v_date date; v_provider text; v_reason text; v_before integer; v_reserved integer; v_allocated integer;
begin
 if not public.mb_inventario_autorizado(p_actor_id) then
  raise exception using errcode='42501',message='Acceso exclusivo del equipo de inventario'; end if;
 v_operation:=(p_datos->>'idempotencia')::uuid;
 v_product_id:=(p_datos->>'producto_id')::bigint;
 v_quantity:=(p_datos->>'cantidad')::integer;
 v_cost:=(p_datos->>'costo_unitario')::numeric(14,2);
 v_date:=(p_datos->>'fecha')::date;
 v_provider:=nullif(trim(coalesce(p_datos->>'proveedor','')),'');
 v_reason:=trim(coalesce(p_datos->>'motivo',''));
 if v_operation is null or v_product_id is null or v_quantity is null or v_quantity not between 1 and 1000000
  or v_cost is null or v_cost<0 or v_date is null or v_date>current_date or v_date<date '2000-01-01'
  or length(v_reason) not between 3 and 500 or length(coalesce(v_provider,''))>150
  then raise exception 'Recepcion invalida'; end if;
 perform pg_advisory_xact_lock(782204,1);
 select * into receipt from private.inventario_recepcion where operacion_id=v_operation;
 if found then
  if receipt.actor_id<>p_actor_id or receipt.producto_id<>v_product_id or receipt.cantidad<>v_quantity
   or receipt.costo_unitario<>v_cost or receipt.fecha<>v_date or receipt.proveedor is distinct from v_provider
   or receipt.motivo<>v_reason then raise exception 'Esta recepcion ya se uso con otros datos'; end if;
  return to_jsonb(receipt);
 end if;
 perform 1 from private.inventario_ficha where producto_id=v_product_id for update;
 if not found then raise exception 'Articulo no encontrado'; end if;
 select stock into v_before from public.producto_simple where id_producto=v_product_id for update;
 if v_before is null then raise exception 'Primero confirma el stock fisico del articulo'; end if;
 v_reserved:=private.inventario_reservado(v_product_id);
 if v_before is distinct from (p_datos->>'disponible_esperado')::integer
  or v_reserved is distinct from (p_datos->>'reservado_esperado')::integer
  then raise exception 'El stock cambio. Actualiza el inventario antes de guardar'; end if;
 update public.producto_simple set stock=stock+v_quantity where id_producto=v_product_id;
 update private.inventario_ficha set actualizado_en=clock_timestamp() where producto_id=v_product_id;
 insert into private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,cantidad_declarada,
  disponible_anterior,disponible_nuevo,reservado,motivo)
 values(v_operation,v_product_id,p_actor_id,
  coalesce(nullif((select nombre from public.perfil where id=p_actor_id),''),p_actor_id::text),
  'ingreso',v_quantity,v_before,v_before+v_quantity,v_reserved,v_reason) returning * into adjustment;
 insert into private.inventario_recepcion(operacion_id,ajuste_id,producto_id,cantidad,costo_unitario,fecha,
  actor_id,actor_nombre,proveedor,motivo)
 values(v_operation,adjustment.id,v_product_id,v_quantity,v_cost,v_date,p_actor_id,adjustment.actor_nombre,v_provider,v_reason)
 returning * into receipt;
 v_allocated:=public.mb_asignar_abastecimiento(v_product_id,null);
 return to_jsonb(receipt)||jsonb_build_object('asignado_a_pedidos',v_allocated);
end $$;
revoke all on function public.mb_registrar_recepcion(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mb_registrar_recepcion(uuid,jsonb) to service_role;

create function public.mb_listar_recepciones(p_actor_id uuid,p_producto_id bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.mb_inventario_autorizado(p_actor_id) then
  raise exception using errcode='42501',message='Acceso exclusivo del equipo de inventario'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc,x.creado_en desc) from (
  select r.operacion_id,r.producto_id,f.sku,p.nombre,r.cantidad,r.costo_unitario,r.moneda,
   r.fecha,r.actor_nombre,r.proveedor,r.motivo,r.creado_en
  from private.inventario_recepcion r join private.inventario_ficha f on f.producto_id=r.producto_id
   join public.producto p on p.id_producto=r.producto_id
  where p_producto_id is null or r.producto_id=p_producto_id
  order by r.fecha desc,r.creado_en desc limit 200
 )x),'[]');
end $$;
revoke all on function public.mb_listar_recepciones(uuid,bigint) from public,anon,authenticated;
grant execute on function public.mb_listar_recepciones(uuid,bigint) to service_role;

create function public.mb_preparacion(p_actor_id uuid,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.pedido_preparacion; order_state text; old_state text; next_state text; note text; result jsonb;
begin
 if not public.mb_inventario_autorizado(p_actor_id) then
  raise exception using errcode='42501',message='Acceso exclusivo del equipo de inventario'; end if;
 if p_accion='listar' then
  select jsonb_build_object(
   'resumen',coalesce((select jsonb_agg(to_jsonb(x) order by x.sku) from (
    select f.sku,p.nombre,sum(j.cantidad)::integer cantidad
    from public.pedido_preparacion j join private.inventario_ficha f on f.producto_id=j.producto_simple_id
    join public.producto p on p.id_producto=j.producto_simple_id
    where j.estado in ('pendiente_preparar','enviado_grabar') group by f.sku,p.nombre
   )x),'[]'),
   'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en,x.id) from (
    select j.id,j.pedido_id,j.producto_simple_id,j.cantidad,j.estado,j.actualizado_en,
     f.sku,p.nombre base_fisica,pi.nombre producto_vendido,pi.opciones,pi.personalizacion,
     o.creado_en,coalesce(d.cantidad_pendiente,0) pendiente_abastecimiento
    from public.pedido_preparacion j join public.pedido_item pi on pi.id=j.pedido_item_id
    join public.pedido o on o.id=j.pedido_id join private.inventario_ficha f on f.producto_id=j.producto_simple_id
    join public.producto p on p.id_producto=j.producto_simple_id
    left join public.pedido_abastecimiento d on d.pedido_id=j.pedido_id and d.producto_simple_id=j.producto_simple_id
    where j.estado not in ('pendiente_pago','entregado','cancelado')
    order by o.creado_en desc limit 200
   )x),'[]')) into result;
  return result;
 end if;
 if p_accion<>'avanzar' then raise exception 'Accion de preparacion invalida'; end if;
 perform pg_advisory_xact_lock(782204,1);
 select * into job from public.pedido_preparacion where id=(p_datos->>'id')::uuid for update;
 if not found then raise exception 'Preparacion inexistente'; end if;
 select estado into order_state from public.pedido where id=job.pedido_id for share;
 if order_state not in ('pagado','en_preparacion') then raise exception 'Pedido no pagado o ya despachado'; end if;
 next_state:=p_datos->>'estado'; note:=trim(coalesce(p_datos->>'nota',''));
 if length(note)>500 or not ((job.estado='pendiente_preparar' and next_state='enviado_grabar')
  or (job.estado='enviado_grabar' and next_state='grabado_recibido')
  or (job.estado='grabado_recibido' and next_state='listo_despachar'))
  then raise exception 'Transicion de grabado invalida'; end if;
 if job.estado='pendiente_preparar' and exists(select 1 from public.pedido_abastecimiento d
  where d.pedido_id=job.pedido_id and d.producto_simple_id=job.producto_simple_id and d.cantidad_pendiente>0)
  then raise exception 'Falta recibir la pieza fisica'; end if;
 old_state:=job.estado;
 update public.pedido_preparacion set estado=next_state,actualizado_en=now() where id=job.id returning * into job;
 insert into private.preparacion_evento(preparacion_id,actor_id,estado_anterior,estado_nuevo,nota)
 values(job.id,p_actor_id,old_state,next_state,note);
 return to_jsonb(job);
end $$;
revoke all on function public.mb_preparacion(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mb_preparacion(uuid,text,jsonb) to service_role;
