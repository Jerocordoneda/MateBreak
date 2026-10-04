-- LOCAL ONLY candidate. No existing business rows are changed or backfilled.
create table private.mp_payment_observation (
 payment_id text primary key check(payment_id ~ '^[0-9]{1,30}$'),
 pedido_id uuid not null references public.pedido(id),
 provider_updated_at timestamptz not null, digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 provider_status text not null, amount numeric(14,2) not null, refunded numeric(14,2) not null,
 environment text not null check(environment in ('test','production')),collector_id text not null,
 outcome text not null,observed_at timestamptz not null default clock_timestamp()
);
create table private.order_financial_hold (
 pedido_id uuid primary key references public.pedido(id),reason text not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table private.mp_payment_observation enable row level security;
alter table private.order_financial_hold enable row level security;
revoke all on private.mp_payment_observation,private.order_financial_hold from public,anon,authenticated;
grant select,insert,update on private.mp_payment_observation,private.order_financial_hold to service_role;

create function public.mb_reconcile_mp_payment(p_observation jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o public.pedido; g public.pago; old private.mp_payment_observation;
 pid text:=p_observation->>'id'; oid uuid:=(p_observation->>'orderId')::uuid;
 v timestamptz:=(p_observation->>'updatedAt')::timestamptz;
 s text:=p_observation->>'status'; d text:=p_observation->>'digest';
 a numeric:=(p_observation->>'amount')::numeric; r numeric:=(p_observation->>'refunded')::numeric;
 result text:='observado'; reason text;
begin
 if pid is null or pid !~ '^[0-9]{1,30}$' or v is null or v>clock_timestamp()+interval '5 minutes'
 or d is null or d !~ '^[a-f0-9]{64}$' or a is null or a<=0 or a<>round(a,2) or r is null or r<0 or r>a or r<>round(r,2)
 or p_observation->>'currency' is distinct from 'ARS' or p_observation->>'environment' is null
 or p_observation->>'environment' not in ('test','production') or p_observation->>'collectorId' is null
 or p_observation->>'collectorId' !~ '^[0-9]{1,30}$' or s is null
 or s not in ('pending','approved','authorized','in_process','in_mediation','rejected','cancelled','refunded','charged_back')
 then raise exception 'Observacion de pago invalida'; end if;
 -- Same lock order as reservation/cancellation functions.
 perform pg_advisory_xact_lock(782204,1);
 select * into o from public.pedido where id=oid for update;
 if not found then raise exception 'Pedido inexistente'; end if;
 select * into old from private.mp_payment_observation where payment_id=pid for update;
 if found then
  if old.pedido_id<>oid or old.environment<>p_observation->>'environment' or old.collector_id<>p_observation->>'collectorId' then raise exception 'Correlacion inconsistente'; end if;
  if old.provider_updated_at>v then return jsonb_build_object('outcome','stale','review',exists(select 1 from private.order_financial_hold where pedido_id=oid)); end if;
  if old.provider_updated_at=v and old.digest=d then return jsonb_build_object('outcome','duplicate','review',exists(select 1 from private.order_financial_hold where pedido_id=oid)); end if;
  if old.provider_updated_at=v then reason:='version_conflict'; end if;
 end if;
 select * into g from public.pago where pedido_id=oid and metodo='mercadopago' for update;
 if not found or g.simulado or g.importe<>a or o.total<>a or g.moneda<>'ARS' or o.moneda<>'ARS' then reason:='amount_or_payment_mismatch'; end if;
 if s in ('refunded','charged_back','in_mediation') or r>0 then reason:='refund_or_dispute'; end if;
 if exists(select 1 from private.order_financial_hold where pedido_id=oid) then reason:='existing_financial_hold'; end if;
 if reason is null and s='approved' then
  begin
   perform public.mb_confirmar_pago(g.id,pid,a,'ARS');
   if p_observation->'card' is not null and p_observation->'card'<>'null'::jsonb then
    perform public.mb_record_payment_display(g.id,p_observation->'card'->>'brand',p_observation->'card'->>'last4');
   end if;
   result:='aplicado';
  exception when others then reason:='confirmation_requires_review';
  end;
 end if;
 -- Reject/cancel are attempt states: another attempt can still be approved.
 -- Keep the reservation until explicit operator cancellation or normal expiry.
 -- Never restore physical stock because a financial refund was received.
 if reason is not null then
  insert into private.order_financial_hold(pedido_id,reason) values(oid,reason) on conflict do nothing;
  result:='revision_manual';
 end if;
 insert into private.mp_payment_observation(payment_id,pedido_id,provider_updated_at,digest,provider_status,amount,refunded,environment,collector_id,outcome)
 values(pid,oid,v,d,s,a,r,p_observation->>'environment',p_observation->>'collectorId',result)
 on conflict(payment_id) do update set provider_updated_at=excluded.provider_updated_at,digest=excluded.digest,
 provider_status=excluded.provider_status,amount=excluded.amount,refunded=excluded.refunded,outcome=excluded.outcome,observed_at=clock_timestamp();
 return jsonb_build_object('outcome',result,'review',reason is not null);
end $$;

create function private.mb_financial_dispatch_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.estado in ('en_preparacion','enviado','entregado') and new.estado is distinct from old.estado
 and exists(select 1 from private.order_financial_hold where pedido_id=new.id)
 then raise exception 'Revision financiera pendiente'; end if;
 return new;
end $$;
create trigger order_financial_dispatch_guard before update of estado on public.pedido
for each row execute function private.mb_financial_dispatch_guard();
revoke all on function public.mb_reconcile_mp_payment(jsonb),private.mb_financial_dispatch_guard() from public,anon,authenticated;
grant execute on function public.mb_reconcile_mp_payment(jsonb),private.mb_financial_dispatch_guard() to service_role;

-- Financial hold excludes dispatch; lock the order before importing.
create or replace function public.mb_claim_shipment(p_environment text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b private.envio_bulto; s jsonb; cid uuid;
begin
 if p_environment not in ('mock','test','production') then raise exception 'Ambiente invalido'; end if;
 -- A dead worker might have already sent its request. Never automatically resend.
 with expired as (
  update private.envio_bulto set estado='revision',error_tipo='abandoned_claim'
   where estado='procesando' and iniciado_en<clock_timestamp()-interval '2 minutes'
   returning pedido_id,claim_id
 ), audited as (
  update private.envio_importacion_intento a set terminado_en=clock_timestamp(),resultado='revision',error_tipo='abandoned_claim'
   from expired x where a.claim_id=x.claim_id returning a.claim_id
 )
 update public.envio set estado_integracion='revision' where pedido_id in (select pedido_id from expired);
 select b0.* into b from private.envio_bulto b0 join public.pedido o on o.id=b0.pedido_id
  join public.envio e on e.pedido_id=o.id
  where o.estado='pagado' and not exists(select 1 from private.order_financial_hold h where h.pedido_id=o.id) and e.snapshot->>'environment'=p_environment
   and b0.estado in ('pendiente','error') and b0.intento<3 and b0.proximo_intento<=clock_timestamp()
  order by o.creado_en,b0.bulto limit 1 for update of o,b0 skip locked;
 if not found then return null; end if;
 cid:=gen_random_uuid();
 update private.envio_bulto set estado='procesando',intento=intento+1,claim_id=cid,iniciado_en=clock_timestamp() where pedido_id=b.pedido_id and bulto=b.bulto;
 insert into private.envio_importacion_intento(claim_id,pedido_id,bulto,intento) values(cid,b.pedido_id,b.bulto,b.intento+1);
 select snapshot into s from public.envio where pedido_id=b.pedido_id;
 return jsonb_build_object('claimId',cid,'orderId',b.pedido_id,'parcelNumber',b.bulto,'extOrderId',b.ext_order_id,'snapshot',s,'parcel',s->'parcels'->(b.bulto-1));
end $$;
