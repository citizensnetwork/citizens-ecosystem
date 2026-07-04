-- Migration 105: Add broadcast_sent notification type
-- Adds 'broadcast_sent' to notifications_type_check, which is used by
-- the notify-broadcast edge function when delivering FCM push notifications.
-- Supersedes the constraint set in migration 104.

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
      'broadcast_sent'
    ])
  );
