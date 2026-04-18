-- Migration: 010_boundaries.sql
-- Phase 9: Geo-Boundaries & Coverage Analysis
-- Tables: geo_boundaries
-- Materialized View: mv_boundary_activity_coverage
-- Indexes: 5
-- RLS: 5 policies

-- ============================================================
-- 1. Table: geo_boundaries
-- ============================================================
CREATE TABLE IF NOT EXISTS geo_boundaries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  boundary_geojson JSONB NOT NULL,  -- GeoJSON Polygon or MultiPolygon
  area_km2      NUMERIC(12, 4),
  colour        TEXT DEFAULT '#4a90d9',  -- Boundary fill colour
  active        BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_geo_boundaries_updated_at'
  ) THEN
    CREATE TRIGGER set_geo_boundaries_updated_at
      BEFORE UPDATE ON geo_boundaries
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 2. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_geo_boundaries_org
  ON geo_boundaries(org_id);

CREATE INDEX IF NOT EXISTS idx_geo_boundaries_active
  ON geo_boundaries(org_id, active) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_geo_boundaries_created
  ON geo_boundaries(org_id, created_at DESC);

-- GIN index on boundary_geojson for containment queries
CREATE INDEX IF NOT EXISTS idx_geo_boundaries_geojson
  ON geo_boundaries USING GIN (boundary_geojson);

-- ============================================================
-- 3. Materialized View: mv_boundary_activity_coverage
-- Uses bounding-box approximation for point-in-polygon.
-- A boundary's bbox is derived from its GeoJSON coordinates.
-- Activities with lat/lng within the bbox are counted.
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_boundary_activity_coverage AS
WITH boundary_rings AS (
  -- Pull the outer ring of the (Multi)Polygon as a single jsonb array
  -- of [lng, lat] pairs. Anything else collapses to an empty ring.
  SELECT
    b.id   AS boundary_id,
    b.org_id,
    b.name AS boundary_name,
    CASE
      WHEN b.boundary_geojson->>'type' = 'Polygon'
        THEN b.boundary_geojson->'coordinates'->0
      WHEN b.boundary_geojson->>'type' = 'MultiPolygon'
        THEN b.boundary_geojson->'coordinates'->0->0
      ELSE '[]'::jsonb
    END AS ring
  FROM geo_boundaries b
  WHERE b.active = TRUE
),
boundary_bounds AS (
  -- For each boundary, fold the [lng, lat] pairs in its ring into a
  -- numeric bounding box. (->>0 / ->>1 give text; cast to numeric so
  -- MIN/MAX have a real numeric type to aggregate over — MIN(jsonb)
  -- does not exist in Postgres.)
  SELECT
    br.boundary_id,
    br.org_id,
    br.boundary_name,
    MIN((coord->>0)::numeric) AS min_lng,
    MAX((coord->>0)::numeric) AS max_lng,
    MIN((coord->>1)::numeric) AS min_lat,
    MAX((coord->>1)::numeric) AS max_lat
  FROM boundary_rings br
  CROSS JOIN LATERAL jsonb_array_elements(br.ring) AS coord
  GROUP BY br.boundary_id, br.org_id, br.boundary_name
)
SELECT
  bb.boundary_id,
  bb.org_id,
  bb.boundary_name,
  COUNT(a.id) AS activity_count,
  COALESCE(SUM(a.participant_count), 0) AS participant_reach,
  COUNT(DISTINCT a.department_id) AS department_count,
  CASE
    WHEN COUNT(a.id) < 5 THEN 'gap'
    WHEN COUNT(a.id) < 15 THEN 'low'
    WHEN COUNT(a.id) < 30 THEN 'moderate'
    ELSE 'well-covered'
  END AS coverage_level,
  bb.min_lng,
  bb.max_lng,
  bb.min_lat,
  bb.max_lat
FROM boundary_bounds bb
LEFT JOIN activities a
  ON a.org_id = bb.org_id
  AND a.latitude IS NOT NULL
  AND a.longitude IS NOT NULL
  AND a.latitude BETWEEN bb.min_lat AND bb.max_lat
  AND a.longitude BETWEEN bb.min_lng AND bb.max_lng
  AND a.date >= (CURRENT_DATE - INTERVAL '90 days')
GROUP BY
  bb.boundary_id, bb.org_id, bb.boundary_name,
  bb.min_lng, bb.max_lng, bb.min_lat, bb.max_lat;

-- Index on MV
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_boundary_coverage_pk
  ON mv_boundary_activity_coverage(boundary_id);

-- Refresh function — called by pg_cron or generate-advisory edge function.
-- Uses CONCURRENTLY to avoid locking reads during refresh.
CREATE OR REPLACE FUNCTION refresh_boundary_coverage()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_boundary_activity_coverage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RLS Policies
-- ============================================================
ALTER TABLE geo_boundaries ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can read boundaries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'geo_boundaries' AND policyname = 'geo_boundaries_select_member'
  ) THEN
    CREATE POLICY geo_boundaries_select_member ON geo_boundaries
      FOR SELECT USING (
        is_org_member(org_id) OR is_platform_admin()
      );
  END IF;
END $$;

-- INSERT: org admins/managers can create boundaries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'geo_boundaries' AND policyname = 'geo_boundaries_insert_admin'
  ) THEN
    CREATE POLICY geo_boundaries_insert_admin ON geo_boundaries
      FOR INSERT WITH CHECK (
        get_user_org_role(org_id) IN ('org_admin', 'org_manager') OR is_platform_admin()
      );
  END IF;
END $$;

-- UPDATE: org admins/managers can update boundaries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'geo_boundaries' AND policyname = 'geo_boundaries_update_admin'
  ) THEN
    CREATE POLICY geo_boundaries_update_admin ON geo_boundaries
      FOR UPDATE USING (
        get_user_org_role(org_id) IN ('org_admin', 'org_manager') OR is_platform_admin()
      );
  END IF;
END $$;

-- DELETE: org admins can delete boundaries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'geo_boundaries' AND policyname = 'geo_boundaries_delete_admin'
  ) THEN
    CREATE POLICY geo_boundaries_delete_admin ON geo_boundaries
      FOR DELETE USING (
        get_user_org_role(org_id) = 'org_admin' OR is_platform_admin()
      );
  END IF;
END $$;

-- ============================================================
-- 5. Add coverage gap advisory template + rule
-- ============================================================
DO $$ 
DECLARE
  v_template_id UUID;
BEGIN
  -- Check if template already exists
  SELECT id INTO v_template_id
  FROM advisory_templates
  WHERE type = 'coverage_gap';

  IF v_template_id IS NULL THEN
    INSERT INTO advisory_templates (type, title_template, body_template, severity, active)
    VALUES (
      'coverage_gap',
      'Low activity in {boundary_name}',
      'Your {boundary_name} area shows low activity ({count} in the last 90 days). Consider scheduling activities to improve coverage.',
      'warning',
      TRUE
    )
    RETURNING id INTO v_template_id;
  END IF;

  -- Insert rule if not exists
  IF NOT EXISTS (
    SELECT 1 FROM advisory_rules WHERE template_id = v_template_id AND metric_slug = 'boundary_activity_count'
  ) THEN
    INSERT INTO advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours, active)
    VALUES (v_template_id, 'boundary_activity_count', '<', 5, 90, 168, TRUE);
  END IF;
END $$;
