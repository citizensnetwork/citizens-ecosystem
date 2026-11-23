-- Shared set-up for every control-plane probe. The runner wraps each probe like this, so nothing
-- a probe does is ever kept:
--
--   begin;  <this file>  <the probe>  rollback;
--
-- A probe raises an error when the database does not behave as promised; no error means it passed.
-- Everything here is made-up test data.
--
-- TWO RULES for anything that runs after `set local role ...` (see supabase-engine/README.md):
--   * never CALL a function that role may not call, and never touch the private schema as that
--     role: on the hosted Postgres image such a refusal ends the server process when the session
--     is logged in as the database owner. Look the right up (has_function_privilege,
--     has_schema_privilege, has_table_privilege) instead. The functions in "public" may be called
--     as the signed-in role: it holds the right, and they refuse from the inside, cleanly.
--   * never call a pg_temp helper: the other roles cannot, and the error would look like the
--     refusal the probe expects. Keep values in settings (set_config) before switching.

-- A made-up account of the control plane's own sign-in. Its id is kept in the setting probe.<name>.
create function pg_temp.probe_account(_name text)
returns uuid
language plpgsql
as $probe_account$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_id, _name || '@probe.example');
  perform set_config('probe.' || _name, v_id::text, true);
  return v_id;
end;
$probe_account$;

-- "From here on, the session belongs to this account" (run it while still the owner, then
-- `set local role authenticated;`). `_aal` is 'aal2' when the second factor was given and 'aal1'
-- when it was not. `probe_sign_in(null)` clears the session.
create function pg_temp.probe_sign_in(_name text, _aal text default 'aal2')
returns void
language plpgsql
as $probe_sign_in$
declare
  v_id text := case when _name is null then '' else current_setting('probe.' || _name) end;
begin
  perform set_config('request.jwt.claim.sub', v_id, true);
  perform set_config('request.jwt.claim.role', case when _name is null then '' else 'authenticated' end, true);
  perform set_config(
    'request.jwt.claims',
    case when _name is null then ''
         else json_build_object('sub', v_id, 'role', 'authenticated', 'aal', _aal)::text end,
    true);
end;
$probe_sign_in$;

-- The usual people: ada is the first Superuser, ole a support operator she added, eve an account
-- that is on no list. Ends with nobody signed in.
create function pg_temp.probe_cast()
returns void
language plpgsql
as $probe_cast$
begin
  perform pg_temp.probe_account('ada');
  perform pg_temp.probe_account('ole');
  perform pg_temp.probe_account('eve');
  perform control.bootstrap_first_superuser(current_setting('probe.ada')::uuid, 'Ada Example');
  perform pg_temp.probe_sign_in('ada');
  perform public.superuser_add(current_setting('probe.ole')::uuid, 'support_operator', 'Ole Example', 'Joins the support desk.');
  perform pg_temp.probe_sign_in(null);
end;
$probe_cast$;

-- A made-up tenant with a database project, created by ada. Its id is kept in probe.<slug>.
create function pg_temp.probe_tenant(_slug text, _project text)
returns uuid
language plpgsql
as $probe_tenant$
declare
  v_id uuid;
begin
  perform pg_temp.probe_sign_in('ada');
  v_id := public.tenant_create(_slug, 'Example ' || _slug, 'eu-central-1', 'A made-up tenant for a probe.');
  perform public.tenant_infrastructure_set(v_id, jsonb_build_object('databaseProject', _project), 'Its made-up project.');
  perform pg_temp.probe_sign_in(null);
  perform set_config('probe.' || _slug, v_id::text, true);
  return v_id;
end;
$probe_tenant$;

-- What the engine owner allows a made-up tenant.
create function pg_temp.probe_entitlements(_features jsonb default '{"partnerInvitations": true}'::jsonb, _line text default 'engine')
returns jsonb
language sql
as $probe_entitlements$
  select jsonb_build_object(
    'contract', '1.0',
    'schemaLine', _line,
    'features', _features,
    'limits', jsonb_build_object('mapTiltMaxDegrees', 30, 'maxCategoriesPerList', 10),
    'requirements', jsonb_build_object('legalOperator', true)
  );
$probe_entitlements$;

-- Fails unless the audit log holds exactly `_count` rows and the newest is `_action`.
create function pg_temp.probe_audit(_count integer, _action text)
returns void
language plpgsql
as $probe_audit$
declare
  v_count integer;
  v_last control.audit_log;
begin
  select count(*) into v_count from control.audit_log;
  select a.* into v_last from control.audit_log a order by a.id desc limit 1;
  if v_count <> _count or v_last.action is distinct from _action then
    raise exception 'PROBE FAILED: expected % audit rows ending with %, found % ending with %',
      _count, _action, v_count, v_last.action;
  end if;
end;
$probe_audit$;
