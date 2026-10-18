-- ════════════════════════════════════════════════════════════════════
--  Rollback-only DRY RUN for the proposal docs/proposals/friends-considering.sql, now supabase/migrations/191_friends_considering.sql (the Convince reader and the "considering" switch).
--  HOW: paste the whole file (friends_considering.probe.sql, the generated one) into the Supabase SQL runner / MCP execute_sql. It builds synthetic
--  people and events, shows the two gaps on the LIVE objects (the reader does not exist; a friend who switched "considering" off can still be
--  probed through the nudge policy), then runs the proposal's own body (the block between the markers, spliced in unchanged by the generator
--  and held equal by a unit test) inside the same transaction, then checks the result as the viewer, as friends, as a stranger and as the
--  public key. It ends with RAISE EXCEPTION, so the whole transaction rolls back, the DDL included, and NOTHING persists. One line per check,
--  PASS or FAIL. Nothing here names a real person or organisation. After the real apply, run it again WITHOUT the marked block.
--  RESULT of the dry run on 2026-10-18: 41 of 41 PASS (the first lines are the two gaps on the live objects: "no friends_considering_event yet" and "BYPASS REPRODUCED"), rolled back; a read afterwards
--  showed the live functions, users, notifications and migration head exactly as before.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); y uuid := gen_random_uuid(); c uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); z uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); q uuid := gen_random_uuid();
  o uuid := gen_random_uuid(); v uuid := gen_random_uuid(); u uuid := gen_random_uuid();
  ev uuid; ev_can uuid; ev_old uuid; ev_none uuid; ev_bulk uuid;
  n bigint; ok boolean; t text; cols text; res text[] := '{}';
begin
  -- ── synthetic people. a is the viewer. b and y are friends who are considering ev (y has JUNK stored in the switch). c is a friend who is considering ev and has
  --    the switch OFF. w is a friend who is attending, not considering. x follows nobody back (a follows x). z is a stranger. d blocked a; a blocked e. q is deleted.
  --    o organises everything. v is a friend who is considering only a cancelled event.
  insert into auth.users (id, email) values
    (a, 'probe-a@probe.example'), (b, 'probe-b@probe.example'), (y, 'probe-y@probe.example'), (c, 'probe-c@probe.example'), (w, 'probe-w@probe.example'),
    (x, 'probe-x@probe.example'), (z, 'probe-z@probe.example'), (d, 'probe-d@probe.example'), (e, 'probe-e@probe.example'), (q, 'probe-q@probe.example'),
    (o, 'probe-o@probe.example'), (v, 'probe-v@probe.example'), (u, 'probe-u@probe.example');
  update public.profiles set full_name = 'Probe Viewer' where id = a;
  update public.profiles set full_name = 'Probe Bea' where id = b;
  update public.profiles set full_name = 'Probe Ann', notification_prefs = notification_prefs || '{"share_considering": "nope"}'::jsonb where id = y;
  update public.profiles set full_name = 'Probe Cleo' where id = c;
  update public.profiles set full_name = 'Probe Wren' where id = w;
  update public.profiles set full_name = 'Probe Xavi' where id = x;
  update public.profiles set full_name = 'Probe Zed' where id = z;
  update public.profiles set full_name = 'Probe Dee' where id = d;
  update public.profiles set full_name = 'Probe Eli' where id = e;
  update public.profiles set full_name = 'Probe Quin', deleted_at = now() where id = q;
  update public.profiles set full_name = 'Probe Vic' where id = v;
  update public.profiles set full_name = '' where id = u;   -- an email sign-up: the name is '' (the column is NOT NULL), not NULL

  insert into public.events (title, date, created_by) values ('Probe event', now() + interval '7 days', o) returning id into ev;
  insert into public.events (title, date, created_by, status) values ('Probe cancelled event', now() + interval '7 days', o, 'cancelled') returning id into ev_can;
  insert into public.events (title, date, end_time, created_by) values ('Probe ended event', now() - interval '5 days', now() - interval '5 days' + interval '2 hours', o) returning id into ev_old;
  insert into public.events (title, date, created_by) values ('Probe event nobody considers', now() + interval '7 days', o) returning id into ev_none;
  insert into public.events (title, date, created_by) values ('Probe bulk event', now() + interval '7 days', o) returning id into ev_bulk;

  -- mutual follows a<->b, a<->y, a<->c, a<->w, a<->d, a<->e, a<->q, a<->v; a follows x one way; z follows nobody
  insert into public.follows (follower_id, followee_id) values
    (a, b), (b, a), (a, y), (y, a), (a, c), (c, a), (a, w), (w, a), (a, d), (d, a), (a, e), (e, a), (a, q), (q, a), (a, v), (v, a), (a, x), (u, b), (b, u);
  insert into public.rsvps (user_id, event_id, status) values
    (a, ev, 'considering'), (b, ev, 'considering'), (y, ev, 'considering'), (c, ev, 'considering'), (w, ev, 'attending'), (x, ev, 'considering'),
    (d, ev, 'considering'), (e, ev, 'considering'), (q, ev, 'considering'), (z, ev, 'considering'), (v, ev_can, 'considering'), (b, ev_can, 'considering'),
    (b, ev_old, 'considering');
  insert into public.user_blocks (blocker_id, blocked_id) values (d, a), (a, e);

  -- 55 more mutual friends of a, all considering ev_bulk: the reader must stop at 50
  create temp table probe_bulk (id uuid) on commit drop;
  with ins as (insert into auth.users (id, email) select gen_random_uuid(), 'probe-bulk-' || g || '@probe.example' from generate_series(1, 55) g returning id)
    insert into probe_bulk select id from ins;
  update public.profiles set full_name = 'Probe Bulk ' || lpad(substr(id::text, 1, 6), 6, '0') where id in (select id from probe_bulk);
  insert into public.follows (follower_id, followee_id) select a, id from probe_bulk union all select id, a from probe_bulk;
  insert into public.rsvps (user_id, event_id, status) select id, ev_bulk, 'considering' from probe_bulk;

  execute $f$ create function pg_temp.as_user(u uuid) returns void language plpgsql as $b$
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', u::text, true);
      execute 'set local role authenticated';
    end $b$ $f$;

  -- c switches "considering" OFF (written directly here, as the setter does not exist yet in the live version)
  update public.profiles set notification_prefs = notification_prefs || '{"share_considering": false}'::jsonb where id = c;

  -- ── BEFORE: the two gaps on the LIVE objects
  res := array_append(res, (case when to_regprocedure('public.friends_considering_event(uuid)') is null then 'PASS' else 'NOTE' end) || ' live: there is no friends_considering_event yet (the event screen has nothing to read)');
  perform pg_temp.as_user(a);
  select count(*) into n from public.rsvps where event_id = ev and user_id = b;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' live: a cannot read b''s rsvps row directly (' || n || '), which is why a reader function is needed');
  begin
    insert into public.convinces (from_user_id, to_user_id, event_id) values (a, c, ev);
    res := array_append(res, 'PASS BYPASS REPRODUCED on the live policy: c has the switch OFF and a nudge to c is still accepted (a 201 tells a that c is considering)');
    delete from public.convinces where from_user_id = a and to_user_id = c and event_id = ev;
  exception when insufficient_privilege then
    res := array_append(res, 'NOTE live policy already refuses c (bypass not reproduced)');
  end;
  execute 'reset role';
  delete from public.notifications where user_id = c and type = 'friend_convince';

  -- ══ BEGIN PROPOSAL BODY (spliced unchanged from the proposal, now supabase/migrations/191_friends_considering.sql, by the generator) ══
  execute $mig$
-- A. one more key in the whitelist. Everything else is the live body, word for word (CREATE OR REPLACE would drop search_path and the ACL
--    guarantees, so they are restated).
create or replace function public.update_notification_prefs(delta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_keys text[] := array[
    'friends_activity',
    'event_reminders',
    'contributor_updates',
    'announcements',
    'weekly_digest',
    'share_considering'
  ];
  k text;
  v jsonb;
  sanitized jsonb := '{}'::jsonb;
  uid uuid := auth.uid();
  merged jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(delta) is distinct from 'object' then
    raise exception 'delta must be a jsonb object' using errcode = '22023';
  end if;

  for k, v in select key, value from jsonb_each(delta) loop
    if not (k = any(allowed_keys)) then
      raise exception 'unknown preference key: %', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) is distinct from 'boolean' then
      raise exception 'preference % must be boolean', k using errcode = '22023';
    end if;
    sanitized := sanitized || jsonb_build_object(k, v);
  end loop;

  update public.profiles
     set notification_prefs = coalesce(notification_prefs, jsonb_build_object(
            'friends_activity',    true,
            'event_reminders',     true,
            'contributor_updates', true,
            'announcements',       true,
            'weekly_digest',       true,
            'share_considering',   true
          )) || sanitized
   where id = uid
  returning notification_prefs into merged;

  if merged is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  return merged;
end;
$$;
revoke all on function public.update_notification_prefs(jsonb) from public, anon;
grant execute on function public.update_notification_prefs(jsonb) to authenticated;

-- B. the Convince helper: the live body with the opt-out folded into the "account" test. A missing key means shown.
create or replace function public.is_considering_for_friend(p_other uuid, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and p_other is not null
    and p_event is not null
    and p_other <> auth.uid()
    and public.is_mutual_follow(p_other)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
         or (b.blocker_id = p_other and b.blocked_id = auth.uid())
    )
    and not exists (
      select 1 from public.profiles pr
      where pr.id = p_other
        and (pr.deleted_at is not null or pr.notification_prefs->>'share_considering' = 'false')
    )
    and exists (
      select 1 from public.events e
      where e.id = p_event
        and e.status = 'published'
        and coalesce(e.end_time, e.date + interval '1 day') >= now()
    )
    and exists (
      select 1 from public.rsvps r
      where r.user_id = p_other and r.event_id = p_event and r.status = 'considering'
    );
$$;
revoke all on function public.is_considering_for_friend(uuid, uuid) from public, anon;
grant execute on function public.is_considering_for_friend(uuid, uuid) to authenticated, service_role;
comment on function public.is_considering_for_friend(uuid, uuid) is
  'Convince policy helper: true only for a mutual, unblocked friend of the caller who is considering a published, not-yet-ended event and has not hidden it (notification_prefs.share_considering = false). Never raises, never returns rsvps data.';

-- C. the reader for the event screen
create or replace function public.friends_considering_event(p_event uuid)
returns table (id uuid, full_name text, avatar_url text, nudged boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.full_name,
         p.avatar_url,
         exists (
           select 1 from public.convinces c
           where c.from_user_id = auth.uid() and c.to_user_id = p.id and c.event_id = p_event
         ) as nudged
    from public.rsvps r
    join public.profiles p on p.id = r.user_id
   where auth.uid() is not null
     and p_event is not null
     and r.event_id = p_event
     and r.status = 'considering'
     and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = r.user_id)
     and public.is_considering_for_friend(r.user_id, p_event)
   order by lower(p.full_name), p.id
   limit 50;
$$;
revoke all on function public.friends_considering_event(uuid) from public, anon;
grant execute on function public.friends_considering_event(uuid) to authenticated, service_role;
comment on function public.friends_considering_event(uuid) is
  'The caller''s mutual, unblocked friends who are considering one published, not-yet-ended event and have not hidden it: id, full_name, avatar_url and whether the caller already nudged them. Same rule as the Convince policy (it asks is_considering_for_friend). Zero rows, never an error, for anything else.';

-- D. a sender with no name reads as "Someone" (the live body otherwise, word for word)
create or replace function public.notify_on_convince()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sender_name text;
  event_title text;
  target_prefs jsonb;
begin
  select coalesce(nullif(btrim(full_name), ''), 'Someone')
    into sender_name
    from public.profiles
   where id = new.from_user_id;

  select title
    into event_title
    from public.events
   where id = new.event_id;

  if event_title is null then
    return new;
  end if;

  select notification_prefs
    into target_prefs
    from public.profiles
   where id = new.to_user_id;

  if coalesce((target_prefs->>'friends_activity')::boolean, true) = false then
    return new;
  end if;

  -- the guard: this sender already nudged this person about this event (withdrawn and sent again): do not notify twice
  if exists (
    select 1 from public.notifications n
     where n.user_id = new.to_user_id
       and n.type = 'friend_convince'
       and n.data->>'event_id' = new.event_id::text
       and n.data->>'from_user_id' = new.from_user_id::text
  ) then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.to_user_id,
    'friend_convince',
    sender_name || ' thinks you should go to ' || event_title,
    'Tap to revisit the event',
    jsonb_build_object(
      'event_id',     new.event_id,
      'from_user_id', new.from_user_id
    )
  );

  return new;
end $$;
  $mig$;
  -- ══ END PROPOSAL BODY ══

  -- ── the reader, as the viewer a
  perform pg_temp.as_user(a);
  select string_agg(full_name, ',' order by k) into t from public.friends_considering_event(ev) with ordinality as r(id, full_name, avatar_url, nudged, k);
  res := array_append(res, (case when t = 'Probe Ann,Probe Bea' then 'PASS' else 'FAIL' end) || ' a sees exactly Ann and Bea, alphabetically (got "' || coalesce(t, 'none') || '"): not Cleo (switch off), Wren (attending), Xavi (one-way), Dee (blocked a), Eli (a blocked), Quin (deleted), Zed (stranger), a themself');
  select count(*) into n from public.friends_considering_event(ev) where id = y;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' junk stored in the switch ("nope") does not hide y and does not raise: only the exact value false hides');
  select pg_get_function_result('public.friends_considering_event(uuid)'::regprocedure) into cols;
  res := array_append(res, (case when cols = 'TABLE(id uuid, full_name text, avatar_url text, nudged boolean)' then 'PASS' else 'FAIL' end) || ' the reader returns only id, full_name, avatar_url, nudged (' || cols || ')');
  select count(*) into n from public.friends_considering_event(ev_can);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a cancelled event lists nobody (' || n || ')');
  select count(*) into n from public.friends_considering_event(ev_old);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' an ended event lists nobody (' || n || ')');
  select count(*) into n from public.friends_considering_event(ev_none);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' an event nobody considers lists nobody (' || n || ')');
  select count(*) into n from public.friends_considering_event(null);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a null event gives zero rows, not an error (' || n || ')');
  select count(*) into n from public.friends_considering_event(gen_random_uuid());
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' an unknown event gives zero rows, not an error (' || n || ')');
  select count(*) into n from public.friends_considering_event(ev_bulk);
  res := array_append(res, (case when n = 50 then 'PASS' else 'FAIL' end) || ' 55 friends are considering ev_bulk and the reader stops at 50 (' || n || ')');
  select count(*) into n from public.friends_considering_event(ev) where nudged;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' nobody is marked nudged before a nudges anyone (' || n || ')');

  -- the nudge: a visible friend is accepted, the hidden friend is refused (the SAME refusal as a friend who is not considering), then nudged shows
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev); res := array_append(res, 'PASS a nudges b (listed, visible)');
  exception when others then res := array_append(res, 'FAIL a could not nudge b: ' || sqlerrm); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, c, ev); res := array_append(res, 'FAIL a nudged c although c has the switch OFF');
  exception when insufficient_privilege then res := array_append(res, 'PASS a nudge to c (switch OFF) is refused, so the 201/403 cannot be used to find out who hid what'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, w, ev); res := array_append(res, 'FAIL a nudged w who is attending');
  exception when insufficient_privilege then res := array_append(res, 'PASS a nudge to w (not considering) is refused with the same error as the hidden friend c'); end;
  select string_agg(full_name || '=' || nudged::text, ',' order by k) into t from public.friends_considering_event(ev) with ordinality as r(id, full_name, avatar_url, nudged, k);
  res := array_append(res, (case when t = 'Probe Ann=false,Probe Bea=true' then 'PASS' else 'FAIL' end) || ' after nudging b the list marks Bea as nudged and Ann not (' || coalesce(t, 'none') || ')');
  delete from public.convinces where from_user_id = a and to_user_id = b and event_id = ev;
  select count(*) into n from public.friends_considering_event(ev) where nudged;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' after the withdraw nobody is marked nudged (' || n || ')');
  insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev);
  execute 'reset role';
  perform pg_temp.as_user(b);
  select string_agg(full_name || '=' || nudged::text, ',' order by k) into t from public.friends_considering_event(ev) with ordinality as r(id, full_name, avatar_url, nudged, k);
  res := array_append(res, (case when t = 'Probe Viewer=false' then 'PASS' else 'FAIL' end) || ' b sees a (a is considering too) and nudged is false: it is about b''s own nudges, not a''s (' || coalesce(t, 'none') || ')');
  execute 'reset role';

  -- the people who must get nothing
  perform pg_temp.as_user(x);
  select count(*) into n from public.friends_considering_event(ev);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' x, who a follows but who follows nobody back, sees no one (' || n || ')');
  execute 'reset role';
  perform pg_temp.as_user(z);
  select count(*) into n from public.friends_considering_event(ev);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a stranger sees no one and gets no error (' || n || ')');
  execute 'reset role';
  perform pg_temp.as_user(d);
  select count(*) into n from public.friends_considering_event(ev);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' d, who blocked a, sees a no more than a sees d (' || n || ')');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  select count(*) into n from public.friends_considering_event(ev);
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' no sign-in (no auth.uid()) gives zero rows (' || n || ')');
  execute 'reset role';

  -- the switch, through its one door: update_notification_prefs
  perform pg_temp.as_user(c);
  perform public.update_notification_prefs('{"share_considering": true}'::jsonb);
  execute 'reset role';
  perform pg_temp.as_user(a);
  select count(*) into n from public.friends_considering_event(ev) where id = c;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' control: when c switches it back ON through the setter, c appears (' || n || ')');
  execute 'reset role';
  perform pg_temp.as_user(c);
  perform public.update_notification_prefs('{"share_considering": false}'::jsonb);
  select notification_prefs into t from public.get_my_profile_private();
  execute 'reset role';
  res := array_append(res, (case when t::jsonb ->> 'share_considering' = 'false' and t::jsonb ->> 'friends_activity' = 'true' then 'PASS' else 'FAIL' end) || ' the setter merges: share_considering is false and the other switches are untouched, and the owner reads it through get_my_profile_private');
  perform pg_temp.as_user(a);
  select count(*) into n from public.friends_considering_event(ev) where id = c;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' switched OFF again through the setter: c is gone from the list (' || n || ')');
  execute 'reset role';
  perform pg_temp.as_user(c);
  begin perform public.update_notification_prefs('{"share_considering": "yes"}'::jsonb); res := array_append(res, 'FAIL the setter accepted a non-boolean');
  exception when sqlstate '22023' then res := array_append(res, 'PASS the setter refuses a non-boolean value'); end;
  begin perform public.update_notification_prefs('{"made_up_key": true}'::jsonb); res := array_append(res, 'FAIL the setter accepted an unknown key');
  exception when sqlstate '22023' then res := array_append(res, 'PASS the setter still refuses an unknown key'); end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  begin perform public.update_notification_prefs('{"share_considering": true}'::jsonb); res := array_append(res, 'FAIL the setter ran without a sign-in');
  exception when sqlstate '28000' then res := array_append(res, 'PASS the setter needs a sign-in'); end;
  execute 'reset role';

  -- controls: the other refusals were the block and the deleted account, nothing else
  delete from public.user_blocks where blocker_id = d and blocked_id = a;
  update public.profiles set deleted_at = null where id = q;
  perform pg_temp.as_user(a);
  select count(*) into n from public.friends_considering_event(ev) where id in (d, q);
  res := array_append(res, (case when n = 2 then 'PASS' else 'FAIL' end) || ' control: with the block lifted and the account restored, d and q appear (' || n || ')');
  execute 'reset role';


  -- D. the notification text: a named sender is unchanged, a sender with no name reads as Someone, the once-only guard still holds, the ACL is untouched
  perform pg_temp.as_user(u);
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (u, b, ev); res := array_append(res, 'PASS a sender with no name can nudge b');
  exception when others then res := array_append(res, 'FAIL a sender with no name could not nudge b: ' || sqlerrm); end;
  execute 'reset role';
  select title into t from public.notifications where user_id = b and type = 'friend_convince' and data->>'from_user_id' = u::text and data->>'event_id' = ev::text;
  res := array_append(res, (case when t = 'Someone thinks you should go to Probe event' then 'PASS' else 'FAIL' end) || ' a sender with no name reads as "Someone thinks you should go to ..." (got "' || coalesce(t, 'none') || '")');
  select title into t from public.notifications where user_id = b and type = 'friend_convince' and data->>'from_user_id' = a::text and data->>'event_id' = ev::text;
  res := array_append(res, (case when t = 'Probe Viewer thinks you should go to Probe event' then 'PASS' else 'FAIL' end) || ' a named sender still reads as "Probe Viewer thinks you should go to ..." (got "' || coalesce(t, 'none') || '")');
  select count(*) into n from public.notifications where user_id = b and type = 'friend_convince' and data->>'from_user_id' = a::text and data->>'event_id' = ev::text;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' the once-only guard still holds after a withdraw and a resend (' || n || ')');
  res := array_append(res, (case when not has_function_privilege('anon', 'public.notify_on_convince()', 'execute') and not has_function_privilege('authenticated', 'public.notify_on_convince()', 'execute') then 'PASS' else 'FAIL' end) || ' notify_on_convince is still not callable by the public key or signed-in users (ACL kept)');

  -- how the objects are set up
  res := array_append(res, (case when not has_function_privilege('anon', 'public.friends_considering_event(uuid)', 'execute') and has_function_privilege('authenticated', 'public.friends_considering_event(uuid)', 'execute') and has_function_privilege('service_role', 'public.friends_considering_event(uuid)', 'execute') then 'PASS' else 'FAIL' end) || ' friends_considering_event: signed-in and service role yes, public key no');
  select exists (select 1 from pg_proc where oid = 'public.friends_considering_event(uuid)'::regprocedure and prosecdef and 'search_path=pg_catalog, public' = any (proconfig)) into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' friends_considering_event is SECURITY DEFINER with search_path pg_catalog, public');
  select exists (select 1 from pg_proc where oid = 'public.is_considering_for_friend(uuid, uuid)'::regprocedure and prosecdef and 'search_path=pg_catalog, public' = any (proconfig)) into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' is_considering_for_friend is still SECURITY DEFINER with search_path pg_catalog, public');
  res := array_append(res, (case when not has_function_privilege('anon', 'public.is_considering_for_friend(uuid, uuid)', 'execute') and has_function_privilege('authenticated', 'public.is_considering_for_friend(uuid, uuid)', 'execute') and has_function_privilege('service_role', 'public.is_considering_for_friend(uuid, uuid)', 'execute') then 'PASS' else 'FAIL' end) || ' is_considering_for_friend: ACL unchanged (signed-in and service role yes, public key no)');
  select exists (select 1 from pg_proc where oid = 'public.update_notification_prefs(jsonb)'::regprocedure and prosecdef and 'search_path=""' = any (proconfig)) into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' update_notification_prefs is still SECURITY DEFINER with an empty search_path');
  res := array_append(res, (case when not has_function_privilege('anon', 'public.update_notification_prefs(jsonb)', 'execute') and has_function_privilege('authenticated', 'public.update_notification_prefs(jsonb)', 'execute') then 'PASS' else 'FAIL' end) || ' update_notification_prefs: ACL unchanged (signed-in yes, public key no)');
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'convinces';
  res := array_append(res, (case when n = 3 then 'PASS' else 'FAIL' end) || ' convinces still has exactly its three policies (' || n || ')');

  raise exception 'PROBE RESULT (rolled back):%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
