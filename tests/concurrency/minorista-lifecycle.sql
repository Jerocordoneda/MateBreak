-- Real repository functions in an isolated local PostgreSQL fixture only.
-- All fixture orders and stock mutations are rolled back.
begin;
do $$
declare
 buyer uuid:='00000000-0000-4000-8000-000000000001';
 admin_id uuid:='00000000-0000-4000-8000-000000000002';
 recipient jsonb:='{"nombre":"Ana","apellido":"Prueba","email":"ana@example.test","telefono":"2494123456","codigo_postal":"7000","provincia":"Buenos Aires","ciudad":"Tandil","calle":"Pinto","numero":"623"}';
 cart_id uuid; quote_id uuid; token text; order_data jsonb; repeated jsonb;
 payment_id uuid; before_stock integer;
begin
 insert into auth.users(id) values (buyer),(admin_id);
 insert into private.equipo_inventario(usuario_id,activo) values (admin_id,true);
 insert into public.producto(id_producto,nombre,precio,tipo) values
  (100,'Mate de prueba',100,'simple'),(101,'Mate físico',1,'simple'),(102,'Caja física',1,'simple');
 insert into public.producto_simple(id_producto,stock) values (101,2),(102,2);
 insert into private.inventario_ficha(producto_id,sku,abastecimiento) values
  (101,'FIX-MATE','stock'),(102,'MB-CAJA-MATE','stock');
 insert into public.catalogo_producto(producto_id) values (100);
 insert into public.catalogo_variante(id,producto_id,precio) values (200,100,100);
 insert into public.catalogo_variante_mapeo(variante_id,aprobado) values (200,true);
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad)
  values (200,101,1),(200,102,1);
 update public.metodo_pago set activo=true where codigo='mercadopago';
 update public.metodo_envio set activo=true where codigo='correo_domicilio';
 -- Transfer and retiro remain disabled: the internal staging path must work.
 if (select activo from public.metodo_pago where codigo='transferencia')
  or (select activo from public.metodo_envio where codigo='retiro') then raise exception 'Fixture methods unexpectedly active'; end if;

 token:=repeat('a',64); cart_id:=gen_random_uuid();
 insert into public.carrito(id,token_hash,usuario_id,expira_en)
  values(cart_id,token,buyer,now()+interval '1 day');
 insert into public.carrito_variante(carrito_id,variante_id,cantidad) values(cart_id,200,1);
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
  values(cart_id,buyer,recipient,'correo_domicilio',7755,now()+interval '15 minutes') returning id into quote_id;
 order_data:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia','00000000-0000-4000-8000-000000000011','pago','mercadopago',
  'envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient,
  'precio',1,'subtotal',1,'costo_envio',1,'total',1));
 if (order_data->>'total')::numeric<>7855 or (order_data->>'costo_transportista')::numeric<>7755
  or (select stock from public.producto_simple where id_producto=101)<>1
  or (select stock from public.producto_simple where id_producto=102)<>1
  then raise exception 'Real checkout accepted browser totals or reserved incorrectly'; end if;
 raise notice 'real checkout, server totals and stock reservation: OK';

 repeated:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia','00000000-0000-4000-8000-000000000011','pago','mercadopago',
  'envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient));
 if repeated->>'id'<>order_data->>'id' or (select count(*) from public.pedido)<>1
  then raise exception 'Idempotent retry made another order'; end if;
 begin
  perform public.mb_checkout_minorista(token,buyer,jsonb_build_object(
   'idempotencia','00000000-0000-4000-8000-000000000012','pago','mercadopago',
   'envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient));
  raise exception 'New key mutated a converted cart';
 exception when raise_exception then
  if sqlerrm<>'Carrito ya confirmado' then raise; end if;
 end;
 if (select count(*) from public.pedido)<>1 then raise exception 'Converted cart created another order'; end if;
 raise notice 'idempotency and converted cart: OK';

 select id into payment_id from public.pago where pedido_id=(order_data->>'id')::uuid;
 perform public.mb_confirmar_pago(payment_id,'TEST-APPROVED',7855,'ARS');
 perform public.mb_confirmar_pago(payment_id,'TEST-APPROVED',7855,'ARS');
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'pagado'
  or (select count(*) from public.movimiento_stock where pedido_id=(order_data->>'id')::uuid and motivo='reserva')<>2
  then raise exception 'Repeated confirmation changed stock or status'; end if;
 repeated:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia','00000000-0000-4000-8000-000000000011','pago','mercadopago',
  'envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient));
 if repeated->>'id'<>order_data->>'id' or repeated->>'estado'<>'pagado'
  then raise exception 'Paid retry did not return original order'; end if;
 raise notice 'payment confirmation twice: OK';

 update public.pedido set estado='en_preparacion' where id=(order_data->>'id')::uuid;
 update public.pedido set estado='enviado' where id=(order_data->>'id')::uuid;
 update public.pedido set estado='entregado' where id=(order_data->>'id')::uuid;
 begin
  update public.pedido set estado='pendiente_pago' where id=(order_data->>'id')::uuid;
  raise exception 'Delivered order reverted to pending';
 exception when raise_exception then
  if sqlerrm not like 'Transicion de pedido invalida:%' then raise; end if;
 end;
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'entregado'
  then raise exception 'Delivered state was changed'; end if;
 raise notice 'forward-only order states: OK';

 token:=repeat('b',64); cart_id:=gen_random_uuid();
 insert into public.carrito(id,token_hash,usuario_id,expira_en)
  values(cart_id,token,buyer,now()+interval '1 day');
 insert into public.carrito_variante(carrito_id,variante_id,cantidad) values(cart_id,200,1);
 before_stock:=(select stock from public.producto_simple where id_producto=101);
 begin
  perform public.mb_checkout_minorista(token,buyer,jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','mercadopago','envio','correo_domicilio',
   'cotizacion_id',quote_id,'destinatario',recipient));
  raise exception 'Foreign quote accepted';
 exception when raise_exception then
  if sqlerrm<>'Cotizacion de envio vencida o invalida' then raise; end if;
 end;
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
  values(cart_id,admin_id,recipient,'correo_domicilio',7755,now()+interval '15 minutes') returning id into quote_id;
 begin
  perform public.mb_checkout_minorista(token,buyer,jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','mercadopago','envio','correo_domicilio',
   'cotizacion_id',quote_id,'destinatario',recipient));
  raise exception 'Another user quote accepted';
 exception when raise_exception then
  if sqlerrm<>'Cotizacion de envio vencida o invalida' then raise; end if;
 end;
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
  values(cart_id,buyer,recipient,'correo_domicilio',7755,now()-interval '1 second') returning id into quote_id;
 begin
  perform public.mb_checkout_minorista(token,buyer,jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','mercadopago','envio','correo_domicilio',
   'cotizacion_id',quote_id,'destinatario',recipient));
  raise exception 'Expired quote accepted';
 exception when raise_exception then
  if sqlerrm<>'Cotizacion de envio vencida o invalida' then raise; end if;
 end;
 if (select stock from public.producto_simple where id_producto=101)<>before_stock
  or (select count(*) from public.pedido)<>1 then raise exception 'Invalid quote changed stock or orders'; end if;
 raise notice 'foreign cart/user and expired shipping quotes: OK';

 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
  values(cart_id,buyer,recipient,'correo_domicilio',7755,now()+interval '15 minutes') returning id into quote_id;
 order_data:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia','00000000-0000-4000-8000-000000000013','pago','mercadopago',
  'envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient));
 perform public.mb_comercio(repeat('0',64),buyer,'cancelar',jsonb_build_object('id',order_data->>'id'));
 perform public.mb_comercio(repeat('0',64),buyer,'cancelar',jsonb_build_object('id',order_data->>'id'));
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'cancelado'
  or (select stock from public.producto_simple where id_producto=101)<>before_stock
  or (select count(*) from public.movimiento_stock where pedido_id=(order_data->>'id')::uuid and motivo='liberacion')<>2
  then raise exception 'Rejection/cancellation did not release exactly once'; end if;
 repeated:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia','00000000-0000-4000-8000-000000000013','pago','mercadopago',
  'envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient));
 if repeated->>'id'<>order_data->>'id' or repeated->>'estado'<>'cancelado'
  then raise exception 'Cancelled retry did not return original order'; end if;
 raise notice 'rejected payment/cancellation and retry: OK';

 token:=repeat('c',64); cart_id:=gen_random_uuid();
 insert into public.carrito(id,token_hash,usuario_id,expira_en)
  values(cart_id,token,buyer,now()+interval '1 day');
 insert into public.carrito_variante(carrito_id,variante_id,cantidad) values(cart_id,200,1);
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
  values(cart_id,buyer,recipient,'correo_domicilio',7755,now()+interval '15 minutes') returning id into quote_id;
 order_data:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia','00000000-0000-4000-8000-000000000014','pago','mercadopago',
  'envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient));
 update public.pedido set reserva_hasta=now()-interval '1 second' where id=(order_data->>'id')::uuid;
 perform public.mb_expirar_reservas();
 perform public.mb_expirar_reservas();
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'expirado'
  or (select stock from public.producto_simple where id_producto=101)<>before_stock
  or (select count(*) from public.movimiento_stock where pedido_id=(order_data->>'id')::uuid and motivo='liberacion')<>2
  then raise exception 'Expired order did not retain history and release once'; end if;
 raise notice 'expiry and release: OK';

 -- Transaction now() predates the deadline; a real-time check must reject
 -- confirmation after the wait, even while this transaction stays open.
 token:=repeat('e',64); cart_id:=gen_random_uuid();
 insert into public.carrito(id,token_hash,usuario_id,expira_en)
  values(cart_id,token,buyer,now()+interval '1 day');
 insert into public.carrito_variante(carrito_id,variante_id,cantidad) values(cart_id,200,1);
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
  values(cart_id,buyer,recipient,'correo_domicilio',7755,clock_timestamp()+interval '15 minutes') returning id into quote_id;
 order_data:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia',gen_random_uuid(),'pago','mercadopago','envio','correo_domicilio',
  'cotizacion_id',quote_id,'destinatario',recipient));
 select id into payment_id from public.pago where pedido_id=(order_data->>'id')::uuid;
 update public.pedido set reserva_hasta=clock_timestamp()+interval '100 milliseconds'
  where id=(order_data->>'id')::uuid;
 perform pg_sleep(0.2);
 begin
  perform public.mb_confirmar_pago(payment_id,'TEST-TOO-LATE',7855,'ARS');
  raise exception 'Late payment was approved';
 exception when raise_exception then
  if sqlerrm<>'Pago requiere revision manual' then raise; end if;
 end;
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'pendiente_pago'
  then raise exception 'Late payment changed order state'; end if;
 perform public.mb_comercio(repeat('0',64),buyer,'cancelar',jsonb_build_object('id',order_data->>'id'));
 raise notice 'late payment after deadline: OK';

 update public.metodo_pago set activo=true where codigo='transferencia';
 update public.metodo_envio set activo=true where codigo='retiro';
 token:=repeat('d',64); cart_id:=gen_random_uuid();
 insert into public.carrito(id,token_hash,usuario_id,expira_en)
  values(cart_id,token,buyer,now()+interval '1 day');
 insert into public.carrito_variante(carrito_id,variante_id,cantidad) values(cart_id,200,1);
 order_data:=public.mb_checkout_minorista(token,buyer,jsonb_build_object(
  'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro','destinatario',recipient));
 if (order_data->>'reserva_hasta')::timestamptz not between now()+interval '23 hours' and now()+interval '25 hours'
  then raise exception 'Transfer reservation is not 24 hours'; end if;
 perform public.mb_confirmar_transferencia(admin_id,(order_data->>'id')::uuid,'TEST-BANK-REF');
 perform public.mb_confirmar_transferencia(admin_id,(order_data->>'id')::uuid,'TEST-BANK-REF');
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'pagado'
  or (select count(*) from private.confirmacion_transferencia where pedido_id=(order_data->>'id')::uuid)<>1
  then raise exception 'Transfer confirmation or actor audit duplicated'; end if;
 raise notice 'manual transfer and actor audit: OK';
end $$;
rollback;
