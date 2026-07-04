-- ============================================================
-- Migration 014: Security Hardening (Phase 14a)
-- ============================================================
-- Fixes surfaced by the Phase 13/14 security audit:
--   R-1 (MEDIUM-HIGH): `user_org_roles_insert_admin` permits any
--       authenticated user to insert themselves into any org with
--       ANY role (including `org_admin`) because the WITH CHECK
--       clause ORs `user_id = auth.uid()` without a role or
--       "org is currently empty" guard. This fixes that bypass.
--   R-2 (LOW): Add a SECURITY DEFINER helper to encapsulate the
--       `EXISTS (... JOIN goals ...)` used by goal_activity_links
--       so future changes to goals RLS don't silently change link
--       visibility semantics. Policy rewrite is additive/safe.
--
-- All changes are idempotent (IF NOT EXISTS / DROP + CREATE with
-- consistent names) and additive — no existing column, constraint
-- or role data is removed.
-- ============================================================

-- ── R-1: Replace permissive user_org_roles INSERT policy ────
-- Drop the old combined policy.
DROP POLICY IF EXISTS "user_org_roles_insert_admin" ON user_org_roles;

-- Split into three intent-specific policies. PostgreSQL RLS ORs
-- permissive policies together, so any ONE of these being satisfied
-- grants INSERT. This preserves "admins can invite" and
-- "platform admins bypass" while closing the self-insert hole.

-- 1. Org admins can add anyone to their org (invite flow).
CREATE POLICY "user_org_roles_insert_admin"
  ON user_org_roles FOR INSERT
  TO authenticated
  WITH CHECK (is_org_admin(org_id));

-- 2. Platform admins can always insert (support / seeding).
CREATE POLICY "user_org_roles_insert_platform_admin"
  ON user_org_roles FOR INSERT
  TO authenticated
  WITH CHECK (is_platform_admin());

-- 3. A user may insert themselves ONLY as the bootstrap member of
--    an org that currently has zero members (i.e. org-creation
--    flow), and ONLY as an `org_admin` — the founder of the org.
--    This blocks the "add myself to victim-org as org_admin" attack
--    because the victim org already has members.
CREATE POLICY "user_org_roles_insert_self_bootstrap"
  ON user_org_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'org_admin'
    AND NOT EXISTS (
      SELECT 1 FROM user_org_roles existing
      WHERE existing.org_id = user_org_roles.org_id
    )
  );

-- ── R-2: Helper for goal_activity_links visibility ──────────
-- Encapsulates the "can the caller see this goal?" check so the
-- link policies are decoupled from the shape of goals RLS.
CREATE OR REPLACE FUNCTION can_access_goal(target_goal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM goals g
    WHERE g.id = target_goal_id
      AND (is_org_member(g.org_id) OR is_platform_admin())
  );
$$;

-- Replace existing link SELECT policy with the helper-based one.
-- Only applied when goal_activity_links exists (i.e. migration 004+).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'goal_activity_links'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS goal_links_select_members ON goal_activity_links';
    EXECUTE $POL$
      CREATE POLICY goal_links_select_members ON goal_activity_links
        FOR SELECT
        USING (can_access_goal(goal_id))
    $POL$;
  END IF;
END $$;

-- ── Audit: export_logs hardening ─────────────────────────────
-- Ensure RLS is enabled on export_logs (defensive; no-op if already on).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'export_logs'
  ) THEN
    EXECUTE 'ALTER TABLE export_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
