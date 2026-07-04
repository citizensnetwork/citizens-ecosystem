-- =========================================================================
-- 140 — Revoke over-granted EXECUTE on public SECURITY DEFINER functions
-- =========================================================================
-- Pre-existing Connect tech-debt (surfaced while consolidating the Vision
-- schema in migrations 137–139, but NOT caused by that work).
--
-- Supabase security advisors flagged 45 `anon_security_definer_function_
-- executable` + 59 `authenticated_security_definer_function_executable`
-- WARNs: SECURITY DEFINER functions in `public` whose EXECUTE is granted to
-- low-privilege roles (often the default PUBLIC grant left in place at
-- CREATE FUNCTION time). A SECURITY DEFINER function runs with its owner's
-- rights and bypasses RLS, so any over-grant is an escalation surface.
--
-- This migration TIGHTENS only — it never loosens. It matches the hardening
-- pattern already used in migrations 051 and 076 (apply_event_content_labels)
-- and the new vision.* functions in migration 137.
--
-- Three classes are handled. A fourth class — genuine public RPCs the
-- anonymous site legitimately calls AND that are internally guarded / read
-- only public data — is INTENTIONALLY LEFT anon-executable and documented at
-- the end of this file; those advisor WARNs are expected and acceptable.
--
-- NB on the PUBLIC grant: several of these functions carry an ACL entry for
-- PUBLIC (`=X/postgres`). Revoking only `anon` would leave anon able to
-- execute via PUBLIC, so every REVOKE below also revokes from `public`. For
-- the "keep authenticated" class we then re-GRANT authenticated to guarantee
-- logged-in callers retain access after the PUBLIC entry is removed.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- CLASS A — Trigger functions (return `trigger`)
-- -------------------------------------------------------------------------
-- Trigger functions are invoked by the trigger machinery as the table
-- owner, NOT as the session role. They never require a direct EXECUTE grant
-- to anon/authenticated, and none are exposed as RPCs. Lock to service_role
-- only (retained for completeness / future admin tooling — not needed for
-- trigger invocation), exactly like migration 076.
-- -------------------------------------------------------------------------
revoke execute on function public.ai_search_trim_rolling_50()            from public, anon, authenticated;
revoke execute on function public.bump_tag_usage_count()                 from public, anon, authenticated;
revoke execute on function public.enforce_at_least_one_admin()           from public, anon, authenticated;
revoke execute on function public.enforce_tag_cap_per_event()            from public, anon, authenticated;
revoke execute on function public.ensure_contributor_self_owner()        from public, anon, authenticated;
revoke execute on function public.events_enforce_community_rate_limit()  from public, anon, authenticated;
revoke execute on function public.events_set_community_flag()            from public, anon, authenticated;
revoke execute on function public.handle_new_user()                      from public, anon, authenticated;
revoke execute on function public.notify_event_field_changes()           from public, anon, authenticated;
revoke execute on function public.notify_friends_on_rsvp_attending()     from public, anon, authenticated;
revoke execute on function public.notify_on_convince()                   from public, anon, authenticated;
revoke execute on function public.on_rsvp_cancellation_increment()       from public, anon, authenticated;
revoke execute on function public.protect_role_column()                  from public, anon, authenticated;
revoke execute on function public.set_broadcast_audience_snapshot()      from public, anon, authenticated;
revoke execute on function public.update_conversation_timestamp()        from public, anon, authenticated;

grant execute on function public.ai_search_trim_rolling_50()            to service_role;
grant execute on function public.bump_tag_usage_count()                 to service_role;
grant execute on function public.enforce_at_least_one_admin()           to service_role;
grant execute on function public.enforce_tag_cap_per_event()            to service_role;
grant execute on function public.ensure_contributor_self_owner()        to service_role;
grant execute on function public.events_enforce_community_rate_limit()  to service_role;
grant execute on function public.events_set_community_flag()            to service_role;
grant execute on function public.handle_new_user()                      to service_role;
grant execute on function public.notify_event_field_changes()           to service_role;
grant execute on function public.notify_friends_on_rsvp_attending()     to service_role;
grant execute on function public.notify_on_convince()                   to service_role;
grant execute on function public.on_rsvp_cancellation_increment()       to service_role;
grant execute on function public.protect_role_column()                  to service_role;
grant execute on function public.set_broadcast_audience_snapshot()      to service_role;
grant execute on function public.update_conversation_timestamp()        to service_role;

-- -------------------------------------------------------------------------
-- CLASS B — Server/maintenance-only function (no client caller)
-- -------------------------------------------------------------------------
-- cleanup_stale_locations() deletes stale rows from public.user_locations.
-- It has NO caller in the application (verified across src/) and is run, if
-- at all, by a server/cron context (all pg_cron jobs run as `postgres`).
-- anon/authenticated must never execute it. Lock to service_role only.
-- -------------------------------------------------------------------------
revoke execute on function public.cleanup_stale_locations() from public, anon, authenticated;
grant  execute on function public.cleanup_stale_locations() to service_role;

-- -------------------------------------------------------------------------
-- CLASS C — Privileged / authenticated-only RPCs
-- -------------------------------------------------------------------------
-- These ARE legitimately invoked, but only by signed-in users or admins
-- (admins are the `authenticated` role; each function carries an internal
-- auth.uid()/is_admin() guard that rejects unauthorised callers). The anon
-- grant is the over-grant: an anonymous visitor has no business reaching
-- them. Revoke PUBLIC + anon, keep authenticated. service_role retains its
-- existing explicit grant.

-- Admin-gated RPCs (internal is_admin() guard) — called from /api/admin/*,
-- /api/contributor/* dashboards, /api/admin/api-keys:
revoke execute on function public.approve_admin_elevation(uuid)                      from public, anon;
revoke execute on function public.reject_admin_elevation(uuid, text)                 from public, anon;
revoke execute on function public.approve_contributor_application(uuid)              from public, anon;
revoke execute on function public.reject_contributor_application(uuid, text)         from public, anon;
revoke execute on function public.delete_contributor_application(uuid)               from public, anon;
revoke execute on function public.create_api_key(uuid, text, integer, text[])        from public, anon;
revoke execute on function public.revoke_api_key(uuid)                                from public, anon;
grant  execute on function public.approve_admin_elevation(uuid)                      to authenticated;
grant  execute on function public.reject_admin_elevation(uuid, text)                 to authenticated;
grant  execute on function public.approve_contributor_application(uuid)              to authenticated;
grant  execute on function public.reject_contributor_application(uuid, text)         to authenticated;
grant  execute on function public.delete_contributor_application(uuid)               to authenticated;
grant  execute on function public.create_api_key(uuid, text, integer, text[])        to authenticated;
grant  execute on function public.revoke_api_key(uuid)                                to authenticated;

-- Org/admin-scoped analytics (internal is_admin()/owner guard) —
-- /api/dashboard/stats:
revoke execute on function public.get_category_trends()        from public, anon;
revoke execute on function public.get_community_health()       from public, anon;
revoke execute on function public.get_org_audience(uuid)       from public, anon;
revoke execute on function public.get_org_event_stats(uuid)    from public, anon;
revoke execute on function public.get_top_search_terms(integer, integer) from public, anon; -- contributor dashboard "top searches" panel
grant  execute on function public.get_category_trends()        to authenticated;
grant  execute on function public.get_community_health()       to authenticated;
grant  execute on function public.get_org_audience(uuid)       to authenticated;
grant  execute on function public.get_org_event_stats(uuid)    to authenticated;
grant  execute on function public.get_top_search_terms(integer, integer) to authenticated;

-- Signed-in user actions (auth.uid()-bound; anon cannot RSVP / message):
revoke execute on function public.safe_rsvp(uuid, uuid)        from public, anon;
revoke execute on function public.toggle_consider(uuid, uuid)  from public, anon;
revoke execute on function public.find_or_create_conversation(uuid, uuid, text) from public, anon;
grant  execute on function public.safe_rsvp(uuid, uuid)        to authenticated;
grant  execute on function public.toggle_consider(uuid, uuid)  to authenticated;
grant  execute on function public.find_or_create_conversation(uuid, uuid, text) to authenticated;

-- SECURITY DEFINER predicate helpers not referenced by any anon-facing RLS
-- policy and not called by anon code:
--   is_organiser()           — used only by 1 authenticated-role RLS policy
--                              (places "Organiser roles can create places")
--   is_approved_contributor()/is_blocked() — 0 RLS references; is_blocked is
--                              an internal helper for the (authenticated)
--                              conversations API.
-- Keep authenticated (load-bearing / server helpers); drop anon.
revoke execute on function public.is_organiser()                 from public, anon;
revoke execute on function public.is_approved_contributor()      from public, anon;
revoke execute on function public.is_blocked(uuid, uuid)         from public, anon;
revoke execute on function public.get_mutual_followers(uuid, uuid, integer) from public, anon;
grant  execute on function public.is_organiser()                 to authenticated;
grant  execute on function public.is_approved_contributor()      to authenticated;
grant  execute on function public.is_blocked(uuid, uuid)         to authenticated;
grant  execute on function public.get_mutual_followers(uuid, uuid, integer) to authenticated;

commit;

-- =========================================================================
-- INTENTIONALLY LEFT anon-executable (still SECURITY DEFINER) — NOT a bug.
-- These remain flagged by the advisor by design; each is a public surface
-- the anonymous site legitimately calls and either reads only public data
-- or is internally guarded:
--   get_active_map_bubbles()          — public map broadcast bubbles
--   get_community_ideas()             — public Kingdom Projects board
--   get_contributor_public_stats(uuid)— public /api/v1 contributor stats
--   get_public_contributor_analytics(uuid,int) — public opt-in analytics
--   get_public_team(uuid)             — public contributor team chips
--   get_search_autocomplete(text,int) — public search autocomplete
--   trending_events(int)              — public trending events
--   resolve_api_key(text)             — resolved server-side via the ANON
--                                       Supabase client (no cookie) for
--                                       API-key auth; returns null on miss.
--   is_admin()                        — referenced by many roles=public RLS
--                                       policies (load-bearing for RLS).
--   is_conversation_participant(uuid,uuid) — referenced by roles=public
--                                       messaging RLS policies (load-bearing).
-- =========================================================================
