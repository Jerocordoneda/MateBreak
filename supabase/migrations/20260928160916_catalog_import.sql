-- Additive catalog extension. Existing inventory, orders and stock are preserved.
alter table public.producto add column source_url text unique,
 add column external_id text unique, add column slug text unique,
 add column moneda text not null default 'UYU' check(moneda in ('ARS','UYU'));
alter table public.producto_simple alter column material drop not null,
 alter column stock drop not null;

create table public.catalogo_producto (
 producto_id bigint primary key references public.producto(id_producto),
 disponible boolean, precio_original numeric(12,2), precio_transferencia numeric(12,2),
 descuento numeric(7,3), cuotas jsonb, envio_gratis boolean,
 destacado boolean not null default false, publicado boolean not null default false,
 descripcion_origen text, personalizacion jsonb, atributos jsonb,
 source_hash text, extraido_en timestamptz not null, importado_en timestamptz not null default now()
);
create table public.catalogo_categoria (
 id bigint generated always as identity primary key, nombre text not null,
 slug text not null unique, source_url text not null unique,
 padre_id bigint references public.catalogo_categoria(id)
);
create index catalogo_categoria_padre_idx on public.catalogo_categoria(padre_id);
create table public.catalogo_producto_categoria (
 producto_id bigint references public.producto(id_producto),
 categoria_id bigint references public.catalogo_categoria(id),
 primary key(producto_id,categoria_id)
);
create index catalogo_producto_categoria_categoria_idx on public.catalogo_producto_categoria(categoria_id);
create table public.catalogo_opcion (
 producto_id bigint references public.producto(id_producto), posicion integer,
 nombre text not null, valores jsonb not null, primary key(producto_id,posicion)
);
create table public.catalogo_variante (
 id bigint generated always as identity primary key,
 producto_id bigint not null references public.producto(id_producto), external_id text not null unique,
 opciones jsonb not null default '{}', precio numeric(12,2) check(precio>=0),
 precio_original numeric(12,2), precio_transferencia numeric(12,2), cuotas jsonb,
 disponible boolean, stock_origen integer check(stock_origen>=0), sku text,
 imagen_origen text, vigente boolean not null default true,
 unique(producto_id,id)
);
create index catalogo_variante_producto_idx on public.catalogo_variante(producto_id);
create table public.catalogo_asset (
 sha256 text primary key, storage_path text not null unique,
 mime_type text not null, bytes bigint not null check(bytes>0)
);
create table public.catalogo_imagen (
 producto_id bigint references public.producto(id_producto), source_url text,
 asset_hash text not null references public.catalogo_asset(sha256), posicion integer not null,
 rol text not null check(rol in ('galeria','descripcion','variante')), alt text,
 vigente boolean not null default true, primary key(producto_id,source_url)
);
create index catalogo_imagen_asset_idx on public.catalogo_imagen(asset_hash);
create table public.catalogo_promocion (
 producto_id bigint references public.producto(id_producto), texto text,
 primary key(producto_id,texto)
);
create table public.catalogo_componente (
 combo_id bigint references public.combo(id_producto), evidencia text,
 producto_simple_id bigint references public.producto_simple(id_producto),
 cantidad integer check(cantidad>0), source_url text,
 primary key(combo_id,evidencia)
);
create index catalogo_componente_simple_idx on public.catalogo_componente(producto_simple_id);
create table public.catalogo_revision (
 producto_id bigint references public.producto(id_producto), motivo text,
 resuelto boolean not null default false, primary key(producto_id,motivo)
);
create table public.carrito_variante (
 carrito_id uuid references public.carrito(id), variante_id bigint references public.catalogo_variante(id),
 cantidad integer not null check(cantidad between 1 and 99),
 personalizacion text not null default '' check(length(personalizacion)<=1000),
 primary key(carrito_id,variante_id)
);
create index carrito_variante_variante_idx on public.carrito_variante(variante_id);

do $$ declare t text; begin
 foreach t in array array['catalogo_producto','catalogo_categoria','catalogo_producto_categoria',
 'catalogo_opcion','catalogo_variante','catalogo_asset','catalogo_imagen','catalogo_promocion',
 'catalogo_componente','catalogo_revision','carrito_variante'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;

-- One atomic product import. A failure rolls back all relational metadata.
create function public.mb_importar_catalogo(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare pid bigint; nuevo boolean; r jsonb; cid bigint; parentid bigint; ids bigint[]:='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended('matebreak_catalog_import',0));
 if nullif(p->>'external_id','') is null or nullif(p->>'nombre','') is null
 or p->>'source_url' not like 'https://matebreak.com.ar/productos/%' then raise exception 'Producto invalido'; end if;
 select id_producto into pid from public.producto where external_id=p->>'external_id';
 nuevo:=pid is null;
 if nuevo then
  insert into public.producto(nombre,descripcion,precio,tipo,activo,source_url,external_id,slug,moneda)
  values(p->>'nombre',p->>'descripcion',(p->>'precio')::numeric,p->>'tipo',
   (p->>'precio') is not null,p->>'source_url',p->>'external_id',p->>'slug',p->>'moneda') returning id_producto into pid;
 else
  update public.producto set nombre=p->>'nombre',descripcion=p->>'descripcion',precio=(p->>'precio')::numeric,
   activo=(p->>'precio') is not null,source_url=p->>'source_url',slug=p->>'slug',moneda=p->>'moneda',actualizado_en=now()
   where id_producto=pid;
  if (select tipo from public.producto where id_producto=pid)<>p->>'tipo' then raise exception 'Cambio de tipo requiere revision'; end if;
 end if;
 if p->>'tipo'='simple' then
  insert into public.producto_simple(id_producto,material,stock) values(pid,p->>'material',null) on conflict(id_producto) do nothing;
 else insert into public.combo(id_producto) values(pid) on conflict do nothing; end if;
 insert into public.catalogo_producto(producto_id,disponible,precio_original,precio_transferencia,descuento,cuotas,envio_gratis,destacado,
  descripcion_origen,personalizacion,atributos,source_hash,extraido_en,publicado)
 values(pid,(p->>'disponible')::boolean,(p->>'precio_original')::numeric,(p->>'precio_transferencia')::numeric,
  (p->>'descuento')::numeric,p->'cuotas',(p->>'envio_gratis')::boolean,(p->>'destacado')::boolean,
  p->>'descripcion_html',p->'personalizacion',p->'atributos',p->>'source_hash',(p->>'extraido_en')::timestamptz,true)
 on conflict(producto_id) do update set disponible=excluded.disponible,precio_original=excluded.precio_original,
  precio_transferencia=excluded.precio_transferencia,descuento=excluded.descuento,cuotas=excluded.cuotas,
  envio_gratis=excluded.envio_gratis,destacado=excluded.destacado,descripcion_origen=excluded.descripcion_origen,
  personalizacion=excluded.personalizacion,atributos=excluded.atributos,source_hash=excluded.source_hash,
  extraido_en=excluded.extraido_en,importado_en=now(),publicado=true;
 parentid:=null;
 for r in select * from jsonb_array_elements(p->'categorias') loop
  insert into public.catalogo_categoria(nombre,slug,source_url,padre_id)
   values(r->>'nombre',r->>'slug',r->>'source_url',parentid)
   on conflict(source_url) do update set nombre=excluded.nombre returning id into cid;
  insert into public.catalogo_producto_categoria values(pid,cid) on conflict do nothing;
  parentid:=cid;
 end loop;
 for r in select * from jsonb_array_elements(p->'opciones') loop
  insert into public.catalogo_opcion values(pid,(r->>'posicion')::integer,r->>'nombre',r->'valores')
  on conflict(producto_id,posicion) do update set nombre=excluded.nombre,valores=excluded.valores;
 end loop;
 update public.catalogo_variante set vigente=false where producto_id=pid;
 for r in select * from jsonb_array_elements(p->'variantes') loop
  insert into public.catalogo_variante(producto_id,external_id,opciones,precio,precio_original,precio_transferencia,cuotas,disponible,stock_origen,sku,imagen_origen)
  values(pid,r->>'external_id',r->'opciones',(r->>'precio')::numeric,(r->>'precio_original')::numeric,
   (r->>'precio_transferencia')::numeric,r->'cuotas',(r->>'disponible')::boolean,(r->>'stock')::integer,r->>'sku',r->>'imagen')
  on conflict(external_id) do update set opciones=excluded.opciones,precio=excluded.precio,precio_original=excluded.precio_original,
   precio_transferencia=excluded.precio_transferencia,cuotas=excluded.cuotas,disponible=excluded.disponible,
   stock_origen=excluded.stock_origen,sku=excluded.sku,imagen_origen=excluded.imagen_origen,vigente=true;
 end loop;
 update public.catalogo_imagen set vigente=false where producto_id=pid;
 for r in select * from jsonb_array_elements(p->'imagenes') loop
  insert into public.catalogo_asset values(r->>'sha256',r->>'storage_path',r->>'mime_type',(r->>'bytes')::bigint) on conflict do nothing;
  insert into public.catalogo_imagen values(pid,r->>'source_url',r->>'sha256',(r->>'posicion')::integer,r->>'rol',r->>'alt',true)
  on conflict(producto_id,source_url) do update set asset_hash=excluded.asset_hash,posicion=excluded.posicion,rol=excluded.rol,alt=excluded.alt,vigente=true;
 end loop;
 for r in select * from jsonb_array_elements(p->'promociones') loop
  insert into public.catalogo_promocion values(pid,r#>>'{}') on conflict do nothing;
 end loop;
 for r in select * from jsonb_array_elements(p->'componentes') loop
  insert into public.catalogo_componente(combo_id,evidencia,source_url) values(pid,r->>'evidencia',r->>'source_url') on conflict do nothing;
 end loop;
 for r in select * from jsonb_array_elements(p->'revision') loop
  insert into public.catalogo_revision(producto_id,motivo) values(pid,r#>>'{}') on conflict do nothing;
 end loop;
 return jsonb_build_object('id',pid::text,'creado',nuevo);
end $$;
revoke all on function public.mb_importar_catalogo(jsonb) from public,anon,authenticated;
grant execute on function public.mb_importar_catalogo(jsonb) to service_role;

-- Preserve existing commerce implementation and add variant-aware cart lines.
alter function public.mb_comercio(text,uuid,text,jsonb) rename to mb_comercio_base;
create function public.mb_comercio(p_token_hash text,p_usuario_id uuid,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; c public.carrito; v record; q integer; lines jsonb; subtotal numeric; currency text;
begin
 if p_accion='checkout' and exists(select 1 from public.carrito ca join public.carrito_variante i on i.carrito_id=ca.id
  where ca.token_hash=p_token_hash and (ca.usuario_id is null or ca.usuario_id=p_usuario_id)) then
  raise exception 'La compra requiere confirmar inventario y medios de pago del catalogo importado';
 end if;
 if p_accion='cantidad' and exists(select 1 from public.producto where id_producto=(p_datos->>'producto_id')::bigint and external_id is not null)
  and (p_datos->>'cantidad')::integer>0 then raise exception 'Selecciona una variante del producto'; end if;
 result:=public.mb_comercio_base(p_token_hash,p_usuario_id,case when p_accion='variante' then 'carrito' else p_accion end,p_datos);
 if p_accion not in ('carrito','cantidad','variante','vincular') or result->>'estado'='convertido' then return result; end if;
 select * into c from public.carrito where token_hash=p_token_hash for update;
 if p_accion='variante' then
  q:=(p_datos->>'cantidad')::integer;
  if q is null or q not between 0 and 99 then raise exception 'Cantidad invalida'; end if;
  if length(coalesce(p_datos->>'personalizacion',''))>1000 then raise exception 'Personalizacion demasiado larga'; end if;
  if q=0 then delete from public.carrito_variante where carrito_id=c.id and variante_id=(p_datos->>'variante_id')::bigint;
  else
   select cv.*,p.moneda into v from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
   join public.catalogo_producto cp on cp.producto_id=p.id_producto
   where cv.id=(p_datos->>'variante_id')::bigint and cv.vigente and cv.disponible and cv.precio is not null and p.activo and cp.publicado for share of cv,p;
   if not found then raise exception 'Variante no disponible'; end if;
   if v.stock_origen is not null and q>v.stock_origen then raise exception 'Cantidad superior a disponibilidad publicada'; end if;
   if exists(select 1 from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id and p.moneda<>v.moneda)
    or exists(select 1 from public.carrito_variante i join public.catalogo_variante cv on cv.id=i.variante_id join public.producto p on p.id_producto=cv.producto_id where i.carrito_id=c.id and p.moneda<>v.moneda)
    then raise exception 'No se pueden mezclar monedas en el carrito'; end if;
   if (select count(*) from public.carrito_variante where carrito_id=c.id)>=100 and not exists(select 1 from public.carrito_variante where carrito_id=c.id and variante_id=v.id) then raise exception 'Carrito lleno'; end if;
   insert into public.carrito_variante(carrito_id,variante_id,cantidad,personalizacion) values(c.id,v.id,q,coalesce(p_datos->>'personalizacion',''))
   on conflict(carrito_id,variante_id) do update set cantidad=excluded.cantidad,
    personalizacion=case when p_datos ? 'personalizacion' then excluded.personalizacion else public.carrito_variante.personalizacion end;
  end if;
 end if;
 if (select count(distinct moneda) from (
  select p.moneda from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id
  union all select p.moneda from public.carrito_variante i join public.catalogo_variante cv on cv.id=i.variante_id join public.producto p on p.id_producto=cv.producto_id where i.carrito_id=c.id
 ) currencies)>1 then raise exception 'No se pueden mezclar monedas en el carrito'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('producto_id',p.id_producto::text,'variante_id',cv.id::text,'nombre',p.nombre,
  'opciones',cv.opciones,'personalizacion',i.personalizacion,'cantidad',i.cantidad,'precio',cv.precio,'moneda',p.moneda,
  'activo',p.activo and cp.publicado and cv.vigente and coalesce(cv.disponible,false),'subtotal',cv.precio*i.cantidad)),'[]'),
  coalesce(sum(cv.precio*i.cantidad),0),min(p.moneda) into lines,subtotal,currency
 from public.carrito_variante i join public.catalogo_variante cv on cv.id=i.variante_id
 join public.producto p on p.id_producto=cv.producto_id join public.catalogo_producto cp on cp.producto_id=p.id_producto where i.carrito_id=c.id;
 return result || jsonb_build_object('items',coalesce(result->'items','[]')||lines,'total',coalesce((result->>'total')::numeric,0)+subtotal,
  'moneda',coalesce(currency,(select p.moneda from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id limit 1),'ARS'),
  'requiere_confirmacion_catalogo',jsonb_array_length(lines)>0);
end $$;
revoke all on function public.mb_comercio(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mb_comercio(text,uuid,text,jsonb) to service_role;

create or replace function public.mb_carrito_cantidad(p_token_hash text,p_usuario_id uuid)
returns integer language sql stable security invoker set search_path='' as $$
 select coalesce(sum(i.cantidad),0)::integer from public.carrito c join (
  select carrito_id,cantidad from public.carrito_item union all select carrito_id,cantidad from public.carrito_variante
 ) i on i.carrito_id=c.id where c.token_hash=p_token_hash and c.estado='abierto' and c.expira_en>now()
 and (c.usuario_id is null or c.usuario_id=p_usuario_id);
$$;
