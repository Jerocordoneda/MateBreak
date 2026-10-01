-- Recovered from read-only pg_catalog metadata of the existing public schema.
-- Later additions (import columns, ARS, nullable stock/price) belong to later migrations.
-- No production rows. RLS has no policies; only the backend service role has access.
begin;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
grant execute on function public.rls_auto_enable() to service_role;
create event trigger ensure_rls on ddl_command_end
 when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
 execute function public.rls_auto_enable();
create table public.producto (
 id_producto bigint generated always as identity primary key,
 nombre varchar(150) not null,
 descripcion text,
 precio numeric(12,2) not null constraint producto_precio_check check (precio >= 0),
 tipo varchar(20) not null constraint producto_tipo_check check (tipo in ('simple','combo')),
 activo boolean not null default true,
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now()
);
create table public.producto_simple (
 id_producto bigint primary key,
 material varchar(80) not null,
 categoria varchar(80),
 diseno varchar(120),
 stock integer not null default 0 constraint producto_simple_stock_check check (stock >= 0),
 constraint producto_simple_producto_fk foreign key (id_producto)
  references public.producto(id_producto) on delete cascade
);
create table public.combo (
 id_producto bigint primary key,
 constraint combo_producto_fk foreign key (id_producto)
  references public.producto(id_producto) on delete cascade
);
create table public.combo_item (
 id_combo bigint not null,
 id_producto_simple bigint not null,
 cantidad integer not null default 1 constraint combo_item_cantidad_check check (cantidad > 0),
 constraint combo_item_pkey primary key (id_combo,id_producto_simple),
 constraint combo_item_combo_fk foreign key (id_combo) references public.combo(id_producto) on delete cascade,
 constraint combo_item_simple_fk foreign key (id_producto_simple) references public.producto_simple(id_producto) on delete restrict,
 constraint combo_no_autorreferencia_chk check (id_combo <> id_producto_simple)
);
create index combo_item_producto_simple_idx on public.combo_item(id_producto_simple);
alter table public.producto enable row level security;
alter table public.producto_simple enable row level security;
alter table public.combo enable row level security;
alter table public.combo_item enable row level security;
revoke all on public.producto,public.producto_simple,public.combo,public.combo_item from public,anon,authenticated;
revoke all on sequence public.producto_id_producto_seq from public,anon,authenticated;
grant all on public.producto,public.producto_simple,public.combo,public.combo_item to service_role;
grant all on sequence public.producto_id_producto_seq to service_role;
commit;
