-- Local-only operational surface. Preserve the existing order/payment state machine.
create table private.retail_order_audit (
 id bigint generated always as identity primary key,
 pedido_id uuid not null references public.pedido(id),
 actor_id uuid references auth.users(id),
 action_id uuid unique,
 action text not null,
 estado_anterior text not null,
 estado_nuevo text not null,
 creado_en timestamptz not null default clock_timestamp()
);
alter table private.retail_order_audit enable row level security;
revoke all on private.retail_order_audit from public,anon,authenticated;
grant select,insert on private.retail_order_audit to service_role;
grant usage,select on sequence private.retail_order_audit_id_seq to service_role;
create function private.mb_audit_retail_state() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into private.retail_order_audit(pedido_id,actor_id,action_id,action,estado_anterior,estado_nuevo)
 values(new.id,nullif(current_setting('matebreak.retail_actor',true),'')::uuid,
 nullif(current_setting('matebreak.retail_action_id',true),'')::uuid,
 coalesce(nullif(current_setting('matebreak.retail_action',true),''),'system'),
 old.estado,new.estado);
 return new;
end $$;
revoke all on function private.mb_audit_retail_state() from public,anon,authenticated;
create trigger retail_order_state_audit after update of estado on public.pedido
for each row when(old.estado is distinct from new.estado) execute function private.mb_audit_retail_state();

create function public.mb_retail_order_admin(p_actor_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.pedido; event private.retail_order_audit; aid uuid; oid uuid; page integer;
begin
 if not public.mb_inventario_autorizado(p_actor_id) then raise exception 'Solo administracion' using errcode='42501';end if;
 if p_action='list' then
  page:=coalesce((p_data->>'page')::integer,1);
  if page<1 or page>10000 then raise exception 'Pagina invalida';end if;
  return coalesce((select jsonb_agg(v) from (
   select ord.id,ord.numero_publico,ord.estado,ord.total,ord.creado_en,ord.reserva_hasta,
    ord.direccion_entrega as entrega,
    (select jsonb_agg(jsonb_build_object('metodo',g.metodo,'estado',g.estado,'importe',g.importe)) from public.pago g where g.pedido_id=ord.id) as pagos,
    (select jsonb_build_object('tracking',d.tracking,'state',d.provider_state,'verified_at',d.verified_at) from private.order_dispatch d where d.pedido_id=ord.id) as tracking,
    exists(select 1 from private.order_financial_hold h where h.pedido_id=ord.id) as revision_financiera,
    (ord.estado='en_preparacion' and not exists(select 1 from public.pedido_abastecimiento a where a.pedido_id=ord.id and a.cantidad_pendiente>0)
     and not exists(select 1 from public.pedido_preparacion p where p.pedido_id=ord.id and p.estado<>'listo_despachar')) as listo_despachar,
    (select jsonb_agg(jsonb_build_object('actor_id',a.actor_id,'action',a.action,'desde',a.estado_anterior,'hasta',a.estado_nuevo,'fecha',a.creado_en)) from private.retail_order_audit a where a.pedido_id=ord.id) as historial
   from public.pedido ord order by ord.creado_en desc,ord.id limit 100 offset (page-1)*100
  )v),'[]'::jsonb);
 end if;
 if p_action not in('prepare','deliver','cancel','expire') then raise exception 'Accion invalida';end if;
 oid:=(p_data->>'orderId')::uuid;aid:=(p_data->>'actionId')::uuid;
 if oid is null or aid is null or nullif(p_data->>'expectedState','') is null then raise exception 'Operacion incompleta';end if;
 perform pg_advisory_xact_lock(782204,1);
 select * into o from public.pedido where id=oid for update;
 if not found then raise exception 'Pedido inexistente';end if;
 select * into event from private.retail_order_audit where action_id=aid;
 if found then
  if event.pedido_id<>oid or event.actor_id<>p_actor_id or event.action<>p_action or (event.estado_anterior<>p_data->>'expectedState' and not(p_action='expire' and event.estado_anterior='cancelado' and p_data->>'expectedState'='pendiente_pago')) then raise exception 'Intento conflictivo';end if;
  return to_jsonb(o);
 end if;
 if p_action in('prepare','deliver') and exists(select 1 from private.order_financial_hold h where h.pedido_id=o.id) then raise exception 'Revision financiera pendiente';end if;
 if o.estado is distinct from p_data->>'expectedState' then raise exception 'Estado cambio: actualizar';end if;
 perform set_config('matebreak.retail_actor',p_actor_id::text,true);
 perform set_config('matebreak.retail_action',p_action,true);
 perform set_config('matebreak.retail_action_id',aid::text,true);
 if p_action='prepare' then
  if o.estado<>'pagado' then raise exception 'Pedido no pagado';end if;
  update public.pedido set estado='en_preparacion' where id=oid;
 elsif p_action='deliver' then
  if o.estado<>'enviado' then raise exception 'Pedido no despachado';end if;
  update public.pedido set estado='entregado' where id=oid;
 elsif p_action='cancel' then
  if o.estado<>'pendiente_pago' then raise exception 'Cancelar requiere pedido pendiente';end if;
  perform public.mb_cancelar_pedido_servicio(oid);
 else
  if o.estado<>'pendiente_pago' or o.reserva_hasta>clock_timestamp() then raise exception 'Reserva no vencida';end if;
  -- Only expiration has two transitions; keep its idempotency key on the final event.
  perform set_config('matebreak.retail_action_id','',true);
  perform public.mb_cancelar_pedido_servicio(oid);
  perform set_config('matebreak.retail_action_id',aid::text,true);
  update public.pedido set estado='expirado' where id=oid;
 end if;
 select * into o from public.pedido where id=oid;
 return to_jsonb(o);
end $$;
revoke all on function public.mb_retail_order_admin(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mb_retail_order_admin(uuid,text,jsonb) to service_role;

create or replace function public.mb_sensitive_session_rpc(p_user uuid,p_session uuid,p_function text,p_args jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare fn pg_catalog.pg_proc;arg record;parts text:='';outcome jsonb;
begin
 if not private.mb_lock_live_session(p_user,p_session)then raise exception 'Sesion vencida'using errcode='42501';end if;
 if p_function not in('mb_rol','mb_inventario_autorizado','mb_admin_roles','mb_admin_dashboard','mb_ventas','mb_inventario','mb_listar_recepciones','mb_registrar_recepcion','mb_preparacion','mb_logistics_admin','mb_retail_order_admin','mb_comercio','mb_carrito_cantidad','mb_cotizar_catalogo','mb_catalogo_disponibilidad','mb_shipping_fingerprint','mb_checkout_minorista','mb_mark_mock_payment','mb_confirmar_pago','mb_confirmar_transferencia','mb_cancelar_pedido_servicio','mb_pedido_por_carrito','mb_exchange_order_link','mb_read_order_link','mb_request_order_link','mb_wholesale_catalog','mb_wholesale_quote','mb_wholesale_submit_account','mb_wholesale_own','mb_wholesale_manage')or p_args is null or jsonb_typeof(p_args)<>'object'then raise exception 'Operacion no permitida'using errcode='42501';end if;
 select p.* into strict fn from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=p_function and p.prokind='f';
 if exists(select 1 from jsonb_object_keys(p_args)k where not k=any(fn.proargnames))then raise exception 'Argumentos invalidos';end if;
 for arg in select t.oid,t.pos,fn.proargnames[t.pos]name from unnest(fn.proargtypes::oid[])with ordinality t(oid,pos)loop
  if p_args?arg.name then
   if arg.name in('p_usuario_id','p_actor_id','p_actor','p_user')and(p_args->>arg.name)is distinct from p_user::text then raise exception 'Identidad invalida'using errcode='42501';end if;
   if arg.name='p_session'and(p_args->>arg.name)is distinct from p_session::text then raise exception 'Sesion invalida'using errcode='42501';end if;
   parts:=parts||case when parts=''then ''else ','end||quote_ident(arg.name)||'=>';
   parts:=parts||case when p_args->arg.name='null'::jsonb then 'NULL'else quote_literal(p_args->>arg.name)end||'::'||pg_catalog.format_type(arg.oid,null);
  elsif arg.pos<=fn.pronargs-fn.pronargdefaults then raise exception 'Argumento requerido';end if;
 end loop;
 execute 'select to_jsonb(public.'||quote_ident(p_function)||'('||parts||'))'into outcome;
 return outcome;
end $$;
revoke all on function public.mb_sensitive_session_rpc(uuid,uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.mb_sensitive_session_rpc(uuid,uuid,text,jsonb)to service_role;
