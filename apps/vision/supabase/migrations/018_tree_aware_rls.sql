-- Phase 18: Tree-aware RLS read access
--
-- Rationale:
--   In the hierarchical federation model (Phase 13), a parent
--   organisation should be able to *read* aggregated child-org
--   activity, projects, and goals to roll up impact metrics. The
--   existing RLS policies use `is_org_member(org_id)`, which
--   restricts reads to direct members of the row's own org.
--
--   This migration adds a helper `is_org_or_ancestor_member` and
--   layers an additional permissive SELECT policy on the major
--   readable tables. PostgreSQL OR-combines multiple permissive
--   policies, so existing access stays intact and parent-org
--   members gain read-through to descendants.
--
--   Writes are NOT widened — only org-direct admins/members can
--   modify rows. The hierarchy is read-only by design so audit
--   trails remain owned by the originating org.
--
-- All statements are idempotent.

-- ============================================================
-- 1. Helper: caller is a member of the row's org OR any ancestor
-- ============================================================
-- Implementation strategy: walk the row's ancestor chain until we
-- hit an org the caller is a member of, or run out of ancestors.
-- For typical 1–4 level hierarchies this is cheap. The function is
-- STABLE so PostgreSQL can cache it within a query.
CREATE OR REPLACE FUNCTION is_org_or_ancestor_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Fast path: direct membership
    is_org_member(target_org_id)
    OR EXISTS (
      -- Slow path: any ancestor of target_org_id is one the caller
      -- is a member of. Reuses the existing recursive helper from
      -- migration 013.
      SELECT 1
      FROM get_org_ancestors(target_org_id) a
      JOIN user_org_roles uor
        ON uor.org_id = a.id
      WHERE uor.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION is_org_or_ancestor_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION is_org_or_ancestor_member(uuid) TO authenticated;

-- ============================================================
-- 2. Permissive read policies — added alongside existing ones
-- ============================================================
-- Naming convention: `<table>_select_tree` to make it obvious the
-- policy widens read access via the org tree.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'activities_select_tree'
  ) THEN
    CREATE POLICY activities_select_tree
      ON activities FOR SELECT
      USING (is_org_or_ancestor_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'projects_select_tree'
  ) THEN
    CREATE POLICY projects_select_tree
      ON projects FOR SELECT
      USING (is_org_or_ancestor_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'goals_select_tree'
  ) THEN
    CREATE POLICY goals_select_tree
      ON goals FOR SELECT
      USING (is_org_or_ancestor_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'departments_select_tree'
  ) THEN
    CREATE POLICY departments_select_tree
      ON departments FOR SELECT
      USING (is_org_or_ancestor_member(org_id));
  END IF;
END $$;

-- vision_statements: aspirational documents are inherently shared
-- with the parent org for alignment purposes.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'vision_statements_select_tree'
  ) THEN
    CREATE POLICY vision_statements_select_tree
      ON vision_statements FOR SELECT
      USING (is_org_or_ancestor_member(org_id));
  END IF;
END $$;

-- ============================================================
-- 3. Aggregate read-through
-- ============================================================
-- Phase 14c/15 introduced read-only aggregate tables. Mirror the
-- tree access there so dashboards roll up correctly.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE policyname = 'activity_daily_aggregates_select_tree'
  ) THEN
    CREATE POLICY activity_daily_aggregates_select_tree
      ON activity_daily_aggregates FOR SELECT
      USING (is_org_or_ancestor_member(org_id));
  END IF;
END $$;
