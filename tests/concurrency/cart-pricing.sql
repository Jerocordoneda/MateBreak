-- Included only by the guarded disposable local test runner; never Cloud.
do $$
declare
 buyer uuid:='00000000-0000-4000-8000-000000000001';
 cart uuid:='00000000-0000-4000-8000-000000000002';
 token text:=repeat('a',64); q integer; expected numeric; quote jsonb; order_data jsonb; pay_id uuid;
 recipient jsonb:='{"nombre":"STAGING","apellido":"Prueba","email":"fixture@example.invalid","telefono":"0000000000","codigo_postal":"7000","provincia":"Buenos Aires","ciudad":"Ciudad Ficticia","calle":"Calle Ficticia","numero":"123"}';
begin
 insert into auth.users values(buyer);
 insert into public.producto(id_producto,nombre,precio,tipo) values
 (13,'Fixture',10000,'simple'),(14,'No promo',10000,'simple'),(15,'Combo legacy',3000,'combo'),(16,'Combo variante',4000,'combo'),(3,'Component',1,'simple'),(119,'Box',1,'simple');
 insert into public.producto_simple values(3,100),(119,100);
 insert into private.inventario_ficha values(3,'FIX-MATE','stock'),(119,'MB-CAJA-MATE','stock');
 insert into public.catalogo_producto values(13,true,false),(14,true,false),(16,true,false);
 insert into public.catalogo_variante(id,producto_id,precio,precio_transferencia) values(2,13,10000,9000),(4,14,10000,8500),(6,16,4000,null);
 insert into public.catalogo_variante_mapeo values(2,true);
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad) values(2,3,1),(2,119,1);
 insert into public.catalogo_categoria values(1,'mates-grabados'),(2,'otros');
 insert into public.catalogo_producto_categoria values(13,1),(14,2),(16,2);
 insert into public.catalogo_promocion values(13,'20% OFF Comprando 2 o más');
 insert into public.carrito(id,token_hash,usuario_id,expira_en) values(cart,token,buyer,now()+interval '1 day');
 insert into public.carrito_variante values(cart,2,1,'""'::jsonb);
 foreach q in array array[1,2,8,10,2,1] loop
  update public.carrito_variante set cantidad=q where carrito_id=cart;
  expected:=case q when 1 then 10000 when 2 then 16000 when 8 then 64000 when 10 then 80000 end;
  quote:=public.mb_cotizar_catalogo(cart,'mercadopago');
  if (quote->>'subtotal')::numeric<>expected then raise exception 'Wrong promotional quote for %',q; end if;
 end loop;
 -- Another category doesn't make the eligible quantity reach two.
 insert into public.carrito_variante values(cart,4,1,'""'::jsonb);
 if (public.mb_cotizar_catalogo(cart,'mercadopago')->>'subtotal')::numeric<>20000 then raise exception 'Ineligible category counted as eligible'; end if;
 update public.carrito_variante set cantidad=2 where variante_id=2;
 if (public.mb_cotizar_catalogo(cart,'mercadopago')->>'subtotal')::numeric<>26000 then raise exception 'Nonpromotional variant discounted'; end if;
 insert into public.carrito_item values(cart,15,1);
 insert into public.carrito_variante values(cart,6,1,'""'::jsonb);
 if (public.mb_cotizar_catalogo(cart,'mercadopago')->>'subtotal')::numeric<>33000 then raise exception 'Combo pricing changed'; end if;
 if public.mb_precio_variante(2,'transferencia',2)<>7200 or public.mb_precio_variante(4,'transferencia',2)<>8500 then raise exception 'Transfer policy changed'; end if;
 delete from public.carrito_item where carrito_id=cart;
 delete from public.carrito_variante where variante_id<>2;
 update public.carrito_variante set cantidad=1 where variante_id=2;
 -- Price changes after cart quotation: final reservation recomputes from SQL.
 quote:=public.mb_cotizar_catalogo(cart,'mercadopago');
 update public.catalogo_variante set precio=11000 where id=2;
 update public.metodo_pago set activo=true where codigo='mercadopago';
 update public.metodo_envio set activo=true where codigo='retiro';
 -- Stock loss must reject and leave no order/payment/reservation behind.
 update public.producto_simple set stock=0 where id_producto=3;
 begin
  perform public.mb_checkout_minorista(token,buyer,jsonb_build_object('idempotencia',gen_random_uuid(),'pago','mercadopago','envio','retiro','destinatario',recipient,'total',1));
  raise exception 'Stock guard failed';
 exception when others then
  if SQLERRM not like 'Stock insuficiente%' then raise; end if;
 end;
 if (select count(*) from public.pedido)<>0 or (select count(*) from public.pago)<>0 then raise exception 'Failed reservation left records'; end if;
 update public.producto_simple set stock=100 where id_producto=3;
 order_data:=public.mb_checkout_minorista(token,buyer,jsonb_build_object('idempotencia',gen_random_uuid(),'pago','mercadopago','envio','retiro','destinatario',recipient,'total',1,'precio',1,'stock',999));
 if (order_data->>'total')::numeric<>11000 or (select stock from public.producto_simple where id_producto=3)<>99 then raise exception 'Stale/browser price or stock accepted'; end if;
 select id into pay_id from public.pago where pedido_id=(order_data->>'id')::uuid;
 perform public.mb_confirmar_pago(pay_id,'TEST-LOCAL-'||(order_data->>'id'),11000,'ARS');
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'pagado' then raise exception 'Mock approved lifecycle failed'; end if;
end $$;
