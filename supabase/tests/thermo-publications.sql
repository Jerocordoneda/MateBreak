-- All writes in this regression check are rolled back.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare buyer uuid; silver_id bigint; black_id bigint; silver_variant bigint; black_variant bigint;
 token text; ordered jsonb;
begin
 select id into buyer from auth.users order by created_at limit 1;
 if buyer is null then raise exception 'Falta un usuario para la prueba'; end if;
 select producto_id into silver_id from private.inventario_ficha where sku='MB-TER-PLA';
 select producto_id into black_id from private.inventario_ficha where sku='MB-TER-NEG';
 if (select count(*) from public.catalogo_variante_componente c
  join public.catalogo_variante cv on cv.id=c.variante_id
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre like 'TERMO%' and p.nombre not in ('TERMO MEDIA MANIJA PLATEADO','TERMO PREMIUM NEGRO 1L')
   and c.producto_simple_id=silver_id and c.requiere_grabado)<>15
  or (select count(*) from public.catalogo_variante_componente c
  join public.catalogo_variante cv on cv.id=c.variante_id
  join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='TERMO PREMIUM MUNDIAL' and c.producto_simple_id=black_id and c.requiere_grabado)<>1
  then raise exception 'El color de las 16 publicaciones individuales no coincide'; end if;
 if exists(select 1 from public.catalogo_variante_mapeo m
  join public.catalogo_variante cv on cv.id=m.variante_id
  join public.producto p on p.id_producto=cv.producto_id
  where m.aprobado and (p.nombre like 'SET MATERO%' or p.nombre like 'SET PREMIUM%'))
  then raise exception 'Un set con caja sin SKU fue aprobado'; end if;

 select cv.id into silver_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id where p.nombre='TERMO DE BELGRANO';
 select cv.id into black_variant from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id where p.nombre='TERMO PREMIUM MUNDIAL';
 token:=md5(random()::text)||md5(random()::text);
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',silver_variant,'cantidad',1));
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',black_variant,'cantidad',1));
 ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=silver_id)<>1
  or (select cantidad from public.pedido_stock where pedido_id=(ordered->>'id')::uuid and producto_simple_id=black_id)<>1
  or (select count(*) from public.pedido_preparacion where pedido_id=(ordered->>'id')::uuid)<>2
  then raise exception 'Checkout no separó termos físicos ni trabajos de grabado'; end if;
end $$;
rollback;
