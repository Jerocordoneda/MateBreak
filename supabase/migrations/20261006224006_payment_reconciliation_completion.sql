-- Close synchronous work and audit its authoritative result atomically.
-- No backfill or business-row mutation runs when this migration is applied.
create function public.mb_complete_payment_reconciliation(p_payment_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 o private.mp_payment_observation; j private.payment_reconciliation_job;
 v_review boolean; v_result text;
begin
 if p_payment_id is null or p_payment_id !~ '^[0-9]{1,30}$' then raise exception 'Invalid payment identity'; end if;
 -- Same lock order as the authoritative reconciler; concurrent deliveries use
 -- the latest committed observation, not an earlier caller's return value.
 perform pg_advisory_xact_lock(782204,1);
 select * into o from private.mp_payment_observation where payment_id=p_payment_id for update;
 if not found then return null; end if;
 select * into j from private.payment_reconciliation_job where payment_id=p_payment_id for update;
 if not found then return null; end if;
 v_review:=o.outcome='revision_manual' or exists(select 1 from private.order_financial_hold where pedido_id=o.pedido_id);
 v_result:=case when v_review then 'revision_manual' when o.outcome='aplicado' then 'aplicado' else 'pendiente' end;
 -- The timestamp is the first enqueue, not a fabricated new delivery time.
 -- This audit stores authenticated reconciliation, not an untrusted envelope;
 -- HMAC evidence remains the webhook's guarded enqueue path and request logs.
 insert into public.pago_webhook_auditoria(pago_externo_id,estado_externo,pedido_id,resultado,recibido_en)
 values(o.payment_id,o.provider_status,o.pedido_id,v_result,j.created_at)
 on conflict(pago_externo_id,estado_externo) do update set resultado=excluded.resultado;
 -- An active worker keeps its claim and completes through mb_finish_*.
 -- Synchronous reconciliation is not a worker attempt, so attempts stays 0.
 if j.state in('pending','retry') then
  update private.payment_reconciliation_job set state=case when v_review then 'review' else 'done' end,
   claim_id=null,claimed_at=null where payment_id=p_payment_id;
 end if;
 return jsonb_build_object('outcome',v_result,'review',v_review);
end $$;
revoke all on function public.mb_complete_payment_reconciliation(text) from public,anon,authenticated;
grant execute on function public.mb_complete_payment_reconciliation(text) to service_role;
