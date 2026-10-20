-- No historical order is changed or queued. Future events only.
alter table public.pago add column simulado boolean not null default false,
 add column card_brand text check(card_brand in ('visa','master','mastercard','amex')),
 add column card_last4 text check(card_last4 ~ '^[0-9]{4}$'),
 add constraint payment_display_complete check((card_brand is null)=(card_last4 is null));
create function public.mb_record_payment_display(p_payment_id uuid,p_brand text,p_last4 text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_brand is null or p_brand not in ('visa','master','mastercard','amex') or p_last4 is null or p_last4 !~ '^[0-9]{4}$' then raise exception 'Presentacion invalida'; end if;
 update public.pago set card_brand=p_brand,card_last4=p_last4 where id=p_payment_id and metodo='mercadopago';
 if not found then raise exception 'Pago no disponible'; end if;
end $$;
revoke all on function public.mb_record_payment_display(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mb_record_payment_display(uuid,text,text) to service_role;
create function public.mb_mark_mock_payment(p_payment_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update public.pago set simulado=true where id=p_payment_id and metodo='mercadopago' and estado='pendiente' and referencia_externa is null;
 if not found then raise exception 'Pago no disponible para simulacion'; end if;
end $$;
revoke all on function public.mb_mark_mock_payment(uuid) from public,anon,authenticated;
grant execute on function public.mb_mark_mock_payment(uuid) to service_role;
create table private.order_access (
 id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedido(id),
 link_hash text not null unique check(link_hash ~ '^[a-f0-9]{64}$'),
 session_hash text unique check(session_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, session_expires_at timestamptz, redeemed_at timestamptz,
 revoked_at timestamptz, created_at timestamptz not null default now()
);
create table private.order_email_event (
 id uuid primary key default gen_random_uuid(),pedido_id uuid not null references public.pedido(id),
 kind text not null check(kind in ('received','paid','pending','cancelled','shipped','renewal')),
 event_key text not null, unique(pedido_id,event_key),
 state text not null default 'pending' check(state in ('pending','processing','retry','sent','review')),
 attempts integer not null default 0, claim_id uuid, claimed_at timestamptz,
 available_at timestamptz not null default now(), sent_at timestamptz
);
create table private.order_dispatch (
 pedido_id uuid primary key references public.pedido(id),tracking text not null,
 carrier text not null check(carrier='correo_argentino'),
 provider_state text not null check(provider_state in ('accepted','in_transit','delivered')),
 verified_at timestamptz not null, environment text not null check(environment='production')
);
alter table private.order_access enable row level security;
alter table private.order_email_event enable row level security;
alter table private.order_dispatch enable row level security;
revoke all on private.order_access,private.order_email_event,private.order_dispatch from public,anon,authenticated;
grant select,insert,update on private.order_access,private.order_email_event,private.order_dispatch to service_role;

create function private.mb_order_email_events() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.direccion_entrega->'destinatario' is not null and old.direccion_entrega->'destinatario' is null then
  insert into private.order_email_event(pedido_id,kind,event_key) values(new.id,'received','received') on conflict do nothing;
 end if;
 if new.estado is distinct from old.estado and new.direccion_entrega->'destinatario' is not null then
  if new.estado='pagado' then
   insert into private.order_email_event(pedido_id,kind,event_key) values(new.id,'paid','paid') on conflict do nothing;
  elsif new.estado in ('cancelado','expirado') then
   insert into private.order_email_event(pedido_id,kind,event_key) values(new.id,'cancelled','cancelled') on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
create trigger order_transactional_email after update of direccion_entrega,estado on public.pedido
for each row execute function private.mb_order_email_events();

create function private.mb_order_view(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',o.id,'numero',coalesce(o.numero_publico::text,upper(left(o.id::text,8))),
  'estado',o.estado,'moneda',o.moneda,'reserva_hasta',o.reserva_hasta,'subtotal_mercaderia',o.subtotal_mercaderia,
  'descuento_productos',o.descuento_productos,'costo_envio',o.costo_envio,'total',o.total,
  'direccion_entrega',jsonb_build_object('modalidad',o.direccion_entrega->'modalidad','destinatario',
   (case when jsonb_typeof(o.direccion_entrega->'destinatario')='object' then o.direccion_entrega->'destinatario' else o.direccion_entrega end)-'email'-'telefono'-'referencia'),
  'items',(select coalesce(jsonb_agg(jsonb_build_object('nombre',i.nombre,'cantidad',i.cantidad,
   'precio_unitario',i.precio_unitario,'precio_original',i.precio_original,'imagen_storage_path',i.imagen_storage_path,
   'opciones',i.opciones,'personalizacion',i.personalizacion)),'[]') from public.pedido_item i where i.pedido_id=o.id),
  'pagos',(select coalesce(jsonb_agg(jsonb_build_object('metodo',g.metodo,'estado',g.estado,
    'card_brand',g.card_brand,'card_last4',g.card_last4,
    'simulado',g.simulado or (g.metodo='mercadopago' and g.referencia_externa='TEST-LOCAL-'||o.id::text))),'[]') from public.pago g where g.pedido_id=o.id),
  'envio',(select jsonb_build_object('estado',e.estado,'transportista',e.transportista) from public.envio e where e.pedido_id=o.id),
  'tracking',(select jsonb_build_object('codigo',d.tracking,'estado',d.provider_state,'verificado_en',d.verified_at) from private.order_dispatch d where d.pedido_id=o.id))
 from public.pedido o where o.id=p_id;
$$;
-- Cart capability read uses the same minimized view; no internal idempotency,
-- cart IDs, provider references, contact email or telephone are returned.
create or replace function public.mb_pedido_por_carrito(p_pedido_id uuid,p_token_hash text,p_usuario_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select private.mb_order_view(o.id) from public.pedido o join public.carrito c on c.id=o.carrito_id
 where o.id=p_pedido_id and ((p_usuario_id is not null and o.usuario_id=p_usuario_id)
 or (c.token_hash=p_token_hash and c.expira_en>clock_timestamp() and (c.usuario_id is null or c.usuario_id=p_usuario_id)));
$$;
create function public.mb_exchange_order_link(p_link_hash text,p_session_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare g private.order_access;
begin
 if p_link_hash is null or p_session_hash is null or p_link_hash !~ '^[a-f0-9]{64}$' or p_session_hash !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into g from private.order_access where link_hash=p_link_hash and revoked_at is null
  and redeemed_at is null and expires_at>clock_timestamp() for update;
 if not found then return null; end if;
 update private.order_access set redeemed_at=clock_timestamp(),session_hash=p_session_hash,
  session_expires_at=least(expires_at,clock_timestamp()+interval '24 hours') where id=g.id;
 return g.pedido_id;
end $$;
create function public.mb_read_order_link(p_order_id uuid,p_session_hash text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select private.mb_order_view(g.pedido_id) from private.order_access g
 where g.pedido_id=p_order_id and g.session_hash=p_session_hash and g.revoked_at is null
 and g.expires_at>clock_timestamp() and g.session_expires_at>clock_timestamp();
$$;
create function public.mb_request_order_link(p_number text,p_email text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 insert into private.order_email_event(pedido_id,kind,event_key)
 select o.id,'renewal','renewal:'||to_char(now() at time zone 'UTC','YYYY-MM-DD') from public.pedido o
 where coalesce(o.numero_publico::text,upper(left(o.id::text,8)))=p_number
 and lower(coalesce(o.direccion_entrega->'destinatario'->>'email',o.direccion_entrega->>'email'))=lower(p_email)
 on conflict do nothing;
end $$;
create function public.mb_claim_order_email() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e private.order_email_event; c uuid;
begin
 -- An abandoned send may already have reached the provider: manual review.
 update private.order_email_event set state='review' where state='processing' and claimed_at<clock_timestamp()-interval '5 minutes';
 select * into e from private.order_email_event where state in ('pending','retry') and attempts<5
 and available_at<=clock_timestamp() order by available_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 c:=gen_random_uuid();
 update private.order_email_event set state='processing',attempts=attempts+1,claim_id=c,claimed_at=clock_timestamp() where id=e.id;
 return jsonb_build_object('id',e.id,'claim_id',c,'pedido_id',e.pedido_id,'kind',e.kind,
  'order',private.mb_order_view(e.pedido_id),'email',(select coalesce(direccion_entrega->'destinatario'->>'email',direccion_entrega->>'email') from public.pedido where id=e.pedido_id));
end $$;
create function public.mb_issue_order_link(p_claim_id uuid,p_link_hash text) returns void
language plpgsql security invoker set search_path='' as $$
declare e private.order_email_event;
begin
 select * into e from private.order_email_event where claim_id=p_claim_id and state='processing' for update;
 if not found then raise exception 'Claim no vigente'; end if;
 insert into private.order_access(pedido_id,link_hash,expires_at) values(e.pedido_id,p_link_hash,clock_timestamp()+interval '7 days');
end $$;
create function public.mb_finish_order_email(p_claim_id uuid,p_outcome text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_outcome not in ('sent','retry','review') then raise exception 'Resultado invalido'; end if;
 update private.order_email_event set state=case when p_outcome='retry' and attempts>=5 then 'review' else p_outcome end,sent_at=case when p_outcome='sent' then clock_timestamp() else null end,
 available_at=clock_timestamp()+interval '1 minute'*power(2,attempts)
 where claim_id=p_claim_id and state='processing';
 if not found then raise exception 'Claim no vigente'; end if;
end $$;
-- Internal operator recovery only. Never exposed as a customer mutation.
create function public.mb_revoke_order_links(p_order_id uuid) returns void
language sql security invoker set search_path='' as $$
 update private.order_access set revoked_at=clock_timestamp() where pedido_id=p_order_id and revoked_at is null;
$$;
revoke all on function public.mb_revoke_order_links(uuid) from public,anon,authenticated;
grant execute on function public.mb_revoke_order_links(uuid) to service_role;
create function public.mb_record_verified_dispatch(p_order_id uuid,p_tracking text,p_state text) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.pedido;
begin
 if p_tracking !~ '^[A-Z0-9]{8,30}$' or p_state not in ('accepted','in_transit','delivered') then raise exception 'Seguimiento invalido'; end if;
 select * into o from public.pedido where id=p_order_id for update;
 if not found or o.estado not in ('en_preparacion','enviado','entregado') or not exists(
  select 1 from public.envio where pedido_id=o.id and snapshot->>'environment'='production' and estado_integracion='importado')
 then raise exception 'Despacho no verificable'; end if;
 if o.estado='en_preparacion' then perform public.mb_actualizar_envio(o.id,'enviado','Correo Argentino',p_tracking); end if;
 insert into private.order_dispatch(pedido_id,tracking,carrier,provider_state,verified_at,environment)
 values(o.id,p_tracking,'correo_argentino',p_state,clock_timestamp(),'production')
 on conflict(pedido_id) do update set provider_state=excluded.provider_state,verified_at=excluded.verified_at
 where private.order_dispatch.tracking=excluded.tracking;
 if not found then raise exception 'Seguimiento diferente requiere revision'; end if;
 insert into private.order_email_event(pedido_id,kind,event_key) values(o.id,'shipped','shipped') on conflict do nothing;
end $$;
revoke all on function private.mb_order_email_events(),private.mb_order_view(uuid),public.mb_exchange_order_link(text,text),
 public.mb_read_order_link(uuid,text),public.mb_request_order_link(text,text),public.mb_claim_order_email(),public.mb_issue_order_link(uuid,text),
 public.mb_finish_order_email(uuid,text),public.mb_record_verified_dispatch(uuid,text,text) from public,anon,authenticated;
grant execute on function private.mb_order_email_events(),private.mb_order_view(uuid),public.mb_exchange_order_link(text,text),
 public.mb_read_order_link(uuid,text),public.mb_request_order_link(text,text),public.mb_claim_order_email(),public.mb_issue_order_link(uuid,text),
 public.mb_finish_order_email(uuid,text),public.mb_record_verified_dispatch(uuid,text,text) to service_role;
