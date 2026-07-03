-- Phase 4: Goals & Alignment Engine
-- vision_statements, goals, goal_activity_links, alignment functions, materialized view

-- ============================================================
-- 1. vision_statements — top-level organisational vision
-- ============================================================
CREATE TABLE IF NOT EXISTS vision_statements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 300),
  description text CHECK (description IS NULL OR char_length(description) <= 5000),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vision_statements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vision_statements_org_id ON vision_statements(org_id);
CREATE INDEX IF NOT EXISTS idx_vision_statements_active ON vision_statements(org_id, active);

-- RLS: members can read, admins can write
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vision_statements_select_members') THEN
    CREATE POLICY vision_statements_select_members ON vision_statements
      FOR SELECT USING (is_org_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vision_statements_insert_admins') THEN
    CREATE POLICY vision_statements_insert_admins ON vision_statements
      FOR INSERT WITH CHECK (is_org_admin(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vision_statements_update_admins') THEN
    CREATE POLICY vision_statements_update_admins ON vision_statements
      FOR UPDATE USING (is_org_admin(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vision_statements_delete_admins') THEN
    CREATE POLICY vision_statements_delete_admins ON vision_statements
      FOR DELETE USING (is_org_admin(org_id));
  END IF;
END $$;

-- Trigger: auto-update updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'set_vision_statements_updated_at'
  ) THEN
    CREATE TRIGGER set_vision_statements_updated_at
      BEFORE UPDATE ON vision_statements
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 2. goals — measurable objectives linked to vision
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vision_id       uuid REFERENCES vision_statements(id) ON DELETE SET NULL,
  title           text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 300),
  description     text CHECK (description IS NULL OR char_length(description) <= 5000),
  target_value    numeric CHECK (target_value IS NULL OR target_value >= 0),
  target_unit     text CHECK (target_unit IS NULL OR char_length(target_unit) <= 50),
  deadline        date,
  priority_weight numeric NOT NULL DEFAULT 1.0 CHECK (priority_weight > 0 AND priority_weight <= 10),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','archived')),
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_goals_org_id ON goals(org_id);
CREATE INDEX IF NOT EXISTS idx_goals_vision_id ON goals(vision_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_deadline ON goals(org_id, deadline) WHERE deadline IS NOT NULL;

-- RLS: members can read, admins can write
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goals_select_members') THEN
    CREATE POLICY goals_select_members ON goals
      FOR SELECT USING (is_org_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goals_insert_admins') THEN
    CREATE POLICY goals_insert_admins ON goals
      FOR INSERT WITH CHECK (is_org_admin(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goals_update_admins') THEN
    CREATE POLICY goals_update_admins ON goals
      FOR UPDATE USING (is_org_admin(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goals_delete_admins') THEN
    CREATE POLICY goals_delete_admins ON goals
      FOR DELETE USING (is_org_admin(org_id));
  END IF;
END $$;

-- Trigger: auto-update updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'set_goals_updated_at'
  ) THEN
    CREATE TRIGGER set_goals_updated_at
      BEFORE UPDATE ON goals
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 3. goal_activity_links — explicit + inferred links
-- ============================================================
CREATE TABLE IF NOT EXISTS goal_activity_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  link_type   text NOT NULL DEFAULT 'explicit' CHECK (link_type IN ('explicit','inferred')),
  confidence  numeric NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  approved    boolean,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, activity_id)
);

ALTER TABLE goal_activity_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_goal_activity_links_goal ON goal_activity_links(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_activity_links_activity ON goal_activity_links(activity_id);

-- RLS: inherit from parent goal's org membership
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goal_activity_links_select_members') THEN
    CREATE POLICY goal_activity_links_select_members ON goal_activity_links
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM goals g
          WHERE g.id = goal_activity_links.goal_id
            AND is_org_member(g.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goal_activity_links_insert_admins') THEN
    CREATE POLICY goal_activity_links_insert_admins ON goal_activity_links
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM goals g
          WHERE g.id = goal_activity_links.goal_id
            AND is_org_admin(g.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goal_activity_links_update_admins') THEN
    CREATE POLICY goal_activity_links_update_admins ON goal_activity_links
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM goals g
          WHERE g.id = goal_activity_links.goal_id
            AND is_org_admin(g.org_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goal_activity_links_delete_admins') THEN
    CREATE POLICY goal_activity_links_delete_admins ON goal_activity_links
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM goals g
          WHERE g.id = goal_activity_links.goal_id
            AND is_org_admin(g.org_id)
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4. SQL Function: compute_alignment_score(goal_id)
-- Weighted scoring with temporal decay
-- ============================================================
CREATE OR REPLACE FUNCTION compute_alignment_score(p_goal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result jsonb;
  v_linked_count int;
  v_weighted_sum numeric;
  v_max_possible numeric;
  v_score numeric;
BEGIN
  -- Count linked activities with temporal decay weighting
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(
      gal.confidence *
      CASE
        WHEN a.date >= (CURRENT_DATE - INTERVAL '30 days') THEN 1.0
        WHEN a.date >= (CURRENT_DATE - INTERVAL '90 days') THEN 0.7
        WHEN a.date >= (CURRENT_DATE - INTERVAL '365 days') THEN 0.4
        ELSE 0.2
      END
    ), 0),
    GREATEST(COUNT(*)::numeric, 1)
  INTO v_linked_count, v_weighted_sum, v_max_possible
  FROM goal_activity_links gal
  INNER JOIN activities a ON a.id = gal.activity_id
  WHERE gal.goal_id = p_goal_id
    AND (gal.link_type = 'explicit' OR gal.approved IS NOT FALSE);

  -- Score normalised to 0-100
  IF v_linked_count = 0 THEN
    v_score := 0;
  ELSE
    v_score := LEAST(ROUND((v_weighted_sum / v_max_possible) * 100, 1), 100);
  END IF;

  SELECT jsonb_build_object(
    'goal_id', p_goal_id,
    'score', v_score,
    'linked_activities', v_linked_count,
    'weighted_sum', ROUND(v_weighted_sum, 2),
    'computed_at', now()::text
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 5. SQL Function: compute_org_alignment(org_id)
-- Weighted average across all active goals
-- ============================================================
CREATE OR REPLACE FUNCTION compute_org_alignment(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result jsonb;
  v_total_weight numeric;
  v_weighted_score numeric;
  v_org_score numeric;
  v_goal_count int;
BEGIN
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(g.priority_weight), 0),
    COALESCE(SUM(
      g.priority_weight * (compute_alignment_score(g.id)->>'score')::numeric
    ), 0)
  INTO v_goal_count, v_total_weight, v_weighted_score
  FROM goals g
  WHERE g.org_id = p_org_id
    AND g.status = 'active';

  IF v_total_weight > 0 THEN
    v_org_score := ROUND(v_weighted_score / v_total_weight, 1);
  ELSE
    v_org_score := 0;
  END IF;

  SELECT jsonb_build_object(
    'org_id', p_org_id,
    'alignment_score', v_org_score,
    'active_goals', v_goal_count,
    'total_priority_weight', ROUND(v_total_weight, 2),
    'computed_at', now()::text
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 6. Materialized View: mv_goal_alignment_matrix
-- Precomputed per-goal scores for dashboard performance
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_goal_alignment_matrix AS
SELECT
  g.id AS goal_id,
  g.org_id,
  g.title AS goal_title,
  g.priority_weight,
  g.status,
  g.deadline,
  vs.title AS vision_title,
  COUNT(gal.id)::int AS linked_activities,
  COUNT(gal.id) FILTER (WHERE gal.link_type = 'explicit')::int AS explicit_links,
  COUNT(gal.id) FILTER (WHERE gal.link_type = 'inferred')::int AS inferred_links,
  COALESCE(SUM(
    gal.confidence *
    CASE
      WHEN a.date >= (CURRENT_DATE - INTERVAL '30 days') THEN 1.0
      WHEN a.date >= (CURRENT_DATE - INTERVAL '90 days') THEN 0.7
      WHEN a.date >= (CURRENT_DATE - INTERVAL '365 days') THEN 0.4
      ELSE 0.2
    END
  ), 0)::numeric AS weighted_sum,
  CASE
    WHEN COUNT(gal.id) = 0 THEN 0
    ELSE LEAST(ROUND(
      COALESCE(SUM(
        gal.confidence *
        CASE
          WHEN a.date >= (CURRENT_DATE - INTERVAL '30 days') THEN 1.0
          WHEN a.date >= (CURRENT_DATE - INTERVAL '90 days') THEN 0.7
          WHEN a.date >= (CURRENT_DATE - INTERVAL '365 days') THEN 0.4
          ELSE 0.2
        END
      ), 0) / GREATEST(COUNT(gal.id), 1) * 100
    , 1), 100)
  END AS alignment_score
FROM goals g
LEFT JOIN vision_statements vs ON vs.id = g.vision_id
LEFT JOIN goal_activity_links gal ON gal.goal_id = g.id
  AND (gal.link_type = 'explicit' OR gal.approved IS NOT FALSE)
LEFT JOIN activities a ON a.id = gal.activity_id
GROUP BY g.id, g.org_id, g.title, g.priority_weight, g.status, g.deadline, vs.title
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_goal_alignment_matrix
  ON mv_goal_alignment_matrix (goal_id);

CREATE INDEX IF NOT EXISTS idx_mv_goal_alignment_matrix_org
  ON mv_goal_alignment_matrix (org_id);
