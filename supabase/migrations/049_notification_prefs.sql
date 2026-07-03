-- 049_notification_prefs.sql
--
-- Per-type notification toggles. Complements the existing
-- `notification_digest` (instant/daily/off) scalar by letting users
-- switch off specific categories of notification independently of
-- frequency.
--
-- Shape (keys are stable — code treats missing keys as `true`):
--   {
--     "friends_activity":      true/false,  // new follower, friend RSVP
--     "event_reminders":       true/false,  // pre-event reminders
--     "contributor_updates":   true/false,  // event updates from organisers
--     "announcements":         true/false,  // new-event-matches-your-interest
--     "weekly_digest":         true/false   // batched daily/weekly summary
--   }
--
-- Cancellation notices are intentionally NOT toggleable — users who RSVPed
-- need to know. Rendered server-side from `notify-event-cancelled`.

alter table public.profiles
  add column if not exists notification_prefs jsonb
  not null
  default jsonb_build_object(
    'friends_activity',    true,
    'event_reminders',     true,
    'contributor_updates', true,
    'announcements',       true,
    'weekly_digest',       true
  );

-- Backfill any rows that existed before the default took effect (idempotent).
update public.profiles
set notification_prefs = jsonb_build_object(
  'friends_activity',    true,
  'event_reminders',     true,
  'contributor_updates', true,
  'announcements',       true,
  'weekly_digest',       true
)
where notification_prefs is null
   or notification_prefs = '{}'::jsonb;

-- Comment for future maintainers / introspection.
comment on column public.profiles.notification_prefs is
  'Per-type notification toggles. Missing keys default to true. Cancellations always delivered.';
