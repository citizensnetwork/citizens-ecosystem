-- Promise: the first Superuser is created once, by the owner of the database, and never again by
-- that door. Everyone after is added by a Superuser; nobody removes themselves, so the list is
-- never empty; and a Superuser is an account of this project's own sign-in, nothing else.

select pg_temp.probe_account('ada');
select pg_temp.probe_account('ben');
select pg_temp.probe_account('ole');

-- ── The first Superuser ─────────────────────────────────────────────
do $probe$
declare
  v_role text;
begin
  -- No role that speaks through the data API can reach the bootstrap (looked up, never tried).
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'control.bootstrap_first_superuser(uuid, text)', 'execute')
       or has_schema_privilege(v_role, 'control', 'usage') then
      raise exception 'PROBE FAILED: % can reach the bootstrap', v_role;
    end if;
  end loop;

  begin
    perform control.bootstrap_first_superuser(gen_random_uuid(), 'Nobody Example');
    raise exception 'PROBE FAILED: an account that does not exist became the first Superuser';
  exception when foreign_key_violation then null;
  end;

  perform control.bootstrap_first_superuser(current_setting('probe.ada')::uuid, '  Ada Example  ');
  if (select count(*) from control.superusers s
       where s.user_id = current_setting('probe.ada')::uuid and s.role = 'superuser'
         and s.status = 'active' and s.display_name = 'Ada Example' and s.added_by is null) <> 1 then
    raise exception 'PROBE FAILED: the first Superuser is not on the list as one';
  end if;
  if (select count(*) from control.audit_log a
       where a.action = 'superuser.bootstrap' and a.actor_kind = 'bootstrap'
         and a.actor = current_setting('probe.ada')::uuid) <> 1 then
    raise exception 'PROBE FAILED: the bootstrap is not in the audit log';
  end if;

  begin
    perform control.bootstrap_first_superuser(current_setting('probe.ben')::uuid, 'Ben Example');
    raise exception 'PROBE FAILED: the bootstrap worked a second time';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'bootstrap_already_done' then raise; end if;
  end;
end;
$probe$;

-- ── Everyone after the first ────────────────────────────────────────
select pg_temp.probe_sign_in('ada');
set local role authenticated;
do $probe$
declare
  v_ada constant uuid := current_setting('probe.ada')::uuid;
  v_ben constant uuid := current_setting('probe.ben')::uuid;
  v_ole constant uuid := current_setting('probe.ole')::uuid;
begin
  begin
    perform public.superuser_add(gen_random_uuid(), 'superuser', 'Nobody Example', 'An account that does not exist.');
    raise exception 'PROBE FAILED: an account that does not exist was put on the list';
  exception when no_data_found then
    if sqlerrm <> 'account_not_found' then raise; end if;
  end;
  begin
    perform public.superuser_add(v_ben, 'owner', 'Ben Example', 'A role that does not exist.');
    raise exception 'PROBE FAILED: a made-up role was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.superuser_add(v_ben, 'superuser', 'Ben Example', null);
    raise exception 'PROBE FAILED: somebody was put on the list without a reason';
  exception when invalid_parameter_value then null;
  end;
  perform public.superuser_add(v_ben, 'superuser', 'Ben Example', 'A second person for the engine owner.');
  perform public.superuser_add(v_ole, 'support_operator', 'Ole Example', 'Joins the support desk.');
  begin
    perform public.superuser_add(v_ole, 'superuser', 'Ole Example', 'Twice on the list.');
    raise exception 'PROBE FAILED: somebody is on the list twice';
  exception when unique_violation then
    if sqlerrm <> 'already_listed' then raise; end if;
  end;
  begin
    perform public.superuser_revoke(v_ada, 'Stepping down by myself.');
    raise exception 'PROBE FAILED: a Superuser removed themselves';
  exception when invalid_parameter_value then
    if sqlerrm <> 'cannot_revoke_yourself' then raise; end if;
  end;
  perform public.superuser_revoke(v_ole, 'Left the support desk.');
  begin
    perform public.superuser_revoke(v_ole, 'Left the support desk again.');
    raise exception 'PROBE FAILED: somebody was removed twice';
  exception when no_data_found then null;
  end;
  -- Coming back is a new entry in the audit log, on the same row of the list.
  perform public.superuser_add(v_ole, 'support_operator', 'Ole Example', 'Back on the support desk.');
  if jsonb_array_length(public.superusers_list()) <> 3 then
    raise exception 'PROBE FAILED: the list does not show its three people';
  end if;
end;
$probe$;
reset role;

-- ben, the second Superuser, takes ada off the list. She is refused from then on.
select pg_temp.probe_sign_in('ben');
set local role authenticated;
select public.superuser_revoke(current_setting('probe.ada')::uuid, 'Handing over.');
reset role;
select pg_temp.probe_sign_in('ada');
set local role authenticated;
do $probe$
begin
  begin
    perform public.superusers_list();
  exception when insufficient_privilege then
    if sqlerrm = 'not_a_superuser' then return; end if;
    raise;
  end;
  raise exception 'PROBE FAILED: a revoked Superuser still gets in';
end;
$probe$;
reset role;

do $probe$
begin
  if (select count(*) from control.superusers s where s.status = 'active' and s.role = 'superuser') <> 1 then
    raise exception 'PROBE FAILED: the list does not hold exactly one active Superuser';
  end if;
  if (select count(*) from control.superusers) <> 3 then
    raise exception 'PROBE FAILED: a revoked person was deleted from the list';
  end if;
  if (select count(*) from control.audit_log a where a.action like 'superuser.%') <> 6 then
    raise exception 'PROBE FAILED: the audit log does not hold the six changes to the list';
  end if;
  -- An account on the list cannot be deleted from the sign-in system under the audit log.
  begin
    delete from auth.users u where u.id = current_setting('probe.ada')::uuid;
    raise exception 'PROBE FAILED: the account of somebody on the list was deleted';
  exception when foreign_key_violation or restrict_violation then null;
  end;
  -- Even the owner cannot bootstrap again, although only revoked rows and others remain.
  begin
    perform control.bootstrap_first_superuser(current_setting('probe.ada')::uuid, 'Ada Example');
    raise exception 'PROBE FAILED: the bootstrap worked after the list was used';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$probe$;
