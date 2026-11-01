-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 199 (edit_listing_suggestion). Run AFTER the apply, in the SQL editor.
--  Synthetic users only. Ends with RAISE EXCEPTION so NOTHING persists.
--  The error text is one PASS or FAIL per line. Nothing here names a real person.
--  NOT a live apply. Do not run this against production until migration 199 is applied.
--
--  It checks: anon cannot execute; a stranger, a viewer and a pending editor get not_found; the owner and an
--  active editor can change the payload of a PENDING suggestion; ONLY the payload changes (the fingerprint, kind,
--  status and source stay); a decided suggestion is refused with not_pending; a bad payload is refused; an
--  editor's edit is in activity_log; and the table still has no client write privilege.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  owner uuid := gen_random_uuid();
  editor uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  waiting uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  sug uuid := gen_random_uuid();
  decided uuid := gen_random_uuid();
  fp text := repeat('a', 64);
  res text[] := '{}';
  r jsonb;
  row_after record;
  logged int;
  n int;
begin
  insert into auth.users (id, email) values
    (owner, 'probe199-owner@probe.example'),
    (editor, 'probe199-editor@probe.example'),
    (viewer, 'probe199-viewer@probe.example'),
    (waiting, 'probe199-waiting@probe.example'),
    (stranger, 'probe199-stranger@probe.example');

  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_slug = 'probe199-owner' where id = owner;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied' where id in (editor, viewer, waiting, stranger);

  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by) values
    (owner, editor, 'editor', 'active', owner),
    (owner, viewer, 'viewer', 'active', owner),
    (owner, waiting, 'editor', 'pending', owner);

  insert into public.listing_suggestions (id, contributor_id, kind, payload, source_url, fingerprint, status) values
    (sug, owner, 'event', '{"title":"Probe gathering","start":"2030-01-01T10:00:00Z"}'::jsonb, 'https://probe.example/events', fp, 'pending'),
    (decided, owner, 'news', '{"title":"Probe news","body":"Probe body"}'::jsonb, 'https://probe.example/news', repeat('b', 64), 'dismissed');

  -- anon cannot execute
  execute 'set local role anon';
  begin
    perform public.edit_listing_suggestion(sug, '{"title":"x"}'::jsonb);
    res := array_append(res, 'FAIL anon was allowed to call edit_listing_suggestion');
  exception when insufficient_privilege then
    res := array_append(res, 'PASS anon cannot execute edit_listing_suggestion');
  end;
  execute 'reset role';

  -- a stranger, a viewer and a not-yet-active editor all get not_found, and nothing changes
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  execute 'set local role authenticated';
  r := public.edit_listing_suggestion(sug, '{"title":"Stranger edit","start":"2030-01-01T10:00:00Z"}'::jsonb);
  res := array_append(res, (case when r->>'reason' = 'not_found' then 'PASS' else 'FAIL ' || r::text end) || ' a stranger gets not_found');
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', viewer::text, true);
  execute 'set local role authenticated';
  r := public.edit_listing_suggestion(sug, '{"title":"Viewer edit","start":"2030-01-01T10:00:00Z"}'::jsonb);
  res := array_append(res, (case when r->>'reason' = 'not_found' then 'PASS' else 'FAIL ' || r::text end) || ' a viewer gets not_found');
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', waiting, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', waiting::text, true);
  execute 'set local role authenticated';
  r := public.edit_listing_suggestion(sug, '{"title":"Pending editor edit","start":"2030-01-01T10:00:00Z"}'::jsonb);
  res := array_append(res, (case when r->>'reason' = 'not_found' then 'PASS' else 'FAIL ' || r::text end) || ' an editor whose invite is still pending gets not_found');
  execute 'reset role';

  select payload->>'title' as title into row_after from public.listing_suggestions where id = sug;
  res := array_append(res, (case when row_after.title = 'Probe gathering' then 'PASS' else 'FAIL payload changed to ' || row_after.title end) || ' none of those changed the payload');

  -- the owner
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';

  r := public.edit_listing_suggestion(sug, '{"title":"Owner edit","start":"2030-01-01T10:00:00Z","location":"The Hall"}'::jsonb);
  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL ' || r::text end) || ' the owner can edit a pending suggestion');

  r := public.edit_listing_suggestion(decided, '{"title":"Too late","body":"x"}'::jsonb);
  res := array_append(res, (case when r->>'reason' = 'not_pending' then 'PASS' else 'FAIL ' || r::text end) || ' a dismissed suggestion is refused with not_pending');

  r := public.edit_listing_suggestion(sug, '["not","an","object"]'::jsonb);
  res := array_append(res, (case when r->>'reason' = 'invalid_payload' then 'PASS' else 'FAIL ' || r::text end) || ' an array payload is refused');
  r := public.edit_listing_suggestion(sug, null);
  res := array_append(res, (case when r->>'reason' = 'invalid_payload' then 'PASS' else 'FAIL ' || r::text end) || ' a null payload is refused');
  r := public.edit_listing_suggestion(sug, jsonb_build_object('title', repeat('x', 20000)));
  res := array_append(res, (case when r->>'reason' = 'invalid_payload' then 'PASS' else 'FAIL ' || r::text end) || ' a payload over 16 KB is refused');
  r := public.edit_listing_suggestion(gen_random_uuid(), '{"title":"x"}'::jsonb);
  res := array_append(res, (case when r->>'reason' = 'not_found' then 'PASS' else 'FAIL ' || r::text end) || ' an unknown id gets not_found');

  -- the table itself is still read-only for a signed-in user
  begin
    update public.listing_suggestions set payload = '{"title":"direct"}'::jsonb where id = sug;
    res := array_append(res, 'FAIL the owner can still UPDATE listing_suggestions directly');
  exception when insufficient_privilege then
    res := array_append(res, 'PASS the owner still has no direct UPDATE on listing_suggestions');
  end;
  begin
    delete from public.listing_suggestions where id = sug;
    res := array_append(res, 'FAIL the owner can DELETE listing_suggestions directly');
  exception when insufficient_privilege then
    res := array_append(res, 'PASS the owner still has no DELETE on listing_suggestions');
  end;
  execute 'reset role';

  -- only the payload changed
  select * into row_after from public.listing_suggestions where id = sug;
  res := array_append(res, (case when row_after.payload->>'title' = 'Owner edit' and row_after.payload->>'location' = 'The Hall' then 'PASS' else 'FAIL payload=' || row_after.payload::text end) || ' the payload is the owner''s edit');
  res := array_append(res, (case when row_after.fingerprint = fp then 'PASS' else 'FAIL fingerprint changed' end) || ' the fingerprint is unchanged (the Reader still sees the source item as known)');
  res := array_append(res, (case when row_after.status = 'pending' and row_after.kind = 'event' and row_after.source_url = 'https://probe.example/events' and row_after.decided_at is null then 'PASS' else 'FAIL status/kind/source/decided_at changed' end) || ' status, kind, source and decided_at are unchanged');

  -- an active editor
  perform set_config('request.jwt.claims', json_build_object('sub', editor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', editor::text, true);
  execute 'set local role authenticated';
  r := public.edit_listing_suggestion(sug, '{"title":"Editor edit","start":"2030-01-01T10:00:00Z"}'::jsonb);
  res := array_append(res, (case when (r->>'success')::boolean then 'PASS' else 'FAIL ' || r::text end) || ' an active editor can edit a pending suggestion');
  execute 'reset role';

  select count(*) into logged from public.activity_log
   where contributor_id = owner and actor_id = editor and action = 'edit_suggestion' and entity_id = sug::text and actor_role = 'team_editor';
  res := array_append(res, (case when logged = 1 then 'PASS' else 'FAIL logged=' || logged end) || ' the editor''s edit is in activity_log');
  select count(*) into logged from public.activity_log where contributor_id = owner and actor_id = owner and action = 'edit_suggestion';
  res := array_append(res, (case when logged = 0 then 'PASS' else 'FAIL logged=' || logged end) || ' the owner''s own edit is not logged as an editor action');

  raise exception '%', array_to_string(res, E'\n');
end
$probe$;
