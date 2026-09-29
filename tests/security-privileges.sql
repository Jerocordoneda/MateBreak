-- Run only in a fresh disposable local PostgreSQL database as superuser.
\set ON_ERROR_STOP on
begin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_admin nologin;
grant create on schema public to supabase_admin;
create table public.producto (id integer);
create table public.combo (id integer);
create table public.combo_item (id integer);
create sequence public.producto_id_producto_seq;
create sequence public.catalogo_categoria_id_seq;
create sequence public.catalogo_variante_id_seq;
grant all on public.producto, public.combo, public.combo_item to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant execute on functions to anon, authenticated, service_role;
\ir ../supabase/migrations/20260929214717_harden_default_privileges.sql
create table public.future_table (id integer);
create sequence public.future_sequence;
create function public.future_function() returns integer language sql as 'select 1';
set role supabase_admin;
create table public.future_admin_table (id integer);
create sequence public.future_admin_sequence;
create function public.future_admin_function() returns integer language sql as 'select 1';
reset role;
do $$
begin
  if has_table_privilege('anon','public.producto','SELECT') or
     has_table_privilege('authenticated','public.combo','INSERT') or
     has_sequence_privilege('anon','public.producto_id_producto_seq','USAGE') or
     has_table_privilege('anon','public.future_table','SELECT') or
     has_table_privilege('authenticated','public.future_table','UPDATE') or
     has_sequence_privilege('anon','public.future_sequence','USAGE') or
     has_function_privilege('anon','public.future_function()','EXECUTE') or
     has_function_privilege('authenticated','public.future_function()','EXECUTE') or
     has_table_privilege('anon','public.future_admin_table','SELECT') or
     has_sequence_privilege('authenticated','public.future_admin_sequence','USAGE') or
     has_function_privilege('anon','public.future_admin_function()','EXECUTE') then
    raise exception 'Browser role retained an implicit privilege';
  end if;
  if not has_table_privilege('service_role','public.producto','SELECT') or
     not has_table_privilege('service_role','public.future_table','SELECT') or
     not has_function_privilege('service_role','public.future_function()','EXECUTE') or
     not has_table_privilege('service_role','public.future_admin_table','SELECT') then
    raise exception 'Backend role lost its privilege';
  end if;
end $$;
rollback;
select 'security-privileges: OK';
