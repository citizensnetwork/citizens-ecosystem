-- Promise: the rules between the people of one world came across intact. A new account gets a
-- profile; nobody promotes themselves; private profile columns stay private; and the kind of
-- partner a new account may ask for comes from the world's configuration, not from a fixed list.

select engine.write_entitlements(pg_temp.probe_entitlements());
select public.publish_engine_configuration(pg_temp.probe_configuration(1));

select pg_temp.probe_user('alice');
select pg_temp.probe_user('shop', 'citizen', 'business');
select pg_temp.probe_user('guild', 'citizen', 'ministry');
select pg_temp.probe_user('staff', 'admin');

do $probe$
declare
  v_profile record;
begin
  select * into v_profile from public.profiles where id = current_setting('probe.alice')::uuid;
  if v_profile.id is null or v_profile.role <> 'citizen' or v_profile.contributor_status <> 'not_applied'
     or v_profile.full_name <> 'alice' or v_profile.email <> 'alice@probe.example' then
    raise exception 'PROBE FAILED: signing up did not create the expected profile';
  end if;
  -- "business" is a kind this world has; "ministry" is not, so it is dropped.
  if (select contributor_kind from public.profiles where id = current_setting('probe.shop')::uuid) is distinct from 'business' then
    raise exception 'PROBE FAILED: a kind from the configuration was not kept at sign-up';
  end if;
  if (select contributor_kind from public.profiles where id = current_setting('probe.guild')::uuid) is not null then
    raise exception 'PROBE FAILED: a kind this world does not have was kept at sign-up';
  end if;
end;
$probe$;

-- ── a signed-in person, on their own profile ────────────────────────
select pg_temp.probe_claims('alice');
set local role authenticated;

do $probe$ begin
  begin update public.profiles set role = 'admin' where id = auth.uid();
  exception when raise_exception then
    if sqlerrm <> 'Only staff may change a role.' then
      raise exception 'PROBE FAILED: unexpected message: %', sqlerrm;
    end if;
    return;
  end;
  raise exception 'PROBE FAILED: a person made themselves staff';
end; $probe$;
do $probe$ begin
  begin update public.profiles set email = 'someone@else.example' where id = auth.uid();
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a person changed a server-owned column';
end; $probe$;
do $probe$ begin
  begin update public.profiles set contributor_slug = 'alice' where id = auth.uid();
  exception when insufficient_privilege then
    if sqlerrm <> 'handle_requires_listing' then
      raise exception 'PROBE FAILED: unexpected message: %', sqlerrm;
    end if;
    return;
  end;
  raise exception 'PROBE FAILED: a person without a listing took a handle';
end; $probe$;
do $probe$ begin
  begin perform p.email from public.profiles p where p.id <> auth.uid();
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person read other people''s email addresses';
end; $probe$;
do $probe$
declare
  v_mine record;
begin
  -- Their own private columns come through one function, for their own row only.
  select * into v_mine from public.get_my_profile_private();
  if v_mine.id <> auth.uid() or v_mine.email <> 'alice@probe.example' then
    raise exception 'PROBE FAILED: a person cannot read their own private columns';
  end if;
  -- A bio is theirs to change.
  update public.profiles set bio = 'Hello.' where id = auth.uid();
  if not found then
    raise exception 'PROBE FAILED: a person cannot edit their own profile';
  end if;
  update public.profiles set bio = 'Hacked.' where id <> auth.uid();
  if found then
    raise exception 'PROBE FAILED: a person edited someone else''s profile';
  end if;
end;
$probe$;
reset role;

-- ── a visitor ───────────────────────────────────────────────────────
select pg_temp.probe_claims(null);
set local role anon;
do $probe$
begin
  if (select count(*) from (select p.id, p.full_name from public.profiles p) x) <> 4 then
    raise exception 'PROBE FAILED: a visitor cannot read the public profile columns';
  end if;
end;
$probe$;
do $probe$ begin
  begin perform p.email from public.profiles p;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor read email addresses';
end; $probe$;
do $probe$ begin
  begin perform p.home_latitude from public.profiles p;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor read home locations';
end; $probe$;
do $probe$ begin
  begin perform 1 from public.get_my_profile_private();
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor could call the private profile reader';
end; $probe$;
do $probe$ begin
  begin update public.profiles set bio = 'x';
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor could update profiles';
end; $probe$;
reset role;

-- ── staff ───────────────────────────────────────────────────────────
select pg_temp.probe_claims('staff');
set local role authenticated;
do $probe$
declare
  v_result jsonb;
begin
  -- The look-before-you-delete step answers without asking any other system.
  v_result := public.admin_delete_citizen_account(current_setting('probe.alice')::uuid, false);
  if not (v_result ->> 'success')::boolean or (v_result -> 'blockers') <> '[]'::jsonb then
    raise exception 'PROBE FAILED: the account-removal check did not come back clean: %', v_result;
  end if;
end;
$probe$;
reset role;

-- A person who is not staff cannot use it.
select pg_temp.probe_claims('alice');
set local role authenticated;
do $probe$ begin
  begin perform public.admin_delete_citizen_account(current_setting('probe.shop')::uuid, false);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a person who is not staff ran the account-removal check';
end; $probe$;
reset role;
