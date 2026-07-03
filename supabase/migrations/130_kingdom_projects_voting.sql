-- 130_kingdom_projects_voting.sql
-- Kingdom Projects / Impact Ideas voting foundation.
-- Phase 0 of the HTML-frontend wiring (docs/HTML_FRONTEND_WIRING_SPEC.md §4.5).
--
-- Extends public.suggestions with the idea lifecycle + tier fields, adds the
-- public.idea_votes table (one vote per user per idea, retractable, public counts),
-- adds rsvps.location_snapshot for the future city-reach map (spec §B2), and adds
-- the vote_on_idea() toggle RPC.
--
-- DELIBERATE DEVIATIONS FROM THE LITERAL SPEC SQL (verified against live schema):
--   1. suggestions.status ALREADY EXISTS (open/in_review/actioned) and powers the
--      generic-suggestion + Phase-5 Community feature. We DO NOT clobber it. The
--      Kingdom-Projects lifecycle uses a NEW column `idea_status`
--      (voting/in_process/confirmed) instead.
--   2. spec §B2 assumes a `profiles.location` text column as the snapshot source —
--      it does not exist (the profile carries connect_home_province + lat/long +
--      physical_address). Phase 0 only adds the rsvps.location_snapshot COLUMN; the
--      snapshot source field is a Phase-4 wiring decision, intentionally not guessed.
--   3. Full auto-transition (event auto-creation + RSVP fan-out + voter
--      notifications) is DEFERRED to Phase 4 (per the build order). events.date is
--      NOT NULL with no default and an idea carries no date, so event synthesis needs
--      a product decision. vote_on_idea() therefore toggles the vote and REPORTS
--      threshold state (`threshold_reached`, `auto_eligible`) but does not yet mutate
--      idea_status — avoiding half-transitioned ideas / events with fabricated dates.

begin;

-- 1. suggestions: idea lifecycle + tier fields -------------------------------
alter table public.suggestions
  add column if not exists tier text not null default 'community'
    check (tier in ('small_volunteer','community','town','funders_challenge','provincial_vision'));

alter table public.suggestions
  add column if not exists tier_label text;

alter table public.suggestions
  add column if not exists vote_threshold integer not null default 50
    check (vote_threshold > 0);

alter table public.suggestions
  add column if not exists idea_status text not null default 'voting'
    check (idea_status in ('voting','in_process','confirmed'));

alter table public.suggestions
  add column if not exists project_lead_id uuid references auth.users(id) on delete set null;

alter table public.suggestions
  add column if not exists associated_event_id uuid references public.events(id) on delete set null;

-- 2. idea_votes --------------------------------------------------------------
create table if not exists public.idea_votes (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.suggestions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (idea_id, user_id)  -- one vote per user per idea
);
-- composite unique already indexes (idea_id) prefix for per-idea counts;
-- add user_id index for "ideas I've voted on" lookups.
create index if not exists idea_votes_user_id_idx on public.idea_votes (user_id);

alter table public.idea_votes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='idea_votes' and policyname='idea_votes_insert_own') then
    create policy "idea_votes_insert_own" on public.idea_votes
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='idea_votes' and policyname='idea_votes_delete_own') then
    create policy "idea_votes_delete_own" on public.idea_votes
      for delete using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='idea_votes' and policyname='idea_votes_select_public') then
    create policy "idea_votes_select_public" on public.idea_votes
      for select using (true);
  end if;
end $$;

-- 3. rsvps.location_snapshot (city-reach map — spec §B2; aggregation in Phase 4)
alter table public.rsvps
  add column if not exists location_snapshot text;

-- 4. vote_on_idea(p_idea_id) — toggle vote, report threshold ------------------
-- SECURITY DEFINER: must read the suggestion row (community-idea SELECT RLS is not
-- guaranteed for the voting user) and write idea_votes regardless of the caller's
-- direct grants. Auth is enforced explicitly; anon is denied EXECUTE below.
create or replace function public.vote_on_idea(p_idea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing uuid;
  v_count    integer;
  v_idea     public.suggestions%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_idea from public.suggestions where id = p_idea_id;
  if not found then
    raise exception 'idea not found' using errcode = 'P0002';
  end if;

  select id into v_existing
    from public.idea_votes
    where idea_id = p_idea_id and user_id = v_uid;

  if v_existing is not null then
    -- retract
    delete from public.idea_votes where id = v_existing;
    select count(*) into v_count from public.idea_votes where idea_id = p_idea_id;
    return jsonb_build_object(
      'action', 'removed',
      'voted', false,
      'vote_count', v_count,
      'threshold_reached', v_count >= v_idea.vote_threshold
    );
  end if;

  -- add
  insert into public.idea_votes (idea_id, user_id) values (p_idea_id, v_uid);
  select count(*) into v_count from public.idea_votes where idea_id = p_idea_id;
  return jsonb_build_object(
    'action', 'added',
    'voted', true,
    'vote_count', v_count,
    'threshold_reached', v_count >= v_idea.vote_threshold,
    -- Phase 4 consumes auto_eligible to run transition_idea_to_in_process():
    'auto_eligible', (v_idea.idea_status = 'voting'
                      and v_count >= v_idea.vote_threshold
                      and v_idea.tier in ('small_volunteer','community'))
  );
end;
$$;

revoke all on function public.vote_on_idea(uuid) from public;
revoke all on function public.vote_on_idea(uuid) from anon;
grant execute on function public.vote_on_idea(uuid) to authenticated;

commit;
