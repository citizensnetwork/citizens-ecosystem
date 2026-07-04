-- ============================================================================
-- 067 — Relocate pg_trgm to `extensions` schema
--
-- Supabase lints flag extensions installed in `public`. 066 installed pg_trgm
-- in public; this migration moves it to `extensions` (where the other
-- extensions live) and rebuilds the trigram indexes + search RPC using
-- schema-qualified operator classes / search_path.
--
-- Idempotent.
-- ============================================================================

-- Indexes must be dropped before the extension move (they reference
-- public.gin_trgm_ops).
DROP INDEX IF EXISTS public.profiles_full_name_trgm_idx;
DROP INDEX IF EXISTS public.profiles_physical_address_trgm_idx;

-- Move the extension. ALTER EXTENSION ... SET SCHEMA is idempotent only when
-- the extension actually exists in the source schema, so guard with a DO.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'pg_trgm'
       AND n.nspname = 'public'
  ) THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END$$;

-- Recreate the indexes using the relocated operator class.
CREATE INDEX IF NOT EXISTS profiles_full_name_trgm_idx
  ON public.profiles USING gin (lower(full_name) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_physical_address_trgm_idx
  ON public.profiles USING gin (lower(physical_address) extensions.gin_trgm_ops);

-- Recreate the function with search_path that includes the extensions schema
-- so `similarity()` and `%` resolve without explicit qualification.
DROP FUNCTION IF EXISTS public.search_contributors(text, text[], text, text, text, int);

-- Match scoring strategy:
--   * `extensions.word_similarity(q, name)` finds the best-matching word
--     inside the full name — robust to typos and ordering. We compare
--     against a fixed 0.30 floor in WHERE (the Batch 3 "30% mistake
--     tolerance" requirement). We can't override the cluster threshold
--     GUC `pg_trgm.word_similarity_threshold` from a SECURITY INVOKER
--     function (Supabase forbids SET on it), so we evaluate the score
--     directly instead of using the `<%` operator.
--   * ILIKE substring matching on name + bio acts as a fast complement
--     so short queries (1-2 chars) and bio mentions still surface.
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
SET search_path = public, extensions, pg_temp
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
        ELSE greatest(
          extensions.word_similarity((SELECT qn FROM norm),
                                     lower(coalesce(p.full_name, ''))),
          extensions.similarity(lower(coalesce(p.full_name, '')),
                                (SELECT qn FROM norm))
        )
      END::real AS similarity
    FROM public.profiles p
    WHERE p.role = 'contributor'
      AND p.contributor_status = 'approved'
      AND p.contributor_slug IS NOT NULL
      AND (
        (SELECT qn FROM norm) IS NULL
        OR extensions.word_similarity((SELECT qn FROM norm),
                                      lower(coalesce(p.full_name, ''))) >= 0.3
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
  'FEAT-03 fuzzy organisation search. Trigram (pg_trgm) on profiles.full_name with ILIKE fallback. Returns approved contributors only.';

REVOKE ALL ON FUNCTION public.search_contributors(text, text[], text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_contributors(text, text[], text, text, text, int) TO anon, authenticated;
