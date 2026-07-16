-- ============================================================================
-- 161_wear_concept_engagement.sql — the community Concepts surface
-- (§3V "progression epic" items 1+2; docs/Citizens_Wear_Roles_and_Concepts_MD.md
-- §6.1/§6.2/§6.4, RATIFIED 2026-07-15)
-- ============================================================================
-- The Concepts page is "the community's own creations … the attention that
-- draws Brands to a design" (§6.2). Today Concepts have upvotes only. This
-- migration adds the rest of the engagement triad + the concept-stories bar:
--
--   * concept_comments   — mirrors wear.comments exactly (threaded replies via
--                          parent_comment_id, public read, author-owned,
--                          moderator takedown per mig 145).
--   * concept_shares     — DISTINCT-SHARER social proof: pk (concept_id,
--                          user_id), self-INSERT only, never retracted (the
--                          count is the Creator's earned credibility, §6.2).
--                          `channel` records how it was shared ('dm' reserved
--                          for the conversation-picker fast-follow).
--   * concept_statuses   — the "concept-stories bar". A status is a PROMOTION
--                          OF A CONCEPT (§6.1: concepts are "promoted to
--                          concept-statuses"), NOT authored story content — so
--                          it is a NEW table, not a wear.stories reuse: no
--                          media/caption/audience machinery, and NO client
--                          write path at all (rows enter solely through the
--                          SECDEF promotion trigger below; the mig-157
--                          status-log precedent). This is also the §3V-7
--                          "stories bifurcation": Home stories stay
--                          wear.stories; the community bar is concepts-derived.
--   * concept_status_views — seen-state for the bar's gold ring (story_views
--                          mirror: viewer self-insert, creator reads viewers).
--
-- PROMOTION RULE (the lazy Creator ladder, §6.1):
--   * Creator badge is DERIVED, never stored: >10 Concepts posted — i.e. the
--     11th live concept (counting the new row) starts promoting. Deletions
--     lower the count again (lazy = honest).
--   * BOOTSTRAP GRACE: the first 100 Wear Concepts platform-wide are ALL
--     promoted regardless of badge, to seed the launch surface. Implemented as
--     "grace statuses issued so far < 100" — bounded by a partial index,
--     self-terminating, and badge-reason promotions never consume grace slots.
--     No retroactive backfill: pre-migration concepts hold no status (a status
--     lives 24h, so backfilling old rows would create born-expired data); the
--     grace counter simply starts at 0 on apply.
--   * The trigger is BEST-EFFORT (mig-159 wear.notify precedent): a promotion
--     bug must never block posting a Concept. A concurrent pair at the 100th
--     grace slot may admit 101 — bootstrap generosity, bounded by concurrency.
--
-- LIKES: the ratified design's "like" rides the EXISTING wear.concept_upvotes
-- (§3V's new-schema list deliberately omits it) — presentation changes only.
--
-- NOTIFICATIONS: three new wear.notification_type values + AFTER-INSERT
-- triggers (mig-159 pattern; wear.notify self-guards + swallows errors):
--   comment → concept creator (replies also → parent-comment author),
--   upvote  → concept creator,   share → concept creator.
--   (ALTER TYPE ADD VALUE is transaction-safe here: the new values are only
--   referenced inside plpgsql bodies, never executed as DML in this migration.)
--
-- Conventions: mig-143/157 style (RLS every table, hardened empty search_path,
-- schema-qualified bodies); mig-146 lesson (explicit least-privilege grants);
-- every new FK is indexed (advisor "0 new findings" gate).
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
create type wear.concept_status_reason as enum ('creator_badge', 'bootstrap_grace');
create type wear.concept_share_channel as enum ('link', 'native', 'dm');

alter type wear.notification_type add value 'concept_comment';
alter type wear.notification_type add value 'concept_upvote';
alter type wear.notification_type add value 'concept_share';

-- ── 2. Concept comments (wear.comments mirror) ──────────────────────────────
create table wear.concept_comments (
  id                uuid primary key default gen_random_uuid(),
  concept_id        uuid not null references wear.concepts(id) on delete cascade,
  author_id         uuid not null references wear.users(id) on delete cascade,
  parent_comment_id uuid references wear.concept_comments(id) on delete set null,
  body              text not null,
  created_at        timestamptz not null default now()
);
create index concept_comments_concept_idx on wear.concept_comments(concept_id, created_at);
create index concept_comments_author_idx  on wear.concept_comments(author_id, created_at desc);
create index concept_comments_parent_idx  on wear.concept_comments(parent_comment_id)
  where parent_comment_id is not null;
alter table wear.concept_comments enable row level security;
create policy concept_comments_public_read on wear.concept_comments for select using (true);
create policy concept_comments_author_write on wear.concept_comments for all
  using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy concept_comments_moderator_delete on wear.concept_comments for delete
  using (wear.is_moderator());

-- ── 3. Concept shares (distinct-sharer social proof) ────────────────────────
create table wear.concept_shares (
  concept_id uuid not null references wear.concepts(id) on delete cascade,
  user_id    uuid not null references wear.users(id) on delete cascade,
  channel    wear.concept_share_channel not null default 'link',
  created_at timestamptz not null default now(),
  primary key (concept_id, user_id)
);
create index concept_shares_user_idx on wear.concept_shares(user_id, created_at desc);
alter table wear.concept_shares enable row level security;
create policy concept_shares_public_read on wear.concept_shares for select using (true);
create policy concept_shares_self_insert on wear.concept_shares for insert
  with check (auth.uid() = user_id);
-- (no UPDATE/DELETE policy: a share is a fact, not a toggle; account deletion
--  cascades via the user FK.)

-- ── 4. Concept statuses (the concept-stories bar) ───────────────────────────
create table wear.concept_statuses (
  id         uuid primary key default gen_random_uuid(),
  concept_id uuid not null references wear.concepts(id) on delete cascade,
  -- Denormalised from the concept for the bar's group-by-creator + index; set
  -- by the trigger, and immutable because no UPDATE path exists.
  creator_id uuid not null references wear.users(id) on delete cascade,
  reason     wear.concept_status_reason not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,  -- materialised at write time (+24h), stories precedent
  unique (concept_id)               -- a concept is promoted at most once
);
create index concept_statuses_active_idx  on wear.concept_statuses(expires_at desc);
create index concept_statuses_creator_idx on wear.concept_statuses(creator_id, created_at desc);
-- Bounds the bootstrap-grace counter scan (≤100 rows, forever).
create index concept_statuses_grace_idx on wear.concept_statuses(reason)
  where reason = 'bootstrap_grace';
alter table wear.concept_statuses enable row level security;
-- Concepts are public; their promotions are public. Expiry is filtered
-- app-side (the stories_read precedent). NO write policy and NO write grant:
-- rows enter solely through the SECDEF promotion trigger (service_role bypasses).
create policy concept_statuses_public_read on wear.concept_statuses for select using (true);

create table wear.concept_status_views (
  status_id uuid not null references wear.concept_statuses(id) on delete cascade,
  viewer_id uuid not null references wear.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);
create index concept_status_views_viewer_idx on wear.concept_status_views(viewer_id, viewed_at desc);
alter table wear.concept_status_views enable row level security;
-- viewer records own view; the status's creator may read the viewer list.
create policy concept_status_views_read on wear.concept_status_views for select using (
  viewer_id = auth.uid()
  or exists (select 1 from wear.concept_statuses s
             where s.id = status_id and s.creator_id = auth.uid())
);
create policy concept_status_views_self_insert on wear.concept_status_views for insert
  with check (auth.uid() = viewer_id);

-- ── 5. Promotion trigger (the lazy Creator ladder made concrete) ────────────
create or replace function wear.promote_concept_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_reason wear.concept_status_reason;
begin
  -- Creator badge (§6.1, derived): >10 Concepts posted, counting this row.
  if (select count(*) from wear.concepts where creator_id = new.creator_id) > 10 then
    v_reason := 'creator_badge';
  -- Bootstrap grace (§6.1): first 100 platform-wide, self-terminating.
  elsif (select count(*) from wear.concept_statuses where reason = 'bootstrap_grace') < 100 then
    v_reason := 'bootstrap_grace';
  else
    return new;
  end if;

  insert into wear.concept_statuses (concept_id, creator_id, reason, expires_at)
  values (new.id, new.creator_id, v_reason, now() + interval '24 hours')
  on conflict (concept_id) do nothing;
  return new;
exception when others then
  -- Best-effort: a promotion bug must never block posting a Concept.
  return new;
end $$;
revoke all on function wear.promote_concept_status() from public;
create trigger trg_promote_concept_status
  after insert on wear.concepts
  for each row execute function wear.promote_concept_status();

-- ── 6. Engagement notifications (mig-159 pattern) ───────────────────────────
create or replace function wear.notify_on_concept_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_title text; v_parent_author uuid;
begin
  select creator_id, title into v_creator, v_title from wear.concepts where id = new.concept_id;
  perform wear.notify(
    v_creator, 'concept_comment', new.author_id, new.concept_id, null,
    jsonb_build_object('conceptTitle', v_title, 'excerpt', left(new.body, 120))
  );
  -- A threaded reply also reaches the parent comment's author (wear.notify
  -- drops self-notifies; skip a duplicate when the parent author IS the creator).
  if new.parent_comment_id is not null then
    select author_id into v_parent_author
      from wear.concept_comments where id = new.parent_comment_id;
    if v_parent_author is distinct from v_creator then
      perform wear.notify(
        v_parent_author, 'concept_comment', new.author_id, new.concept_id, null,
        jsonb_build_object('conceptTitle', v_title, 'excerpt', left(new.body, 120), 'reply', true)
      );
    end if;
  end if;
  return new;
end $$;
revoke all on function wear.notify_on_concept_comment() from public;
create trigger trg_notify_on_concept_comment
  after insert on wear.concept_comments
  for each row execute function wear.notify_on_concept_comment();

create or replace function wear.notify_on_concept_upvote()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_title text;
begin
  select creator_id, title into v_creator, v_title from wear.concepts where id = new.concept_id;
  perform wear.notify(
    v_creator, 'concept_upvote', new.user_id, new.concept_id, null,
    jsonb_build_object('conceptTitle', v_title)
  );
  return new;
end $$;
revoke all on function wear.notify_on_concept_upvote() from public;
create trigger trg_notify_on_concept_upvote
  after insert on wear.concept_upvotes
  for each row execute function wear.notify_on_concept_upvote();

create or replace function wear.notify_on_concept_share()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_title text;
begin
  select creator_id, title into v_creator, v_title from wear.concepts where id = new.concept_id;
  perform wear.notify(
    v_creator, 'concept_share', new.user_id, new.concept_id, null,
    jsonb_build_object('conceptTitle', v_title)
  );
  return new;
end $$;
revoke all on function wear.notify_on_concept_share() from public;
create trigger trg_notify_on_concept_share
  after insert on wear.concept_shares
  for each row execute function wear.notify_on_concept_share();

-- ── 7. Grants (explicit + least-privilege; RLS gates every row) ─────────────
grant select on wear.concept_comments, wear.concept_shares, wear.concept_statuses
  to anon, authenticated;
grant select on wear.concept_status_views to authenticated;
grant insert, update, delete on wear.concept_comments to authenticated;
grant insert on wear.concept_shares to authenticated;
grant insert on wear.concept_status_views to authenticated;
grant all on wear.concept_comments, wear.concept_shares, wear.concept_statuses,
             wear.concept_status_views
  to service_role;

-- ============================================================================
-- Post-apply checklist:
--  * get_advisors(security) = 0 ERROR / 0 new findings vs mig-160 baseline
--    (101 WARN / 3 INFO).
--  * Rolled-back prod smokes:
--    (a) INSERT wear.concept_comments as another author        → RLS denial;
--    (b) INSERT own comment → creator notification row exists  → OK;
--    (c) INSERT wear.concept_shares twice (same user+concept)  → 23505;
--    (d) INSERT wear.concept_statuses as authenticated         → denied (no grant);
--    (e) INSERT a concept as a ≤10-concept creator → status row reason
--        'bootstrap_grace' exists (grace counter < 100)        → OK;
--    (f) status_views: viewer self-insert OK; third party read → hidden.
--  * Structural QA: wear.* tables 33→37; new policies = 8
--    (comments 3, shares 2, statuses 1, status_views 2); new fns = 4;
--    new enums = 2 (+3 notification_type values).
--  * Update SHARED_DB_CONTRACT §9 (head 161) + RESUME_HERE.
--  * Seed fast-follow: apps/wear/scripts/seed/seed-feed.sql §12 engagement
--    block (own guard marker — base seed is already live in prod).
-- ============================================================================
