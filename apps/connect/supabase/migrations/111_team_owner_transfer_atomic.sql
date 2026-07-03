-- ============================================================
-- Migration 111: Stage G.2 — Atomic owner transfer + self-owner bootstrap
-- ============================================================
-- Replaces the notification-only owner-transfer proposal shipped in 109
-- with a fully atomic state-machine:
--
--   1. team_owner_transfers       — proposal row, one pending per contributor
--   2. backfill                   — every approved contributor gets a
--                                   self-owner team_memberships row so
--                                   checkDashboardAccess can switch its
--                                   `isOwner` source from `user.id === contributor.id`
--                                   to the team_memberships table.
--   3. ensure_self_owner trigger  — keeps the self-owner row in sync when a
--                                   profile transitions to contributor_status='approved'.
--   4. propose_team_owner_transfer(p_contributor_id, p_proposed_owner_id)
--                                  SECURITY DEFINER RPC — replaces the
--                                  notification-only API path.
--   5. respond_team_owner_transfer(p_transfer_id, p_action)
--                                  SECURITY DEFINER RPC — atomic accept/decline.
--                                  On accept: demote prior owner → editor, promote
--                                  acceptor → owner, mark transfer accepted,
--                                  notify both parties, audit-log.
--
-- Notifications type CHECK already includes 'team_owner_transfer' (109)
-- and 'team_invite_response' is reused for the post-accept ping.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. team_owner_transfers table
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.team_owner_transfers (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_owner_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_by        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  responded_at       timestamptz,
  CHECK (proposed_owner_id <> contributor_id)
);

-- Only one pending transfer per contributor — collapses concurrent proposals into 409.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_owner_transfers_one_pending
  ON public.team_owner_transfers (contributor_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_team_owner_transfers_proposed
  ON public.team_owner_transfers (proposed_owner_id, status, created_at DESC);

ALTER TABLE public.team_owner_transfers ENABLE ROW LEVEL SECURITY;

-- The contributor (current owner), the proposed transferee, and admins can read.
-- Guarded so the migration is safely re-runnable.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'team_owner_transfers' AND policyname = 'team_owner_transfers_select'
  ) THEN
    CREATE POLICY "team_owner_transfers_select" ON public.team_owner_transfers
      FOR SELECT USING (
        auth.uid() = contributor_id
        OR auth.uid() = proposed_owner_id
        OR auth.uid() = proposed_by
        OR public.is_admin()
      );
  END IF;
END $$;

-- No direct INSERT / UPDATE policies — all writes flow through the RPCs below.

COMMENT ON TABLE public.team_owner_transfers IS
  'Stage G.2: pending owner-transfer proposals. One pending row per contributor enforced by partial unique index.';

-- ════════════════════════════════════════════════════════════
-- 2. Backfill self-owner rows for every approved contributor
-- ════════════════════════════════════════════════════════════
-- Each approved contributor profile gets a self-owner team_membership row
-- (member_id = contributor_id, role='owner', status='active') so that
-- checkDashboardAccess can switch from `user.id === contributor.id` to
-- a single source of truth in team_memberships.
INSERT INTO public.team_memberships
  (contributor_id, member_id, role, status, invited_by, created_at, updated_at)
SELECT
  p.id, p.id, 'owner', 'active', p.id, now(), now()
FROM public.profiles p
WHERE p.role = 'contributor'
  AND p.contributor_status = 'approved'
ON CONFLICT (contributor_id, member_id)
DO UPDATE SET
  role       = 'owner',
  status     = 'active',
  updated_at = now()
WHERE team_memberships.role <> 'owner'
   OR team_memberships.status <> 'active';

-- ════════════════════════════════════════════════════════════
-- 3. Trigger: keep self-owner row in sync on approval transitions
-- ════════════════════════════════════════════════════════════
-- Fires only when contributor_status transitions to 'approved'. Inserts or
-- restores the self-owner row. SECURITY DEFINER avoids the trigger inheriting
-- the caller's RLS, which would block writes during the admin approval path.
CREATE OR REPLACE FUNCTION public.ensure_contributor_self_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_owner_exists boolean;
BEGIN
  IF NEW.contributor_status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.contributor_status IS DISTINCT FROM 'approved')
  THEN
    -- If ownership has been transferred to another user, leave it alone.
    -- Without this guard, re-approval of a contributor whose owner is someone
    -- else would silently revive a self-owner row, producing two active owners.
    SELECT EXISTS (
      SELECT 1 FROM team_memberships
      WHERE contributor_id = NEW.id
        AND member_id     <> NEW.id
        AND role           = 'owner'
        AND status         = 'active'
    ) INTO v_other_owner_exists;

    IF v_other_owner_exists THEN
      RETURN NEW;
    END IF;

    INSERT INTO team_memberships
      (contributor_id, member_id, role, status, invited_by)
    VALUES
      (NEW.id, NEW.id, 'owner', 'active', NEW.id)
    ON CONFLICT (contributor_id, member_id)
    DO UPDATE SET
      role       = 'owner',
      status     = 'active',
      updated_at = now()
    WHERE team_memberships.role <> 'owner'
       OR team_memberships.status <> 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_contributor_self_owner ON public.profiles;
CREATE TRIGGER trg_ensure_contributor_self_owner
  AFTER INSERT OR UPDATE OF contributor_status, role
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_contributor_self_owner();

COMMENT ON FUNCTION public.ensure_contributor_self_owner IS
  'Stage G.2: auto-inserts a self-owner team_memberships row when a profile transitions to contributor_status=approved. Idempotent.';

-- ════════════════════════════════════════════════════════════
-- 4. propose_team_owner_transfer RPC
-- ════════════════════════════════════════════════════════════
-- Caller must be the current owner of the contributor (per team_memberships).
-- Proposed transferee must be an active team member with role <> owner.
-- Replaces any existing pending transfer for this contributor (cancel then
-- insert) so a current owner can re-propose to a different member without
-- hitting the partial unique index.
CREATE OR REPLACE FUNCTION public.propose_team_owner_transfer(
  p_contributor_id     uuid,
  p_proposed_owner_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_is_owner       boolean;
  v_member_active  boolean;
  v_transfer_id    uuid;
  v_contributor_slug text;
  v_owner_name     text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_proposed_owner_id = p_contributor_id THEN
    RAISE EXCEPTION 'invalid_proposal';
  END IF;

  -- Caller must be the active owner of this contributor.
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE contributor_id = p_contributor_id
      AND member_id      = v_caller
      AND role           = 'owner'
      AND status         = 'active'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  -- Transferee must already be on the team as an active editor or viewer.
  SELECT EXISTS (
    SELECT 1 FROM team_memberships
    WHERE contributor_id = p_contributor_id
      AND member_id      = p_proposed_owner_id
      AND status         = 'active'
      AND role           <> 'owner'
  ) INTO v_member_active;

  IF NOT v_member_active THEN
    RAISE EXCEPTION 'proposed_owner_not_active_member';
  END IF;

  -- Cancel any other pending transfer for this contributor.
  UPDATE team_owner_transfers
  SET status       = 'cancelled',
      responded_at = now()
  WHERE contributor_id = p_contributor_id
    AND status         = 'pending';

  INSERT INTO team_owner_transfers
    (contributor_id, proposed_owner_id, proposed_by, status)
  VALUES
    (p_contributor_id, p_proposed_owner_id, v_caller, 'pending')
  RETURNING id INTO v_transfer_id;

  -- Notify the proposed owner.
  SELECT contributor_slug INTO v_contributor_slug FROM profiles WHERE id = p_contributor_id;
  SELECT full_name        INTO v_owner_name       FROM profiles WHERE id = v_caller;

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    p_proposed_owner_id,
    'team_owner_transfer',
    'Ownership transfer proposed',
    COALESCE(v_owner_name, 'The owner') || ' has proposed transferring ownership to you.',
    jsonb_build_object(
      'transfer_id',       v_transfer_id,
      'contributor_id',    p_contributor_id,
      'contributor_handle', v_contributor_slug,
      'url',               '/account/team-invites'
    )
  );

  -- Non-destructible audit entry.
  INSERT INTO activity_log
    (contributor_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_contributor_id,
    v_caller,
    'team_owner_transfer_proposed',
    'team_owner_transfer',
    v_transfer_id::text,
    jsonb_build_object('proposed_owner_id', p_proposed_owner_id)
  );

  RETURN v_transfer_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.propose_team_owner_transfer(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.propose_team_owner_transfer(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.propose_team_owner_transfer IS
  'Stage G.2: current-owner-initiated proposal. One pending per contributor (re-proposal cancels prior).';

-- ════════════════════════════════════════════════════════════
-- 5. respond_team_owner_transfer RPC — atomic accept/decline
-- ════════════════════════════════════════════════════════════
-- Called by the proposed transferee. On accept, demotes the prior owner to
-- 'editor' and promotes the acceptor to 'owner' inside a single function
-- body (atomic). Sends notifications to both parties + an activity_log row.
CREATE OR REPLACE FUNCTION public.respond_team_owner_transfer(
  p_transfer_id uuid,
  p_action      text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller            uuid := auth.uid();
  v_contributor_id    uuid;
  v_proposed_owner_id uuid;
  v_proposer_id       uuid;
  v_status            text;
  v_new_status        text;
  v_prior_owner_id    uuid;
  v_acceptor_name     text;
  v_contributor_slug  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  SELECT contributor_id, proposed_owner_id, proposed_by, status
    INTO v_contributor_id, v_proposed_owner_id, v_proposer_id, v_status
  FROM team_owner_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF v_contributor_id IS NULL THEN
    RAISE EXCEPTION 'transfer_not_found';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'transfer_already_resolved';
  END IF;

  IF v_proposed_owner_id <> v_caller THEN
    RAISE EXCEPTION 'not_proposed_owner';
  END IF;

  IF p_action = 'decline' THEN
    UPDATE team_owner_transfers
    SET status       = 'declined',
        responded_at = now()
    WHERE id = p_transfer_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      v_proposer_id,
      'team_invite_response',
      'Ownership transfer declined',
      'The proposed owner declined the transfer.',
      jsonb_build_object(
        'transfer_id',    p_transfer_id,
        'contributor_id', v_contributor_id,
        'action',         'decline'
      )
    );

    INSERT INTO activity_log
      (contributor_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_contributor_id,
      v_caller,
      'team_owner_transfer_declined',
      'team_owner_transfer',
      p_transfer_id::text,
      jsonb_build_object('proposed_owner_id', v_proposed_owner_id)
    );

    RETURN 'declined';
  END IF;

  -- ── accept path ─────────────────────────────────────────────
  -- Find the current active owner. Demote them to editor.
  SELECT member_id INTO v_prior_owner_id
  FROM team_memberships
  WHERE contributor_id = v_contributor_id
    AND role           = 'owner'
    AND status         = 'active'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_prior_owner_id IS NULL THEN
    -- Defensive: no current owner row found. Refuse rather than silently
    -- promoting in an inconsistent state.
    RAISE EXCEPTION 'no_current_owner';
  END IF;

  -- Demote prior owner to editor (kept on team per Stage G.2 decision).
  UPDATE team_memberships
  SET role       = 'editor',
      updated_at = now()
  WHERE contributor_id = v_contributor_id
    AND member_id      = v_prior_owner_id
    AND role           = 'owner'
    AND status         = 'active';

  -- Promote acceptor to owner. They are an existing active member (validated
  -- at proposal time) so update in place.
  UPDATE team_memberships
  SET role         = 'owner',
      responded_at = now(),
      updated_at   = now()
  WHERE contributor_id = v_contributor_id
    AND member_id      = v_caller
    AND status         = 'active';

  UPDATE team_owner_transfers
  SET status       = 'accepted',
      responded_at = now()
  WHERE id = p_transfer_id;

  -- Notify proposer (now the prior owner / editor).
  SELECT full_name        INTO v_acceptor_name    FROM profiles WHERE id = v_caller;
  SELECT contributor_slug INTO v_contributor_slug FROM profiles WHERE id = v_contributor_id;

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_proposer_id,
    'team_invite_response',
    'Ownership transferred',
    COALESCE(v_acceptor_name, 'The proposed owner') || ' accepted ownership. You are now an editor.',
    jsonb_build_object(
      'transfer_id',       p_transfer_id,
      'contributor_id',    v_contributor_id,
      'contributor_handle', v_contributor_slug,
      'action',            'accept',
      'url',               CASE WHEN v_contributor_slug IS NOT NULL
                                THEN '/c/' || v_contributor_slug || '/dashboard/team'
                                ELSE '/dashboard' END
    )
  );

  -- Confirmation notification to the new owner.
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_caller,
    'team_invite_response',
    'You are now the owner',
    'You accepted ownership. You now have full owner access.',
    jsonb_build_object(
      'transfer_id',       p_transfer_id,
      'contributor_id',    v_contributor_id,
      'contributor_handle', v_contributor_slug,
      'url',               CASE WHEN v_contributor_slug IS NOT NULL
                                THEN '/c/' || v_contributor_slug || '/dashboard'
                                ELSE '/dashboard' END
    )
  );

  -- Audit log.
  INSERT INTO activity_log
    (contributor_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_contributor_id,
    v_caller,
    'team_owner_transfer_accepted',
    'team_owner_transfer',
    p_transfer_id::text,
    jsonb_build_object(
      'prior_owner_id', v_prior_owner_id,
      'new_owner_id',   v_caller
    )
  );

  RETURN 'accepted';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_team_owner_transfer(uuid, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.respond_team_owner_transfer(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.respond_team_owner_transfer IS
  'Stage G.2: proposed-owner accept/decline. On accept, atomically demotes prior owner to editor and promotes acceptor to owner.';
