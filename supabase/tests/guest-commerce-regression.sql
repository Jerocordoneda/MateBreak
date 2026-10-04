begin;
do $$
declare c jsonb; o jsonb; q integer; expected numeric; token text:=repeat('5',64);rec jsonb:='{"nombre":"Ana","apellido":"Local","email":"ana@example.test","telefono":"2494123456","codigo_postal":"7000","provincia":"Buenos Aires","ciudad":"Tandil","calle":"Prueba","numero":"123"}';
begin
 foreach q in array array[1,2,3,4,5,8,10,2,1] loop
  c:=public.mb_comercio(token,null,'variante',jsonb_build_object('variante_id',900001,'cantidad',q));
  expected:=case when q>=3 then q*8000 else q*10000 end;
  if (public.mb_cotizar_catalogo((c->>'id')::uuid,'mercadopago')->>'subtotal')::numeric<>expected then raise exception 'Guest promotional regression for %',q;end if;
 end loop;
 update public.catalogo_variante set precio=12000 where id=900001;
 o:=public.mb_checkout_minorista(token,null,jsonb_build_object('idempotencia',gen_random_uuid(),'pago','mercadopago','envio','retiro','destinatario',rec,'total',1));
 if (o->>'total')::numeric<>12000 then raise exception 'Checkout failed to reprice';end if;
 perform public.mb_cancelar_pedido_servicio((o->>'id')::uuid);
 token:=repeat('6',64);c:=public.mb_comercio(token,null,'variante','{"variante_id":900001,"cantidad":1}');
 update public.producto_simple set stock=0 where id_producto=900002;
 begin
  perform public.mb_checkout_minorista(token,null,jsonb_build_object('idempotencia',gen_random_uuid(),'pago','mercadopago','envio','retiro','destinatario',rec));raise exception 'Stale stock accepted';
 exception when raise_exception then if sqlerrm='Stale stock accepted' then raise;end if;end;
 update public.producto_simple set stock=100 where id_producto=900002;
 insert into public.producto(id_producto,nombre,precio,tipo,moneda) overriding system value values(900004,'Combo legacy local',3000,'combo','ARS');
 insert into public.combo(id_producto) values(900004);
 insert into public.combo_item(id_combo,id_producto_simple,cantidad) values(900004,900002,1),(900004,900003,1);
 token:=repeat('7',64);c:=public.mb_comercio(token,null,'cantidad','{"producto_id":900004,"cantidad":1}');
 o:=public.mb_checkout_minorista(token,null,jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro','destinatario',rec));
 if (o->>'total')::numeric<>2700 or (select precio_unitario from public.pedido_item where pedido_id=(o->>'id')::uuid)<>3000 then raise exception 'Legacy transfer double-discount or unsupported cart: total %, item %',o->>'total',(select precio_unitario from public.pedido_item where pedido_id=(o->>'id')::uuid);end if;
 if (select precio_original from public.pedido_item where pedido_id=(o->>'id')::uuid)<>3000 then raise exception 'Original price snapshot regressed';end if;
 raise notice 'PASS guest promotions 1/2/3/4/5/8/10/2/1, authoritative repricing, changed stock, legacy combo and single transfer discount';
end $$;
rollback;
