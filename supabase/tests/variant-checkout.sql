-- Ejecutar en SQL Editor. Toda venta y cambio de stock se revierte.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare u uuid; c uuid; token text:=md5(random()::text)||md5(random()::text);
 first_variant bigint; second_variant bigint; unmapped bigint; combo_variant bigint; physical bigint; second_physical bigint;
 initial_stock integer; amount numeric; expected numeric; order_one jsonb; order_again jsonb;
 key uuid:=gen_random_uuid(); quote jsonb; result jsonb;
begin
 select id into u from auth.users order by created_at limit 1;
 if u is null then raise exception 'Se requiere un usuario de prueba'; end if;
 select a.variante_id,b.variante_id into first_variant,second_variant
 from public.catalogo_variante_mapeo a
 join public.catalogo_variante va on va.id=a.variante_id
 join public.catalogo_variante_mapeo b on b.variante_id>a.variante_id
 join public.catalogo_variante vb on vb.id=b.variante_id and vb.producto_id=va.producto_id
 where a.aprobado and b.aprobado and exists(select 1 from public.catalogo_promocion promo where promo.producto_id=va.producto_id and promo.texto='20% OFF Comprando 2 o más') limit 1;
 if first_variant is null then raise exception 'Faltan dos variantes aprobadas del mismo producto'; end if;
 select producto_simple_id into physical from public.catalogo_variante_componente where variante_id=first_variant;
 select stock into initial_stock from public.producto_simple where id_producto=physical;
 insert into public.carrito(token_hash,usuario_id) values(token,u) returning id into c;
 result:=public.mb_comercio(token,u,'variante',jsonb_build_object('variante_id',first_variant,'cantidad',1,'precio',1,'personalizacion','Grabado de prueba'));
 result:=public.mb_comercio(token,u,'variante',jsonb_build_object('variante_id',second_variant,'cantidad',1,'precio',1));
 quote:=public.mb_cotizar_catalogo(c,'transferencia');
 expected:=(quote->>'subtotal')::numeric;
 if expected<=0 or quote->>'moneda'<>'ARS' then raise exception 'Cotización ARS inválida'; end if;
 if jsonb_array_length(quote->'items')<>2 then raise exception 'Faltan líneas de variante'; end if;
 if (quote->'items'->0->>'precio_unitario')::numeric=1 then raise exception 'Precio del cliente aceptado'; end if;
 if public.mb_cantidad_promo(c)=2 and exists(select 1 from public.catalogo_promocion p join public.catalogo_variante v on v.producto_id=p.producto_id where v.id=first_variant and p.texto='20% OFF Comprando 2 o más') then
  if (quote->'items'->0->>'precio_unitario')::numeric<>public.mb_precio_variante(first_variant,'transferencia',2) then raise exception 'Promoción o transferencia mal aplicadas'; end if;
  if public.mb_precio_variante(first_variant,'transferencia',2)>=public.mb_precio_variante(first_variant,'transferencia',1) then raise exception 'No se aplicó promoción por cantidad'; end if;
 end if;
 order_one:=public.mb_comercio(token,u,'checkout',jsonb_build_object('idempotencia',key,'pago','transferencia','envio','retiro'));
 if (order_one->>'subtotal')::numeric<>expected or order_one->>'moneda'<>'ARS' then raise exception 'Total o moneda del pedido incorrectos'; end if;
 if (select count(*) from public.pedido_item where pedido_id=(order_one->>'id')::uuid and variante_id is not null)<>2 then raise exception 'Variantes fusionadas en el pedido'; end if;
 if (select count(*) from public.pedido_item where pedido_id=(order_one->>'id')::uuid and personalizacion='Grabado de prueba')<>1 then raise exception 'Personalización perdida'; end if;
 if (select count(*) from public.pago where pedido_id=(order_one->>'id')::uuid and moneda='ARS' and importe=(order_one->>'total')::numeric)<>1 then raise exception 'Pago ARS incorrecto'; end if;
 if (select stock from public.producto_simple where id_producto=physical)>=initial_stock then raise exception 'Stock no reservado'; end if;
 order_again:=public.mb_comercio(token,u,'checkout',jsonb_build_object('idempotencia',key,'pago','transferencia','envio','retiro'));
 if order_again->>'id'<>order_one->>'id' then raise exception 'Idempotencia falló'; end if;
 if (select count(*) from public.movimiento_stock where pedido_id=(order_one->>'id')::uuid and motivo='reserva')
    <>(select count(*) from public.pedido_stock where pedido_id=(order_one->>'id')::uuid) then raise exception 'Reservas duplicadas'; end if;

 -- Una variante sin relación aprobada puede guardarse, pero no confirmarse.
 select id into unmapped from public.catalogo_variante where id not in (select variante_id from public.catalogo_variante_mapeo) and vigente limit 1;
 token:=md5(random()::text)||md5(random()::text);
 insert into public.carrito(token_hash,usuario_id) values(token,u);
 perform public.mb_comercio(token,u,'variante',jsonb_build_object('variante_id',unmapped,'cantidad',1));
 begin
  perform public.mb_comercio(token,u,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception 'Variante sin mapeo comprada';
 exception when raise_exception then
  if sqlerrm<>'Variante sin relacion de inventario aprobada' then raise; end if;
 end;

 -- Un set de prueba sólo se aprueba dentro del rollback: comprueba la reserva de dos insumos.
 select cv.id into combo_variant from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
 where p.tipo='combo' and cv.vigente and cv.disponible and cv.precio is not null limit 1;
 select f.producto_id into second_physical from private.inventario_ficha f join public.producto_simple s on s.id_producto=f.producto_id
 where f.sku='MB-CUC-INOX' and s.stock>0;
 if combo_variant is null or second_physical is null then raise exception 'Faltan insumos para el set de prueba'; end if;
 insert into public.catalogo_variante_mapeo(variante_id,aprobado,nota) values(combo_variant,true,'Sólo prueba con rollback');
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia)
 values(combo_variant,physical,1,'Sólo prueba con rollback'),(combo_variant,second_physical,2,'Sólo prueba con rollback');
 token:=md5(random()::text)||md5(random()::text);
 insert into public.carrito(token_hash,usuario_id) values(token,u);
 perform public.mb_comercio(token,u,'variante',jsonb_build_object('variante_id',combo_variant,'cantidad',1));
 order_one:=public.mb_comercio(token,u,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if (select count(*) from public.pedido_stock where pedido_id=(order_one->>'id')::uuid)<>2 then raise exception 'Set sin dos reservas'; end if;
 if (select cantidad from public.pedido_stock where pedido_id=(order_one->>'id')::uuid and producto_simple_id=second_physical)<>2 then raise exception 'Cantidad de componente incorrecta'; end if;

 -- El stock agotado impide confirmar una variante previamente aprobada.
 update public.producto_simple set stock=0 where id_producto=physical;
 token:=md5(random()::text)||md5(random()::text);
 insert into public.carrito(token_hash,usuario_id) values(token,u);
 perform public.mb_comercio(token,u,'variante',jsonb_build_object('variante_id',first_variant,'cantidad',1));
 begin
  perform public.mb_comercio(token,u,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception 'Stock agotado vendido';
 exception when raise_exception then
  if sqlerrm<>'Stock insuficiente' then raise; end if;
 end;
end $$;
rollback;
