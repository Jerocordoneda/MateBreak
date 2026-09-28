-- Run in SQL Editor as postgres. Everything is rolled back, including fixtures.
begin;
insert into auth.users(id) values ('a3f51139-d697-427a-a742-8cb41591ea01'),('a3f51139-d697-427a-a742-8cb41591ea02');
insert into public.producto(id_producto,nombre,precio,tipo) overriding system value values (-901001,'TEST simple',100,'simple'),(-901002,'TEST combo',150,'combo');
insert into public.producto_simple(id_producto,material,stock) values(-901001,'TEST',10);
insert into public.combo(id_producto) values(-901002);
insert into public.combo_item values(-901002,-901001,2);
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
set local role service_role;
do $$
declare u uuid:='a3f51139-d697-427a-a742-8cb41591ea01'; k uuid:=gen_random_uuid(); o jsonb; again jsonb; n integer; g uuid;
begin
 perform public.mb_comercio(repeat('a',64),null,'cantidad','{"producto_id":-901001,"cantidad":1}');
 perform public.mb_comercio(repeat('a',64),u,'vincular');
 perform public.mb_comercio(repeat('a',64),u,'cantidad','{"producto_id":-901002,"cantidad":2}');
 o:=public.mb_comercio(repeat('a',64),u,'checkout',jsonb_build_object('idempotencia',k,'pago','transferencia','envio','retiro'));
 if (o->>'total')::numeric<>400 then raise exception 'FAIL total'; end if;
 select stock into n from public.producto_simple where id_producto=-901001;
 if n<>5 then raise exception 'FAIL combo shared stock'; end if;
 again:=public.mb_comercio(repeat('a',64),u,'checkout',jsonb_build_object('idempotencia',k,'pago','transferencia','envio','retiro'));
 if again->>'id'<>o->>'id' then raise exception 'FAIL idempotency'; end if;
 perform public.mb_comercio(repeat('b',64),u,'cantidad','{"producto_id":-901002,"cantidad":3}');
 begin
  perform public.mb_comercio(repeat('b',64),u,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
  raise exception using errcode='P0002',message='FAIL oversell accepted';
 exception when sqlstate 'P0001' then
  if sqlerrm not like 'Stock insuficiente%' then raise; end if;
 end;
 select stock into n from public.producto_simple where id_producto=-901001;
 if n<>5 then raise exception 'FAIL rollback'; end if;
 perform public.mb_comercio(repeat('a',64),u,'cancelar',jsonb_build_object('id',o->>'id'));
 perform public.mb_comercio(repeat('a',64),u,'cancelar',jsonb_build_object('id',o->>'id'));
 select stock into n from public.producto_simple where id_producto=-901001;
 if n<>10 then raise exception 'FAIL cancel restore'; end if;
 o:=public.mb_comercio(repeat('b',64),u,'checkout',jsonb_build_object('idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro'));
 select id into g from public.pago where pedido_id=(o->>'id')::uuid;
 begin
  perform public.mb_confirmar_pago(g,'test-ref',1,'UYU');
  raise exception using errcode='P0002',message='FAIL invalid payment';
 exception when sqlstate 'P0001' then if sqlerrm<>'Pago no coincide' then raise; end if; end;
 perform public.mb_confirmar_pago(g,'test-ref',450,'UYU');
 perform public.mb_confirmar_pago(g,'test-ref',450,'UYU');
 perform public.mb_actualizar_envio((o->>'id')::uuid,'preparando');
 perform public.mb_actualizar_envio((o->>'id')::uuid,'enviado','TEST','TEST-123');
 perform public.mb_actualizar_envio((o->>'id')::uuid,'entregado');
 if not exists(select 1 from public.pedido where id=(o->>'id')::uuid and estado='entregado') then raise exception 'FAIL shipment'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a3f51139-d697-427a-a742-8cb41591ea02',true);
do $$ begin
 if exists(select 1 from public.pedido) then raise exception 'FAIL RLS isolation'; end if;
 if has_function_privilege(current_user,'public.mb_comercio(text,uuid,text,jsonb)','execute') then raise exception 'FAIL customer RPC access'; end if;
end $$;
reset role;
rollback;
select 'PASS: combo stock, checkout retry, oversell rollback, cancel retry, payment validation, shipping, RLS' as resultado;
