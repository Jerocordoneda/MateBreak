-- Dedicated fixtures, no real inventory changes. Execute as postgres; rolls back.
begin;
insert into auth.users(id) values ('b4f51139-d697-427a-a742-8cb41591ea01'),('b4f51139-d697-427a-a742-8cb41591ea02');
insert into private.equipo_inventario(usuario_id) values('b4f51139-d697-427a-a742-8cb41591ea01');
insert into public.producto(id_producto,nombre,precio,tipo) overriding system value values(-902001,'TEST inventory',100,'simple');
insert into public.producto_simple(id_producto,material,stock) values(-902001,'TEST',10);
insert into private.inventario_ficha(producto_id,sku) values(-902001,'TEST-INVENTORY-ROLLBACK');
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
set local role service_role;
do $$ declare u uuid:='b4f51139-d697-427a-a742-8cb41591ea01'; c uuid:='b4f51139-d697-427a-a742-8cb41591ea02'; a jsonb; replay jsonb; payload jsonb; o jsonb; n integer; payment uuid; begin
 if public.mb_inventario_autorizado(c) or public.mb_inventario_autorizado(null) then raise exception 'FAIL authorization'; end if;
 if not exists(select 1 from jsonb_array_elements(public.mb_inventario(u,'listar')) x where x->>'sku'='TEST-INVENTORY-ROLLBACK' and x->>'fisico'='10') then raise exception 'FAIL listing'; end if;
 begin
  perform public.mb_inventario(c,'listar');
  raise exception 'FAIL customer inventory access';
 exception when insufficient_privilege then null; end;
 if has_table_privilege(current_user,'private.equipo_inventario','insert') or has_table_privilege(current_user,'private.inventario_ajuste','delete') or has_table_privilege(current_user,'private.inventario_ajuste','update') then raise exception 'FAIL overprivileged service'; end if;
 payload:=jsonb_build_object('producto_id',-902001,'tipo','ingreso','cantidad',2,'motivo','TEST receive','idempotencia',gen_random_uuid(),'disponible_esperado',10,'reservado_esperado',0);
 a:=public.mb_inventario(u,'ajustar',payload); replay:=public.mb_inventario(u,'ajustar',payload);
 if a->>'id'<>replay->>'id' or (a->>'disponible_nuevo')::int<>12 then raise exception 'FAIL adjustment replay'; end if;
 begin
  perform public.mb_inventario(u,'ajustar',payload||'{"cantidad":3}'); raise exception using errcode='P0002',message='FAIL altered replay';
 exception when sqlstate 'P0001' then if sqlerrm<>'Esta operacion ya se uso para otro ajuste' then raise; end if; end;
 begin
  perform public.mb_inventario(u,'ajustar',payload||jsonb_build_object('idempotencia',gen_random_uuid())); raise exception using errcode='P0002',message='FAIL stale update';
 exception when sqlstate 'P0001' then if sqlerrm<>'El stock cambio. Actualiza el inventario antes de guardar' then raise; end if; end;
 perform public.mb_comercio(repeat('c',64),c,'cantidad','{"producto_id":-902001,"cantidad":3}');
 o:=public.mb_comercio(repeat('c',64),c,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 if private.inventario_reservado(-902001)<>3 then raise exception 'FAIL reserved'; end if;
 select stock into n from public.producto_simple where id_producto=-902001;
 if n<>9 then raise exception 'FAIL checkout stock'; end if;
 payload:=jsonb_build_object('producto_id',-902001,'tipo','conteo','cantidad',2,'motivo','TEST physical count','idempotencia',gen_random_uuid(),'disponible_esperado',9,'reservado_esperado',3);
 begin
  perform public.mb_inventario(u,'ajustar',payload); raise exception using errcode='P0002',message='FAIL recount below reserved';
 exception when sqlstate 'P0001' then if sqlerrm<>'No podes descontar las unidades reservadas para pedidos' then raise; end if; end;
 a:=public.mb_inventario(u,'ajustar',payload||'{"cantidad":11}');
 if (a->>'disponible_nuevo')::int<>8 or (select aproximado from private.inventario_ficha where producto_id=-902001) then raise exception 'FAIL physical count'; end if;
 perform public.mb_comercio(repeat('c',64),c,'cancelar',jsonb_build_object('id',o->>'id'));
 if private.inventario_reservado(-902001)<>0 or (select stock from public.producto_simple where id_producto=-902001)<>11 then raise exception 'FAIL cancellation stock'; end if;
 payload:=jsonb_build_object('producto_id',-902001,'tipo','egreso','cantidad',11,'motivo','TEST withdraw','idempotencia',gen_random_uuid(),'disponible_esperado',11,'reservado_esperado',0);
 a:=public.mb_inventario(u,'ajustar',payload);
 if (a->>'disponible_nuevo')::int<>0 then raise exception 'FAIL zero stock'; end if;
 perform public.mb_inventario(u,'configurar','{"producto_id":-902001,"abastecimiento":"a_pedido","minimo":5,"notas":"TEST notes"}');
 if not exists(select 1 from private.inventario_ficha where producto_id=-902001 and minimo=5 and abastecimiento='a_pedido') then raise exception 'FAIL configure'; end if;
 if jsonb_array_length(public.mb_inventario(u,'historial','{"producto_id":-902001}'))<>5 then raise exception 'FAIL audit history'; end if;
 perform public.mb_inventario(u,'ajustar',jsonb_build_object('producto_id',-902001,'tipo','ingreso','cantidad',4,'motivo','TEST receive','idempotencia',gen_random_uuid(),'disponible_esperado',0,'reservado_esperado',0));
 perform public.mb_comercio(repeat('d',64),c,'cantidad','{"producto_id":-902001,"cantidad":1}');
 o:=public.mb_comercio(repeat('d',64),c,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 select id into payment from public.pago where pedido_id=(o->>'id')::uuid;
 perform public.mb_confirmar_pago(payment,'TEST-inventory-paid',100,'ARS');
 if private.inventario_reservado(-902001)<>1 then raise exception 'FAIL paid reservation'; end if;
 perform public.mb_actualizar_envio((o->>'id')::uuid,'preparando');
 if private.inventario_reservado(-902001)<>1 then raise exception 'FAIL preparing reservation'; end if;
 perform public.mb_actualizar_envio((o->>'id')::uuid,'enviado','TEST','TEST');
 if private.inventario_reservado(-902001)<>0 or (select stock from public.producto_simple where id_producto=-902001)<>3 then raise exception 'FAIL shipped physical stock'; end if;
end $$;
reset role;
update private.equipo_inventario set activo=false where usuario_id='b4f51139-d697-427a-a742-8cb41591ea01';
set local role service_role;
do $$ begin
 begin perform public.mb_inventario('b4f51139-d697-427a-a742-8cb41591ea01','listar'); raise exception 'FAIL revoked access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 if has_schema_privilege(current_user,'private','usage') or has_table_privilege(current_user,'public.producto_simple','select') or has_function_privilege(current_user,'public.mb_inventario(uuid,text,jsonb)','execute') or has_function_privilege(current_user,'public.mb_inventario_autorizado(uuid)','execute') then raise exception 'FAIL public access'; end if;
end $$;
reset role;
rollback;
select 'PASS: permissions, replay, stale updates, reserved counts, zero stock, audit, cancellation, shipping, revocation' as resultado;
