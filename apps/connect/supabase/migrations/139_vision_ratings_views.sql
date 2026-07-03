-- ============================================================================
-- Migration 139: avg_rating signal for Vision — Connect-published vision.* views
-- ============================================================================
-- Resolves the one "owed item" from scope §8: the dropped cc_*_mirror tables carried
-- an `avg_rating` column that /api/v1 does not surface. Decision = route (b): publish
-- the signal as Connect-authored aggregate views in the `vision` schema, exactly
-- mirroring the existing vision.reach_per_event / vision.engagement_per_event pattern
-- (regular views over public.*, service_role-only). This keeps Vision reading only
-- vision.* aggregates (SHARED_DB_CONTRACT R3.2/R4.4) — it never queries public.reviews
-- directly — while preserving the quality signal that honours small/quiet contributors.
--
-- Source: public.reviews(rating int NOT NULL, event_id uuid NULL, place_id uuid NULL).
-- Events are filtered to status='published' (mirrors reach/engagement). Places are
-- aggregated over all their reviews; the Vision app may instead read Connect's
-- canonical place-stats via /api/v1 if exact parity with Connect's UI number is needed.
-- ============================================================================

SET search_path = vision, public, pg_catalog;

-- ── ratings_per_event ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vision.ratings_per_event AS
SELECT
  e.id          AS event_id,
  e.created_by  AS org_id,
  e.category_id,
  COALESCE(rv.cnt, 0)        AS review_count,
  rv.avg_rating              AS avg_rating
FROM public.events e
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt,
         round(avg(r.rating)::numeric, 2) AS avg_rating
  FROM public.reviews r
  WHERE r.event_id = e.id
) rv ON true
WHERE e.status = 'published';

-- ── ratings_per_place ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vision.ratings_per_place AS
SELECT
  p.id AS place_id,
  COALESCE(rv.cnt, 0)        AS review_count,
  rv.avg_rating              AS avg_rating
FROM public.places p
LEFT JOIN LATERAL (
  SELECT count(*)::int AS cnt,
         round(avg(r.rating)::numeric, 2) AS avg_rating
  FROM public.reviews r
  WHERE r.place_id = p.id
) rv ON true;

-- ── Service-role only (Connect→Vision publishing layer; R3.2). Never anon/auth. ──
REVOKE ALL ON vision.ratings_per_event FROM PUBLIC, anon, authenticated;
REVOKE ALL ON vision.ratings_per_place FROM PUBLIC, anon, authenticated;
GRANT SELECT ON vision.ratings_per_event TO service_role;
GRANT SELECT ON vision.ratings_per_place TO service_role;
