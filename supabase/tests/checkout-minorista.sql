-- Execute in SQL Editor after the checkout migration. Every fixture and order
-- is rolled back; payment/shipping methods return to their original state.
begin;
update public.metodo_pago set activo=true where codigo in ('transferencia','mercadopago');
update public.metodo_envio set activo=true where codigo in ('retiro','correo_domicilio');
update public.producto_simple set stock=100 where id_producto=(select producto_id from private.inventario_ficha where sku='MB-CAJA-MATE');
do $$
declare
 buyer uuid; admin_id uuid; variant bigint; token text; cart jsonb; base jsonb; order_one jsonb; repeat_order jsonb;
 recipient jsonb:=jsonb_build_object('nombre','Ana','apellido','Pérez','email','ana@example.test',
  'telefono','2494123456','codigo_postal','7000','provincia','Buenos Aires','ciudad','Tandil',
  'calle','Pinto','numero','623','piso','','departamento','','referencia','');
 quote_id uuid; before_reservations bigint; reservation_count bigint; shipping_snap jsonb;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select usuario_id into admin_id from private.equipo_inventario where activo limit 1;
 select cv.id into variant from public.catalogo_variante cv
  join public.mb_catalogo_disponibilidad() disp on disp.variante_id=cv.id
  where disp.comprable and disp.con_stock and cv.precio>0 order by cv.id limit 1;
 if buyer is null or admin_id is null or variant is null then raise exception 'Faltan fixtures existentes'; end if;

 token:=md5(random()::text)||md5(random()::text);
 cart:=public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant,'cantidad',1));
 base:=public.mb_cotizar_catalogo((cart->>'id')::uuid,'mercadopago');
 select count(*) into before_reservations from public.pedido_stock;
 order_one:=public.mb_checkout_minorista(token,buyer,jsonb_build_object('idempotencia',gen_random_uuid(),
  'pago','transferencia','envio','retiro','destinatario',recipient,'total',0,'costo_envio',999999));
 if (order_one->>'subtotal_mercaderia')::numeric<>(base->>'subtotal')::numeric
  or (order_one->>'descuento_productos')::numeric<>round((base->>'subtotal')::numeric*0.10,2)
  or (order_one->>'total')::numeric<>round((base->>'subtotal')::numeric*0.90,2)
  or (order_one->>'reserva_hasta')::timestamptz not between now()+interval '23 hours' and now()+interval '25 hours'
  then raise exception 'Transferencia, descuento o reserva de 24h incorrectos'; end if;
 repeat_order:=public.mb_checkout_minorista(token,buyer,jsonb_build_object('idempotencia',order_one->>'idempotencia',
  'pago','transferencia','envio','retiro','destinatario',recipient));
 if repeat_order->>'id'<>order_one->>'id' then raise exception 'Idempotencia de transferencia falló'; end if;
 select count(*) into reservation_count from public.pedido_stock;
 if reservation_count<=before_reservations then raise exception 'No se reservó stock'; end if;

 perform public.mb_confirmar_transferencia(admin_id,(order_one->>'id')::uuid,'test-'||gen_random_uuid());
 if (select estado from public.pedido where id=(order_one->>'id')::uuid)<>'pagado'
  or not exists(select 1 from private.confirmacion_transferencia where pedido_id=(order_one->>'id')::uuid)
  then raise exception 'Confirmación manual no quedó pagada y auditada'; end if;
 perform public.mb_confirmar_transferencia(admin_id,(order_one->>'id')::uuid,'retry-ignored');
 if (select count(*) from private.confirmacion_transferencia where pedido_id=(order_one->>'id')::uuid)<>1
  then raise exception 'Confirmación duplicó auditoría'; end if;

 token:=md5(random()::text)||md5(random()::text);
 cart:=public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant,'cantidad',1));
 order_one:=public.mb_checkout_minorista(token,buyer,jsonb_build_object('idempotencia',gen_random_uuid(),
  'pago','mercadopago','envio','retiro','destinatario',recipient));
 if (order_one->>'reserva_hasta')::timestamptz not between now()+interval '55 minutes' and now()+interval '65 minutes'
  or (select metodo from public.pago where pedido_id=(order_one->>'id')::uuid)<>'mercadopago'
  then raise exception 'Mercado Pago no tiene reserva de 1h'; end if;
 update public.pedido set reserva_hasta=now()-interval '1 second' where id=(order_one->>'id')::uuid;
 perform public.mb_expirar_reservas();
 if (select estado from public.pedido where id=(order_one->>'id')::uuid)<>'expirado'
  or exists(select 1 from public.pedido_stock ps where ps.pedido_id=(order_one->>'id')::uuid
   and not exists(select 1 from public.movimiento_stock ms where ms.pedido_id=ps.pedido_id
    and ms.producto_simple_id=ps.producto_simple_id and ms.motivo='liberacion'))
  then raise exception 'Expiración no liberó reservas'; end if;

 -- The server-side shipping quote is authoritative; browser cost is ignored.
 token:=md5(random()::text)||md5(random()::text);
 cart:=public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',variant,'cantidad',1));
 shipping_snap:=jsonb_build_object('version',1,'environment','mock','deliveryType','D','cartItems',
   (select jsonb_agg(jsonb_build_object('variant',cv.variante_id::text,'product',v.producto_id::text,
     'quantity',cv.cantidad,'personalization',cv.personalizacion) order by cv.variante_id)
    from public.carrito_variante cv join public.catalogo_variante v on v.id=cv.variante_id where cv.carrito_id=(cart->>'id')::uuid),
   'parcels',jsonb_build_array(jsonb_build_object('dimensions',jsonb_build_object('weight',550,'height',17,'width',17,'length',17),'carrierCost',7755)));
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,proveedor,servicio,costo_transportista,valido_hasta,snapshot,fingerprint)
 values((cart->>'id')::uuid,buyer,recipient,'correo_domicilio','correo_argentino','CP',7755,now()+interval '10 minutes',
  shipping_snap,public.mb_shipping_fingerprint((cart->>'id')::uuid,shipping_snap)) returning id into quote_id;
 order_one:=public.mb_checkout_minorista(token,buyer,jsonb_build_object('idempotencia',gen_random_uuid(),
  'pago','transferencia','envio','correo_domicilio','cotizacion_id',quote_id,
  'destinatario',recipient,'costo_envio',0));
 if (order_one->>'costo_transportista')::numeric<>7755
  or (order_one->>'costo_envio')::numeric<>(case when (order_one->>'subtotal_mercaderia')::numeric>=80000 then 0 else 7755 end)
  then raise exception 'Envío cobrado distinto de cotización y umbral'; end if;
end $$;
rollback;
