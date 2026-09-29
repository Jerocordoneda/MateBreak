-- Paid mate + thermo need engraving; bombilla and box do not.
-- Payment confirmation and dispatch exist only inside this rollback.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare buyer uuid; actor uuid; mate_variant bigint; thermo_variant bigint;
 box_id bigint; bombilla_id bigint; mate_id bigint; thermo_id bigint;
 token text:=md5(random()::text)||md5(random()::text); ordered jsonb;
 payment_id uuid; job record; jobs jsonb; order_id uuid;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select usuario_id into actor from private.equipo_inventario where activo order by creado_en limit 1;
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 select producto_id into bombilla_id from private.inventario_ficha where sku='MB-BOM-PICO-LORO';
 select producto_id into mate_id from private.inventario_ficha where sku='MB-IMP-CAL';
 select producto_id into thermo_id from private.inventario_ficha where sku='MB-TER-PLA';
 select cv.id into mate_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='IMPERIAL PREMIUM DE RIVER'
   and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA'
   and cv.opciones->>'Agregar BOMBILLA DE ACERO'='SI';
 select cv.id into thermo_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id where p.nombre='TERMO DE BELGRANO';
 if buyer is null or actor is null or mate_variant is null or thermo_variant is null
 then raise exception 'Faltan fixtures de grabado'; end if;
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object(
  'variante_id',mate_variant,'cantidad',2,'personalizacion','Diseño de mate auditado'));
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object(
  'variante_id',thermo_variant,'cantidad',1,'personalizacion','Diseño de termo auditado'));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
  'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 order_id:=(ordered->>'id')::uuid;
 if (select count(*) from public.pedido_preparacion where pedido_id=order_id)<>2
  or not exists(select 1 from public.pedido_preparacion
      where pedido_id=order_id and producto_simple_id=mate_id and cantidad=2 and estado='pendiente_pago')
  or not exists(select 1 from public.pedido_preparacion
      where pedido_id=order_id and producto_simple_id=thermo_id and cantidad=1 and estado='pendiente_pago')
  or exists(select 1 from public.pedido_preparacion
      where pedido_id=order_id and producto_simple_id in (box_id,bombilla_id))
 then raise exception 'Trabajos de mate/termo, bombilla o caja incorrectos'; end if;
 select id into payment_id from public.pago where pedido_id=order_id;
 perform public.mb_confirmar_pago(payment_id,'AUDITORIA-'||order_id::text,
  (ordered->>'total')::numeric,'ARS');
 if (select count(*) from public.pedido_preparacion
     where pedido_id=order_id and estado='pendiente_preparar')<>2
 then raise exception 'Pago no habilitó ambos grabados'; end if;
 jobs:=public.mb_preparacion(actor,'listar');
 if not exists(select 1 from jsonb_array_elements(jobs->'items') x
   where x->>'pedido_id'=order_id::text and x->>'sku'='MB-IMP-CAL'
    and x->>'personalizacion'='Diseño de mate auditado'
    and (x->>'cantidad')::integer=2)
  or not exists(select 1 from jsonb_array_elements(jobs->'items') x
   where x->>'pedido_id'=order_id::text and x->>'sku'='MB-TER-PLA'
    and x->>'personalizacion'='Diseño de termo auditado')
 then raise exception 'Panel de preparación perdió SKU, pedido o diseño'; end if;
 perform public.mb_actualizar_envio(order_id,'preparando');
 begin
  perform public.mb_actualizar_envio(order_id,'enviado');
  raise exception 'Despacho sin grabar aceptado';
 exception when raise_exception then if sqlerrm<>'Pedido con grabados pendientes' then raise; end if; end;
 for job in select id from public.pedido_preparacion where pedido_id=order_id loop
  perform public.mb_preparacion(actor,'avanzar',jsonb_build_object(
   'id',job.id,'estado','enviado_grabar','nota','Auditoría de envío a grabar'));
  perform public.mb_preparacion(actor,'avanzar',jsonb_build_object(
   'id',job.id,'estado','grabado_recibido','nota','Auditoría de recepción'));
  perform public.mb_preparacion(actor,'avanzar',jsonb_build_object(
   'id',job.id,'estado','listo_despachar','nota','Auditoría de control'));
 end loop;
 if (select count(*) from private.preparacion_evento e
   join public.pedido_preparacion j on j.id=e.preparacion_id
   where j.pedido_id=order_id and e.actor_id=actor)<>6
 then raise exception 'Transiciones de grabado sin auditoría'; end if;
 perform public.mb_actualizar_envio(order_id,'enviado');
 if (select count(*) from public.pedido_preparacion
   where pedido_id=order_id and estado='despachado')<>2
 then raise exception 'Pedido listo no pasó a despachado'; end if;
end $$;
rollback;
