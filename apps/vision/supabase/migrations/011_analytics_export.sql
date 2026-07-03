-- Migration 011: Advanced Analytics & Export (Phase 10)
-- Adds custom metric definitions enhancement + export_logs table

-- ============================================================
-- 1. Export Logs — track user-initiated exports
-- ============================================================
CREATE TABLE IF NOT EXISTS export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('csv', 'pdf', 'png')),
  resource TEXT NOT NULL, -- 'activities', 'metrics', 'map', 'report'
  filters JSONB DEFAULT '{}',
  row_count INTEGER DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_logs_org_id ON export_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_created_by ON export_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_export_logs_created_at ON export_logs(created_at DESC);

-- ============================================================
-- 2. Scheduled Reports Configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  recipients TEXT[] NOT NULL DEFAULT '{}',
  report_config JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_org_id ON scheduled_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE active = true;

-- Trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_scheduled_reports_updated_at'
  ) THEN
    CREATE TRIGGER set_scheduled_reports_updated_at
      BEFORE UPDATE ON scheduled_reports
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 3. RLS Policies
-- ============================================================

-- export_logs
ALTER TABLE export_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'export_logs_select_member') THEN
    CREATE POLICY export_logs_select_member ON export_logs
      FOR SELECT USING (
        is_org_member(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'export_logs_insert_member') THEN
    CREATE POLICY export_logs_insert_member ON export_logs
      FOR INSERT WITH CHECK (
        is_org_member(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'export_logs_delete_admin') THEN
    CREATE POLICY export_logs_delete_admin ON export_logs
      FOR DELETE USING (
        is_org_admin(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

-- scheduled_reports
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'scheduled_reports_select_member') THEN
    CREATE POLICY scheduled_reports_select_member ON scheduled_reports
      FOR SELECT USING (
        is_org_member(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'scheduled_reports_insert_admin') THEN
    CREATE POLICY scheduled_reports_insert_admin ON scheduled_reports
      FOR INSERT WITH CHECK (
        is_org_admin(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'scheduled_reports_update_admin') THEN
    CREATE POLICY scheduled_reports_update_admin ON scheduled_reports
      FOR UPDATE USING (
        is_org_admin(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'scheduled_reports_delete_admin') THEN
    CREATE POLICY scheduled_reports_delete_admin ON scheduled_reports
      FOR DELETE USING (
        is_org_admin(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

-- ============================================================
-- 4. Prevent org_id mutation on new tables
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_export_logs_org_change'
  ) THEN
    CREATE TRIGGER prevent_export_logs_org_change
      BEFORE UPDATE ON export_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_org_id_change();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_scheduled_reports_org_change'
  ) THEN
    CREATE TRIGGER prevent_scheduled_reports_org_change
      BEFORE UPDATE ON scheduled_reports
      FOR EACH ROW
      EXECUTE FUNCTION prevent_org_id_change();
  END IF;
END $$;

-- ============================================================
-- 5. Linear regression helper function
-- ============================================================
CREATE OR REPLACE FUNCTION compute_trend_regression(
  p_org_id UUID,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE,
  p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (
  slope DOUBLE PRECISION,
  intercept DOUBLE PRECISION,
  r_squared DOUBLE PRECISION,
  data_points INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
  v_sum_x DOUBLE PRECISION := 0;
  v_sum_y DOUBLE PRECISION := 0;
  v_sum_xy DOUBLE PRECISION := 0;
  v_sum_x2 DOUBLE PRECISION := 0;
  v_sum_y2 DOUBLE PRECISION := 0;
  v_slope DOUBLE PRECISION;
  v_intercept DOUBLE PRECISION;
  v_r_squared DOUBLE PRECISION;
  rec RECORD;
  v_idx INTEGER := 0;
BEGIN
  -- Count activities per bucket
  FOR rec IN
    SELECT
      CASE p_granularity
        WHEN 'month' THEN date_trunc('month', a.date::timestamp)::date
        WHEN 'week'  THEN date_trunc('week', a.date::timestamp)::date
        ELSE a.date::date
      END AS bucket_date,
      COUNT(*)::DOUBLE PRECISION AS cnt
    FROM activities a
    WHERE a.org_id = p_org_id
      AND a.date >= p_date_from
      AND a.date <= p_date_to
    GROUP BY bucket_date
    ORDER BY bucket_date
  LOOP
    v_idx := v_idx + 1;
    v_sum_x := v_sum_x + v_idx;
    v_sum_y := v_sum_y + rec.cnt;
    v_sum_xy := v_sum_xy + (v_idx * rec.cnt);
    v_sum_x2 := v_sum_x2 + (v_idx * v_idx);
    v_sum_y2 := v_sum_y2 + (rec.cnt * rec.cnt);
  END LOOP;

  v_n := v_idx;

  IF v_n < 2 THEN
    RETURN QUERY SELECT 0::DOUBLE PRECISION, 0::DOUBLE PRECISION, 0::DOUBLE PRECISION, v_n;
    RETURN;
  END IF;

  v_slope := (v_n * v_sum_xy - v_sum_x * v_sum_y) / NULLIF(v_n * v_sum_x2 - v_sum_x * v_sum_x, 0);
  v_intercept := (v_sum_y - COALESCE(v_slope, 0) * v_sum_x) / v_n;

  -- R-squared
  v_r_squared := POWER(
    NULLIF(v_n * v_sum_xy - v_sum_x * v_sum_y, 0),
    2
  ) / NULLIF(
    (v_n * v_sum_x2 - v_sum_x * v_sum_x) * (v_n * v_sum_y2 - v_sum_y * v_sum_y),
    0
  );

  RETURN QUERY SELECT
    COALESCE(v_slope, 0),
    COALESCE(v_intercept, 0),
    COALESCE(v_r_squared, 0),
    v_n;
END;
$$;
