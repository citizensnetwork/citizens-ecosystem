-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 202 (Let's gatherings).
--  Run AFTER Stephen applies 202_lets_gatherings.sql. Synthetic users
--  only. Ends with RAISE EXCEPTION so NOTHING persists.
--  NOT a live apply. Do not run this until migration 202 is applied.
--
--  It checks: a citizen's second ordinary event in the window is
--  refused; two Let's events are allowed and do not use up that cap;
--  a contributor is not capped; an unknown starter is refused; a
--  non-admin update cannot clear the marker; anon and authenticated
--  cannot execute the function; search_path is empty.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  citizen uuid := gen_random_uuid();
  host uuid := gen_random_uuid();
  res text[] := '{}';
  marker text;
  def boolean;
  cfg text[];
  joined text;
begin
  insert into auth.users (id, email) values
    (citizen, 'probe202-citizen@probe.example'),
    (host, 'probe202-host@probe.example');

  update public.profiles set role = 'citizen' where id = citizen;
  update public.profiles set role = 'contributor' where id = host;

  insert into public.events (title, date, created_by, status, visibility)
  values ('Probe ordinary one', now() + interval '3 days', citizen, 'published', 'public');

  begin
    insert into public.events (title, date, created_by, status, visibility)
    values ('Probe ordinary two', now() + interval '4 days', citizen, 'published', 'public');
    res := array_append(res, 'FAIL a second ordinary community event was allowed');
  exception when others then
    if sqlerrm like '%community_event_rate_limited%' then
      res := array_append(res, 'PASS a second ordinary community event is still limited');
    else
      res := array_append(res, 'FAIL ordinary cap raised ' || sqlerrm);
    end if;
  end;

  insert into public.events (title, date, created_by, status, visibility, lets_starter)
  values ('Probe let us pray', now() + interval '5 days', citizen, 'published', 'public', 'pray');
  insert into public.events (title, date, created_by, status, visibility, lets_starter)
  values ('Probe let us run', now() + interval '6 days', citizen, 'published', 'public', 'run');
  res := array_append(res, 'PASS two Let''s events in the window were allowed');

  begin
    insert into public.events (title, date, created_by, status, visibility)
    values ('Probe ordinary three', now() + interval '7 days', citizen, 'published', 'public');
    res := array_append(res, 'FAIL Let''s events used up or cleared the ordinary cap');
  exception when others then
    if sqlerrm like '%community_event_rate_limited%' then
      res := array_append(res, 'PASS Let''s events do not count toward the ordinary cap');
    else
      res := array_append(res, 'FAIL cap after Let''s raised ' || sqlerrm);
    end if;
  end;

  insert into public.events (title, date, created_by, status, visibility)
  values ('Probe host one', now() + interval '3 days', host, 'published', 'public');
  insert into public.events (title, date, created_by, status, visibility)
  values ('Probe host two', now() + interval '4 days', host, 'published', 'public');
  res := array_append(res, 'PASS a contributor can still create two ordinary events');

  begin
    insert into public.events (title, date, created_by, lets_starter)
    values ('Probe unknown starter', now() + interval '8 days', citizen, 'not-a-starter');
    res := array_append(res, 'FAIL an unknown starter was stored');
  exception when check_violation then
    res := array_append(res, 'PASS an unknown starter is refused');
  when others then
    res := array_append(res, 'FAIL unknown starter raised ' || sqlerrm);
  end;

  update public.events
     set lets_starter = null
   where created_by = citizen and lets_starter = 'pray';
  select lets_starter into marker
    from public.events
   where created_by = citizen and title = 'Probe let us pray';
  res := array_append(res, (case when marker = 'pray' then 'PASS' else 'FAIL marker=' || coalesce(marker, 'null') end)
    || ' a non-admin update cannot clear the Let''s marker');

  res := array_append(res, (case
    when has_function_privilege('anon', 'public.events_enforce_community_rate_limit()', 'execute') then 'FAIL anon can execute'
    else 'PASS anon cannot execute' end));
  res := array_append(res, (case
    when has_function_privilege('authenticated', 'public.events_enforce_community_rate_limit()', 'execute') then 'FAIL authenticated can execute'
    else 'PASS authenticated cannot execute' end));
  res := array_append(res, (case
    when has_function_privilege('service_role', 'public.events_enforce_community_rate_limit()', 'execute') then 'PASS service_role can execute'
    else 'FAIL service_role cannot execute' end));

  select p.prosecdef, p.proconfig into def, cfg
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'events_enforce_community_rate_limit';
  select string_agg(c, ',') into joined from unnest(cfg) c;
  res := array_append(res, (case
    when def and joined like '%search_path=%' and joined not like '%public%' then 'PASS security definer with an empty search_path'
    else 'FAIL definer=' || coalesce(def::text, 'null') || ' config=' || coalesce(joined, 'null') end));

  raise exception '%', array_to_string(res, E'\n');
end
$probe$;
