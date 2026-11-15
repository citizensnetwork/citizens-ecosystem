-- Promise: break-glass support access, on a world's own side (ADR-001, decision 3).
--   * nobody inside the world can open a session or use a reader;
--   * a reader works only under an active session that is inside its time, and refuses the moment
--     the time has passed, whether or not the job has run;
--   * every read is logged, in this database, in the same step as the read;
--   * nothing is writable: not the session, not the log, not for anyone;
--   * the world's staff see it all, are told when it opens and ends, can make it wait for their
--     yes, and can end it at once.
--
-- Rights to CALL a function or USE the private schema are looked up, never exercised (see probe 02).

select pg_temp.probe_user('ada', 'admin');
select pg_temp.probe_user('abe', 'admin');
select pg_temp.probe_user('uma');
select pg_temp.probe_user('una');

-- A private conversation between two people, one message taken back.
insert into public.conversations default values returning set_config('probe.thread', id::text, true);
insert into public.conversation_participants (conversation_id, user_id)
values (current_setting('probe.thread')::uuid, current_setting('probe.uma')::uuid),
       (current_setting('probe.thread')::uuid, current_setting('probe.una')::uuid);
insert into public.messages (conversation_id, sender_id, body, created_at, deleted_at)
values (current_setting('probe.thread')::uuid, current_setting('probe.uma')::uuid, 'the first private words', now() - interval '2 minutes', null),
       (current_setting('probe.thread')::uuid, current_setting('probe.una')::uuid, 'words that were taken back', now() - interval '1 minute', now());

-- ── 1. Nobody inside the world reaches the private side (looked up) ──
do $probe$
declare
  v_role text;
  v_found text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_schema_privilege(v_role, 'engine', 'usage') then
      raise exception 'PROBE FAILED: % may use the private schema', v_role;
    end if;
    select p.proname::text into v_found
      from pg_proc p
     where p.pronamespace = 'engine'::regnamespace and has_function_privilege(v_role, p.oid, 'execute')
     limit 1;
    if v_found is not null then
      raise exception 'PROBE FAILED: % may call engine.%', v_role, v_found;
    end if;
    if has_table_privilege(v_role, 'public.support_sessions', 'insert, update, delete, truncate')
       or has_table_privilege(v_role, 'public.support_session_reads', 'insert, update, delete, truncate') then
      raise exception 'PROBE FAILED: % may write the support records', v_role;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.decide_support_session(uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.end_support_session(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.decide_support_session(uuid, boolean)', 'execute')
     or has_function_privilege('service_role', 'public.end_support_session(uuid)', 'execute') then
    raise exception 'PROBE FAILED: a visitor or the server may answer for the staff';
  end if;
end;
$probe$;

-- ── 2. A session opens (the default: staff are told, nothing waits) ──
select set_config('probe.grant', gen_random_uuid()::text, true);
select set_config('probe.session',
  engine.open_support_session(current_setting('probe.grant')::uuid, 'Ole Example', '  A partner cannot sign in.  ', now() + interval '2 hours') ->> 'session', true);

do $probe$
declare
  v_session public.support_sessions;
begin
  select s.* into v_session from public.support_sessions s where s.id = current_setting('probe.session')::uuid;
  if v_session.state <> 'active' or v_session.reason <> 'A partner cannot sign in.' then
    raise exception 'PROBE FAILED: the session did not open active with its reason';
  end if;
  -- Asked for two hours; this database allows 30 minutes by its own clock.
  if v_session.expires_at > now() + interval '30 minutes' or v_session.expires_at <= now() then
    raise exception 'PROBE FAILED: a session may last longer than 30 minutes';
  end if;
  if (select count(*) from public.notifications n
       where n.type = 'support_access' and n.data ->> 'event' = 'opened'
         and n.title = 'Support access opened' and n.body like '%Reason given: A partner cannot sign in.'
         and n.user_id in (current_setting('probe.ada')::uuid, current_setting('probe.abe')::uuid)) <> 2
     or exists (select 1 from public.notifications n
                 where n.type = 'support_access' and n.user_id in (current_setting('probe.uma')::uuid, current_setting('probe.una')::uuid)) then
    raise exception 'PROBE FAILED: the staff, and only the staff, were not told that support access opened';
  end if;
  -- One session at a time, and a grant is used once.
  begin
    perform engine.open_support_session(gen_random_uuid(), 'Ole Example', 'A second look at the same time.', now() + interval '10 minutes');
    raise exception 'PROBE FAILED: two sessions are open at once';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform engine.open_support_session(gen_random_uuid(), 'Ole Example', 'A grant of the past.', now() - interval '1 minute');
    raise exception 'PROBE FAILED: a grant whose time has passed opened a session';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'support_grant_expired' then raise; end if;
  end;
end;
$probe$;

-- ── 3. Every read is logged, and a thread needs its own reason ──────
do $probe$
declare
  v_session constant uuid := current_setting('probe.session')::uuid;
  v_uma constant uuid := current_setting('probe.uma')::uuid;
  v_thread constant uuid := current_setting('probe.thread')::uuid;
  v_result jsonb;
  v_before integer;
begin
  v_result := engine.support_find_account(v_session, ' UMA@probe.example ');
  if jsonb_array_length(v_result) <> 1 or (v_result -> 0 ->> 'account')::uuid <> v_uma then
    raise exception 'PROBE FAILED: an account is not found by its exact address';
  end if;
  if jsonb_array_length(engine.support_find_account(v_session, 'probe.example')) <> 0 then
    raise exception 'PROBE FAILED: a part of an address finds accounts';
  end if;

  v_result := engine.support_read_account(v_session, v_uma);
  if (v_result -> 'profile' ->> 'id')::uuid <> v_uma or (v_result -> 'signIn' ->> 'email') <> 'uma@probe.example' then
    raise exception 'PROBE FAILED: the account is not read as the world holds it';
  end if;

  v_result := engine.support_list_conversations(v_session, v_uma);
  if jsonb_array_length(v_result) <> 1 or (v_result -> 0 ->> 'messages') <> '2'
     or v_result::text like '%private words%' or v_result::text like '%taken back%' then
    raise exception 'PROBE FAILED: the list of conversations is not the list without what was said: %', v_result;
  end if;

  select count(*) into v_before from public.support_session_reads;
  begin
    perform engine.support_read_thread(v_session, v_thread, 'why');
    raise exception 'PROBE FAILED: a private thread was opened without its own reason';
  exception when invalid_parameter_value then
    if sqlerrm <> 'thread_reason_required' then raise; end if;
  end;
  begin
    perform engine.support_read_thread(v_session, gen_random_uuid(), 'A thread that does not exist.');
    raise exception 'PROBE FAILED: a thread that does not exist was opened';
  exception when no_data_found then null;
  end;
  if (select count(*) from public.support_session_reads) <> v_before then
    raise exception 'PROBE FAILED: a refused read left a row in the log';
  end if;

  v_result := engine.support_read_thread(v_session, v_thread, 'The partner asked about this thread.');
  if jsonb_array_length(v_result -> 'messages') <> 2
     or (v_result -> 'messages' -> 0 ->> 'body') <> 'the first private words'
     or (v_result -> 'messages' -> 1 ->> 'body') is not null
     or not (v_result -> 'messages' -> 1 ->> 'deleted')::boolean then
    raise exception 'PROBE FAILED: the thread is not read as its members see it: %', v_result;
  end if;

  if jsonb_typeof(engine.support_read_location(v_session, v_uma)) <> 'array'
     or jsonb_typeof(engine.support_read_notifications(v_session, v_uma, 5)) <> 'array' then
    raise exception 'PROBE FAILED: locations and notices are not read as lists';
  end if;

  -- Seven reads were made; seven rows say so, in order, each with what it was.
  if (select array_agg(r.kind order by r.id) from public.support_session_reads r where r.session_id = v_session)
       <> array['find_account', 'find_account', 'account', 'conversations', 'thread', 'location', 'notifications'] then
    raise exception 'PROBE FAILED: the log does not hold exactly the reads that were made';
  end if;
  if (select count(*) from public.support_session_reads r
       where r.kind = 'thread' and r.thread_reason = 'The partner asked about this thread.'
         and r.detail ->> 'conversation' = v_thread::text) <> 1
     or (select count(*) from public.support_session_reads r
          where r.subject_user = v_uma and r.kind in ('account', 'conversations', 'location', 'notifications')) <> 4
     or (select count(*) from public.support_session_reads r
          where r.kind = 'find_account' and r.detail ->> 'lookup' = 'uma@probe.example') <> 1 then
    raise exception 'PROBE FAILED: a log row does not say what was read, about whom, and why';
  end if;
end;
$probe$;

-- ── 4. Nothing is writable, and only the staff can look ─────────────
-- The owner of the database: the strongest role there is in a hosted project.
do $probe$
declare
  v_session constant uuid := current_setting('probe.session')::uuid;
begin
  begin
    update public.support_session_reads set kind = 'account';
    raise exception 'PROBE FAILED: a log row was rewritten';
  exception when raise_exception then
    if sqlerrm not like 'support_reads_are_kept:%' then raise; end if;
  end;
  begin
    delete from public.support_session_reads;
    raise exception 'PROBE FAILED: a log row was deleted';
  exception when raise_exception then
    if sqlerrm not like 'support_reads_are_kept:%' then raise; end if;
  end;
  begin
    truncate public.support_session_reads;
    raise exception 'PROBE FAILED: the log was emptied';
  exception when raise_exception then
    if sqlerrm not like 'support_reads_are_kept:%' then raise; end if;
  end;
  begin
    update public.support_sessions set reason = 'Another reason entirely.' where id = v_session;
    raise exception 'PROBE FAILED: the reason of a session was changed';
  exception when raise_exception then
    if sqlerrm <> 'support_session_facts_are_fixed' then raise; end if;
  end;
  begin
    update public.support_sessions set expires_at = expires_at + interval '1 minute' where id = v_session;
    raise exception 'PROBE FAILED: a session was made to last longer';
  exception when raise_exception then
    if sqlerrm <> 'support_session_facts_are_fixed' then raise; end if;
  end;
  begin
    delete from public.support_sessions where id = v_session;
    raise exception 'PROBE FAILED: a session was deleted';
  exception when raise_exception or foreign_key_violation then
    if sqlerrm not like 'support_sessions_are_kept:%' then raise; end if;
  end;
  begin
    truncate public.support_sessions cascade;
    raise exception 'PROBE FAILED: the sessions were emptied';
  exception when raise_exception then
    if sqlerrm not like 'support_%_are_kept:%' then raise; end if;
  end;
end;
$probe$;

-- A visitor: sees nothing, writes nothing.
select pg_temp.probe_claims(null);
set local role anon;
do $probe$ begin
  begin perform 1 from public.support_sessions;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor read the support sessions';
end; $probe$;
do $probe$ begin
  begin perform 1 from public.support_session_reads;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor read the support log';
end; $probe$;
do $probe$ begin
  begin truncate public.support_session_reads;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor emptied the support log';
end; $probe$;
reset role;

-- A signed-in person who is not staff: sees no row, writes nothing, answers nothing.
select pg_temp.probe_claims('uma');
set local role authenticated;
do $probe$
begin
  if (select count(*) from public.support_sessions) <> 0 or (select count(*) from public.support_session_reads) <> 0 then
    raise exception 'PROBE FAILED: a person who is not staff sees the support records';
  end if;
end;
$probe$;
do $probe$ begin
  begin insert into public.support_sessions (grant_id, operator_label, reason, state, expires_at)
        values (gen_random_uuid(), 'Somebody', 'A made-up session.', 'active', now() + interval '5 minutes');
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person wrote a support session';
end; $probe$;
do $probe$ begin
  begin update public.support_sessions set state = 'ended';
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person changed a support session';
end; $probe$;
do $probe$ begin
  begin delete from public.support_session_reads;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person deleted from the support log';
end; $probe$;
do $probe$ begin
  -- The signed-in role may call these two; they refuse from the inside.
  begin perform public.end_support_session(current_setting('probe.session')::uuid);
  exception when insufficient_privilege then
    if sqlerrm <> 'forbidden' then raise; end if;
    begin perform public.decide_support_session(current_setting('probe.session')::uuid, true);
    exception when insufficient_privilege then
      if sqlerrm <> 'forbidden' then raise; end if;
      return;
    end;
  end;
  raise exception 'PROBE FAILED: a person who is not staff answered for the staff';
end; $probe$;
reset role;

-- The world's own server: may show the records, cannot change them.
set local role service_role;
do $probe$
begin
  if (select count(*) from public.support_sessions) <> 1 or (select count(*) from public.support_session_reads) <> 7 then
    raise exception 'PROBE FAILED: the server cannot show the support records';
  end if;
end;
$probe$;
do $probe$ begin
  begin insert into public.support_session_reads (session_id, kind) values (current_setting('probe.session')::uuid, 'account');
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: the server wrote into the support log';
end; $probe$;
do $probe$ begin
  begin update public.support_sessions set state = 'ended';
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: the server changed a support session';
end; $probe$;
do $probe$ begin
  begin truncate public.support_sessions;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: the server emptied the support sessions';
end; $probe$;
reset role;

-- A staff member: sees every session and every read, and ends the session at once.
select pg_temp.probe_claims('ada');
set local role authenticated;
do $probe$
begin
  if (select count(*) from public.support_sessions) <> 1 or (select count(*) from public.support_session_reads) <> 7 then
    raise exception 'PROBE FAILED: the staff do not see every session and every read';
  end if;
  begin
    update public.support_session_reads set detail = '{}'::jsonb;
    raise exception 'PROBE FAILED: a staff member rewrote the support log';
  exception when insufficient_privilege then null;
  end;
  perform public.end_support_session(current_setting('probe.session')::uuid);
  begin
    perform public.end_support_session(current_setting('probe.session')::uuid);
    raise exception 'PROBE FAILED: a session was ended twice';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$probe$;
reset role;

do $probe$
declare
  v_session public.support_sessions;
begin
  select s.* into v_session from public.support_sessions s where s.id = current_setting('probe.session')::uuid;
  if v_session.state <> 'ended' or v_session.end_cause <> 'ended_by_tenant'
     or v_session.ended_by <> current_setting('probe.ada')::uuid or v_session.notice_sent_at is null then
    raise exception 'PROBE FAILED: the session the staff ended is not recorded as that';
  end if;
  begin
    perform engine.support_read_account(v_session.id, current_setting('probe.uma')::uuid);
    raise exception 'PROBE FAILED: a reader worked after the staff ended the session';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'support_session_not_active' then raise; end if;
  end;
  if (select count(*) from public.notifications n
       where n.type = 'support_access' and n.data ->> 'event' = 'ended' and n.title = 'Support access ended'
         and n.body like '%Reads made: 7.%') <> 2 then
    raise exception 'PROBE FAILED: the staff were not told that the session ended, with its number of reads';
  end if;
  begin
    update public.support_sessions set ended_at = null, end_cause = null, state = 'active' where id = v_session.id;
    raise exception 'PROBE FAILED: an ended session was opened again';
  exception when raise_exception then
    if sqlerrm <> 'support_session_has_ended' then raise; end if;
  end;
end;
$probe$;

-- What goes back to the service provider's own log: numbers, times, kinds and the thread reason.
-- Nothing about a person: no address, no account.
do $probe$
declare
  v_report jsonb := engine.support_session_report(current_setting('probe.grant')::uuid);
begin
  if jsonb_array_length(v_report -> 'reads') <> 7 or (v_report ->> 'endCause') <> 'ended_by_tenant'
     or (v_report -> 'reads' -> 4 ->> 'threadReason') <> 'The partner asked about this thread.' then
    raise exception 'PROBE FAILED: the report does not hold the session and its seven reads: %', v_report;
  end if;
  if v_report::text like '%probe.example%'
     or v_report::text like '%' || current_setting('probe.uma') || '%'
     or v_report::text like '%' || current_setting('probe.thread') || '%' then
    raise exception 'PROBE FAILED: the report names a person or a conversation';
  end if;
end;
$probe$;

-- ── 5. Expiry fails closed ──────────────────────────────────────────
-- A session whose time has passed and that nobody closed. (Written directly, as the owner: time
-- cannot be made to pass inside a probe.) The job has NOT run.
insert into public.support_sessions (grant_id, operator_label, reason, state, opened_at, expires_at)
values (gen_random_uuid(), 'Ole Example', 'An old made-up reason.', 'active', now() - interval '40 minutes', now() - interval '10 minutes')
returning set_config('probe.stale', id::text, true);

do $probe$
declare
  v_stale constant uuid := current_setting('probe.stale')::uuid;
  v_function text;
  v_before integer;
begin
  select count(*) into v_before from public.support_session_reads;
  foreach v_function in array array[
    'engine.support_find_account(%L, ''uma@probe.example'')',
    'engine.support_read_account(%L, gen_random_uuid())',
    'engine.support_list_conversations(%L, gen_random_uuid())',
    'engine.support_read_thread(%L, gen_random_uuid(), ''A reason of the right length.'')',
    'engine.support_read_location(%L, gen_random_uuid())',
    'engine.support_read_notifications(%L, gen_random_uuid())'
  ] loop
    begin
      execute 'select ' || format(v_function, v_stale);
      raise exception 'PROBE FAILED: % worked after the time had passed', v_function;
    exception when object_not_in_prerequisite_state then
      if sqlerrm <> 'support_session_expired' then raise; end if;
    end;
  end loop;
  if (select count(*) from public.support_session_reads) <> v_before then
    raise exception 'PROBE FAILED: a refused read left a row in the log';
  end if;
  if (select s.ended_at from public.support_sessions s where s.id = v_stale) is not null then
    raise exception 'PROBE FAILED: the probe is not testing a session the job has not closed yet';
  end if;

  -- The job: closes it as expired, at the time it expired, and the staff get their notice. Once.
  if engine.sweep_support_sessions() <> 1 or engine.sweep_support_sessions() <> 0 then
    raise exception 'PROBE FAILED: the job did not close exactly the one abandoned session';
  end if;
  if (select count(*) from public.support_sessions s
       where s.id = v_stale and s.state = 'ended' and s.end_cause = 'expired' and s.ended_at = s.expires_at) <> 1
     or (select count(*) from public.notifications n
          where n.type = 'support_access' and n.data ->> 'event' = 'ended' and n.data ->> 'supportSession' = v_stale::text) <> 2 then
    raise exception 'PROBE FAILED: the abandoned session was not closed as expired with one notice per staff member';
  end if;
end;
$probe$;

-- ── 6. "Ask me first" ───────────────────────────────────────────────
insert into public.app_settings (key, value) values ('support_access_mode', '"ask"'::jsonb);
select set_config('probe.waiting',
  engine.open_support_session(gen_random_uuid(), 'Ole Example', 'A second question from a partner.', now() + interval '15 minutes') ->> 'session', true);

do $probe$
declare
  v_waiting constant uuid := current_setting('probe.waiting')::uuid;
begin
  if (select s.state from public.support_sessions s where s.id = v_waiting) <> 'awaiting_approval' then
    raise exception 'PROBE FAILED: with "ask me first" a session did not wait';
  end if;
  if (select count(*) from public.notifications n
       where n.type = 'support_access' and n.data ->> 'event' = 'requested' and n.title = 'Support access needs your answer') <> 2 then
    raise exception 'PROBE FAILED: the staff were not asked';
  end if;
  begin
    perform engine.support_read_account(v_waiting, current_setting('probe.uma')::uuid);
    raise exception 'PROBE FAILED: a reader worked before the staff said yes';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'support_session_not_active' then raise; end if;
  end;
end;
$probe$;

select pg_temp.probe_claims('abe');
set local role authenticated;
do $probe$
begin
  if public.decide_support_session(current_setting('probe.waiting')::uuid, true) <> 'active' then
    raise exception 'PROBE FAILED: a yes from the staff did not open the session';
  end if;
  begin
    perform public.decide_support_session(current_setting('probe.waiting')::uuid, false);
    raise exception 'PROBE FAILED: a session was answered twice';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$probe$;
reset role;

do $probe$
declare
  v_waiting constant uuid := current_setting('probe.waiting')::uuid;
begin
  perform engine.support_read_account(v_waiting, current_setting('probe.uma')::uuid);
  if (select s.decided_by from public.support_sessions s where s.id = v_waiting) <> current_setting('probe.abe')::uuid then
    raise exception 'PROBE FAILED: the session does not say who approved it';
  end if;
  -- The operator is done.
  if not engine.close_support_session(v_waiting) or engine.close_support_session(v_waiting) then
    raise exception 'PROBE FAILED: closing did not end the session exactly once';
  end if;
  begin
    perform engine.support_read_account(v_waiting, current_setting('probe.uma')::uuid);
    raise exception 'PROBE FAILED: a reader worked after the operator closed the session';
  exception when object_not_in_prerequisite_state then null;
  end;
  if (select s.end_cause from public.support_sessions s where s.id = v_waiting) <> 'closed' then
    raise exception 'PROBE FAILED: a closed session is not recorded as closed';
  end if;
end;
$probe$;

-- And a no.
select set_config('probe.refused',
  engine.open_support_session(gen_random_uuid(), 'Ole Example', 'A third question from a partner.', now() + interval '15 minutes') ->> 'session', true);
select pg_temp.probe_claims('ada');
set local role authenticated;
do $probe$
begin
  if public.decide_support_session(current_setting('probe.refused')::uuid, false) <> 'declined' then
    raise exception 'PROBE FAILED: a no from the staff did not decline the session';
  end if;
end;
$probe$;
reset role;

do $probe$
declare
  v_refused public.support_sessions;
begin
  select s.* into v_refused from public.support_sessions s where s.id = current_setting('probe.refused')::uuid;
  if v_refused.state <> 'declined' or v_refused.end_cause <> 'declined' or v_refused.ended_at is null
     or v_refused.decided_by <> current_setting('probe.ada')::uuid then
    raise exception 'PROBE FAILED: a declined session is not recorded as declined';
  end if;
  begin
    perform engine.support_read_account(v_refused.id, current_setting('probe.uma')::uuid);
    raise exception 'PROBE FAILED: a reader worked under a declined session';
  exception when object_not_in_prerequisite_state then null;
  end;
  if (select count(*) from public.support_session_reads r where r.session_id = v_refused.id) <> 0 then
    raise exception 'PROBE FAILED: a declined session has reads';
  end if;
  if (select count(*) from public.support_sessions s where s.ended_at is null) <> 0 then
    raise exception 'PROBE FAILED: a session is still open at the end';
  end if;
end;
$probe$;

-- ── 7. The entitlements checks of file 0004, now closed for a missing part ──
do $probe$
begin
  begin
    perform engine.write_entitlements(pg_temp.probe_entitlements() - 'schemaLine');
    raise exception 'PROBE FAILED: entitlements that name no database line were accepted';
  exception when check_violation then null;
  end;
  begin
    perform engine.write_entitlements(pg_temp.probe_entitlements() - 'limits');
    raise exception 'PROBE FAILED: entitlements with a part missing were accepted';
  exception when check_violation then null;
  end;
  perform engine.write_entitlements(pg_temp.probe_entitlements());
end;
$probe$;
