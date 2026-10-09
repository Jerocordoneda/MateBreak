-- Wholesale leads are not paid orders or inventory reservations.
create table private.wholesale_settings (
 singleton boolean primary key default true check(singleton), minimum_units integer not null check(minimum_units between 1 and 1000)
);
insert into private.wholesale_settings values(true,10);
create table private.wholesale_offer (
 variante_id bigint primary key references public.catalogo_variante(id),
 unit_price numeric(12,2) not null check(unit_price>0 and unit_price<=1000000),
 eligible_units integer not null check(eligible_units between 0 and 1000), active boolean not null default false,
 equivalence_note text not null check(length(trim(equivalence_note)) between 3 and 300)
);
-- No real offers, prices, sellers or campaign references are seeded here.
create table private.wholesale_source (
 reference text primary key check(reference ~ '^[a-zA-Z0-9_-]{3,64}$'),
 kind text not null check(kind in ('campana_identificada','enlace_vendedor','organico_verificado')),
 originator_id uuid references auth.users(id), active boolean not null default true,
 verification_note text,
 check(kind<>'enlace_vendedor' or originator_id is not null),
 check(kind<>'organico_verificado' or length(trim(coalesce(verification_note,''))) between 10 and 300)
);
create sequence private.wholesale_number;
create table private.wholesale_request (
 id uuid primary key default gen_random_uuid(), number bigint not null default nextval('private.wholesale_number') unique,
 owner_hash text not null check(owner_hash ~ '^[a-f0-9]{64}$'), idempotency uuid not null,
 payload jsonb not null, buyer jsonb not null, quote jsonb not null,
 source_reference text references private.wholesale_source(reference),
 origin text not null check(origin in ('web_sin_referencia','campana_identificada','enlace_vendedor','organico_verificado')),
 originator_id uuid references auth.users(id), closer_id uuid references auth.users(id),
 state text not null default 'recibida' check(state in ('recibida','en_conversacion','presupuesto_confirmado','esperando_sena','sena_acreditada','venta_concretada','cancelada')),
 order_id uuid unique references public.pedido(id), manual_sale_id uuid unique references private.venta_manual(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_hash,idempotency), check(order_id is null or manual_sale_id is null)
);
create index wholesale_request_state_date on private.wholesale_request(state,created_at desc);
create table private.wholesale_event (
 id bigint generated always as identity primary key, request_id uuid not null references private.wholesale_request(id),
 actor_id uuid references auth.users(id), state text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table private.wholesale_settings enable row level security;
alter table private.wholesale_offer enable row level security;
alter table private.wholesale_source enable row level security;
alter table private.wholesale_request enable row level security;
alter table private.wholesale_event enable row level security;
revoke all on private.wholesale_settings,private.wholesale_offer,private.wholesale_source,private.wholesale_request,private.wholesale_event from public,anon,authenticated,service_role;
grant select on private.wholesale_settings,private.wholesale_offer,private.wholesale_source to service_role;
grant select,insert on private.wholesale_request,private.wholesale_event to service_role;
grant update(state,closer_id,order_id,manual_sale_id,updated_at) on private.wholesale_request to service_role;
revoke all on sequence private.wholesale_number,private.wholesale_event_id_seq from public,anon,authenticated;
grant usage on sequence private.wholesale_number,private.wholesale_event_id_seq to service_role;

create function public.mb_wholesale_catalog(p_ref text default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('minimum',(select minimum_units from private.wholesale_settings),
 'referenceValid',p_ref is null or exists(select 1 from private.wholesale_source s where s.reference=p_ref and s.active and (s.originator_id is null or public.mb_rol(s.originator_id)='vendedor')),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',v.id::text,'productId',p.id_producto::text,'name',p.nombre,'options',v.opciones,
 'price',f.unit_price,'eligibleUnits',f.eligible_units,'equivalence',f.equivalence_note,
 'imagePath',(select a.storage_path from public.catalogo_imagen i join public.catalogo_asset a on a.sha256=i.asset_hash where i.producto_id=p.id_producto and i.vigente order by i.posicion limit 1)) order by p.nombre,v.id)
 from private.wholesale_offer f join public.catalogo_variante v on v.id=f.variante_id join public.producto p on p.id_producto=v.producto_id
 join public.catalogo_producto cp on cp.producto_id=p.id_producto where f.active and v.vigente and p.activo and cp.publicado),'[]'))
$$;
create function public.mb_wholesale_quote(p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare x jsonb; offer record; items jsonb:='[]'; units integer:=0; total numeric:=0; qty integer; minimum integer;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Elegí entre 1 y 50 productos'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Variante duplicada'; end if;
 select minimum_units into strict minimum from private.wholesale_settings;
 for x in select value from jsonb_array_elements(p_items) order by (value->>'id')::bigint loop
  if coalesce(x->>'id','') !~ '^[1-9][0-9]{0,18}$' or coalesce(x->>'cantidad','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Producto o cantidad inválidos'; end if;
  qty:=(x->>'cantidad')::integer;if qty>1000 then raise exception 'Cantidad inválida';end if;
  select v.id,v.opciones,p.nombre,f.unit_price,f.eligible_units into offer from private.wholesale_offer f
   join public.catalogo_variante v on v.id=f.variante_id join public.producto p on p.id_producto=v.producto_id
   join public.catalogo_producto cp on cp.producto_id=p.id_producto
   where v.id=(x->>'id')::bigint and f.active and v.vigente and p.activo and cp.publicado;
  if not found then raise exception 'Oferta mayorista no disponible';end if;
  units:=units+qty*offer.eligible_units;total:=total+qty*offer.unit_price;
  items:=items||jsonb_build_array(jsonb_build_object('id',offer.id::text,'name',offer.nombre,'options',offer.opciones,'quantity',qty,'unitPrice',offer.unit_price,'subtotal',qty*offer.unit_price,'eligibleUnits',qty*offer.eligible_units));
 end loop;
 return jsonb_build_object('items',items,'total',total,'currency','ARS','units',units,'minimum',minimum,'remaining',greatest(0,minimum-units),'eligible',units>=minimum);
end $$;
create function public.mb_wholesale_submit(p_owner text,p_key uuid,p_buyer jsonb,p_items jsonb,p_ref text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r private.wholesale_request; source private.wholesale_source; q jsonb; payload jsonb; field text;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{64}$' or p_key is null or jsonb_typeof(p_buyer) is distinct from 'object' then raise exception 'Solicitud inválida';end if;
 for field in select unnest(array['nombre','email','whatsapp','localidad','provincia']) loop
  if jsonb_typeof(p_buyer->field) is distinct from 'string' or length(trim(p_buyer->>field)) not between 2 and 150 then raise exception 'Datos de comprador inválidos';end if;
 end loop;
 if p_buyer->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_buyer->>'whatsapp' !~ '^[+0-9 ()-]{7,30}$' or length(coalesce(p_buyer->>'comentarios',''))>1000 or length(coalesce(p_buyer->>'empresa',''))>150 then raise exception 'Contacto inválido';end if;
 payload:=jsonb_build_object('buyer',p_buyer,'items',p_items,'reference',p_ref);
 perform pg_advisory_xact_lock(hashtextextended(p_owner||p_key::text,722));
 select * into r from private.wholesale_request where owner_hash=p_owner and idempotency=p_key;
 if found then
  if r.payload<>payload then raise exception 'La clave pertenece a otra solicitud';end if;
  return jsonb_build_object('number','MAY-'||lpad(r.number::text,greatest(4,length(r.number::text)), '0'),'state',r.state,'quote',r.quote);
 end if;
 if p_ref is not null then
  select * into source from private.wholesale_source where reference=p_ref and active;
  if not found or (source.originator_id is not null and public.mb_rol(source.originator_id)<>'vendedor') then raise exception 'Referencia comercial no válida';end if;
 end if;
 q:=public.mb_wholesale_quote(p_items);
 if not (q->>'eligible')::boolean then raise exception 'No se cumple el mínimo de unidades elegibles';end if;
 insert into private.wholesale_request(owner_hash,idempotency,payload,buyer,quote,source_reference,origin,originator_id)
 values(p_owner,p_key,payload,p_buyer,q,p_ref,coalesce(source.kind,'web_sin_referencia'),source.originator_id) returning * into r;
 insert into private.wholesale_event(request_id,state) values(r.id,'recibida');
 return jsonb_build_object('number','MAY-'||lpad(r.number::text,greatest(4,length(r.number::text)), '0'),'state',r.state,'quote',q);
end $$;
create function public.mb_wholesale_manage(p_actor uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r private.wholesale_request; next_state text; steps text[]:=array['recibida','en_conversacion','presupuesto_confirmado','esperando_sena','sena_acreditada','venta_concretada'];
begin
 if p_actor is null or public.mb_rol(p_actor)<>'administrador' then raise exception using errcode='42501',message='Acceso exclusivo de administración';end if;
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select id,'MAY-'||lpad(number::text,greatest(4,length(number::text)), '0') number,buyer,quote,origin,source_reference,originator_id,closer_id,state,order_id,manual_sale_id,created_at from private.wholesale_request order by created_at desc limit 100
 )x),'[]');end if;
 if p_action<>'state' then raise exception 'Operación inválida';end if;
 select * into r from private.wholesale_request where id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'Solicitud no encontrada';end if;
 next_state:=p_data->>'state';
 if next_state is null or (next_state<>'cancelada' and array_position(steps,next_state) is distinct from array_position(steps,r.state)+1) or r.state in ('cancelada','venta_concretada') then raise exception 'Transición comercial inválida';end if;
 if p_data->>'closer' is not null and public.mb_rol((p_data->>'closer')::uuid)<>'vendedor' then raise exception 'Vendedor inválido';end if;
 if next_state='sena_acreditada' and length(trim(coalesce(p_data->>'note','')))<3 then raise exception 'Registrá la evidencia comercial de la seña';end if;
 if next_state='venta_concretada' then
  if r.closer_id is null and p_data->>'closer' is null then raise exception 'Asigná el vendedor de cierre';end if;
  if ((p_data->>'orderId') is null)=((p_data->>'manualSaleId') is null) then raise exception 'Referenciá exactamente una venta existente';end if;
  if p_data->>'orderId' is not null and not exists(select 1 from public.pedido where id=(p_data->>'orderId')::uuid and estado in ('pagado','en_preparacion','enviado','entregado')) then raise exception 'Pedido pagado no encontrado';end if;
  if p_data->>'manualSaleId' is not null and not exists(select 1 from private.venta_manual where id=(p_data->>'manualSaleId')::uuid and vendedor_id=coalesce((p_data->>'closer')::uuid,r.closer_id)) then raise exception 'Venta manual del vendedor no encontrada';end if;
 end if;
 update private.wholesale_request set state=next_state,closer_id=coalesce((p_data->>'closer')::uuid,closer_id),
  order_id=case when next_state='venta_concretada' then (p_data->>'orderId')::uuid else order_id end,
  manual_sale_id=case when next_state='venta_concretada' then (p_data->>'manualSaleId')::uuid else manual_sale_id end,updated_at=now() where id=r.id;
 insert into private.wholesale_event(request_id,actor_id,state,details) values(r.id,p_actor,next_state,p_data-'id');
 return jsonb_build_object('state',next_state);
end $$;
revoke all on function public.mb_wholesale_catalog(text),public.mb_wholesale_quote(jsonb),public.mb_wholesale_submit(text,uuid,jsonb,jsonb,text),public.mb_wholesale_manage(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mb_wholesale_catalog(text),public.mb_wholesale_quote(jsonb),public.mb_wholesale_submit(text,uuid,jsonb,jsonb,text),public.mb_wholesale_manage(uuid,text,jsonb) to service_role;
