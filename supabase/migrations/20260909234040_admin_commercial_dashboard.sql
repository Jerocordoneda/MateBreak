begin;

create index if not exists venta_manual_fecha_idx
  on private.venta_manual(creado_en desc);

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

  return v_resultado;
end;
$$;

revoke all on function public.mb_admin_dashboard(uuid, text) from public, anon, authenticated;
grant execute on function public.mb_admin_dashboard(uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
