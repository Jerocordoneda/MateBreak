-- Synthetic local-only actors; inserted inside each historical test transaction.
insert into auth.users(id,created_at) values
 ('00000000-0000-4000-8000-00000000c001','2000-01-01'),
 ('00000000-0000-4000-8000-00000000c002','2000-01-02');
insert into private.equipo_inventario(usuario_id) values ('00000000-0000-4000-8000-00000000c001');
insert into private.equipo_vendedores(usuario_id) values ('00000000-0000-4000-8000-00000000c002');
-- Test availability only; never presume these quantities in the reconstructed DB.
-- Individual scenarios still override stock to exercise shortages/receipts.
update public.producto_simple set stock=100
where id_producto in (select producto_id from private.inventario_ficha
 where sku in ('MB-BOM-PICO-LORO','MB-FUNDA-CUCHILLO','MB-CAJA-MATE'));
