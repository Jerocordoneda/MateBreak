-- Commercial offers are separate from retail publication, pricing and inventory.
-- IDs occupy a reserved namespace; optional retail references are informational.
create table private.wholesale_commercial_offer (
 id bigint primary key check(id between 700001 and 799999),
 variant_id bigint references public.catalogo_variante(id),
 name text not null check(length(trim(name)) between 3 and 150),
 category text not null check(category in ('MATES','SETS, VASOS Y TERMOS')),
 image text check(image ~ '^/src/assets/wholesale/[a-z0-9-]+\.jpg$'),
 price_10 numeric(12,2) not null check(price_10>0 and price_10<=1000000),
 price_50 numeric(12,2) not null check(price_50>0 and price_50<=price_10),
 price_100 numeric(12,2) not null check(price_100>0 and price_100<=price_50),
 active boolean not null default false
);
alter table private.wholesale_commercial_offer enable row level security;
revoke all on private.wholesale_commercial_offer from public,anon,authenticated,service_role;
grant select on private.wholesale_commercial_offer to service_role;

create view private.wholesale_available with(security_invoker=true) as
 select v.id,p.id_producto product_id,p.nombre name,v.opciones options,f.unit_price price_10,
 f.unit_price price_50,f.unit_price price_100,f.eligible_units,
 f.equivalence_note equivalence,null::text category,null::text image,
 (select a.storage_path from public.catalogo_imagen i join public.catalogo_asset a on a.sha256=i.asset_hash
 where i.producto_id=p.id_producto and i.vigente order by i.posicion limit 1) image_path
 from private.wholesale_offer f join public.catalogo_variante v on v.id=f.variante_id
 join public.producto p on p.id_producto=v.producto_id join public.catalogo_producto cp on cp.producto_id=p.id_producto
 where f.active and v.vigente and p.activo and cp.publicado and v.id not between 700001 and 799999
 union all
 select f.id,v.producto_id,f.name,'{}'::jsonb,f.price_10,f.price_50,f.price_100,
 1,'Cada producto o set cuenta como una unidad',f.category,f.image,null::text
 from private.wholesale_commercial_offer f left join public.catalogo_variante v on v.id=f.variant_id where f.active;
revoke all on private.wholesale_available from public,anon,authenticated,service_role;
grant select on private.wholesale_available to service_role;

create or replace function public.mb_wholesale_catalog(p_ref text default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('minimum',(select minimum_units from private.wholesale_settings),
 'referenceValid',p_ref is null or exists(select 1 from private.wholesale_source s where s.reference=p_ref and s.active and (s.originator_id is null or public.mb_rol(s.originator_id)='vendedor')),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'productId',product_id::text,'name',name,'options',options,
 'price',price_10,'prices',jsonb_build_object('10',price_10,'50',price_50,'100',price_100),
 'eligibleUnits',eligible_units,'equivalence',equivalence,'category',category,'image',image,'imagePath',image_path) order by category,id)
 from private.wholesale_available),'[]'))
$$;

create or replace function public.mb_wholesale_quote(p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare x jsonb; offer record; items jsonb:='[]'; offers jsonb:='[]'; units integer:=0;
 total numeric:=0; qty integer; minimum integer; tier integer; price numeric;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Elegí entre 1 y 50 productos';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Variante duplicada';end if;
 select minimum_units into strict minimum from private.wholesale_settings;
 -- Snapshot all offers in one query: quantities across the order determine the tier.
 for offer in select a.*,x.value selection from jsonb_array_elements(p_items) x
 left join private.wholesale_available a on a.id=(x.value->>'id')::bigint order by a.id loop
  x:=offer.selection;
  if coalesce(x->>'id','') !~ '^[1-9][0-9]{0,18}$' or coalesce(x->>'cantidad','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Producto o cantidad inválidos';end if;
  qty:=(x->>'cantidad')::integer;if qty>1000 then raise exception 'Cantidad inválida';end if;
  if offer.id is null then raise exception 'Oferta mayorista no disponible';end if;
  units:=units+qty*offer.eligible_units;
  offers:=offers||jsonb_build_array(to_jsonb(offer)||jsonb_build_object('quantity',qty));
 end loop;
 tier:=case when units>=100 then 100 when units>=50 then 50 else 10 end;
 for x in select value from jsonb_array_elements(offers) loop
  qty:=(x->>'quantity')::integer;price:=(x->>('price_'||tier))::numeric;
  total:=total+qty*price;
  items:=items||jsonb_build_array(jsonb_build_object('id',x->>'id','name',x->>'name','options',x->'options','quantity',qty,'unitPrice',price,'subtotal',qty*price,'eligibleUnits',qty*(x->>'eligible_units')::integer));
 end loop;
 return jsonb_build_object('items',items,'total',total,'currency','ARS','units',units,'minimum',minimum,
 'remaining',greatest(0,minimum-units),'eligible',units>=minimum,'tier',tier,
 'benefit',case when tier>=100 then 'Grabado + packaging de regalo personalizado con tu logo' else 'Grabado + packaging de regalo' end);
end $$;
