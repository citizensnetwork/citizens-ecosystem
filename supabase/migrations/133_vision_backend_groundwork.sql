-- Migration 133: Citizens Vision — backend groundwork
-- Implements all 7 schema items from Citizens_Connect_Updates_for_Vision.md
-- adapted to Connect's actual table names (broadcast_messages, profiles).
-- Next migration #: 134

-- ══════════════════════════════════════════════════════════════════════
-- 1. Deduplicated impression tracking
-- ══════════════════════════════════════════════════════════════════════

create table if not exists event_impressions (
  user_id  uuid not null references profiles(id) on delete cascade,
  event_id uuid not null references events(id)   on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table events add column if not exists impression_count integer not null default 0;

-- RLS on event_impressions: users see/insert only their own rows
alter table event_impressions enable row level security;

create policy "event_impressions_own_select"
  on event_impressions for select
  using (auth.uid() = user_id);

create policy "event_impressions_own_insert"
  on event_impressions for insert
  with check (auth.uid() = user_id);

-- Atomic dedup + counter. SECURITY DEFINER needed to bypass RLS on
-- events.impression_count (the caller is not the event owner).
-- REVOKE from public/anon; GRANT to authenticated only.
create or replace function record_event_impression(p_user_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- caller must be inserting their own impression
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = 'insufficient_privilege';
  end if;

  insert into event_impressions (user_id, event_id)
  values (p_user_id, p_event_id)
  on conflict do nothing;

  -- FOUND is true when the INSERT actually wrote a row (no conflict)
  if found then
    update events set impression_count = impression_count + 1 where id = p_event_id;
  end if;
end;
$$;

revoke all on function record_event_impression(uuid, uuid) from public, anon;
grant execute on function record_event_impression(uuid, uuid) to authenticated;


-- ══════════════════════════════════════════════════════════════════════
-- 2. Cancellation counter
-- Connect cancellations go via DELETE rsvps + INSERT rsvp_cancellations
-- (no status→'cancelled' transition), so the trigger is on
-- rsvp_cancellations rather than rsvps.
-- ══════════════════════════════════════════════════════════════════════

alter table events add column if not exists cancellation_count integer not null default 0;

create or replace function on_rsvp_cancellation_increment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update events set cancellation_count = cancellation_count + 1 where id = new.event_id;
  return new;
end;
$$;

drop trigger if exists trg_cancellation_count on rsvp_cancellations;
create trigger trg_cancellation_count
  after insert on rsvp_cancellations
  for each row execute function on_rsvp_cancellation_increment();


-- ══════════════════════════════════════════════════════════════════════
-- 3. Broadcast audience snapshot
-- broadcast_messages.contributor_id → profiles.id (the org/contributor).
-- Audience = follows where followee_id = contributor_id at post time.
-- ══════════════════════════════════════════════════════════════════════

alter table broadcast_messages add column if not exists audience_size_at_post integer;

create or replace function set_broadcast_audience_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select count(*)::integer into new.audience_size_at_post
  from follows
  where followee_id = new.contributor_id;
  return new;
end;
$$;

drop trigger if exists trg_broadcast_audience_snapshot on broadcast_messages;
create trigger trg_broadcast_audience_snapshot
  before insert on broadcast_messages
  for each row execute function set_broadcast_audience_snapshot();


-- ══════════════════════════════════════════════════════════════════════
-- 5. Organisation timezone
-- "organisations" in Vision = contributor profiles in Connect.
-- Used by Vision for period boundary calculations.
-- ══════════════════════════════════════════════════════════════════════

alter table profiles add column if not exists timezone text not null default 'Africa/Johannesburg';


-- ══════════════════════════════════════════════════════════════════════
-- 6. Category → Space mapping (Vision schema)
-- vision schema keeps Vision-owned tables cleanly separated from
-- Connect's public schema, with independent RLS policies.
-- ══════════════════════════════════════════════════════════════════════

create schema if not exists vision;

-- category_space_map: maps Connect's events.category_id to a Vision Space
-- for an organisation (contributor profile).
-- space_id references vision.spaces once that table exists; uuid for now.
create table if not exists vision.category_space_map (
  org_id      uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  space_id    uuid not null,
  primary key (org_id, category_id, space_id)
);

alter table vision.category_space_map enable row level security;

-- Org owners manage their own mappings; admins can read all
create policy "csm_own_write"
  on vision.category_space_map
  for all
  using (
    auth.uid() = org_id
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );


-- ══════════════════════════════════════════════════════════════════════
-- Vision computed views
-- ══════════════════════════════════════════════════════════════════════

-- Activity-level Reach: MAX(impression_count, attending+considering+cancellations)
create or replace view vision.reach_per_event
  with (security_invoker = true)
as
select
  e.id                                                          as event_id,
  e.title,
  e.created_by                                                  as org_id,
  e.category_id,
  e.impression_count,
  coalesce(r_att.cnt, 0)                                        as attending_count,
  coalesce(r_con.cnt, 0)                                        as considering_count,
  e.cancellation_count,
  greatest(
    e.impression_count,
    coalesce(r_att.cnt, 0) + coalesce(r_con.cnt, 0) + e.cancellation_count
  )                                                             as reach
from events e
left join lateral (
  select count(*)::int as cnt from rsvps where event_id = e.id and status = 'attending'
) r_att on true
left join lateral (
  select count(*)::int as cnt from rsvps where event_id = e.id and status = 'considering'
) r_con on true
where e.status = 'published';


-- Activity-level Engagement: six-component weighted score (0–100)
-- Weights: attending 35%, considering 20%, org_followers 15%,
--          reviews 10%, broadcasts 10%, event_updates 10%
-- Counts are capped at 100 before weighting so one viral event
-- doesn't saturate the score at low absolute numbers.
create or replace view vision.engagement_per_event
  with (security_invoker = true)
as
select
  e.id                                      as event_id,
  e.title,
  e.created_by                              as org_id,
  e.category_id,
  -- raw component counts (returned alongside ratio for "92% (11/12)" display)
  coalesce(r_att.cnt, 0)                    as attending,
  coalesce(r_con.cnt, 0)                    as considering,
  coalesce(f.cnt,  0)                       as org_followers,
  coalesce(rv.cnt, 0)                       as reviews,
  coalesce(bm.cnt, 0)                       as broadcasts,
  coalesce(eu.cnt, 0)                       as event_updates,
  -- weighted score
  round(
    0.35 * least(coalesce(r_att.cnt, 0), 100) +
    0.20 * least(coalesce(r_con.cnt, 0), 100) +
    0.15 * least(coalesce(f.cnt,     0), 100) +
    0.10 * least(coalesce(rv.cnt,    0) * 10, 100) +
    0.10 * least(coalesce(bm.cnt,    0) * 5,  100) +
    0.10 * least(coalesce(eu.cnt,    0) * 5,  100)
  , 2)                                      as engagement_score
from events e
left join lateral (
  select count(*)::int as cnt from rsvps where event_id = e.id and status = 'attending'
) r_att on true
left join lateral (
  select count(*)::int as cnt from rsvps where event_id = e.id and status = 'considering'
) r_con on true
left join lateral (
  select count(*)::int as cnt from follows where followee_id = e.created_by
) f on true
left join lateral (
  select count(*)::int as cnt from reviews where event_id = e.id
) rv on true
left join lateral (
  select count(*)::int as cnt from broadcast_messages
  where entity_id = e.id and entity_type = 'event' and deleted_at is null
) bm on true
left join lateral (
  select count(*)::int as cnt from event_updates where event_id = e.id
) eu on true
where e.status = 'published';


-- ══════════════════════════════════════════════════════════════════════
-- Backfill: set cancellation_count from existing rsvp_cancellations rows
-- ══════════════════════════════════════════════════════════════════════
update events e
set cancellation_count = sub.cnt
from (
  select event_id, count(*)::int as cnt
  from rsvp_cancellations
  group by event_id
) sub
where e.id = sub.event_id;
