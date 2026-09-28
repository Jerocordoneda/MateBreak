-- Distinct table aliases avoid PL/pgSQL row-variable ambiguity.
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
 if p_accion='listar' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nombre),'[]') into v_result from (
   select fi.producto_id::text id,fi.sku,p.nombre,s.material,s.categoria,s.diseno,
    s.stock disponible,private.inventario_reservado(fi.producto_id) reservado,
    s.stock+private.inventario_reservado(fi.producto_id) fisico,
    fi.abastecimiento,fi.aproximado,fi.minimo,fi.notas,fi.actualizado_en,
    p.activo publicado,p.precio
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
