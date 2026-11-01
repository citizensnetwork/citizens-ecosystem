-- ════════════════════════════════════════════════════════════════════
--  202_lets_gatherings
--
--  NOT APPLIED. The owner (Stephen) applies this file only after an
--  explicit yes in chat naming this file, with a pre-apply git tag
--  pushed first and the security advisor checked afterwards
--  (0 ERROR, no unexpected new finding). Do not apply it from a pull
--  request, and do not apply it to any database from an agent session.
--
--  Number 201 is free on main and is reserved for issue #314
--  ("Open to collaborate"). This file is 202 so the two do not collide.
--
--  Issue #313. "Let's…" gatherings are ordinary events with a starter
--  id. Any signed-in citizen may create them. They have their own cap,
--  separate from app_settings.community_event_rate_limit (migration
--  037): 4 Let's rows per rolling window (the same day count as that
--  setting, default 30). Ordinary community events stay at that
--  setting (default 1 per 30 days) and Let's rows are not counted in
--  it. Contributors and admins stay unlimited.
--
--  WHAT IT ADDS
--   * public.events.lets_starter text, null or one of the eight starter
--     ids. Null is an ordinary event. The check constraint is the list.
--   * A citizen insert with a starter is counted only against the
--     Let's cap. A blank string is stored as null so it cannot sneak
--     into that cap.
--   * On update, a non-admin cannot change the marker (set, clear, or
--     swap it) and cannot change category on a row that already has
--     one. Title and description stay editable. An admin
--     (public.is_admin()) or service_role can reclassify a row.
--
--  WHY THE CAP LOOKS AT THE CREATOR'S ROLE
--   events_enforce_* sorts before events_set_community_flag (Postgres
--   fires BEFORE triggers in name order). The flag trigger is what
--   sets community_contributor, so this function used to see the
--   column still false and return without limiting. The cap now
--   follows profiles.role = 'citizen'. Contributors and admins stay
--   unlimited, as migration 037 intended. A missing JWT does not skip
--   the cap: service_role inserts are still judged by created_by.
--
--  SECURITY
--   * SECURITY DEFINER, search_path ''. Names inside are schema-qualified.
--   * Direct calls (TG_OP is null) raise. The null-uid arm raises too.
--   * EXECUTE revoked from public, anon and authenticated. Granted to
--     service_role only, matching migration 140. The trigger fires as
--     the function owner; callers do not need EXECUTE.
--   * Keep this function owned by postgres (BYPASSRLS). It reads
--     app_settings, which has RLS (migration 065). A non-bypass owner
--     would make citizen event creation fail.
--
--  WHAT IT DOES NOT DO
--   It does not change who may insert an event (authenticated, and
--   created_by = auth.uid(), migration 012). It does not hide a
--   meeting point or a headcount differently from any other event.
--   It does not build the daily "I'm in" block (issue stage 3).
-- ════════════════════════════════════════════════════════════════════

begin;

alter table public.events
  add column if not exists lets_starter text;

alter table public.events
  drop constraint if exists events_lets_starter_known;

alter table public.events
  add constraint events_lets_starter_known
  check (
    lets_starter is null
    or lets_starter in (
      'evangelise',
      'run',
      'pray',
      'worship',
      'social',
      'clean-up',
      'coffee',
      'flashmob'
    )
  );

comment on column public.events.lets_starter is
  'Let''s gathering starter (issue 313). Null is an ordinary event and counts toward app_settings.community_event_rate_limit. A known id counts toward the separate Let''s cap (4 per window). Non-admins cannot change the marker or the category afterwards.';

create index if not exists events_lets_public_date_idx
  on public.events (date)
  where lets_starter is not null
    and status = 'published'
    and visibility = 'public';

create or replace function public.events_enforce_community_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_days int;
  v_count int;
  v_lets_cap int := 4;
  v_recent int;
  v_cfg jsonb;
begin
  -- Not a trigger. One guard: a direct call is refused whether or not a
  -- JWT is present. A missing JWT on a real trigger does not skip the
  -- cap; the creator's role is read below.
  if TG_OP is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if TG_OP = 'UPDATE' then
    if v_uid is null then
      if coalesce(auth.role(), '') = 'service_role' then
        return new;
      end if;
    elsif coalesce(public.is_admin(), false) then
      return new;
    end if;

    -- The marker is chosen at insert. Clearing it would turn a Let's
    -- row into an ordinary event that never used the ordinary cap.
    if new.lets_starter is distinct from old.lets_starter then
      raise exception 'lets_starter_locked: the Let''s marker cannot be changed.'
        using errcode = '42501';
    end if;

    if old.lets_starter is not null and new.category is distinct from old.category then
      raise exception 'lets_category_locked: the category of a Let''s gathering cannot be changed.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if TG_OP <> 'INSERT' then
    return new;
  end if;

  if new.lets_starter is not null and btrim(new.lets_starter) = '' then
    new.lets_starter := null;
  end if;

  -- A missing JWT does not skip the cap. The creator's role decides.
  select p.role into v_role
    from public.profiles p
   where p.id = new.created_by;
  if v_role is distinct from 'citizen' then
    return new;
  end if;

  select s.value into v_cfg
    from public.app_settings s
   where s.key = 'community_event_rate_limit';
  v_days := coalesce((v_cfg->>'days')::int, 30);
  v_count := coalesce((v_cfg->>'count')::int, 1);
  if v_days < 1 then
    v_days := 30;
  end if;
  if v_count < 1 then
    v_count := 1;
  end if;

  if new.lets_starter is not null then
    select count(*) into v_recent
      from public.events e
     where e.created_by = new.created_by
       and e.lets_starter is not null
       and e.created_at >= (pg_catalog.now() - pg_catalog.make_interval(days => v_days));

    if v_recent >= v_lets_cap then
      raise exception
        'lets_event_rate_limited: citizens may create % Let''s gathering(s) per % day(s); please wait and try again.',
        v_lets_cap, v_days
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  select count(*) into v_recent
    from public.events e
   where e.created_by = new.created_by
     and e.community_contributor = true
     and e.lets_starter is null
     and e.created_at >= (pg_catalog.now() - pg_catalog.make_interval(days => v_days));

  if v_recent >= v_count then
    raise exception
      'community_event_rate_limited: citizens may create % event(s) per % day(s); please wait and try again.',
      v_count, v_days
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.events_enforce_community_rate_limit() is
  'Caps citizen community events. Ordinary rows use app_settings.community_event_rate_limit. Let''s rows (lets_starter set) use a separate cap of 4 per the same day window and are not counted in the ordinary cap. Non-admins cannot change the marker or the category of a Let''s row. Direct calls are refused. search_path is empty.';

revoke all on function public.events_enforce_community_rate_limit() from public, anon, authenticated;
grant execute on function public.events_enforce_community_rate_limit() to service_role;

drop trigger if exists events_enforce_community_rate_limit_before_insert on public.events;
create trigger events_enforce_community_rate_limit_before_write
  before insert or update on public.events
  for each row
  execute function public.events_enforce_community_rate_limit();

commit;
