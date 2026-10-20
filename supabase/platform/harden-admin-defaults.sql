-- PLATFORM OPERATOR ONLY. Not part of application migrations or local reset.
-- Run only through an authorized platform administration channel as supabase_admin.
-- Never grant postgres membership/superuser to work around platform boundaries.
-- This file has NOT been applied to the real Supabase project.
alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin revoke execute on functions from public;
alter default privileges for role supabase_admin in schema public revoke execute on functions from anon, authenticated;
