-- Existing internal DDL event trigger: it has no browser-facing purpose.
-- Revoking direct calls preserves the event trigger and automatic RLS behavior.
begin;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
commit;
