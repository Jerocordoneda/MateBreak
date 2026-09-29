-- SQL Editor: la transacción revierte SKU recibidos, pedidos y cambios de stock.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare actor uuid; buyer uuid; bomb_id bigint; board_id bigint; knife_id bigint;
 mate_id bigint; black_id bigint; silver_id bigint; variant_id bigint; combo_id bigint;
 token text; cart jsonb; ordered jsonb; payment_id uuid; job record; receipt jsonb; receipt_key uuid;
 before_bomb integer; before_mate integer; before_black integer; before_silver integer;
begin
 select usuario_id into actor from private.equipo_inventario where activo order by creado_en limit 1;
 select id into buyer from auth.users order by created_at limit 1;
 if actor is null or buyer is null then raise exception 'Faltan usuarios de prueba'; end if;
 select producto_id into bomb_id from private.inventario_ficha where sku='MB-BOM-PICO-LORO';
 select producto_id into board_id from private.inventario_ficha where sku='MB-TABLA';
 select producto_id into knife_id from private.inventario_ficha where sku='MB-CUC-INOX';
 select producto_id into mate_id from private.inventario_ficha where sku='MB-IMP-ALG';
 select producto_id into black_id from private.inventario_ficha where sku='MB-TER-NEG';
 select producto_id into silver_id from private.inventario_ficha where sku='MB-TER-PLA';
 select stock into before_bomb from public.producto_simple where id_producto=bomb_id;
 select stock into before_mate from public.producto_simple where id_producto=mate_id;
 select stock into before_black from public.producto_simple where id_producto=black_id;
 select stock into before_silver from public.producto_simple where id_producto=silver_id;

 -- Two independently priced receipts, without overwriting the first lot.
 receipt_key:=gen_random_uuid();
 receipt:=public.mb_registrar_recepcion(actor,jsonb_build_object('producto_id',bomb_id,'cantidad',5,
  'costo_unitario','5200.00','fecha',current_date,'proveedor','Proveedor de prueba','motivo','Bombillas recibidas y controladas',
  'idempotencia',receipt_key,'disponible_esperado',before_bomb,'reservado_esperado',0));
 if receipt->>'moneda'<>'ARS' then raise exception 'Recepción sin ARS'; end if;
 if (public.mb_registrar_recepcion(actor,jsonb_build_object('producto_id',bomb_id,'cantidad',5,
  'costo_unitario','5200.00','fecha',current_date,'proveedor','Proveedor de prueba','motivo','Bombillas recibidas y controladas',
  'idempotencia',receipt_key,'disponible_esperado',before_bomb,'reservado_esperado',0))->>'operacion_id')<>receipt_key::text
  or (select stock from public.producto_simple where id_producto=bomb_id)<>before_bomb+5 then
  raise exception 'Reintento de recepción no idempotente'; end if;
 receipt:=public.mb_registrar_recepcion(actor,jsonb_build_object('producto_id',bomb_id,'cantidad',4,
  'costo_unitario','6000.00','fecha',current_date,'proveedor','Proveedor de prueba','motivo','Segundo lote de bombillas',
  'idempotencia',gen_random_uuid(),'disponible_esperado',before_bomb+5,'reservado_esperado',0));
 if (select count(distinct costo_unitario) from private.inventario_recepcion where producto_id=bomb_id)<>2
  or (select stock from public.producto_simple where id_producto=bomb_id)<>before_bomb+9 then
  raise exception 'Ingreso o historia de costos incorrectos'; end if;

 -- Optional bombilla and base mate consume their own, shared physical SKUs.
 select cv.id into variant_id from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
 where p.nombre='IMPERIAL DE ALGARROBO' and cv.opciones->>'Agregar BOMBILLA PICO LORO ACERO'='SI';
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant_id,'cantidad',1));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select count(*) from public.pedido_stock where pedido_id=(ordered->>'id')::uuid)<>2
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=bomb_id)<>1
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=mate_id)<>1 then
  raise exception 'Bombilla opcional o base física mal reservada'; end if;

 -- Different designs and the same base option consume one physical SKU.
 token:=md5(random()::text)||md5(random()::text);
 select cv.id into variant_id from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='IMPERIAL PREMIUM DE BOCA' and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE ALGARROBO'
   and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO';
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant_id,'cantidad',1));
 select cv.id into variant_id from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='IMPERIAL PREMIUM DE RIVER' and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE ALGARROBO'
   and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO';
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant_id,'cantidad',1));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select count(*) from public.pedido_item where pedido_id=(ordered->>'id')::uuid)<>2
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=mate_id)<>2 then
  raise exception 'Los diseños no comparten el mismo SKU físico'; end if;

 -- Different thermo colours must never collapse onto one SKU.
 token:=md5(random()::text)||md5(random()::text);
 select cv.id into variant_id from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='TERMO PREMIUM NEGRO 1L';
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant_id,'cantidad',1));
 select cv.id into variant_id from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='TERMO MEDIA MANIJA PLATEADO';
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant_id,'cantidad',1));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=black_id)<>1
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=silver_id)<>1
  or (select stock from public.producto_simple where id_producto=black_id)<>before_black-1
  or (select stock from public.producto_simple where id_producto=silver_id)<>before_silver-1 then
  raise exception 'Colores de termo comparten stock indebidamente'; end if;

 -- Parrillero: knife reserved, zero-stock board becomes an explicit demand.
 select cv.id into combo_id from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='SET PARRILLERO DE BELGRANO';
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',combo_id,'cantidad',2));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=knife_id)<>2
  or (select cantidad_pendiente from public.pedido_abastecimiento where pedido_id=(ordered->>'id')::uuid and producto_simple_id=board_id)<>2
  or (select stock from public.producto_simple where id_producto=board_id)<>0 then
  raise exception 'Combo a pedido fabricó stock o perdió componentes'; end if;
 if (select count(*) from public.pedido_preparacion where pedido_id=(ordered->>'id')::uuid)<>2 then
  raise exception 'Faltan trabajos de grabado del combo'; end if;
 select id into payment_id from public.pago where pedido_id=(ordered->>'id')::uuid;
 perform public.mb_confirmar_pago(payment_id,'PRUEBA-OPERACION-FISICA',(ordered->>'total')::numeric,'ARS');
 if (select count(*) from public.pedido_preparacion where pedido_id=(ordered->>'id')::uuid and estado='pendiente_preparar')<>2
  then raise exception 'Pago no habilitó preparación'; end if;
 begin
  perform public.mb_preparacion(actor,'avanzar',jsonb_build_object('id',
   (select id from public.pedido_preparacion where pedido_id=(ordered->>'id')::uuid and producto_simple_id=board_id),
   'estado','enviado_grabar','nota',''));
  raise exception 'Se grabó una pieza aún no recibida';
 exception when raise_exception then if sqlerrm<>'Falta recibir la pieza fisica' then raise; end if; end;
 receipt:=public.mb_registrar_recepcion(actor,jsonb_build_object('producto_id',board_id,'cantidad',1,
  'costo_unitario','10800.00','fecha',current_date,'proveedor','Carpintero de prueba','motivo','Tabla recibida y controlada',
  'idempotencia',gen_random_uuid(),'disponible_esperado',0,'reservado_esperado',0));
 if (select cantidad_pendiente from public.pedido_abastecimiento where pedido_id=(ordered->>'id')::uuid and producto_simple_id=board_id)<>1
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=board_id)<>1
  or (select stock from public.producto_simple where id_producto=board_id)<>0 then
  raise exception 'La primera recepción no asignó parcialmente la tabla'; end if;
 receipt:=public.mb_registrar_recepcion(actor,jsonb_build_object('producto_id',board_id,'cantidad',1,
  'costo_unitario','12000.00','fecha',current_date,'proveedor','Carpintero de prueba','motivo','Segunda tabla recibida',
  'idempotencia',gen_random_uuid(),'disponible_esperado',0,'reservado_esperado',1));
 if (select cantidad_pendiente from public.pedido_abastecimiento where pedido_id=(ordered->>'id')::uuid and producto_simple_id=board_id)<>0
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=board_id)<>2
  or (select count(*) from public.movimiento_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=board_id and motivo='reserva')<>2 then
  raise exception 'Las dos recepciones no asignaron ambas tablas'; end if;
 perform public.mb_actualizar_envio((ordered->>'id')::uuid,'preparando');
 begin
  perform public.mb_actualizar_envio((ordered->>'id')::uuid,'enviado');
  raise exception 'Despacho aceptado antes de grabar';
 exception when raise_exception then if sqlerrm<>'Pedido con grabados pendientes' then raise; end if; end;
 for job in select id from public.pedido_preparacion where pedido_id=(ordered->>'id')::uuid loop
  perform public.mb_preparacion(actor,'avanzar',jsonb_build_object('id',job.id,'estado','enviado_grabar','nota',''));
  perform public.mb_preparacion(actor,'avanzar',jsonb_build_object('id',job.id,'estado','grabado_recibido','nota',''));
  perform public.mb_preparacion(actor,'avanzar',jsonb_build_object('id',job.id,'estado','listo_despachar','nota',''));
 end loop;
 perform public.mb_actualizar_envio((ordered->>'id')::uuid,'enviado');
 if (select count(*) from public.pedido_preparacion where pedido_id=(ordered->>'id')::uuid and estado='despachado')<>2
  then raise exception 'No se marcaron los grabados como despachados'; end if;
end $$;
rollback;
