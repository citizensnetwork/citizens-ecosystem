-- ════════════════════════════════════════════════════════════════════
--  186_search_contributors_bucketed: S13 step 2 of 4. Authored as docs/proposals/s13b-search-contributors-bucketed.sql on
--  2026-10-17; applied the same day through MCP apply_migration as `186_search_contributors_bucketed` on Stephen's yes in
--  chat (one yes per file; pre-apply tag `connect-pre-mig186-search-contributors-bucketed`).
--
--  public.search_contributors (the SQL behind GET /api/contributors/search, callable by the public key) used to return
--  `followers_count` as an EXACT number and rank by it. It now calls public.follower_count_public (migration 185): 0 below
--  100, otherwise rounded down to a step (the same rule as the Map v2 sheet, P2-08). The live body was re-read before the
--  apply and its md5 matched this file with the one followers_count line swapped back, so that line is the ONLY change.
--  Visible changes: the search result carries a bucket, and two ministries under 100 tie on followers and fall back to name
--  order, so the list no longer ranks the smallest last (VISION litmus 3).
--  Evidence: rollback-only probe docs/audit/probes/186_search_contributors_bucketed.probe.sql, 3 of 3 PASS (anon search with
--  99, 100 and 250 followers returns 0, 100 and 250, ties by name); the live function's md5 after the apply equals this file's;
--  security advisor identical to the one before (0 ERROR, 130 WARN, no new finding).
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
