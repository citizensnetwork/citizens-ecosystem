-- ════════════════════════════════════════════════════════════════════
--  203_central_schema_and_registry
--
--  DRAFT. NOT APPLIED, AND NEVER EXECUTED ANYWHERE (not on the live
--  database, not on a branch, not locally). The founder applies this
--  file only after an explicit yes in chat naming this file, with a
--  pre-apply git tag pushed first and the security advisor checked
--  afterwards (0 ERROR, no unexpected new finding). Before applying,
--  dry-run 203, 204 and 205 together in ONE rolled-back probe (a single
--  DO block that ends in RAISE EXCEPTION), as described in
--  docs/central/CENTRAL_FEED_GUIDE.md section 8. If another migration
--  takes number 203 first, renumber 203 to 205 together.
--
--  WHAT IT ADDS
--   * Schema `central` (contract R1.1: a new ecosystem app gets a new
--     schema). Not exposed through PostgREST. No end-user role has any
--     privilege in it (contract R3.2).
--   * central.apps            the app registry: one row per ecosystem app.
--   * central.app_kinds       the content kinds each app may publish.
--   * central.app_publishers  binds ONE API key to ONE app, so a key can
--                             only publish its own app's cards.
--   * Seed rows for the apps that exist or are announced.
--
--  THE SEED COPY IS PLACEHOLDER. `explanation` is public copy shown when
--  a Crown panel is tapped. The lines below are taken from text already
--  public in this repo (apps/connect/VISION.md "The ecosystem" and
--  COMING_SOON in packages/ecosystem). The founder reviews every line
--  before this is applied. Accent colours are the approved reference's.
--
--  SECURITY
--   * RLS is enabled on every table with NO policy: nothing but
--     service_role (which bypasses RLS) can read or write.
--   * All privileges are revoked from anon, authenticated and public on
--     the schema and on each table, then granted to service_role only.
--   * No cross-schema foreign key (contract section 8): api_key_id is a
--     value reference to public.api_keys.id, checked in code.
--
--  ROLLBACK
--    drop schema central cascade;
--  (after first dropping the public.central_* functions of 205, if applied)
-- ════════════════════════════════════════════════════════════════════

create schema central;

revoke all on schema central from public, anon, authenticated;
grant usage on schema central to service_role;

create table central.apps (
  slug             text primary key check (slug ~ '^[a-z][a-z0-9-]{1,30}$'),
  name             text not null check (char_length(name) between 1 and 40),
  label            text not null check (char_length(label) between 1 and 60),
  accent           text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  icon             text not null check (icon ~ '^[a-z][a-z0-9-]{1,30}$'),
  explanation      text not null check (char_length(explanation) between 1 and 600),
  visit_url        text not null check (
                     char_length(visit_url) <= 500
                     and (visit_url ~ '^https://' or visit_url ~ '^/citizens/')
                   ),
  status           text not null default 'coming_soon'
                     check (status in ('live', 'coming_soon', 'paused')),
  sort_order       integer not null default 0,
  publish_enabled  boolean not null default false,
  daily_item_quota integer not null default 500 check (daily_item_quota between 0 and 100000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table central.app_kinds (
  app_slug      text not null references central.apps (slug) on delete cascade,
  kind          text not null check (kind ~ '^[a-z][a-z0-9-]{1,30}$'),
  label         text not null check (char_length(label) between 1 and 60),
  default_shape text not null default 'square' check (default_shape in ('square', 'landscape')),
  primary key (app_slug, kind)
);

create table central.app_publishers (
  api_key_id uuid primary key,
  app_slug   text not null references central.apps (slug) on delete cascade,
  created_at timestamptz not null default now()
);
create index app_publishers_app_slug_idx on central.app_publishers (app_slug);

alter table central.apps           enable row level security;
alter table central.app_kinds      enable row level security;
alter table central.app_publishers enable row level security;

revoke all on central.apps, central.app_kinds, central.app_publishers
  from public, anon, authenticated;
grant select, insert, update, delete on central.apps, central.app_kinds, central.app_publishers
  to service_role;

-- ── Seed (placeholder copy: the founder reviews it before apply) ─────
insert into central.apps (slug, name, label, accent, icon, explanation, visit_url, status, sort_order, publish_enabled)
values
  ('central', 'Central', 'Citizens Central', null, 'central',
   'One calm stream of everything Citizens offers, drawn from every app.',
   '/citizens/', 'live', 0, false),
  ('connect', 'Connect', 'Citizens Connect', '#f2bd22', 'connect',
   'The discovery and connection layer: the map, events, places, contributors and community.',
   '/citizens/connect', 'live', 1, false),
  ('vision', 'Vision', 'Citizens Vision', '#718ba9', 'vision',
   'The intelligence and impact layer: organisations see their real community impact, reach and engagement.',
   '/citizens/vision', 'live', 2, false),
  ('wear', 'Wear', 'Citizens Wear', '#a8685a', 'wear',
   'Kingdom-aligned fashion and ethical, community-rooted brands.',
   '/citizens/wear', 'live', 3, false),
  ('learn', 'Learn', 'Citizens Learn', '#4f8a8b', 'learn',
   'Find Christian courses, teachers and all learning material, from educational, equipping and training organisations.',
   '/citizens/learn', 'coming_soon', 4, false),
  ('play', 'Play', 'Citizens Play', '#94708c', 'play',
   'Storage, resources, tools, games and entertainment to break the ice and share memories at Christian gatherings of any size.',
   '/citizens/play', 'coming_soon', 5, false),
  ('move', 'Move', 'Citizens Move', '#718b78', 'move',
   'Active events for individuals and families: community runs, hikes, prayer walks, archery, soccer, paddling, cycling and car runs.',
   '/citizens/move', 'coming_soon', 6, false),
  ('impact', 'Impact', 'Citizens Impact', '#b4535a', 'impact',
   'Where community change is proposed, agreed, funded and officially launched, uniting large financial role players and organisations in addressing community needs.',
   '/citizens/impact', 'coming_soon', 7, false);

insert into central.app_kinds (app_slug, kind, label, default_shape)
values
  ('central', 'pause',         'A slower moment',       'square'),
  ('central', 'encouragement', 'Today''s Encouragement', 'landscape'),
  ('connect', 'event',         'Events',                'landscape'),
  ('connect', 'place',         'Places',                'square'),
  ('connect', 'contributor',   'Contributors',          'square');
