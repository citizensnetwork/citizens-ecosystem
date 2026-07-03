-- Phase 15: Analytics Pre-Aggregation — daily activity rollup
--
-- Rationale:
--   /api/metrics/trends and the comparison endpoint produce time
--   series by doing COUNT(*) GROUP BY date over the full activities
--   table per request. Every chart render re-scans the table.
--
--   This migration introduces `activity_daily_aggregates` — a real
--   table (not a materialized view) so we can UPSERT single rows on
--   trigger instead of repeatedly refreshing the whole dataset. The
--   table is keyed on (org_id, day, activity_type) so we can slice
--   by type in the UI without further grouping at query time.
--
-- All statements are idempotent.

-- ============================================================
-- 1. Aggregate table
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_daily_aggregates (
  org_id              uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  day                 date        NOT NULL,
  activity_type       text        NOT NULL,
  activity_count      integer     NOT NULL DEFAULT 0,
  participant_total   integer     NOT NULL DEFAULT 0,
  -- Total duration in hours, derived from start_time/end_time
  -- when both are present; 0 otherwise. NUMERIC for precision
  -- because activities with sub-hour durations are common.
  hours_total         numeric(12,2) NOT NULL DEFAULT 0,
  refreshed_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, day, activity_type)
);

CREATE INDEX IF NOT EXISTS activity_daily_aggregates_org_day_idx
  ON activity_daily_aggregates (org_id, day DESC);

-- ============================================================
-- 2. RLS — members can read their org's aggregates
-- ============================================================
ALTER TABLE activity_daily_aggregates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'activity_daily_aggregates_select_members'
  ) THEN
    CREATE POLICY activity_daily_aggregates_select_members ON activity_daily_aggregates
      FOR SELECT USING (is_org_member(org_id));
  END IF;
END $$;

-- Writes happen only via the SECURITY DEFINER refresh function. Do
-- not expose INSERT/UPDATE/DELETE to authenticated users.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'activity_daily_aggregates_no_writes'
  ) THEN
    CREATE POLICY activity_daily_aggregates_no_writes ON activity_daily_aggregates
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- ============================================================
-- 3. Full-refresh function (used by scheduled job)
-- ============================================================
-- Recomputes every row from scratch. Cheap enough for <1M activities;
-- Phase 15b can introduce incremental refresh if needed.
CREATE OR REPLACE FUNCTION refresh_activity_daily_aggregates(
  p_org_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    -- Full rebuild — swap strategy so readers never see an empty
    -- table mid-refresh: delete + insert in a single transaction.
    DELETE FROM activity_daily_aggregates;
    INSERT INTO activity_daily_aggregates
      (org_id, day, activity_type, activity_count, participant_total, hours_total)
    SELECT
      a.org_id,
      a.date                                AS day,
      a.type                                AS activity_type,
      count(*)                              AS activity_count,
      COALESCE(sum(a.participant_count), 0) AS participant_total,
      COALESCE(sum(
        CASE
          WHEN a.start_time IS NOT NULL AND a.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 3600.0
          ELSE 0
        END
      ), 0) AS hours_total
    FROM activities a
    GROUP BY a.org_id, a.date, a.type;
  ELSE
    -- Per-org rebuild — faster for on-demand invalidation after bulk
    -- imports. UPSERT on the primary key keeps behaviour consistent
    -- with future incremental flows.
    DELETE FROM activity_daily_aggregates WHERE org_id = p_org_id;
    INSERT INTO activity_daily_aggregates
      (org_id, day, activity_type, activity_count, participant_total, hours_total)
    SELECT
      a.org_id,
      a.date,
      a.type,
      count(*),
      COALESCE(sum(a.participant_count), 0),
      COALESCE(sum(
        CASE
          WHEN a.start_time IS NOT NULL AND a.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 3600.0
          ELSE 0
        END
      ), 0)
    FROM activities a
    WHERE a.org_id = p_org_id
    GROUP BY a.org_id, a.date, a.type;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION refresh_activity_daily_aggregates(uuid) FROM public;
GRANT EXECUTE ON FUNCTION refresh_activity_daily_aggregates(uuid) TO authenticated;

-- Prime so the first reader sees data.
SELECT refresh_activity_daily_aggregates(NULL);

-- ============================================================
-- 4. Incremental refresh for a single (org, day) tuple
-- ============================================================
-- Used by future server actions after a single activity insert/update.
-- Cheap: touches one row of the aggregate table.
CREATE OR REPLACE FUNCTION refresh_activity_day(
  p_org_id uuid,
  p_day date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM activity_daily_aggregates
   WHERE org_id = p_org_id AND day = p_day;

  INSERT INTO activity_daily_aggregates
    (org_id, day, activity_type, activity_count, participant_total, hours_total)
  SELECT
    a.org_id,
    a.date,
    a.type,
    count(*),
    COALESCE(sum(a.participant_count), 0),
    COALESCE(sum(
      CASE
        WHEN a.start_time IS NOT NULL AND a.end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM activities a
  WHERE a.org_id = p_org_id AND a.date = p_day
  GROUP BY a.org_id, a.date, a.type;
END;
$$;

REVOKE ALL ON FUNCTION refresh_activity_day(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION refresh_activity_day(uuid, date) TO authenticated;

-- ============================================================
-- 5. Scheduled full refresh (pg_cron, if installed)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'refresh_activity_daily_aggregates';

    PERFORM cron.schedule(
      'refresh_activity_daily_aggregates',
      '*/30 * * * *',
      $cron$ SELECT refresh_activity_daily_aggregates(NULL); $cron$
    );
  END IF;
END $$;
