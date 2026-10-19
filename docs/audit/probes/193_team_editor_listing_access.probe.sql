-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 193. Run AFTER the apply, in the SQL editor.
--  Synthetic users only. Ends with RAISE EXCEPTION so NOTHING persists.
--  The error text is one PASS or FAIL per line. Nothing here names a real person.
--  Do not run this against production as a commit; the exception rolls the block back.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  owner uuid := gen_random_uuid();
  editor uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  pending uuid := gen_random_uuid();
  hidden uuid := gen_random_uuid();
  res text[] := '{}';
  n int;
  ok boolean;
  bio text;
  logged int;
begin
  insert into auth.users (id, email) values
    (owner, 'probe193-owner@probe.example'),
    (editor, 'probe193-editor@probe.example'),
    (viewer, 'probe193-viewer@probe.example'),
    (pending, 'probe193-pending@probe.example'),
    (hidden, 'probe193-hidden@probe.example');

  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_slug = 'probe193-owner' where id = owner;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = editor;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = viewer;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = pending;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = true, contributor_slug = 'probe193-hidden' where id = hidden;

  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (owner, editor, 'editor', 'active', owner);
  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (owner, viewer, 'viewer', 'active', owner);
  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (owner, pending, 'editor', 'pending', owner);
  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by)
    values (hidden, editor, 'editor', 'active', hidden);

  perform set_config('request.jwt.claims', json_build_object('sub', editor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', editor::text, true);
  execute 'set local role authenticated';

  select public.is_active_team_member(owner, array['editor']) into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' editor is an active editor of the live listing');
  select public.is_active_team_member(owner, array['viewer']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' editor is not a viewer of the listing');
  select public.is_active_team_member(hidden, array['editor']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' editor of a hidden listing is not active');

  begin
    insert into public.news_posts (contributor_id, title, body) values (owner, 'Editor note', 'Written for the listing');
    res := array_append(res, 'PASS editor can insert news owned by the contributor');
  exception when others then
    res := array_append(res, 'FAIL editor news insert: ' || sqlerrm);
  end;

  select count(*) into logged from public.activity_log
    where contributor_id = owner and actor_id = editor and actor_role = 'team_editor' and action = 'insert_news_posts';
  res := array_append(res, (case when logged = 1 then 'PASS' else 'FAIL' end) || ' editor news insert is logged as team_editor');

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('bio', 'Probe bio'));
    select p.bio into bio from public.profiles p where p.id = owner;
    res := array_append(res, (case when bio = 'Probe bio' then 'PASS' else 'FAIL' end) || ' editor rpc updates bio');
  exception when others then
    res := array_append(res, 'FAIL editor bio rpc: ' || sqlerrm);
  end;

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('role', 'admin'));
    res := array_append(res, 'FAIL editor rpc accepted role');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%forbidden_field%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' editor rpc rejects role');
  end;

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('billing_tier', 'paid'));
    res := array_append(res, 'FAIL editor rpc accepted billing_tier');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%forbidden_field%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' editor rpc rejects billing_tier');
  end;

  update public.profiles set role = 'admin' where id = owner;
  select count(*) into n from public.profiles where id = owner and role = 'contributor';
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' editor direct profiles update does not change role');

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', viewer::text, true);
  execute 'set local role authenticated';

  select public.is_active_team_member(owner, array['editor']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' viewer is not an editor');

  begin
    insert into public.news_posts (contributor_id, title, body) values (owner, 'Viewer note', 'Should fail');
    res := array_append(res, 'FAIL viewer inserted news');
  exception when others then
    res := array_append(res, 'PASS viewer cannot insert news');
  end;

  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('bio', 'Viewer bio'));
    res := array_append(res, 'FAIL viewer rpc updated the profile');
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%unauthorized%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' viewer rpc is unauthorized');
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', pending, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pending::text, true);
  execute 'set local role authenticated';
  select public.is_active_team_member(owner, array['editor']) into ok;
  res := array_append(res, (case when not ok then 'PASS' else 'FAIL' end) || ' pending membership is not active');

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.news_posts (contributor_id, title, body) values (owner, 'Owner note', 'Still theirs');
    res := array_append(res, 'PASS owner can still insert their own news');
  exception when others then
    res := array_append(res, 'FAIL owner news insert: ' || sqlerrm);
  end;

  raise exception '%', array_to_string(res, E'\n');
end
$probe$;
