-- ============================================================
-- Migration 110: Stage H — Analytics depth + export
-- ============================================================
-- 1. aggregate_contributor_analytics_daily(p_target_date date)
--    Derives daily counters into contributor_analytics from
--    source-of-truth tables. Idempotent — replaces (not increments)
--    each (contributor_id, entity_type, entity_id, date, metric) row
--    so a re-run for the same date corrects drift.
-- 2. get_public_contributor_analytics(p_contributor_id uuid, p_days int)
--    Public-readable subset of analytics per A19: follows + joins only.
--    Returns aggregated totals (no entity_id leakage). SECURITY DEFINER
--    with REVOKE/GRANT to anon + authenticated.
-- 3. snapshot_contributor_analytics_for_vision()
--    Stub function for the future Vision ecosystem export hook.
--    Currently emits a NOTICE — replace body once Vision endpoint lands.
-- 4. pg_cron jobs:
--    - contributor-analytics-daily  (02:15 UTC daily) → aggregate yesterday
--    - contributor-analytics-purge  (Sunday 03:00 UTC weekly) → 1-year retention
-- ============================================================

-- ── 1. Daily aggregator ──────────────────────────────────────
-- Computes counters for one calendar date and upserts into
-- contributor_analytics. Replaces value (not delta) so re-running
-- for the same date is safe and self-correcting.
--
-- Public-safe metrics: follows, joins
-- Owner-only metrics: views, rsvps, comments, reports, broadcasts, convinces
-- Note: cancellations + shares omitted — no current source-of-truth table
--       (rsvps tracks status='attending|considering' only; un-RSVP is DELETE).
CREATE OR REPLACE FUNCTION public.aggregate_contributor_analytics_daily(
  p_target_date date DEFAULT (CURRENT_DATE - INTERVAL '1 day')::date
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_written integer := 0;
BEGIN
  -- ── Per-event metrics ──────────────────────────────────────
  -- views (event_views)
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'views',
    COUNT(v.id)::bigint
  FROM events e
  LEFT JOIN event_views v
    ON v.event_id = e.id
   AND v.viewed_at >= p_target_date
   AND v.viewed_at <  p_target_date + INTERVAL '1 day'
  WHERE e.created_by IS NOT NULL
  GROUP BY e.created_by, e.id
  HAVING COUNT(v.id) > 0
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  GET DIAGNOSTICS v_rows_written = ROW_COUNT;

  -- rsvps (attending) per event
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'rsvps',
    COUNT(r.id)::bigint
  FROM events e
  JOIN rsvps r
    ON r.event_id = e.id
   AND r.status = 'attending'
   AND r.created_at >= p_target_date
   AND r.created_at <  p_target_date + INTERVAL '1 day'
  WHERE e.created_by IS NOT NULL
  GROUP BY e.created_by, e.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- joins (consider_joins — public-safe social signal per A19)
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'joins',
    COUNT(cj.id)::bigint
  FROM events e
  JOIN rsvps r          ON r.event_id = e.id
  JOIN consider_joins cj ON cj.rsvp_id = r.id
   AND cj.created_at >= p_target_date
   AND cj.created_at <  p_target_date + INTERVAL '1 day'
  WHERE e.created_by IS NOT NULL
  GROUP BY e.created_by, e.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- comments per event
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'comments',
    COUNT(c.id)::bigint
  FROM events e
  JOIN comments c
    ON c.event_id = e.id
   AND c.created_at >= p_target_date
   AND c.created_at <  p_target_date + INTERVAL '1 day'
  WHERE e.created_by IS NOT NULL
  GROUP BY e.created_by, e.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- convinces per event
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'convinces',
    COUNT(cv.id)::bigint
  FROM events e
  JOIN convinces cv
    ON cv.event_id = e.id
   AND cv.created_at >= p_target_date
   AND cv.created_at <  p_target_date + INTERVAL '1 day'
  WHERE e.created_by IS NOT NULL
  GROUP BY e.created_by, e.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- reports targeting events
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'reports',
    COUNT(rp.id)::bigint
  FROM events e
  JOIN reports rp
    ON rp.target_type = 'event'
   AND rp.target_id = e.id
   AND rp.created_at >= p_target_date
   AND rp.created_at <  p_target_date + INTERVAL '1 day'
  WHERE e.created_by IS NOT NULL
  GROUP BY e.created_by, e.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- broadcasts per event
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    bm.contributor_id, 'event', bm.entity_id, p_target_date, 'broadcasts',
    COUNT(bm.id)::bigint
  FROM broadcast_messages bm
  WHERE bm.entity_type = 'event'
    AND bm.deleted_at IS NULL
    AND bm.created_at >= p_target_date
    AND bm.created_at <  p_target_date + INTERVAL '1 day'
  GROUP BY bm.contributor_id, bm.entity_id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- ── Per-place metrics ──────────────────────────────────────
  -- follows (place_follows — public-safe)
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    p.created_by, 'place', p.id, p_target_date, 'follows',
    COUNT(pf.id)::bigint
  FROM places p
  JOIN place_follows pf
    ON pf.place_id = p.id
   AND pf.created_at >= p_target_date
   AND pf.created_at <  p_target_date + INTERVAL '1 day'
  WHERE p.created_by IS NOT NULL
  GROUP BY p.created_by, p.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- reports targeting places
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    p.created_by, 'place', p.id, p_target_date, 'reports',
    COUNT(rp.id)::bigint
  FROM places p
  JOIN reports rp
    ON rp.target_type = 'place'
   AND rp.target_id = p.id
   AND rp.created_at >= p_target_date
   AND rp.created_at <  p_target_date + INTERVAL '1 day'
  WHERE p.created_by IS NOT NULL
  GROUP BY p.created_by, p.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- broadcasts per place
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    bm.contributor_id, 'place', bm.entity_id, p_target_date, 'broadcasts',
    COUNT(bm.id)::bigint
  FROM broadcast_messages bm
  WHERE bm.entity_type = 'place'
    AND bm.deleted_at IS NULL
    AND bm.created_at >= p_target_date
    AND bm.created_at <  p_target_date + INTERVAL '1 day'
  GROUP BY bm.contributor_id, bm.entity_id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- ── Contributor-level rollup metrics ───────────────────────
  -- follows on contributor profile itself
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    f.followee_id, 'contributor', NULL, p_target_date, 'follows',
    COUNT(*)::bigint
  FROM follows f
  WHERE f.created_at >= p_target_date
    AND f.created_at <  p_target_date + INTERVAL '1 day'
  GROUP BY f.followee_id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- reports targeting contributor profile (target_type='user')
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    rp.target_id, 'contributor', NULL, p_target_date, 'reports',
    COUNT(*)::bigint
  FROM reports rp
  WHERE rp.target_type = 'user'
    AND rp.created_at >= p_target_date
    AND rp.created_at <  p_target_date + INTERVAL '1 day'
  GROUP BY rp.target_id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN v_rows_written;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aggregate_contributor_analytics_daily(date)
  FROM anon, authenticated, public;

COMMENT ON FUNCTION public.aggregate_contributor_analytics_daily(date) IS
  'Stage H aggregator. Idempotent rebuild of contributor_analytics for a single date. service_role / pg_cron only.';

-- ── 2. Public read RPC (A19: follows + joins public-safe) ────
-- Returns rollup totals per metric across the requested window.
-- Filters to public-safe metrics ('follows', 'joins') only.
-- Aggregates across all entity_types so callers cannot enumerate
-- per-event/per-place activity from this RPC.
CREATE OR REPLACE FUNCTION public.get_public_contributor_analytics(
  p_contributor_id uuid,
  p_days           integer DEFAULT 30
)
RETURNS TABLE (metric text, total bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Clamp window to allowed analytics retention range
  IF p_days IS NULL OR p_days < 1 THEN
    p_days := 30;
  ELSIF p_days > 365 THEN
    p_days := 365;
  END IF;

  RETURN QUERY
  SELECT
    ca.metric,
    SUM(ca.value)::bigint AS total
  FROM contributor_analytics ca
  WHERE ca.contributor_id = p_contributor_id
    AND ca.date >= (CURRENT_DATE - (p_days || ' days')::interval)::date
    AND ca.metric IN ('follows', 'joins')
  GROUP BY ca.metric;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_contributor_analytics(uuid, integer)
  FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_contributor_analytics(uuid, integer)
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_contributor_analytics(uuid, integer) IS
  'Stage H public analytics. Returns only follows+joins per A19. Aggregated across entities to avoid per-asset enumeration.';

-- ── 3. Vision-export hook stub ───────────────────────────────
-- Future home for the yearly snapshot export to Citizens Vision.
-- Currently a noop NOTICE so the call surface exists and the next
-- batch can wire in the actual HTTP / file export without changing
-- the cron schedule.
CREATE OR REPLACE FUNCTION public.snapshot_contributor_analytics_for_vision()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE NOTICE 'snapshot_contributor_analytics_for_vision: stub — wire to Vision endpoint in a follow-up';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_contributor_analytics_for_vision()
  FROM anon, authenticated, public;

-- ── 4. pg_cron schedules ─────────────────────────────────────
-- Safe re-run: unschedule first, then create.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Daily aggregator: 02:15 UTC (04:15 SAST) — picks up yesterday's data
    PERFORM cron.unschedule('contributor-analytics-daily') WHERE TRUE;
    PERFORM cron.schedule(
      'contributor-analytics-daily',
      '15 2 * * *',
      $cron$
        SELECT public.aggregate_contributor_analytics_daily();
      $cron$
    );

    -- Weekly retention purge: Sunday 03:00 UTC
    PERFORM cron.unschedule('contributor-analytics-purge') WHERE TRUE;
    PERFORM cron.schedule(
      'contributor-analytics-purge',
      '0 3 * * 0',
      $cron$
        SELECT public.purge_old_analytics();
      $cron$
    );
  END IF;
END $$;
