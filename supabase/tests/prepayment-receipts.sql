-- Two historical ARS lots, actor/date/note and exact stock increments.
begin;
do $$
declare actor uuid; item_id bigint; before_stock integer; reserved integer;
 first_key uuid:=gen_random_uuid(); second_key uuid:=gen_random_uuid(); receipt jsonb;
begin
 select usuario_id into actor from private.equipo_inventario where activo order by creado_en limit 1;
 select producto_id into item_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 select stock into before_stock from public.producto_simple where id_producto=item_id;
 reserved:=private.inventario_reservado(item_id);
 if actor is null or item_id is null then raise exception 'Faltan actor o caja física'; end if;
 receipt:=public.mb_registrar_recepcion(actor,jsonb_build_object(
  'producto_id',item_id,'cantidad',100,'costo_unitario','10800.00',
  'fecha',current_date,'proveedor','Proveedor de prueba','motivo','Primer lote auditado',
  'idempotencia',first_key,'disponible_esperado',before_stock,'reservado_esperado',reserved));
 if receipt->>'moneda'<>'ARS'
  or (select stock from public.producto_simple where id_producto=item_id)<>before_stock+100
 then raise exception 'Primera recepción o moneda incorrecta'; end if;
 receipt:=public.mb_registrar_recepcion(actor,jsonb_build_object(
  'producto_id',item_id,'cantidad',50,'costo_unitario','12000.00',
  'fecha',current_date,'proveedor','Proveedor de prueba','motivo','Segundo lote auditado',
  'idempotencia',second_key,'disponible_esperado',before_stock+100,'reservado_esperado',reserved));
 if (select stock from public.producto_simple where id_producto=item_id)<>before_stock+150
  or (select count(*) from private.inventario_recepcion r
      where r.operacion_id in (first_key,second_key) and r.producto_id=item_id
       and r.actor_id=actor and r.fecha=current_date and r.moneda='ARS'
       and ((r.operacion_id=first_key and r.cantidad=100 and r.costo_unitario=10800
          and r.motivo='Primer lote auditado')
        or (r.operacion_id=second_key and r.cantidad=50 and r.costo_unitario=12000
          and r.motivo='Segundo lote auditado')))<>2
  or (select count(*) from private.inventario_ajuste a
      where a.operacion_id in (first_key,second_key) and a.actor_id=actor
       and a.tipo='ingreso' and a.diferencia>0)<>2
 then raise exception 'Se perdió stock, costo histórico o auditoría de recepción'; end if;
end $$;
rollback;
