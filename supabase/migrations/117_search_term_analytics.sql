-- ============================================================
-- Migration 117: Stage L — Search term analytics
-- ============================================================
-- 1. search_term_stats — daily-rolling, anonymised aggregate of
--    search queries. NO user_id (A65 "raw anonymised queries").
--    Keyed UNIQUE (term, day) and incremented per search.
-- 2. log_search_term(text) — SECURITY DEFINER sanitise-and-upsert.
--    Called best-effort from POST /api/ai-search for ALL searches
--    (incl. anonymous). Sanitisation happens server-side in Postgres
--    so the table never stores junk/control chars.
-- 3. get_top_search_terms(int, int) — top-N terms over the last N
--    days for the dashboard "Top searches this month" panel (A64).
-- 4. get_search_autocomplete(text, int) — merges contributor
--    keywords (A66) with popular recent search terms into a single
--    prefix-matched suggestion feed for the global search bar.
-- 5. purge_old_search_terms() + weekly pg_cron (180-day retention).
-- ============================================================

-- ── 1. search_term_stats ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.search_term_stats (
  id    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  term  text    NOT NULL CHECK (char_length(term) BETWEEN 2 AND 80),
  day   date    NOT NULL DEFAULT CURRENT_DATE,
  hits  bigint  NOT NULL DEFAULT 0,
  UNIQUE (term, day)
);

-- Top-N queries: order by hits within a day window.
CREATE INDEX IF NOT EXISTS idx_search_term_stats_day_hits
  ON public.search_term_stats (day DESC, hits DESC);
-- Autocomplete prefix scan (text_pattern_ops for LIKE 'prefix%').
CREATE INDEX IF NOT EXISTS idx_search_term_stats_term_prefix
  ON public.search_term_stats (term text_pattern_ops);

ALTER TABLE public.search_term_stats ENABLE ROW LEVEL SECURITY;
-- No table-level policies: all access flows through the SECURITY
-- DEFINER RPCs below. Direct reads/writes are denied for every role.

COMMENT ON TABLE public.search_term_stats IS
  'Stage L: anonymised daily-rolling search-term counts. Written only via log_search_term(); read only via get_top_search_terms()/get_search_autocomplete().';

-- ── helper: sanitise a search term ───────────────────────────
-- Lower-cases, trims, collapses whitespace, strips control chars,
-- caps length, and rejects terms with no alphanumeric content.
-- Returns NULL when the term should not be stored.
CREATE OR REPLACE FUNCTION public.sanitise_search_term(p_raw text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  IF p_raw IS NULL THEN
    RETURN NULL;
  END IF;
  -- Strip ASCII + Unicode control chars, normalise whitespace runs.
  v := regexp_replace(p_raw, '[\x00-\x1F\x7F]', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := btrim(lower(v));
  -- Length bounds (matches the table CHECK).
  IF char_length(v) < 2 THEN
    RETURN NULL;
  END IF;
  IF char_length(v) > 80 THEN
    v := substr(v, 1, 80);
    v := btrim(v);
  END IF;
  -- Must contain at least one letter or digit (drops "...", "!!!", etc.).
  IF v !~ '[a-z0-9]' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.sanitise_search_term(text) IS
  'Stage L: normalise + validate a raw search query before it enters search_term_stats.';

-- ── 2. log_search_term ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_search_term(p_term text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term text := public.sanitise_search_term(p_term);
BEGIN
  IF v_term IS NULL THEN
    RETURN;  -- silently ignore junk / too-short terms
  END IF;

  INSERT INTO search_term_stats (term, day, hits)
  VALUES (v_term, CURRENT_DATE, 1)
  ON CONFLICT (term, day)
    DO UPDATE SET hits = search_term_stats.hits + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_search_term(text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_search_term(text) TO anon, authenticated;

COMMENT ON FUNCTION public.log_search_term(text) IS
  'Stage L: sanitise + upsert-increment a search term into the anonymised rolling table. Best-effort from POST /api/ai-search.';

-- ── 3. get_top_search_terms ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_top_search_terms(
  p_limit integer DEFAULT 10,
  p_days  integer DEFAULT 30
)
RETURNS TABLE (term text, hits bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Clamp inputs.
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 10; END IF;
  IF p_limit > 50 THEN p_limit := 50; END IF;
  IF p_days IS NULL OR p_days < 1 THEN p_days := 30; END IF;
  IF p_days > 180 THEN p_days := 180; END IF;

  RETURN QUERY
  SELECT s.term, SUM(s.hits)::bigint AS hits
  FROM search_term_stats s
  WHERE s.day >= (CURRENT_DATE - (p_days || ' days')::interval)::date
  GROUP BY s.term
  ORDER BY SUM(s.hits) DESC, s.term ASC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_search_terms(integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_top_search_terms(integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_top_search_terms(integer, integer) IS
  'Stage L: top-N anonymised search terms over the last N days (A64). Authenticated only (dashboard surface).';

-- ── 4. get_search_autocomplete ───────────────────────────────
-- Merges contributor-added keywords (A66) with popular recent
-- search terms. Prefix match, de-duplicated, keyword sources ranked
-- above raw query history. Public — feeds the global search bar.
CREATE OR REPLACE FUNCTION public.get_search_autocomplete(
  p_prefix text,
  p_limit  integer DEFAULT 8
)
RETURNS TABLE (suggestion text, source text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_prefix text := public.sanitise_search_term(p_prefix);
  v_like   text;
BEGIN
  IF v_prefix IS NULL THEN
    RETURN;  -- empty result set for junk / too-short prefixes
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 8; END IF;
  IF p_limit > 20 THEN p_limit := 20; END IF;

  -- Escape LIKE metacharacters in the user prefix, then anchor.
  v_like := replace(replace(replace(v_prefix, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  WITH keyword_hits AS (
    SELECT DISTINCT lower(ck.keyword) AS suggestion, 'keyword'::text AS source, 0 AS rank
    FROM contributor_keywords ck
    WHERE lower(ck.keyword) LIKE v_like
    LIMIT 50
  ),
  term_hits AS (
    SELECT s.term AS suggestion, 'popular'::text AS source, 1 AS rank
    FROM search_term_stats s
    WHERE s.term LIKE v_like
      AND s.day >= (CURRENT_DATE - interval '30 days')::date
    GROUP BY s.term
    ORDER BY SUM(s.hits) DESC
    LIMIT 50
  ),
  merged AS (
    SELECT suggestion, source, rank FROM keyword_hits
    UNION ALL
    SELECT suggestion, source, rank FROM term_hits
  ),
  deduped AS (
    -- Prefer the keyword source (lower rank) when a term appears in both.
    SELECT DISTINCT ON (suggestion) suggestion, source, rank
    FROM merged
    ORDER BY suggestion, rank
  )
  SELECT d.suggestion, d.source
  FROM deduped d
  ORDER BY d.rank, d.suggestion
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_search_autocomplete(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_search_autocomplete(text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.get_search_autocomplete(text, integer) IS
  'Stage L (A66): prefix-matched search suggestions merging contributor keywords + popular recent queries. Public.';

-- ── 5. Retention purge + weekly cron ─────────────────────────
CREATE OR REPLACE FUNCTION public.purge_old_search_terms()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM search_term_stats
  WHERE day < CURRENT_DATE - interval '180 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_search_terms()
  FROM anon, authenticated, public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('search-term-stats-purge') WHERE TRUE;
    PERFORM cron.schedule(
      'search-term-stats-purge',
      '30 3 * * 0',   -- Sunday 03:30 UTC
      $cron$
        SELECT public.purge_old_search_terms();
      $cron$
    );
  END IF;
END $$;
