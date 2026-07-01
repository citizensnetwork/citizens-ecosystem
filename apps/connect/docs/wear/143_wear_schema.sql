-- ============================================================================
-- DRAFT MIGRATION — wear.* schema  (Citizens Wear, ecosystem Step 3)
-- ============================================================================
-- STATUS: **DRAFT — NOT YET APPLIED.** This file lives in docs/wear/ (NOT in
--   supabase/migrations/) on purpose, so it cannot be auto-applied or collide
--   with Connect's live migration numbering before the Wear build begins.
--
-- WHEN THE WEAR PHASE-3 BUILD STARTS:
--   1. Confirm the next free migration number (this assumes **143**; if Connect
--      has shipped a later migration meanwhile, renumber).
--   2. Move this file to  supabase/migrations/143_wear_schema.sql
--   3. Apply via apply_migration (atomic) to the shared project
--      `xyiajtrvhlxaeplsiajj`.
--   4. Run get_advisors(security) → target 0 ERROR (R7.3). New SECURITY DEFINER
--      fns are expected WARNs only if grants are tightened (done below).
--   5. Set deploy gates (SHARED_DB_CONTRACT / STEP3 scope §5 Q3):
--      expose `wear` in PostgREST "Exposed schemas"; set Wear Vercel env.
--
-- MODEL (Direction A, founder-ratified):
--   * One shared Supabase project, one auth.users. This is Wear's own schema.
--   * Identity comes from the shared Supabase Auth; `wear.users` is a MIRROR of
--     display identity (Q1), keyed by the auth uid.
--   * Reads run via supabase-js `db:{schema:'wear'}` (PostgREST) under RLS —
--     RLS is the only isolation wall (SHARED_DB_CONTRACT R3). NOT Prisma.
--   * No cross-schema FKs to public.*/vision.* (preserves the exit ramp, R1.3).
--     `brands.connect_contributor_id` is a NULLABLE value-ref to
--     public.profiles.id (Q4), verified app-side, never a hard FK.
--
-- FAITHFUL to citizens-wear packages/db/prisma/schema.prisma, with two changes
-- the real DB requires: (a) uuid PKs + auth.users-backed identity instead of
-- opaque string ids; (b) RLS on every table. `wear.products` is intentionally
-- DEFERRED — the current Wear model references Connect product ids via
-- posts.tagged_product_ids[]; a first-class catalog is a later product decision.
-- ============================================================================

create schema if not exists wear;
grant usage on schema wear to anon, authenticated, service_role;

-- ── Shared helpers ─────────────────────────────────────────────────────────

-- updated_at maintenance (plain trigger fn; hardened empty search_path).
create or replace function wear.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function wear.set_updated_at() from public;

-- ── Enums ──────────────────────────────────────────────────────────────────
create type wear.profile_visibility        as enum ('public','private');
create type wear.post_media_kind           as enum ('image','video');
create type wear.story_media_kind          as enum ('image','video','text');
create type wear.story_audience            as enum ('public','followers');
create type wear.story_reaction_kind       as enum ('amen','love','fire','pray','crown');
create type wear.conversation_kind         as enum ('direct','group');
create type wear.conversation_request_state as enum ('requested','accepted');
create type wear.conversation_member_role  as enum ('owner','member');
create type wear.report_subject_kind       as enum ('post','comment','message','story','user');
create type wear.report_reason             as enum ('spam','abuse','sexual','self_harm','illegal','other');

-- ── Identity (mirror of the shared auth.users, Q1) ──────────────────────────
-- Hydrated from each user's OWN session on first Wear sign-in (self-write),
-- or backfilled by the Wear backend (service_role) via GET /api/v1/profiles/{id}.
create table wear.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text unique not null,
  display_name text not null,
  email        text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table wear.users enable row level security;
create policy users_public_read on wear.users for select using (true);
create policy users_self_insert  on wear.users for insert with check (auth.uid() = id);
create policy users_self_update  on wear.users for update using (auth.uid() = id) with check (auth.uid() = id);
create trigger trg_users_updated_at before update on wear.users
  for each row execute function wear.set_updated_at();

-- Wear-specific profile state attached to a user.
create table wear.profiles (
  user_id     uuid primary key references wear.users(id) on delete cascade,
  bio         text,
  visibility  wear.profile_visibility not null default 'public',
  verified    boolean not null default false,  -- Wear-side "recognised Kingdom figure"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table wear.profiles enable row level security;
create policy profiles_public_read on wear.profiles for select using (true);
create policy profiles_self_write  on wear.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_profiles_updated_at before update on wear.profiles
  for each row execute function wear.set_updated_at();

create table wear.user_settings (
  user_id               uuid primary key references wear.users(id) on delete cascade,
  display_name_override text,
  profile_visibility    wear.profile_visibility not null default 'public',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table wear.user_settings enable row level security;
create policy user_settings_self on wear.user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_user_settings_updated_at before update on wear.user_settings
  for each row execute function wear.set_updated_at();

-- ── Brands (Wear-owned; OPTIONAL Connect link, Q4) ──────────────────────────
create table wear.brands (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  name                  text not null,
  tagline               text,
  website_url           text,
  logo_url              text,
  verified              boolean not null default false,
  owner_user_id         uuid not null references wear.users(id) on delete cascade,
  -- Q4: value-ref to public.profiles.id (a Connect contributor). NULLABLE, NO
  -- cross-schema FK. Set only via the ownership-verified link flow
  -- (resolve /api/v1/contributors/{slug} → id; require profile.id == auth.uid).
  connect_contributor_id uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index brands_owner_idx on wear.brands(owner_user_id);
alter table wear.brands enable row level security;
create policy brands_public_read on wear.brands for select using (true);
create policy brands_owner_write on wear.brands for all
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create trigger trg_brands_updated_at before update on wear.brands
  for each row execute function wear.set_updated_at();

-- ── Follow graph ────────────────────────────────────────────────────────────
create table wear.follows (
  actor_id   uuid not null references wear.users(id) on delete cascade,
  target_id  uuid not null references wear.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  check (actor_id <> target_id)
);
create index follows_target_idx on wear.follows(target_id);
alter table wear.follows enable row level security;
create policy follows_public_read on wear.follows for select using (true);
create policy follows_self_write on wear.follows for all
  using (auth.uid() = actor_id) with check (auth.uid() = actor_id);

-- ── Posts + engagement ──────────────────────────────────────────────────────
create table wear.posts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references wear.users(id) on delete cascade,
  brand_id          uuid references wear.brands(id) on delete set null,  -- posting AS a brand
  body              text not null,
  tagged_product_ids text[] not null default '{}',  -- denormalised Connect product ids (see header)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index posts_author_created_idx on wear.posts(author_id, created_at desc);
create index posts_brand_created_idx  on wear.posts(brand_id, created_at desc);
create index posts_created_idx        on wear.posts(created_at desc);
alter table wear.posts enable row level security;
create policy posts_public_read on wear.posts for select using (true);
create policy posts_author_write on wear.posts for all
  using (auth.uid() = author_id) with check (auth.uid() = author_id);
create trigger trg_posts_updated_at before update on wear.posts
  for each row execute function wear.set_updated_at();

create table wear.post_media (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references wear.posts(id) on delete cascade,
  url         text not null,
  kind        wear.post_media_kind not null default 'image',
  alt_text    text,
  order_index int not null default 0
);
create index post_media_post_idx on wear.post_media(post_id, order_index);
alter table wear.post_media enable row level security;
create policy post_media_public_read on wear.post_media for select using (true);
create policy post_media_author_write on wear.post_media for all
  using (exists (select 1 from wear.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from wear.posts p where p.id = post_id and p.author_id = auth.uid()));

create table wear.likes (
  post_id    uuid not null references wear.posts(id) on delete cascade,
  user_id    uuid not null references wear.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index likes_user_idx on wear.likes(user_id, created_at desc);
alter table wear.likes enable row level security;
create policy likes_public_read on wear.likes for select using (true);
create policy likes_self_write on wear.likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table wear.comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references wear.posts(id) on delete cascade,
  author_id         uuid not null references wear.users(id) on delete cascade,
  parent_comment_id uuid references wear.comments(id) on delete set null,
  body              text not null,
  created_at        timestamptz not null default now()
);
create index comments_post_idx   on wear.comments(post_id, created_at);
create index comments_author_idx on wear.comments(author_id, created_at desc);
alter table wear.comments enable row level security;
create policy comments_public_read on wear.comments for select using (true);
create policy comments_author_write on wear.comments for all
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

create table wear.comment_likes (
  comment_id uuid not null references wear.comments(id) on delete cascade,
  user_id    uuid not null references wear.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table wear.comment_likes enable row level security;
create policy comment_likes_public_read on wear.comment_likes for select using (true);
create policy comment_likes_self_write on wear.comment_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Saves (private to owner) ────────────────────────────────────────────────
create table wear.save_collections (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references wear.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
alter table wear.save_collections enable row level security;
create policy save_collections_owner on wear.save_collections for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table wear.saved_posts (
  collection_id uuid not null references wear.save_collections(id) on delete cascade,
  post_id       uuid not null references wear.posts(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, post_id)
);
create index saved_posts_post_idx on wear.saved_posts(post_id);
alter table wear.saved_posts enable row level security;
create policy saved_posts_owner on wear.saved_posts for all
  using (exists (select 1 from wear.save_collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from wear.save_collections c where c.id = collection_id and c.owner_id = auth.uid()));

-- ── Stories ─────────────────────────────────────────────────────────────────
create table wear.stories (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references wear.users(id) on delete cascade,
  brand_id   uuid references wear.brands(id) on delete set null,
  media_url  text,
  media_kind wear.story_media_kind not null default 'image',
  caption    text,
  audience   wear.story_audience not null default 'public',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null   -- materialised at write time (author = created_at + 24h)
);
create index stories_author_created_idx on wear.stories(author_id, created_at desc);
create index stories_expires_idx        on wear.stories(expires_at);
alter table wear.stories enable row level security;
-- author always; public audience → everyone; followers audience → followers only.
create policy stories_read on wear.stories for select using (
  author_id = auth.uid()
  or audience = 'public'
  or (audience = 'followers'
      and exists (select 1 from wear.follows f where f.actor_id = auth.uid() and f.target_id = author_id))
);
create policy stories_author_write on wear.stories for all
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

create table wear.story_views (
  story_id  uuid not null references wear.stories(id) on delete cascade,
  viewer_id uuid not null references wear.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index story_views_viewer_idx on wear.story_views(viewer_id, viewed_at desc);
alter table wear.story_views enable row level security;
-- viewer records own view; author may read the viewer list of their own story.
create policy story_views_read on wear.story_views for select using (
  viewer_id = auth.uid()
  or exists (select 1 from wear.stories s where s.id = story_id and s.author_id = auth.uid())
);
create policy story_views_self_insert on wear.story_views for insert with check (auth.uid() = viewer_id);

create table wear.story_reactions (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references wear.stories(id) on delete cascade,
  user_id    uuid not null references wear.users(id) on delete cascade,
  kind       wear.story_reaction_kind not null,
  created_at timestamptz not null default now()
);
create index story_reactions_story_idx on wear.story_reactions(story_id, created_at desc);
alter table wear.story_reactions enable row level security;
create policy story_reactions_read on wear.story_reactions for select using (
  user_id = auth.uid()
  or exists (select 1 from wear.stories s where s.id = story_id and s.author_id = auth.uid())
);
create policy story_reactions_self_write on wear.story_reactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table wear.story_highlights (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references wear.users(id) on delete cascade,
  name       text not null,
  cover_url  text,
  created_at timestamptz not null default now()
);
create index story_highlights_owner_idx on wear.story_highlights(owner_id, created_at desc);
alter table wear.story_highlights enable row level security;
create policy story_highlights_public_read on wear.story_highlights for select using (true);
create policy story_highlights_owner_write on wear.story_highlights for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table wear.story_highlight_items (
  highlight_id uuid not null references wear.story_highlights(id) on delete cascade,
  story_id     uuid not null references wear.stories(id) on delete cascade,
  order_index  int not null default 0,
  primary key (highlight_id, story_id)
);
create index story_highlight_items_idx on wear.story_highlight_items(highlight_id, order_index);
alter table wear.story_highlight_items enable row level security;
create policy story_highlight_items_public_read on wear.story_highlight_items for select using (true);
create policy story_highlight_items_owner_write on wear.story_highlight_items for all
  using (exists (select 1 from wear.story_highlights h where h.id = highlight_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from wear.story_highlights h where h.id = highlight_id and h.owner_id = auth.uid()));

-- ── Direct messages ─────────────────────────────────────────────────────────
-- Membership helper — SECURITY DEFINER breaks the recursive-RLS trap Connect
-- hit on conversation_participants (see Connect migration 135 / RESUME §2N).
create or replace function wear.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean language sql security definer stable
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from wear.conversation_members m
    where m.conversation_id = p_conversation_id and m.user_id = p_user_id
  );
$$;
revoke all on function wear.is_conversation_member(uuid, uuid) from public;
grant execute on function wear.is_conversation_member(uuid, uuid) to authenticated, service_role;

create table wear.conversations (
  id          uuid primary key default gen_random_uuid(),
  kind        wear.conversation_kind not null default 'direct',
  name        text,  -- null for 1:1 DMs
  created_by  uuid not null references wear.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index conversations_updated_idx on wear.conversations(updated_at desc);
alter table wear.conversations enable row level security;
create policy conversations_member_read on wear.conversations for select
  using (wear.is_conversation_member(id, auth.uid()));
create policy conversations_creator_insert on wear.conversations for insert
  with check (auth.uid() = created_by);

create table wear.conversation_members (
  conversation_id uuid not null references wear.conversations(id) on delete cascade,
  user_id         uuid not null references wear.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  muted_until     timestamptz,
  request_state   wear.conversation_request_state not null default 'accepted',
  role            wear.conversation_member_role not null default 'member',
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on wear.conversation_members(user_id, request_state);
alter table wear.conversation_members enable row level security;
-- read rows for conversations you belong to; manage only your own membership row.
create policy conversation_members_read on wear.conversation_members for select
  using (wear.is_conversation_member(conversation_id, auth.uid()));
create policy conversation_members_self_write on wear.conversation_members for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table wear.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references wear.conversations(id) on delete cascade,
  author_id       uuid not null references wear.users(id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz   -- soft delete: body nulled, row kept for ordering
);
create index messages_conversation_idx on wear.messages(conversation_id, created_at);
create index messages_author_idx       on wear.messages(author_id, created_at desc);
alter table wear.messages enable row level security;
create policy messages_member_read on wear.messages for select
  using (wear.is_conversation_member(conversation_id, auth.uid()));
create policy messages_author_insert on wear.messages for insert
  with check (auth.uid() = author_id and wear.is_conversation_member(conversation_id, auth.uid()));
create policy messages_author_update on wear.messages for update
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- ── Moderation ──────────────────────────────────────────────────────────────
create table wear.blocks (
  actor_id   uuid not null references wear.users(id) on delete cascade,
  target_id  uuid not null references wear.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  check (actor_id <> target_id)
);
create index blocks_target_idx on wear.blocks(target_id);
alter table wear.blocks enable row level security;
-- a block is private to the actor (existence must not leak to the target).
create policy blocks_actor_read on wear.blocks for select using (auth.uid() = actor_id);
create policy blocks_actor_write on wear.blocks for all
  using (auth.uid() = actor_id) with check (auth.uid() = actor_id);

-- Reports feed a moderation queue (Phase 9). Reporter may create; only the
-- backend (service_role) reads — no anon/authenticated select (R3.2).
create table wear.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references wear.users(id) on delete cascade,
  subject_kind wear.report_subject_kind not null,
  subject_id   uuid not null,
  reason       wear.report_reason not null,
  note         text,
  created_at   timestamptz not null default now()
);
create index reports_subject_idx  on wear.reports(subject_kind, subject_id);
create index reports_reporter_idx on wear.reports(reporter_id, created_at desc);
alter table wear.reports enable row level security;
create policy reports_self_insert on wear.reports for insert with check (auth.uid() = reporter_id);
-- (no select policy → service_role only, which bypasses RLS)

-- ── Table grants (RLS still gates every row) ────────────────────────────────
grant select on all tables in schema wear to anon, authenticated;
grant insert, update, delete on all tables in schema wear to authenticated;
grant all on all tables in schema wear to service_role;

-- ============================================================================
-- END DRAFT. Post-apply checklist: get_advisors(security)=0 ERROR; expose
-- `wear` schema in PostgREST; smoke-test RLS (a user cannot read another user's
-- private saves / settings / others' blocks / reports / followers-only stories).
-- ============================================================================
