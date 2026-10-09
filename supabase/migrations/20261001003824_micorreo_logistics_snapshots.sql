-- Logistics are backend-only. Existing quotes are invalidated, never backfilled
-- from a mutable catalog. Existing paid orders require manual logistics review.
alter table public.checkout_cotizacion_envio add column snapshot jsonb, add column fingerprint text;
alter table public.pedido add column cotizacion_envio_id uuid references public.checkout_cotizacion_envio(id) on delete restrict;
alter table public.envio add column snapshot jsonb, add column estado_integracion text not null default 'no_preparado'
 check(estado_integracion in ('no_preparado','esperando_pago','pendiente','importado','error','revision'));
create table private.envio_bulto (
 pedido_id uuid not null references public.pedido(id) on delete restrict,
 bulto integer not null check(bulto between 1 and 20),
 ext_order_id text not null unique,
 estado text not null default 'pendiente' check(estado in ('pendiente','procesando','importado','error','revision')),
 intento integer not null default 0, claim_id uuid, iniciado_en timestamptz, proximo_intento timestamptz not null default now(),
 created_at text, error_tipo text,
 primary key(pedido_id,bulto)
);
create table private.envio_importacion_intento (
 claim_id uuid primary key, pedido_id uuid not null, bulto integer not null,
 intento integer not null, iniciado_en timestamptz not null default now(), terminado_en timestamptz,
 resultado text, error_tipo text, provider_status integer, request_id uuid,
 foreign key(pedido_id,bulto) references private.envio_bulto on delete restrict
);
alter table private.envio_bulto enable row level security;
alter table private.envio_importacion_intento enable row level security;
revoke all on private.envio_bulto,private.envio_importacion_intento from public,anon,authenticated;
grant select,insert,update on private.envio_bulto,private.envio_importacion_intento to service_role;
-- PG jsonb canonicalizes object keys. Array order is explicit and versioned.
create function public.mb_shipping_fingerprint(p_carrito_id uuid,p_snapshot jsonb) returns text
language sql stable security invoker set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  jsonb_build_object('version',1,'cart',p_carrito_id,'snapshot',p_snapshot,
   'variants',coalesce((select jsonb_agg(jsonb_build_object('variant',cv.variante_id,'quantity',cv.cantidad,
     'personalization',cv.personalizacion,'product',v.producto_id,'type',p.tipo,
     'categories',(select jsonb_agg(cat.slug order by cat.slug) from public.catalogo_producto_categoria pc
       join public.catalogo_categoria cat on cat.id=pc.categoria_id where pc.producto_id=v.producto_id))
     order by cv.variante_id) from public.carrito_variante cv
    join public.catalogo_variante v on v.id=cv.variante_id join public.producto p on p.id_producto=v.producto_id
    where cv.carrito_id=p_carrito_id),'[]'::jsonb),
   'legacy',coalesce((select jsonb_agg(jsonb_build_object('product',ci.producto_id,'quantity',ci.cantidad)
      order by ci.producto_id) from public.carrito_item ci where ci.carrito_id=p_carrito_id),'[]'::jsonb))::text,
 'UTF8')),'hex')
 where p_snapshot->'cartItems' is not distinct from coalesce(
  (select jsonb_agg(jsonb_build_object('variant',cv.variante_id::text,'product',v.producto_id::text,
    'quantity',cv.cantidad,'personalization',cv.personalizacion) order by cv.variante_id)
   from public.carrito_variante cv join public.catalogo_variante v on v.id=cv.variante_id
   where cv.carrito_id=p_carrito_id),'[]'::jsonb)
$$;
revoke all on function public.mb_shipping_fingerprint(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mb_shipping_fingerprint(uuid,jsonb) to service_role;
-- Preserve the previously validated lifecycle behind a private, invoker function.
alter function public.mb_checkout_minorista(text,uuid,jsonb) rename to mb_checkout_minorista_v1;
alter function public.mb_checkout_minorista_v1(text,uuid,jsonb) set schema private;
revoke all on function private.mb_checkout_minorista_v1(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.mb_checkout_minorista_v1(text,uuid,jsonb) to service_role;
create function public.mb_checkout_minorista(p_token_hash text,p_usuario_id uuid,p_datos jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.carrito; q public.checkout_cotizacion_envio; o public.pedido; result jsonb; snap jsonb;
 n integer; i integer; cents bigint; part_cents bigint; parcel jsonb; parcels jsonb:='[]';
begin
 if p_usuario_id is null then raise exception 'Inicia sesion'; end if;
 perform pg_advisory_xact_lock(782204,1);
 perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text,0));
 select * into o from public.pedido where usuario_id=p_usuario_id and idempotencia=(p_datos->>'idempotencia')::uuid;
 if found then
  if o.cotizacion_envio_id is distinct from nullif(p_datos->>'cotizacion_id','')::uuid then raise exception 'Cotizacion de otro intento'; end if;
  return private.mb_checkout_minorista_v1(p_token_hash,p_usuario_id,p_datos);
 end if;
 select * into c from public.carrito where token_hash=p_token_hash for update;
 if not found or c.usuario_id is not null and c.usuario_id<>p_usuario_id then raise exception 'Carrito inexistente'; end if;
 if p_datos->>'envio'<>'retiro' then
  select * into q from public.checkout_cotizacion_envio where id=(p_datos->>'cotizacion_id')::uuid
    and usuario_id=p_usuario_id and carrito_id=c.id and modalidad=p_datos->>'envio'
    and destinatario=p_datos->'destinatario' and valido_hasta>clock_timestamp() for share;
  if not found or q.snapshot is null or q.fingerprint is null or
    q.fingerprint is distinct from public.mb_shipping_fingerprint(c.id,q.snapshot) then raise exception 'Cotizacion vencida o carrito modificado'; end if;
  if jsonb_typeof(q.snapshot->'parcels') is distinct from 'array'
    or jsonb_array_length(q.snapshot->'parcels') not between 1 and 20 then raise exception 'Snapshot logistico invalido'; end if;
 end if;
 result:=private.mb_checkout_minorista_v1(p_token_hash,p_usuario_id,p_datos);
 if q.id is not null then
  update public.pedido set cotizacion_envio_id=q.id where id=(result->>'id')::uuid returning * into o;
  n:=jsonb_array_length(q.snapshot->'parcels'); cents:=round(o.subtotal*100)::bigint;
  -- Declare merchandise value after product discounts. Allocate exact cents,
  -- equally per parcel: deterministic policy, total always reconciles.
  for i in 0..n-1 loop
   part_cents:=cents/n+case when i<cents%n then 1 else 0 end;
   parcel:=(q.snapshot->'parcels'->i)||jsonb_build_object('declaredValue',part_cents/100.0);
   parcels:=parcels||jsonb_build_array(parcel);
   insert into private.envio_bulto(pedido_id,bulto,ext_order_id) values(o.id,i+1,'MB-'||o.id::text||'-'||(i+1));
  end loop;
  snap:=q.snapshot||jsonb_build_object('quoteId',q.id,'service',q.servicio,'carrierCost',q.costo_transportista,
    'validTo',q.valido_hasta,'fingerprint',q.fingerprint,'parcels',parcels);
  update public.envio set snapshot=snap,estado_integracion='esperando_pago' where pedido_id=o.id;
  result:=to_jsonb(o);
 end if;
 return result;
end $$;
revoke all on function public.mb_checkout_minorista(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mb_checkout_minorista(text,uuid,jsonb) to service_role;
create function private.mb_logistics_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.snapshot is not null and old.snapshot is distinct from new.snapshot then raise exception 'Snapshot inmutable'; end if;
 return new;
end $$;
create trigger envio_snapshot_immutable before update on public.envio for each row execute function private.mb_logistics_immutable();
create function private.mb_order_quote_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.cotizacion_envio_id is not null and old.cotizacion_envio_id is distinct from new.cotizacion_envio_id then raise exception 'Relacion de cotizacion inmutable'; end if;
 return new;
end $$;
create trigger pedido_quote_immutable before update of cotizacion_envio_id on public.pedido for each row execute function private.mb_order_quote_immutable();
create function private.mb_quote_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Cotizacion inmutable'; end $$;
create trigger quote_immutable before update on public.checkout_cotizacion_envio for each row execute function private.mb_quote_immutable();
create function private.mb_logistics_paid() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.estado='pagado' and old.estado is distinct from new.estado then
  update public.envio set estado_integracion=case when snapshot is null then 'no_preparado' else 'pendiente' end where pedido_id=new.id;
 end if;
 return new;
end $$;
create trigger pedido_logistics_paid after update of estado on public.pedido for each row execute function private.mb_logistics_paid();
create function public.mb_claim_shipment(p_environment text) returns jsonb
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
  where o.estado='pagado' and e.snapshot->>'environment'=p_environment
   and b0.estado in ('pendiente','error') and b0.intento<3 and b0.proximo_intento<=clock_timestamp()
  order by o.creado_en,b0.bulto limit 1 for update of b0 skip locked;
 if not found then return null; end if;
 cid:=gen_random_uuid();
 update private.envio_bulto set estado='procesando',intento=intento+1,claim_id=cid,iniciado_en=clock_timestamp() where pedido_id=b.pedido_id and bulto=b.bulto;
 insert into private.envio_importacion_intento(claim_id,pedido_id,bulto,intento) values(cid,b.pedido_id,b.bulto,b.intento+1);
 select snapshot into s from public.envio where pedido_id=b.pedido_id;
 return jsonb_build_object('claimId',cid,'orderId',b.pedido_id,'parcelNumber',b.bulto,'extOrderId',b.ext_order_id,'snapshot',s,'parcel',s->'parcels'->(b.bulto-1));
end $$;
create function public.mb_finish_shipment(p_claim_id uuid,p_result jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare b private.envio_bulto; v_state text; v_type text;
begin
 select * into b from private.envio_bulto where claim_id=p_claim_id and estado='procesando' for update;
 if not found then raise exception 'Claim no vigente'; end if;
 v_state:=p_result->>'state'; v_type:=p_result->>'errorType';
 if v_state not in ('importado','error','revision') or coalesce(v_type,'') !~ '^[a-z_]{0,40}$' then raise exception 'Resultado invalido'; end if;
 update private.envio_bulto set estado=v_state,created_at=p_result->>'createdAt',error_tipo=v_type,
  proximo_intento=clock_timestamp()+interval '1 minute'*power(2,b.intento) where pedido_id=b.pedido_id and bulto=b.bulto;
 update private.envio_importacion_intento set terminado_en=clock_timestamp(),resultado=v_state,error_tipo=v_type,
  provider_status=(p_result->>'status')::integer,request_id=nullif(p_result->>'requestId','')::uuid where claim_id=p_claim_id;
 update public.envio set estado_integracion=case
  when exists(select 1 from private.envio_bulto where pedido_id=b.pedido_id and estado='revision') then 'revision'
  when not exists(select 1 from private.envio_bulto where pedido_id=b.pedido_id and estado<>'importado') then 'importado'
  when exists(select 1 from private.envio_bulto where pedido_id=b.pedido_id and estado='error') then 'error'
  else 'pendiente' end where pedido_id=b.pedido_id;
end $$;
revoke all on function private.mb_order_quote_immutable(),private.mb_logistics_immutable(),private.mb_quote_immutable(),private.mb_logistics_paid(),
 public.mb_claim_shipment(text),public.mb_finish_shipment(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.mb_order_quote_immutable(),private.mb_logistics_immutable(),private.mb_quote_immutable(),private.mb_logistics_paid(),
 public.mb_claim_shipment(text),public.mb_finish_shipment(uuid,jsonb) to service_role;
