-- Guest identity is the verified cart capability; never a shared Auth account.
-- Existing Auth ownership policies stay unchanged. Only service_role invokes RPCs.
alter table public.pedido alter column usuario_id drop not null;
alter table public.checkout_cotizacion_envio alter column usuario_id drop not null;
create unique index pedido_cart_attempt_idx on public.pedido(carrito_id,idempotencia);
create sequence public.pedido_numero_publico_seq start 1001;
alter table public.pedido add column numero_publico bigint;
alter table public.pedido alter column numero_publico set default nextval('public.pedido_numero_publico_seq');
create unique index pedido_numero_publico_idx on public.pedido(numero_publico);
revoke all on sequence public.pedido_numero_publico_seq from public,anon,authenticated;
grant usage on sequence public.pedido_numero_publico_seq to service_role;
alter table public.pedido_item add column precio_original numeric(12,2),add column imagen_storage_path text;

create or replace function public.mb_checkout_catalogo(p_token_hash text,p_usuario_id uuid,p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.carrito; o public.pedido; e public.metodo_envio; d public.direccion;
 v_quote jsonb; v_items jsonb; v_need jsonb; v_reserved jsonb:='[]'; v_unfilled jsonb:='[]';
 v_cost numeric; v_promo boolean; v_minorista_reserva boolean:=p_datos->>'_minorista_reserva'='true'; item jsonb; r record; v_mode text; v_available integer; v_take integer; v_pending integer;
begin

 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Sesion invalida'; end if;
 if nullif(p_datos->>'idempotencia','') is null then raise exception 'Falta idempotencia'; end if;
 -- Exactly the same inventory lock used by adjustments, sales, expiration,
 -- payment confirmation and the legacy commerce RPC.
 perform pg_advisory_xact_lock(782204,1);
 perform pg_advisory_xact_lock(hashtextextended(p_token_hash,0));
 select * into o from public.pedido where carrito_id=(select id from public.carrito where token_hash=p_token_hash and (usuario_id is null or usuario_id=p_usuario_id)) and idempotencia=(p_datos->>'idempotencia')::uuid;
 if found then return to_jsonb(o); end if;
 select * into c from public.carrito where token_hash=p_token_hash for update;
 if not found or c.usuario_id is not null and c.usuario_id is distinct from p_usuario_id then raise exception 'Sesion invalida'; end if;
 if c.expira_en<=now() then raise exception 'El carrito vencio'; end if;
 if c.estado='convertido' then
  select * into o from public.pedido where carrito_id=c.id and (usuario_id is null or usuario_id=p_usuario_id);
  if found then return to_jsonb(o); end if;
  raise exception 'Carrito ya confirmado';
 end if;
 if not exists(select 1 from public.carrito_variante where carrito_id=c.id) and not exists(select 1 from public.carrito_item where carrito_id=c.id) then raise exception 'Carrito vacio'; end if;
 if exists(select 1 from public.carrito_item i join public.producto p on p.id_producto=i.producto_id
   where i.carrito_id=c.id and (not p.activo or p.moneda<>'ARS')) then raise exception 'Producto no disponible'; end if;
 select * into e from public.metodo_envio where codigo=p_datos->>'envio' and (activo or (v_minorista_reserva and codigo='retiro')) for share;
 if not found then raise exception 'Metodo de envio no disponible'; end if;
 perform 1 from public.metodo_pago where codigo=p_datos->>'pago' and activo for share;
 if not found or (p_datos->>'pago'='mercadopago' and not v_minorista_reserva) then raise exception 'Metodo de pago no disponible'; end if;
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
  select f.abastecimiento,s.stock into v_mode,v_available from private.inventario_ficha f
   join public.producto_simple s on s.id_producto=f.producto_id
   where f.producto_id=r.producto_simple_id for update of s;
  if not found or v_available is null then raise exception 'Insumo físico no disponible'; end if;
  if v_mode='stock' and v_available<r.cantidad then raise exception 'Stock insuficiente para producto %',r.producto_simple_id; end if;
  v_take:=case when v_mode='a_pedido' then least(v_available,r.cantidad) else r.cantidad end;
  v_pending:=r.cantidad-v_take;
  if v_take>0 then
   update public.producto_simple set stock=stock-v_take where id_producto=r.producto_simple_id and stock>=v_take;
   if not found then raise exception 'Stock insuficiente para producto %',r.producto_simple_id; end if;
   v_reserved:=v_reserved||jsonb_build_array(jsonb_build_object('producto_simple_id',r.producto_simple_id,'cantidad',v_take));
  end if;
  if v_pending>0 then
   v_unfilled:=v_unfilled||jsonb_build_array(jsonb_build_object('producto_simple_id',r.producto_simple_id,'cantidad',v_pending));
  end if;
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
 select o.id,producto_simple_id,cantidad from jsonb_to_recordset(v_reserved) as n(producto_simple_id bigint,cantidad integer);
 insert into public.movimiento_stock(pedido_id,producto_simple_id,cantidad,motivo)
 select o.id,producto_simple_id,-cantidad,'reserva' from jsonb_to_recordset(v_reserved) as n(producto_simple_id bigint,cantidad integer);
 insert into public.pedido_abastecimiento(pedido_id,producto_simple_id,cantidad_solicitada,cantidad_pendiente)
 select o.id,producto_simple_id,cantidad,cantidad from jsonb_to_recordset(v_unfilled) as n(producto_simple_id bigint,cantidad integer);
 insert into public.pago(pedido_id,metodo,importe,moneda) values(o.id,p_datos->>'pago',o.total,'ARS');
 insert into public.envio(pedido_id,metodo) values(o.id,e.codigo);
 update public.carrito set estado='convertido' where id=c.id;
 return to_jsonb(o);
end $$;

create or replace function private.mb_checkout_minorista_v1(p_token_hash text,p_usuario_id uuid,p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 c public.carrito; o public.pedido; q public.checkout_cotizacion_envio;
 v_base jsonb; v_line jsonb; v_subtotal numeric(12,2); v_discount numeric(12,2);
 v_carrier numeric(12,2):=0; v_customer_shipping numeric(12,2); v_mode text; v_payment text;
begin

 if p_token_hash !~ '^[a-f0-9]{64}$' or nullif(p_datos->>'idempotencia','') is null then raise exception 'Sesion o intento invalido'; end if;
 v_mode:=p_datos->>'envio'; v_payment:=p_datos->>'pago';
 if v_mode not in ('retiro','correo_domicilio','correo_sucursal') or v_payment not in ('transferencia','mercadopago')
  then raise exception 'Metodo no disponible'; end if;
 if jsonb_typeof(p_datos->'destinatario') is distinct from 'object' or
  exists(select 1 from unnest(array['nombre','apellido','email','telefono','codigo_postal','provincia','ciudad','calle','numero']) k
    where nullif(trim(p_datos->'destinatario'->>k),'') is null)
  then raise exception 'Destinatario incompleto'; end if;
 perform pg_advisory_xact_lock(782204,1);
 perform pg_advisory_xact_lock(hashtextextended(p_token_hash,0));
 select * into o from public.pedido where carrito_id=(select id from public.carrito where token_hash=p_token_hash and (usuario_id is null or usuario_id=p_usuario_id)) and idempotencia=(p_datos->>'idempotencia')::uuid;
 if found then
  if o.direccion_entrega->'destinatario' is distinct from p_datos->'destinatario'
   or o.direccion_entrega->>'modalidad' is distinct from v_mode
   or (select metodo from public.pago where pedido_id=o.id limit 1) is distinct from v_payment
   then raise exception 'La clave de intento ya corresponde a otro pedido'; end if;
  return to_jsonb(o);
 end if;
 select * into c from public.carrito where token_hash=p_token_hash and (usuario_id is null or usuario_id=p_usuario_id) for update;
 if not found then raise exception 'Carrito inexistente'; end if;
 if c.estado<>'abierto' then raise exception 'Carrito ya confirmado'; end if;
 perform 1 from public.metodo_pago where codigo=v_payment and activo for share;
 if not found then raise exception 'Medio de pago no disponible'; end if;
 perform 1 from public.metodo_envio where codigo=v_mode and activo for share;
 if not found then raise exception 'Entrega no disponible'; end if;
 if v_mode<>'retiro' then
  select * into q from public.checkout_cotizacion_envio where id=(p_datos->>'cotizacion_id')::uuid
   and carrito_id=c.id and usuario_id is not distinct from p_usuario_id and modalidad=v_mode and destinatario=p_datos->'destinatario'
   and valido_hasta>clock_timestamp() for share;
  if not found then raise exception 'Cotizacion de envio vencida o invalida'; end if;
  v_carrier:=q.costo_transportista;
 end if;
 -- The underlying reservation checks the current mapping, price, stock,
 -- cart ownership and idempotency. Its preliminary commercial snapshot is
 -- replaced below before this transaction commits.
 select * into o from jsonb_populate_record(null::public.pedido,
  public.mb_checkout_catalogo(p_token_hash,p_usuario_id,
   jsonb_build_object('idempotencia',p_datos->>'idempotencia','pago',v_payment,'envio','retiro','_minorista_reserva',true)));
 -- The catalog rows are now locked, so this commercial snapshot cannot race
 -- with a price or mapping edit between quoting and reservation.
 v_base:=public.mb_cotizar_catalogo(c.id,'mercadopago');
 v_subtotal:=(v_base->>'subtotal')::numeric;
 if v_subtotal is null or v_subtotal<=0 then raise exception 'Subtotal invalido'; end if;
 v_discount:=case when v_payment='transferencia' then round(v_subtotal*0.10,2) else 0 end;
 v_customer_shipping:=case when v_subtotal>=80000 then 0 else v_carrier end;
 for v_line in select value from jsonb_array_elements(v_base->'items') loop
  update public.pedido_item set precio_unitario=(v_line->>'precio_unitario')::numeric
   where pedido_id=o.id and (variante_id=(v_line->>'variante_id')::bigint or
    (variante_id is null and nullif(v_line->>'variante_id','') is null and producto_id=(v_line->>'producto_id')::bigint));
 end loop;
 update public.pedido set subtotal_mercaderia=v_subtotal,descuento_productos=v_discount,
  subtotal=v_subtotal-v_discount,costo_envio=v_customer_shipping,costo_transportista=v_carrier,
  reserva_hasta=now()+case when v_payment='mercadopago' then interval '1 hour' else interval '24 hours' end,
  direccion_entrega=jsonb_build_object('destinatario',p_datos->'destinatario','modalidad',v_mode,
    'punto',case when v_mode='correo_sucursal' then q.punto else null end)
  where id=o.id returning * into o;
 update public.pago set metodo=v_payment,importe=o.total where pedido_id=o.id;
 update public.envio set metodo=v_mode where pedido_id=o.id;
 return to_jsonb(o);
end $$;

create or replace function public.mb_checkout_minorista(p_token_hash text,p_usuario_id uuid,p_datos jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.carrito; q public.checkout_cotizacion_envio; o public.pedido; result jsonb; snap jsonb;
 n integer; i integer; cents bigint; part_cents bigint; parcel jsonb; parcels jsonb:='[]';
begin

 perform pg_advisory_xact_lock(782204,1);
 perform pg_advisory_xact_lock(hashtextextended(p_token_hash,0));
 select * into o from public.pedido where carrito_id=(select id from public.carrito where token_hash=p_token_hash and (usuario_id is null or usuario_id=p_usuario_id)) and idempotencia=(p_datos->>'idempotencia')::uuid;
 if found then
  if o.cotizacion_envio_id is distinct from nullif(p_datos->>'cotizacion_id','')::uuid then raise exception 'Cotizacion de otro intento'; end if;
  return private.mb_checkout_minorista_v1(p_token_hash,p_usuario_id,p_datos);
 end if;
 select * into c from public.carrito where token_hash=p_token_hash for update;
 if not found or c.usuario_id is not null and c.usuario_id is distinct from p_usuario_id then raise exception 'Carrito inexistente'; end if;
 if p_datos->>'envio'<>'retiro' then
  select * into q from public.checkout_cotizacion_envio where id=(p_datos->>'cotizacion_id')::uuid
    and usuario_id is not distinct from p_usuario_id and carrito_id=c.id and modalidad=p_datos->>'envio'
    and destinatario=p_datos->'destinatario' and valido_hasta>clock_timestamp() for share;
  if not found or q.snapshot is null or q.fingerprint is null or
    q.fingerprint is distinct from public.mb_shipping_fingerprint(c.id,q.snapshot) then raise exception 'Cotizacion vencida o carrito modificado'; end if;
  if jsonb_typeof(q.snapshot->'parcels') is distinct from 'array'
    or jsonb_array_length(q.snapshot->'parcels') not between 1 and 20 then raise exception 'Snapshot logistico invalido'; end if;
 end if;
 result:=private.mb_checkout_minorista_v1(p_token_hash,p_usuario_id,p_datos);
 update public.pedido_item i set precio_original=greatest(i.precio_unitario,case when i.variante_id is null then p.precio else v.precio end),
  imagen_storage_path=(select a.storage_path from public.catalogo_imagen im join public.catalogo_asset a on a.sha256=im.asset_hash where im.producto_id=i.producto_id and im.vigente order by im.posicion limit 1)
 from public.producto p left join public.catalogo_variante v on v.producto_id=p.id_producto
 where i.pedido_id=(result->>'id')::uuid and p.id_producto=i.producto_id
 and (i.variante_id=v.id or i.variante_id is null);
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

-- Backend-only cancellation preserves the exact inventory lock/release lifecycle.
-- Browser authorization happens separately; webhooks use verified provider ownership.
create function public.mb_cancelar_pedido_servicio(p_pedido_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o public.pedido; r record;
begin
 perform pg_advisory_xact_lock(782204,1);
 select * into o from public.pedido where id=p_pedido_id for update;
 if not found then raise exception 'Pedido inexistente'; end if;
 if o.estado='cancelado' then return to_jsonb(o); end if;
 if o.estado<>'pendiente_pago' then raise exception 'El pedido ya no admite cancelacion automatica'; end if;
 for r in select * from public.pedido_stock where pedido_id=o.id order by producto_simple_id loop
  update public.producto_simple set stock=stock+r.cantidad where id_producto=r.producto_simple_id;
  insert into public.movimiento_stock(pedido_id,producto_simple_id,cantidad,motivo) values(o.id,r.producto_simple_id,r.cantidad,'liberacion');
 end loop;
 update public.pedido set estado='cancelado' where id=o.id returning * into o;
 update public.pago set estado='cancelado' where pedido_id=o.id and estado='pendiente';
 update public.envio set estado='cancelado',actualizado_en=now() where pedido_id=o.id;
 return to_jsonb(o);
end $$;

-- Token and optional verified Auth ID are supplied only by Express, never the client body.
create or replace function public.mb_expirar_reservas() returns integer
language plpgsql security invoker set search_path='' as $$
declare r record; n integer:=0;
begin
 perform pg_advisory_xact_lock(782204,1);
 for r in select id from public.pedido where estado='pendiente_pago' and reserva_hasta<=clock_timestamp()
 order by reserva_hasta limit 100 for update skip locked loop
  perform public.mb_cancelar_pedido_servicio(r.id);
  update public.pedido set estado='expirado' where id=r.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.mb_expirar_reservas() from public,anon,authenticated;
grant execute on function public.mb_expirar_reservas() to service_role;

create function public.mb_pedido_por_carrito(p_pedido_id uuid,p_token_hash text,p_usuario_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select to_jsonb(o) || jsonb_build_object(
  'items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.pedido_item i where i.pedido_id=o.id),
  'pago',(select coalesce(jsonb_agg(jsonb_build_object('metodo',g.metodo,'estado',g.estado,'referencia_externa',g.referencia_externa)),'[]') from public.pago g where g.pedido_id=o.id),
  'envio',(select jsonb_build_object('estado',e.estado,'transportista',e.transportista,'seguimiento',e.seguimiento) from public.envio e where e.pedido_id=o.id))
 from public.pedido o join public.carrito c on c.id=o.carrito_id
 where o.id=p_pedido_id and (
  (p_usuario_id is not null and o.usuario_id=p_usuario_id) or
  (c.token_hash=p_token_hash and (c.usuario_id is null or c.usuario_id=p_usuario_id)));
$$;
revoke all on function public.mb_cancelar_pedido_servicio(uuid),public.mb_pedido_por_carrito(uuid,text,uuid),
 public.mb_checkout_catalogo(text,uuid,jsonb),private.mb_checkout_minorista_v1(text,uuid,jsonb),public.mb_checkout_minorista(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mb_cancelar_pedido_servicio(uuid),public.mb_pedido_por_carrito(uuid,text,uuid),
 public.mb_checkout_catalogo(text,uuid,jsonb),private.mb_checkout_minorista_v1(text,uuid,jsonb),public.mb_checkout_minorista(text,uuid,jsonb) to service_role;
