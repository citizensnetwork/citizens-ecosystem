-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 187_follower_notifications (P2-04). Run 2026-10-17 against the live triggers right
--  after the apply.
--  HOW: paste into the Supabase SQL runner / MCP execute_sql. It builds synthetic users and approved Contributors (nothing
--  names a real person or organisation), publishes events and news posts as the table owner, counts the notifications the
--  triggers wrote, and ends with RAISE EXCEPTION, so the whole transaction rolls back and NOTHING persists. One line per
--  check, PASS or FAIL.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); c4 uuid := gen_random_uuid();
  cit uuid := gen_random_uuid();
  f uuid[]; g uuid := gen_random_uuid(); h uuid := gen_random_uuid(); h2 uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid(); e2 uuid; ed uuid; n int; res text[] := '{}';
begin
  f := array(select gen_random_uuid() from generate_series(1, 501));
  insert into auth.users (id, email) select u, 'probe-f' || row_number() over () || '@probe.example' from unnest(f) as u;
  insert into auth.users (id, email) values
    (c1, 'probe-c1@probe.example'), (c2, 'probe-c2@probe.example'), (c3, 'probe-c3@probe.example'), (c4, 'probe-c4@probe.example'),
    (cit, 'probe-cit@probe.example'), (g, 'probe-g@probe.example'), (h, 'probe-h@probe.example'), (h2, 'probe-h2@probe.example');
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-one', full_name = 'Probe One' where id = c1;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-two', full_name = 'Probe Two' where id = c2;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-three', full_name = 'Probe Three' where id = c3;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_slug = 'probe-four', full_name = 'Probe Four' where id = c4;

  -- 1. c1 has five followers: f1 normal, f2 switched contributor_updates off, f3 muted the Contributor, f4 is blocked, f5 muted event e1
  insert into public.follows (follower_id, followee_id) select f[i], c1 from generate_series(1, 5) as i;
  update public.profiles set notification_prefs = '{"contributor_updates": false}'::jsonb where id = f[2];
  update public.profiles set muted_source_ids = jsonb_build_array(jsonb_build_object('type', 'org', 'id', c1::text)) where id = f[3];
  insert into public.user_blocks (blocker_id, blocked_id) values (f[4], c1);
  update public.profiles set muted_source_ids = jsonb_build_array(jsonb_build_object('type', 'event', 'id', e1::text)) where id = f[5];
  insert into public.events (id, title, date, created_by) values (e1, 'Probe event one', now() + interval '7 days', c1);
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = any (f[1:5]);
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a published event tells exactly one of the five (got ' || n || ')');
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = f[1];
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' ...and it is the follower with nothing switched off, muted or blocked (got ' || n || ')');
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = any (array[f[2], f[3], f[4], f[5]]);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' updates-off, muted-org, blocked and muted-event followers are not told (got ' || n || ')');

  -- 2. a second event in the same hour: two; a third event and then a news post: still two (the 24 hour cap)
  insert into public.events (title, date, created_by) values ('Probe event two', now() + interval '8 days', c1);
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = f[1];
  res := array_append(res, (case when n = 2 then 'PASS' else 'FAIL' end) || ' a second event in the hour makes 2 (got ' || n || ')');
  insert into public.events (title, date, created_by) values ('Probe event three', now() + interval '9 days', c1);
  insert into public.news_posts (contributor_id, title, body) values (c1, 'Probe news', 'Probe body');
  select count(*) into n from public.notifications where type in ('followed_new_event', 'followed_new_news') and user_id = f[1];
  res := array_append(res, (case when n = 2 then 'PASS' else 'FAIL' end) || ' a third event and a news post stay at 2: the cap counts events and news together (got ' || n || ')');

  -- 3. a news post alone tells the eligible follower once, with the Contributor in the data
  insert into public.follows (follower_id, followee_id) values (g, c2);
  insert into public.news_posts (contributor_id, title, body) values (c2, 'Probe news two', 'Probe body');
  select count(*) into n from public.notifications where type = 'followed_new_news' and user_id = g and (data->>'contributor_id') = c2::text;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a news post tells the follower once (got ' || n || ')');

  -- 4. a draft tells nobody; publishing it tells once; a rename, a cancel and a re-publish never tell again
  insert into public.follows (follower_id, followee_id) values (h, c3);
  insert into public.events (id, title, date, created_by, status) values (gen_random_uuid(), 'Probe draft', now() + interval '7 days', c3, 'draft') returning id into ed;
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = h;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a draft tells nobody (got ' || n || ')');
  update public.events set status = 'published' where id = ed;
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = h;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' publishing the draft tells once (got ' || n || ')');
  update public.events set title = 'Probe draft renamed' where id = ed;
  update public.events set status = 'cancelled' where id = ed;
  update public.events set status = 'published' where id = ed;
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = h;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a rename, a cancel and a re-publish never tell again (got ' || n || ')');

  -- 5. nothing for a private, past or cancelled event, or a citizen's event (a fresh follower so the cap is not involved)
  insert into public.follows (follower_id, followee_id) values (h2, c4), (h2, cit);
  insert into public.events (title, date, created_by, visibility) values ('Probe private', now() + interval '7 days', c4, 'private');
  insert into public.events (title, date, created_by) values ('Probe past', now() - interval '1 day', c4);
  insert into public.events (title, date, created_by, status) values ('Probe cancelled', now() + interval '7 days', c4, 'cancelled');
  insert into public.events (title, date, created_by) values ('Probe by a citizen', now() + interval '7 days', cit);
  select count(*) into n from public.notifications where type = 'followed_new_event' and user_id = h2;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a private, a past, a cancelled and a citizen''s event tell nobody (got ' || n || ')');

  -- 6. 501 followers: 500 notifications (c4 now has h2 as well, so 502 follows; the oldest-newest rule only trims to 500)
  insert into public.follows (follower_id, followee_id) select f[i], c4 from generate_series(1, 501) as i;
  insert into public.events (title, date, created_by) values ('Probe big audience', now() + interval '10 days', c4);
  select count(*) into n from public.notifications where type = 'followed_new_event' and (data->>'contributor_id') = c4::text;
  res := array_append(res, (case when n = 500 then 'PASS' else 'FAIL' end) || ' 502 followers get 500 notifications for one event (got ' || n || ')');

  -- 7. the trigger functions are not callable by the public key or by a signed-in person
  res := array_append(res, (case when not has_function_privilege('anon', 'public.notify_followers_of_event()', 'execute')
    and not has_function_privilege('authenticated', 'public.notify_followers_of_event()', 'execute')
    and not has_function_privilege('anon', 'public.notify_followers_of_news()', 'execute')
    and not has_function_privilege('authenticated', 'public.notify_followers_of_news()', 'execute')
    and not has_function_privilege('anon', 'public.followed_post_audience(uuid,text,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.followed_post_audience(uuid,text,uuid)', 'execute')
    then 'PASS' else 'FAIL' end) || ' anon and authenticated cannot execute the two trigger functions or the audience function');

  -- 8. the new kinds are accepted by the table's check, an unknown one is still refused
  begin
    insert into public.notifications (user_id, type, title, body) values (f[1], 'followed_new_unknown', 't', 'b');
    res := array_append(res, 'FAIL an unknown kind was accepted');
  exception when check_violation then res := array_append(res, 'PASS an unknown kind is still refused by the check');
  end;

  raise exception 'PROBE RESULT (rolled back):%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
