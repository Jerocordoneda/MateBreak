-- Run ONLY on a newly created staging database after explicit target approval.
-- No production queries/data/credentials. Not a migration and never auto-applied.
begin;
do $$
declare product_id bigint; variant_id bigint;
begin
 if current_setting('matebreak.environment',true) is distinct from 'staging' then raise exception 'Staging only'; end if;
 if exists(select 1 from auth.users) or exists(select 1 from public.pedido) or exists(select 1 from private.venta_manual)
 then raise exception 'Fixture setup requires a pristine project without accounts/orders/sales'; end if;
 select cv.id,cv.producto_id into variant_id,product_id
 from public.catalogo_variante cv join public.catalogo_variante_mapeo map on map.variante_id=cv.id and map.aprobado
 join public.producto p on p.id_producto=cv.producto_id
 where p.tipo='simple' and exists(select 1 from public.catalogo_producto_categoria pc join public.catalogo_categoria c on c.id=pc.categoria_id
 where pc.producto_id=p.id_producto and (c.slug='mates' or c.slug like 'mates-%')) order by cv.id limit 1;
 if variant_id is null then raise exception 'Baseline lacks an approved mate variant'; end if;
 update public.catalogo_producto set publicado=false;
 update public.producto set activo=false;
 update public.producto_simple set stock=0;
 update public.catalogo_variante set vigente=false;
 update public.catalogo_imagen set vigente=false;
 update public.producto set nombre='STAGING Mate sintético',descripcion='Artículo ficticio para pruebas sin venta real',
 slug='staging-mate-sintetico',source_url='https://staging.example.invalid/producto',precio=10000,activo=true where id_producto=product_id;
 update public.catalogo_producto set publicado=true,disponible=true,descripcion_origen='Fixture sintético',
 precio_original=10000,precio_transferencia=9000,atributos='{}',personalizacion=null,cuotas='{}' where producto_id=product_id;
 update public.catalogo_variante set vigente=true,disponible=true,precio=10000,precio_original=10000,precio_transferencia=9000,
 opciones='{"modelo":"Fixture"}',imagen_origen=null where id=variant_id;
 update public.producto_simple set stock=100 where id_producto in
 (select producto_simple_id from public.catalogo_variante_componente where variante_id=variant_id)
 or id_producto in(select producto_id from private.inventario_ficha where sku='MB-CAJA-MATE');
 update public.metodo_pago set activo=(codigo='mercadopago');
 update public.metodo_envio set activo=(codigo in ('retiro','correo_domicilio'));
end $$;
commit;
