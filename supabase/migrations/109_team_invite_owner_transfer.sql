-- Migration 109: Team invite accept/decline + owner-transfer proposal
-- =====================================================================
-- Implements Stage G of contributor-dashboard plan:
--   • team_memberships.status   → adds 'pending', 'declined'
--   • team_memberships.role     → adds 'owner' (proposal-only this batch)
--   • team_memberships.responded_at (timestamptz)
--   • notifications.type        → adds 'team_invite', 'team_invite_response',
--                                       'team_owner_transfer'
--   • respond_team_invite(p_membership_id, p_action) SECURITY DEFINER RPC
--   • get_public_team(p_contributor_id) SECURITY DEFINER RPC for the
--     public profile team list (only active rows, only id+name+avatar)

-- ══════════════════════════════════════════════
-- 1. team_memberships.status + role + responded_at
-- ══════════════════════════════════════════════
ALTER TABLE public.team_memberships
  DROP CONSTRAINT IF EXISTS team_memberships_status_check;

ALTER TABLE public.team_memberships
  ADD CONSTRAINT team_memberships_status_check
  CHECK (status IN ('pending', 'active', 'declined', 'removed'));

ALTER TABLE public.team_memberships
  DROP CONSTRAINT IF EXISTS team_memberships_role_check;

ALTER TABLE public.team_memberships
  ADD CONSTRAINT team_memberships_role_check
  CHECK (role IN ('owner', 'editor', 'viewer'));

ALTER TABLE public.team_memberships
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

COMMENT ON COLUMN public.team_memberships.responded_at IS
  'Timestamp of accept/decline by the invitee. NULL while status=pending.';

-- ══════════════════════════════════════════════
-- 2. notifications.type expansion
-- ══════════════════════════════════════════════
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
      'admin_on_behalf_action',
      'broadcast_sent',
      'spam_flag',
      'broadcast_flood',
      'dm_received',
      'dm_response',
      'team_invite',
      'team_invite_response',
      'team_owner_transfer',
      'volunteer_application',
      'volunteer_application_response'
    ]::text[])
  );

-- ══════════════════════════════════════════════
-- 3. respond_team_invite RPC (member-side accept/decline)
-- ══════════════════════════════════════════════
-- Called by the invited member to accept or decline a pending invite.
-- Validates: row exists, member_id = auth.uid(), status = 'pending'.
-- On accept → status='active', responded_at=now(), notify the contributor.
-- On decline → status='declined', responded_at=now(), notify the contributor.
-- Returns the new status text.
CREATE OR REPLACE FUNCTION public.respond_team_invite(
  p_membership_id uuid,
  p_action        text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contributor_id uuid;
  v_member_id      uuid;
  v_role           text;
  v_new_status     text;
  v_contributor_slug text;
  v_member_name    text;
BEGIN
  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  SELECT contributor_id, member_id, role
    INTO v_contributor_id, v_member_id, v_role
  FROM team_memberships
  WHERE id = p_membership_id
    AND status = 'pending';

  IF v_contributor_id IS NULL THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_member_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_invitee';
  END IF;

  IF p_action = 'accept' THEN
    v_new_status := 'active';
  ELSE
    v_new_status := 'declined';
  END IF;

  UPDATE team_memberships
  SET status       = v_new_status,
      responded_at = now(),
      updated_at   = now()
  WHERE id = p_membership_id;

  -- Notify the contributor of the response.
  SELECT contributor_slug INTO v_contributor_slug
  FROM profiles WHERE id = v_contributor_id;

  SELECT full_name INTO v_member_name
  FROM profiles WHERE id = v_member_id;

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_contributor_id,
    'team_invite_response',
    CASE WHEN p_action = 'accept' THEN 'Team invite accepted' ELSE 'Team invite declined' END,
    COALESCE(v_member_name, 'Someone') ||
      CASE WHEN p_action = 'accept'
           THEN ' joined your team as ' || v_role || '.'
           ELSE ' declined your team invite.' END,
    jsonb_build_object(
      'membership_id', p_membership_id,
      'member_id', v_member_id,
      'role', v_role,
      'action', p_action,
      'url', CASE WHEN v_contributor_slug IS NOT NULL
                  THEN '/c/' || v_contributor_slug || '/dashboard/team'
                  ELSE '/dashboard' END
    )
  );

  -- Append non-destructible audit entry.
  INSERT INTO activity_log
    (contributor_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_contributor_id,
    v_member_id,
    CASE WHEN p_action = 'accept' THEN 'team_invite_accepted' ELSE 'team_invite_declined' END,
    'team_membership',
    p_membership_id::text,
    jsonb_build_object('role', v_role)
  );

  RETURN v_new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_team_invite(uuid, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.respond_team_invite(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.respond_team_invite IS
  'Member-side accept/decline for a pending team invite. '
  'Validates auth.uid() = team_memberships.member_id and status=pending.';

-- ══════════════════════════════════════════════
-- 4. get_public_team RPC (avatar + name only, active members)
-- ══════════════════════════════════════════════
-- The team_memberships table is contributor-private (team_select policy).
-- For the public contributor profile we need name+avatar only for active
-- members. SECURITY DEFINER wrapper avoids opening the whole table to public
-- SELECT (which would leak invited_by, member_id, role to anyone).
CREATE OR REPLACE FUNCTION public.get_public_team(p_contributor_id uuid)
RETURNS TABLE (
  member_id uuid,
  full_name text,
  avatar_url text,
  role text
)
LANGUAGE sql SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    tm.member_id,
    p.full_name,
    p.avatar_url,
    tm.role
  FROM team_memberships tm
  JOIN profiles p ON p.id = tm.member_id
  WHERE tm.contributor_id = p_contributor_id
    AND tm.status = 'active'
  ORDER BY
    CASE tm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
    tm.created_at ASC
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_team(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_public_team(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_team IS
  'Public read of a contributor''s active team members (member id, name, '
  'avatar, role). SECURITY DEFINER so the underlying private RLS is bypassed '
  'but only the safe columns are returned.';
