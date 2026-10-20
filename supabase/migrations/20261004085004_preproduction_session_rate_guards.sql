begin;
-- Private, narrowly scoped definer: authenticated cannot read auth.sessions.
-- No arguments, target IDs or editable metadata; exposes only current session.
create function private.mb_current_session_live() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where u.id=auth.uid() and not coalesce(u.is_anonymous,false)
 and u.email_confirmed_at is not null
 and s.id::text=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
 and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function private.mb_current_session_live() from public,anon,service_role;
grant usage on schema private to authenticated;
grant execute on function private.mb_current_session_live() to authenticated;
-- Restrictive policies preserve every existing ownership predicate.
create policy live_perfil on public.perfil as restrictive for all to authenticated
using ((select private.mb_current_session_live())) with check ((select private.mb_current_session_live()));
create policy live_direccion on public.direccion as restrictive for all to authenticated
using ((select private.mb_current_session_live())) with check ((select private.mb_current_session_live()));
create policy live_email on public.email_contacto as restrictive for all to authenticated
using ((select private.mb_current_session_live())) with check ((select private.mb_current_session_live()));
create policy live_pedido on public.pedido as restrictive for select to authenticated using ((select private.mb_current_session_live()));
create policy live_items on public.pedido_item as restrictive for select to authenticated using ((select private.mb_current_session_live()));
create policy live_pagos on public.pago as restrictive for select to authenticated using ((select private.mb_current_session_live()));
create policy live_envios on public.envio as restrictive for select to authenticated using ((select private.mb_current_session_live()));

create table private.security_rate_bucket(
 bucket text primary key check(bucket~'^[a-f0-9]{64}$'),window_start timestamptz not null,
 hits integer not null check(hits>0),expires_at timestamptz not null);
alter table private.security_rate_bucket enable row level security;
revoke all on private.security_rate_bucket from public,anon,authenticated;
grant all on private.security_rate_bucket to service_role;
create function public.mb_security_rate_take(p_bucket text,p_limit integer,p_seconds integer default 60) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare n timestamptz:=clock_timestamp();r private.security_rate_bucket;
begin
 if p_limit not between 1 and 10000 or p_seconds not between 1 and 3600 then raise exception 'Invalid quota';end if;
 insert into private.security_rate_bucket(bucket,window_start,hits,expires_at)values(p_bucket,n,1,n+make_interval(secs=>p_seconds))
 on conflict(bucket)do update set
 window_start=case when security_rate_bucket.expires_at<=n then n else security_rate_bucket.window_start end,
 hits=case when security_rate_bucket.expires_at<=n then 1 else least(1000000,security_rate_bucket.hits+1)end,
 expires_at=case when security_rate_bucket.expires_at<=n then n+make_interval(secs=>p_seconds)else security_rate_bucket.expires_at end
 returning * into r;
 return jsonb_build_object('allowed',r.hits<=p_limit,'retry_after',greatest(1,ceil(extract(epoch from r.expires_at-n))::integer));
end $$;
revoke all on function public.mb_security_rate_take(text,integer,integer) from public,anon,authenticated;
grant execute on function public.mb_security_rate_take(text,integer,integer)to service_role;
create function public.mb_security_rate_cleanup()returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;begin delete from private.security_rate_bucket where expires_at<now()-interval '1 hour';get diagnostics n=row_count;return n;end $$;
revoke all on function public.mb_security_rate_cleanup()from public,anon,authenticated;
grant execute on function public.mb_security_rate_cleanup()to service_role;
notify pgrst,'reload schema';
commit;
