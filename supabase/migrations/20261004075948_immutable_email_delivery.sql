-- LOCAL ONLY: encrypted recipient/body/private capability, frozen per event.
create table private.order_email_delivery (
 event_id uuid primary key references private.order_email_event(id),
 ciphertext text not null check(length(ciphertext) between 30 and 500000),
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 prepared_at timestamptz not null default clock_timestamp(),
 provider_id uuid unique,accepted_at timestamptz
);
alter table private.order_email_delivery enable row level security;
revoke all on private.order_email_delivery from public,anon,authenticated;
grant select,insert,update on private.order_email_delivery to service_role;
create function private.mb_email_envelope_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.event_id<>old.event_id or new.ciphertext<>old.ciphertext or new.digest<>old.digest or new.prepared_at<>old.prepared_at
 or (old.provider_id is not null and new.provider_id is distinct from old.provider_id)
 then raise exception 'Envelope inmutable';end if;
 return new;
end $$;
create trigger email_envelope_immutable before update on private.order_email_delivery
for each row execute function private.mb_email_envelope_immutable();
create function public.mb_email_delivery_for_claim(p_claim_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select to_jsonb(d) from private.order_email_delivery d join private.order_email_event e on e.id=d.event_id
 where e.claim_id=p_claim_id and e.state='processing';
$$;
create function public.mb_prepare_email_delivery(p_claim_id uuid,p_ciphertext text,p_digest text,p_link_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e private.order_email_event; d private.order_email_delivery;
begin
 select * into e from private.order_email_event where claim_id=p_claim_id and state='processing' for update;
 if not found then raise exception 'Claim no vigente';end if;
 select * into d from private.order_email_delivery where event_id=e.id;
 if found then return to_jsonb(d);end if;
 if p_ciphertext is null or p_ciphertext !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then raise exception 'Envelope invalido';end if;
 perform public.mb_issue_order_link(p_claim_id,p_link_hash);
 insert into private.order_email_delivery(event_id,ciphertext,digest)values(e.id,p_ciphertext,p_digest)returning * into d;
 return to_jsonb(d);
end $$;
create function public.mb_finish_email_delivery(p_claim_id uuid,p_provider_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e private.order_email_event; d private.order_email_delivery;
begin
 if p_provider_id is null then raise exception 'Provider id requerido';end if;
 select * into e from private.order_email_event where claim_id=p_claim_id and state='processing' for update;
 if not found then raise exception 'Claim no vigente';end if;
 select * into d from private.order_email_delivery where event_id=e.id for update;
 if not found or (d.provider_id is not null and d.provider_id<>p_provider_id)then raise exception 'Delivery inconsistente';end if;
 update private.order_email_delivery set provider_id=p_provider_id,accepted_at=clock_timestamp() where event_id=e.id;
 perform public.mb_finish_order_email(p_claim_id,'sent');
end $$;
revoke all on function public.mb_email_delivery_for_claim(uuid),public.mb_prepare_email_delivery(uuid,text,text,text),public.mb_finish_email_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mb_email_delivery_for_claim(uuid),public.mb_prepare_email_delivery(uuid,text,text,text),public.mb_finish_email_delivery(uuid,uuid) to service_role;
revoke all on function private.mb_email_envelope_immutable() from public,anon,authenticated;
grant execute on function private.mb_email_envelope_immutable() to service_role;
create table private.order_email_receipt (
 notification_id text primary key check(notification_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 provider_id uuid not null,kind text not null check(kind in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed')),
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),occurred_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp()
);
create index order_email_receipt_provider on private.order_email_receipt(provider_id);
alter table private.order_email_receipt enable row level security;
revoke all on private.order_email_receipt from public,anon,authenticated;
grant select,insert on private.order_email_receipt to service_role;
create function public.mb_record_email_receipt(p_notification_id text,p_provider_id uuid,p_type text,p_digest text,p_occurred_at timestamptz)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r private.order_email_receipt; added boolean;
begin
 if p_provider_id is null or p_occurred_at is null or p_occurred_at>clock_timestamp()+interval '5 minutes' then raise exception 'Receipt invalido';end if;
 insert into private.order_email_receipt(notification_id,provider_id,kind,digest,occurred_at)
 values(p_notification_id,p_provider_id,p_type,p_digest,p_occurred_at)on conflict do nothing;
 added:=found;
 select * into r from private.order_email_receipt where notification_id=p_notification_id;
 if r.digest is distinct from p_digest or r.provider_id is distinct from p_provider_id or r.kind is distinct from p_type then raise exception 'Receipt conflictivo';end if;
 return jsonb_build_object('duplicate',not added,'matched',exists(select 1 from private.order_email_delivery where provider_id=p_provider_id));
end $$;
revoke all on function public.mb_record_email_receipt(text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.mb_record_email_receipt(text,uuid,text,text,timestamptz) to service_role;

-- Do not send a payment/dispatch confirmation during a financial hold.
create or replace function public.mb_claim_order_email() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e private.order_email_event; c uuid;
begin
 -- An abandoned send may already have reached the provider: manual review.
 update private.order_email_event set state='review' where state='processing' and claimed_at<clock_timestamp()-interval '5 minutes';
 select * into e from private.order_email_event where state in ('pending','retry') and attempts<5 and (kind not in ('paid','shipped') or not exists(select 1 from private.order_financial_hold h where h.pedido_id=private.order_email_event.pedido_id))
 and available_at<=clock_timestamp() order by available_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 c:=gen_random_uuid();
 update private.order_email_event set state='processing',attempts=attempts+1,claim_id=c,claimed_at=clock_timestamp() where id=e.id;
 return jsonb_build_object('id',e.id,'claim_id',c,'pedido_id',e.pedido_id,'kind',e.kind,
  'order',private.mb_order_view(e.pedido_id),'email',(select coalesce(direccion_entrega->'destinatario'->>'email',direccion_entrega->>'email') from public.pedido where id=e.pedido_id));
end $$;
