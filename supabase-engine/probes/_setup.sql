-- Shared set-up for every probe. The runner wraps each probe like this, so nothing a probe does
-- is ever kept:
--
--   begin;  <this file>  <the probe>  rollback;
--
-- A probe raises an error when the database does not behave as promised; no error means it passed.
-- Everything here is made-up test data: the people, the configuration and the entitlements.

-- A made-up person. Signing up creates the profile (the baseline's own trigger does that).
create function pg_temp.probe_user(_name text, _role text default 'citizen', _kind text default null)
returns uuid
language plpgsql
as $probe_user$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (
    v_id,
    _name || '@probe.example',
    jsonb_build_object('full_name', _name)
      || case when _kind is null then '{}'::jsonb else jsonb_build_object('contributor_kind', _kind) end
  );
  if _role <> 'citizen' then
    update public.profiles
       set role = _role,
           contributor_status = case when _role = 'contributor' then 'approved' else contributor_status end
     where id = v_id;
  end if;
  -- Other roles cannot see this session's temporary objects, so a probe reads the id from a setting.
  perform set_config('probe.' || _name, v_id::text, true);
  return v_id;
end;
$probe_user$;

-- What the engine owner allows the made-up world.
create function pg_temp.probe_entitlements(_features jsonb default '{"partnerInvitations": true, "communityIdeas": true}'::jsonb)
returns jsonb
language sql
as $probe_entitlements$
  select jsonb_build_object(
    'contract', '1.0',
    'schemaLine', 'engine',
    'features', _features,
    'limits', jsonb_build_object('mapTiltMaxDegrees', 30, 'maxCategoriesPerList', 10),
    'requirements', jsonb_build_object('legalOperator', true)
  );
$probe_entitlements$;

-- A small configuration of the made-up world. `_changes` is laid over it, key by key.
create function pg_temp.probe_configuration(_revision integer, _changes jsonb default '{}'::jsonb)
returns jsonb
language sql
as $probe_configuration$
  select jsonb_build_object(
    'contract', '1.0',
    'revision', _revision,
    'legal', jsonb_build_object('serviceProvider', 'Example Operator'),
    'features', jsonb_build_object('partnerInvitations', true),
    'map', jsonb_build_object('tiltDegrees', 0),
    'categories', jsonb_build_object(
      'events', jsonb_build_array(
        jsonb_build_object('id', 'markets', 'label', 'Markets', 'color', '#336699'),
        jsonb_build_object('id', 'talks', 'label', 'Talks', 'color', '#884422')),
      'places', jsonb_build_array(
        jsonb_build_object('id', 'venues', 'label', 'Venues', 'color', '#225544'),
        jsonb_build_object('id', 'markets', 'label', 'Markets', 'color', '#336699')),
      'partnerTypes', '[]'::jsonb,
      'partnerKinds', jsonb_build_array(jsonb_build_object('id', 'business', 'label', 'Business'))
    )
  ) || _changes;
$probe_configuration$;

-- "From here on, act as this signed-in person" is two statements in a probe:
--   select pg_temp.probe_claims('alice');   (while still the owner)
--   set local role authenticated;
-- and `reset role;` goes back. `probe_claims(null)` clears the sign-in, for the signed-out role.
create function pg_temp.probe_claims(_name text)
returns void
language plpgsql
as $probe_claims$
declare
  v_id text := case when _name is null then '' else current_setting('probe.' || _name) end;
begin
  perform set_config('request.jwt.claim.sub', v_id, true);
  perform set_config('request.jwt.claim.role', case when _name is null then 'anon' else 'authenticated' end, true);
  perform set_config(
    'request.jwt.claims',
    case when _name is null then json_build_object('role', 'anon')::text
         else json_build_object('sub', v_id, 'role', 'authenticated')::text end,
    true);
end;
$probe_claims$;
