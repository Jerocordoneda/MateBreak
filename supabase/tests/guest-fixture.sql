-- Synthetic data, exclusively in the owned disposable test database.
insert into public.producto(id_producto,nombre,precio,tipo,moneda,slug) overriding system value values
(900001,'Mate sintético local',10000,'simple','ARS','mate-sintetico-local'),(900002,'Componente ficticio',1,'simple','ARS','componente-local'),(900003,'Caja ficticia',1,'simple','ARS','caja-local');
insert into public.producto_simple(id_producto,stock,categoria) values(900002,100,'Mates'),(900003,100,'Accesorios');
insert into private.inventario_ficha(producto_id,sku) values(900002,'GUEST-FIX-MATE'),(900003,'GUEST-FIX-BOX');
insert into public.catalogo_producto(producto_id,publicado,extraido_en,atributos) values(900001,true,now(),'{"personalizable_explicitamente":true}');
insert into public.catalogo_variante(id,producto_id,external_id,opciones,precio,disponible) overriding system value values(900001,900001,'guest-fixture','{"BOMBILLA ACERO INOX":"NO"}',10000,true);
insert into public.catalogo_variante_mapeo(variante_id,aprobado) values(900001,true);
-- Use the real packaging rule in the synthetic fixture: the trigger adds
-- MB-CAJA-MATE once. The legacy fixture box remains for legacy combo tests.
update public.producto_simple set stock=100 where id_producto=(select producto_id from private.inventario_ficha where sku='MB-CAJA-MATE');
insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia) values(900001,900002,1,'Local fixture only');
insert into public.catalogo_opcion(producto_id,posicion,nombre,valores) values(900001,1,'BOMBILLA ACERO INOX','["NO","SI"]');
insert into public.catalogo_promocion(producto_id,texto) values(900001,'20% OFF Comprando 2 o más');
-- A fresh migration replay does not import the remote catalog's categories.
-- Make the promotional prerequisite explicit in this synthetic fixture.
insert into public.catalogo_categoria(nombre,slug,source_url) values('Mates fixture','mates-grabados','https://fixture.invalid/mates') on conflict(slug) do nothing;
insert into public.catalogo_producto_categoria(producto_id,categoria_id) select 900001,id from public.catalogo_categoria where slug='mates-grabados';
update public.metodo_pago set activo=true where codigo in ('mercadopago','transferencia');
update public.metodo_envio set activo=true where codigo in ('retiro','correo_domicilio');
