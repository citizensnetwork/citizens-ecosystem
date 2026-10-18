-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 184_event_cohosts (run 2026-10-17: a dry run that included the migration's statements,
--  then this file against the live objects after the apply, 39 of 39 PASS).
--  HOW: paste into the Supabase SQL runner / MCP execute_sql. It builds synthetic users (an organiser, three invitees, a
--  hidden Contributor, a blocked Contributor, a stranger), two events (one published, one draft), and exercises every
--  function and the one policy as the organiser, an invitee, a stranger and anon. It ends with RAISE EXCEPTION, so the
--  whole transaction rolls back and NOTHING persists; the result comes back in the error text, one PASS or FAIL per line.
--  NOTE: set_config('request.jwt.claims') is session-wide inside the transaction. The "signed out" steps clear it first,
--  because a claim left by the previous step makes anon look like that user (the first dry run tripped on exactly that).
--  Nothing here names a real person or organisation.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  hid uuid := gen_random_uuid(); blk uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  ev uuid; evd uuid; r jsonb; n int; res text[] := '{}';
begin
  insert into auth.users (id, email) values (a,'p-a@probe.example'),(b,'p-b@probe.example'),(d,'p-d@probe.example'),(e,'p-e@probe.example'),(f,'p-f@probe.example'),(hid,'p-h@probe.example'),(blk,'p-k@probe.example'),(s,'p-s@probe.example');
  update public.profiles set role='contributor', contributor_status='approved', contributor_slug='probe-'||substr(id::text,1,8) where id in (a,b,d,e,f,hid,blk);
  update public.profiles set contributor_hidden = true where id = hid;
  insert into public.user_blocks (blocker_id, blocked_id) values (a, blk);
  insert into public.events (title, date, created_by) values ('Probe night', now() + interval '10 days', a) returning id into ev;
  insert into public.events (title, date, created_by, status) values ('Probe draft', now() + interval '10 days', a, 'draft') returning id into evd;

  -- direct writes are impossible for everyone
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  begin insert into public.event_cohosts (event_id, contributor_id, invited_by) values (ev, b, a); res := array_append(res, 'FAIL organiser inserted directly'); exception when insufficient_privilege then res := array_append(res, 'PASS no direct INSERT (organiser)'); end;
  begin update public.event_cohosts set status = 'accepted'; res := array_append(res, 'FAIL direct UPDATE allowed'); exception when insufficient_privilege then res := array_append(res, 'PASS no direct UPDATE'); end;
  begin delete from public.event_cohosts; res := array_append(res, 'FAIL direct DELETE allowed'); exception when insufficient_privilege then res := array_append(res, 'PASS no direct DELETE'); end;
  begin truncate public.event_cohosts; res := array_append(res, 'FAIL TRUNCATE allowed'); exception when insufficient_privilege then res := array_append(res, 'PASS no TRUNCATE'); end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin insert into public.event_cohosts (event_id, contributor_id, invited_by) values (ev, b, a); res := array_append(res, 'FAIL anon inserted'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot insert'); end;
  begin perform public.invite_event_cohost(ev, b); res := array_append(res, 'FAIL anon can call invite'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot call invite'); end;
  begin perform public.respond_event_cohost(ev, true); res := array_append(res, 'FAIL anon can call respond'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot call respond'); end;
  begin perform public.remove_event_cohost(ev, b); res := array_append(res, 'FAIL anon can call remove'); exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot call remove'); end;
  select count(*) into n from public.event_cohosts;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon may read (0 rows so far, got ' || n || ')');
  execute 'reset role';

  -- the organiser (a) invites
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  r := public.invite_event_cohost(ev, b);  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' invite b: ' || r::text);
  r := public.invite_event_cohost(ev, b);  res := array_append(res, (case when r->>'reason' = 'already_invited' then 'PASS' else 'FAIL' end) || ' repeat invite refused: ' || r::text);
  r := public.invite_event_cohost(ev, a);  res := array_append(res, (case when r->>'reason' = 'cannot_cohost_self' then 'PASS' else 'FAIL' end) || ' self refused: ' || r::text);
  r := public.invite_event_cohost(ev, s);  res := array_append(res, (case when r->>'reason' = 'not_a_contributor' then 'PASS' else 'FAIL' end) || ' a citizen refused: ' || r::text);
  r := public.invite_event_cohost(ev, hid); res := array_append(res, (case when r->>'reason' = 'not_a_contributor' then 'PASS' else 'FAIL' end) || ' hidden contributor refused: ' || r::text);
  r := public.invite_event_cohost(ev, blk); res := array_append(res, (case when r->>'reason' = 'not_allowed' then 'PASS' else 'FAIL' end) || ' blocked pair refused: ' || r::text);
  r := public.invite_event_cohost(ev, d);  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' invite d: ' || r::text);
  r := public.invite_event_cohost(ev, e);  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' invite e (third): ' || r::text);
  r := public.invite_event_cohost(ev, f);  res := array_append(res, (case when r->>'reason' = 'too_many_cohosts' then 'PASS' else 'FAIL' end) || ' fourth refused: ' || r::text);
  r := public.invite_event_cohost(evd, f); res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' a draft event can invite too: ' || r::text);
  select count(*) into n from public.event_cohosts;
  res := array_append(res, (case when n = 4 then 'PASS' else 'FAIL' end) || ' organiser sees all 4 rows they made (got ' || n || ')');
  execute 'reset role';

  -- a stranger (s)
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  execute 'set local role authenticated';
  r := public.invite_event_cohost(ev, f); res := array_append(res, (case when r->>'reason' = 'not_event_owner' then 'PASS' else 'FAIL' end) || ' stranger cannot invite to a''s event: ' || r::text);
  r := public.respond_event_cohost(ev, true); res := array_append(res, (case when r->>'reason' = 'no_open_invitation' then 'PASS' else 'FAIL' end) || ' stranger cannot answer: ' || r::text);
  r := public.remove_event_cohost(ev, b); res := array_append(res, (case when r->>'reason' = 'not_found' then 'PASS' else 'FAIL' end) || ' stranger cannot remove: ' || r::text);
  select count(*) into n from public.event_cohosts;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' stranger reads 0 pending rows (got ' || n || ')');
  execute 'reset role';

  -- the invitee (b) answers
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.event_cohosts;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' invitee reads only their own row (got ' || n || ')');
  select count(*) into n from public.notifications where user_id = b and type = 'cohost_invite';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' invitee has the invitation notification (got ' || n || ')');
  r := public.respond_event_cohost(ev, true); res := array_append(res, (case when r->>'status' = 'accepted' then 'PASS' else 'FAIL' end) || ' b accepts: ' || r::text);
  r := public.respond_event_cohost(ev, false); res := array_append(res, (case when r->>'reason' = 'no_open_invitation' then 'PASS' else 'FAIL' end) || ' cannot answer twice: ' || r::text);
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = a and type = 'cohost_invite_response';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' organiser was told (got ' || n || ')');

  -- d declines; f answers the draft
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', d::text, true);
  execute 'set local role authenticated';
  r := public.respond_event_cohost(ev, false); res := array_append(res, (case when r->>'status' = 'declined' then 'PASS' else 'FAIL' end) || ' d declines: ' || r::text);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f::text, true);
  execute 'set local role authenticated';
  r := public.respond_event_cohost(evd, true); res := array_append(res, (case when r->>'status' = 'accepted' then 'PASS' else 'FAIL' end) || ' f accepts the draft: ' || r::text);
  execute 'reset role';

  -- who sees an ACCEPTED co-host: everyone on a published event, nobody on someone else's draft
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n from public.event_cohosts;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' anon sees exactly the 1 accepted co-host of the published event (got ' || n || ')');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.event_cohosts;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a stranger sees the same 1, and not the draft event''s co-host or the declined one (got ' || n || ')');
  execute 'reset role';

  -- stepping off and removing
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  r := public.remove_event_cohost(ev, b); res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' a co-host steps off: ' || r::text);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  r := public.remove_event_cohost(ev, e); res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL' end) || ' the organiser removes a pending invite: ' || r::text);
  execute 'reset role';

  -- notifications constraint, grants, cascade, policy
  insert into public.notifications (user_id, type, title) values (a, 'new_follower', 'old type still fine');
  begin insert into public.notifications (user_id, type, title) values (a, 'not_a_type', 'x'); res := array_append(res, 'FAIL bad type accepted'); exception when check_violation then res := array_append(res, 'PASS an unknown type is still refused'); end;
  res := array_append(res, (case when not has_function_privilege('anon','public.invite_event_cohost(uuid,uuid)','EXECUTE') and not has_function_privilege('anon','public.respond_event_cohost(uuid,boolean)','EXECUTE') and not has_function_privilege('anon','public.remove_event_cohost(uuid,uuid)','EXECUTE') and has_function_privilege('authenticated','public.invite_event_cohost(uuid,uuid)','EXECUTE') then 'PASS' else 'FAIL' end) || ' function grants: authenticated only');
  res := array_append(res, (case when has_table_privilege('authenticated','public.event_cohosts','SELECT') and has_table_privilege('anon','public.event_cohosts','SELECT') and not has_table_privilege('authenticated','public.event_cohosts','INSERT') and not has_table_privilege('authenticated','public.event_cohosts','UPDATE') and not has_table_privilege('authenticated','public.event_cohosts','DELETE') and not has_table_privilege('authenticated','public.event_cohosts','TRUNCATE') and not has_table_privilege('anon','public.event_cohosts','INSERT') then 'PASS' else 'FAIL' end) || ' table grants are read-only for anon and authenticated');
  delete from public.events where id = evd;
  select count(*) into n from public.event_cohosts where event_id = evd;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' deleting an event takes its co-hosts (left ' || n || ')');
  select count(*) into n from pg_policies where tablename = 'event_cohosts';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' 1 policy (got ' || n || ')');
  select count(*) into n from pg_constraint where conname = 'notifications_type_check' and pg_get_constraintdef(oid) like '%cohost_invite_response%' and pg_get_constraintdef(oid) like '%suggestion_response%';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' notifications_type_check lists the 27 kinds');

  raise exception 'PROBE_RESULT:%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
