-- Promise: nobody reaches the control plane except a listed Superuser whose session carries the
-- second factor. Not a visitor, not the service role, not a signed-in account that is on no list,
-- not a Superuser who skipped the second factor, and not someone who was taken off the list.

select pg_temp.probe_cast();
select pg_temp.probe_tenant('alpha', 'aaaaaaaaaaaaaaaaaaaa');

-- ── The grant layer, looked up (never exercised: see _setup.sql) ────
do $probe$
declare
  v_role text;
  v_found text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_schema_privilege(v_role, 'control', 'usage') or has_schema_privilege(v_role, 'control', 'create') then
      raise exception 'PROBE FAILED: % may use the private schema', v_role;
    end if;
    select c.relname::text into v_found
      from pg_class c
     where c.relnamespace = 'control'::regnamespace
       and (case c.relkind
              when 'r' then has_table_privilege(v_role, c.oid, 'select, insert, update, delete, truncate, references, trigger')
              when 'S' then has_sequence_privilege(v_role, c.oid, 'usage, select, update')
              else false end)
     limit 1;
    if v_found is not null then
      raise exception 'PROBE FAILED: % holds a privilege on control.%', v_role, v_found;
    end if;
    select p.proname::text into v_found
      from pg_proc p
     where p.pronamespace = 'control'::regnamespace and has_function_privilege(v_role, p.oid, 'execute')
     limit 1;
    if v_found is not null then
      raise exception 'PROBE FAILED: % may call the private function %', v_role, v_found;
    end if;
  end loop;

  foreach v_role in array array['anon', 'service_role'] loop
    select p.proname::text into v_found
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege(v_role, p.oid, 'execute')
     limit 1;
    if v_found is not null then
      raise exception 'PROBE FAILED: % may call %', v_role, v_found;
    end if;
  end loop;

  if (select count(*) from pg_proc p
       where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')) < 20 then
    raise exception 'PROBE FAILED: the signed-in role cannot call the functions it is meant to';
  end if;
end;
$probe$;

-- ── Every function, called by people who must be refused ────────────
-- Each function checks the caller before it reads an argument, so calling it with nothing but
-- nulls is enough. The signed-in role holds the right to call; the refusal comes from inside.
-- Which refusal is expected is kept in a setting. Each loop asks first whether the role holds the
-- right (has_function_privilege) and only then calls: a call without the right is never made.

-- 1. eve: signed in, second factor given, on no list.
select pg_temp.probe_sign_in('eve');
select set_config('probe.expected', 'not_a_superuser', true);
set local role authenticated;
do $probe$
declare
  v_function record;
  v_called integer := 0;
begin
  for v_function in
    select p.proname::text as name, p.pronargs as arguments
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege(p.oid, 'execute')
     order by p.proname
  loop
    begin
      execute format('select public.%I(%s)', v_function.name,
                     array_to_string(array_fill('null'::text, array[v_function.arguments]), ', '));
      raise exception 'PROBE FAILED: % let the caller in', v_function.name;
    exception when insufficient_privilege then
      if sqlerrm <> current_setting('probe.expected') then
        raise exception 'PROBE FAILED: % refused with "%", not "%"', v_function.name, sqlerrm, current_setting('probe.expected');
      end if;
    end;
    v_called := v_called + 1;
  end loop;
  if v_called < 20 then
    raise exception 'PROBE FAILED: only % functions were tried', v_called;
  end if;
end;
$probe$;
reset role;

-- 2. ada, the Superuser, on a session without the second factor.
select pg_temp.probe_sign_in('ada', 'aal1');
select set_config('probe.expected', 'second_factor_required', true);
set local role authenticated;
do $probe$
declare
  v_function record;
begin
  for v_function in
    select p.proname::text as name, p.pronargs as arguments
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege(p.oid, 'execute')
     order by p.proname
  loop
    begin
      execute format('select public.%I(%s)', v_function.name,
                     array_to_string(array_fill('null'::text, array[v_function.arguments]), ', '));
      raise exception 'PROBE FAILED: % let a session without the second factor in', v_function.name;
    exception when insufficient_privilege then
      if sqlerrm <> current_setting('probe.expected') then
        raise exception 'PROBE FAILED: % refused with "%", not "%"', v_function.name, sqlerrm, current_setting('probe.expected');
      end if;
    end;
  end loop;
end;
$probe$;
reset role;

-- 3. Nobody signed in at all (the signed-in role without a session).
select pg_temp.probe_sign_in(null);
select set_config('probe.expected', 'not_signed_in', true);
set local role authenticated;
do $probe$
declare
  v_function record;
begin
  for v_function in
    select p.proname::text as name, p.pronargs as arguments
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege(p.oid, 'execute')
     order by p.proname
  loop
    begin
      execute format('select public.%I(%s)', v_function.name,
                     array_to_string(array_fill('null'::text, array[v_function.arguments]), ', '));
      raise exception 'PROBE FAILED: % let a caller without a session in', v_function.name;
    exception when insufficient_privilege then
      if sqlerrm <> current_setting('probe.expected') then
        raise exception 'PROBE FAILED: % refused with "%", not "%"', v_function.name, sqlerrm, current_setting('probe.expected');
      end if;
    end;
  end loop;
end;
$probe$;
reset role;

-- 4. ole, a support operator: break-glass and the tenant list, and nothing else.
select pg_temp.probe_sign_in('ole');
set local role authenticated;
do $probe$
declare
  v_name text;
  v_arguments integer;
begin
  if (public.whoami() ->> 'role') <> 'support_operator' then
    raise exception 'PROBE FAILED: the operator is not told who they are';
  end if;
  if jsonb_array_length(public.tenants_list()) <> 1 then
    raise exception 'PROBE FAILED: the operator cannot see the tenant list';
  end if;
  if jsonb_typeof(public.support_grants_list()) <> 'array' then
    raise exception 'PROBE FAILED: the operator cannot see the support grants';
  end if;
  for v_name, v_arguments in
    select p.proname::text, p.pronargs from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege(p.oid, 'execute')
       and p.proname not in ('whoami', 'tenants_list', 'support_grants_list', 'support_grant_open',
                             'support_grant_delivery', 'support_grant_close', 'support_reads_record')
  loop
    begin
      execute format('select public.%I(%s)', v_name, array_to_string(array_fill('null'::text, array[v_arguments]), ', '));
      raise exception 'PROBE FAILED: % let a support operator in', v_name;
    exception when insufficient_privilege then
      if sqlerrm <> 'superuser_only' then
        raise exception 'PROBE FAILED: % refused the operator with "%"', v_name, sqlerrm;
      end if;
    end;
  end loop;
end;
$probe$;
reset role;

-- 5. ole is taken off the list: refused at once, on the same session.
select pg_temp.probe_sign_in('ada');
set local role authenticated;
select public.superuser_revoke(current_setting('probe.ole')::uuid, 'Left the support desk.');
reset role;
select pg_temp.probe_sign_in('ole');
set local role authenticated;
do $probe$
begin
  begin
    perform public.whoami();
  exception when insufficient_privilege then
    if sqlerrm = 'not_a_superuser' then return; end if;
    raise exception 'PROBE FAILED: a revoked operator was refused with "%"', sqlerrm;
  end;
  raise exception 'PROBE FAILED: a revoked operator still gets in';
end;
$probe$;
reset role;

-- 6. The owner of the database, without a Superuser's session, gets nothing from the functions.
select pg_temp.probe_sign_in(null);
do $probe$
begin
  begin
    perform public.tenants_list();
  exception when insufficient_privilege then
    if sqlerrm = 'not_signed_in' then return; end if;
    raise exception 'PROBE FAILED: wrong refusal "%"', sqlerrm;
  end;
  raise exception 'PROBE FAILED: a call without a session was let in';
end;
$probe$;
