-- ============================================================
-- Migration 119: Map prominence base (server popularity component)
-- ============================================================
-- Adds events.prominence_base + places.prominence_base — a numeric
-- [0,1] popularity score that the map's tiering engine combines with
-- live (client-side) time-proximity + newcomer boost to decide a
-- marker's tier (dot → mid → full → photo) and collision priority.
--
-- This is ONLY the heavy popularity half of the hybrid score. The
-- time-proximity + newcomer-boost half is computed client-side at
-- render so the time signal never goes stale between cron runs.
--
-- Score shape (row-independent, no cross-row normalisation):
--   raw  = Σ wᵢ · ln(1 + countᵢ)
--   base = raw / (raw + K)          -- saturating; asymptotes to 1
-- A single huge count therefore can't erase the small (VISION: the
-- small are honoured) and the value is stable as the table grows.
--
-- 1. Columns (default 0 — fairness floor: an unscored item still has a
--    valid base; the client never hides it, only keeps it a dot).
-- 2. recompute_map_prominence() — idempotent full rebuild. service-only.
-- 3. pg_cron daily schedule (02:45 UTC = after the 02:15 analytics job).
-- 4. One-time backfill so the column is populated immediately.
-- ============================================================

-- ── 1. Columns ───────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS prominence_base numeric NOT NULL DEFAULT 0;
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS prominence_base numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.events.prominence_base IS
  'Map tiering: saturating log popularity score [0,1] (rsvps/comments/views). Maintained by recompute_map_prominence(). Client adds live time-proximity + newcomer boost.';
COMMENT ON COLUMN public.places.prominence_base IS
  'Map tiering: saturating log popularity score [0,1] (follows/reviews). Maintained by recompute_map_prominence().';

-- ── 2. Recompute function ────────────────────────────────────
-- Full idempotent rebuild of both columns from source-of-truth
-- tables. Cheap enough for a daily cron; recomputing from scratch
-- means no drift accumulation (matches the analytics-aggregator
-- REPLACE-not-increment philosophy).
CREATE OR REPLACE FUNCTION public.recompute_map_prominence()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Saturation constant: tunes where base ≈ 0.5. With the weights
  -- below, a moderately active event (~20 attending) lands near 0.55.
  k_event numeric := 4.0;
  k_place numeric := 3.0;
BEGIN
  -- ── Events ──────────────────────────────────────────────────
  -- rsvps (attending, all-time) + comments (all-time) + views (90d window).
  -- Views are windowed so a long-stale event doesn't ride old traffic;
  -- rsvps/comments are intent signals worth keeping lifetime.
  WITH counts AS (
    SELECT
      e.id,
      COALESCE(r.n, 0)  AS rsvps,
      COALESCE(c.n, 0)  AS comments,
      COALESCE(v.n, 0)  AS views
    FROM events e
    LEFT JOIN (
      SELECT event_id, COUNT(*) AS n FROM rsvps
      WHERE status = 'attending' GROUP BY event_id
    ) r ON r.event_id = e.id
    LEFT JOIN (
      SELECT event_id, COUNT(*) AS n FROM comments
      WHERE event_id IS NOT NULL GROUP BY event_id
    ) c ON c.event_id = e.id
    LEFT JOIN (
      SELECT event_id, COUNT(*) AS n FROM event_views
      WHERE viewed_at >= now() - INTERVAL '90 days' GROUP BY event_id
    ) v ON v.event_id = e.id
  ), scored AS (
    SELECT
      id,
      ( 1.0 * ln(1 + rsvps)
      + 0.8 * ln(1 + comments)
      + 0.3 * ln(1 + views) ) AS raw
    FROM counts
  )
  UPDATE events e
  SET prominence_base = round((s.raw / (s.raw + k_event))::numeric, 4)
  FROM scored s
  WHERE s.id = e.id
    AND e.prominence_base IS DISTINCT FROM round((s.raw / (s.raw + k_event))::numeric, 4);

  -- ── Places ──────────────────────────────────────────────────
  -- place_follows (all-time) + reviews (all-time count).
  WITH counts AS (
    SELECT
      p.id,
      COALESCE(f.n, 0)  AS follows,
      COALESCE(rv.n, 0) AS reviews
    FROM places p
    LEFT JOIN (
      SELECT place_id, COUNT(*) AS n FROM place_follows GROUP BY place_id
    ) f ON f.place_id = p.id
    LEFT JOIN (
      SELECT place_id, COUNT(*) AS n FROM reviews
      WHERE place_id IS NOT NULL GROUP BY place_id
    ) rv ON rv.place_id = p.id
  ), scored AS (
    SELECT
      id,
      ( 1.0 * ln(1 + follows)
      + 0.8 * ln(1 + reviews) ) AS raw
    FROM counts
  )
  UPDATE places p
  SET prominence_base = round((s.raw / (s.raw + k_place))::numeric, 4)
  FROM scored s
  WHERE s.id = p.id
    AND p.prominence_base IS DISTINCT FROM round((s.raw / (s.raw + k_place))::numeric, 4);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_map_prominence()
  FROM anon, authenticated, public;

COMMENT ON FUNCTION public.recompute_map_prominence() IS
  'Map tiering: idempotent rebuild of events/places.prominence_base from popularity source tables. service_role / pg_cron only.';

-- ── 3. pg_cron schedule ──────────────────────────────────────
-- 02:45 UTC daily — runs after the 02:15 analytics aggregator so
-- both derive from the same settled day. Safe re-run: unschedule first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('map-prominence-recompute') WHERE TRUE;
    PERFORM cron.schedule(
      'map-prominence-recompute',
      '45 2 * * *',
      $cron$
        SELECT public.recompute_map_prominence();
      $cron$
    );
  END IF;
END $$;

-- ── 4. One-time backfill ─────────────────────────────────────
SELECT public.recompute_map_prominence();
