-- Promise: a sentence written inside the database is this world's own. A function reads it by
-- key: the world's wording when it has published one, the engine's neutral default when it has
-- not, and never a sentence of its own.

-- ── the helper ──────────────────────────────────────────────────────
do $probe$
begin
  if public.engine_text('notification.ideaLead.title') <> 'Your idea reached its goal!' then
    raise exception 'PROBE FAILED: the engine default is not returned';
  end if;
  if public.engine_text('notification.followedPartner.newEvent', jsonb_build_object('name', 'Harbour Cafe'))
       <> 'New event from Harbour Cafe' then
    raise exception 'PROBE FAILED: a value was not filled in';
  end if;
  -- A value that looks like a placeholder is text, never read as one.
  if public.engine_text('notification.followedPartner.newEvent', jsonb_build_object('name', '{$title}', 'title', 'LEAK'))
       <> 'New event from {$title}' then
    raise exception 'PROBE FAILED: a value was read as a placeholder';
  end if;
  -- A value nobody gave is left empty; a key nobody has shows up as the key and stops nothing.
  if public.engine_text('notification.followedPartner.newEvent') <> 'New event from ' then
    raise exception 'PROBE FAILED: a missing value was not left empty';
  end if;
  if public.engine_text('notification.noSuchKey') <> 'notification.noSuchKey' then
    raise exception 'PROBE FAILED: an unknown key did not come back as the key';
  end if;
end;
$probe$;

-- ── a world that has published its own words ────────────────────────
select engine.write_entitlements(pg_temp.probe_entitlements(
  '{"partnerInvitations": true, "communityIdeas": true, "partnerApplications": true}'::jsonb));
select public.publish_engine_configuration(
  pg_temp.probe_configuration(1, '{"features": {"communityIdeas": true, "partnerApplications": true}}'::jsonb),
  jsonb_build_object('database', jsonb_build_object(
    'notification.partnerApproved.title', 'You are on Quillfern Commons!',
    'notification.partnerApproved.body', 'Your host page is live.',
    'notification.partnerDeclined.title', 'About your host application',
    'notification.followedPartner.fallbackName', 'a host you follow',
    'notification.followedPartner.newUpdate', 'News from {$name}',
    'notification.ideaGoalReached.title', 'Commons project: goal reached!',
    'notification.ideaGoalReached.body', '"{$title}" has the votes it needed.',
    'notification.ideaLead.body', 'You lead "{$title}". Pick a start date on the Commons projects board.',
    'notification.ideaScheduled.title', 'Commons project has a date',
    'screen.ideas.eventNote', 'This is a confirmed Commons project.'
  )));

select pg_temp.probe_user('staff', 'admin');
select pg_temp.probe_user('host', 'contributor');
select pg_temp.probe_user('alice');
select pg_temp.probe_user('ben');
select pg_temp.probe_user('applicant');

-- Approving and declining an application to become a partner.
insert into public.contributor_applications (id, user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', current_setting('probe.applicant')::uuid, 'Harbour Cafe');
insert into public.contributor_applications (id, user_id, display_name)
values ('00000000-0000-4000-8000-000000000002', current_setting('probe.ben')::uuid, 'Ben''s Bikes');

select pg_temp.probe_claims('staff');
set local role authenticated;
do $probe$
declare
  v_result jsonb;
begin
  v_result := public.approve_contributor_application('00000000-0000-4000-8000-000000000001');
  if not (v_result ->> 'success')::boolean then
    raise exception 'PROBE FAILED: staff could not approve an application: %', v_result;
  end if;
  v_result := public.reject_contributor_application('00000000-0000-4000-8000-000000000002', 'Not yet.');
  if not (v_result ->> 'success')::boolean then
    raise exception 'PROBE FAILED: staff could not decline an application: %', v_result;
  end if;
end;
$probe$;
reset role;

do $probe$
begin
  if not exists (
    select 1 from public.notifications n
     where n.user_id = current_setting('probe.applicant')::uuid and n.type = 'contributor_approved'
       and n.title = 'You are on Quillfern Commons!' and n.body = 'Your host page is live.'
  ) then
    raise exception 'PROBE FAILED: the approval notice is not in the world''s words: %',
      (select string_agg(n.title || ' / ' || n.body, ' ; ') from public.notifications n
        where n.user_id = current_setting('probe.applicant')::uuid);
  end if;
  if not exists (
    select 1 from public.notifications n
     where n.user_id = current_setting('probe.ben')::uuid and n.type = 'contributor_rejected'
       and n.title = 'About your host application' and n.body = 'Not yet.'
  ) then
    raise exception 'PROBE FAILED: the decline notice is not in the world''s words';
  end if;
end;
$probe$;

-- An idea reaches its goal and its project is scheduled.
insert into public.suggestions (id, user_id, title, body, page_url, tier, vote_threshold)
values ('00000000-0000-4000-8000-000000000003', current_setting('probe.alice')::uuid,
        'A bench by the river', 'Somewhere to sit and look at the water.', '/community', 'small', 1);

select pg_temp.probe_claims('ben');
set local role authenticated;
do $probe$
declare
  v_result jsonb;
begin
  v_result := public.vote_on_idea('00000000-0000-4000-8000-000000000003');
  if not (v_result ->> 'auto_eligible')::boolean then
    raise exception 'PROBE FAILED: the idea did not start on its own at its goal: %', v_result;
  end if;
end;
$probe$;
reset role;

do $probe$
begin
  if not exists (
    select 1 from public.notifications n
     where n.user_id = current_setting('probe.ben')::uuid
       and n.title = 'Commons project: goal reached!'
       and n.body = '"A bench by the river" has the votes it needed.'
  ) then
    raise exception 'PROBE FAILED: the goal notice is not in the world''s words: %',
      (select string_agg(n.title || ' / ' || n.body, ' ; ') from public.notifications n
        where n.user_id = current_setting('probe.ben')::uuid and n.type = 'suggestion_response');
  end if;
  -- The lead's notice: a title the world did not word (engine default) and a body it did.
  if not exists (
    select 1 from public.notifications n
     where n.user_id = current_setting('probe.alice')::uuid
       and n.title = 'Your idea reached its goal!'
       and n.body = 'You lead "A bench by the river". Pick a start date on the Commons projects board.'
  ) then
    raise exception 'PROBE FAILED: the lead''s notice is wrong: %',
      (select string_agg(n.title || ' / ' || n.body, ' ; ') from public.notifications n
        where n.user_id = current_setting('probe.alice')::uuid);
  end if;
end;
$probe$;

select pg_temp.probe_claims('alice');
set local role authenticated;
do $probe$
begin
  perform public.schedule_kingdom_project('00000000-0000-4000-8000-000000000003', now() + interval '10 days');
end;
$probe$;
reset role;

do $probe$
declare
  v_event record;
begin
  select e.* into v_event
    from public.events e
    join public.suggestions s on s.associated_event_id = e.id
   where s.id = '00000000-0000-4000-8000-000000000003';
  if v_event.id is null then
    raise exception 'PROBE FAILED: scheduling made no event';
  end if;
  -- The idea had no category, so the event takes the first one this world lists.
  if v_event.category <> 'markets' then
    raise exception 'PROBE FAILED: the kickoff event got the category %', v_event.category;
  end if;
  if position('This is a confirmed Commons project.' in v_event.description) = 0 then
    raise exception 'PROBE FAILED: the kickoff event''s note is not in the world''s words: %', v_event.description;
  end if;
  if not exists (
    select 1 from public.notifications n
     where n.user_id = current_setting('probe.ben')::uuid and n.title = 'Commons project has a date'
       and n.body = '"A bench by the river" has a kickoff date. You are connected automatically.'
  ) then
    raise exception 'PROBE FAILED: the scheduling notice is wrong: %',
      (select string_agg(n.title || ' / ' || n.body, ' ; ') from public.notifications n
        where n.user_id = current_setting('probe.ben')::uuid);
  end if;
end;
$probe$;

-- A partner's news reaches a follower, in the world's words.
insert into public.follows (follower_id, followee_id)
values (current_setting('probe.alice')::uuid, current_setting('probe.host')::uuid);
insert into public.news_posts (contributor_id, title, body)
values (current_setting('probe.host')::uuid, 'Fresh bread on Fridays', 'From this week.');

do $probe$
begin
  if not exists (
    select 1 from public.notifications n
     where n.user_id = current_setting('probe.alice')::uuid and n.type = 'followed_new_news'
       and n.title = 'News from host' and n.body = 'Fresh bread on Fridays'
  ) then
    raise exception 'PROBE FAILED: the follower notice is wrong: %',
      (select coalesce(string_agg(n.type || ': ' || n.title, ' ; '), 'no notice at all') from public.notifications n
        where n.user_id = current_setting('probe.alice')::uuid);
  end if;
end;
$probe$;

-- No sentence anywhere names another world.
do $probe$
begin
  if exists (
    select 1 from public.notifications n
     where (n.title || ' ' || n.body) ~* '(citizen|kingdom|contributor)'
  ) then
    raise exception 'PROBE FAILED: a notice carries framing from another world: %',
      (select string_agg(n.title || ' / ' || n.body, ' ; ') from public.notifications n
        where (n.title || ' ' || n.body) ~* '(citizen|kingdom|contributor)');
  end if;
end;
$probe$;
