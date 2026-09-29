-- Extensions to the disposable concurrency fixture for the real SQL lifecycle.
-- This is test infrastructure, never a migration and never run on Supabase.
alter table public.pedido
 add column subtotal_mercaderia numeric(12,2),
 add column descuento_productos numeric(12,2) not null default 0,
 add column costo_transportista numeric(12,2);
alter table public.carrito alter column estado set default 'abierto';
alter table public.producto add column external_id text;
alter table public.pago
 add column id uuid not null default gen_random_uuid() primary key,
 add column estado text not null default 'pendiente',
 add column referencia_externa text,
 add column confirmado_en timestamptz;
alter table public.envio
 add column estado text not null default 'pendiente',
 add column actualizado_en timestamptz not null default now();

insert into public.metodo_pago(codigo,activo) values ('mercadopago',false);
insert into public.metodo_envio(codigo,nombre,costo,activo,requiere_direccion)
 values ('correo_domicilio','Correo Argentino a domicilio',0,false,true);
update public.metodo_pago set activo=false where codigo='transferencia';
update public.metodo_envio set activo=false where codigo='retiro';

create table public.checkout_cotizacion_envio (
 id uuid primary key default gen_random_uuid(),
 carrito_id uuid not null references public.carrito(id),
 usuario_id uuid not null references auth.users(id),
 destinatario jsonb not null,
 modalidad text not null,
 punto jsonb,
 costo_transportista numeric(12,2) not null,
 valido_hasta timestamptz not null
);
create table private.equipo_inventario (usuario_id uuid primary key, activo boolean not null);
create table private.confirmacion_transferencia (
 pedido_id uuid primary key references public.pedido(id),
 actor_id uuid not null references auth.users(id),
 referencia text not null,
 confirmado_en timestamptz not null default now()
);
create function public.mb_inventario_autorizado(p_usuario_id uuid)
returns boolean language sql as $$
 select exists(select 1 from private.equipo_inventario
  where usuario_id=p_usuario_id and activo);
$$;
