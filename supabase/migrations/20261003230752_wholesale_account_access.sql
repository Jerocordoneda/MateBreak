-- Strict wholesale-only session checks; no change to retail guest checkout.
grant usage on schema auth to service_role;
grant select(id,email_confirmed_at,is_anonymous) on auth.users to service_role;
grant select(id,user_id,not_after) on auth.sessions to service_role;
create function public.mb_wholesale_access(p_user uuid,p_session uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=p_user and s.id=p_session and u.email_confirmed_at is not null
 and not coalesce(u.is_anonymous,false) and (s.not_after is null or s.not_after>now()))
$$;
revoke all on function public.mb_wholesale_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mb_wholesale_access(uuid,uuid) to service_role;

-- Nullable ownership keeps historical guest leads and events untouched.
alter table private.wholesale_request add column account_id uuid references auth.users(id);
alter table private.wholesale_request add constraint wholesale_account_owner_matches check(account_id is null or owner_hash=md5('matebreak-account:'||account_id::text)||md5('wholesale-account:'||account_id::text));
create function private.wholesale_account_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.account_id is not null and new.account_id is distinct from old.account_id then raise exception 'La cuenta de la solicitud no se puede cambiar';end if;
 return new;
end $$;
revoke all on function private.wholesale_account_immutable() from public,anon,authenticated;
create trigger wholesale_account_immutable before update of account_id on private.wholesale_request for each row execute function private.wholesale_account_immutable();
create index wholesale_request_account_date on private.wholesale_request(account_id,created_at desc) where account_id is not null;
grant update(account_id) on private.wholesale_request to service_role;
-- Legacy capability is no longer an exposed RPC; internal reuse preserves its
-- advisory lock, authoritative quote, payload comparison and history behavior.
alter function public.mb_wholesale_submit(text,uuid,jsonb,jsonb,text) set schema private;
create function public.mb_wholesale_submit_account(p_user uuid,p_session uuid,p_key uuid,p_buyer jsonb,p_items jsonb,p_ref text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner text; receipt jsonb;
begin
 if not public.mb_wholesale_access(p_user,p_session) then raise exception using errcode='42501',message='Sesión mayorista inválida';end if;
 owner:=md5('matebreak-account:'||p_user::text)||md5('wholesale-account:'||p_user::text);
 receipt:=private.mb_wholesale_submit(owner,p_key,p_buyer,p_items,p_ref);
 update private.wholesale_request set account_id=p_user where owner_hash=owner and idempotency=p_key and account_id is null;
 if not exists(select 1 from private.wholesale_request where owner_hash=owner and idempotency=p_key and account_id=p_user) then raise exception 'Propietario de solicitud inválido';end if;
 return receipt;
end $$;
create function public.mb_wholesale_own(p_user uuid,p_session uuid,p_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.mb_wholesale_access(p_user,p_session) then raise exception using errcode='42501',message='Sesión mayorista inválida';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select id,'MAY-'||lpad(number::text,greatest(4,length(number::text)),'0') number,state,buyer,quote,created_at
 from private.wholesale_request where account_id=p_user and (p_id is null or id=p_id) order by created_at desc limit 100
 )x),'[]');
end $$;
revoke all on function public.mb_wholesale_submit_account(uuid,uuid,uuid,jsonb,jsonb,text),public.mb_wholesale_own(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mb_wholesale_submit_account(uuid,uuid,uuid,jsonb,jsonb,text),public.mb_wholesale_own(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
