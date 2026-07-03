-- 104_dashboard_admin_attribution.sql
-- Stage A (contributor dashboard) — viewing indicator + admin action attribution.
--
-- 1. Adds contributor_access_requests.viewing_started_at — set when an admin
--    first opens the dashboard. Powers the Realtime "admin viewing now" banner.
-- 2. Adds activity_log.actor_role — distinguishes contributor-initiated vs
--    admin-on-behalf-of actions for downstream audit + Citizens Vision pulls.
-- 3. Widens notifications_type_check to include 'admin_on_behalf_action'.
-- 4. Adds mark_admin_viewing_started(p_request_id) — idempotent SECURITY DEFINER
--    RPC so the dashboard layout can stamp the timestamp on first load.
--
-- Safe to re-run (idempotent).

-- ── 1. viewing_started_at ────────────────────────────────────
ALTER TABLE public.contributor_access_requests
  ADD COLUMN IF NOT EXISTS viewing_started_at timestamptz;

COMMENT ON COLUMN public.contributor_access_requests.viewing_started_at IS
  'Set when the admin first opens the contributor dashboard. Drives the Realtime "admin viewing now" indicator for the contributor.';

-- ── 2. actor_role on activity_log ────────────────────────────
ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS actor_role text
    CHECK (actor_role IS NULL OR actor_role IN ('contributor', 'admin', 'system'));

COMMENT ON COLUMN public.activity_log.actor_role IS
  'Role of the actor performing the action. "admin" indicates an on-behalf-of action by a platform admin with an active access grant.';

CREATE INDEX IF NOT EXISTS idx_activity_log_admin_actions
  ON public.activity_log (contributor_id, created_at DESC)
  WHERE actor_role = 'admin';

-- ── 3. Widen notifications_type_check ────────────────────────
-- Supersedes the constraint set in migration 099. Adds 'admin_on_behalf_action'.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'event_reminder',
      'new_event_match',
      'event_cancelled',
      'new_follower',
      'event_update',
      'new_message',
      'review_prompt',
      'admin_elevation_request',
      'friend_convince',
      'friend_attending',
      'contributor_approved',
      'contributor_rejected',
      'contributor_type_change_request',
      'admin_on_behalf_action'
    ])
  );

-- ── 4. RPC: mark_admin_viewing_started ───────────────────────
-- Idempotent — only sets viewing_started_at if currently null AND the caller
-- is the admin attached to a still-active, non-revoked, non-expired grant.

CREATE OR REPLACE FUNCTION public.mark_admin_viewing_started(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE contributor_access_requests
  SET viewing_started_at = COALESCE(viewing_started_at, now())
  WHERE id = p_request_id
    AND admin_id = auth.uid()
    AND status = 'approved'
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
END;
$$;

REVOKE ALL ON FUNCTION public.mark_admin_viewing_started(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_admin_viewing_started(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_admin_viewing_started(uuid) IS
  'Stamp viewing_started_at on an active access request. Idempotent. Only the granted admin may call. Used by the dashboard layout.';
