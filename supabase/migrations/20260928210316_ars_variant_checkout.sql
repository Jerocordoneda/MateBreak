-- ARS is the operating currency. There are no historic orders or sales in the
-- inspected project; numeric values are deliberately never converted.
alter table public.pedido drop constraint pedido_moneda_check;
alter table public.pedido alter column moneda set default 'ARS';
alter table public.pedido add constraint pedido_moneda_check check(moneda='ARS');
alter table public.pago drop constraint pago_moneda_check;
alter table public.pago alter column moneda set default 'ARS';
alter table public.pago add constraint pago_moneda_check check(moneda='ARS');
alter table private.venta_manual drop constraint venta_manual_moneda_check;
alter table private.venta_manual alter column moneda set default 'ARS';
alter table private.venta_manual add constraint venta_manual_moneda_check check(moneda='ARS');
update public.producto set moneda='ARS' where moneda='UYU';
alter table public.producto alter column moneda set default 'ARS';
alter table public.producto drop constraint producto_moneda_check;
alter table public.producto add constraint producto_moneda_check check(moneda='ARS');
alter table public.direccion alter column pais set default 'AR';
alter table public.metodo_envio alter column pais set default 'AR';
update public.metodo_envio set pais='AR' where pais='UY' and not activo;

-- One saleable variant consumes one or more existing physical SKUs. A reviewed
-- composition is explicit; a partial mapping never becomes purchasable.
create table public.catalogo_variante_mapeo (
 variante_id bigint primary key references public.catalogo_variante(id),
 aprobado boolean not null default false, revisado_en timestamptz,
 nota text not null default ''
);
create table public.catalogo_variante_componente (
 variante_id bigint not null references public.catalogo_variante_mapeo(variante_id),
 producto_simple_id bigint not null references public.producto_simple(id_producto),
 cantidad integer not null check(cantidad>0), evidencia text not null check(length(trim(evidencia))>0),
 primary key(variante_id,producto_simple_id)
);
create index catalogo_variante_componente_sku_idx on public.catalogo_variante_componente(producto_simple_id);
alter table public.catalogo_variante_mapeo enable row level security;
alter table public.catalogo_variante_componente enable row level security;
revoke all on public.catalogo_variante_mapeo,public.catalogo_variante_componente from anon,authenticated;
grant select,insert,update,delete on public.catalogo_variante_mapeo,public.catalogo_variante_componente to service_role;

-- A historical order can contain two variants of the same catalog product.
alter table public.pedido_item add column variante_id bigint references public.catalogo_variante(id),
 add column opciones jsonb,add column personalizacion text;
alter table public.pedido_item drop constraint pedido_item_pedido_id_producto_id_key;
create unique index pedido_item_producto_unico_idx on public.pedido_item(pedido_id,producto_id) where variante_id is null;
create unique index pedido_item_variante_unica_idx on public.pedido_item(pedido_id,variante_id) where variante_id is not null;
create index pedido_item_variante_idx on public.pedido_item(variante_id);

-- Approval comes only from source evidence and a precisely named existing SKU.
-- The offered bombilla is absent from inventory, so only NO variants qualify.
insert into public.catalogo_variante_mapeo(variante_id,aprobado,revisado_en,nota)
select cv.id,true,now(),'Modelo explícito y accesorio NO: base física documentada'
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
where p.tipo='simple' and cv.vigente and cv.disponible and
 ((p.nombre like 'IMPERIAL PREMIUM%' and cv.opciones->>'MODELO DE MATE' in ('IMPERIAL DE CALABAZA','IMPERIAL DE ALGARROBO') and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO')
  or (p.nombre in ('IMPERIAL DE ALGARROBO','CAMIONERO DE ALGARROBO','MI MATE IMPERIAL ALGARROBO - CREÁ TU DISEÑO ACÁ')
    and cv.opciones->>'Agregar BOMBILLA PICO LORO ACERO'='NO'));
insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia)
select m.variante_id,f.producto_id,1,
 'Opción y nombre públicos del producto; insumo base documentado '||f.sku
from public.catalogo_variante_mapeo m join public.catalogo_variante cv on cv.id=m.variante_id
join public.producto p on p.id_producto=cv.producto_id
join private.inventario_ficha f on f.sku=case
 when cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA' then 'MB-IMP-CAL'
 when cv.opciones->>'MODELO DE MATE'='IMPERIAL DE ALGARROBO' or p.nombre like '%IMPERIAL%ALGARROBO%' then 'MB-IMP-ALG'
 else 'MB-CAM-ALG' end;

create function public.mb_catalogo_disponibilidad() returns table(variante_id bigint,comprable boolean,con_stock boolean)
language sql stable security invoker set search_path='' as $$
 select cv.id,
  coalesce(m.aprobado,false) and p.activo and cp.publicado and cv.vigente and cv.disponible and cv.precio is not null
   and p.moneda='ARS' and exists(select 1 from public.catalogo_variante_componente c where c.variante_id=cv.id)
   and not exists(select 1 from public.catalogo_variante_componente c left join public.producto_simple s on s.id_producto=c.producto_simple_id
    left join private.inventario_ficha f on f.producto_id=c.producto_simple_id
    where c.variante_id=cv.id and (s.stock is null or f.producto_id is null or f.abastecimiento<>'stock')) as comprable,
  not exists(select 1 from public.catalogo_variante_componente c join public.producto_simple s on s.id_producto=c.producto_simple_id
   where c.variante_id=cv.id and (s.stock is null or s.stock<c.cantidad)) as con_stock
 from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
 join public.catalogo_producto cp on cp.producto_id=p.id_producto left join public.catalogo_variante_mapeo m on m.variante_id=cv.id;
$$;
revoke all on function public.mb_catalogo_disponibilidad() from public,anon,authenticated;
grant execute on function public.mb_catalogo_disponibilidad() to service_role;

-- The source's only conditional volume offer is 20% across the named category.
-- Compare-at prices are already reflected in cv.precio and are not applied twice.
create function public.mb_precio_variante(p_variante_id bigint,p_pago text,p_cantidad_categoria integer)
returns numeric language sql stable security invoker set search_path='' as $$
 select round((case when p_pago='transferencia' and cv.precio_transferencia is not null
  then cv.precio_transferencia else cv.precio end) *
  (case when p_cantidad_categoria>=2 and exists(select 1 from public.catalogo_promocion promo
    where promo.producto_id=cv.producto_id and promo.texto='20% OFF Comprando 2 o más')
   then 0.80 else 1 end),2)
 from public.catalogo_variante cv where cv.id=p_variante_id;
$$;
create function public.mb_cantidad_promo(p_carrito_id uuid) returns integer
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(i.cantidad),0)::integer from public.carrito_variante i
 join public.catalogo_variante cv on cv.id=i.variante_id
 join public.catalogo_producto_categoria pc on pc.producto_id=cv.producto_id
 join public.catalogo_categoria cat on cat.id=pc.categoria_id
 where i.carrito_id=p_carrito_id and cat.slug='mates-grabados';
$$;
revoke all on function public.mb_precio_variante(bigint,text,integer),public.mb_cantidad_promo(uuid) from public,anon,authenticated;
grant execute on function public.mb_precio_variante(bigint,text,integer),public.mb_cantidad_promo(uuid) to service_role;

create function public.mb_cotizar_catalogo(p_carrito_id uuid,p_pago text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r record; items jsonb:='[]'; total numeric:=0; qty integer;
begin
 qty:=public.mb_cantidad_promo(p_carrito_id);
 for r in select i.producto_id,p.nombre,p.moneda,p.precio,i.cantidad from public.carrito_item i
  join public.producto p on p.id_producto=i.producto_id where i.carrito_id=p_carrito_id order by i.producto_id loop
  if r.moneda<>'ARS' or r.precio is null then raise exception 'Producto sin precio ARS'; end if;
  items:=items||jsonb_build_array(jsonb_build_object('producto_id',r.producto_id,'variante_id',null,
   'nombre',r.nombre,'cantidad',r.cantidad,'precio_unitario',r.precio,'opciones',null,'personalizacion',null));
  total:=total+r.cantidad*r.precio;
 end loop;
 for r in select i.variante_id,i.cantidad,i.personalizacion,cv.producto_id,cv.opciones,cv.precio,
   cv.vigente,cv.disponible,p.nombre,p.moneda,p.activo,cp.publicado
  from public.carrito_variante i join public.catalogo_variante cv on cv.id=i.variante_id
  join public.producto p on p.id_producto=cv.producto_id join public.catalogo_producto cp on cp.producto_id=p.id_producto
  where i.carrito_id=p_carrito_id order by i.variante_id loop
  if r.moneda<>'ARS' or not r.activo or not r.publicado or not r.vigente or not r.disponible or r.precio is null
   then raise exception 'Variante no disponible'; end if;
  r.precio:=public.mb_precio_variante(r.variante_id,p_pago,qty);
  items:=items||jsonb_build_array(jsonb_build_object('producto_id',r.producto_id,'variante_id',r.variante_id,
   'nombre',r.nombre,'cantidad',r.cantidad,'precio_unitario',r.precio,'opciones',r.opciones,'personalizacion',r.personalizacion));
  total:=total+r.cantidad*r.precio;
 end loop;
 return jsonb_build_object('items',items,'subtotal',total,'moneda','ARS');
end $$;
revoke all on function public.mb_cotizar_catalogo(uuid,text) from public,anon,authenticated;
grant execute on function public.mb_cotizar_catalogo(uuid,text) to service_role;

create function public.mb_checkout_catalogo(p_token_hash text,p_usuario_id uuid,p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.carrito; o public.pedido; e public.metodo_envio; d public.direccion;
 v_quote jsonb; v_items jsonb; v_need jsonb; v_cost numeric; v_promo boolean; item jsonb; r record;
begin
 if p_usuario_id is null then raise exception 'Inicia sesion'; end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Sesion invalida'; end if;
 if nullif(p_datos->>'idempotencia','') is null then raise exception 'Falta idempotencia'; end if;
 -- Exactly the same inventory lock used by adjustments, sales, expiration,
 -- payment confirmation and the legacy commerce RPC.
 perform pg_advisory_xact_lock(782204,1);
 perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text,0));
 select * into o from public.pedido where usuario_id=p_usuario_id and idempotencia=(p_datos->>'idempotencia')::uuid;
 if found then return to_jsonb(o); end if;
 select * into c from public.carrito where token_hash=p_token_hash for update;
 if not found or c.usuario_id is not null and c.usuario_id<>p_usuario_id then raise exception 'Sesion invalida'; end if;
 if c.expira_en<=now() then raise exception 'El carrito vencio'; end if;
 if c.estado='convertido' then
  select * into o from public.pedido where carrito_id=c.id and usuario_id=p_usuario_id;
  if found then return to_jsonb(o); end if;
  raise exception 'Carrito ya confirmado';
 end if;
 if not exists(select 1 from public.carrito_variante where carrito_id=c.id) then raise exception 'Carrito sin variantes'; end if;
 if exists(select 1 from public.carrito_item i join public.producto p on p.id_producto=i.producto_id
   where i.carrito_id=c.id and (not p.activo or p.moneda<>'ARS')) then raise exception 'Producto no disponible'; end if;
 select * into e from public.metodo_envio where codigo=p_datos->>'envio' and activo for share;
 if not found then raise exception 'Metodo de envio no disponible'; end if;
 perform 1 from public.metodo_pago where codigo=p_datos->>'pago' and activo for share;
 if not found or p_datos->>'pago'='mercadopago' then raise exception 'Metodo de pago no disponible'; end if;
 if p_datos->>'pago'='efectivo' and e.requiere_direccion then raise exception 'Efectivo solo al retirar'; end if;
 if e.requiere_direccion then
  select * into d from public.direccion where id=(p_datos->>'direccion_id')::uuid and usuario_id=p_usuario_id for share;
  if not found then raise exception 'Direccion no encontrada'; end if;
  if d.pais<>e.pais then raise exception 'Destino fuera de cobertura'; end if;
 end if;
 -- Freeze prices and mapping while taking the order snapshot.
 perform 1 from public.carrito_variante i join public.catalogo_variante cv on cv.id=i.variante_id
  join public.producto p on p.id_producto=cv.producto_id
  where i.carrito_id=c.id order by cv.id for share of cv,p;
 perform 1 from public.catalogo_variante_componente mc join public.carrito_variante i on i.variante_id=mc.variante_id
  where i.carrito_id=c.id order by mc.producto_simple_id for share of mc;
 for r in select i.variante_id,disp.comprable,disp.con_stock from public.carrito_variante i
  join public.mb_catalogo_disponibilidad() disp on disp.variante_id=i.variante_id where i.carrito_id=c.id loop
  if not r.comprable then raise exception 'Variante sin relacion de inventario aprobada'; end if;
  if not r.con_stock then raise exception 'Stock insuficiente'; end if;
 end loop;
 if exists(select 1 from public.carrito_variante i left join public.mb_catalogo_disponibilidad() disp on disp.variante_id=i.variante_id
  where i.carrito_id=c.id and disp.variante_id is null) then raise exception 'Variante sin relacion de inventario aprobada'; end if;
 v_quote:=public.mb_cotizar_catalogo(c.id,p_datos->>'pago');v_items:=v_quote->'items';
 if jsonb_array_length(v_items)=0 then raise exception 'Carrito vacio'; end if;
 if (v_quote->>'subtotal')::numeric<=0 then raise exception 'Precio invalido'; end if;
 select jsonb_agg(to_jsonb(x)) into v_need from (
  select producto_simple_id,sum(cantidad)::integer cantidad from (
   select i.producto_id producto_simple_id,i.cantidad from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id and p.tipo='simple'
   union all select ci.id_producto_simple,i.cantidad*ci.cantidad from public.carrito_item i join public.combo_item ci on ci.id_combo=i.producto_id where i.carrito_id=c.id
   union all select mc.producto_simple_id,i.cantidad*mc.cantidad from public.carrito_variante i join public.catalogo_variante_componente mc on mc.variante_id=i.variante_id where i.carrito_id=c.id
  ) n group by producto_simple_id
 ) x;
 if v_need is null then raise exception 'Carrito sin componentes fisicos'; end if;
 for r in select * from jsonb_to_recordset(v_need) as n(producto_simple_id bigint,cantidad integer) order by producto_simple_id loop
  update public.producto_simple set stock=stock-r.cantidad where id_producto=r.producto_simple_id and stock>=r.cantidad;
  if not found then raise exception 'Stock insuficiente para producto %',r.producto_simple_id; end if;
 end loop;
 -- Shipping promotion only when every catalog line explicitly has free shipping.
 select coalesce(bool_and(cp.envio_gratis is true),false) into v_promo from public.carrito_variante i
  join public.catalogo_variante cv on cv.id=i.variante_id
  join public.catalogo_producto cp on cp.producto_id=cv.producto_id where i.carrito_id=c.id;
 v_cost:=case when not exists(select 1 from public.carrito_item where carrito_id=c.id) and v_promo then 0 else e.costo end;
 update public.carrito set usuario_id=coalesce(usuario_id,p_usuario_id),actualizado_en=now() where id=c.id;
 insert into public.pedido(usuario_id,carrito_id,idempotencia,subtotal,costo_envio,direccion_entrega,moneda)
 values(p_usuario_id,c.id,(p_datos->>'idempotencia')::uuid,(v_quote->>'subtotal')::numeric,v_cost,
  case when e.requiere_direccion then to_jsonb(d)-'usuario_id'-'id'-'creado_en' else jsonb_build_object('retiro',e.nombre) end,'ARS') returning * into o;
 for item in select value from jsonb_array_elements(v_items) loop
  insert into public.pedido_item(pedido_id,producto_id,variante_id,nombre,precio_unitario,cantidad,opciones,personalizacion)
  values(o.id,(item->>'producto_id')::bigint,(item->>'variante_id')::bigint,item->>'nombre',
   (item->>'precio_unitario')::numeric,(item->>'cantidad')::integer,item->'opciones',item->>'personalizacion');
 end loop;
 insert into public.pedido_stock(pedido_id,producto_simple_id,cantidad)
 select o.id,producto_simple_id,cantidad from jsonb_to_recordset(v_need) as n(producto_simple_id bigint,cantidad integer);
 insert into public.movimiento_stock(pedido_id,producto_simple_id,cantidad,motivo)
 select o.id,producto_simple_id,-cantidad,'reserva' from public.pedido_stock where pedido_id=o.id;
 insert into public.pago(pedido_id,metodo,importe,moneda) values(o.id,p_datos->>'pago',o.total,'ARS');
 insert into public.envio(pedido_id,metodo) values(o.id,e.codigo);
 update public.carrito set estado='convertido' where id=c.id;
 return to_jsonb(o);
end $$;
revoke all on function public.mb_checkout_catalogo(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mb_checkout_catalogo(text,uuid,jsonb) to service_role;

-- Keep the existing cart, login binding, cancellation and expiration semantics.
-- Only carts containing variants enter the new checkout implementation.
create or replace function public.mb_comercio(p_token_hash text,p_usuario_id uuid,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; c public.carrito; v record; q integer; lines jsonb; subtotal numeric; currency text; ready boolean;
begin
 if p_accion='checkout' and exists(select 1 from public.carrito ca join public.carrito_variante i on i.carrito_id=ca.id
  where ca.token_hash=p_token_hash and (ca.usuario_id is null or ca.usuario_id=p_usuario_id)) then
  return public.mb_checkout_catalogo(p_token_hash,p_usuario_id,p_datos);
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
 select bool_and(disp.comprable and disp.con_stock) into ready from public.carrito_variante i
  left join public.mb_catalogo_disponibilidad() disp on disp.variante_id=i.variante_id where i.carrito_id=c.id;
 return result || jsonb_build_object('items',coalesce(result->'items','[]')||lines,'total',coalesce((result->>'total')::numeric,0)+subtotal,
  'moneda',coalesce(currency,(select p.moneda from public.carrito_item i join public.producto p on p.id_producto=i.producto_id where i.carrito_id=c.id limit 1),'ARS'),
  'requiere_confirmacion_catalogo',jsonb_array_length(lines)>0 and not coalesce(ready,false));
end $$;
revoke all on function public.mb_comercio(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mb_comercio(text,uuid,text,jsonb) to service_role;
