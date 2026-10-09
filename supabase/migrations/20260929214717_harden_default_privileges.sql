-- Supabase Data API roles must receive access only through explicit grants.
-- These legacy catalog tables have RLS enabled with no public policies; their
-- DML grants are unnecessary and make a future broad policy more dangerous.
revoke all on table public.producto, public.combo, public.combo_item from anon, authenticated;
revoke all on sequence public.producto_id_producto_seq, public.catalogo_categoria_id_seq,
  public.catalogo_variante_id_seq from anon, authenticated;

-- Application migrations create objects as postgres. supabase_admin is a
-- protected platform role; postgres cannot change its default privileges.
-- Its separate operator-only hardening is in supabase/platform/ below.
-- Keep service_role's existing grants; remove only implicit browser-role grants.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
-- PostgreSQL's built-in PUBLIC EXECUTE default is global. A schema-local
-- REVOKE cannot remove it, so remove it for each creator role globally.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
