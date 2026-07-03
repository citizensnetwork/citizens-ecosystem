-- ============================================================
-- Migration 112: Stage H (optional) — Backfill historic analytics
-- ============================================================
-- Wraps `aggregate_contributor_analytics_daily(date)` in a looping helper
-- so an operator can hydrate the last N days of counters in one call.
--
-- Idempotent: the underlying aggregator uses ON CONFLICT DO UPDATE with the
-- replace-not-increment pattern, so re-running for the same window simply
-- corrects any drift.
--
-- Service-role / pg_cron only. Not granted to anon/authenticated/public.
--
-- Invocation example (from psql with service_role):
--   SELECT public.backfill_contributor_analytics(90);
-- ============================================================

CREATE OR REPLACE FUNCTION public.backfill_contributor_analytics(
  p_days_back integer DEFAULT 90
)
RETURNS TABLE (target_date date, rows_written integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_date date;
  v_rows        integer;
BEGIN
  -- Clamp to retention bounds. The aggregator only writes to
  -- contributor_analytics, which is purged at 1y by purge_old_analytics,
  -- so anything older is wasted work.
  IF p_days_back IS NULL OR p_days_back < 1 THEN
    p_days_back := 90;
  ELSIF p_days_back > 365 THEN
    p_days_back := 365;
  END IF;

  -- Walk yesterday → (yesterday - p_days_back + 1). The daily cron at 02:15
  -- UTC handles "today's yesterday", so we only backfill strictly earlier
  -- days here and let the cron handle the head.
  FOR i IN 1 .. p_days_back LOOP
    v_target_date := (CURRENT_DATE - i)::date;

    v_rows := public.aggregate_contributor_analytics_daily(v_target_date);

    -- Surface each date's rowcount so operators see progress when invoked
    -- interactively. RETURN NEXT emits the row.
    target_date  := v_target_date;
    rows_written := v_rows;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_contributor_analytics(integer)
  FROM anon, authenticated, public;

COMMENT ON FUNCTION public.backfill_contributor_analytics(integer) IS
  'Stage H optional. Loops aggregate_contributor_analytics_daily over the last N days (clamped 1..365). Idempotent. service_role / pg_cron only.';
