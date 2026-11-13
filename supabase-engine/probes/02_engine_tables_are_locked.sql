-- Promise: nobody inside a world can change what the world is allowed, rewrite its published
-- configuration, or reach the engine's private schema. Not a visitor, not a signed-in person, and
-- (for what the world is allowed) not even the world's own server.

select engine.write_entitlements(pg_temp.probe_entitlements());
select public.publish_engine_configuration(pg_temp.probe_configuration(1));
select pg_temp.probe_user('alice');
-- Kept in a setting: the other roles cannot call this session's temporary helpers.
select set_config('probe.next_configuration', pg_temp.probe_configuration(2)::text, true);

-- ── a visitor (signed out) ──────────────────────────────────────────
select pg_temp.probe_claims(null);
set local role anon;

do $probe$
begin
  if (select count(*) from public.engine_entitlements) <> 1 then
    raise exception 'PROBE FAILED: a visitor cannot read what the world is allowed';
  end if;
  if (select count(*) from public.engine_configuration) <> 1 then
    raise exception 'PROBE FAILED: a visitor cannot read the current configuration';
  end if;
end;
$probe$;

do $probe$ begin
  begin update public.engine_entitlements set document = '{}'::jsonb;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor changed the entitlements';
end; $probe$;
do $probe$ begin
  begin delete from public.engine_entitlements;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor deleted the entitlements';
end; $probe$;
do $probe$ begin
  begin truncate public.engine_entitlements;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor emptied the entitlements';
end; $probe$;
do $probe$ begin
  begin update public.engine_configuration set is_current = false;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor changed the configuration';
end; $probe$;
do $probe$ begin
  begin perform 1 from public.engine_wording;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor read the wording table directly';
end; $probe$;
do $probe$ begin
  begin perform public.publish_engine_configuration('{}'::jsonb);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor could call the publish function';
end; $probe$;
do $probe$ begin
  begin perform 1 from engine.schema_migrations;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor read the private schema';
end; $probe$;
do $probe$ begin
  begin truncate public.profiles;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a visitor emptied the profiles table';
end; $probe$;

reset role;

-- ── a signed-in person ──────────────────────────────────────────────
select pg_temp.probe_claims('alice');
set local role authenticated;

do $probe$ begin
  begin insert into public.engine_entitlements (singleton, document) values (true, '{}'::jsonb);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person wrote the entitlements';
end; $probe$;
do $probe$ begin
  begin update public.engine_entitlements set document = document;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person changed the entitlements';
end; $probe$;
do $probe$ begin
  begin insert into public.engine_configuration (revision, contract, document) values (99, '1.0', '{}'::jsonb);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person inserted a configuration';
end; $probe$;
do $probe$ begin
  begin insert into public.engine_wording (key, source, renderer, text, revision) values ('notification.x', 'tenant', 'database', 'x', 1);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person wrote the wording table';
end; $probe$;
do $probe$ begin
  begin perform public.publish_engine_configuration('{}'::jsonb);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person could call the publish function';
end; $probe$;
do $probe$ begin
  begin perform engine.write_entitlements('{}'::jsonb);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person reached the private schema';
end; $probe$;
do $probe$ begin
  begin insert into public.categories (name, slug) values ('Mine', 'mine');
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person wrote the categories table';
end; $probe$;
do $probe$ begin
  begin truncate public.follows;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: a signed-in person emptied a table';
end; $probe$;

reset role;

-- ── the world's own server (the service role) ───────────────────────
set local role service_role;

do $probe$ begin
  begin update public.engine_entitlements set document = document;
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: the service role changed the entitlements';
end; $probe$;
do $probe$ begin
  begin insert into public.engine_configuration (revision, contract, document) values (99, '1.0', '{}'::jsonb);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: the service role wrote a configuration without publishing';
end; $probe$;
do $probe$ begin
  begin perform engine.write_entitlements('{}'::jsonb);
  exception when insufficient_privilege then return; end;
  raise exception 'PROBE FAILED: the service role reached the private schema';
end; $probe$;
do $probe$
begin
  -- What the service role is for: reading the wording, and publishing.
  if (select count(*) from public.engine_wording) = 0 then
    raise exception 'PROBE FAILED: the service role cannot read the wording';
  end if;
  perform public.publish_engine_configuration(current_setting('probe.next_configuration')::jsonb);
end;
$probe$;

reset role;
