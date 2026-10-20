-- Street heights without a plain number: S/N, KM 12 and 1234 BIS.
-- Non-destructive: replaces only private.mb_checkout_minorista_v1, copied verbatim from
-- 20261004184020_manual_review_checkout_policy.sql with one change, the numero rule.
-- The new rule is a superset of the old one (^[1-9][0-9]{0,5}[A-Za-z]?$): every request the
-- deployed BFF sends today is still accepted. No table, row, grant or stored data changes.
-- Deploy order: this migration, then the BFF with CHECKOUT_FLEXIBLE_STREET_NUMBER=1, then the
-- frontend (it follows numero_flexible from /api/checkout/contexto).
-- Rollback: set CHECKOUT_FLEXIBLE_STREET_NUMBER=0 on the BFF first, then run
-- supabase/rollbacks/20261019120000_flexible_street_number.down.sql. Orders already stored
-- with S/N, KM or BIS keep their address; only new ones are refused again.
begin;
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
 if v_mode='correo_domicilio' and (p_datos->'destinatario'->>'codigo_postal' !~ '^([0-9]{4}|[A-Za-z][0-9]{4}[A-Za-z]{3})$' or p_datos->'destinatario'->>'numero' !~ '^(S/N|KM [0-9]{1,4}(,[0-9]{1,3})?|[0-9]{1,6}([A-Za-z]| BIS| TER)?)$') then raise exception 'Direccion invalida'; end if;
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
revoke all on function private.mb_checkout_minorista_v1(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.mb_checkout_minorista_v1(text,uuid,jsonb) to service_role;
commit;
