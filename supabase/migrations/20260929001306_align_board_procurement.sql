-- The product is already documented as made on demand; its remote mode was
-- left as stock. Preserve quantity zero and all prior movements.
update private.inventario_ficha set abastecimiento='a_pedido',actualizado_en=now()
where sku='MB-TABLA' and abastecimiento='stock' and notas like 'Se solicita al carpintero.%';
