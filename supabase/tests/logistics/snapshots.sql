begin;
update public.metodo_pago set activo=true where codigo in ('transferencia','mercadopago');
update public.metodo_envio set activo=true where codigo in ('retiro','correo_domicilio');
do $$
declare buyer uuid; operator_id uuid; variant bigint; t text; cart jsonb; snap jsonb; hash text; quote_id uuid;
 recipient jsonb:='{"nombre":"Fake","apellido":"Buyer","email":"fake@example.test","telefono":"2494123456","codigo_postal":"7000","provincia":"Buenos Aires","ciudad":"Tandil","calle":"Fake","numero":"123","piso":"","departamento":"","referencia":""}';
 data jsonb; order_data jsonb; c1 jsonb; c2 jsonb; stocks jsonb; other_variant bigint; action jsonb; recovery jsonb;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select usuario_id into operator_id from private.equipo_inventario where activo limit 1;
 select cv.id into variant from public.catalogo_variante cv join public.mb_catalogo_disponibilidad() d on d.variante_id=cv.id where d.comprable and d.con_stock and cv.precio>0 order by cv.id limit 1;
 if variant is null then raise exception 'Missing local variant fixture'; end if;
 t:=repeat('d',64);cart:=public.mb_comercio(t,buyer,'variante',jsonb_build_object('variante_id',variant,'cantidad',1));
 snap:=jsonb_build_object('version',1,'environment','mock','deliveryType','D',
  'recipient',jsonb_build_object('name','Fake Buyer','email','fake@example.test'),'address',jsonb_build_object('streetName','Fake','streetNumber','123','city','Tandil','provinceCode','B','postalCode','7000'),
  'cartItems',(select jsonb_agg(jsonb_build_object('variant',cv.variante_id::text,'product',v.producto_id::text,'quantity',cv.cantidad,'personalization',cv.personalizacion) order by cv.variante_id)
    from public.carrito_variante cv join public.catalogo_variante v on v.id=cv.variante_id where cv.carrito_id=(cart->>'id')::uuid),
  'parcels','[{"dimensions":{"weight":1300,"height":20,"width":30,"length":30},"carrierCost":5000},{"dimensions":{"weight":550,"height":17,"width":17,"length":17},"carrierCost":5000}]'::jsonb);
 hash:=public.mb_shipping_fingerprint((cart->>'id')::uuid,snap);
 if hash is null then raise exception 'Fingerprint missing'; end if;
 if hash=public.mb_shipping_fingerprint((cart->>'id')::uuid,jsonb_set(snap,'{parcels,0,dimensions,weight}','1400')) then raise exception 'Parcel change not detected'; end if;
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,proveedor,servicio,costo_transportista,valido_hasta,snapshot,fingerprint)
 values((cart->>'id')::uuid,buyer,recipient,'correo_domicilio','correo_argentino','CP',10000,now()+interval '10 minutes',snap,hash) returning id into quote_id;
 data:=jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','correo_domicilio','cotizacion_id',quote_id,'destinatario',recipient);
 -- Fingerprint rejects changed quantities and different variants via live canonical state.
 update public.carrito_variante set cantidad=2 where carrito_id=(cart->>'id')::uuid;
 begin
  perform public.mb_checkout_minorista(t,buyer,data);raise exception 'ASSERT quantity accepted';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 update public.carrito_variante set cantidad=1 where carrito_id=(cart->>'id')::uuid;
 select id into other_variant from public.catalogo_variante where id<>variant limit 1;
 update public.carrito_variante set variante_id=other_variant where carrito_id=(cart->>'id')::uuid;
 if public.mb_shipping_fingerprint((cart->>'id')::uuid,snap) is not null then raise exception 'Variant change not detected'; end if;
 update public.carrito_variante set variante_id=variant where carrito_id=(cart->>'id')::uuid;
 begin
  perform public.mb_checkout_minorista(t,gen_random_uuid(),data);raise exception 'ASSERT other user accepted';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 begin
  update public.checkout_cotizacion_envio set valido_hasta=now() where id=quote_id;raise exception 'ASSERT quote mutation accepted';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 -- Expired otherwise-identical quote must fail without reservation.
 insert into public.checkout_cotizacion_envio(carrito_id,usuario_id,destinatario,modalidad,proveedor,servicio,costo_transportista,valido_hasta,snapshot,fingerprint)
 values((cart->>'id')::uuid,buyer,recipient,'correo_domicilio','correo_argentino','CP',10000,now()-interval '1 second',snap,hash);
 begin
  perform public.mb_checkout_minorista(t,buyer,jsonb_set(data,'{cotizacion_id}',to_jsonb((select id::text from public.checkout_cotizacion_envio where carrito_id=(cart->>'id')::uuid and valido_hasta<now() limit 1))));
  raise exception 'ASSERT expired quote accepted';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 order_data:=public.mb_checkout_minorista(t,buyer,data);
 if order_data->>'cotizacion_envio_id'<>quote_id::text then raise exception 'Missing quote relation'; end if;
 if public.mb_claim_shipment('mock') is not null then raise exception 'Unpaid import accepted'; end if;
 if (select estado_integracion from public.envio where pedido_id=(order_data->>'id')::uuid)<>'esperando_pago' then raise exception 'Unpaid state'; end if;
 perform public.mb_confirmar_transferencia(operator_id,(order_data->>'id')::uuid,'TEST-LOGISTICS');
 select jsonb_agg(jsonb_build_object('id',id_producto,'stock',stock) order by id_producto) into stocks from public.producto_simple;
 c1:=public.mb_claim_shipment('mock');c2:=public.mb_claim_shipment('mock');
 if c1 is null or c2 is null or c1->>'extOrderId'=c2->>'extOrderId' then raise exception 'Multi-parcel claim invalid'; end if;
 if public.mb_claim_shipment('mock') is not null then raise exception 'Duplicate claim'; end if;
 perform public.mb_finish_shipment((c1->>'claimId')::uuid,'{"state":"importado","createdAt":"2026-09-30 12:00:00"}');
 perform public.mb_finish_shipment((c2->>'claimId')::uuid,'{"state":"revision","errorType":"ambiguous"}');
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'pagado' then raise exception 'Logistics changed paid status'; end if;
 if (select estado_integracion from public.envio where pedido_id=(order_data->>'id')::uuid)<>'revision' then raise exception 'Missing review'; end if;
 if stocks is distinct from (select jsonb_agg(jsonb_build_object('id',id_producto,'stock',stock) order by id_producto) from public.producto_simple) then raise exception 'Logistics changed stock'; end if;
 if public.mb_claim_shipment('mock') is not null then raise exception 'Ambiguous claim retried'; end if;
 if (select sum((p->>'declaredValue')::numeric) from public.envio e cross join lateral jsonb_array_elements(e.snapshot->'parcels') p where e.pedido_id=(order_data->>'id')::uuid)<>(order_data->>'subtotal')::numeric then raise exception 'Declared value allocation'; end if;
 begin
  update public.envio set snapshot='{}' where pedido_id=(order_data->>'id')::uuid;raise exception 'ASSERT snapshot mutable';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 begin
  update public.pedido set cotizacion_envio_id=null where id=(order_data->>'id')::uuid;raise exception 'ASSERT quote relation mutable';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 if (public.mb_checkout_minorista(t,buyer,data)->>'id')<>order_data->>'id' then raise exception 'Checkout retry changed order'; end if;
 -- Administrative recovery cannot guess provider outcomes or duplicate imports.
 action:=jsonb_build_object('orderId',order_data->>'id','parcelNumber',c2->'parcelNumber','actionId',gen_random_uuid(),
  'expectedState','revision','expectedAttempts',1,'expectedClaimId',c2->>'claimId','verification','unresolved');
 -- claim payload uses bulto (the immutable parcel ordinal), resolved from storage.
 action:=jsonb_set(action,'{parcelNumber}',to_jsonb((select bulto from private.envio_bulto where claim_id=(c2->>'claimId')::uuid)));
 begin
  perform public.mb_logistics_admin('00000000-0000-4000-8000-00000000c002','list');raise exception 'ASSERT seller admin';
 exception when insufficient_privilege then null;end;
 perform public.mb_logistics_admin(operator_id,'keep_review',action);
 perform public.mb_logistics_admin(operator_id,'keep_review',action);
 if jsonb_array_length(public.mb_logistics_admin(operator_id,'history',action))<>1 then raise exception 'Duplicate action audit'; end if;
 action:=action||jsonb_build_object('actionId',gen_random_uuid(),'verification','absent','source','portal','reference','LOCAL-ABSENT');
 begin
  perform public.mb_logistics_admin(operator_id,'safe_retry',action);raise exception 'ASSERT unverified retry';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 action:=action||'{"confirmed":true}'::jsonb;
 perform public.mb_logistics_admin(operator_id,'safe_retry',action);
 recovery:=public.mb_claim_shipment('mock');
 if recovery->>'extOrderId'<>c2->>'extOrderId' then raise exception 'Retry reference changed'; end if;
 action:=action||jsonb_build_object('actionId',gen_random_uuid(),'expectedState','procesando','expectedAttempts',2,'expectedClaimId',recovery->>'claimId','verification','unresolved','source',null,'reference',null);
 begin
  perform public.mb_logistics_admin(operator_id,'keep_review',action);raise exception 'ASSERT active claim intervention';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 update private.envio_bulto set iniciado_en=clock_timestamp()-interval '3 minutes' where claim_id=(recovery->>'claimId')::uuid;
 perform public.mb_logistics_admin(operator_id,'keep_review',action);
 begin
  perform public.mb_finish_shipment((recovery->>'claimId')::uuid,'{"state":"importado","createdAt":"2026-10-01T12:00:00Z"}');raise exception 'ASSERT stale worker finish';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 action:=action||jsonb_build_object('actionId',gen_random_uuid(),'expectedState','revision','verification','absent','source','support','reference','LOCAL-ABSENT-2');
 perform public.mb_logistics_admin(operator_id,'safe_retry',action);
 recovery:=public.mb_claim_shipment('mock');
 perform public.mb_finish_shipment((recovery->>'claimId')::uuid,'{"state":"revision","errorType":"ambiguous"}');
 action:=action||jsonb_build_object('actionId',gen_random_uuid(),'expectedAttempts',3,'expectedClaimId',recovery->>'claimId');
 begin
  perform public.mb_logistics_admin(operator_id,'safe_retry',action);raise exception 'ASSERT exhausted retry';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 action:=action||'{"verification":"exists","createdAt":"infinity"}'::jsonb;
 begin
  perform public.mb_logistics_admin(operator_id,'verified_import',action);raise exception 'ASSERT infinite provider date';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 action:=action||'{"createdAt":"2026-10-01T12:00:00Z"}'::jsonb;
 perform public.mb_logistics_admin(operator_id,'verified_import',action);
 if (select estado_integracion from public.envio where pedido_id=(order_data->>'id')::uuid)<>'importado' then raise exception 'Manual aggregate incorrect'; end if;
 if jsonb_array_length(public.mb_logistics_admin(operator_id,'history',action))<>5 then raise exception 'Audit action count'; end if;
 begin
  update private.envio_accion_admin set referencia='changed' where pedido_id=(order_data->>'id')::uuid;raise exception 'ASSERT mutable audit';
 exception when raise_exception then if SQLERRM like 'ASSERT%' then raise; end if;end;
 if stocks is distinct from (select jsonb_agg(jsonb_build_object('id',id_producto,'stock',stock) order by id_producto) from public.producto_simple) then raise exception 'Admin changed stock'; end if;
 if (select estado from public.pedido where id=(order_data->>'id')::uuid)<>'pagado' then raise exception 'Admin changed financial status'; end if;
end $$;
rollback;
