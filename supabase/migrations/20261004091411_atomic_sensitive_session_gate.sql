begin;
-- Hold the current session row throughout each RLS statement. Revocation waits
-- for an already executing statement; a subsequent statement is denied.
create or replace function private.mb_current_session_live()returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 -- PostgREST GET/HEAD transactions are read-only. They check the live row
 -- in their statement snapshot; writes below additionally serialize revocation.
 if current_setting('transaction_read_only')='on'then
  return exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where u.id=auth.uid()and not coalesce(u.is_anonymous,false)and u.email_confirmed_at is not null
  and s.id::text=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
  and(s.not_after is null or s.not_after>clock_timestamp()));
 end if;
 perform s.id from auth.sessions s join auth.users u on u.id=s.user_id
 where u.id=auth.uid()and not coalesce(u.is_anonymous,false)and u.email_confirmed_at is not null
 and s.id::text=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
 and(s.not_after is null or s.not_after>clock_timestamp())for key share of s;
 return found;
end $$;
-- The service cannot supply arbitrary function/schema names. Existing business
-- functions keep their ACL and authoritative role/ownership checks.
-- Row locks require UPDATE privilege. This narrow private helper avoids giving
-- the application service UPDATE rights over the Auth session table.
create function private.mb_lock_live_session(p_user uuid,p_session uuid)returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 perform s.id from auth.sessions s join auth.users u on u.id=s.user_id
 where u.id=p_user and s.id=p_session and not coalesce(u.is_anonymous,false)and u.email_confirmed_at is not null
 and(s.not_after is null or s.not_after>clock_timestamp())for key share of s;
 return found;
end $$;
revoke all on function private.mb_lock_live_session(uuid,uuid)from public,anon,authenticated;
grant execute on function private.mb_lock_live_session(uuid,uuid)to service_role;
create function public.mb_sensitive_session_rpc(p_user uuid,p_session uuid,p_function text,p_args jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare fn pg_catalog.pg_proc;arg record;parts text:='';outcome jsonb;
begin
 if not private.mb_lock_live_session(p_user,p_session)then raise exception 'Sesion vencida'using errcode='42501';end if;
 if p_function not in('mb_rol','mb_inventario_autorizado','mb_admin_roles','mb_admin_dashboard','mb_ventas','mb_inventario','mb_listar_recepciones','mb_registrar_recepcion','mb_preparacion','mb_logistics_admin','mb_comercio','mb_carrito_cantidad','mb_cotizar_catalogo','mb_catalogo_disponibilidad','mb_shipping_fingerprint','mb_checkout_minorista','mb_mark_mock_payment','mb_confirmar_pago','mb_confirmar_transferencia','mb_cancelar_pedido_servicio','mb_pedido_por_carrito','mb_exchange_order_link','mb_read_order_link','mb_request_order_link','mb_wholesale_catalog','mb_wholesale_quote','mb_wholesale_submit_account','mb_wholesale_own','mb_wholesale_manage')or p_args is null or jsonb_typeof(p_args)<>'object'then raise exception 'Operacion no permitida'using errcode='42501';end if;
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
-- Definer remains private/current-user-only, with the exact same narrow grants.
revoke all on function private.mb_current_session_live()from public,anon,service_role;
grant execute on function private.mb_current_session_live()to authenticated;
notify pgrst,'reload schema';
commit;
