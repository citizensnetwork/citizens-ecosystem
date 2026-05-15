-- =========================================================================
-- 076 — Tighten apply_event_content_labels grants
-- =========================================================================
-- Migration 073 over-granted EXECUTE on apply_event_content_labels() to
-- anon + authenticated. The function is only ever invoked from the
-- AFTER INSERT/UPDATE trigger on public.events; triggers run as their
-- owner (postgres) regardless of caller EXECUTE grants. The over-grant
-- raised two new Supabase advisors (anon/authenticated_security_definer_
-- function_executable). Revoke and restrict to service_role only —
-- matches the pattern used by every other internal trigger function
-- in this project (notify_on_convince, notify_friends_on_rsvp_attending,
-- toggle_consider etc.).
-- =========================================================================

revoke execute on function public.apply_event_content_labels() from public, anon, authenticated;
-- service_role retains EXECUTE for completeness (admin tooling, future
-- batch backfills) but is not required for trigger invocation.
grant execute on function public.apply_event_content_labels() to service_role;
