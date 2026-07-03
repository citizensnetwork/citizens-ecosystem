-- ============================================================================
-- 091_enforce_place_six_month_delete_revoke_roles.sql
--
-- Tightens privileges on the SECURITY DEFINER trigger function introduced in
-- migration 089. The function only needs to be invoked by Postgres internals
-- during BEFORE DELETE on public.places; no client role should be able to
-- call it directly. Migration 089 already revoked from public, but Supabase
-- advisors flag the function as executable by `anon` and `authenticated`
-- because those roles inherit usage on schema `public` and the default
-- function grant. This migration revokes execute from both roles
-- explicitly. Trigger invocation is unaffected (triggers run regardless of
-- grants on the function).
-- ============================================================================

revoke all on function public.enforce_place_six_month_delete() from anon, authenticated;
