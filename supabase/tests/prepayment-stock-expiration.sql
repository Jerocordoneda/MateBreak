-- Insufficient stock, exact boundary, atomic combo failure and expiry.
-- All fixtures and reservations are rolled back.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare buyer uuid; mate_id bigint; box_id bigint; knife_id bigint;
 mate_variant bigint; deluxe_variant bigint; token text; ordered jsonb; order_id uuid;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select producto_id into mate_id from private.inventario_ficha where sku='MB-IMP-CAL';
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 select producto_id into knife_id from private.inventario_ficha where sku='MB-CUC-INOX';
 select cv.id into mate_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='IMPERIAL NEGRO DE ALPACA'
   and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO';
 select cv.id into deluxe_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='SET DELUXE DE BELGRANO'
   and cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA';
 if buyer is null or mate_id is null or box_id is null or knife_id is null
  or mate_variant is null or deluxe_variant is null then raise exception 'Faltan fixtures'; end if;

 -- A: mate available, box unavailable.
 update public.producto_simple set stock=10 where id_producto=mate_id;
 update public.producto_simple set stock=0 where id_producto=box_id;
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',1));
 begin
  perform public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception 'A: compró sin caja';
 exception when raise_exception then if sqlerrm not like 'Stock insuficiente%' then raise; end if; end;
 if (select stock from public.producto_simple where id_producto=mate_id)<>10
  or exists(select 1 from public.pedido where carrito_id=(select id from public.carrito where token_hash=token))
 then raise exception 'A: hubo reserva parcial'; end if;

 -- B: box available, mate unavailable.
 update public.producto_simple set stock=0 where id_producto=mate_id;
 update public.producto_simple set stock=10 where id_producto=box_id;
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',1));
 begin
  perform public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception 'B: compró sin mate';
 exception when raise_exception then if sqlerrm not like 'Stock insuficiente%' then raise; end if; end;
 if (select stock from public.producto_simple where id_producto=box_id)<>10
 then raise exception 'B: se reservó caja parcialmente'; end if;

 -- C: only the combo knife is unavailable; all other parts remain untouched.
 update public.producto_simple set stock=10 where id_producto=mate_id;
 update public.producto_simple set stock=0 where id_producto=knife_id;
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',deluxe_variant,'cantidad',1));
 begin
  perform public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception 'C: combo vendido sin cuchillo';
 exception when raise_exception then if sqlerrm not like 'Stock insuficiente%' then raise; end if; end;
 if (select stock from public.producto_simple where id_producto=mate_id)<>10
  or (select stock from public.producto_simple where id_producto=box_id)<>10
  or exists(select 1 from public.pedido where carrito_id=(select id from public.carrito where token_hash=token))
 then raise exception 'C: el combo reservó componentes parcialmente'; end if;

 -- D: exactly all available units can be reserved; expiry releases once.
 update public.producto_simple set stock=2 where id_producto=mate_id;
 update public.producto_simple set stock=2 where id_producto=box_id;
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',2));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
  'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 order_id:=(ordered->>'id')::uuid;
 if (select stock from public.producto_simple where id_producto=mate_id)<>0
  or (select stock from public.producto_simple where id_producto=box_id)<>0
  or (select cantidad from public.pedido_stock where pedido_id=order_id and producto_simple_id=box_id)<>2
 then raise exception 'D: límite exacto no reservó mate y caja'; end if;
 update public.pedido set reserva_hasta=now()-interval '1 second' where id=order_id;
 perform public.mb_expirar_reservas();
 perform public.mb_expirar_reservas();
 if (select estado from public.pedido where id=order_id)<>'expirado'
  or (select stock from public.producto_simple where id_producto=mate_id)<>2
  or (select stock from public.producto_simple where id_producto=box_id)<>2
  or (select count(*) from public.movimiento_stock where pedido_id=order_id and motivo='liberacion')<>2
 then raise exception 'D: vencimiento liberó mal o dos veces'; end if;

 -- E: one beyond the available quantity must fail without changing stock.
 update public.producto_simple set stock=3 where id_producto=box_id;
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',3));
 begin
  perform public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception 'E: se vendieron más mates que los disponibles';
 exception when raise_exception then if sqlerrm not like 'Stock insuficiente%' then raise; end if; end;
 if (select stock from public.producto_simple where id_producto=mate_id)<>2
  or (select stock from public.producto_simple where id_producto=box_id)<>3
 then raise exception 'E: intento excedido cambió stock'; end if;

 -- A still-valid pending reservation is not expired.
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',mate_variant,'cantidad',1));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
  'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 perform public.mb_expirar_reservas();
 if (select estado from public.pedido where id=(ordered->>'id')::uuid)<>'pendiente_pago'
  or (select stock from public.producto_simple where id_producto=mate_id)<>1
  or (select stock from public.producto_simple where id_producto=box_id)<>2
 then raise exception 'La expiración canceló una reserva vigente'; end if;
end $$;
rollback;
