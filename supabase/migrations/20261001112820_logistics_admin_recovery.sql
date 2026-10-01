-- Backend administration only. No financial state, provider calls or schedules.
create table private.envio_accion_admin (
 id uuid primary key, actor_id uuid not null references auth.users(id) on delete restrict,
 pedido_id uuid not null, bulto integer not null, accion text not null,
 anterior text not null, nuevo text not null, intento integer not null, claim_id uuid,
 verificacion text not null, fuente text, referencia text, provider_created_at text,
 creado_en timestamptz not null default clock_timestamp(),
 foreign key(pedido_id,bulto) references private.envio_bulto on delete restrict,
 check(accion in ('verified_import','safe_retry','keep_review')),
 check(verificacion in ('exists','absent','unresolved'))
);
create index envio_accion_admin_bulto on private.envio_accion_admin(pedido_id,bulto,creado_en);
alter table private.envio_accion_admin enable row level security;
revoke all on private.envio_accion_admin from public,anon,authenticated,service_role;
grant select,insert on private.envio_accion_admin to service_role;
create function private.mb_logistics_audit_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Auditoria logistica inmutable'; end $$;
create trigger envio_admin_audit_immutable before update or delete on private.envio_accion_admin
 for each row execute function private.mb_logistics_audit_immutable();

-- Serialize finishes/reconciliation per order so simultaneous last parcels
-- cannot leave an obsolete aggregate integration state.
create function private.mb_logistics_refresh(p_order uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('mb-logistics:'||p_order::text,0));
 update public.envio set estado_integracion=case
  when exists(select 1 from private.envio_bulto where pedido_id=p_order and estado='revision') then 'revision'
  when not exists(select 1 from private.envio_bulto where pedido_id=p_order and estado<>'importado') then 'importado'
  when exists(select 1 from private.envio_bulto where pedido_id=p_order and estado='error') then 'error'
  else 'pendiente' end where pedido_id=p_order;
end $$;
create or replace function public.mb_finish_shipment(p_claim_id uuid,p_result jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare b private.envio_bulto; oid uuid; v_state text; v_type text; created text;
begin
 select pedido_id into oid from private.envio_bulto where claim_id=p_claim_id;
 if oid is null then raise exception 'Claim no vigente'; end if;
 perform pg_advisory_xact_lock(hashtextextended('mb-logistics:'||oid::text,0));
 select * into b from private.envio_bulto where claim_id=p_claim_id and estado='procesando' for update;
 if not found then raise exception 'Claim no vigente'; end if;
 v_state:=p_result->>'state'; v_type:=p_result->>'errorType'; created:=p_result->>'createdAt';
 if v_state is null or v_state not in ('importado','error','revision') or coalesce(v_type,'') !~ '^[a-z_]{0,40}$' then raise exception 'Resultado invalido'; end if;
 if v_state='importado' and (created is null or length(created)>40 or not isfinite(created::timestamptz)) then raise exception 'Fecha de importacion invalida'; end if;
 if v_state='error' and (v_type is distinct from 'rate_limit' or (p_result->>'status')::integer is distinct from 429) then raise exception 'Retry automatico no seguro'; end if;
 update private.envio_bulto set estado=v_state,created_at=case when v_state='importado' then created else null end,error_tipo=v_type,
  proximo_intento=clock_timestamp()+interval '1 minute'*power(2,b.intento) where pedido_id=b.pedido_id and bulto=b.bulto;
 update private.envio_importacion_intento set terminado_en=clock_timestamp(),resultado=v_state,error_tipo=v_type,
  provider_status=(p_result->>'status')::integer,request_id=nullif(p_result->>'requestId','')::uuid where claim_id=p_claim_id;
 perform private.mb_logistics_refresh(b.pedido_id);
end $$;

create function public.mb_logistics_admin(p_actor_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b private.envio_bulto; a private.envio_accion_admin; oid uuid; num integer; aid uuid;
 v_state text; verification text; source text; reference text; created text; page integer; filter text;
begin
 if public.mb_rol(p_actor_id) is distinct from 'administrador' then raise exception 'Solo administradores' using errcode='42501'; end if;
 if p_action='list' then
  page:=coalesce((p_data->>'page')::integer,1); filter:=coalesce(p_data->>'state','problems');
  if page not between 1 and 10000 or filter not in ('problems','all','pendiente','procesando','importado','error','revision') then raise exception 'Filtro invalido'; end if;
  return coalesce((select jsonb_agg(x.row) from (
   select jsonb_build_object('orderId',b0.pedido_id,'parcelNumber',b0.bulto,'extOrderId',b0.ext_order_id,
    'state',b0.estado,'attempts',b0.intento,'claimId',b0.claim_id,'lastAttemptAt',b0.iniciado_en,
    'errorType',b0.error_tipo,'createdAt',b0.created_at,'orderCreatedAt',o.creado_en,
    'abandoned',b0.estado='procesando' and b0.iniciado_en<clock_timestamp()-interval '2 minutes') as row
   from private.envio_bulto b0 join public.pedido o on o.id=b0.pedido_id
   where (filter='all' or filter=b0.estado or (filter='problems' and b0.estado in ('error','revision','procesando')))
   order by o.creado_en desc,b0.pedido_id,b0.bulto limit 50 offset (page-1)*50
  ) x),'[]');
 end if;
 oid:=(p_data->>'orderId')::uuid; num:=(p_data->>'parcelNumber')::integer;
 if oid is null or num is null or num not between 1 and 20 then raise exception 'Bulto invalido'; end if;
 if p_action='history' then
  return coalesce((select jsonb_agg(jsonb_build_object('actionId',id,'actorId',actor_id,'action',accion,'before',anterior,'after',nuevo,
   'attempts',intento,'verification',verificacion,'source',fuente,'reference',referencia,'createdAt',provider_created_at,'at',creado_en) order by creado_en,id)
   from private.envio_accion_admin where pedido_id=oid and bulto=num),'[]');
 end if;
 if p_action not in ('verified_import','safe_retry','keep_review') or p_action is null then raise exception 'Accion invalida'; end if;
 aid:=(p_data->>'actionId')::uuid; if aid is null then raise exception 'Identificador de accion requerido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('mb-logistics:'||oid::text,0));
 select * into a from private.envio_accion_admin where id=aid;
 if found then
  if a.actor_id<>p_actor_id or a.pedido_id<>oid or a.bulto<>num or a.accion<>p_action
   or a.verificacion is distinct from p_data->>'verification' or a.fuente is distinct from nullif(p_data->>'source','')
   or a.referencia is distinct from nullif(p_data->>'reference','') or a.provider_created_at is distinct from nullif(p_data->>'createdAt','')
   then raise exception 'Idempotencia incompatible'; end if;
  return jsonb_build_object('actionId',a.id,'state',a.nuevo);
 end if;
 select * into b from private.envio_bulto where pedido_id=oid and bulto=num for update;
 if not found then raise exception 'Bulto inexistente'; end if;
 if b.estado is distinct from p_data->>'expectedState' or b.intento is distinct from (p_data->>'expectedAttempts')::integer
  or b.claim_id is distinct from nullif(p_data->>'expectedClaimId','')::uuid then raise exception 'El bulto cambio; actualizar antes de actuar'; end if;
 if b.estado='procesando' and not(p_action='keep_review' and b.iniciado_en<clock_timestamp()-interval '2 minutes') then raise exception 'Claim activo; no intervenir'; end if;
 if b.estado not in ('revision','error','procesando') then raise exception 'Estado no conciliable'; end if;
 if not exists(select 1 from public.pedido where id=oid and estado='pagado') then raise exception 'Pedido no pagado'; end if;
 verification:=p_data->>'verification'; source:=nullif(p_data->>'source',''); reference:=nullif(p_data->>'reference',''); created:=nullif(p_data->>'createdAt','');
 if p_action='keep_review' then
  if verification is distinct from 'unresolved' or source is not null or reference is not null or created is not null then raise exception 'Retener revision sin evidencia inventada'; end if;
  v_state:='revision';
 else
  if (p_data->>'confirmed') is distinct from 'true' or source is null or source not in ('portal','support')
   or reference is null or reference !~ '^[A-Za-z0-9_-]{3,80}$' then raise exception 'Verificacion manual oficial requerida'; end if;
  if p_action='verified_import' then
   if verification is distinct from 'exists' or created is null or length(created)>40 or not isfinite(created::timestamptz) then raise exception 'Importacion no verificada'; end if;
   v_state:='importado';
  else
   if verification is distinct from 'absent' or created is not null or b.intento>=3 then raise exception 'Retry no seguro o limite alcanzado'; end if;
   v_state:='pendiente';
  end if;
 end if;
 insert into private.envio_accion_admin(id,actor_id,pedido_id,bulto,accion,anterior,nuevo,intento,claim_id,verificacion,fuente,referencia,provider_created_at)
 values(aid,p_actor_id,oid,num,p_action,b.estado,v_state,b.intento,b.claim_id,verification,source,reference,created);
 update private.envio_bulto set estado=v_state,created_at=case when v_state='importado' then created else null end,
  error_tipo=case when v_state='revision' then coalesce(error_tipo,'manual_review') else null end,
  proximo_intento=clock_timestamp() where pedido_id=oid and bulto=num;
 if b.estado='procesando' then
  update private.envio_importacion_intento set terminado_en=clock_timestamp(),resultado='revision',error_tipo='abandoned_claim' where claim_id=b.claim_id;
 end if;
 perform private.mb_logistics_refresh(oid);
 return jsonb_build_object('actionId',aid,'state',v_state);
end $$;
revoke all on function private.mb_logistics_audit_immutable(),private.mb_logistics_refresh(uuid),public.mb_logistics_admin(uuid,text,jsonb),public.mb_finish_shipment(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.mb_logistics_audit_immutable(),private.mb_logistics_refresh(uuid),public.mb_logistics_admin(uuid,text,jsonb),public.mb_finish_shipment(uuid,jsonb) to service_role;
