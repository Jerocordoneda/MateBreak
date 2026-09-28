begin;
insert into auth.users(id,raw_user_meta_data) values
 ('e025ece7-50da-4e12-8135-1e4ef27ac001','{}'),
 ('e025ece7-50da-4e12-8135-1e4ef27ac002','{"role":"administrador","rol":"vendedor"}');
insert into private.equipo_inventario(usuario_id) values('e025ece7-50da-4e12-8135-1e4ef27ac001');
set local role service_role;
do $$
declare a uuid:='e025ece7-50da-4e12-8135-1e4ef27ac001'; u uuid:='e025ece7-50da-4e12-8135-1e4ef27ac002'; b jsonb;
begin
 if public.mb_rol(u)<>'cliente' then raise exception 'FAIL registration default'; end if;
 begin perform public.mb_admin_roles(u,'listar','{"ids":[]}');raise exception 'FAIL client access';exception when insufficient_privilege then null;end;
 b:=jsonb_build_object('usuario_id',u,'rol','vendedor','anterior','cliente');
 perform public.mb_admin_roles(a,'cambiar',b);
 if public.mb_rol(u)<>'vendedor' then raise exception 'FAIL seller grant';end if;
 begin perform public.mb_admin_roles(u,'cambiar',b||jsonb_build_object('rol','administrador','anterior','vendedor'));raise exception 'FAIL escalation';exception when insufficient_privilege then null;end;
 begin perform public.mb_admin_roles(a,'cambiar',b||jsonb_build_object('rol','administrador'));raise exception using errcode='P0002',message='FAIL stale role';exception when sqlstate 'P0001' then if sqlerrm not like 'El rol cambió%' then raise;end if;end;
 perform public.mb_admin_roles(a,'cambiar',b||jsonb_build_object('rol','administrador','anterior','vendedor'));
 if public.mb_rol(u)<>'administrador' or exists(select 1 from private.equipo_vendedores where usuario_id=u and activo) then raise exception 'FAIL mutually exclusive roles';end if;
 begin perform public.mb_admin_roles(a,'cambiar',jsonb_build_object('usuario_id',a,'rol','cliente','anterior','administrador'));raise exception using errcode='P0002',message='FAIL self demotion';exception when sqlstate 'P0001' then if sqlerrm not like 'Tu propio rol%' then raise;end if;end;
 perform public.mb_admin_roles(a,'cambiar',b||jsonb_build_object('rol','cliente','anterior','administrador'));
 if public.mb_rol(u)<>'cliente' then raise exception 'FAIL revoke';end if;
 begin perform public.mb_admin_roles(u,'listar','{"ids":[]}');raise exception 'FAIL revoked access';exception when insufficient_privilege then null;end;
 if (select count(*) from private.cambio_rol where usuario_id=u)<>3 then raise exception 'FAIL audit';end if;
 begin update private.cambio_rol set nuevo='administrador' where usuario_id=u;raise exception 'FAIL mutable audit';exception when insufficient_privilege then null;end;
end;
$$;
set local role authenticated;
do $$ begin
 begin perform public.mb_admin_roles('e025ece7-50da-4e12-8135-1e4ef27ac001','listar','{"ids":[]}');raise exception 'FAIL direct RPC';exception when insufficient_privilege then null;end;
 begin insert into private.equipo_inventario(usuario_id) values('e025ece7-50da-4e12-8135-1e4ef27ac002');raise exception 'FAIL direct grant';exception when insufficient_privilege then null;end;
end; $$;
reset role;
select 'PASS: default client, admin-only assignments, stale changes, revocation, immutable audit, direct access denied' as result;
rollback;
