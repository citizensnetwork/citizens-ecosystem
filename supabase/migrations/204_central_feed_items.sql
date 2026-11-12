-- ════════════════════════════════════════════════════════════════════
--  204_central_feed_items
--
--  DRAFT. NOT APPLIED, AND NEVER EXECUTED ANYWHERE. Same rules as 203:
--  the founder applies it only after an explicit yes naming this file,
--  with a pre-apply git tag and an advisor check, after a rolled-back
--  probe of 203 to 205 together. Needs 203.
--
--  WHAT IT ADDS
--   * central.feed_items   the normalised feed item every app publishes
--     (docs/central/CENTRAL_FEED_GUIDE.md section 3). The column checks
--     mirror the TypeScript validator (packages/central/src/contract.ts)
--     so the database refuses what the validator refuses.
--   * central.publish_log  one row per app and day: the write counter the
--     daily quota is checked against.
--
--  PRIVACY BY TYPE
--   geo_lat numeric(5,2) and geo_lng numeric(6,2) round to 2 decimals
--   (about 1.1 km) on write, so a precise position cannot be stored. Only
--   public venues are published at all. Nothing about a viewer is stored
--   in this schema: there is no column for a person.
--
--  There is deliberately NO column for counts, likes, views or popularity
--  (guardrail G4).
--
--  SECURITY
--   RLS enabled, no policy; everything revoked from anon, authenticated
--   and public; service_role only. Written only by
--   public.central_publish_items / central_remove_items (migration 205).
--
--  ROLLBACK
--    drop table central.publish_log;
--    drop table central.feed_items;
-- ════════════════════════════════════════════════════════════════════

create table central.feed_items (
  id           bigint generated always as identity primary key,
  app_slug     text not null,
  kind         text not null,
  source_id    text not null check (
                 char_length(source_id) between 1 and 80
                 and source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
               ),
  title        text not null check (char_length(title) between 1 and 120),
  kicker       text not null check (char_length(kicker) between 1 and 60),
  summary      text check (char_length(summary) between 1 and 140),
  image_url    text check (char_length(image_url) <= 500 and image_url ~ '^https://'),
  image_alt    text check (char_length(image_alt) <= 160),
  icon         text check (icon ~ '^[a-z][a-z0-9-]{1,30}$'),
  list         jsonb check (
                 list is null
                 or (jsonb_typeof(list) = 'array' and jsonb_array_length(list) between 1 and 5)
               ),
  shape        text not null check (shape in ('square', 'landscape')),
  place_label  text check (char_length(place_label) between 1 and 60),
  geo_lat      numeric(5, 2) check (geo_lat between -90 and 90),
  geo_lng      numeric(6, 2) check (geo_lng between -180 and 180),
  region       text check (char_length(region) between 1 and 40),
  starts_at    timestamptz,
  ends_at      timestamptz,
  href         text not null check (
                 char_length(href) <= 500
                 and (href ~ '^https://' or href ~ '^/citizens/')
               ),
  visibility   text not null check (visibility = 'public'),
  payload      jsonb check (payload is null or pg_column_size(payload) <= 4096),
  status       text not null default 'live' check (status in ('live', 'hidden', 'removed')),
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days'),
  constraint feed_items_source_key unique (app_slug, kind, source_id),
  constraint feed_items_kind_fkey foreign key (app_slug, kind)
    references central.app_kinds (app_slug, kind) on delete cascade,
  constraint feed_items_geo_pair check ((geo_lat is null) = (geo_lng is null)),
  constraint feed_items_place_pair check ((geo_lat is null) = (place_label is null)),
  constraint feed_items_window check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

-- Candidates near a cell, and by time window. Both only over live rows.
create index feed_items_live_geo_idx on central.feed_items (geo_lat, geo_lng)
  where status = 'live';
create index feed_items_live_starts_idx on central.feed_items (starts_at)
  where status = 'live';
-- The foreign key to app_kinds and the per-app sync both look rows up by app.
create index feed_items_app_updated_idx on central.feed_items (app_slug, kind, updated_at);

create table central.publish_log (
  app_slug text not null references central.apps (slug) on delete cascade,
  day      date not null,
  writes   integer not null default 0 check (writes >= 0),
  primary key (app_slug, day)
);

alter table central.feed_items  enable row level security;
alter table central.publish_log enable row level security;

revoke all on central.feed_items, central.publish_log from public, anon, authenticated;
grant select, insert, update, delete on central.feed_items, central.publish_log to service_role;
