-- 019: Live Location Foundation
-- Opt-in location sharing for RSVP'd event attendees during event duration

-- ── User location sharing table ─────────────────
create table if not exists public.user_locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  accuracy    double precision, -- meters
  updated_at  timestamptz not null default now(),
  -- One active location record per user per event
  unique(user_id, event_id)
);

-- Index for fast spatial + temporal queries
create index if not exists idx_user_locations_event
  on public.user_locations (event_id, updated_at desc);

create index if not exists idx_user_locations_user
  on public.user_locations (user_id);

-- ── Location sharing preferences (per-user global setting) ──
-- Stored on profiles table as a new column
alter table public.profiles
  add column if not exists location_sharing boolean not null default false;

-- ── RLS ─────────────────────────────────────────
alter table public.user_locations enable row level security;

-- Users can see locations of other attendees at events they're attending
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Attendees can view event locations' AND tablename = 'user_locations') THEN
  create policy "Attendees can view event locations"
    on public.user_locations for select
    using (
      exists (
        select 1 from public.rsvps
        where rsvps.event_id = user_locations.event_id
          and rsvps.user_id = auth.uid()
      )
    );
END IF;
END $$;

-- Users can insert/update their own location (only if RSVP'd)
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can upsert own location' AND tablename = 'user_locations') THEN
  create policy "Users can upsert own location"
    on public.user_locations for insert
    with check (
      auth.uid() = user_id
      AND exists (
        select 1 from public.rsvps
        where rsvps.event_id = user_locations.event_id
          and rsvps.user_id = auth.uid()
      )
    );
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own location' AND tablename = 'user_locations') THEN
  create policy "Users can update own location"
    on public.user_locations for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      AND exists (
        select 1 from public.rsvps
        where rsvps.event_id = user_locations.event_id
          and rsvps.user_id = auth.uid()
      )
    );
END IF;
END $$;

-- Users can delete their own location (stop sharing)
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own location' AND tablename = 'user_locations') THEN
  create policy "Users can delete own location"
    on public.user_locations for delete
    using (auth.uid() = user_id);
END IF;
END $$;

-- ── Cleanup function: remove stale locations ────
-- Events that have ended — clean up their location records
-- Can be called via pg_cron or Edge Function
create or replace function public.cleanup_stale_locations()
returns void language plpgsql security definer as $$
begin
  delete from public.user_locations ul
  where not exists (
    select 1 from public.events e
    where e.id = ul.event_id
      and (
        -- Event is still ongoing
        (e.end_time is not null and e.end_time::timestamptz > now() - interval '30 minutes')
        or
        -- No end_time: consider ended 4 hours after start
        (e.end_time is null and e.date::timestamptz + interval '4 hours' > now() - interval '30 minutes')
      )
  );
end;
$$;
