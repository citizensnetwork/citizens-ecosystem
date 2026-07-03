-- Migration 107: Messaging permission model, blocks, handles, discovery
-- =====================================================================
-- Implements the full product model from docs/feature-clarity/messaging.md:
--   • conversations.status       (pending | active | rejected)
--   • user_blocks table          (bilateral block between any two users)
--   • conversation_participants.muted_at
--   • messages.deleted_at        (soft-delete display for deleted accounts)
--   • profiles.handle            (@handle for citizen discovery)
--   • profiles.discoverable      (opt-in "People attending" on event pages)
--   • profiles.muted_source_ids  (jsonb array of muted broadcast sources)
--   • profiles.deleted_at        (soft-delete timestamp for account removal)
--   • Extend reports.target_type → adds 'conversation'
--   • Extend notifications type constraint → adds spam_flag, broadcast_flood,
--     dm_received, dm_response
--   • is_blocked() helper function
--   • pg_cron: 60-day (30-day for deleted accounts) message auto-purge

-- ══════════════════════════════════════════════
-- 1. conversations.status
-- ══════════════════════════════════════════════
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'rejected'));

COMMENT ON COLUMN public.conversations.status IS
  'pending = message request awaiting recipient approval; '
  'active = open thread; rejected = recipient denied the request.';

-- ══════════════════════════════════════════════
-- 2. user_blocks
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_no_self_block CHECK (blocker_id != blocked_id),
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker
  ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
  ON public.user_blocks(blocked_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_blocks' AND policyname = 'users_see_own_blocks'
  ) THEN
    CREATE POLICY users_see_own_blocks
      ON public.user_blocks FOR SELECT
      USING (auth.uid() = blocker_id OR public.is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_blocks' AND policyname = 'users_insert_own_blocks'
  ) THEN
    CREATE POLICY users_insert_own_blocks
      ON public.user_blocks FOR INSERT
      WITH CHECK (auth.uid() = blocker_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_blocks' AND policyname = 'users_delete_own_blocks'
  ) THEN
    CREATE POLICY users_delete_own_blocks
      ON public.user_blocks FOR DELETE
      USING (auth.uid() = blocker_id);
  END IF;
END $$;

COMMENT ON TABLE public.user_blocks IS
  'Bilateral block between any two users. Blocks are one-directional in storage '
  'but enforced bilaterally by is_blocked() so neither party can message the other.';

-- ══════════════════════════════════════════════
-- 3. conversation_participants.muted_at
-- ══════════════════════════════════════════════
ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS muted_at timestamptz;

COMMENT ON COLUMN public.conversation_participants.muted_at IS
  'Non-null when this participant has muted the conversation. '
  'Push notifications for this thread are suppressed while muted.';

-- ══════════════════════════════════════════════
-- 4. messages.deleted_at
-- ══════════════════════════════════════════════
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.messages.deleted_at IS
  'Set when the sender account is deleted. Message body is retained '
  'for 30 days; UI renders sender name with strikethrough until purge.';

-- ══════════════════════════════════════════════
-- 5. profiles: @handle, discoverable, muted_source_ids, deleted_at
-- ══════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handle text
    CHECK (
      handle IS NULL OR (
        char_length(handle) BETWEEN 3 AND 30
        AND handle ~ '^[a-z0-9_]+$'
      )
    );

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS muted_source_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial unique index: handle must be unique among non-null values
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_handle
  ON public.profiles(handle) WHERE handle IS NOT NULL;

COMMENT ON COLUMN public.profiles.handle IS
  'Citizen-set short username (lowercase alphanumeric + underscores, 3–30 chars). '
  'Resolves as /profile/@handle in the app URL.';
COMMENT ON COLUMN public.profiles.discoverable IS
  'When true, user appears in the "People attending" section on event pages '
  'for other authenticated RSVPers of the same event.';
COMMENT ON COLUMN public.profiles.muted_source_ids IS
  'jsonb array of muted broadcast sources. Each entry: {"type":"event"|"place"|"org","id":"<uuid>"}.';
COMMENT ON COLUMN public.profiles.deleted_at IS
  'Soft-delete timestamp. Profile is retained for display purposes '
  '(sender names shown strikethrough) until message retention purge completes.';

-- ══════════════════════════════════════════════
-- 6. Extend reports.target_type → add 'conversation'
-- ══════════════════════════════════════════════
-- Drop the old named constraint (migration 047 used reports_target_type_check
-- but the actual constraint name in some envs may be different — use IF EXISTS).
DO $$ BEGIN
  -- Find and drop any check constraint on reports.target_type
  DECLARE
    v_constraint text;
  BEGIN
    SELECT conname INTO v_constraint
    FROM pg_constraint
    WHERE conrelid = 'public.reports'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%target_type%'
    LIMIT 1;

    IF v_constraint IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS %I', v_constraint);
    END IF;
  END;
END $$;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('event', 'user', 'place', 'comment', 'conversation'));

-- ══════════════════════════════════════════════
-- 7. Extend notifications type constraint
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
      'dm_response'
    ]::text[])
  );

-- ══════════════════════════════════════════════
-- 8. is_blocked() helper
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_blocked(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
$$;

COMMENT ON FUNCTION public.is_blocked IS
  'Returns true if either user has blocked the other. Used to gate '
  'conversation creation and message delivery in the API layer.';

-- ══════════════════════════════════════════════
-- 9b. Update find_or_create_conversation to accept status
-- ══════════════════════════════════════════════
-- Adds p_status parameter so the API layer can create pending (request)
-- conversations for contributor→citizen first contact.
CREATE OR REPLACE FUNCTION public.find_or_create_conversation(
  user_a   uuid,
  user_b   uuid,
  p_status text DEFAULT 'active'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id uuid;
BEGIN
  IF user_a = user_b THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  IF p_status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Return existing conversation (regardless of status)
  SELECT cp1.conversation_id INTO conv_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = user_a AND cp2.user_id = user_b
  LIMIT 1;

  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;

  -- Create new conversation with the specified status
  INSERT INTO public.conversations (status) VALUES (p_status) RETURNING id INTO conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (conv_id, user_a), (conv_id, user_b);

  RETURN conv_id;
END;
$$;

-- ══════════════════════════════════════════════
-- 9. pg_cron: auto-purge messages
-- ══════════════════════════════════════════════
-- Requires pg_cron extension (available on Supabase Pro — enable via dashboard).
-- Jobs are idempotent: unschedule first to allow migration re-runs cleanly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('messaging-purge-60d') WHERE TRUE;
    PERFORM cron.schedule(
      'messaging-purge-60d',
      '0 3 * * *',
      $cron$
        -- 60-day retention for active-account messages
        DELETE FROM public.messages
        WHERE created_at < now() - INTERVAL '60 days'
          AND sender_id IN (
            SELECT id FROM public.profiles WHERE deleted_at IS NULL
          );

        -- 30-day retention for messages from deleted accounts
        DELETE FROM public.messages m
        WHERE m.created_at < now() - INTERVAL '30 days'
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = m.sender_id AND p.deleted_at IS NOT NULL
          );
      $cron$
    );
  END IF;
END $$;
