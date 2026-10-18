-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 189_follows_tighten (S13 step 4). Run 2026-10-18 against the live tables right after the apply.
--  HOW: paste into the Supabase SQL runner / MCP execute_sql. It builds synthetic users (a, b, x and an approved Contributor c with an
--  event), exercises the two closed tables as anon, as the owner of a row and as a stranger, checks that the count functions and the
--  Convince policy still work, and ends with RAISE EXCEPTION, so the whole transaction rolls back and NOTHING persists.
--  One line per check, PASS or FAIL. Nothing here names a real person or organisation.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); x uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  pl uuid; ev uuid; ev2 uuid; n bigint; ok boolean; res text[] := '{}';
begin
  insert into auth.users (id, email) values (a, 'probe-a@probe.example'), (b, 'probe-b@probe.example'), (x, 'probe-x@probe.example'), (c, 'probe-c@probe.example');
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-contrib', full_name = 'Probe Contrib' where id = c;
  insert into public.places (name, latitude, longitude, created_by) values ('Probe place', -25.7, 28.2, c) returning id into pl;
  insert into public.events (title, date, created_by) values ('Probe event', now() + interval '7 days', c) returning id into ev;
  insert into public.follows (follower_id, followee_id) values (a, c), (b, c);
  insert into public.place_follows (user_id, place_id) values (a, pl);
  insert into public.rsvps (user_id, event_id, status) values (b, ev, 'considering');
  -- a organises ev2 (only an organiser can read other people's rsvps, which the Convince policy's third condition needs: that is the rsvps policy, not this migration)
  insert into public.events (title, date, created_by) values ('Probe event of a', now() + interval '8 days', a) returning id into ev2;
  insert into public.rsvps (user_id, event_id, status) values (b, ev2, 'considering');

  -- anon: nothing on the two tables
  execute 'set local role anon';
  begin perform 1 from public.follows; res := array_append(res, 'FAIL anon can select follows'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot select follows'); end;
  begin perform 1 from public.place_follows; res := array_append(res, 'FAIL anon can select place_follows'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot select place_follows'); end;
  begin insert into public.follows (follower_id, followee_id) values (a, b); res := array_append(res, 'FAIL anon can insert follows'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot insert follows'); end;
  select public.follower_count_public(c) into n;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon still gets the public bucket through the function (2 followers -> 0, got ' || n || ')');
  select count(*) into n from public.search_contributors('probe', null, null, null, 'followers', 25);
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' anon search still works with the table closed (got ' || n || ' row)');
  execute 'reset role';

  -- the owner of a row (a): own rows only
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.follows;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a reads only a''s own follow (b''s is hidden), got ' || n);
  select count(*) into n from public.place_follows;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a reads own place follow, got ' || n);
  execute 'reset role';

  -- the Contributor c: cannot list their followers any more, but still gets the count and the messaging rule
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.follows;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' the Contributor can no longer list who follows them (got ' || n || ')');
  select public.follower_count_exact(c) into n;
  res := array_append(res, (case when n = 2 then 'PASS' else 'FAIL' end) || ' ...but still sees HOW MANY (exact 2, got ' || n || ')');
  select public.recipient_follows_me(a) into ok;
  res := array_append(res, (case when ok is true then 'PASS' else 'FAIL' end) || ' ...and the messaging rule still sees that a follows them');
  select public.recipient_follows_me(x) into ok;
  res := array_append(res, (case when ok is not true then 'PASS' else 'FAIL' end) || ' ...and not that a stranger does');
  execute 'reset role';

  -- a stranger (x): sees none; can still follow and unfollow for themselves; cannot write a row for someone else
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', x::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.follows;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a stranger reads 0 follow rows (got ' || n || ')');
  insert into public.follows (follower_id, followee_id) values (x, c);
  select count(*) into n from public.follows;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a person can still follow, and reads that one row (got ' || n || ')');
  delete from public.follows where follower_id = x and followee_id = c; get diagnostics n = row_count;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' ...and unfollow (deleted ' || n || ')');
  begin insert into public.follows (follower_id, followee_id) values (a, b); res := array_append(res, 'FAIL wrote a follow for someone else'); exception when insufficient_privilege then res := array_append(res, 'PASS cannot write a follow row for someone else'); end;
  execute 'reset role';

  -- Convince keeps working for mutual friends: first a ONE-WAY follow (refused), then both ways (allowed)
  insert into public.follows (follower_id, followee_id) values (a, b);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select public.is_mutual_follow(b) into ok;
  res := array_append(res, (case when ok is not true then 'PASS' else 'FAIL' end) || ' a one-way follow is not mutual');
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev2); res := array_append(res, 'FAIL a one-way follower sent a convince'); exception when insufficient_privilege then res := array_append(res, 'PASS a one-way follower cannot send a convince'); end;
  execute 'reset role';
  insert into public.follows (follower_id, followee_id) values (b, a);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select public.is_mutual_follow(b) into ok;
  res := array_append(res, (case when ok is true then 'PASS' else 'FAIL' end) || ' is_mutual_follow(b) is true for a, who cannot read b''s own rows');
  insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev2);
  res := array_append(res, 'PASS mutual friends can still send a convince (the policy now asks is_mutual_follow)');
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (b, a, ev2); res := array_append(res, 'FAIL sent a convince as someone else'); exception when insufficient_privilege then res := array_append(res, 'PASS cannot send a convince as someone else'); end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', x::text, true);
  execute 'set local role authenticated';
  select public.is_mutual_follow(a) into ok;
  res := array_append(res, (case when ok is not true then 'PASS' else 'FAIL' end) || ' x asking about a (not x''s pair) is false: the function only ever speaks about the caller');
  execute 'reset role';

  -- the new function is not callable by the public key; the old DEFINER helpers still run
  res := array_append(res, (case when not has_function_privilege('anon', 'public.is_mutual_follow(uuid)', 'execute') and has_function_privilege('authenticated', 'public.is_mutual_follow(uuid)', 'execute') then 'PASS' else 'FAIL' end) || ' is_mutual_follow: signed-in yes, anon no');
  select public.count_friends(a) into n;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' count_friends (DEFINER) still counts the mutual pair (got ' || n || ')');

  -- grants: anon holds nothing on the two tables
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and table_name in ('follows', 'place_follows') and grantee = 'anon';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon holds no privilege on follows or place_follows (found ' || n || ')');

  raise exception 'PROBE RESULT (rolled back):%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
