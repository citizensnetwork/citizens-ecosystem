/**
 * Citizens Connect — AI Search embeddings (Phase 2 stub)
 * ------------------------------------------------------
 * Placeholder module for the future paid-embedding escalation path. All
 * public functions are currently no-ops that return `null`, so the rest
 * of the AI-search pipeline happily ignores them today. They exist so
 * that:
 *
 *   1. The call sites that will eventually blend cosine similarity with
 *      the deterministic score in `aiSearch.ts` can be written *now*
 *      without conditional imports (everything is centralised here).
 *   2. The moment `pg_vector` is enabled in Supabase and an
 *      `OPENAI_API_KEY` env var is provisioned, Phase 2 only requires:
 *        - A new migration adding `search_embedding vector(1536)` columns
 *          and a `match_events / match_places(query, k)` RPC.
 *        - Filling in `maybeEmbedQuery()` / `maybeEmbedDoc()` below with
 *          a fetch to `https://api.openai.com/v1/embeddings`.
 *        - Adding a simple weighted-sum branch in `rankResults` that
 *          blends the cosine similarity with the current deterministic
 *          score (e.g. `final = 0.6 * semantic + 0.4 * deterministic`).
 *   3. Cost remains zero until funding is available.
 *
 * The module is intentionally server-only (no "use client") so that any
 * future network / API-key usage can never leak to the browser bundle.
 */

/** Opaque embedding type — a unit-norm float vector. */
export type Embedding = Float32Array;

/**
 * Returns `true` when all prerequisites are in place for Phase 2 at
 * runtime: pgvector + an `OPENAI_API_KEY`. Today this is always `false`.
 */
export function isEmbeddingEnabled(): boolean {
  return (
    process.env.CC_ENABLE_EMBEDDINGS === "1" &&
    typeof process.env.OPENAI_API_KEY === "string" &&
    process.env.OPENAI_API_KEY.length > 0
  );
}

/**
 * Embed a user query into a vector, or return `null` when Phase 2 is
 * disabled (the default).
 */
export async function maybeEmbedQuery(_query: string): Promise<Embedding | null> {
  void _query;
  if (!isEmbeddingEnabled()) return null;
  // Intentionally not implemented yet — gated on funding. See file header.
  return null;
}

/**
 * Embed a document (event / place) for indexing, or return `null` when
 * Phase 2 is disabled.
 */
export async function maybeEmbedDoc(_text: string): Promise<Embedding | null> {
  void _text;
  if (!isEmbeddingEnabled()) return null;
  return null;
}

/**
 * Cosine similarity between two equally-sized unit-norm embeddings.
 * Implemented so that unit tests can cover the blend path without a
 * network call once Phase 2 lands.
 */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return Math.max(-1, Math.min(1, dot));
}
