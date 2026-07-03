-- 037_community_event_rate_limit.sql
--
-- Enforces the one-public-event-per-window limit for Citizens
-- creating public (community-organised) events. The window is
-- parameterised via a small settings table so the admin can tune it
-- without a code deploy. Defaults mirror the project convention:
-- 1 event per 30 days per citizen.
--
-- This is a *soft* gate — it lives in a BEFORE INSERT trigger on
-- `events` and fires only when:
--   * inserter's profiles.role = 'citizen'
--   * community_contributor = true (or left unset — we force-tag
--     below when the inserter is a citizen)
--
-- Contributors and admins are never rate-limited by this trigger;
-- they have their own editorial responsibilities.

begin;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Seed default rate-limit config. On conflict = do nothing so we
-- never clobber an admin's tuned value on repeated migration runs.
insert into public.app_settings (key, value) values
  ('community_event_rate_limit', jsonb_build_object('days', 30, 'count', 1))
on conflict (key) do nothing;

-- Force-tag any event created by a citizen as a community-organised
-- event. Runs before the rate-limit trigger so that trigger can
-- trust the flag.
create or replace function public.events_set_community_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role text;
begin
  if TG_OP <> 'INSERT' then
    return new;
  end if;

  select role into _role from public.profiles where id = new.created_by;

  if _role = 'citizen' then
    -- Citizens never create non-community events; force-tag.
    new.community_contributor := true;
  end if;

  return new;
end;
$$;

drop trigger if exists events_set_community_flag_before_insert on public.events;
create trigger events_set_community_flag_before_insert
  before insert on public.events
  for each row
  execute function public.events_set_community_flag();

-- Rate-limit trigger. Fires AFTER the flag-setter so it sees the
-- final value of community_contributor.
create or replace function public.events_enforce_community_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role text;
  _days int;
  _count int;
  _recent_count int;
  _cfg jsonb;
begin
  if TG_OP <> 'INSERT' then
    return new;
  end if;

  -- Only citizens are rate-limited.
  select role into _role from public.profiles where id = new.created_by;
  if _role is distinct from 'citizen' then
    return new;
  end if;
  if coalesce(new.community_contributor, false) = false then
    return new;
  end if;

  select value into _cfg from public.app_settings where key = 'community_event_rate_limit';
  _days  := coalesce((_cfg->>'days')::int, 30);
  _count := coalesce((_cfg->>'count')::int, 1);

  select count(*) into _recent_count
  from public.events
  where created_by = new.created_by
    and community_contributor = true
    and created_at >= (now() - make_interval(days => _days));

  if _recent_count >= _count then
    raise exception
      'community_event_rate_limited: citizens may create % event(s) per % day(s); please wait and try again.',
      _count, _days
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists events_enforce_community_rate_limit_before_insert on public.events;
create trigger events_enforce_community_rate_limit_before_insert
  before insert on public.events
  for each row
  execute function public.events_enforce_community_rate_limit();

comment on function public.events_set_community_flag() is
  'Force-tags events created by citizens as community_contributor = true.';
comment on function public.events_enforce_community_rate_limit() is
  'Rate-limits citizens creating public community-organised events (config in app_settings.community_event_rate_limit).';

commit;
