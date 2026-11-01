-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 200. Run AFTER the apply, in the
--  SQL editor. Synthetic users only. Ends with RAISE EXCEPTION so
--  NOTHING persists. The error text is one PASS or FAIL per line.
--  NOT a live apply. Do not run this until migration 200 is applied.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  conv uuid := gen_random_uuid();
  n int;
  ok boolean;
  js jsonb;
  res text[] := '{}';
begin
  if has_function_privilege('anon', 'public.resolve_api_key(text)', 'execute')
     or has_function_privilege('authenticated', 'public.resolve_api_key(text)', 'execute') then
    res := array_append(res, 'FAIL a client role can execute resolve_api_key'::text);
  else
    res := array_append(res, 'PASS clients cannot execute resolve_api_key'::text);
  end if;

  if not has_function_privilege('service_role', 'public.resolve_api_key(text)', 'execute') then
    res := array_append(res, 'FAIL service_role cannot execute resolve_api_key'::text);
  else
    res := array_append(res, 'PASS service_role can execute resolve_api_key'::text);
  end if;

  if has_function_privilege('anon', 'public.is_conversation_participant(uuid,uuid)', 'execute') then
    res := array_append(res, 'FAIL anon can execute is_conversation_participant'::text);
  else
    res := array_append(res, 'PASS anon cannot execute is_conversation_participant'::text);
  end if;

  if not has_function_privilege('authenticated', 'public.is_conversation_participant(uuid,uuid)', 'execute') then
    res := array_append(res, 'FAIL authenticated cannot execute is_conversation_participant'::text);
  else
    res := array_append(res, 'PASS authenticated can execute is_conversation_participant'::text);
  end if;

  if has_function_privilege('anon', 'public.trending_events(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.trending_events(integer)', 'execute')
     or has_function_privilege('service_role', 'public.trending_events(integer)', 'execute') then
    res := array_append(res, 'FAIL a client role can execute trending_events'::text);
  else
    res := array_append(res, 'PASS clients cannot execute trending_events'::text);
  end if;

  if has_function_privilege('anon', 'public.get_public_team(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.get_public_team(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.get_public_team(uuid)', 'execute') then
    res := array_append(res, 'FAIL a client role can execute get_public_team'::text);
  else
    res := array_append(res, 'PASS clients cannot execute get_public_team'::text);
  end if;

  if not has_function_privilege('anon', 'public.is_admin()', 'execute')
     or not has_function_privilege('anon', 'public.caller_may_read_private_event(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.follower_count_public(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.get_active_map_bubbles()', 'execute')
     or not has_function_privilege('anon', 'public.get_community_ideas()', 'execute')
     or not has_function_privilege('anon', 'public.get_contributor_public_stats(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.get_public_contributor_analytics(uuid,integer)', 'execute')
     or not has_function_privilege('anon', 'public.get_search_autocomplete(text,integer)', 'execute')
     or not has_function_privilege('anon', 'wear.get_concept_proposal_tags(uuid)', 'execute') then
    res := array_append(res, 'FAIL anon lost a public read it still needs'::text);
  else
    res := array_append(res, 'PASS anon still executes the nine public functions'::text);
  end if;

  execute 'set local role anon';
  select public.is_admin() into ok;
  res := array_append(res, ((case when ok is false then 'PASS' else 'FAIL' end) || ' anon is_admin() is false')::text);
  select count(*) into n from public.events;
  res := array_append(res, ((case when n >= 0 then 'PASS' else 'FAIL' end) || ' anon can still read events')::text);
  select count(*) into n from public.get_active_map_bubbles();
  res := array_append(res, ((case when n >= 0 then 'PASS' else 'FAIL' end) || ' anon can still read map bubbles')::text);
  select public.follower_count_public(gen_random_uuid()) into n;
  res := array_append(res, ((case when n = 0 then 'PASS' else 'FAIL' end) || ' anon follower bucket of an unknown id is 0')::text);
  begin
    perform public.resolve_api_key('not-a-real-key-padding-000000');
    res := array_append(res, 'FAIL anon call to resolve_api_key did not fail'::text);
  exception
    when insufficient_privilege then
      res := array_append(res, 'PASS anon call to resolve_api_key is denied'::text);
  end;
  begin
    select count(*) into n from public.messages;
    res := array_append(res, ((case when n = 0 then 'PASS' else 'FAIL' end) || ' anon sees no messages')::text);
  exception
    when insufficient_privilege then
      res := array_append(res, 'FAIL anon message read was denied instead of empty'::text);
  end;
  execute 'reset role';

  insert into auth.users (id, email) values
    (a, 'probe-a@probe.example'),
    (b, 'probe-b@probe.example');
  insert into public.conversations (id) values (conv);
  insert into public.conversation_participants (conversation_id, user_id) values (conv, a), (conv, b);
  insert into public.messages (conversation_id, sender_id, body) values (conv, a, 'probe');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select public.is_conversation_participant(conv, a) into ok;
  res := array_append(res, ((case when ok is true then 'PASS' else 'FAIL' end) || ' a member can confirm their own seat')::text);
  select public.is_conversation_participant(conv, b) into ok;
  res := array_append(res, ((case when ok is false then 'PASS' else 'FAIL' end) || ' a member cannot test someone else''s seat')::text);
  select count(*) into n from public.messages where conversation_id = conv;
  res := array_append(res, ((case when n = 1 then 'PASS' else 'FAIL' end) || ' a member can still read the thread')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role service_role';
  select public.resolve_api_key('not-a-real-key-padding-000000') into js;
  res := array_append(res, ((case when js is null then 'PASS' else 'FAIL' end) || ' service_role resolve of an unknown key is null')::text);
  execute 'reset role';

  raise exception '%', array_to_string(res, E'\n');
end;
$probe$;
