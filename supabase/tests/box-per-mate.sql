-- La recepción y las ventas de prueba se revierten por completo.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare buyer uuid; actor uuid; seller uuid; box_id bigint; mate_id bigint; other_mate_id bigint;
 mate_variant bigint; deluxe_variant bigint; parrillero_variant bigint; token text;
 result jsonb; repeated jsonb; sale jsonb; key uuid; receipt jsonb; box_before integer; reserved_before integer;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select usuario_id into actor from private.equipo_inventario where activo order by creado_en limit 1;
 select usuario_id into seller from private.equipo_vendedores
  where activo and public.mb_rol(usuario_id)='vendedor' order by creado_en limit 1;
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 select producto_id into mate_id from private.inventario_ficha where sku='MB-IMP-CAL';
 select producto_id into other_mate_id from private.inventario_ficha where sku='MB-IMP-ALG';
 if buyer is null or actor is null or seller is null or box_id is null then
  raise exception 'Faltan usuarios o SKU de prueba'; end if;
 select cv.id into mate_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='IMPERIAL PREMIUM DE RIVER'
   and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA'
   and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO';
 select cv.id into deluxe_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='SET DELUXE DE BELGRANO' and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA';
 select cv.id into parrillero_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id where p.nombre='SET PARRILLERO DE BELGRANO';
 if mate_variant is null or deluxe_variant is null or parrillero_variant is null then
  raise exception 'Faltan variantes de prueba'; end if;

 -- Without boxes, mate checkout fails even though the blank mate is in stock.
 update public.producto_simple set stock=0 where id_producto=box_id;
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',1));
 begin
  perform public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception 'Se vendió un mate sin caja';
 exception when raise_exception then if sqlerrm<>'Stock insuficiente' then raise; end if; end;

 reserved_before:=private.inventario_reservado(box_id);
 receipt:=public.mb_registrar_recepcion(actor,jsonb_build_object('producto_id',box_id,'cantidad',10,
  'costo_unitario','25.00','fecha',current_date,'proveedor','Proveedor de prueba',
  'motivo','Diez cajas revisadas al recibir','idempotencia',gen_random_uuid(),
  'disponible_esperado',0,'reservado_esperado',reserved_before));
 if receipt->>'moneda'<>'ARS' or (select stock from public.producto_simple where id_producto=box_id)<>10
  or not exists(select 1 from private.inventario_recepcion where operacion_id=(receipt->>'operacion_id')::uuid and producto_id=box_id and costo_unitario=25.00)
  then raise exception 'Recepción de cajas o costo histórico incorrectos'; end if;

 -- Three individual mates reserve exactly three boxes; browser price is ignored.
 token:=md5(random()::text)||md5(random()::text);key:=gen_random_uuid();
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',3,'precio',1));
 result:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',key,'pago','transferencia','envio','retiro','precio',1));
 if (result->>'subtotal')::numeric<=3
  or (select cantidad from public.pedido_stock where pedido_id=(result->>'id')::uuid and producto_simple_id=mate_id)<>3
  or (select cantidad from public.pedido_stock where pedido_id=(result->>'id')::uuid and producto_simple_id=box_id)<>3
  then raise exception 'Tres mates no reservaron tres cajas o se aceptó el precio del navegador'; end if;
 repeated:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',key,'pago','transferencia','envio','retiro'));
 if repeated->>'id'<>result->>'id' or (select stock from public.producto_simple where id_producto=box_id)<>7
  then raise exception 'Reintento duplicó cajas'; end if;

 -- One-mate combo gets one box, no second box from the combo itself.
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',deluxe_variant,'cantidad',1));
 result:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select cantidad from public.pedido_stock where pedido_id=(result->>'id')::uuid and producto_simple_id=box_id)<>1
  or (select count(*) from public.pedido_stock where pedido_id=(result->>'id')::uuid and producto_simple_id=box_id)<>1
  then raise exception 'El combo duplicó o perdió su caja'; end if;

 -- Parrillero has no mate and must not consume any box.
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',parrillero_variant,'cantidad',1));
 result:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if exists(select 1 from public.pedido_stock where pedido_id=(result->>'id')::uuid and producto_simple_id=box_id)
  then raise exception 'Combo sin mate reservó caja'; end if;

 -- A future two-mate composition automatically gets exactly two boxes.
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia)
 values(mate_variant,other_mate_id,1,'Segundo mate de prueba, solo dentro de rollback');
 if (select cantidad from public.catalogo_variante_componente where variante_id=mate_variant and producto_simple_id=box_id)<>2
  then raise exception 'Regla de caja no escaló a dos mates'; end if;
 delete from public.catalogo_variante_componente where variante_id=mate_variant and producto_simple_id=other_mate_id;
 if (select cantidad from public.catalogo_variante_componente where variante_id=mate_variant and producto_simple_id=box_id)<>1
  then raise exception 'Regla de caja no volvió a una unidad'; end if;
 update public.catalogo_variante_componente set cantidad=5
  where variante_id=mate_variant and producto_simple_id=box_id;
 if (select cantidad from public.catalogo_variante_componente where variante_id=mate_variant and producto_simple_id=box_id)<>1
  then raise exception 'Una edición directa duplicó las cajas'; end if;

 -- Seller's manual sale uses the same box pool without adding a priced line.
 box_before:=(select stock from public.producto_simple where id_producto=box_id);
 sale:=public.mb_ventas(seller,'registrar',jsonb_build_object('idempotencia',gen_random_uuid(),
  'cliente','Cliente de prueba','telefono','','notas','',
  'estado','por_grabar','metodo_pago','efectivo',
  'items',jsonb_build_array(jsonb_build_object('producto_id',mate_id,'cantidad',2,'precio_unitario','100.00','personalizacion','Grabado de prueba'))));
 if (sale->>'total')::numeric<>200
  or (select cantidad from private.venta_manual_empaque where venta_id=(sale->>'id')::uuid)<>2
  or (select stock from public.producto_simple where id_producto=box_id)<>box_before-2
  then raise exception 'Venta manual no consumió dos cajas físicas'; end if;
 perform public.mb_ventas(seller,'estado',jsonb_build_object('id',sale->>'id','estado','por_entregar'));
 perform public.mb_ventas(seller,'estado',jsonb_build_object('id',sale->>'id','estado','entregada'));
 if (select stock from public.producto_simple where id_producto=box_id)<>box_before-2
  or (select count(*) from private.inventario_ajuste where producto_id=box_id and motivo like 'Entrega de venta manual %')<>1
  then raise exception 'Entrega descontó dos veces o perdió auditoría de cajas'; end if;
end $$;

-- Quantity and mixed-cart regressions use stock only inside this rollback.
do $$
declare buyer uuid; box_id bigint; mate_id bigint; other_mate_id bigint; knife_id bigint;
 mate_variant bigint; deluxe_variant bigint; premium_variant bigint;
 thermo_variant bigint; bombilla_variant bigint; token text; ordered jsonb; case_row record;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 select producto_id into mate_id from private.inventario_ficha where sku='MB-IMP-CAL';
 select producto_id into other_mate_id from private.inventario_ficha where sku='MB-IMP-ALG';
 select producto_id into knife_id from private.inventario_ficha where sku='MB-CUC-INOX';
 select cv.id into mate_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='IMPERIAL PREMIUM DE RIVER'
   and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA'
   and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO';
 select cv.id into deluxe_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='SET DELUXE DE BELGRANO' and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA';
 select cv.id into premium_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='SET PREMIUM PERSONALIZADO - TU PROPIO DISEÑO'
   and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA';
 select cv.id into thermo_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id where p.nombre='TERMO DE BELGRANO';
 select cv.id into bombilla_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id where p.nombre='BOMBILLA DE ACERO PICO DE LORO';
 if buyer is null or box_id is null or mate_id is null or other_mate_id is null
  or knife_id is null or mate_variant is null or deluxe_variant is null
  or premium_variant is null or thermo_variant is null or bombilla_variant is null
 then raise exception 'Faltan fixtures de cantidades'; end if;
 update public.producto_simple set stock=100 where id_producto=box_id;

 for case_row in select * from (values
   ('mate ×1',mate_variant,1,1),('mate ×5',mate_variant,5,5),
   ('set ×2',deluxe_variant,2,2),('termo ×1',thermo_variant,1,0),
   ('bombilla ×1',bombilla_variant,1,0),('premium con vaina',premium_variant,1,1)
  ) as t(nombre,variante_id,cantidad,cajas) loop
  token:=md5(random()::text)||md5(random()::text);
  perform public.mb_comercio(token,buyer,'variante',
   jsonb_build_object('variante_id',case_row.variante_id,'cantidad',case_row.cantidad));
  ordered:=public.mb_comercio(token,buyer,'checkout',
   jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  if coalesce((select sum(cantidad) from public.pedido_stock
      where pedido_id=(ordered->>'id')::uuid and producto_simple_id=box_id),0)<>case_row.cajas
   or exists(select 1 from public.pedido_item where pedido_id=(ordered->>'id')::uuid
      and producto_id=box_id)
  then raise exception 'Reserva o línea comercial de caja incorrecta: %',case_row.nombre; end if;
  if case_row.nombre='premium con vaina' and
    ((select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid
       and producto_simple_id=knife_id)<>1
      or exists(select 1 from private.inventario_ficha where sku ~* 'vaina|funda'))
  then raise exception 'El cuchillo y su vaina deben consumir un único SKU'; end if;
 end loop;

 -- Adding a second physical mate automatically changes the box component.
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia)
 values(mate_variant,other_mate_id,1,'Segundo mate, fixture con rollback');
 for case_row in select * from (values ('dos mates ×1',1,2),('dos mates ×2',2,4))
  as t(nombre,cantidad,cajas) loop
  token:=md5(random()::text)||md5(random()::text);
  perform public.mb_comercio(token,buyer,'variante',
   jsonb_build_object('variante_id',mate_variant,'cantidad',case_row.cantidad));
  ordered:=public.mb_comercio(token,buyer,'checkout',
   jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  if (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid
      and producto_simple_id=box_id)<>case_row.cajas
   or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid
      and producto_simple_id=other_mate_id)<>case_row.cantidad
  then raise exception 'Dos mates físicos reservaron cajas incorrectas: %',case_row.nombre; end if;
 end loop;
 delete from public.catalogo_variante_componente
  where variante_id=mate_variant and producto_simple_id=other_mate_id;

 -- Two loose mates plus three one-mate sets require five boxes in one order.
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',2));
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',deluxe_variant,'cantidad',3));
 ordered:=public.mb_comercio(token,buyer,'checkout',
  jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid
     and producto_simple_id=box_id)<>5
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid
     and producto_simple_id=mate_id)<>5
  or (select count(*) from public.pedido_item where pedido_id=(ordered->>'id')::uuid)<>2
 then raise exception 'Carrito mixto no reservó cinco mates y cinco cajas'; end if;
end $$;
rollback;
