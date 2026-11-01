-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 202 (Let's gatherings).
--  Run AFTER Stephen applies 202_lets_gatherings.sql. Synthetic users
--  only. Ends with RAISE EXCEPTION so NOTHING persists.
--  NOT a live apply. Do not run this until migration 202 is applied.
--
--  It checks: a citizen's second ordinary event in the window is
--  refused; four Let's events are allowed and a fifth is refused;
--  those Let's rows do not use up the ordinary cap; a contributor is
--  not capped; an unknown starter is refused; a non-admin cannot
--  change the category or clear the marker, and can still edit the
--  title; anon and authenticated cannot execute the function;
--  search_path is empty.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  citizen uuid := gen_random_uuid();
  host uuid := gen_random_uuid();
  res text[] := '{}';
  i int;
  starter text;
  before_cat text;
  after_title text;
  after_cat text;
  after_marker text;
  def boolean;
  cfg text[];
  joined text;
  starters text[] := array['pray', 'run', 'worship', 'social', 'coffee'];
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

  for i in 1..4 loop
    insert into public.events (title, date, created_by, status, visibility, lets_starter, category)
    values (
      'Probe lets ' || i,
      now() + (i || ' days')::interval,
      citizen,
      'published',
      'public',
      starters[i],
      'worship-prayer'
    );
  end loop;
  res := array_append(res, 'PASS four Let''s events in the window were allowed');

  begin
    insert into public.events (title, date, created_by, status, visibility, lets_starter, category)
    values ('Probe lets 5', now() + interval '9 days', citizen, 'published', 'public', starters[5], 'worship-prayer');
    res := array_append(res, 'FAIL a fifth Let''s event in the window was allowed');
  exception when others then
    if sqlerrm like '%lets_event_rate_limited%' then
      res := array_append(res, 'PASS a fifth Let''s event in 30 days is refused');
    else
      res := array_append(res, 'FAIL fifth Let''s raised ' || sqlerrm);
    end if;
  end;

  begin
    insert into public.events (title, date, created_by, status, visibility)
    values ('Probe ordinary three', now() + interval '10 days', citizen, 'published', 'public');
    res := array_append(res, 'FAIL Let''s events used up or cleared the ordinary cap');
  exception when others then
    if sqlerrm like '%community_event_rate_limited%' then
      res := array_append(res, 'PASS the ordinary cap is unchanged after Let''s events');
    else
      res := array_append(res, 'FAIL cap after Let''s raised ' || sqlerrm);
    end if;
  end;

  for i in 1..5 loop
    insert into public.events (title, date, created_by, status, visibility, lets_starter)
    values ('Probe host lets ' || i, now() + (i || ' days')::interval, host, 'published', 'public', starters[i]);
  end loop;
  insert into public.events (title, date, created_by, status, visibility)
  values ('Probe host one', now() + interval '3 days', host, 'published', 'public');
  insert into public.events (title, date, created_by, status, visibility)
  values ('Probe host two', now() + interval '4 days', host, 'published', 'public');
  res := array_append(res, 'PASS a contributor can create five Let''s events and two ordinary events');

  begin
    insert into public.events (title, date, created_by, lets_starter)
    values ('Probe unknown starter', now() + interval '8 days', citizen, 'not-a-starter');
    res := array_append(res, 'FAIL an unknown starter was stored');
  exception when check_violation then
    res := array_append(res, 'PASS an unknown starter is refused');
  when others then
    res := array_append(res, 'FAIL unknown starter raised ' || sqlerrm);
  end;

  select category into before_cat
    from public.events
   where created_by = citizen and title = 'Probe lets 1';

  begin
    update public.events
       set category = 'sport-recreation'
     where created_by = citizen and title = 'Probe lets 1';
    res := array_append(res, 'FAIL a citizen changed the category of a Let''s event');
  exception when others then
    if sqlerrm like '%lets_category_locked%' then
      res := array_append(res, 'PASS a citizen cannot change the category of a Let''s event');
    else
      res := array_append(res, 'FAIL category lock raised ' || sqlerrm);
    end if;
  end;

  update public.events
     set title = 'Probe lets 1 renamed', description = 'Still a gathering'
   where created_by = citizen and lets_starter = 'pray';
  select title, category, lets_starter
    into after_title, after_cat, after_marker
    from public.events
   where created_by = citizen and lets_starter = 'pray';
  res := array_append(res, (case
    when after_title = 'Probe lets 1 renamed'
     and after_cat is not distinct from before_cat
     and after_marker = 'pray'
    then 'PASS' else 'FAIL title=' || coalesce(after_title, 'null') || ' category changed' end)
    || ' a citizen can edit the title and the category stays');

  begin
    update public.events
       set lets_starter = null
     where created_by = citizen and title = 'Probe lets 1 renamed';
    res := array_append(res, 'FAIL a citizen cleared the Let''s marker');
  exception when others then
    if sqlerrm like '%lets_starter_locked%' then
      res := array_append(res, 'PASS a citizen cannot clear the Let''s marker');
    else
      res := array_append(res, 'FAIL marker lock raised ' || sqlerrm);
    end if;
  end;

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
