-- Phase 3: Metrics & Insight Dashboards
-- Materialized views, SQL functions, metric_definitions

-- ============================================================
-- 1. metric_definitions — configurable KPI definitions per org
-- ============================================================
CREATE TABLE IF NOT EXISTS metric_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  computation_type text NOT NULL DEFAULT 'count',
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

ALTER TABLE metric_definitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'metric_definitions_select_members'
  ) THEN
    CREATE POLICY metric_definitions_select_members ON metric_definitions
      FOR SELECT USING (is_org_member(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'metric_definitions_insert_admins'
  ) THEN
    CREATE POLICY metric_definitions_insert_admins ON metric_definitions
      FOR INSERT WITH CHECK (is_org_admin(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'metric_definitions_update_admins'
  ) THEN
    CREATE POLICY metric_definitions_update_admins ON metric_definitions
      FOR UPDATE USING (is_org_admin(org_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'metric_definitions_delete_admins'
  ) THEN
    CREATE POLICY metric_definitions_delete_admins ON metric_definitions
      FOR DELETE USING (is_org_admin(org_id));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_metric_definitions_org_id ON metric_definitions(org_id);

-- ============================================================
-- 2. Materialized View — org activity summary
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_org_activity_summary AS
SELECT
  a.org_id,
  COUNT(*)::int                                     AS total_activities,
  COUNT(DISTINCT a.department_id)::int              AS active_departments,
  COALESCE(SUM(a.participant_count), 0)::int        AS total_participants,
  COUNT(*) FILTER (WHERE a.date >= (CURRENT_DATE - INTERVAL '30 days'))::int
                                                    AS activities_last_30d,
  COUNT(*) FILTER (WHERE a.date >= (CURRENT_DATE - INTERVAL '60 days')
                     AND a.date <  (CURRENT_DATE - INTERVAL '30 days'))::int
                                                    AS activities_prev_30d,
  a.type                                            AS activity_type,
  d.name                                            AS department_name,
  a.department_id,
  DATE_TRUNC('month', a.date)::date                 AS month
FROM activities a
LEFT JOIN departments d ON d.id = a.department_id
GROUP BY a.org_id, a.type, d.name, a.department_id, DATE_TRUNC('month', a.date)
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_org_activity_summary
  ON mv_org_activity_summary (org_id, activity_type, department_id, month);

-- ============================================================
-- 3. Materialized View — department ranking
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_department_ranking AS
SELECT
  a.org_id,
  a.department_id,
  d.name                                AS department_name,
  COUNT(*)::int                         AS activity_count,
  COALESCE(SUM(a.participant_count), 0)::int AS participant_reach,
  COUNT(DISTINCT a.type)::int           AS type_diversity,
  RANK() OVER (
    PARTITION BY a.org_id
    ORDER BY COUNT(*) DESC
  )::int                                AS rank_by_volume
FROM activities a
INNER JOIN departments d ON d.id = a.department_id
WHERE a.department_id IS NOT NULL
GROUP BY a.org_id, a.department_id, d.name
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_department_ranking
  ON mv_department_ranking (org_id, department_id);

-- ============================================================
-- 4. SQL Function — compute_org_kpis
-- ============================================================
CREATE OR REPLACE FUNCTION compute_org_kpis(
  p_org_id uuid,
  p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_date_to   date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result jsonb;
  v_period_days int;
  v_prev_from date;
  v_prev_to date;
  v_current_count int;
  v_prev_count int;
  v_growth_pct numeric;
BEGIN
  v_period_days := (p_date_to - p_date_from);
  v_prev_from := p_date_from - v_period_days;
  v_prev_to := p_date_from - 1;

  -- Current period count
  SELECT COUNT(*)::int
  INTO v_current_count
  FROM activities
  WHERE org_id = p_org_id
    AND date >= p_date_from
    AND date <= p_date_to;

  -- Previous period count for growth
  SELECT COUNT(*)::int
  INTO v_prev_count
  FROM activities
  WHERE org_id = p_org_id
    AND date >= v_prev_from
    AND date <= v_prev_to;

  -- Growth percentage
  IF v_prev_count > 0 THEN
    v_growth_pct := ROUND(((v_current_count - v_prev_count)::numeric / v_prev_count) * 100, 1);
  ELSE
    v_growth_pct := CASE WHEN v_current_count > 0 THEN 100.0 ELSE 0.0 END;
  END IF;

  SELECT jsonb_build_object(
    'total_activities', v_current_count,
    'participants_reached', (
      SELECT COALESCE(SUM(participant_count), 0)::int
      FROM activities
      WHERE org_id = p_org_id AND date >= p_date_from AND date <= p_date_to
    ),
    'active_departments', (
      SELECT COUNT(DISTINCT department_id)::int
      FROM activities
      WHERE org_id = p_org_id AND date >= p_date_from AND date <= p_date_to
        AND department_id IS NOT NULL
    ),
    'activity_growth_pct', v_growth_pct,
    'previous_period_count', v_prev_count,
    'period_days', v_period_days,
    'date_from', p_date_from,
    'date_to', p_date_to
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 5. Initial refresh of materialized views
-- ============================================================
REFRESH MATERIALIZED VIEW mv_org_activity_summary;
REFRESH MATERIALIZED VIEW mv_department_ranking;

-- ============================================================
-- 6. Partial geo index (recommended by Data Agent in Phase 2)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_activities_geo
  ON activities (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
