-- Promise: a configuration can only switch on what the entitlements allow, whoever publishes it.
-- Also: revisions count up by one, exactly one is current, a published revision is never edited
-- or deleted, and the categories table follows what was published.

-- Nothing can be published before the engine owner has said what the world is allowed.
do $probe$ begin
  begin perform public.publish_engine_configuration(pg_temp.probe_configuration(1));
  exception when sqlstate '55000' then return; end;
  raise exception 'PROBE FAILED: published without entitlements';
end; $probe$;

select engine.write_entitlements(pg_temp.probe_entitlements());

-- The entitlements copy only ever describes the engine line.
do $probe$ begin
  begin perform engine.write_entitlements(pg_temp.probe_entitlements() || '{"schemaLine": "citizens"}'::jsonb);
  exception when check_violation then return; end;
  raise exception 'PROBE FAILED: entitlements for another database line were accepted';
end; $probe$;

-- A feature that is not allowed.
do $probe$ begin
  begin perform public.publish_engine_configuration(
    pg_temp.probe_configuration(1, '{"features": {"partnerInvitations": true, "gatherings": true}}'::jsonb));
  exception when sqlstate '42501' then return; end;
  raise exception 'PROBE FAILED: a feature outside the entitlements was published';
end; $probe$;
-- A feature the engine has never heard of is not allowed either.
do $probe$ begin
  begin perform public.publish_engine_configuration(
    pg_temp.probe_configuration(1, '{"features": {"somethingNew": true}}'::jsonb));
  exception when sqlstate '42501' then return; end;
  raise exception 'PROBE FAILED: an unknown feature was published';
end; $probe$;
-- A switch must be true or false.
do $probe$ begin
  begin perform public.publish_engine_configuration(
    pg_temp.probe_configuration(1, '{"features": {"partnerInvitations": "yes"}}'::jsonb));
  exception when sqlstate '22023' then return; end;
  raise exception 'PROBE FAILED: a feature switch that is not true or false was published';
end; $probe$;
-- A limit.
do $probe$ begin
  begin perform public.publish_engine_configuration(
    pg_temp.probe_configuration(1, '{"map": {"tiltDegrees": 45}}'::jsonb));
  exception when sqlstate '42501' then return; end;
  raise exception 'PROBE FAILED: a map tilt over the limit was published';
end; $probe$;
-- The legal page must name the service provider when the engine owner requires it.
do $probe$ begin
  begin perform public.publish_engine_configuration(pg_temp.probe_configuration(1, '{"legal": {}}'::jsonb));
  exception when sqlstate '42501' then return; end;
  raise exception 'PROBE FAILED: published without the required service provider';
end; $probe$;
-- The first revision is 1.
do $probe$ begin
  begin perform public.publish_engine_configuration(pg_temp.probe_configuration(2));
  exception when sqlstate '22023' then return; end;
  raise exception 'PROBE FAILED: a revision out of order was published';
end; $probe$;
-- Words for a key the engine does not have.
do $probe$ begin
  begin perform public.publish_engine_configuration(
    pg_temp.probe_configuration(1), '{"database": {"notification.madeUp": "x"}}'::jsonb);
  exception when sqlstate '22023' then return; end;
  raise exception 'PROBE FAILED: wording for an unknown key was published';
end; $probe$;
-- Markup in a sentence.
do $probe$ begin
  begin perform public.publish_engine_configuration(
    pg_temp.probe_configuration(1), '{"database": {"notification.ideaLead.title": "<b>hello</b>"}}'::jsonb);
  exception when check_violation then return; end;
  raise exception 'PROBE FAILED: wording with markup was published';
end; $probe$;

-- None of the refused attempts left anything behind.
do $probe$
begin
  if exists (select 1 from public.engine_configuration) or exists (select 1 from public.categories)
     or exists (select 1 from public.engine_wording where source = 'tenant') then
    raise exception 'PROBE FAILED: a refused publish left rows behind';
  end if;
end;
$probe$;

-- A good first publish.
select pg_temp.probe_user('staff', 'admin');
select pg_temp.probe_user('alice');
select public.publish_engine_configuration(
  pg_temp.probe_configuration(1),
  '{"database": {"notification.ideaLead.title": "Well done!"}, "edge": {"notification.nearbyRsvp": "Neighbours nearby just said yes."}}'::jsonb,
  current_setting('probe.staff')::uuid);

do $probe$
declare
  v_row record;
begin
  select * into v_row from public.engine_configuration where is_current;
  if v_row.revision <> 1 or v_row.published_by <> current_setting('probe.staff')::uuid then
    raise exception 'PROBE FAILED: the first revision was not stored as the current one';
  end if;
  if (select count(*) from public.engine_wording where source = 'tenant' and revision = 1) <> 2 then
    raise exception 'PROBE FAILED: the world''s wording rows were not written';
  end if;
  -- "markets" is in both lists; "talks" only in events; "venues" only in places.
  if (select string_agg(slug || ':' || applies_to, ',' order by slug) from public.categories)
       <> 'markets:both,talks:events,venues:places' then
    raise exception 'PROBE FAILED: the categories table does not follow the configuration: %',
      (select string_agg(slug || ':' || applies_to, ',' order by slug) from public.categories);
  end if;
  if not public.engine_feature_on('partnerInvitations') then
    raise exception 'PROBE FAILED: a feature that is on and allowed reads as off';
  end if;
  if public.engine_feature_on('communityIdeas') or public.engine_feature_on('gatherings') then
    raise exception 'PROBE FAILED: a feature that the world did not switch on reads as on';
  end if;
end;
$probe$;

-- A published revision is a record.
do $probe$ begin
  begin update public.engine_configuration set document = document || '{"x": 1}'::jsonb where revision = 1;
  exception when sqlstate '42501' then return; end;
  raise exception 'PROBE FAILED: a published revision was edited';
end; $probe$;
do $probe$ begin
  begin delete from public.engine_configuration where revision = 1;
  exception when sqlstate '42501' then return; end;
  raise exception 'PROBE FAILED: a published revision was deleted';
end; $probe$;

-- An event uses "talks". The second revision drops "talks" and "venues" and adds "walks".
insert into public.events (title, description, date, location, created_by, category)
values ('Probe talk', 'A made-up event.', now() + interval '7 days', 'Somewhere', current_setting('probe.staff')::uuid, 'talks');

select public.publish_engine_configuration(
  pg_temp.probe_configuration(2, jsonb_build_object('categories', jsonb_build_object(
    'events', jsonb_build_array(
      jsonb_build_object('id', 'markets', 'label', 'Street markets', 'color', '#112233'),
      jsonb_build_object('id', 'walks', 'label', 'Walks', 'color', '#445566')),
    'places', '[]'::jsonb,
    'partnerTypes', '[]'::jsonb,
    'partnerKinds', jsonb_build_array(jsonb_build_object('id', 'business', 'label', 'Business'))))),
  '{}'::jsonb);

do $probe$
begin
  if (select count(*) from public.engine_configuration where is_current) <> 1
     or (select revision from public.engine_configuration where is_current) <> 2 then
    raise exception 'PROBE FAILED: there is not exactly one current revision, the newest';
  end if;
  if (select count(*) from public.engine_configuration) <> 2 then
    raise exception 'PROBE FAILED: the earlier revision was not kept';
  end if;
  -- "talks" stays because an event uses it; "venues" goes; "markets" is renamed and now events only.
  if (select string_agg(slug || ':' || applies_to || ':' || name, ',' order by slug) from public.categories)
       <> 'markets:events:Street markets,talks:events:Talks,walks:events:Walks' then
    raise exception 'PROBE FAILED: categories after the second publish: %',
      (select string_agg(slug || ':' || applies_to || ':' || name, ',' order by slug) from public.categories);
  end if;
  if exists (select 1 from public.engine_wording where source = 'tenant') then
    raise exception 'PROBE FAILED: wording of the earlier revision was not replaced';
  end if;
end;
$probe$;

-- Who reads what: everyone the current revision, staff the earlier ones too.
select pg_temp.probe_claims('alice');
set local role authenticated;
do $probe$
begin
  if (select string_agg(revision::text, ',' order by revision) from public.engine_configuration) <> '2' then
    raise exception 'PROBE FAILED: a signed-in person sees more than the current revision';
  end if;
end;
$probe$;
reset role;

select pg_temp.probe_claims('staff');
set local role authenticated;
do $probe$
begin
  if (select string_agg(revision::text, ',' order by revision) from public.engine_configuration) <> '1,2' then
    raise exception 'PROBE FAILED: staff cannot read the earlier revisions';
  end if;
end;
$probe$;
reset role;

-- When the engine owner takes a feature away, it reads as off at once, before any new publish.
select engine.write_entitlements(pg_temp.probe_entitlements('{}'::jsonb));
do $probe$
begin
  if public.engine_feature_on('partnerInvitations') then
    raise exception 'PROBE FAILED: a feature the engine owner took away still reads as on';
  end if;
end;
$probe$;
