-- ============================================================================
-- 066 — FEAT-03 fuzzy contributor search
--
-- Enables pg_trgm for typo-tolerant matching on contributor profiles and
-- adds a SECURITY INVOKER RPC that the Organisations search panel uses.
--
-- Citizens search by free text (name / bio), kind, location text and event
-- category. The RPC reads from public.profiles (RLS is "Profiles are
-- viewable by everyone" = read true) so SECURITY INVOKER is safe — RLS still
-- applies and only approved contributors with a slug are returned.
--
-- pg_trgm's default similarity threshold is 0.30 (~70% match). That is the
-- "30% mistake tolerance" requested in the Batch 3 brief. The `%` operator
-- uses the GIN index `profiles_full_name_trgm_idx` for speed; we also keep
-- an ILIKE fallback so very short queries (≤3 chars) still surface results.
--
-- Idempotent.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS profiles_full_name_trgm_idx
  ON public.profiles USING gin (lower(full_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_physical_address_trgm_idx
  ON public.profiles USING gin (lower(physical_address) gin_trgm_ops);

-- Drop any prior signature so re-runs do not stack overloads.
DROP FUNCTION IF EXISTS public.search_contributors(text, text[], text, text, text, int);

CREATE OR REPLACE FUNCTION public.search_contributors(
  q              text     DEFAULT '',
  kinds          text[]   DEFAULT NULL,
  location_query text     DEFAULT NULL,
  category_slug  text     DEFAULT NULL,
  sort_by        text     DEFAULT 'auto',
  result_limit   int      DEFAULT 25
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
SET search_path = public, pg_temp
AS $$
  WITH norm AS (
    SELECT
      nullif(lower(coalesce(q, '')), '')                  AS qn,
      nullif(lower(coalesce(location_query, '')), '')     AS locn
  ), base AS (
    SELECT
      p.id,
      p.full_name,
      p.contributor_slug,
      p.contributor_kind,
      p.logo_url,
      p.avatar_url,
      p.physical_address,
      p.bio,
      (SELECT count(*)::bigint
         FROM public.follows f
        WHERE f.followee_id = p.id) AS followers_count,
      CASE
        WHEN (SELECT qn FROM norm) IS NULL THEN 0
        ELSE similarity(lower(coalesce(p.full_name, '')),
                        (SELECT qn FROM norm))
      END::real AS similarity
    FROM public.profiles p
    WHERE p.role = 'contributor'
      AND p.contributor_status = 'approved'
      AND p.contributor_slug IS NOT NULL
      AND (
        (SELECT qn FROM norm) IS NULL
        OR lower(p.full_name) % (SELECT qn FROM norm)
        OR lower(coalesce(p.full_name, '')) ILIKE '%' || (SELECT qn FROM norm) || '%'
        OR lower(coalesce(p.bio, ''))       ILIKE '%' || (SELECT qn FROM norm) || '%'
      )
      AND (kinds IS NULL OR p.contributor_kind = ANY(kinds))
      AND (
        (SELECT locn FROM norm) IS NULL
        OR lower(coalesce(p.physical_address, '')) ILIKE '%' || (SELECT locn FROM norm) || '%'
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
        OR (sort_by = 'auto' AND (SELECT qn FROM norm) IS NOT NULL)
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
  'FEAT-03 fuzzy organisation search. Trigram (pg_trgm) on profiles.full_name with ILIKE fallback on name + bio + physical_address. Returns approved contributors only.';

REVOKE ALL ON FUNCTION public.search_contributors(text, text[], text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_contributors(text, text[], text, text, text, int) TO anon, authenticated;
