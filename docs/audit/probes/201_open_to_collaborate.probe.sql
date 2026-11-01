-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 201. Run AFTER the apply, in the
--  SQL editor. Synthetic users only. Ends with RAISE EXCEPTION so
--  NOTHING persists. The error text is one PASS or FAIL per line.
--  NOT a live apply. Do not run this until migration 201 is applied.
--  Nothing here names a real person.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  owner uuid := gen_random_uuid();
  editor uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  citizen uuid := gen_random_uuid();
  pending uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  res text[] := '{}';
  n int;
  flag boolean;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'open_to_collaborate'
      and data_type = 'boolean' and is_nullable = 'NO' and column_default like 'false%'
  ) then
    res := array_append(res, 'FAIL column is missing or not a not-null boolean defaulting to false'::text);
  else
    res := array_append(res, 'PASS column is a not-null boolean defaulting to false'::text);
  end if;

  res := array_append(res, (case
    when has_column_privilege('anon', 'public.profiles', 'open_to_collaborate', 'SELECT')
     and has_column_privilege('authenticated', 'public.profiles', 'open_to_collaborate', 'SELECT')
    then 'PASS' else 'FAIL' end) || ' anon and authenticated can read the column'::text);
  select count(*) into n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and grantee in ('anon', 'PUBLIC') and privilege_type = 'SELECT';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon still has no table-level SELECT on profiles'::text);

  select count(*) into n from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'guard_open_to_collaborate' and p.prosecdef;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' guard_open_to_collaborate is SECURITY INVOKER'::text);

  select count(*) into n from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'update_contributor_public_profile' and p.prosecdef;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' update_contributor_public_profile is SECURITY DEFINER'::text);

  select count(*) into n from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public'
     and p.proname in ('guard_open_to_collaborate', 'update_contributor_public_profile')
     and not (coalesce(p.proconfig, '{}') && array['search_path=""']);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' both functions pin an empty search_path'::text);

  res := array_append(res, (case
    when not has_function_privilege('anon', 'public.guard_open_to_collaborate()', 'execute')
     and not has_function_privilege('authenticated', 'public.guard_open_to_collaborate()', 'execute')
     and not has_function_privilege('public', 'public.guard_open_to_collaborate()', 'execute')
    then 'PASS' else 'FAIL' end) || ' the guard function is not executable by public, anon or authenticated'::text);
  res := array_append(res, (case
    when not has_function_privilege('anon', 'public.update_contributor_public_profile(uuid, jsonb)', 'execute')
     and not has_function_privilege('public', 'public.update_contributor_public_profile(uuid, jsonb)', 'execute')
     and has_function_privilege('authenticated', 'public.update_contributor_public_profile(uuid, jsonb)', 'execute')
    then 'PASS' else 'FAIL' end) || ' only authenticated can execute the editor profile function'::text);

  insert into auth.users (id, email) values
    (owner, 'probe201-owner@probe.example'),
    (editor, 'probe201-editor@probe.example'),
    (viewer, 'probe201-viewer@probe.example'),
    (citizen, 'probe201-citizen@probe.example'),
    (pending, 'probe201-pending@probe.example'),
    (stranger, 'probe201-stranger@probe.example');

  update public.profiles set
    role = 'contributor', contributor_status = 'approved', contributor_hidden = false,
    contributor_slug = 'probe201-owner', full_name = 'Probe Owner'
  where id = owner;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied' where id = editor;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied' where id = viewer;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied' where id = citizen;
  update public.profiles set role = 'citizen', contributor_status = 'pending' where id = pending;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied' where id = stranger;

  insert into public.team_memberships (contributor_id, member_id, role, status, invited_by) values
    (owner, editor, 'editor', 'active', owner),
    (owner, viewer, 'viewer', 'active', owner);

  select open_to_collaborate into flag from public.profiles where id = owner;
  res := array_append(res, (case when flag is false then 'PASS' else 'FAIL' end) || ' a new listing starts closed to collaboration'::text);

  perform set_config('request.jwt.claims', json_build_object('sub', citizen, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', citizen::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin
    update public.profiles set open_to_collaborate = true where id = citizen;
    res := array_append(res, 'FAIL a citizen set the flag on their own row'::text);
  exception when insufficient_privilege then
    res := array_append(res, 'PASS a citizen cannot set the flag'::text);
  end;
  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('open_to_collaborate', true));
    res := array_append(res, 'FAIL a citizen editor call was accepted'::text);
  exception when insufficient_privilege then
    res := array_append(res, 'PASS a citizen who is not an editor is refused by the function'::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', pending, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pending::text, true);
  execute 'set local role authenticated';
  begin
    update public.profiles set open_to_collaborate = true where id = pending;
    res := array_append(res, 'FAIL a pending applicant set the flag'::text);
  exception when insufficient_privilege then
    res := array_append(res, 'PASS a pending applicant cannot set the flag'::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';
  update public.profiles set open_to_collaborate = true where id = owner;
  select open_to_collaborate into flag from public.profiles where id = owner;
  res := array_append(res, (case when flag is true then 'PASS' else 'FAIL' end) || ' the owner can turn the flag on'::text);
  update public.profiles set open_to_collaborate = true where id = stranger;
  get diagnostics n = row_count;
  select open_to_collaborate into flag from public.profiles where id = stranger;
  res := array_append(res, (case when n = 0 and flag is false then 'PASS' else 'FAIL' end) || ' the owner cannot set someone else''s flag'::text);
  update public.profiles set open_to_collaborate = false where id = owner;
  select open_to_collaborate into flag from public.profiles where id = owner;
  res := array_append(res, (case when flag is false then 'PASS' else 'FAIL' end) || ' the owner can turn the flag off'::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', editor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', editor::text, true);
  execute 'set local role authenticated';
  begin
    update public.profiles set open_to_collaborate = true where id = owner;
    get diagnostics n = row_count;
    res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' an editor cannot write the column directly'::text);
  exception when insufficient_privilege then
    res := array_append(res, 'PASS an editor cannot write the column directly'::text);
  end;
  perform public.update_contributor_public_profile(owner, jsonb_build_object('open_to_collaborate', true));
  select open_to_collaborate into flag from public.profiles where id = owner;
  res := array_append(res, (case when flag is true then 'PASS' else 'FAIL' end) || ' an active editor can turn the flag on through the function'::text);
  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('open_to_collaborate', 'yes'));
    res := array_append(res, 'FAIL a non-boolean flag was accepted'::text);
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%invalid_field%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' a non-boolean flag is refused'::text);
  end;
  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('role', 'admin'));
    res := array_append(res, 'FAIL a forbidden field was accepted'::text);
  exception when others then
    res := array_append(res, (case when sqlerrm ilike '%forbidden_field%' then 'PASS' else 'FAIL ' || sqlerrm end) || ' a forbidden field is still refused'::text);
  end;
  select open_to_collaborate into flag from public.profiles where id = owner;
  res := array_append(res, (case when flag is true then 'PASS' else 'FAIL' end) || ' a refused patch leaves the flag unchanged'::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', viewer::text, true);
  execute 'set local role authenticated';
  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('open_to_collaborate', false));
    res := array_append(res, 'FAIL a viewer changed the flag'::text);
  exception when insufficient_privilege then
    res := array_append(res, 'PASS a viewer cannot change the flag'::text);
  end;
  execute 'reset role';

  execute 'set local role anon';
  select open_to_collaborate into flag from public.profiles where id = owner;
  res := array_append(res, (case when flag is true then 'PASS' else 'FAIL' end) || ' anon can read the flag on a visible listing'::text);
  begin
    perform public.update_contributor_public_profile(owner, jsonb_build_object('open_to_collaborate', false));
    res := array_append(res, 'FAIL anon executed the editor function'::text);
  exception when insufficient_privilege then
    res := array_append(res, 'PASS anon cannot execute the editor function'::text);
  end;
  execute 'reset role';

  raise exception E'PROBE 201 RESULTS (rolled back):\n%', array_to_string(res, E'\n');
end
$probe$;
