-- 098: Add event social media handles, volunteer openings, and recurring event support
--
-- Adds the following optional columns to the events table:
--   instagram_url     — Instagram profile URL or @handle for the event/organiser
--   facebook_url      — Facebook page/event URL
--   tiktok_url        — TikTok handle or video URL
--   youtube_url       — YouTube channel or video URL
--   volunteer_openings — Whether this event is looking for volunteers
--   is_recurring      — Whether this is a recurring event
--   recurring_pattern — JSONB blob: { frequency, days_of_week, end_date, count }
--
-- All columns are additive / nullable (except boolean defaults) so this
-- migration is safe to apply to existing rows and re-running is idempotent.

alter table public.events
  add column if not exists instagram_url     text,
  add column if not exists facebook_url      text,
  add column if not exists tiktok_url        text,
  add column if not exists youtube_url       text,
  add column if not exists volunteer_openings boolean not null default false,
  add column if not exists is_recurring      boolean not null default false,
  add column if not exists recurring_pattern jsonb;

-- Keep the schema.sql canonical definition in sync — schema.sql is idempotent
-- so the "add column if not exists" guards above are the real enforcement.
comment on column public.events.instagram_url is
  'Instagram page URL or handle (e.g. https://instagram.com/handle or @handle)';
comment on column public.events.facebook_url is
  'Facebook page or event URL';
comment on column public.events.tiktok_url is
  'TikTok handle or video URL';
comment on column public.events.youtube_url is
  'YouTube channel or video URL';
comment on column public.events.volunteer_openings is
  'True if this event is actively seeking volunteers';
comment on column public.events.is_recurring is
  'True if this event repeats on a schedule defined in recurring_pattern';
comment on column public.events.recurring_pattern is
  'JSON schedule descriptor: { frequency: "daily"|"weekly"|"monthly"|"yearly", days_of_week?: string[], end_date?: string, count?: number }';
