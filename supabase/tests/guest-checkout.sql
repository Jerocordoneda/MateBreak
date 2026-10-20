-- Requires disposable DB seeded with all repository migrations, never Cloud.
begin;
do $$
declare c jsonb; o jsonb; again jsonb; recipient jsonb:='{"nombre":"Ana","apellido":"Sintetica","email":"ana@example.test","telefono":"2494123456","codigo_postal":"7000","provincia":"Buenos Aires","ciudad":"Tandil","calle":"Prueba","numero":"123"}';
 body jsonb; payment uuid; event jsonb; token text:=repeat('a',64); q uuid; snapshot jsonb; buyer uuid:=gen_random_uuid();
begin
 insert into public.producto(id_producto,nombre,precio,tipo,moneda) overriding system value values
 (900001,'Fixture invitado',10000,'simple','ARS'),(900002,'Componente ficticio',1,'simple','ARS'),(900003,'Caja ficticia',1,'simple','ARS');
 insert into public.producto_simple(id_producto,stock) values(900002,100),(900003,100);
 insert into private.inventario_ficha(producto_id,sku) values(900002,'GUEST-FIX-MATE'),(900003,'GUEST-FIX-BOX');
 insert into public.catalogo_producto(producto_id,publicado,extraido_en) values(900001,true,now());
 insert into public.catalogo_variante(id,producto_id,external_id,opciones,precio,disponible) overriding system value
 values(900001,900001,'guest-fixture','{"BOMBILLA ACERO INOX":"NO"}',10000,true);
 insert into public.catalogo_variante_mapeo(variante_id,aprobado) values(900001,true);
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia) values
 (900001,900002,1,'Local fixture only'),(900001,900003,1,'Local fixture only');
 update public.metodo_pago set activo=true where codigo in ('mercadopago','transferencia');
 update public.metodo_envio set activo=true where codigo in ('retiro','correo_domicilio');
 c:=public.mb_comercio(token,null,'variante','{"variante_id":900001,"cantidad":1,"personalizacion":"GRABADO LOCAL"}');
 body:=jsonb_build_object('idempotencia',gen_random_uuid(),'pago','mercadopago','envio','retiro','destinatario',recipient,'total',1,'usuario_id',buyer);
 o:=public.mb_checkout_minorista(token,null,body);
 if o->>'usuario_id' is not null or (o->>'total')::numeric<>10000 or (select count(*) from auth.users)<>0 then raise exception 'Guest identity or authoritative total failed';end if;
 if (select stock from public.producto_simple where id_producto=900002)<>99 or (select count(*) from public.pedido_stock where pedido_id=(o->>'id')::uuid)<>2 then raise exception 'Guest reservation failed';end if;
 again:=public.mb_checkout_minorista(token,null,body);
 if again->>'id'<>o->>'id' or (select count(*) from public.pedido)<>1 then raise exception 'Replay duplicated guest order';end if;
 begin
  perform public.mb_checkout_minorista(token,null,body||jsonb_build_object('destinatario',recipient||'{"nombre":"Otra"}'));
  raise exception 'Changed replay accepted';
 exception when raise_exception then if sqlerrm='Changed replay accepted' then raise;end if;end;
 if public.mb_pedido_por_carrito((o->>'id')::uuid,repeat('b',64),null) is not null then raise exception 'Foreign cart sees order';end if;
 if public.mb_pedido_por_carrito((o->>'id')::uuid,token,null) is null then raise exception 'Own cart cannot read';end if;
 update public.carrito set expira_en=now()-interval '1 second' where id=(c->>'id')::uuid;
 if public.mb_pedido_por_carrito((o->>'id')::uuid,token,null) is not null then raise exception 'Expired cart can read order';end if;
 update public.carrito set expira_en=now()+interval '30 days' where id=(c->>'id')::uuid;
 select id into payment from public.pago where pedido_id=(o->>'id')::uuid;
 perform public.mb_mark_mock_payment(payment);
 if not (public.mb_pedido_por_carrito((o->>'id')::uuid,token,null)->'pagos'->0->>'simulado')::boolean then raise exception 'Pending mock provenance lost';end if;
 perform public.mb_confirmar_pago(payment,'TEST-LOCAL-'||(o->>'id'),10000,'ARS');
 perform public.mb_confirmar_pago(payment,'TEST-LOCAL-'||(o->>'id'),10000,'ARS');
 if (select count(*) from private.order_email_event where pedido_id=(o->>'id')::uuid)<>2 then raise exception 'Email events duplicated';end if;
 event:=public.mb_claim_order_email();
 perform public.mb_issue_order_link((event->>'claim_id')::uuid,repeat('c',64));
 if public.mb_exchange_order_link(repeat('c',64),repeat('d',64)) is distinct from (event->>'pedido_id')::uuid then raise exception 'Link exchange failed';end if;
 if public.mb_exchange_order_link(repeat('c',64),repeat('e',64)) is not null then raise exception 'Link reused';end if;
 if public.mb_read_order_link((o->>'id')::uuid,repeat('d',64)) is null or public.mb_read_order_link(gen_random_uuid(),repeat('d',64)) is not null then raise exception 'Link order isolation failed';end if;
 update private.order_access set session_expires_at=now()-interval '1 second' where link_hash=repeat('c',64);
 if public.mb_read_order_link((o->>'id')::uuid,repeat('d',64)) is not null then raise exception 'Expired session accepted';end if;
 update private.order_access set session_expires_at=now()+interval '1 hour' where link_hash=repeat('c',64);
 perform public.mb_revoke_order_links((o->>'id')::uuid);
 if public.mb_read_order_link((o->>'id')::uuid,repeat('d',64)) is not null then raise exception 'Revocation failed';end if;
 perform public.mb_issue_order_link((event->>'claim_id')::uuid,repeat('f',64));
 update private.order_access set expires_at=now()-interval '1 second' where link_hash=repeat('f',64);
 if public.mb_exchange_order_link(repeat('f',64),repeat('1',64)) is not null then raise exception 'Expired link accepted';end if;
 perform public.mb_finish_order_email((event->>'claim_id')::uuid,'sent');
 -- Failed deliveries retry only before acceptance, then reach manual review.
 update private.order_email_event set state='retry',attempts=4,available_at=now()-interval '1 second' where state='pending';
 event:=public.mb_claim_order_email();perform public.mb_finish_order_email((event->>'claim_id')::uuid,'retry');
 if (select state from private.order_email_event where claim_id=(event->>'claim_id')::uuid)<>'review' then raise exception 'Retry limit not enforced';end if;
 perform public.mb_request_order_link(o->>'numero_publico','absent@example.test');
 if exists(select 1 from private.order_email_event where kind='renewal') then raise exception 'Unknown email queued';end if;
 perform public.mb_request_order_link(o->>'numero_publico','ana@example.test');
 perform public.mb_request_order_link(o->>'numero_publico','ana@example.test');
 if (select count(*) from private.order_email_event where kind='renewal')<>1 then raise exception 'Renewal duplicated';end if;
 -- Fixture-only verified carrier evidence. No provider request or real dispatch.
 perform public.mb_actualizar_envio((o->>'id')::uuid,'preparando');
 begin
  perform public.mb_record_verified_dispatch((o->>'id')::uuid,'SYNTHETIC1234','accepted');
  raise exception 'Unverified mock dispatch accepted';
 exception when raise_exception then if sqlerrm='Unverified mock dispatch accepted' then raise;end if;end;
 update public.envio set snapshot=jsonb_build_object('environment','production'),estado_integracion='importado' where pedido_id=(o->>'id')::uuid;
 update public.pago set simulado=false where id=payment;
 perform public.mb_record_verified_dispatch((o->>'id')::uuid,'SYNTHETIC1234','accepted');
 perform public.mb_record_verified_dispatch((o->>'id')::uuid,'SYNTHETIC1234','in_transit');
 if (select count(*) from private.order_email_event where pedido_id=(o->>'id')::uuid and kind='shipped')<>1
 or public.mb_pedido_por_carrito((o->>'id')::uuid,token,null)->'tracking'->>'codigo'<>'SYNTHETIC1234'
 then raise exception 'Verified dispatch visibility/deduplication failed';end if;
 begin
  perform public.mb_record_verified_dispatch((o->>'id')::uuid,'OTHERTRACK1234','accepted');
  raise exception 'Different tracking accepted';
 exception when raise_exception then if sqlerrm='Different tracking accepted' then raise;end if;end;
 -- Shipping quote belongs to guest cart and recipient; its snapshot is mandatory.
 token:=repeat('2',64); c:=public.mb_comercio(token,null,'variante','{"variante_id":900001,"cantidad":1}');
 snapshot:=jsonb_build_object('environment','mock','cartItems',jsonb_build_array(jsonb_build_object('variant','900001','product','900001','quantity',1,'personalization','')),'parcels','[{"length":17,"width":17,"height":17,"weight":550}]'::jsonb);
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,proveedor,servicio,costo_transportista,valido_hasta,snapshot,fingerprint)
 values((c->>'id')::uuid,null,recipient,'correo_domicilio','correo_argentino','mock',8500,now()+interval '15 minutes',snapshot,public.mb_shipping_fingerprint((c->>'id')::uuid,snapshot)) returning id into q;
 body:=jsonb_build_object('idempotencia',gen_random_uuid(),'pago','mercadopago','envio','correo_domicilio','cotizacion_id',q,'destinatario',recipient);
 o:=public.mb_checkout_minorista(token,null,body);
 if (o->>'total')::numeric<>18500 then raise exception 'Guest shipping total failed';end if;
 again:=public.mb_cancelar_pedido_servicio((o->>'id')::uuid);
 perform public.mb_cancelar_pedido_servicio((o->>'id')::uuid);
 if again->>'estado'<>'cancelado' or (select stock from public.producto_simple where id_producto=900002)<>99 then raise exception 'Rejection release failed';end if;
 -- Existing authenticated ownership is preserved and cannot be bypassed by null.
 insert into auth.users(id) values(buyer);
 token:=repeat('3',64); c:=public.mb_comercio(token,buyer,'variante','{"variante_id":900001,"cantidad":1}');
 begin perform public.mb_checkout_minorista(token,null,body);raise exception 'Owned cart became public';
 exception when raise_exception then if sqlerrm='Owned cart became public' then raise;end if;end;
 o:=public.mb_checkout_minorista(token,buyer,jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro','destinatario',recipient));
 if o->>'usuario_id'<>buyer::text or (o->>'total')::numeric<>9000 then raise exception 'Authenticated transfer regressed';end if;
 update public.pedido set reserva_hasta=now()-interval '1 minute' where id=(o->>'id')::uuid;
 token:=repeat('4',64);c:=public.mb_comercio(token,null,'variante','{"variante_id":900001,"cantidad":1}');
 o:=public.mb_checkout_minorista(token,null,jsonb_build_object('idempotencia',gen_random_uuid(),'pago','mercadopago','envio','retiro','destinatario',recipient));
 update public.pedido set reserva_hasta=now()-interval '1 minute' where id=(o->>'id')::uuid;
 if public.mb_expirar_reservas()<>2 or public.mb_expirar_reservas()<>0 then raise exception 'Guest/auth expiration is not idempotent';end if;
 if (select stock from public.producto_simple where id_producto=900002)<>99 then raise exception 'Expired reservations leaked stock';end if;
 if exists(select 1 from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname='private' and r.relname in ('order_access','order_email_event','order_dispatch') and not r.relrowsecurity)
 or has_function_privilege('anon','public.mb_read_order_link(uuid,text)','EXECUTE')
 or has_function_privilege('authenticated','public.mb_checkout_minorista(text,uuid,jsonb)','EXECUTE') then raise exception 'Privileges exposed';end if;
 raise notice 'PASS guest/auth, shipping, identity, reservations, replay, cancellation, email events, private links, expiry/revocation and privileges';
end $$;
rollback;
