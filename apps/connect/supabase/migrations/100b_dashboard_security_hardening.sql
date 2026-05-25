-- ============================================================
-- Migration 100b: Dashboard security hardening
-- Follow-up to migration 100. Tightens suggestions_insert policy
-- and revokes EXECUTE on cron/internal SECURITY DEFINER functions.
-- ============================================================

DROP POLICY IF EXISTS "suggestions_insert" ON public.suggestions;
CREATE POLICY "suggestions_insert" ON public.suggestions
  FOR INSERT WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

REVOKE EXECUTE ON FUNCTION public.purge_old_activity_logs() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.purge_old_analytics() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_max_dashboard_sessions(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.increment_contributor_metric(uuid, text, uuid, text, bigint) FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.approve_dashboard_access(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.deny_dashboard_access(uuid, text) FROM anon, public;
