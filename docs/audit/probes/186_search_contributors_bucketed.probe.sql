-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 186_search_contributors_bucketed (S13 step 2). Run 2026-10-17 against the live
--  function right after the apply.
--  HOW: paste into the Supabase SQL runner / MCP execute_sql. It builds four synthetic approved Contributors (named
--  "Probe ...") with 99, 100, 250 and 0 followers from a pool of 250 synthetic users, calls search_contributors as anon, and
--  ends with RAISE EXCEPTION, so the whole transaction rolls back and NOTHING persists. One line per check, PASS or FAIL.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  f uuid[]; c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); c4 uuid := gen_random_uuid();
  r record; got text; res text[] := '{}';
begin
  f := array(select gen_random_uuid() from generate_series(1, 250));
  insert into auth.users (id, email) select u, 'probe-f' || row_number() over () || '@probe.example' from unnest(f) as u;
  insert into auth.users (id, email) values
    (c1, 'probe-c1@probe.example'), (c2, 'probe-c2@probe.example'), (c3, 'probe-c3@probe.example'), (c4, 'probe-c4@probe.example');
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-alpha', full_name = 'Probe Alpha' where id = c1;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-bravo', full_name = 'Probe Bravo' where id = c2;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-charlie', full_name = 'Probe Charlie' where id = c3;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-zulu', full_name = 'Probe Zulu' where id = c4;
  insert into public.follows (follower_id, followee_id) select f[i], c1 from generate_series(1, 99) as i;
  insert into public.follows (follower_id, followee_id) select f[i], c2 from generate_series(1, 100) as i;
  insert into public.follows (follower_id, followee_id) select f[i], c3 from generate_series(1, 250) as i;

  execute 'set local role anon';
  got := '';
  for r in select * from public.search_contributors('probe', null, null, null, 'followers', 25) loop
    got := got || r.full_name || '=' || r.followers_count || ';';
  end loop;
  res := array_append(res, (case when got = 'Probe Charlie=250;Probe Bravo=100;Probe Alpha=0;Probe Zulu=0;' then 'PASS' else 'FAIL' end)
    || ' anon search by followers returns buckets 250, 100, 0, 0 (99 shows as 0) and the two zeros fall back to name order (got ' || got || ')');
  got := '';
  for r in select * from public.search_contributors('probe', null, null, null, 'auto', 25) loop
    got := got || r.full_name || '=' || r.followers_count || ';';
  end loop;
  res := array_append(res, (case when got like '%Probe Charlie=250;%' and got not like '%=99;%' and got not like '%=249;%' then 'PASS' else 'FAIL' end)
    || ' the auto sort carries the same buckets and never an exact figure (got ' || got || ')');
  execute 'reset role';

  res := array_append(res, (case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'search_contributors' and p.prosecdef = false
        and p.proacl::text like '%anon=X%' and p.proacl::text like '%authenticated=X%') = 1 then 'PASS' else 'FAIL' end)
    || ' search_contributors is still SECURITY INVOKER and still callable by anon and authenticated');

  raise exception 'PROBE RESULT (rolled back):%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
