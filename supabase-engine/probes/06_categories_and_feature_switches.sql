-- Promise: categories are the world's own data, and a feature that is off is off in the
-- database too, not only hidden on a screen.

select engine.write_entitlements(pg_temp.probe_entitlements());
-- The ideas feature is allowed, but this world has not switched it on.
select public.publish_engine_configuration(pg_temp.probe_configuration(1));

select pg_temp.probe_user('alice');
select pg_temp.probe_user('ben');
select pg_temp.probe_user('host', 'contributor');

-- An event's category must be one this world has, for events.
do $probe$ begin
  begin
    insert into public.events (title, description, date, location, created_by, category)
    values ('Probe', 'A made-up event.', now() + interval '3 days', 'Somewhere', current_setting('probe.host')::uuid, 'church-services');
  exception when check_violation then return; end;
  raise exception 'PROBE FAILED: an event took a category this world does not have';
end; $probe$;
do $probe$ begin
  begin
    -- "venues" exists, but only for places.
    insert into public.events (title, description, date, location, created_by, category)
    values ('Probe', 'A made-up event.', now() + interval '3 days', 'Somewhere', current_setting('probe.host')::uuid, 'venues');
  exception when check_violation then return; end;
  raise exception 'PROBE FAILED: an event took a place category';
end; $probe$;

insert into public.events (id, title, description, date, location, created_by, category)
values ('00000000-0000-4000-8000-000000000010', 'Saturday market', 'A made-up event.', now() + interval '3 days',
        'Somewhere', current_setting('probe.host')::uuid, 'markets');

do $probe$
begin
  if (select e.category_id from public.events e where e.id = '00000000-0000-4000-8000-000000000010')
       is distinct from (select c.id from public.categories c where c.slug = 'markets') then
    raise exception 'PROBE FAILED: the event was not linked to its category row';
  end if;
end;
$probe$;

-- A person who is not a partner may post one community event in the window; the refusal of the
-- second one names nobody's world.
insert into public.events (title, description, date, location, created_by, category)
values ('Street party', 'A made-up event.', now() + interval '5 days', 'Somewhere', current_setting('probe.alice')::uuid, 'talks');
do $probe$ begin
  begin
    insert into public.events (title, description, date, location, created_by, category)
    values ('Another one', 'A made-up event.', now() + interval '6 days', 'Somewhere', current_setting('probe.alice')::uuid, 'talks');
  exception when raise_exception then
    if sqlerrm not like 'community_event_rate_limited: you may create %' then
      raise exception 'PROBE FAILED: unexpected message: %', sqlerrm;
    end if;
    return;
  end;
  raise exception 'PROBE FAILED: the community event limit did not hold';
end; $probe$;

-- The ideas board is off: its functions refuse.
insert into public.suggestions (id, user_id, title, body, page_url, tier, vote_threshold)
values ('00000000-0000-4000-8000-000000000011', current_setting('probe.alice')::uuid,
        'A bench by the river', 'Somewhere to sit and look at the water.', '/community', 'small', 1);

select pg_temp.probe_claims('ben');
set local role authenticated;
do $probe$ begin
  begin perform public.vote_on_idea('00000000-0000-4000-8000-000000000011');
  exception when insufficient_privilege then
    if sqlerrm <> 'feature_off' then
      raise exception 'PROBE FAILED: unexpected message: %', sqlerrm;
    end if;
    return;
  end;
  raise exception 'PROBE FAILED: a vote was taken while the ideas feature is off';
end; $probe$;
do $probe$ begin
  begin perform public.schedule_kingdom_project('00000000-0000-4000-8000-000000000011', now() + interval '9 days');
  exception when insufficient_privilege then
    if sqlerrm <> 'feature_off' then
      raise exception 'PROBE FAILED: unexpected message: %', sqlerrm;
    end if;
    return;
  end;
  raise exception 'PROBE FAILED: a project was scheduled while the ideas feature is off';
end; $probe$;
reset role;

-- Switched on: a tier this world marks "staff decide" waits; it does not start on its own.
select public.publish_engine_configuration(
  pg_temp.probe_configuration(2, '{"features": {"partnerInvitations": true, "communityIdeas": true}}'::jsonb));
insert into public.app_settings (key, value) values ('ideas_review_tiers', '["large"]'::jsonb);
update public.suggestions set tier = 'large' where id = '00000000-0000-4000-8000-000000000011';

select pg_temp.probe_claims('ben');
set local role authenticated;
do $probe$
declare
  v_result jsonb;
begin
  v_result := public.vote_on_idea('00000000-0000-4000-8000-000000000011');
  if (v_result ->> 'auto_eligible')::boolean or not (v_result ->> 'threshold_reached')::boolean then
    raise exception 'PROBE FAILED: a tier that waits for staff started on its own: %', v_result;
  end if;
end;
$probe$;
reset role;

do $probe$
begin
  if (select s.idea_status from public.suggestions s where s.id = '00000000-0000-4000-8000-000000000011') <> 'voting' then
    raise exception 'PROBE FAILED: the idea left the voting stage without staff';
  end if;
end;
$probe$;
