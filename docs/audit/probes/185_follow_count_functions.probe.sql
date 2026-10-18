-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 185_follow_count_functions (S13 step 1). Run 2026-10-17 against the live functions
--  right after the apply.
--  HOW: paste into the Supabase SQL runner / MCP execute_sql. It builds synthetic users (a follower, a stranger, an approved
--  Contributor with a place, and 250 more followers), exercises every function as anon, as a signed-in caller and as a
--  stranger, and ends with RAISE EXCEPTION, so the whole transaction rolls back and NOTHING persists. The result comes back
--  in the error text: one line per check, PASS or FAIL. Nothing here names a real person or organisation.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  f uuid[]; pl uuid; n bigint; ok boolean; res text[] := '{}';
begin
  insert into auth.users (id, email) values
    (a, 'probe-a@probe.example'), (b, 'probe-b@probe.example'), (c, 'probe-c@probe.example');
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-contrib' where id = c;
  insert into public.places (name, latitude, longitude, created_by) values ('Probe place', -25.7, 28.2, c) returning id into pl;

  -- anon (the public key every browser carries)
  execute 'set local role anon';
  select public.follower_count_public(c) into n;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon can call follower_count_public (0 for no followers, got ' || n || ')');
  begin perform public.follower_count_exact(c); res := array_append(res, 'FAIL anon can call follower_count_exact'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot call follower_count_exact'); end;
  begin perform public.recipient_follows_me(a); res := array_append(res, 'FAIL anon can call recipient_follows_me'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot call recipient_follows_me'); end;
  begin perform public.count_friends(a); res := array_append(res, 'FAIL anon can call count_friends'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot call count_friends'); end;
  execute 'reset role';

  -- a signed-in person (a) follows the Contributor c and c's place (own rows, as today)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  insert into public.follows (follower_id, followee_id) values (a, c);
  insert into public.place_follows (user_id, place_id) values (a, pl);
  res := array_append(res, 'PASS a signed-in person can still follow a Contributor and a place (own rows)');
  select public.follower_count_exact(c) into n;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' signed-in follower_count_exact is the exact figure (1, got ' || n || ')');
  select public.recipient_follows_me(b) into ok;
  res := array_append(res, (case when ok is not true then 'PASS' else 'FAIL' end) || ' a asking about b: false (a is not followed by b)');
  execute 'reset role';

  -- the Contributor c asks "does a follow me or my place?" (yes) and "does stranger b?" (no)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'set local role authenticated';
  select public.recipient_follows_me(a) into ok;
  res := array_append(res, (case when ok is true then 'PASS' else 'FAIL' end) || ' c asking about a: true (a follows c)');
  select public.recipient_follows_me(b) into ok;
  res := array_append(res, (case when ok is not true then 'PASS' else 'FAIL' end) || ' c asking about stranger b: false');
  select public.follower_count_exact(c) into n;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' the Contributor sees the exact count (1, got ' || n || ')');
  execute 'reset role';
  -- a follower of only the Contributor's PLACE still counts: drop the Contributor follow, keep the place follow
  delete from public.follows where follower_id = a and followee_id = c;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'set local role authenticated';
  select public.recipient_follows_me(a) into ok;
  res := array_append(res, (case when ok is true then 'PASS' else 'FAIL' end) || ' a follower of only the Contributor''s place still counts');
  execute 'reset role';
  delete from public.place_follows where user_id = a;

  -- a stranger (b) cannot write a follow row for someone else
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  begin insert into public.follows (follower_id, followee_id) values (a, c); res := array_append(res, 'FAIL a stranger wrote a follow row for someone else'); exception when insufficient_privilege then res := array_append(res, 'PASS a stranger cannot write a follow row for someone else'); end;
  execute 'reset role';

  -- the buckets: 99 -> 0, 100 -> 100, 249 -> 100, 250 -> 250
  f := array(select gen_random_uuid() from generate_series(1, 250));
  insert into auth.users (id, email) select u, 'probe-f' || row_number() over () || '@probe.example' from unnest(f) as u;
  insert into public.follows (follower_id, followee_id) select f[i], c from generate_series(1, 99) as i;
  select public.follower_count_public(c) into n;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' 99 followers -> 0 (got ' || n || ')');
  insert into public.follows (follower_id, followee_id) select f[100], c;
  select public.follower_count_public(c) into n;
  res := array_append(res, (case when n = 100 then 'PASS' else 'FAIL' end) || ' 100 followers -> 100 (got ' || n || ')');
  insert into public.follows (follower_id, followee_id) select f[i], c from generate_series(101, 249) as i;
  select public.follower_count_public(c) into n;
  res := array_append(res, (case when n = 100 then 'PASS' else 'FAIL' end) || ' 249 followers -> 100 (got ' || n || ')');
  insert into public.follows (follower_id, followee_id) select f[250], c;
  select public.follower_count_public(c) into n;
  res := array_append(res, (case when n = 250 then 'PASS' else 'FAIL' end) || ' 250 followers -> 250 (got ' || n || ')');
  select public.follower_count_exact(c) into n;
  res := array_append(res, (case when n = 250 then 'PASS' else 'FAIL' end) || ' the exact count is 250 (got ' || n || ')');

  -- count_friends: one mutual pair counts once, in the DEFINER body
  insert into public.follows (follower_id, followee_id) values (c, f[1]);
  select public.count_friends(f[1]) into n;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' count_friends of one mutual pair is 1 (got ' || n || ')');

  raise exception 'PROBE RESULT (rolled back):%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
