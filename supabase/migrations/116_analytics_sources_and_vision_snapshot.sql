-- ============================================================
-- Migration 116: Stage H follow-ups
-- ============================================================
-- 1. rsvp_cancellations  — source-of-truth for the "cancellations"
--    metric. Un-RSVP is a hard DELETE on `rsvps`, so the app layer
--    (DELETE /api/rsvp) writes a cancellation row before deleting.
--    A trigger is deliberately NOT used: a BEFORE DELETE trigger on
--    `rsvps` cannot cleanly distinguish a user un-RSVP from the
--    ON DELETE CASCADE that fires when an event itself is torn down,
--    which would inflate the metric. App-path logging captures the
--    genuine user intent only.
-- 2. shares — source-of-truth for the "shares" metric. Shares were
--    100% client-side (navigator.share / clipboard); the share
--    surfaces now fire a best-effort POST /api/shares which inserts
--    here.
-- 3. contributor_analytics_snapshots — yearly per-contributor rollup
--    trees materialised for the Citizens Vision ecosystem (A17/A21).
-- 4. aggregate_contributor_analytics_daily — extended with
--    cancellations + shares blocks (REPLACE-not-increment, same as
--    the existing metrics).
-- 5. snapshot_contributor_analytics_for_vision — rewritten from the
--    migration-110 NOTICE stub into a real materialiser that writes
--    yearly nested rollups into contributor_analytics_snapshots.
-- 6. purge_old_analytics — extended to also trim the raw
--    cancellation / share logs (90-day window — long after the daily
--    aggregator has consumed them, leaving room for re-aggregation).
-- 7. pg_cron: yearly Vision snapshot (Jan 1, 03:30 UTC).
-- ============================================================

-- ── 1. rsvp_cancellations ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rsvp_cancellations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cancelled_at timestamptz NOT NULL DEFAULT now()
);

-- Aggregator scans by (event_id, cancelled_at window).
CREATE INDEX IF NOT EXISTS idx_rsvp_cancellations_event_time
  ON public.rsvp_cancellations (event_id, cancelled_at);

ALTER TABLE public.rsvp_cancellations ENABLE ROW LEVEL SECURITY;

-- The cancelling user logs their own row (defence-in-depth: the API
-- already sets user_id = auth.uid()).
DROP POLICY IF EXISTS rsvp_cancellations_insert_own ON public.rsvp_cancellations;
CREATE POLICY rsvp_cancellations_insert_own
  ON public.rsvp_cancellations
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Raw rows are private — the dashboard reads the aggregated
-- contributor_analytics surface, never this table. Allow the row's
-- owner + admins to read for transparency; aggregator is SECURITY
-- DEFINER so it bypasses RLS regardless.
DROP POLICY IF EXISTS rsvp_cancellations_select_own ON public.rsvp_cancellations;
CREATE POLICY rsvp_cancellations_select_own
  ON public.rsvp_cancellations
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
-- No UPDATE / DELETE policy: append-only from the app's perspective.

COMMENT ON TABLE public.rsvp_cancellations IS
  'Source-of-truth for the cancellations analytics metric. Written by DELETE /api/rsvp before the rsvps row is removed.';

-- ── 2. shares ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shares (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text        NOT NULL
                          CHECK (entity_type IN ('event', 'place', 'contributor')),
  entity_id   uuid        NOT NULL,
  -- Nullable: share surfaces live on public pages, so logged-out
  -- visitors generate shares too. NULL = anonymous share.
  user_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shares_entity_time
  ON public.shares (entity_type, entity_id, created_at);

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon) may log a share, but an authenticated caller
-- cannot forge another user's id. Anonymous shares carry user_id NULL.
DROP POLICY IF EXISTS shares_insert_self_or_anon ON public.shares;
CREATE POLICY shares_insert_self_or_anon
  ON public.shares
  FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Raw share rows are not user-readable (privacy + no product need);
-- admins may read for moderation. Aggregator is SECURITY DEFINER.
DROP POLICY IF EXISTS shares_select_admin ON public.shares;
CREATE POLICY shares_select_admin
  ON public.shares
  FOR SELECT
  USING (public.is_admin());

COMMENT ON TABLE public.shares IS
  'Source-of-truth for the shares analytics metric. Written best-effort by POST /api/shares from the client share surfaces.';

-- ── 3. contributor_analytics_snapshots ───────────────────────
CREATE TABLE IF NOT EXISTS public.contributor_analytics_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_label   text        NOT NULL,   -- e.g. '2026'
  period_start   date        NOT NULL,
  period_end     date        NOT NULL,
  payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contributor_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_contributor
  ON public.contributor_analytics_snapshots (contributor_id, period_end DESC);

ALTER TABLE public.contributor_analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Contributors can read their own snapshots; admins read all.
-- Writes flow only through the SECURITY DEFINER snapshot function.
DROP POLICY IF EXISTS snapshots_select_own ON public.contributor_analytics_snapshots;
CREATE POLICY snapshots_select_own
  ON public.contributor_analytics_snapshots
  FOR SELECT
  USING (contributor_id = auth.uid() OR public.is_admin());

COMMENT ON TABLE public.contributor_analytics_snapshots IS
  'Yearly per-contributor nested analytics rollups for the Citizens Vision ecosystem (A17/A21). Written by snapshot_contributor_analytics_for_vision().';

-- ── 4. Extend the daily aggregator ───────────────────────────
-- Re-create the whole function so the two new metric blocks sit
-- alongside the migration-110 originals. Body is identical to 110
-- plus the cancellations + shares blocks.
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

  -- cancellations per event (un-RSVPs — source: rsvp_cancellations)
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'cancellations',
    COUNT(rc.id)::bigint
  FROM events e
  JOIN rsvp_cancellations rc
    ON rc.event_id = e.id
   AND rc.cancelled_at >= p_target_date
   AND rc.cancelled_at <  p_target_date + INTERVAL '1 day'
  WHERE e.created_by IS NOT NULL
  GROUP BY e.created_by, e.id
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- shares per event (source: shares)
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    e.created_by, 'event', e.id, p_target_date, 'shares',
    COUNT(s.id)::bigint
  FROM events e
  JOIN shares s
    ON s.entity_type = 'event'
   AND s.entity_id = e.id
   AND s.created_at >= p_target_date
   AND s.created_at <  p_target_date + INTERVAL '1 day'
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

  -- shares per place (source: shares)
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    p.created_by, 'place', p.id, p_target_date, 'shares',
    COUNT(s.id)::bigint
  FROM places p
  JOIN shares s
    ON s.entity_type = 'place'
   AND s.entity_id = p.id
   AND s.created_at >= p_target_date
   AND s.created_at <  p_target_date + INTERVAL '1 day'
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

  -- shares of the contributor profile itself
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  SELECT
    s.entity_id, 'contributor', NULL, p_target_date, 'shares',
    COUNT(*)::bigint
  FROM shares s
  WHERE s.entity_type = 'contributor'
    AND s.created_at >= p_target_date
    AND s.created_at <  p_target_date + INTERVAL '1 day'
  GROUP BY s.entity_id
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
  'Stage H aggregator (v2, mig 116). Idempotent rebuild of contributor_analytics for one date incl. cancellations + shares. service_role / pg_cron only.';

-- ── 5. Vision snapshot materialiser ──────────────────────────
-- Replaces the migration-110 NOTICE stub. Builds one nested rollup
-- row per contributor for the requested year and upserts it into
-- contributor_analytics_snapshots. Idempotent on (contributor_id,
-- period_label) so a re-run for the same year self-corrects.
CREATE OR REPLACE FUNCTION public.snapshot_contributor_analytics_for_vision(
  p_year integer DEFAULT EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '1 day'))::integer
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start          date := make_date(p_year, 1, 1);
  v_end            date := make_date(p_year, 12, 31);
  v_label          text := p_year::text;
  v_contributors   integer := 0;
BEGIN
  WITH window_rows AS (
    SELECT contributor_id, entity_type, entity_id, metric, value
    FROM contributor_analytics
    WHERE date >= v_start AND date <= v_end
  ),
  -- Contributor-level totals per metric.
  totals AS (
    SELECT contributor_id, jsonb_object_agg(metric, total) AS metrics
    FROM (
      SELECT contributor_id, metric, SUM(value)::bigint AS total
      FROM window_rows
      GROUP BY contributor_id, metric
    ) t
    GROUP BY contributor_id
  ),
  -- Per-entity (place / event) nested rollups.
  per_entity AS (
    SELECT
      contributor_id,
      entity_type,
      entity_id,
      jsonb_object_agg(metric, total) AS metrics
    FROM (
      SELECT contributor_id, entity_type, entity_id, metric, SUM(value)::bigint AS total
      FROM window_rows
      WHERE entity_id IS NOT NULL
      GROUP BY contributor_id, entity_type, entity_id, metric
    ) e
    GROUP BY contributor_id, entity_type, entity_id
  ),
  entities AS (
    SELECT
      contributor_id,
      COALESCE(jsonb_agg(
        jsonb_build_object('entity_id', entity_id, 'metrics', metrics)
      ) FILTER (WHERE entity_type = 'place'), '[]'::jsonb) AS places,
      COALESCE(jsonb_agg(
        jsonb_build_object('entity_id', entity_id, 'metrics', metrics)
      ) FILTER (WHERE entity_type = 'event'), '[]'::jsonb) AS events
    FROM per_entity
    GROUP BY contributor_id
  ),
  payloads AS (
    SELECT
      t.contributor_id,
      jsonb_build_object(
        'year', p_year,
        'period_start', v_start,
        'period_end', v_end,
        'generated_at', now(),
        'totals', t.metrics,
        'places', COALESCE(en.places, '[]'::jsonb),
        'events', COALESCE(en.events, '[]'::jsonb)
      ) AS payload
    FROM totals t
    LEFT JOIN entities en ON en.contributor_id = t.contributor_id
  )
  INSERT INTO contributor_analytics_snapshots
    (contributor_id, period_label, period_start, period_end, payload)
  SELECT contributor_id, v_label, v_start, v_end, payload
  FROM payloads
  ON CONFLICT (contributor_id, period_label)
    DO UPDATE SET payload = EXCLUDED.payload,
                  period_start = EXCLUDED.period_start,
                  period_end = EXCLUDED.period_end,
                  created_at = now();

  GET DIAGNOSTICS v_contributors = ROW_COUNT;
  RETURN v_contributors;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_contributor_analytics_for_vision(integer)
  FROM anon, authenticated, public;

COMMENT ON FUNCTION public.snapshot_contributor_analytics_for_vision(integer) IS
  'Materialises yearly per-contributor nested analytics rollups into contributor_analytics_snapshots for Citizens Vision (A17/A21). service_role / pg_cron only.';

-- Drop the old zero-arg stub signature so only the parameterised
-- materialiser remains (the cron call below passes the default).
DROP FUNCTION IF EXISTS public.snapshot_contributor_analytics_for_vision();

-- ── 6. Extend retention purge to the raw source logs ─────────
CREATE OR REPLACE FUNCTION public.purge_old_analytics()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Aggregated counters: 1-year retention (unchanged).
  DELETE FROM contributor_analytics
  WHERE date < CURRENT_DATE - interval '1 year';

  -- Raw source logs only need to outlive the daily aggregation pass.
  -- 90 days leaves a generous re-aggregation window then reclaims space.
  DELETE FROM rsvp_cancellations
  WHERE cancelled_at < CURRENT_DATE - interval '90 days';

  DELETE FROM shares
  WHERE created_at < CURRENT_DATE - interval '90 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_analytics()
  FROM anon, authenticated, public;

-- ── 7. pg_cron: yearly Vision snapshot ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Jan 1, 03:30 UTC — snapshots the year that just ended (default arg).
    PERFORM cron.unschedule('contributor-analytics-vision-snapshot') WHERE TRUE;
    PERFORM cron.schedule(
      'contributor-analytics-vision-snapshot',
      '30 3 1 1 *',
      $cron$
        SELECT public.snapshot_contributor_analytics_for_vision();
      $cron$
    );
  END IF;
END $$;
