begin;
-- Existing events retain NULL: cutoff activation cannot accidentally include
-- historical backlog. Only explicit event selection can claim one of them.
alter table private.order_email_event add column created_at timestamptz;
alter table private.order_email_event alter column created_at set default clock_timestamp();
alter table private.order_email_event drop constraint order_email_event_state_check;
alter table private.order_email_event add constraint order_email_event_state_check check(state in('pending','processing','retry','sent','review','superseded'));
-- Real worker cannot drain the historical outbox accidentally.
create function public.mb_claim_order_email_controlled(p_event_id uuid default null,p_after timestamptz default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e private.order_email_event;c uuid;
begin
 if p_event_id is null and p_after is null then raise exception 'Explicit rollout required';end if;
 update private.order_email_event set state='review' where state='processing' and claimed_at<clock_timestamp()-interval '5 minutes';
 -- A never attempted receipt queued before immediate payment confirmation is
 -- replaced by the distinct paid notification; preserve its audit row.
 update private.order_email_event r set state='superseded'where r.kind='received'and r.state='pending'and r.attempts=0
 and(p_event_id is null or r.id=p_event_id)and(p_after is null or r.created_at>=p_after)
 and not exists(select 1 from private.order_email_delivery d where d.event_id=r.id)
 and exists(select 1 from private.order_email_event p where p.pedido_id=r.pedido_id and p.kind='paid'and p.state in('pending','retry'))
 and exists(select 1 from public.pago p where p.pedido_id=r.pedido_id and p.estado='aprobado');
 select * into e from private.order_email_event x where x.state in('pending','retry')and x.attempts<5 and x.available_at<=clock_timestamp()
 and (p_event_id is null or x.id=p_event_id)and(p_after is null or x.created_at>=p_after)
 and (x.kind not in('paid','shipped')or not exists(select 1 from private.order_financial_hold h where h.pedido_id=x.pedido_id))
 order by x.available_at,x.id limit 1 for update skip locked;
 if not found then return null;end if;
 c:=gen_random_uuid();update private.order_email_event set state='processing',attempts=attempts+1,claim_id=c,claimed_at=clock_timestamp()where id=e.id;
 return jsonb_build_object('id',e.id,'claim_id',c,'pedido_id',e.pedido_id,'kind',e.kind,'order',private.mb_order_view(e.pedido_id),'email',(select coalesce(direccion_entrega->'destinatario'->>'email',direccion_entrega->>'email')from public.pedido where id=e.pedido_id));
end $$;
revoke all on function public.mb_claim_order_email_controlled(uuid,timestamptz)from public,anon,authenticated;
grant execute on function public.mb_claim_order_email_controlled(uuid,timestamptz)to service_role;

create table private.payment_reconciliation_job(
 payment_id text primary key check(payment_id~'^[0-9]{1,30}$'),
 state text not null default 'pending'check(state in('pending','processing','retry','done','review')),
 attempts integer not null default 0 check(attempts between 0 and 10),
 claim_id uuid,claimed_at timestamptz,available_at timestamptz not null default now(),created_at timestamptz not null default now());
alter table private.payment_reconciliation_job enable row level security;
revoke all on private.payment_reconciliation_job from public,anon,authenticated;
grant all on private.payment_reconciliation_job to service_role;
create function public.mb_queue_payment_reconciliation(p_payment_id text)returns void language sql security invoker set search_path='' as $$
 insert into private.payment_reconciliation_job(payment_id)values(p_payment_id)
 on conflict(payment_id)do update set state=case when payment_reconciliation_job.state='done'then 'pending'else payment_reconciliation_job.state end,
 attempts=case when payment_reconciliation_job.state='done'then 0 else payment_reconciliation_job.attempts end,
 available_at=case when payment_reconciliation_job.state='done'then now()else payment_reconciliation_job.available_at end;
$$;
create function public.mb_claim_payment_reconciliation()returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.payment_reconciliation_job;c uuid;begin
 -- GET reconciliation is safe to retry after restart; SQL observation is idempotent.
 update private.payment_reconciliation_job set state=case when attempts>=10 then 'review'else 'retry'end where state='processing'and claimed_at<now()-interval '5 minutes';
 select * into r from private.payment_reconciliation_job where state in('pending','retry')and attempts<10 and available_at<=now()order by available_at,payment_id limit 1 for update skip locked;
 if not found then return null;end if;c:=gen_random_uuid();
 update private.payment_reconciliation_job set state='processing',attempts=attempts+1,claim_id=c,claimed_at=now()where payment_id=r.payment_id;
 return jsonb_build_object('paymentId',r.payment_id,'claimId',c);
end $$;
create function public.mb_finish_payment_reconciliation(p_claim_id uuid,p_outcome text)returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_outcome not in('done','retry','review')then raise exception 'Invalid outcome';end if;
 update private.payment_reconciliation_job set state=case when p_outcome='retry'and attempts>=10 then 'review'else p_outcome end,
 available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)),claim_id=null where claim_id=p_claim_id and state='processing';
 if not found then raise exception 'Invalid claim';end if;
end $$;
revoke all on function public.mb_queue_payment_reconciliation(text),public.mb_claim_payment_reconciliation(),public.mb_finish_payment_reconciliation(uuid,text)from public,anon,authenticated;
grant execute on function public.mb_queue_payment_reconciliation(text),public.mb_claim_payment_reconciliation(),public.mb_finish_payment_reconciliation(uuid,text)to service_role;
-- Bounded manual rescan of known real provider IDs, independent of webhooks.
-- Simulated payments are explicitly excluded; no network call occurs here.
create function public.mb_seed_payment_reconciliation(p_limit integer default 100)returns integer
language plpgsql security invoker set search_path='' as $$
declare r record;n integer:=0;begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid batch';end if;
 for r in select distinct p.referencia_externa from public.pago p left join private.payment_reconciliation_job j on j.payment_id=p.referencia_externa
 where p.metodo='mercadopago'and not p.simulado and p.referencia_externa~'^[0-9]{1,30}$'and(j.payment_id is null or j.state='done')
 order by p.referencia_externa limit p_limit loop
 perform public.mb_queue_payment_reconciliation(r.referencia_externa);n:=n+1;
 end loop;return n;
end $$;
revoke all on function public.mb_seed_payment_reconciliation(integer)from public,anon,authenticated;
grant execute on function public.mb_seed_payment_reconciliation(integer)to service_role;
create function public.mb_worker_status()returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('email_pending',(select count(*)from private.order_email_event where state in('pending','retry')),
 'email_review',(select count(*)from private.order_email_event where state='review'),
 'email_oldest_seconds',(select coalesce(extract(epoch from now()-min(coalesce(e.created_at,p.creado_en))),0)::integer from private.order_email_event e join public.pedido p on p.id=e.pedido_id where e.state in('pending','retry')),
 'payment_pending',(select count(*)from private.payment_reconciliation_job where state in('pending','retry')),
 'payment_review',(select count(*)from private.payment_reconciliation_job where state='review'),
 'payment_oldest_seconds',(select coalesce(extract(epoch from now()-min(created_at)),0)::integer from private.payment_reconciliation_job where state in('pending','retry')),
 'financial_holds',(select count(*)from private.order_financial_hold),
 'email_receipt_alerts',(select count(*)from private.order_email_receipt where kind in('email.bounced','email.complained','email.failed')));
$$;
revoke all on function public.mb_worker_status()from public,anon,authenticated;
grant execute on function public.mb_worker_status()to service_role;
notify pgrst,'reload schema';
commit;
