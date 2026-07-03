-- 132_kingdom_projects_flow.sql
-- Phase 4: Kingdom Projects lifecycle + city-reach snapshot source.
--
-- FOUNDER DECISIONS APPLIED (2026-06-10):
--   • Idea→event: "Lead schedules it" — hitting the vote goal moves the idea
--     to in_process and notifies voters IMMEDIATELY; the EVENT is only created
--     when the project lead picks a real date (schedule_kingdom_project).
--     No placeholder/fabricated dates ever reach the map.
--   • rsvps.location_snapshot source = profiles.connect_home_province at RSVP
--     time (closest honest stored location to spec §B2 — profiles.location
--     does not exist; province is the granularity we actually have).
--
-- Pieces:
--   1. safe_rsvp()                      — now snapshots the RSVPer's province.
--   2. transition_idea_to_in_process()  — voting → in_process + voter fan-out.
--   3. vote_on_idea()                   — now CALLS the transition for
--      small_volunteer/community tiers, and notifies admins at the crossing
--      moment for town/funders_challenge/provincial_vision (manual review).
--   4. schedule_kingdom_project()       — lead sets the date → event created
--      at the idea's location, voters auto-RSVP'd (attending) + notified.
--
-- Notifications use the existing allowed type 'suggestion_response'
-- (migration 114) — no CHECK-constraint change needed. Event deep-links ride
-- data.event_id (the HTML app's notification router already follows it).

begin;

-- 1. safe_rsvp: snapshot the RSVPer's home province (city-reach source) -----
create or replace function public.safe_rsvp(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_status text;
  v_max int;
  v_current int;
  v_remaining int;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select status, max_attendees into v_status, v_max
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  if v_status <> 'published' then
    return jsonb_build_object('success', false, 'error',
      'Cannot RSVP to a ' || v_status || ' event', 'status', 400);
  end if;

  if v_max is not null then
    select count(*)::int into v_current
    from public.rsvps
    where event_id = p_event_id;

    if v_current >= v_max then
      return jsonb_build_object('success', false, 'error', 'Event is full',
        'remaining', 0, 'status', 409);
    end if;

    v_remaining := v_max - v_current - 1;
  else
    v_remaining := null;
  end if;

  begin
    insert into public.rsvps (user_id, event_id, location_snapshot)
    values (
      p_user_id,
      p_event_id,
      (select connect_home_province from public.profiles where id = p_user_id)
    );
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error',
      'Already RSVPed to this event', 'status', 409);
  end;

  return jsonb_build_object('success', true, 'remaining', v_remaining, 'status', 201);
end;
$$;

-- 2. transition_idea_to_in_process ------------------------------------------
create or replace function public.transition_idea_to_in_process(p_idea_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_idea public.suggestions%rowtype;
begin
  select * into v_idea from public.suggestions where id = p_idea_id for update;
  if not found or v_idea.idea_status <> 'voting' then
    return; -- already transitioned (idempotent) or not an idea
  end if;

  update public.suggestions
     set idea_status = 'in_process',
         project_lead_id = coalesce(project_lead_id, v_idea.user_id)
   where id = p_idea_id;

  -- Voter fan-out: "the community said yes".
  insert into public.notifications (user_id, type, title, body, data)
  select v.user_id,
         'suggestion_response',
         'Kingdom Project: goal reached!',
         '"' || coalesce(v_idea.title, 'An idea you voted for') || '" reached its vote goal and is now In Process.',
         jsonb_build_object('suggestion_id', p_idea_id, 'idea_status', 'in_process')
    from public.idea_votes v
   where v.idea_id = p_idea_id;

  -- Tell the lead they now carry it (if they didn't also vote).
  if v_idea.user_id is not null
     and not exists (select 1 from public.idea_votes where idea_id = p_idea_id and user_id = v_idea.user_id) then
    insert into public.notifications (user_id, type, title, body, data)
    values (v_idea.user_id, 'suggestion_response',
            'Your idea reached its goal!',
            'You are the project lead for "' || coalesce(v_idea.title, 'your idea') || '". Schedule the kickoff from the Kingdom Projects board.',
            jsonb_build_object('suggestion_id', p_idea_id, 'idea_status', 'in_process'));
  end if;
end;
$$;

revoke all on function public.transition_idea_to_in_process(uuid) from public;
revoke all on function public.transition_idea_to_in_process(uuid) from anon;
-- internal: called by vote_on_idea (definer); no direct client execution.
revoke all on function public.transition_idea_to_in_process(uuid) from authenticated;

-- 3. vote_on_idea v2: auto-transition + admin alerts at the crossing moment --
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
  v_auto     boolean;
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
    delete from public.idea_votes where id = v_existing;
    select count(*) into v_count from public.idea_votes where idea_id = p_idea_id;
    return jsonb_build_object(
      'action', 'removed',
      'voted', false,
      'vote_count', v_count,
      'threshold_reached', v_count >= v_idea.vote_threshold
    );
  end if;

  insert into public.idea_votes (idea_id, user_id) values (p_idea_id, v_uid);
  select count(*) into v_count from public.idea_votes where idea_id = p_idea_id;

  v_auto := (v_idea.idea_status = 'voting'
             and v_count >= v_idea.vote_threshold
             and v_idea.tier in ('small_volunteer','community'));

  if v_auto then
    perform public.transition_idea_to_in_process(p_idea_id);
  elsif v_idea.idea_status = 'voting'
        and v_count = v_idea.vote_threshold
        and v_idea.tier in ('town','funders_challenge','provincial_vision') then
    -- Big tiers need a human: alert every admin exactly once (crossing moment).
    insert into public.notifications (user_id, type, title, body, data)
    select p.id, 'suggestion_response',
           'Idea reached its vote goal',
           '"' || coalesce(v_idea.title, 'An idea') || '" (' || coalesce(v_idea.tier_label, v_idea.tier) || ') hit ' || v_count || ' votes - review it for In Process.',
           jsonb_build_object('suggestion_id', p_idea_id, 'idea_status', 'voting')
      from public.profiles p
     where p.role = 'admin';
  end if;

  return jsonb_build_object(
    'action', 'added',
    'voted', true,
    'vote_count', v_count,
    'threshold_reached', v_count >= v_idea.vote_threshold,
    'auto_eligible', v_auto
  );
end;
$$;

revoke all on function public.vote_on_idea(uuid) from public;
revoke all on function public.vote_on_idea(uuid) from anon;
grant execute on function public.vote_on_idea(uuid) to authenticated;

-- 4. schedule_kingdom_project: the LEAD sets the real date -------------------
create or replace function public.schedule_kingdom_project(
  p_idea_id uuid,
  p_date timestamptz,
  p_end timestamptz default null,
  p_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_idea  public.suggestions%rowtype;
  v_event uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_idea from public.suggestions where id = p_idea_id for update;
  if not found then
    raise exception 'idea not found' using errcode = 'P0002';
  end if;
  if v_idea.project_lead_id is distinct from v_uid then
    raise exception 'only the project lead can schedule this project' using errcode = '42501';
  end if;
  if v_idea.idea_status <> 'in_process' then
    raise exception 'project is not in process' using errcode = '22023';
  end if;
  if v_idea.associated_event_id is not null then
    raise exception 'project already scheduled' using errcode = '22023';
  end if;
  if p_date is null or p_date < now() then
    raise exception 'pick a future date for the kickoff' using errcode = '22023';
  end if;

  insert into public.events
    (title, description, category, date, end_time, location, created_by,
     latitude, longitude, status, visibility)
  values
    (coalesce(v_idea.title, 'Kingdom Project'),
     coalesce(v_idea.body, '') || E'\n\nThis is a confirmed Kingdom Project.',
     coalesce(v_idea.category, 'community-upliftment'),
     p_date,
     p_end,
     coalesce(nullif(trim(p_location), ''), 'Community project location'),
     v_uid,
     v_idea.latitude, v_idea.longitude,
     'published', 'public')
  returning id into v_event;

  update public.suggestions set associated_event_id = v_event where id = p_idea_id;

  -- Voters are automatically connected (spec §4.4 step 5), each with their
  -- own province snapshot for the city-reach map.
  insert into public.rsvps (user_id, event_id, location_snapshot)
  select v.user_id, v_event,
         (select connect_home_province from public.profiles pr where pr.id = v.user_id)
    from public.idea_votes v
   where v.idea_id = p_idea_id
  on conflict do nothing;

  insert into public.notifications (user_id, type, title, body, data)
  select v.user_id, 'suggestion_response',
         'Kingdom Project scheduled',
         '"' || coalesce(v_idea.title, 'A project you voted for') || '" has a kickoff date — you''re connected automatically.',
         jsonb_build_object('suggestion_id', p_idea_id, 'event_id', v_event)
    from public.idea_votes v
   where v.idea_id = p_idea_id;

  return jsonb_build_object('event_id', v_event);
end;
$$;

revoke all on function public.schedule_kingdom_project(uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.schedule_kingdom_project(uuid, timestamptz, timestamptz, text) from anon;
grant execute on function public.schedule_kingdom_project(uuid, timestamptz, timestamptz, text) to authenticated;

commit;
