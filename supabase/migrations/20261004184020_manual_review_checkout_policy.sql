-- Application-only policy fix. Never restores historical fixtures or stock.
-- Existing orders retain NULL in additive promotion snapshot fields.
alter table public.pedido add column subtotal_original_productos numeric(12,2),add column descuento_promocional numeric(12,2),add column mates_fisicos integer;
-- Compatibility helper returns a base price. Both discounts now belong to
-- the whole order; no per-variant/category promotion can apply a second time.
create or replace function public.mb_precio_variante(p_variante_id bigint,p_pago text,p_cantidad_categoria integer)
returns numeric language sql stable security invoker set search_path='' as $$
 select round(cv.precio,2) from public.catalogo_variante cv where cv.id=p_variante_id;
$$;
create or replace function public.mb_cantidad_promo(p_carrito_id uuid) returns integer
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(n.quantity),0)::integer from (
 select i.cantidad*c.cantidad quantity from public.carrito_variante i join public.catalogo_variante_componente c on c.variante_id=i.variante_id join public.producto_simple s on s.id_producto=c.producto_simple_id where i.carrito_id=p_carrito_id and s.categoria='Mates'
 union all select i.cantidad from public.carrito_item i join public.producto_simple s on s.id_producto=i.producto_id where i.carrito_id=p_carrito_id and s.categoria='Mates'
 union all select i.cantidad*c.cantidad from public.carrito_item i join public.combo_item c on c.id_combo=i.producto_id join public.producto_simple s on s.id_producto=c.id_producto_simple where i.carrito_id=p_carrito_id and s.categoria='Mates'
 ) n;
$$;
create or replace function public.mb_cotizar_catalogo(p_carrito_id uuid,p_pago text)
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
  r.precio:=r.precio;
  items:=items||jsonb_build_array(jsonb_build_object('producto_id',r.producto_id,'variante_id',r.variante_id,
   'nombre',r.nombre,'cantidad',r.cantidad,'precio_unitario',r.precio,'opciones',r.opciones,'personalizacion',r.personalizacion));
  total:=total+r.cantidad*r.precio;
 end loop;
 return jsonb_build_object('items',items,'subtotal_original_productos',round(total,2),'descuento_promocional',case when qty>=2 then round(total*0.20,2) else 0 end,'mates_fisicos',qty,'subtotal',round(total,2)-(case when qty>=2 then round(total*0.20,2) else 0 end),'moneda','ARS');
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
  exists(select 1 from unnest((array['nombre','apellido','email','telefono']||case when v_mode='correo_domicilio' then array['codigo_postal','provincia','ciudad','calle','numero'] else array[]::text[] end)) k
    where nullif(trim(p_datos->'destinatario'->>k),'') is null)
  then raise exception 'Destinatario incompleto'; end if;
 if p_datos->'destinatario'->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_datos->'destinatario'->>'email')>254 then raise exception 'Email invalido'; end if;
 if regexp_replace(p_datos->'destinatario'->>'telefono','[^0-9]','','g') !~ '^(0?[1-9][0-9]{9}|54(9)?[1-9][0-9]{9})$' then raise exception 'Telefono invalido'; end if;
 if v_mode='correo_domicilio' and (p_datos->'destinatario'->>'codigo_postal' !~ '^([0-9]{4}|[A-Za-z][0-9]{4}[A-Za-z]{3})$' or p_datos->'destinatario'->>'numero' !~ '^[1-9][0-9]{0,5}[A-Za-z]?$') then raise exception 'Direccion invalida'; end if;
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
 update public.pedido set subtotal_original_productos=(v_base->>'subtotal_original_productos')::numeric,descuento_promocional=(v_base->>'descuento_promocional')::numeric,mates_fisicos=(v_base->>'mates_fisicos')::integer,subtotal_mercaderia=v_subtotal,descuento_productos=v_discount,
  subtotal=v_subtotal-v_discount,costo_envio=v_customer_shipping,costo_transportista=v_carrier,
  reserva_hasta=now()+case when v_payment='mercadopago' then interval '1 hour' else interval '24 hours' end,
  direccion_entrega=jsonb_build_object('destinatario',p_datos->'destinatario','modalidad',v_mode,
    'punto',case when v_mode='correo_sucursal' then q.punto else null end)
  where id=o.id returning * into o;
 update public.pago set metodo=v_payment,importe=o.total where pedido_id=o.id;
 update public.envio set metodo=v_mode where pedido_id=o.id;
 return to_jsonb(o);
end $$;
create or replace function private.mb_order_view(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',o.id,'numero',coalesce(o.numero_publico::text,upper(left(o.id::text,8))),
  'estado',o.estado,'moneda',o.moneda,'reserva_hasta',o.reserva_hasta,'subtotal_mercaderia',o.subtotal_mercaderia,
  'subtotal_original_productos',o.subtotal_original_productos,'descuento_promocional',o.descuento_promocional,'mates_fisicos',o.mates_fisicos,'descuento_productos',o.descuento_productos,'costo_envio',o.costo_envio,'total',o.total,
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
revoke all on function public.mb_cantidad_promo(uuid),public.mb_cotizar_catalogo(uuid,text),private.mb_checkout_minorista_v1(text,uuid,jsonb),private.mb_order_view(uuid) from public,anon,authenticated;
grant execute on function public.mb_cantidad_promo(uuid),public.mb_cotizar_catalogo(uuid,text),private.mb_checkout_minorista_v1(text,uuid,jsonb),private.mb_order_view(uuid) to service_role;

-- Strengthen the existing manual confirmation, without a parallel payment path.
create or replace function public.mb_confirmar_transferencia(p_actor_id uuid,p_pedido_id uuid,p_referencia text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.pedido; g public.pago;
begin
 perform pg_advisory_xact_lock(782204,1);
 if not public.mb_inventario_autorizado(p_actor_id) then raise exception 'Solo administracion puede confirmar pagos' using errcode='42501'; end if;
 select * into o from public.pedido where id=p_pedido_id for update;
 if not found then raise exception 'Pedido inexistente'; end if;
 select * into g from public.pago where pedido_id=o.id and metodo='transferencia' for update;
 if not found then raise exception 'No es una transferencia'; end if;
 if nullif(trim(p_referencia),'') is null or length(p_referencia)>150 then raise exception 'Referencia bancaria invalida';end if;
 if exists(select 1 from private.confirmacion_transferencia where pedido_id=o.id) then
  return to_jsonb(o);end if;
 perform set_config('matebreak.retail_actor',p_actor_id::text,true);
 perform set_config('matebreak.retail_action','confirm_transfer',true);
 perform set_config('matebreak.retail_action_id','',true);
 if o.estado<>'pendiente_pago' or o.reserva_hasta<=clock_timestamp() then raise exception 'Pago requiere revision manual'; end if;
 perform public.mb_confirmar_pago(g.id,p_referencia,g.importe,g.moneda);
 insert into private.confirmacion_transferencia(pedido_id,actor_id,referencia) values(o.id,p_actor_id,p_referencia);
 select * into o from public.pedido where id=p_pedido_id;
 return to_jsonb(o);
end $$;
