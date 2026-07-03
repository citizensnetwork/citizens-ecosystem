-- ============================================================
-- Migration 118: Lock log_search_term() to service_role only
-- ============================================================
-- Stage L hardening (RESUME_HERE §4 / DECISIONS log).
--
-- In migration 117 `log_search_term(text)` was GRANTed to anon +
-- authenticated and called from POST /api/ai-search with the caller's
-- own Supabase client. That left a direct-RPC vector: anyone could call
-- the RPC straight from an anon key in a tight loop to inflate arbitrary
-- terms and poison both the "Top searches" panel and the public
-- autocomplete feed (sanitised, but still attacker-chosen).
--
-- Fix: revoke EXECUTE from anon + authenticated and grant it only to
-- service_role. The ai-search route now invokes it through the
-- service-role admin client. Because /api/ai-search is already
-- rate-limited per-IP AND per-user, that endpoint becomes the single,
-- throttled write path into search_term_stats.
--
-- The READ side is unchanged: get_search_autocomplete stays anon+auth
-- (it only escapes + reads) and get_top_search_terms stays authenticated.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.log_search_term(text) FROM anon, authenticated;
-- PUBLIC was already revoked in 117; revoke again to be order-independent.
REVOKE EXECUTE ON FUNCTION public.log_search_term(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.log_search_term(text) TO service_role;

COMMENT ON FUNCTION public.log_search_term(text) IS
  'Stage L (hardened mig 118): sanitise + upsert-increment a search term into the anonymised rolling table. service_role only — invoked from POST /api/ai-search via the admin client, which is the single rate-limited write path.';
