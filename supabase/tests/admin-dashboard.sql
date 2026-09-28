begin;
insert into auth.users(id,raw_user_meta_data) values
 ('d025ece7-50da-4e12-8135-1e4ef27ad001','{}'),
 ('d025ece7-50da-4e12-8135-1e4ef27ad002','{}'),
 ('d025ece7-50da-4e12-8135-1e4ef27ad003','{}');
insert into private.equipo_inventario(usuario_id) values('d025ece7-50da-4e12-8135-1e4ef27ad001');
insert into private.equipo_vendedores(usuario_id) values('d025ece7-50da-4e12-8135-1e4ef27ad002');
set local role service_role;
insert into private.venta_manual(operacion_id,vendedor_id,vendedor_nombre,cliente,telefono,estado,metodo_pago,total,notas,solicitud,creado_en,entregada_en) values
 ('d125ece7-50da-4e12-8135-1e4ef27ad001','d025ece7-50da-4e12-8135-1e4ef27ad002','Vendedor prueba','Cliente anterior','099 111 222','entregada','efectivo',80,'','{}',now()-interval '120 days',now()-interval '120 days'),
 ('d125ece7-50da-4e12-8135-1e4ef27ad002','d025ece7-50da-4e12-8135-1e4ef27ad002','Vendedor prueba','Cliente anterior','099111222','entregada','efectivo',100,'','{}',now()-interval '2 days',now()-interval '2 days'),
 ('d125ece7-50da-4e12-8135-1e4ef27ad003','d025ece7-50da-4e12-8135-1e4ef27ad002','Vendedor prueba','Cliente nuevo','','por_entregar','transferencia',50,'','{}',now()-interval '1 day',null);
do $$
declare d jsonb;
begin
 d:=public.mb_admin_dashboard('d025ece7-50da-4e12-8135-1e4ef27ad001','30_dias');
 if (d#>>'{totales,ventas}')::integer<>2 or (d#>>'{totales,facturacion_entregada}')::numeric<>100
  or (d#>>'{totales,monto_pendiente}')::numeric<>50 or (d#>>'{totales,clientes_nuevos}')::integer<>1
  or (d#>>'{totales,clientes_anteriores}')::integer<>1 or (d#>>'{totales,clientes_recurrentes}')::integer<>1 then
  raise exception 'FAIL dashboard totals: %',d->'totales';
 end if;
 if jsonb_array_length(d->'vendedores')<>1 or jsonb_array_length(d->'recientes')<>2 then raise exception 'FAIL dashboard lists';end if;
 begin perform public.mb_admin_dashboard('d025ece7-50da-4e12-8135-1e4ef27ad002','mes');raise exception 'FAIL seller access';exception when insufficient_privilege then null;end;
 begin perform public.mb_admin_dashboard('d025ece7-50da-4e12-8135-1e4ef27ad003','mes');raise exception 'FAIL client access';exception when insufficient_privilege then null;end;
end;
$$;
set local role authenticated;
do $$ begin
 begin perform public.mb_admin_dashboard('d025ece7-50da-4e12-8135-1e4ef27ad001','mes');raise exception 'FAIL direct RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: commercial totals, customer cohorts and admin-only access' as result;
rollback;
