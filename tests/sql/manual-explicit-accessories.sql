-- Isolated fixture only. All accessory and legacy-reservation checks roll back.
begin;
do $$
declare seller uuid:='44444444-4444-4444-8444-444444444444';box_id bigint;before_mate integer;before_box integer;v jsonb;body jsonb;key uuid:=gen_random_uuid();
begin
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 select stock into before_mate from public.producto_simple where id_producto=990001;
 select stock into before_box from public.producto_simple where id_producto=box_id;
 -- A mate sale must succeed even when there are no boxes.
 update public.producto_simple set stock=0 where id_producto=box_id;
 body:=jsonb_build_object('idempotencia',key,'cliente','Sin accesorios','telefono','','notas','','estado','por_entregar','metodo_pago','efectivo','items',jsonb_build_array(jsonb_build_object('producto_id','990001','cantidad',1,'precio_unitario','10000','personalizacion','')));
 v:=public.mb_ventas(seller,'registrar',body);
 if (select stock from public.producto_simple where id_producto=box_id)<>0 or exists(select 1 from private.venta_manual_empaque where venta_id=(v->>'id')::uuid)then raise exception 'Implicit box reservation';end if;
 perform public.mb_ventas(seller,'estado',jsonb_build_object('id',v->>'id','estado','entregada'));
 if (select stock from public.producto_simple where id_producto=box_id)<>0 then raise exception 'Implicit box consumption';end if;
 -- Accessories are ordinary lines: their stock reserves once and delivery
 -- consumes the reservation without a second availability deduction.
 insert into public.producto(id_producto,nombre,precio,tipo,moneda) overriding system value values(990003,'Bombilla fixture',100,'simple','ARS');
 insert into public.producto_simple(id_producto,stock,categoria)values(990003,5,'Accesorios');
 insert into private.inventario_ficha(producto_id,sku)values(990003,'EXPLICIT-BOMBILLA');
 update public.producto_simple set stock=5 where id_producto=box_id;
 body:=body||jsonb_build_object('idempotencia',gen_random_uuid(),'cliente','Con accesorios','items',jsonb_build_array(jsonb_build_object('producto_id','990001','cantidad',1,'precio_unitario','10000','personalizacion',''),jsonb_build_object('producto_id',box_id::text,'cantidad',2,'precio_unitario','100','personalizacion',''),jsonb_build_object('producto_id','990003','cantidad',1,'precio_unitario','100','personalizacion','')));
 v:=public.mb_ventas(seller,'registrar',body);perform public.mb_ventas(seller,'registrar',body);
 if (select stock from public.producto_simple where id_producto=box_id)<>3 or private.inventario_reservado(box_id)<>2 or (select stock from public.producto_simple where id_producto=990003)<>4 or private.inventario_reservado(990003)<>1 then raise exception 'Explicit accessory stock/replay';end if;
 if exists(select 1 from private.venta_manual_empaque where venta_id=(v->>'id')::uuid)then raise exception 'Explicit accessories also created implicit packaging';end if;
 perform public.mb_ventas(seller,'estado',jsonb_build_object('id',v->>'id','estado','entregada'));
 if (select stock from public.producto_simple where id_producto=box_id)<>3 or private.inventario_reservado(box_id)<>0 or private.inventario_reservado(990003)<>0 then raise exception 'Double accessory deduction on delivery';end if;
 -- Reservations already created before this policy keep their delivery audit.
 body:=body||jsonb_build_object('idempotencia',gen_random_uuid(),'cliente','Reserva histórica','items',jsonb_build_array(jsonb_build_object('producto_id','990001','cantidad',1,'precio_unitario','10000','personalizacion','')));
 v:=public.mb_ventas(seller,'registrar',body);
 update public.producto_simple set stock=stock-1 where id_producto=box_id;
 insert into private.venta_manual_empaque(venta_id,linea,producto_id,cantidad)values((v->>'id')::uuid,1,box_id,1);
 perform public.mb_ventas(seller,'estado',jsonb_build_object('id',v->>'id','estado','entregada'));
 if (select stock from public.producto_simple where id_producto=box_id)<>2 or private.inventario_reservado(box_id)<>0 then raise exception 'Legacy box reservation broken';end if;
end $$;
rollback;
