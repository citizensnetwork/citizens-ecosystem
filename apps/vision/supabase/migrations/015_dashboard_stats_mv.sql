-- Phase 14c: Dashboard stats materialized view + helpers
--
-- Rationale:
--   /api/metrics/overview and the dashboard landing card stack
--   issue 4–6 COUNT(*) queries per load (activities, projects, goals
--   with status breakdown, departments, members). At scale this is
--   the hottest read path in the app and it does full table scans.
--
--   This migration introduces `mv_org_dashboard_stats`, a single-row-
--   per-org materialized view that pre-aggregates the counts the
--   dashboard needs. It is REFRESH CONCURRENTLY-able (unique index
--   on org_id is required for that and is included below).
--
--   Writes do not invalidate the view automatically — callers refresh
--   it on a schedule (pg_cron job defined below) or on-demand via the
--   `refresh_org_dashboard_stats()` helper. Stale reads are acceptable
--   for dashboard summary cards; trend detail endpoints still read
--   live.
--
-- All statements are idempotent.

-- ============================================================
-- 1. Materialized view
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS mv_org_dashboard_stats CASCADE;

CREATE MATERIALIZED VIEW mv_org_dashboard_stats AS
SELECT
  o.id                                                       AS org_id,
  COALESCE(act.total, 0)                                     AS total_activities,
  COALESCE(act.last_30d, 0)                                  AS activities_last_30d,
  COALESCE(act.participants_total, 0)                        AS total_participants,
  COALESCE(proj.total, 0)                                    AS total_projects,
  COALESCE(proj.active, 0)                                   AS active_projects,
  COALESCE(proj.completed, 0)                                AS completed_projects,
  COALESCE(g.total, 0)                                       AS total_goals,
  COALESCE(g.achieved, 0)                                    AS achieved_goals,
  COALESCE(g.active, 0)                                      AS active_goals,
  COALESCE(dep.total, 0)                                     AS total_departments,
  COALESCE(mem.total, 0)                                     AS total_members,
  act.latest_activity_at                                     AS latest_activity_at,
  now()                                                      AS refreshed_at
FROM organisations o
LEFT JOIN LATERAL (
  SELECT
    count(*)                                             AS total,
    count(*) FILTER (WHERE a.date >= current_date - 30)  AS last_30d,
    sum(a.participant_count)                             AS participants_total,
    max(a.date)                                          AS latest_activity_at
  FROM activities a
  WHERE a.org_id = o.id
) act ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)                                             AS total,
    count(*) FILTER (WHERE p.status = 'active')          AS active,
    count(*) FILTER (WHERE p.status = 'completed')       AS completed
  FROM projects p
  WHERE p.org_id = o.id
) proj ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)                                             AS total,
    count(*) FILTER (WHERE gl.status = 'achieved')       AS achieved,
    count(*) FILTER (WHERE gl.status = 'active')         AS active
  FROM goals gl
  WHERE gl.org_id = o.id
) g ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total
  FROM departments d
  WHERE d.org_id = o.id
) dep ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total
  FROM user_org_roles r
  WHERE r.org_id = o.id
) mem ON true;

-- Unique index on org_id so REFRESH MATERIALIZED VIEW CONCURRENTLY works.
CREATE UNIQUE INDEX IF NOT EXISTS mv_org_dashboard_stats_org_id_idx
  ON mv_org_dashboard_stats (org_id);

-- ============================================================
-- 2. Refresh helper (SECURITY DEFINER so callers don't need view owner)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_org_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_org_dashboard_stats;
EXCEPTION
  -- First refresh after create must be non-concurrent because the
  -- view is empty. Fall back transparently so callers don't need to
  -- know the difference.
  WHEN feature_not_supported THEN
    REFRESH MATERIALIZED VIEW mv_org_dashboard_stats;
END;
$$;

REVOKE ALL ON FUNCTION refresh_org_dashboard_stats() FROM public;
GRANT EXECUTE ON FUNCTION refresh_org_dashboard_stats() TO authenticated;

-- Prime the view so the first reader doesn't see an empty result.
SELECT refresh_org_dashboard_stats();

-- ============================================================
-- 3. RLS-equivalent access via SECURITY DEFINER reader
-- ============================================================
-- Materialized views do not participate in RLS. Expose rows through
-- a SECURITY DEFINER function that checks `is_org_member` so reads
-- remain tenant-isolated without relying on callers to remember the
-- membership guard.
CREATE OR REPLACE FUNCTION get_org_dashboard_stats(p_org_id uuid)
RETURNS TABLE (
  org_id uuid,
  total_activities bigint,
  activities_last_30d bigint,
  total_participants bigint,
  total_projects bigint,
  active_projects bigint,
  completed_projects bigint,
  total_goals bigint,
  achieved_goals bigint,
  active_goals bigint,
  total_departments bigint,
  total_members bigint,
  latest_activity_at date,
  refreshed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'not a member of org %', p_org_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT s.*
  FROM mv_org_dashboard_stats s
  WHERE s.org_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION get_org_dashboard_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_org_dashboard_stats(uuid) TO authenticated;

-- ============================================================
-- 4. Scheduled refresh (best-effort; skipped if pg_cron absent)
-- ============================================================
-- Runs every 10 minutes. If pg_cron is not installed on the target
-- environment (local dev w/out the extension), this block is a
-- harmless no-op — callers can still hit refresh_org_dashboard_stats
-- manually or from an edge function on a schedule.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any previous version of the job, then re-create.
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'refresh_org_dashboard_stats';

    PERFORM cron.schedule(
      'refresh_org_dashboard_stats',
      '*/10 * * * *',
      $cron$ SELECT refresh_org_dashboard_stats(); $cron$
    );
  END IF;
END $$;
