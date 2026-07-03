-- =========================================================================
-- 075 — Truncate bio in search_contributors RPC return
-- =========================================================================
-- The org search panel renders a single-line snippet beneath each
-- result row. The full `bio` column is unbounded (up to a few kB on
-- mature contributors) so streaming it across the wire for every row
-- is wasteful, and the front-end was truncating client-side anyway.
-- This patch truncates `bio` to 160 characters at the RPC boundary
-- and appends "…" when truncated. Search semantics are unchanged —
-- the ILIKE branch still scans the full bio column inside the
-- function body before projection.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.search_contributors(
  q              text DEFAULT NULL,
  kinds          text[] DEFAULT NULL,
  location_query text DEFAULT NULL,
  category_slug  text DEFAULT NULL,
  sort_by        text DEFAULT 'auto',
  result_limit   int  DEFAULT 25
)
RETURNS TABLE (
  id                uuid,
  full_name         text,
  contributor_slug  text,
  contributor_kind  text,
  logo_url          text,
  avatar_url        text,
  physical_address  text,
  bio               text,
  followers_count   bigint,
  similarity        real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
  WITH norm AS (
    SELECT
      nullif(lower(coalesce(q, '')), '')              AS qn,
      nullif(lower(coalesce(location_query, '')), '') AS locn
  ), esc AS (
    SELECT
      qn,
      locn,
      replace(replace(replace(qn,   '\', '\\'), '%', '\%'), '_', '\_') AS qn_like,
      replace(replace(replace(locn, '\', '\\'), '%', '\%'), '_', '\_') AS locn_like
    FROM norm
  ), base AS (
    SELECT
      p.id,
      p.full_name,
      p.contributor_slug,
      p.contributor_kind,
      p.logo_url,
      p.avatar_url,
      p.physical_address,
      -- Truncate bio for transport. 160 chars matches a typical
      -- two-line snippet at the panel's font/width. Front-end may
      -- still ellipsise further.
      CASE
        WHEN p.bio IS NULL THEN NULL
        WHEN char_length(p.bio) <= 160 THEN p.bio
        ELSE substr(p.bio, 1, 160) || '…'
      END AS bio,
      (SELECT count(*)::bigint
         FROM public.follows f
        WHERE f.followee_id = p.id) AS followers_count,
      CASE
        WHEN (SELECT qn FROM esc) IS NULL THEN 0
        ELSE greatest(
          extensions.word_similarity((SELECT qn FROM esc),
                                     lower(coalesce(p.full_name, ''))),
          extensions.similarity(lower(coalesce(p.full_name, '')),
                                (SELECT qn FROM esc))
        )
      END::real AS similarity
    FROM public.profiles p
    WHERE p.role = 'contributor'
      AND p.contributor_status = 'approved'
      AND p.contributor_slug IS NOT NULL
      AND (
        (SELECT qn FROM esc) IS NULL
        OR extensions.word_similarity((SELECT qn FROM esc),
                                      lower(coalesce(p.full_name, ''))) >= 0.3
        OR lower(coalesce(p.full_name, '')) ILIKE '%' || (SELECT qn_like FROM esc) || '%' ESCAPE '\'
        OR lower(coalesce(p.bio, ''))       ILIKE '%' || (SELECT qn_like FROM esc) || '%' ESCAPE '\'
      )
      AND (kinds IS NULL OR p.contributor_kind = ANY(kinds))
      AND (
        (SELECT locn FROM esc) IS NULL
        OR lower(coalesce(p.physical_address, '')) ILIKE '%' || (SELECT locn_like FROM esc) || '%' ESCAPE '\'
      )
      AND (
        category_slug IS NULL
        OR EXISTS (
          SELECT 1
            FROM public.events e
           WHERE e.created_by = p.id
             AND e.category   = category_slug
        )
      )
  )
  SELECT *
  FROM base
  ORDER BY
    CASE
      WHEN sort_by = 'similarity'
        OR (sort_by = 'auto' AND (SELECT qn FROM esc) IS NOT NULL)
      THEN base.similarity
    END DESC NULLS LAST,
    CASE
      WHEN sort_by IN ('followers', 'auto')
      THEN base.followers_count
    END DESC NULLS LAST,
    base.full_name ASC
  LIMIT greatest(1, least(coalesce(result_limit, 25), 100));
$$;

COMMENT ON FUNCTION public.search_contributors(text, text[], text, text, text, int) IS
  'FEAT-03 fuzzy organisation search. Trigram (pg_trgm) on profiles.full_name with ILIKE fallback. Metacharacters escaped. Bio truncated to 160 chars for transport. Returns approved contributors only.';

REVOKE ALL ON FUNCTION public.search_contributors(text, text[], text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_contributors(text, text[], text, text, text, int) TO anon, authenticated;
