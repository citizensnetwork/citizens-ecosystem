-- ============================================
-- Migration 014: Direct Messages
-- Phase 11 — In-app Direct Messaging
-- ============================================

-- ══════════════════════════════════════════════
-- 1. Conversations
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════
-- 2. Conversation Participants (many-to-many)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  last_read_at timestamptz DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_conv_participants_user
  ON public.conversation_participants(user_id);

-- ══════════════════════════════════════════════
-- 3. Messages
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_id);

-- ══════════════════════════════════════════════
-- 4. RLS Policies — Conversations
-- ══════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants can view conversations' AND tablename = 'conversations') THEN
    CREATE POLICY "Participants can view conversations" ON public.conversations
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.conversation_participants
          WHERE conversation_id = conversations.id AND user_id = auth.uid()
        )
        OR public.is_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can create conversations' AND tablename = 'conversations') THEN
    CREATE POLICY "Authenticated users can create conversations" ON public.conversations
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ══════════════════════════════════════════════
-- 5. RLS Policies — Conversation Participants
-- ══════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see participants of their conversations' AND tablename = 'conversation_participants') THEN
    CREATE POLICY "Users see participants of their conversations" ON public.conversation_participants
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id = conversation_participants.conversation_id
            AND cp.user_id = auth.uid()
        )
        OR public.is_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can add participants' AND tablename = 'conversation_participants') THEN
    CREATE POLICY "Authenticated users can add participants" ON public.conversation_participants
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants can update own read status' AND tablename = 'conversation_participants') THEN
    CREATE POLICY "Participants can update own read status" ON public.conversation_participants
      FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;

-- ══════════════════════════════════════════════
-- 6. RLS Policies — Messages
-- ══════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants can view messages' AND tablename = 'messages') THEN
    CREATE POLICY "Participants can view messages" ON public.messages
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.conversation_participants
          WHERE conversation_id = messages.conversation_id
            AND user_id = auth.uid()
        )
        OR public.is_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants can send messages' AND tablename = 'messages') THEN
    CREATE POLICY "Participants can send messages" ON public.messages
      FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.conversation_participants
          WHERE conversation_id = messages.conversation_id
            AND user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ══════════════════════════════════════════════
-- 7. Helper: find existing conversation between two users
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.find_conversation(user_a uuid, user_b uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT cp1.conversation_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = user_a AND cp2.user_id = user_b
  LIMIT 1;
$$;

-- ══════════════════════════════════════════════
-- 8. Trigger: update conversation.updated_at on new message
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_sent ON public.messages;
CREATE TRIGGER on_message_sent
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_timestamp();
