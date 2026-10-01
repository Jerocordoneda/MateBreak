-- Minimal fixture schema for executing the production checkout functions in an
-- ephemeral, loopback-only PostgreSQL cluster. Never run against a shared DB.
create schema auth;
create schema private;
create table public.concurrency_test_sentinel (id integer primary key check (id=1));
insert into public.concurrency_test_sentinel values (1);
create table auth.users (id uuid primary key);
create table public.producto (
 id_producto bigint primary key, nombre text not null, precio numeric,
 tipo text not null, activo boolean not null default true, moneda text not null default 'ARS'
);
create table public.producto_simple (
 id_producto bigint primary key references public.producto(id_producto),
 stock integer not null check(stock>=0)
);
create table private.inventario_ficha (
 producto_id bigint primary key references public.producto_simple(id_producto),
 sku text unique not null, abastecimiento text not null
);
create table public.combo_item (id_combo bigint, id_producto_simple bigint, cantidad integer);
create table public.catalogo_producto (
 producto_id bigint primary key references public.producto(id_producto),
 publicado boolean not null default true, envio_gratis boolean not null default false
);
create table public.catalogo_variante (
 id bigint primary key, producto_id bigint not null references public.producto(id_producto),
 opciones jsonb not null default '{}', precio numeric, precio_transferencia numeric,
 vigente boolean not null default true, disponible boolean not null default true
);
create table public.catalogo_variante_mapeo (
 variante_id bigint primary key references public.catalogo_variante(id),
 aprobado boolean not null default true
);
create table public.catalogo_variante_componente (
 variante_id bigint references public.catalogo_variante(id),
 producto_simple_id bigint references public.producto_simple(id_producto),
 cantidad integer not null check(cantidad>0), requiere_grabado boolean not null default false,
 primary key(variante_id,producto_simple_id)
);
create table public.catalogo_promocion (producto_id bigint, texto text);
create table public.catalogo_categoria (id bigint primary key, slug text);
create table public.catalogo_producto_categoria (producto_id bigint, categoria_id bigint);
create table public.carrito (
 id uuid primary key, token_hash text unique not null, usuario_id uuid,
 expira_en timestamptz not null, estado text not null default 'activo',
 actualizado_en timestamptz not null default now()
);
create table public.carrito_item (
 carrito_id uuid references public.carrito(id), producto_id bigint references public.producto(id_producto),
 cantidad integer not null
);
create table public.carrito_variante (
 carrito_id uuid references public.carrito(id), variante_id bigint references public.catalogo_variante(id),
 cantidad integer not null, personalizacion jsonb
);
create table public.metodo_envio (
 codigo text primary key, nombre text not null, costo numeric not null,
 activo boolean not null default true, requiere_direccion boolean not null default false, pais text
);
create table public.metodo_pago (codigo text primary key, activo boolean not null default true);
create table public.direccion (id uuid primary key, usuario_id uuid, pais text, creado_en timestamptz default now());
create table public.pedido (
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null, carrito_id uuid not null unique,
 idempotencia uuid not null, estado text not null default 'pendiente_pago',
 moneda text not null, subtotal numeric not null, costo_envio numeric not null,
 total numeric generated always as (subtotal+costo_envio) stored,
 direccion_entrega jsonb, creado_en timestamptz not null default now(),
 reserva_hasta timestamptz,
 unique(usuario_id,idempotencia)
);
create table public.pedido_item (
 id uuid primary key default gen_random_uuid(), pedido_id uuid references public.pedido(id),
 producto_id bigint, variante_id bigint, nombre text, precio_unitario numeric,
 cantidad integer, opciones jsonb, personalizacion text
);
create table public.pedido_stock (
 pedido_id uuid references public.pedido(id), producto_simple_id bigint references public.producto_simple(id_producto),
 cantidad integer not null, primary key(pedido_id,producto_simple_id)
);
create table public.pedido_abastecimiento (
 pedido_id uuid references public.pedido(id), producto_simple_id bigint references public.producto_simple(id_producto),
 cantidad_solicitada integer, cantidad_pendiente integer
);
create table public.movimiento_stock (
 pedido_id uuid references public.pedido(id), producto_simple_id bigint references public.producto_simple(id_producto),
 cantidad integer, motivo text, unique(pedido_id,producto_simple_id,motivo)
);
create table public.pago (pedido_id uuid references public.pedido(id), metodo text, importe numeric, moneda text);
create table public.envio (pedido_id uuid references public.pedido(id), metodo text);

insert into public.metodo_envio(codigo,nombre,costo) values ('retiro','Retiro',0);
insert into public.metodo_pago(codigo) values ('transferencia');

-- This fixture-only delay makes lock contention observable. It never changes
-- the production checkout function and exists only in the isolated cluster.
create function public.concurrency_fixture_delay() returns trigger language plpgsql as $$
begin
 -- Docker Desktop's process startup can exceed 350ms. Leave enough time for
 -- the independent observer to prove a real advisory-lock wait.
 perform pg_sleep(1.25);
 return new;
end $$;
create trigger concurrency_fixture_delay before update of stock on public.producto_simple
for each row execute function public.concurrency_fixture_delay();
