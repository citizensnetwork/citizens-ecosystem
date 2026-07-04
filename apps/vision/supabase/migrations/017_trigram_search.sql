-- Phase 16: Full-text + fuzzy search via pg_trgm
--
-- Rationale:
--   The activities/projects/goals list endpoints currently support
--   `?search=foo` which expands to `ilike '%foo%'`. Without an
--   index, that's a sequential scan of the table.
--
--   pg_trgm provides GIN indexes that accelerate the existing
--   `ilike` queries (PostgREST emits `column ILIKE '%foo%'` which
--   the planner can satisfy via `gin_trgm_ops`).
--
--   No application code change is required for these to take
--   effect — the existing search filters become indexed
--   automatically. A future phase can opt into similarity ranking
--   (`%` operator + `similarity()`) for fuzzy/typo-tolerant search.
--
-- All statements are idempotent.

-- ============================================================
-- 1. Extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 2. Trigram GIN indexes — accelerate existing ILIKE filters
-- ============================================================

-- Activities: title is the primary search column. Description is
-- queried less often but indexed because the connect-import path
-- backfills long descriptions that users do search through.
CREATE INDEX IF NOT EXISTS idx_activities_title_trgm
  ON activities USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_activities_description_trgm
  ON activities USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

-- Projects: name is the canonical search column.
CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
  ON projects USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_projects_description_trgm
  ON projects USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

-- Goals: title + description.
CREATE INDEX IF NOT EXISTS idx_goals_title_trgm
  ON goals USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_goals_description_trgm
  ON goals USING gin (description gin_trgm_ops)
  WHERE description IS NOT NULL;

-- ============================================================
-- 3. Similarity-search RPC (opt-in)
-- ============================================================
-- For UIs that want fuzzy/typo-tolerant ranking instead of strict
-- substring match. Threshold 0.2 matches typical "search-as-you-type"
-- behaviour without too many false positives.
CREATE OR REPLACE FUNCTION search_activities_similar(
  p_org_id uuid,
  p_query  text,
  p_limit  int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  date date,
  type text,
  similarity_score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.title,
    a.description,
    a.date,
    a.type,
    GREATEST(
      similarity(a.title, p_query),
      similarity(COALESCE(a.description, ''), p_query)
    ) AS similarity_score
  FROM activities a
  WHERE a.org_id = p_org_id
    AND is_org_member(p_org_id)
    AND (a.title % p_query OR COALESCE(a.description, '') % p_query)
  ORDER BY similarity_score DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

REVOKE ALL ON FUNCTION search_activities_similar(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION search_activities_similar(uuid, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION search_projects_similar(
  p_org_id uuid,
  p_query  text,
  p_limit  int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  status text,
  similarity_score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.description,
    p.status,
    GREATEST(
      similarity(p.name, p_query),
      similarity(COALESCE(p.description, ''), p_query)
    ) AS similarity_score
  FROM projects p
  WHERE p.org_id = p_org_id
    AND is_org_member(p_org_id)
    AND (p.name % p_query OR COALESCE(p.description, '') % p_query)
  ORDER BY similarity_score DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

REVOKE ALL ON FUNCTION search_projects_similar(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION search_projects_similar(uuid, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION search_goals_similar(
  p_org_id uuid,
  p_query  text,
  p_limit  int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  status text,
  similarity_score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.title,
    g.description,
    g.status,
    GREATEST(
      similarity(g.title, p_query),
      similarity(COALESCE(g.description, ''), p_query)
    ) AS similarity_score
  FROM goals g
  WHERE g.org_id = p_org_id
    AND is_org_member(p_org_id)
    AND (g.title % p_query OR COALESCE(g.description, '') % p_query)
  ORDER BY similarity_score DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

REVOKE ALL ON FUNCTION search_goals_similar(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION search_goals_similar(uuid, text, int) TO authenticated;
