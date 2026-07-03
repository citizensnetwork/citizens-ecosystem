-- ============================================================================
-- 146_wear_user_roles_grants.sql — APPLIED 2026-07-02
--
-- Follow-up to 145: mig-143 granted wear.* table privileges explicitly per
-- table (no ALTER DEFAULT PRIVILEGES), so the new wear.user_roles table was
-- created with NO table-level grants — the user_roles_self_read policy was
-- unreachable (authenticated got 42501 before RLS was even consulted) and
-- service_role could not issue role grants (bypassrls skips policies, not
-- table privileges). Surfaced by the 145 post-apply smoke test.
--
-- Least-privilege, deliberately narrower than mig-143's blanket pattern:
--  * authenticated: SELECT only — RLS (user_roles_self_read) scopes to self.
--  * service_role : full — the only writer (P2.2 no-self-escalation wall).
--  * anon         : NOTHING — platform roles are not public data.
--  * authenticated INSERT/UPDATE/DELETE: NOT granted — self-escalation now
--    blocked at BOTH the grant layer and the (absent-policy) RLS layer.
-- ============================================================================

grant select on table wear.user_roles to authenticated;
grant all on table wear.user_roles to service_role;
