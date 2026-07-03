-- Phase 10: Smart Notifications + Calendar Sync
-- push_tokens, notifications, notification_digest on profiles

-- ─── Push Tokens ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at  timestamptz DEFAULT now(),

  UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read/manage their own tokens
CREATE POLICY "Users read own push tokens"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own push tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own push tokens"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Notifications (in-app inbox) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN (
                    'event_reminder',
                    'new_event_match',
                    'event_cancelled',
                    'new_follower',
                    'event_update'
                  )),
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  image_url       text,
  data            jsonb DEFAULT '{}'::jsonb,
  read            boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own notifications
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role inserts notifications (RLS doesn't apply to service role)
-- But allow admin role to insert as well
CREATE POLICY "Admin insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (is_admin());

-- Users can delete their own notifications
CREATE POLICY "Users delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Profile: notification_digest preference ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notification_digest'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN notification_digest text DEFAULT 'instant'
        CHECK (notification_digest IN ('instant', 'daily', 'off'));
  END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens (user_id);
