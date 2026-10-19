-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 194. Run AFTER the apply, in the SQL editor.
--  It builds synthetic users only, checks that a non-admin is refused and an
--  admin can delete a Citizen, and ends with RAISE EXCEPTION so NOTHING persists.
--  The error text is one PASS or FAIL per line. Nothing here names a real person.
--  NOT a live apply. Do not run this against production until migration 194 is applied.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  admin uuid := gen_random_uuid();
  other_admin uuid := gen_random_uuid();
  citizen uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  contributor uuid := gen_random_uuid();
  n int;
  res text[] := '{}';
  pre jsonb;
  done jsonb;
  audit_meta jsonb;
  msg text;
begin
  insert into auth.users (id, email) values
    (admin, 'probe-admin@probe.example'),
    (other_admin, 'probe-other-admin@probe.example'),
    (citizen, 'probe-citizen@probe.example'),
    (stranger, 'probe-stranger@probe.example'),
    (contributor, 'probe-contributor@probe.example');

  update public.profiles set role = 'admin', full_name = 'Probe Admin', contributor_status = 'not_applied' where id = admin;
  update public.profiles set role = 'admin', full_name = 'Probe Other Admin', contributor_status = 'not_applied' where id = other_admin;
  update public.profiles set role = 'citizen', full_name = 'Probe Citizen', contributor_status = 'not_applied' where id = citizen;
  update public.profiles set role = 'citizen', full_name = 'Probe Stranger', contributor_status = 'not_applied' where id = stranger;
  update public.profiles set role = 'contributor', full_name = 'Probe Contributor', contributor_status = 'approved', contributor_slug = 'probe-contributor', contributor_hidden = true where id = contributor;

  update auth.users set last_sign_in_at = now() where id = citizen;

  insert into public.follows (follower_id, followee_id) values (citizen, contributor);
  insert into public.saved_items (user_id, contributor_id) values (citizen, contributor);
  insert into public.events (title, date, created_by, status, visibility)
    values ('Probe gathering', now() + interval '2 days', contributor, 'published', 'public');
  insert into public.rsvps (user_id, event_id, status)
    select citizen, id, 'attending' from public.events where title = 'Probe gathering' and created_by = contributor;
  insert into public.comments (event_id, user_id, body)
    select id, citizen, 'Probe comment' from public.events where title = 'Probe gathering' and created_by = contributor;
  insert into public.moments (contributor_id, body) values (citizen, 'Probe moment');
  insert into public.conversations (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  insert into public.conversation_participants (conversation_id, user_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', citizen),
           ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', stranger);
  insert into public.messages (conversation_id, sender_id, body)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', citizen, 'Probe message');
  insert into public.notifications (user_id, type, title, body)
    values (citizen, 'event_reminder', 'Probe', 'A probe notice');

  -- anon cannot execute
  execute 'set local role anon';
  begin
    perform public.admin_delete_citizen_account(citizen, false, null);
    res := array_append(res, 'FAIL anon was allowed to call admin_delete_citizen_account');
  exception when insufficient_privilege then
    res := array_append(res, 'PASS anon cannot execute admin_delete_citizen_account');
  end;
  begin
    perform public.admin_list_citizens(null, 'any', 'any', 'any', 1);
    res := array_append(res, 'FAIL anon was allowed to call admin_list_citizens');
  exception when insufficient_privilege then
    res := array_append(res, 'PASS anon cannot execute admin_list_citizens');
  end;
  execute 'reset role';

  -- a signed-in citizen is refused (the function raises not_admin)
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  execute 'set local role authenticated';
  begin
    perform public.admin_delete_citizen_account(citizen, false, null);
    res := array_append(res, 'FAIL a non-admin delete call was not refused');
  exception when insufficient_privilege then
    if sqlerrm = 'not_admin' then
      res := array_append(res, 'PASS a non-admin is refused with not_admin');
    else
      res := array_append(res, 'FAIL a non-admin was refused as ' || sqlerrm);
    end if;
  end;
  execute 'reset role';

  -- admin preflight, then the refusals, then a real delete
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  execute 'set local role authenticated';

  select public.admin_delete_citizen_account(citizen, false, null) into pre;
  res := array_append(res, (case when pre->>'success' = 'true' and pre->>'name' = 'Probe Citizen' and (pre->>'follows')::int = 1 and (pre->>'messages')::int = 1 and pre::text not like '%@%' then 'PASS' else 'FAIL' end) || ' admin preflight names the citizen and counts rows, with no email');

  select public.admin_delete_citizen_account(admin, true, 'Probe Admin') into done;
  res := array_append(res, (case when done->>'reason' = 'cannot_delete_self' then 'PASS' else 'FAIL' end) || ' an admin cannot delete their own account');

  select public.admin_delete_citizen_account(other_admin, true, 'Probe Other Admin') into done;
  res := array_append(res, (case when done->>'reason' = 'target_is_admin' then 'PASS' else 'FAIL' end) || ' an admin account is refused');

  select public.admin_delete_citizen_account(contributor, true, 'Probe Contributor') into done;
  res := array_append(res, (case when done->>'reason' = 'not_a_citizen' then 'PASS' else 'FAIL' end) || ' a Contributor listing is refused');

  select public.admin_delete_citizen_account(citizen, true, 'wrong name') into done;
  res := array_append(res, (case when done->>'reason' = 'name_mismatch' then 'PASS' else 'FAIL' end) || ' a mismatched name is refused');
  select count(*) into n from auth.users where id = citizen;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' the refused delete left the citizen in place');

  select public.admin_delete_citizen_account(citizen, true, 'Probe Citizen') into done;
  res := array_append(res, (case when done->>'success' = 'true' and done->>'outcome' = 'deleted' then 'PASS' else 'FAIL' end) || ' an admin can delete a Citizen');

  select count(*) into n from auth.users where id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' the auth user is gone');
  select count(*) into n from public.profiles where id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' the profile is gone');
  select count(*) into n from public.follows where follower_id = citizen or followee_id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' follows are gone');
  select count(*) into n from public.saved_items where user_id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' saves are gone');
  select count(*) into n from public.rsvps where user_id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' RSVPs are gone');
  select count(*) into n from public.comments where user_id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' comments are gone');
  select count(*) into n from public.moments where contributor_id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' Moments are gone');
  select count(*) into n from public.messages where sender_id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' their messages are gone');
  select count(*) into n from public.notifications where user_id = citizen;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' notifications are gone');

  select metadata into audit_meta from public.admin_actions
   where actor_id = admin and action = 'citizen_account_deleted' and target_id = citizen::text;
  res := array_append(res, (case when audit_meta is not null and (audit_meta->>'follows')::int = 1 and (audit_meta->>'messages')::int = 1 and audit_meta::text not like '%@%' and not (audit_meta ? 'name') and not (audit_meta ? 'email') then 'PASS' else 'FAIL' end) || ' one audit row records counts and no email or name');
  select count(*) into n from public.admin_actions where action = 'citizen_account_deleted' and target_id = citizen::text;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' exactly one audit row');

  execute 'reset role';

  raise exception '%', array_to_string(res, E'\n');
exception when others then
  get stacked diagnostics msg = message_text;
  if msg like '%PASS%' or msg like '%FAIL%' then
    raise exception '%', msg;
  end if;
  raise exception '%', array_to_string(res, E'\n') || E'\nFAIL probe stopped early: ' || msg;
end
$probe$;
