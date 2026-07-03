-- ============================================
-- 009: Performance indexes + RPC functions
-- Addresses: missing indexes, trending RPC, atomic RSVP
-- ============================================

-- ── Performance indexes ──────────────────────────────────
create index if not exists events_status_date_idx on public.events(status, date);
create index if not exists events_created_by_idx on public.events(created_by);
create index if not exists rsvps_event_id_idx on public.rsvps(event_id);
create index if not exists rsvps_user_id_idx on public.rsvps(user_id);
create index if not exists comments_event_id_idx on public.comments(event_id);
create index if not exists reviews_place_id_idx on public.reviews(place_id) where place_id is not null;
create index if not exists event_views_event_id_idx on public.event_views(event_id);

-- ── Trending events RPC (replaces full rsvps table scan) ──
create or replace function public.trending_events(lim int default 5)
returns table(event_id uuid, rsvp_count bigint)
language sql stable
security definer
as $$
  select r.event_id, count(*) as rsvp_count
  from public.rsvps r
  join public.events e on e.id = r.event_id
  where e.status = 'published' and e.date >= now()
  group by r.event_id
  order by rsvp_count desc
  limit lim;
$$;

-- ── Atomic RSVP with capacity check (prevents race condition) ──
create or replace function public.safe_rsvp(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_status text;
  v_max int;
  v_current int;
  v_remaining int;
begin
  -- Lock the event row to prevent concurrent capacity checks
  select status, max_attendees into v_status, v_max
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  if v_status != 'published' then
    return jsonb_build_object('success', false, 'error', 'Cannot RSVP to a ' || v_status || ' event', 'status', 400);
  end if;

  -- Check capacity if limited
  if v_max is not null then
    select count(*)::int into v_current
    from public.rsvps
    where event_id = p_event_id;

    if v_current >= v_max then
      return jsonb_build_object('success', false, 'error', 'Event is full', 'remaining', 0, 'status', 409);
    end if;

    v_remaining := v_max - v_current - 1;
  else
    v_remaining := null;
  end if;

  -- Insert the RSVP (unique constraint prevents duplicates)
  begin
    insert into public.rsvps (user_id, event_id)
    values (p_user_id, p_event_id);
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error', 'Already RSVPed to this event', 'status', 409);
  end;

  return jsonb_build_object('success', true, 'remaining', v_remaining, 'status', 201);
end;
$$;

-- ── Tighten event_views insert policy ──
drop policy if exists "Anyone can record a view" on public.event_views;

create policy "Authenticated users can record own views"
  on public.event_views for insert
  with check (auth.uid() = user_id);
