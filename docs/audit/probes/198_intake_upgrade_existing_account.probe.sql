-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 198. Run AFTER the apply, in the SQL editor.
--  Synthetic users only. Ends with RAISE EXCEPTION so NOTHING persists.
--  NOT a live apply. Do not run this until migration 198 is applied.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  owner uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  hash text := repeat('ab', 32);
  other_hash text := repeat('cd', 32);
  created jsonb;
  preview jsonb;
  confirmed jsonb;
  declined jsonb;
  forbidden jsonb;
  role text;
  slug text;
  res text[] := '{}';
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'preview_intake_upgrade'
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    res := res || 'FAIL anon can execute preview';
  else
    res := res || 'PASS anon cannot execute preview';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_intake_upgrade_request'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  ) then
    res := res || 'FAIL a client role can execute create';
  else
    res := res || 'PASS clients cannot execute create';
  end if;

  select c.reloptions::text into role from pg_class c where c.oid = 'public.my_intake_upgrade'::regclass;
  if role ilike '%security_invoker%' then
    res := res || 'PASS view is security_invoker';
  else
    res := res || 'FAIL view is not security_invoker';
  end if;

  insert into auth.users (id, email) values
    (owner, 'probe-owner@probe.example'),
    (other, 'probe-other@probe.example');
  update public.profiles
     set role = 'citizen', full_name = 'Probe Owner', contributor_status = 'not_applied'
   where id = owner;
  update public.profiles
     set role = 'citizen', full_name = 'Probe Other', contributor_status = 'not_applied'
   where id = other;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  created := public.create_intake_upgrade_request(
    owner, hash, now() + interval '7 days', 'Probe Fellowship', 'ministry', 'churches-ministries',
    'A probe listing.', null, null, null, null, null, null, null, null, null,
    true, null, null, null, null, null, '[]'::jsonb, null, null, '[]'::jsonb
  );
  if created->>'success' = 'true' and created->>'reused' = 'false' then
    res := res || 'PASS service_role created a pending upgrade';
  else
    res := res || ('FAIL create ' || coalesce(created->>'reason', 'empty'));
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  forbidden := public.preview_intake_upgrade(hash);
  if forbidden->>'reason' = 'wrong_account' and forbidden->>'display_name' is null then
    res := res || 'PASS other account sees no organisation';
  else
    res := res || ('FAIL wrong account ' || coalesce(forbidden::text, 'empty'));
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  preview := public.preview_intake_upgrade(hash);
  if preview->>'success' = 'true' and preview->>'display_name' = 'Probe Fellowship' then
    res := res || 'PASS owner can preview';
  else
    res := res || ('FAIL preview ' || coalesce(preview->>'reason', 'empty'));
  end if;

  confirmed := public.confirm_intake_upgrade(hash);
  select p.role, p.contributor_slug into role, slug from public.profiles p where p.id = owner;
  if confirmed->>'success' = 'true' and role = 'contributor' and slug is not null
     and not exists (select 1 from public.intake_upgrade_requests r where r.token_hash = hash) then
    res := res || 'PASS confirm promotes and consumes the token';
  else
    res := res || ('FAIL confirm role=' || coalesce(role, 'null') || ' ' || coalesce(confirmed->>'reason', confirmed->>'success', 'empty'));
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  created := public.create_intake_upgrade_request(
    other, other_hash, now() + interval '7 days', 'Probe Other Org', 'ministry', 'churches-ministries',
    null, null, null, null, null, null, null, null, null, null,
    true, null, null, null, null, null, '[]'::jsonb, null, null, '[]'::jsonb
  );

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  declined := public.decline_intake_upgrade(other_hash);
  select p.role into role from public.profiles p where p.id = other;
  if declined->>'status' = 'declined' and role = 'citizen' then
    res := res || 'PASS decline leaves the citizen unchanged';
  else
    res := res || ('FAIL decline role=' || coalesce(role, 'null'));
  end if;

  if exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public'
       and routine_name = 'intake_upgrade_flag_admin'
       and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    res := res || 'FAIL flag helper is granted to a client';
  else
    res := res || 'PASS flag helper is not granted to clients';
  end if;

  raise exception '%', array_to_string(res, E'\n');
end;
$probe$;
