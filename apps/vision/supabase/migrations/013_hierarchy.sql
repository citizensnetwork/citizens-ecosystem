-- ============================================================
-- Migration 013: Hierarchical Federation Foundation (Phase 13)
-- ============================================================
-- Additive, non-breaking foundation for the parent/child org
-- model and the Founder / CEO / Admin / Employee vocabulary.
--
-- This migration deliberately does NOT modify existing RLS policies
-- or the role CHECK constraint. Tree-aware RLS is a separate phase.
-- ============================================================

-- ── Columns ─────────────────────────────────────────────────

-- Parent organisation (nullable; flat orgs keep working)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS parent_org_id UUID
    REFERENCES organisations(id) ON DELETE SET NULL;

-- No self-parent.
DO $$ BEGIN
  ALTER TABLE organisations
    ADD CONSTRAINT organisations_no_self_parent
    CHECK (parent_org_id IS NULL OR parent_org_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_organisations_parent_org_id
  ON organisations(parent_org_id);

-- Optional human-readable job title (distinct from RBAC role)
ALTER TABLE user_org_roles
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Founder flag — a display/semantic marker that lives alongside role
ALTER TABLE user_org_roles
  ADD COLUMN IF NOT EXISTS is_founder BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_org_roles_is_founder
  ON user_org_roles(is_founder) WHERE is_founder = true;

-- ── Cycle prevention trigger ────────────────────────────────
-- Walks ancestors on INSERT/UPDATE and rejects cycles.
CREATE OR REPLACE FUNCTION prevent_org_hierarchy_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_detected BOOLEAN;
BEGIN
  IF NEW.parent_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, parent_org_id, 1 AS depth
    FROM organisations
    WHERE id = NEW.parent_org_id
    UNION ALL
    SELECT o.id, o.parent_org_id, a.depth + 1
    FROM organisations o
    JOIN ancestors a ON o.id = a.parent_org_id
    WHERE a.depth < 50   -- hard cap in case of a pre-existing bad state
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
  INTO cycle_detected;

  IF cycle_detected THEN
    RAISE EXCEPTION
      'Cannot set parent_org_id on %: would create a cycle in the org hierarchy',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER organisations_prevent_hierarchy_cycle
    BEFORE INSERT OR UPDATE OF parent_org_id ON organisations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_org_hierarchy_cycle();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tree helper functions ───────────────────────────────────
-- These are defined now so future migrations can wire them into
-- RLS incrementally. They are SECURITY DEFINER so callers don't
-- need SELECT on the whole table to traverse the tree.

-- Returns the ancestor chain of an org (excluding the org itself),
-- nearest first.
CREATE OR REPLACE FUNCTION get_org_ancestors(target_org_id UUID)
RETURNS TABLE (id UUID, depth INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE ancestors AS (
    -- Seed with the target org at depth 0; excluded from the final
    -- result below so callers only see strict ancestors.
    SELECT o.id, o.parent_org_id, 0 AS depth
    FROM organisations o
    WHERE o.id = target_org_id
    UNION ALL
    SELECT o.id, o.parent_org_id, a.depth + 1
    FROM organisations o
    JOIN ancestors a ON o.id = a.parent_org_id
    WHERE a.depth < 50
  )
  SELECT id, depth FROM ancestors WHERE depth > 0 ORDER BY depth ASC;
$$;

-- Returns every descendant of root_org_id (excluding the root),
-- with relative depth.
CREATE OR REPLACE FUNCTION get_org_descendants(root_org_id UUID)
RETURNS TABLE (id UUID, depth INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE descendants AS (
    SELECT o.id, 1 AS depth
    FROM organisations o
    WHERE o.parent_org_id = root_org_id
    UNION ALL
    SELECT o.id, d.depth + 1
    FROM organisations o
    JOIN descendants d ON o.parent_org_id = d.id
    WHERE d.depth < 50
  )
  SELECT id, depth FROM descendants ORDER BY depth ASC;
$$;

-- True when target_org_id appears anywhere in the tree rooted at
-- root_org_id (inclusive of the root itself).
CREATE OR REPLACE FUNCTION is_in_org_tree(root_org_id UUID, target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_org_id = root_org_id
    OR EXISTS (
      SELECT 1 FROM get_org_descendants(root_org_id) d
      WHERE d.id = target_org_id
    );
$$;
