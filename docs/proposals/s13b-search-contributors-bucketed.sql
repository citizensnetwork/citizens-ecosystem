-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL S13b (gate G1, G6, and Stephen's decision): NOT APPLIED. Step 2 of 4.
--  Written 2026-10-17. Take the next free migration number at apply time.
--
--  Apply AFTER s13a-follow-count-functions.sql (it calls public.follower_count_public).
--
--  What it does: public.search_contributors (the SQL behind GET /api/contributors/search, callable by
--  the public key) returns `followers_count` as an EXACT number for every Contributor, and ranks by it.
--  Once `follows` is closed to the public key (s13c) its subquery would count 0 for everybody, so the
--  one line that counts rows is replaced by public.follower_count_public(p.id): rounded down, and 0
--  below 100 (the same rule as the Map v2 sheet, P2-08).
--
--  THE VISIBLE CHANGES, for Stephen to accept or refuse:
--    1. `followers_count` in the search results is a bucket (0, 100, 250, ...), not the exact figure.
--    2. Ranking by followers ("auto" and "followers") can no longer tell two ministries under 100 apart,
--       so they fall back to name order. This also stops the list from ranking the tiny ministries by
--       how few people follow them (VISION litmus 3: no feature should bury the small).
--  Everything else in the function is byte-for-byte the live body (read 2026-10-17): RE-READ it with
--  pg_get_functiondef at apply time; the ONLY intended difference is the followers_count line.
-- ════════════════════════════════════════════════════════════════════

begin;

CREATE OR REPLACE FUNCTION public.search_contributors(q text, kinds text[] DEFAULT NULL::text[], location_query text DEFAULT NULL::text, category_slug text DEFAULT NULL::text, sort_by text DEFAULT 'auto'::text, result_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, full_name text, contributor_slug text, contributor_kind text, logo_url text, avatar_url text, physical_address text, bio text, followers_count bigint, similarity real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
      CASE
        WHEN p.bio IS NULL THEN NULL
        WHEN char_length(p.bio) <= 160 THEN p.bio
        ELSE regexp_replace(substr(p.bio, 1, 160), '\s+\S*$', '') || '…'
      END AS bio,
      public.follower_count_public(p.id) AS followers_count,
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
$function$;

commit;
