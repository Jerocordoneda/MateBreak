-- Ejecutar en SQL Editor. Comprueba una variante reconciliada y revierte todo.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare user_id uuid; token text:=md5(random()::text)||md5(random()::text);
 variant_id bigint; physical_id bigint; stock_before integer; cart jsonb; checkout jsonb;
begin
 select id into user_id from auth.users order by created_at limit 1;
 select m.variante_id into variant_id from public.catalogo_variante_mapeo m
 where m.nota='Camionero de algarrobo explícito, sin bombilla; base física MB-CAM-ALG' order by m.variante_id limit 1;
 select producto_id into physical_id from private.inventario_ficha where sku='MB-CAM-ALG';
 if user_id is null or variant_id is null or physical_id is null then raise exception 'Falta usuario, variante o SKU de prueba'; end if;
 select stock into stock_before from public.producto_simple where id_producto=physical_id;
 cart:=public.mb_comercio(token,user_id,'variante',jsonb_build_object('variante_id',variant_id,'cantidad',2,'precio',1));
 if cart->>'moneda'<>'ARS' or (cart->>'total')::numeric<=2 or (cart->>'requiere_confirmacion_catalogo')::boolean then
  raise exception 'Carrito reconciliado o precio incorrecto';
 end if;
 checkout:=public.mb_comercio(token,user_id,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if checkout->>'estado'<>'pendiente_pago' or checkout->>'moneda'<>'ARS' then raise exception 'Pedido incorrecto'; end if;
 if (select count(*) from public.pedido_item where pedido_id=(checkout->>'id')::uuid and variante_id=variant_id and cantidad=2)<>1 then
  raise exception 'Línea de variante incorrecta';
 end if;
 if (select count(*) from public.pedido_stock where pedido_id=(checkout->>'id')::uuid and producto_simple_id=physical_id and cantidad=2)<>1
  or (select count(*) from public.pedido_stock where pedido_id=(checkout->>'id')::uuid)<>1 then raise exception 'SKU reservado incorrecto'; end if;
 if (select stock from public.producto_simple where id_producto=physical_id)<>stock_before-2 then raise exception 'Stock no descontado'; end if;
end $$;
rollback;
