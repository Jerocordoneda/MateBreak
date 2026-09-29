-- Checkout minorista: accounting snapshot and provider quotes. All methods
-- remain disabled; this migration does not enable real payments or shipping.
alter table public.pedido
 add column subtotal_mercaderia numeric(12,2),
 add column descuento_productos numeric(12,2) not null default 0 check(descuento_productos>=0),
 add column costo_transportista numeric(12,2) check(costo_transportista>=0);

insert into public.metodo_envio(codigo,nombre,costo,requiere_direccion,activo,pais) values
 ('correo_domicilio','Correo Argentino a domicilio',0,true,false,'AR'),
 ('correo_sucursal','Correo Argentino a sucursal',0,true,false,'AR')
on conflict(codigo) do nothing;

create table public.checkout_cotizacion_envio (
 id uuid primary key default gen_random_uuid(),
 carrito_id uuid not null references public.carrito(id) on delete cascade,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 destinatario jsonb not null,
 modalidad text not null check(modalidad in ('correo_domicilio','correo_sucursal')),
 punto jsonb,
 proveedor text not null check(proveedor='correo_argentino'),
 servicio text not null,
 costo_transportista numeric(12,2) not null check(costo_transportista>=0),
 valido_hasta timestamptz not null,
 creado_en timestamptz not null default now()
);
create index checkout_cotizacion_envio_carrito_idx on public.checkout_cotizacion_envio(carrito_id,valido_hasta desc);
alter table public.checkout_cotizacion_envio enable row level security;
revoke all on public.checkout_cotizacion_envio from public,anon,authenticated;
grant select,insert on public.checkout_cotizacion_envio to service_role;

create table private.confirmacion_transferencia (
 pedido_id uuid primary key references public.pedido(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 confirmado_en timestamptz not null default now(),
 referencia text not null
);
alter table private.confirmacion_transferencia enable row level security;
revoke all on private.confirmacion_transferencia from public,anon,authenticated;
grant select,insert on private.confirmacion_transferencia to service_role;

create table public.pago_webhook_auditoria (
 pago_externo_id text not null,
 estado_externo text not null,
 pedido_id uuid references public.pedido(id) on delete restrict,
 resultado text not null check(resultado in ('aplicado','pendiente','revision_manual','ignorado')),
 recibido_en timestamptz not null default now(),
 primary key(pago_externo_id,estado_externo)
);
alter table public.pago_webhook_auditoria enable row level security;
revoke all on public.pago_webhook_auditoria from public,anon,authenticated;
grant select,insert,update on public.pago_webhook_auditoria to service_role;

create table public.mercadopago_intento (
 pedido_id uuid primary key references public.pedido(id) on delete restrict,
 estado text not null check(estado in ('creando','listo','fallido')),
 preferencia_id text unique,
 redireccion text,
 creado_en timestamptz not null default now()
);
alter table public.mercadopago_intento enable row level security;
revoke all on public.mercadopago_intento from public,anon,authenticated;
grant select,insert,update on public.mercadopago_intento to service_role;

-- The existing checkout remains the only stock reservation implementation.
-- This wrapper recalculates the final commercial amounts in the same DB
-- transaction, so any error rolls back the reservation and order together.
create function public.mb_checkout_minorista(p_token_hash text,p_usuario_id uuid,p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 c public.carrito; o public.pedido; q public.checkout_cotizacion_envio;
 v_base jsonb; v_line jsonb; v_subtotal numeric(12,2); v_discount numeric(12,2);
 v_carrier numeric(12,2):=0; v_customer_shipping numeric(12,2); v_mode text; v_payment text;
begin
 if p_usuario_id is null then raise exception 'Inicia sesion'; end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' or nullif(p_datos->>'idempotencia','') is null then raise exception 'Sesion o intento invalido'; end if;
 v_mode:=p_datos->>'envio'; v_payment:=p_datos->>'pago';
 if v_mode not in ('retiro','correo_domicilio','correo_sucursal') or v_payment not in ('transferencia','mercadopago')
  then raise exception 'Metodo no disponible'; end if;
 if jsonb_typeof(p_datos->'destinatario') is distinct from 'object' or
  exists(select 1 from unnest(array['nombre','apellido','email','telefono','codigo_postal','provincia','ciudad','calle','numero']) k
    where nullif(trim(p_datos->'destinatario'->>k),'') is null)
  then raise exception 'Destinatario incompleto'; end if;
 perform pg_advisory_xact_lock(782204,1);
 perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text,0));
 select * into o from public.pedido where usuario_id=p_usuario_id and idempotencia=(p_datos->>'idempotencia')::uuid;
 if found then
  if o.estado not in ('pendiente_pago','pagado') or o.direccion_entrega->'destinatario' is distinct from p_datos->'destinatario'
   or o.direccion_entrega->>'modalidad' is distinct from v_mode
   or (select metodo from public.pago where pedido_id=o.id limit 1) is distinct from v_payment
   then raise exception 'La clave de intento ya corresponde a otro pedido'; end if;
  return to_jsonb(o);
 end if;
 select * into c from public.carrito where token_hash=p_token_hash and (usuario_id is null or usuario_id=p_usuario_id) for update;
 if not found then raise exception 'Carrito inexistente'; end if;
 perform 1 from public.metodo_pago where codigo=v_payment and activo for share;
 if not found then raise exception 'Medio de pago no disponible'; end if;
 perform 1 from public.metodo_envio where codigo=v_mode and activo for share;
 if not found then raise exception 'Entrega no disponible'; end if;
 if v_mode<>'retiro' then
  select * into q from public.checkout_cotizacion_envio where id=(p_datos->>'cotizacion_id')::uuid
   and carrito_id=c.id and usuario_id=p_usuario_id and modalidad=v_mode and destinatario=p_datos->'destinatario'
   and valido_hasta>now() for share;
  if not found then raise exception 'Cotizacion de envio vencida o invalida'; end if;
  v_carrier:=q.costo_transportista;
 end if;
 v_base:=public.mb_cotizar_catalogo(c.id,'mercadopago');
 v_subtotal:=(v_base->>'subtotal')::numeric;
 if v_subtotal is null or v_subtotal<=0 then raise exception 'Subtotal invalido'; end if;
 v_discount:=case when v_payment='transferencia' then round(v_subtotal*0.10,2) else 0 end;
 v_customer_shipping:=case when v_subtotal>=80000 then 0 else v_carrier end;
 -- The underlying reservation checks the current mapping, price, stock,
 -- cart ownership and idempotency. Its preliminary commercial snapshot is
 -- replaced below before this transaction commits.
 select * into o from jsonb_populate_record(null::public.pedido,
  public.mb_checkout_catalogo(p_token_hash,p_usuario_id,
   jsonb_build_object('idempotencia',p_datos->>'idempotencia','pago','transferencia','envio','retiro')));
 for v_line in select value from jsonb_array_elements(v_base->'items') loop
  update public.pedido_item set precio_unitario=(v_line->>'precio_unitario')::numeric
   where pedido_id=o.id and variante_id=(v_line->>'variante_id')::bigint;
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
revoke all on function public.mb_checkout_minorista(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mb_checkout_minorista(text,uuid,jsonb) to service_role;

create function public.mb_confirmar_transferencia(p_actor_id uuid,p_pedido_id uuid,p_referencia text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.pedido; g public.pago;
begin
 perform pg_advisory_xact_lock(782204,1);
 if not public.mb_inventario_autorizado(p_actor_id) then raise exception 'Solo administracion puede confirmar pagos' using errcode='42501'; end if;
 select * into o from public.pedido where id=p_pedido_id for update;
 if not found then raise exception 'Pedido inexistente'; end if;
 select * into g from public.pago where pedido_id=o.id and metodo='transferencia' for update;
 if not found then raise exception 'No es una transferencia'; end if;
 if exists(select 1 from private.confirmacion_transferencia where pedido_id=o.id) then return to_jsonb(o); end if;
 if o.estado<>'pendiente_pago' or o.reserva_hasta<=now() then raise exception 'Pago requiere revision manual'; end if;
 perform public.mb_confirmar_pago(g.id,p_referencia,g.importe,g.moneda);
 insert into private.confirmacion_transferencia(pedido_id,actor_id,referencia) values(o.id,p_actor_id,p_referencia);
 select * into o from public.pedido where id=p_pedido_id;
 return to_jsonb(o);
end $$;
revoke all on function public.mb_confirmar_transferencia(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mb_confirmar_transferencia(uuid,uuid,text) to service_role;

alter table public.pedido drop constraint pedido_estado_check;
alter table public.pedido add constraint pedido_estado_check check(estado in
 ('pendiente_pago','pagado','en_preparacion','enviado','entregado','cancelado','expirado'));

create or replace function public.mb_expirar_reservas() returns integer
language plpgsql security invoker set search_path='' as $$
declare r record; n integer:=0;
begin
 perform pg_advisory_xact_lock(782204,1);
 for r in select id,usuario_id from public.pedido where estado='pendiente_pago' and reserva_hasta<=now()
  order by reserva_hasta limit 100 for update skip locked loop
  perform public.mb_comercio(repeat('0',64),r.usuario_id,'cancelar',jsonb_build_object('id',r.id));
  update public.pedido set estado='expirado' where id=r.id;
  n:=n+1;
 end loop;
 return n;
end $$;

notify pgrst,'reload schema';
