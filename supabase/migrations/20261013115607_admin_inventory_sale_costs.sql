-- Additive costs only: stock, payments and role operations retain their rules.
-- No invented historical costs: existing sale lines deliberately remain NULL.
begin;
alter table private.inventario_ficha add column costo_unitario numeric(14,2) check(costo_unitario>=0);
alter table private.venta_manual_item add column costo_unitario numeric(14,2) check(costo_unitario>=0);
grant update(costo_unitario) on private.inventario_ficha to service_role;
-- Reuse real reception costs already entered by the team. Historical sales
-- remain unknown: today's purchase cost is not an invented historical cost.
update private.inventario_ficha f set costo_unitario=r.costo_unitario
from(select distinct on(producto_id)producto_id,costo_unitario from private.inventario_recepcion order by producto_id,fecha desc,creado_en desc,operacion_id desc)r
where f.producto_id=r.producto_id;
create function private.mb_reception_current_cost() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update private.inventario_ficha f set costo_unitario=(select r.costo_unitario from private.inventario_recepcion r where r.producto_id=new.producto_id order by r.fecha desc,r.creado_en desc,r.operacion_id desc limit 1)where f.producto_id=new.producto_id;
 return new;
end $$;
revoke all on function private.mb_reception_current_cost() from public,anon,authenticated;
grant execute on function private.mb_reception_current_cost() to service_role;
create trigger reception_current_cost after insert on private.inventario_recepcion for each row execute function private.mb_reception_current_cost();
create table private.inventario_costo_evento (
 operacion_id uuid primary key, producto_id bigint not null references private.inventario_ficha(producto_id),
 actor_id uuid not null references auth.users(id), anterior numeric(14,2), costo_unitario numeric(14,2) not null check(costo_unitario>=0),
 motivo text not null check(length(trim(motivo)) between 3 and 500), creado_en timestamptz not null default now()
);
alter table private.inventario_costo_evento enable row level security;
revoke all on private.inventario_costo_evento from public,anon,authenticated;
grant select,insert on private.inventario_costo_evento to service_role;
create function private.mb_guardar_costo(p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_event private.inventario_costo_evento; v_id bigint; v_cost numeric; v_before numeric; v_key uuid; v_reason text;
begin
 if p_actor is null or not public.mb_inventario_autorizado(p_actor) then raise exception 'Acceso exclusivo del equipo de inventario' using errcode='42501';end if;
 v_id:=(p_data->>'producto_id')::bigint;v_cost:=(p_data->>'costo_unitario')::numeric;v_key:=(p_data->>'idempotencia')::uuid;v_reason:=trim(p_data->>'motivo');
 if v_key is null or v_cost is null or v_cost<0 or v_cost>999999999 or v_cost<>round(v_cost,2) or v_reason is null or length(v_reason) not between 3 and 500 then raise exception 'Costo o motivo invalido';end if;
 perform pg_advisory_xact_lock(782204,1);
 select * into v_event from private.inventario_costo_evento where operacion_id=v_key;
 if found then
  if v_event.actor_id<>p_actor or v_event.producto_id<>v_id or v_event.costo_unitario<>v_cost or v_event.motivo<>v_reason then raise exception 'Identificador de costo ya utilizado';end if;
  return to_jsonb(v_event);
 end if;
 select costo_unitario into v_before from private.inventario_ficha where producto_id=v_id for update;
 if not found then raise exception 'Producto no encontrado';end if;
 if v_before is distinct from (p_data->>'costo_esperado')::numeric then raise exception 'El costo cambio. Actualiza el inventario antes de guardar';end if;
 update private.inventario_ficha set costo_unitario=v_cost where producto_id=v_id;
 insert into private.inventario_costo_evento(operacion_id,producto_id,actor_id,anterior,costo_unitario,motivo)
 values(v_key,v_id,p_actor,v_before,v_cost,v_reason) returning * into v_event;
 return to_jsonb(v_event);
end $$;
revoke all on function private.mb_guardar_costo(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.mb_guardar_costo(uuid,jsonb) to service_role;
create function private.mb_snapshot_sale_cost() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- mb_ventas holds the shared stock/cost lock before inserting sale lines.
 select costo_unitario into new.costo_unitario from private.inventario_ficha where producto_id=new.producto_id;
 return new;
end $$;
revoke all on function private.mb_snapshot_sale_cost() from public,anon,authenticated;
grant execute on function private.mb_snapshot_sale_cost() to service_role;
create trigger snapshot_sale_cost before insert on private.venta_manual_item for each row execute function private.mb_snapshot_sale_cost();
create or replace function public.mb_inventario(p_usuario_id uuid,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 f private.inventario_ficha; a private.inventario_ajuste;
 v_stock integer; v_reservado integer; v_nuevo integer; v_cantidad integer;
 v_id bigint; v_operacion uuid; v_tipo text; v_motivo text; v_result jsonb;
begin
 if not public.mb_inventario_autorizado(p_usuario_id) then
  raise exception using errcode='42501',message='Acceso exclusivo del equipo de inventario';
 end if;
 if p_accion='costo' then
  return private.mb_guardar_costo(p_usuario_id,p_datos);
 end if;
 if p_accion='listar' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nombre),'[]') into v_result from (
   select fi.producto_id::text id,fi.sku,p.nombre,s.material,s.categoria,s.diseno,
    s.stock disponible,private.inventario_reservado(fi.producto_id) reservado,
    s.stock+private.inventario_reservado(fi.producto_id) fisico,
    fi.abastecimiento,fi.aproximado,fi.minimo,fi.notas,fi.actualizado_en,
    p.activo publicado,p.precio,fi.costo_unitario
   from private.inventario_ficha fi join public.producto_simple s on s.id_producto=fi.producto_id
   join public.producto p on p.id_producto=fi.producto_id
  )x;
  return v_result;
 end if;
 if p_accion='historial' then
  v_id:=nullif(p_datos->>'producto_id','')::bigint;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
   select h.*,p.nombre from (
    select hist.id,hist.producto_id,hist.tipo,hist.diferencia,hist.disponible_anterior,hist.disponible_nuevo,hist.reservado,hist.motivo,hist.actor_nombre,hist.creado_en,null::uuid pedido_id
    from private.inventario_ajuste hist where v_id is null or hist.producto_id=v_id
    union all
    select m.id,m.producto_simple_id,m.motivo,m.cantidad,null::integer,null::integer,null::integer,
     case m.motivo when 'reserva' then 'Reserva de pedido' else 'Cancelacion o vencimiento de pedido' end,
     'Sistema de pedidos',m.creado_en,m.pedido_id
    from public.movimiento_stock m where v_id is null or m.producto_simple_id=v_id
   )h join public.producto p on p.id_producto=h.producto_id order by h.creado_en desc limit 200
  )x),'[]');
 end if;
 if p_accion not in ('ajustar','configurar') then raise exception 'Operacion de inventario invalida'; end if;
 -- Same first lock as checkout/cancellation/shipment: a physical recount must
 -- not race an order reservation or a shipment leaving the warehouse.
 perform pg_advisory_xact_lock(782204, 1);
 v_id:=(p_datos->>'producto_id')::bigint;
 select * into f from private.inventario_ficha where producto_id=v_id for update;
 if not found then raise exception 'Articulo no encontrado'; end if;
 if p_accion='configurar' then
  if p_datos->>'abastecimiento' not in ('stock','a_pedido') or
   (p_datos->>'minimo')::integer not between 0 and 1000000 or p_datos->>'notas' is null then raise exception 'Configuracion invalida'; end if;
  update private.inventario_ficha set abastecimiento=p_datos->>'abastecimiento',minimo=(p_datos->>'minimo')::integer,
   notas=p_datos->>'notas',actualizado_en=clock_timestamp() where producto_id=v_id returning * into f;
  return to_jsonb(f);
 end if;
 v_tipo:=p_datos->>'tipo'; v_cantidad:=(p_datos->>'cantidad')::integer;
 v_operacion:=(p_datos->>'idempotencia')::uuid; v_motivo:=trim(p_datos->>'motivo');
 if v_operacion is null or v_tipo is null or v_tipo not in ('ingreso','egreso','conteo') or v_cantidad is null or
  v_cantidad not between 0 and 1000000 or (v_tipo<>'conteo' and v_cantidad=0) or
  v_motivo is null or length(v_motivo) not between 3 and 500 then raise exception 'Indica cantidad, tipo y motivo validos'; end if;
 select * into a from private.inventario_ajuste where operacion_id=v_operacion;
 if found then
  if a.actor_id is distinct from p_usuario_id or a.producto_id<>v_id or a.tipo<>v_tipo or
   a.cantidad_declarada<>v_cantidad or a.motivo<>v_motivo then raise exception 'Esta operacion ya se uso para otro ajuste'; end if;
  return to_jsonb(a);
 end if;
 select stock into v_stock from public.producto_simple where id_producto=v_id for update;
 v_reservado:=private.inventario_reservado(v_id);
 if v_stock is distinct from (p_datos->>'disponible_esperado')::integer or
  v_reservado is distinct from (p_datos->>'reservado_esperado')::integer then
  raise exception 'El stock cambio. Actualiza el inventario antes de guardar';
 end if;
 v_nuevo:=case v_tipo when 'ingreso' then v_stock+v_cantidad when 'egreso' then v_stock-v_cantidad else v_cantidad-v_reservado end;
 if v_nuevo<0 then raise exception 'No podes descontar las unidades reservadas para pedidos'; end if;
 update public.producto_simple set stock=v_nuevo where id_producto=v_id;
 update private.inventario_ficha set aproximado=case when v_tipo='conteo' then false else aproximado end,
  actualizado_en=clock_timestamp() where producto_id=v_id;
 insert into private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,cantidad_declarada,
  disponible_anterior,disponible_nuevo,reservado,motivo)
 values(v_operacion,v_id,p_usuario_id,coalesce(nullif((select nombre from public.perfil where id=p_usuario_id),''),p_usuario_id::text),
  v_tipo,v_cantidad,v_stock,v_nuevo,v_reservado,v_motivo) returning * into a;
 return to_jsonb(a);
end $$;

create or replace function public.mb_admin_dashboard(
  p_actor_id uuid,
  p_periodo text default 'mes'
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde timestamptz;
  v_resultado jsonb;
begin
  if p_actor_id is null or not public.mb_inventario_autorizado(p_actor_id) then
    raise exception using errcode = '42501', message = 'Esta operacion requiere una cuenta administradora';
  end if;

  v_desde := case p_periodo
    when 'mes' then date_trunc('month', now())
    when '30_dias' then now() - interval '30 days'
    when '90_dias' then now() - interval '90 days'
    when 'todo' then null
    else null
  end;
  if p_periodo not in ('mes', '30_dias', '90_dias', 'todo') then
    raise exception 'Periodo invalido';
  end if;

  with historial as (
    select
      v.*,
      case
        when regexp_replace(v.telefono, '[^0-9]', '', 'g') <> ''
          then 't:' || regexp_replace(v.telefono, '[^0-9]', '', 'g')
        else 'n:' || lower(regexp_replace(trim(v.cliente), '[[:space:]]+', ' ', 'g'))
      end as cliente_clave
    from private.venta_manual v
  ), clientes_historial as (
    select cliente_clave, min(creado_en) primera_compra, count(*) compras_historicas
    from historial
    group by cliente_clave
  ), ventas_periodo as (
    select h.*, ch.primera_compra, ch.compras_historicas
    from historial h
    join clientes_historial ch using (cliente_clave)
    where v_desde is null or h.creado_en >= v_desde
  ), totales as (
    select
      count(*)::integer ventas,
      coalesce(sum(total), 0) facturacion_registrada,
      coalesce(sum(total) filter (where estado = 'entregada'), 0) facturacion_entregada,
      coalesce(sum(total) filter (where estado <> 'entregada'), 0) monto_pendiente,
      count(*) filter (where estado = 'por_grabar')::integer por_grabar,
      count(*) filter (where estado = 'por_entregar')::integer por_entregar,
      count(*) filter (where estado = 'entregada')::integer entregadas,
      count(distinct cliente_clave)::integer clientes,
      count(distinct cliente_clave) filter (where v_desde is null or primera_compra >= v_desde)::integer clientes_nuevos,
      count(distinct cliente_clave) filter (where v_desde is not null and primera_compra < v_desde)::integer clientes_anteriores,
      count(distinct cliente_clave) filter (where compras_historicas > 1)::integer clientes_recurrentes
    from ventas_periodo
  ), unidades as (
    select coalesce(sum(i.cantidad), 0)::integer unidades
    from ventas_periodo v
    join private.venta_manual_item i on i.venta_id = v.id
  ), vendedores as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.facturacion_entregada desc, x.total_registrado desc), '[]'::jsonb) valor
    from (
      select
        v.vendedor_id id,
        max(v.vendedor_nombre) nombre,
        count(*)::integer ventas,
        coalesce(sum(v.total), 0) total_registrado,
        coalesce(sum(v.total) filter (where v.estado = 'entregada'), 0) facturacion_entregada,
        count(*) filter (where v.estado <> 'entregada')::integer pendientes,
        count(distinct v.cliente_clave)::integer clientes,
        coalesce((select sum(i.cantidad)::integer from private.venta_manual_item i where i.venta_id = any(array_agg(v.id))), 0) unidades
      from ventas_periodo v
      group by v.vendedor_id
    ) x
  ), clientes as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.total_registrado desc, x.ultima_compra desc), '[]'::jsonb) valor
    from (
      select
        cliente_clave id,
        (array_agg(cliente order by creado_en desc))[1] nombre,
        (array_agg(telefono order by creado_en desc))[1] telefono,
        count(*)::integer ventas_periodo,
        max(compras_historicas)::integer compras_historicas,
        sum(total) total_registrado,
        coalesce(sum(total) filter (where estado = 'entregada'), 0) facturacion_entregada,
        min(primera_compra) primera_compra,
        max(creado_en) ultima_compra,
        bool_or(v_desde is null or primera_compra >= v_desde) es_nuevo
      from ventas_periodo
      group by cliente_clave
      order by sum(total) desc, max(creado_en) desc
      limit 20
    ) x
  ), recientes as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_en desc), '[]'::jsonb) valor
    from (
      select
        v.id, v.vendedor_nombre, v.cliente, v.telefono, v.estado, v.metodo_pago,
        v.total, v.moneda, v.creado_en, v.actualizado_en, v.entregada_en,
        coalesce((select sum(i.cantidad)::integer from private.venta_manual_item i where i.venta_id = v.id), 0) unidades
      from ventas_periodo v
      order by v.creado_en desc
      limit 12
    ) x
  ), serie as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha), '[]'::jsonb) valor
    from (
      select
        case when p_periodo = 'todo' then date_trunc('month', creado_en)::date else creado_en::date end fecha,
        count(*)::integer ventas,
        sum(total) total_registrado,
        coalesce(sum(total) filter (where estado = 'entregada'), 0) facturacion_entregada
      from ventas_periodo
      group by 1
      order by 1
    ) x
  )
  select jsonb_build_object(
    'periodo', p_periodo,
    'desde', v_desde,
    'hasta', now(),
    'totales', jsonb_build_object(
      'ventas', t.ventas,
      'facturacion_registrada', t.facturacion_registrada,
      'facturacion_entregada', t.facturacion_entregada,
      'monto_pendiente', t.monto_pendiente,
      'ticket_promedio_entregado', case when t.entregadas = 0 then 0 else round(t.facturacion_entregada / t.entregadas, 2) end,
      'por_grabar', t.por_grabar,
      'por_entregar', t.por_entregar,
      'entregadas', t.entregadas,
      'clientes', t.clientes,
      'clientes_nuevos', t.clientes_nuevos,
      'clientes_anteriores', t.clientes_anteriores,
      'clientes_recurrentes', t.clientes_recurrentes,
      'unidades', u.unidades
    ),
    'vendedores', ve.valor,
    'clientes', c.valor,
    'recientes', r.valor,
    'serie', s.valor
  ) into v_resultado
  from totales t cross join unidades u cross join vendedores ve cross join clientes c cross join recientes r cross join serie s;

  select v_resultado || jsonb_build_object('costos',jsonb_build_object(
    'unidades_sin_costo',coalesce(sum(i.cantidad) filter(where i.costo_unitario is null),0),
    'costo_productos',coalesce(sum(i.cantidad*i.costo_unitario),0),
    'facturacion_neta',case when count(*) filter(where i.costo_unitario is null)>0 then null
      else (v_resultado->'totales'->>'facturacion_registrada')::numeric-coalesce(sum(i.cantidad*i.costo_unitario),0) end))
  into v_resultado
  from private.venta_manual v join private.venta_manual_item i on i.venta_id=v.id
  where v_desde is null or v.creado_en>=v_desde;
  return v_resultado;
end;
$$;


revoke all on function public.mb_inventario(uuid,text,jsonb),public.mb_admin_dashboard(uuid,text) from public,anon,authenticated;
grant execute on function public.mb_inventario(uuid,text,jsonb),public.mb_admin_dashboard(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
