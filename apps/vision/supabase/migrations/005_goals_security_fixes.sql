-- Migration 005: Security fixes for Phase 4 goals tables
-- Fixes: M-1 (platform admin override), M-2 (search_path), M-3 (WITH CHECK org_id immutable)

-- ============================================================
-- M-1: Add is_platform_admin() to all Phase 4 RLS policies
-- ============================================================

-- Drop and recreate policies with platform admin override
-- vision_statements
DROP POLICY IF EXISTS vision_statements_select_members ON vision_statements;
CREATE POLICY vision_statements_select_members ON vision_statements
  FOR SELECT USING (is_org_member(org_id) OR is_platform_admin());

DROP POLICY IF EXISTS vision_statements_insert_admins ON vision_statements;
CREATE POLICY vision_statements_insert_admins ON vision_statements
  FOR INSERT WITH CHECK (is_org_admin(org_id) OR is_platform_admin());

DROP POLICY IF EXISTS vision_statements_update_admins ON vision_statements;
CREATE POLICY vision_statements_update_admins ON vision_statements
  FOR UPDATE USING (is_org_admin(org_id) OR is_platform_admin())
  WITH CHECK (is_org_admin(org_id) OR is_platform_admin());

DROP POLICY IF EXISTS vision_statements_delete_admins ON vision_statements;
CREATE POLICY vision_statements_delete_admins ON vision_statements
  FOR DELETE USING (is_org_admin(org_id) OR is_platform_admin());

-- goals
DROP POLICY IF EXISTS goals_select_members ON goals;
CREATE POLICY goals_select_members ON goals
  FOR SELECT USING (is_org_member(org_id) OR is_platform_admin());

DROP POLICY IF EXISTS goals_insert_admins ON goals;
CREATE POLICY goals_insert_admins ON goals
  FOR INSERT WITH CHECK (is_org_admin(org_id) OR is_platform_admin());

DROP POLICY IF EXISTS goals_update_admins ON goals;
CREATE POLICY goals_update_admins ON goals
  FOR UPDATE USING (is_org_admin(org_id) OR is_platform_admin())
  WITH CHECK (is_org_admin(org_id) OR is_platform_admin());

DROP POLICY IF EXISTS goals_delete_admins ON goals;
CREATE POLICY goals_delete_admins ON goals
  FOR DELETE USING (is_org_admin(org_id) OR is_platform_admin());

-- goal_activity_links (inherits org check via goal)
DROP POLICY IF EXISTS goal_links_select_members ON goal_activity_links;
CREATE POLICY goal_links_select_members ON goal_activity_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_id AND (is_org_member(g.org_id) OR is_platform_admin()))
  );

DROP POLICY IF EXISTS goal_links_insert_admins ON goal_activity_links;
CREATE POLICY goal_links_insert_admins ON goal_activity_links
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_id AND (is_org_admin(g.org_id) OR is_platform_admin()))
  );

DROP POLICY IF EXISTS goal_links_update_admins ON goal_activity_links;
CREATE POLICY goal_links_update_admins ON goal_activity_links
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_id AND (is_org_admin(g.org_id) OR is_platform_admin()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_id AND (is_org_admin(g.org_id) OR is_platform_admin()))
  );

DROP POLICY IF EXISTS goal_links_delete_admins ON goal_activity_links;
CREATE POLICY goal_links_delete_admins ON goal_activity_links
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM goals g WHERE g.id = goal_id AND (is_org_admin(g.org_id) OR is_platform_admin()))
  );

-- ============================================================
-- M-2: Add SET search_path to SQL functions
-- ============================================================

CREATE OR REPLACE FUNCTION compute_alignment_score(p_goal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_weight numeric := 0;
  weighted_sum numeric := 0;
  link_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      gal.confidence,
      gal.link_type,
      a.date,
      a.participant_count
    FROM goal_activity_links gal
    JOIN activities a ON a.id = gal.activity_id
    WHERE gal.goal_id = p_goal_id
      AND gal.approved IS NOT FALSE
  LOOP
    link_count := link_count + 1;

    DECLARE
      days_ago int;
      temporal_weight numeric;
      type_weight numeric;
      link_weight numeric;
    BEGIN
      days_ago := EXTRACT(DAY FROM now() - rec.date)::int;

      IF days_ago <= 30 THEN temporal_weight := 1.0;
      ELSIF days_ago <= 90 THEN temporal_weight := 0.7;
      ELSIF days_ago <= 365 THEN temporal_weight := 0.4;
      ELSE temporal_weight := 0.2;
      END IF;

      IF rec.link_type = 'explicit' THEN type_weight := 1.0;
      ELSE type_weight := rec.confidence;
      END IF;

      link_weight := temporal_weight * type_weight;
      total_weight := total_weight + link_weight;
      weighted_sum := weighted_sum + (link_weight * LEAST(rec.participant_count, 100) / 100.0);
    END;
  END LOOP;

  IF total_weight = 0 THEN
    result := jsonb_build_object('score', 0, 'linked_activities', 0, 'weighted_sum', 0);
  ELSE
    result := jsonb_build_object(
      'score', ROUND((weighted_sum / total_weight) * 100, 1),
      'linked_activities', link_count,
      'weighted_sum', ROUND(weighted_sum, 2)
    );
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION compute_org_alignment(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_priority numeric := 0;
  weighted_score numeric := 0;
  goal_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT g.id, g.priority_weight
    FROM goals g
    WHERE g.org_id = p_org_id AND g.status = 'active'
  LOOP
    goal_count := goal_count + 1;
    total_priority := total_priority + rec.priority_weight;

    DECLARE
      goal_score jsonb;
    BEGIN
      goal_score := compute_alignment_score(rec.id);
      weighted_score := weighted_score + (rec.priority_weight * (goal_score->>'score')::numeric);
    END;
  END LOOP;

  IF total_priority = 0 THEN
    result := jsonb_build_object('org_score', 0, 'active_goals', 0, 'total_priority', 0);
  ELSE
    result := jsonb_build_object(
      'org_score', ROUND(weighted_score / total_priority, 1),
      'active_goals', goal_count,
      'total_priority', ROUND(total_priority, 2)
    );
  END IF;

  RETURN result;
END;
$$;

-- ============================================================
-- M-3: Prevent org_id mutation via trigger
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_org_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'Cannot change org_id';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'vision_statements_prevent_org_id_change'
  ) THEN
    CREATE TRIGGER vision_statements_prevent_org_id_change
      BEFORE UPDATE ON vision_statements FOR EACH ROW
      EXECUTE FUNCTION prevent_org_id_change();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'goals_prevent_org_id_change'
  ) THEN
    CREATE TRIGGER goals_prevent_org_id_change
      BEFORE UPDATE ON goals FOR EACH ROW
      EXECUTE FUNCTION prevent_org_id_change();
  END IF;
END $$;
