-- Migration 032: AI Search — structured discovery profile
--
-- Adds a `search_profile jsonb` column to `events` and `places` so that
-- natural-language queries (e.g. "Homecells in my area", "I need
-- counselling", "Coffee places nearby") can be resolved deterministically
-- against curated audience / needs / vibe tags.
--
-- Shape of the jsonb value (validated and sanitised by
-- `src/lib/searchProfile.ts#normaliseSearchProfile`):
--   {
--     "audience": ["youth","couples", ...],
--     "needs":    ["counselling","community", ...],
--     "vibe":     ["quiet","outdoor", ...],
--     "summary":  "Short free-text description for matching (≤500 chars)"
--   }
--
-- A companion GIN index enables fast containment queries for the future
-- RPC-based ranking (e.g. `search_profile->'needs' ? 'counselling'`).
--
-- Note on embeddings (Phase 2, not in this migration):
-- ---------------------------------------------------
-- When the `pgvector` extension and an OpenAI key are provisioned, a
-- follow-up migration can add `search_embedding vector(1536)` to the
-- same tables and a `match_events(query_embedding, match_threshold, k)`
-- RPC. The deterministic tag scoring in this migration remains the
-- fallback and is combined with embedding similarity via a weighted sum
-- in the application layer (`src/lib/aiSearch.ts`). No schema changes
-- in this file depend on pgvector.

-- ══════════════════════════════════════════════
-- 1. Add the column (idempotent)
-- ══════════════════════════════════════════════
ALTER TABLE events ADD COLUMN IF NOT EXISTS search_profile jsonb;
ALTER TABLE places ADD COLUMN IF NOT EXISTS search_profile jsonb;

COMMENT ON COLUMN events.search_profile IS
  'Curated discovery tags (audience / needs / vibe) used by the AI search engine. See src/lib/searchProfile.ts for the taxonomy.';
COMMENT ON COLUMN places.search_profile IS
  'Curated discovery tags (audience / needs / vibe) used by the AI search engine. See src/lib/searchProfile.ts for the taxonomy.';

-- ══════════════════════════════════════════════
-- 2. GIN indexes for containment queries
-- ══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS events_search_profile_gin_idx
  ON events USING GIN (search_profile jsonb_path_ops);

CREATE INDEX IF NOT EXISTS places_search_profile_gin_idx
  ON places USING GIN (search_profile jsonb_path_ops);
