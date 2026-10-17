-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 188_moments (P2-05, adapted). Run 2026-10-17 against the live table right after the apply.
--  HOW: paste into the Supabase SQL runner / MCP execute_sql. It builds synthetic users (an approved Contributor, a second
--  one, a citizen), exercises every policy as anon, the author, a stranger and a citizen, and ends with RAISE EXCEPTION, so
--  the whole transaction rolls back and NOTHING persists. One line per check, PASS or FAIL. Nothing here names a real person
--  or organisation.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); cit uuid := gen_random_uuid();
  n int; m uuid; res text[] := '{}';
begin
  insert into auth.users (id, email) values (a, 'probe-a@probe.example'), (b, 'probe-b@probe.example'), (cit, 'probe-cit@probe.example');
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-a' where id = a;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-b' where id = b;

  -- as the table owner: one live note and one that ended two days ago (the author's), to read back through each role
  insert into public.moments (contributor_id, body) values (a, 'A live note');
  insert into public.moments (contributor_id, body, created_at, expires_at)
    values (a, 'An ended note', now() - interval '48 hours', now() - interval '24 hours');

  -- anon: reads only the live one, cannot write
  execute 'set local role anon';
  select count(*) into n from public.moments;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a visitor reads the 1 live note and not the ended one (got ' || n || ')');
  begin insert into public.moments (contributor_id, body) values (a, 'x'); res := array_append(res, 'FAIL anon can insert'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot insert'); end;
  begin delete from public.moments; res := array_append(res, 'FAIL anon can delete'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot delete'); end;
  execute 'reset role';

  -- a stranger (Contributor b): reads only live ones, deletes none of a's
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.moments;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a stranger reads only the live note (got ' || n || ')');
  delete from public.moments; get diagnostics n = row_count;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a stranger deletes 0 of a''s notes (got ' || n || ')');
  begin insert into public.moments (contributor_id, body) values (a, 'impersonated'); res := array_append(res, 'FAIL posted as someone else'); exception when insufficient_privilege then res := array_append(res, 'PASS cannot post as someone else'); end;
  execute 'reset role';

  -- a citizen cannot post
  perform set_config('request.jwt.claims', json_build_object('sub', cit, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cit::text, true);
  execute 'set local role authenticated';
  begin insert into public.moments (contributor_id, body) values (cit, 'a citizen note'); res := array_append(res, 'FAIL a citizen posted'); exception when insufficient_privilege then res := array_append(res, 'PASS a citizen cannot post'); end;
  execute 'reset role';

  -- the author (a)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.moments;
  res := array_append(res, (case when n = 2 then 'PASS' else 'FAIL' end) || ' the author reads the live note AND their ended one (got ' || n || ')');
  insert into public.moments (contributor_id, body) values (a, 'Second live note') returning id into m;
  res := array_append(res, 'PASS an approved Contributor can post');
  begin insert into public.moments (contributor_id, body) values (a, ''); res := array_append(res, 'FAIL empty body accepted'); exception when check_violation then res := array_append(res, 'PASS an empty note is refused'); end;
  begin insert into public.moments (contributor_id, body) values (a, repeat('x', 281)); res := array_append(res, 'FAIL 281 characters accepted'); exception when check_violation then res := array_append(res, 'PASS 281 characters are refused'); end;
  insert into public.moments (contributor_id, body) values (a, repeat('x', 280));
  res := array_append(res, 'PASS exactly 280 characters are accepted');
  begin insert into public.moments (contributor_id, body, expires_at) values (a, 'too long a life', now() + interval '48 hours'); res := array_append(res, 'FAIL a 48 hour expiry accepted'); exception when check_violation then res := array_append(res, 'PASS an expiry past 24 hours is refused'); end;
  begin insert into public.moments (contributor_id, body, image_url) values (a, 'long url', 'https://x.example/' || repeat('a', 500)); res := array_append(res, 'FAIL a 500+ character image url accepted'); exception when check_violation then res := array_append(res, 'PASS an image url over 500 characters is refused'); end;
  -- live so far: the first, the second and the 280-character one = 3; add two more = 5; the sixth is refused (the ended one does not count)
  insert into public.moments (contributor_id, body) values (a, 'Fourth'), (a, 'Fifth');
  begin insert into public.moments (contributor_id, body) values (a, 'Sixth'); res := array_append(res, 'FAIL a sixth live note accepted'); exception when raise_exception then res := array_append(res, (case when sqlerrm = 'moments_limit' then 'PASS' else 'FAIL' end) || ' the sixth live note is refused with moments_limit (' || sqlerrm || ')'); end;
  begin update public.moments set body = 'edited' where id = m; res := array_append(res, 'FAIL update allowed'); exception when insufficient_privilege then res := array_append(res, 'PASS no UPDATE (a note is immutable)'); end;
  begin truncate public.moments; res := array_append(res, 'FAIL truncate allowed'); exception when insufficient_privilege then res := array_append(res, 'PASS no TRUNCATE'); end;
  delete from public.moments where id = m; get diagnostics n = row_count;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' the author takes their own note down (got ' || n || ')');
  begin perform public.moments_cap(); res := array_append(res, 'FAIL the cap function is callable'); exception when insufficient_privilege then res := array_append(res, 'PASS the cap function is not callable by a signed-in person'); end;
  execute 'reset role';

  -- a note can be reported; an unknown target is still refused
  insert into public.reports (reporter_id, target_type, target_id, reason) values (b, 'moment', gen_random_uuid(), 'spam');
  res := array_append(res, 'PASS a report about a moment is accepted');
  begin insert into public.reports (reporter_id, target_type, target_id, reason) values (b, 'nonsense', gen_random_uuid(), 'spam'); res := array_append(res, 'FAIL an unknown target accepted'); exception when check_violation then res := array_append(res, 'PASS an unknown report target is still refused'); end;

  -- table grants: select only for anon, select + insert + delete for authenticated
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and table_name = 'moments'
    and ((grantee = 'anon' and privilege_type <> 'SELECT') or (grantee = 'authenticated' and privilege_type not in ('SELECT', 'INSERT', 'DELETE')) or grantee = 'PUBLIC');
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' the grants are exactly select for anon and select, insert, delete for authenticated (extra: ' || n || ')');

  -- deleting the Contributor takes their notes; the clean-up job exists
  delete from auth.users where id = a;
  select count(*) into n from public.moments where contributor_id = a;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' deleting the Contributor takes their notes (left ' || n || ')');
  res := array_append(res, (case when exists (select 1 from cron.job where jobname = 'moments-cleanup' and active) then 'PASS' else 'FAIL' end) || ' the daily clean-up job is registered and active');

  raise exception 'PROBE RESULT (rolled back):%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
