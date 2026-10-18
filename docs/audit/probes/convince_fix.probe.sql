-- ════════════════════════════════════════════════════════════════════
--  Rollback-only DRY RUN for the proposal docs/proposals/convince-fix.sql (Convince fix). Run 2026-10-18 against the live tables; nothing was applied.
--  HOW: paste the whole file into the Supabase SQL runner / MCP execute_sql. It builds synthetic users and events, REPRODUCES the bug on the live
--  policy (a friend who is not the organiser is refused), then runs the proposal's own body (the block between the markers below, spliced in
--  unchanged by the generator) inside the same transaction, then checks the result as the sender, the friend, a stranger and the public key.
--  It ends with RAISE EXCEPTION, so the whole transaction rolls back, the DDL included, and NOTHING persists. One line per check, PASS or FAIL.
--  Nothing here names a real person or organisation. After the real apply, run it again WITHOUT the marked block (the apply already did that part).
--  RESULT of the dry run on 2026-10-18: 36 of 36 PASS (the first line is "BUG REPRODUCED on the live policy"), rolled back; a read afterwards showed the
--  live policy, grants, functions, users, events and notifications exactly as before. MUTATION CHECK of this probe: a mutant body without the block,
--  deleted-account, event-state, dedup, grant and search_path parts made exactly the matching checks FAIL (9 FAIL lines, the controls still PASS).
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); x uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); p uuid := gen_random_uuid(); q uuid := gen_random_uuid();
  ev uuid; ev_can uuid; ev_old uuid; ev_att uuid; ev_none uuid; ev_blk uuid; ev_blk2 uuid; ev_del uuid; ev_pref uuid; ev_o uuid;
  n bigint; ok boolean; t text; privs text; res text[] := '{}';
begin
  -- ── synthetic people: a sends; b is a friend of a who is considering; x only has a one-way follow from a; o organises; d blocked a; e was blocked by a; p has the pref off; q is deleted
  insert into auth.users (id, email) values
    (a, 'probe-a@probe.example'), (b, 'probe-b@probe.example'), (x, 'probe-x@probe.example'), (o, 'probe-o@probe.example'),
    (d, 'probe-d@probe.example'), (e, 'probe-e@probe.example'), (p, 'probe-p@probe.example'), (q, 'probe-q@probe.example');
  update public.profiles set full_name = 'Probe Sender' where id = a;
  update public.profiles set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) || '{"friends_activity": false}'::jsonb where id = p;
  update public.profiles set deleted_at = now() where id = q;

  -- events: all organised by o (so the sender a is NOT the organiser: the case the live policy gets wrong), except ev_o which a organises
  insert into public.events (title, date, created_by) values ('Probe event', now() + interval '7 days', o) returning id into ev;
  insert into public.events (title, date, created_by, status) values ('Probe cancelled event', now() + interval '7 days', o, 'cancelled') returning id into ev_can;
  insert into public.events (title, date, end_time, created_by) values ('Probe ended event', now() - interval '5 days', now() - interval '5 days' + interval '2 hours', o) returning id into ev_old;
  insert into public.events (title, date, created_by) values ('Probe attending event', now() + interval '7 days', o) returning id into ev_att;
  insert into public.events (title, date, created_by) values ('Probe event nobody considers', now() + interval '7 days', o) returning id into ev_none;
  insert into public.events (title, date, created_by) values ('Probe blocked event', now() + interval '7 days', o) returning id into ev_blk;
  insert into public.events (title, date, created_by) values ('Probe blocked event two', now() + interval '7 days', o) returning id into ev_blk2;
  insert into public.events (title, date, created_by) values ('Probe deleted friend event', now() + interval '7 days', o) returning id into ev_del;
  insert into public.events (title, date, created_by) values ('Probe pref event', now() + interval '7 days', o) returning id into ev_pref;
  insert into public.events (title, date, created_by) values ('Probe event of a', now() + interval '8 days', a) returning id into ev_o;

  -- mutual follows a<->b, a<->d, a<->e, a<->p, a<->q; a follows x one way
  insert into public.follows (follower_id, followee_id) values
    (a, b), (b, a), (a, d), (d, a), (a, e), (e, a), (a, p), (p, a), (a, q), (q, a), (a, x);
  -- who is considering what
  insert into public.rsvps (user_id, event_id, status) values
    (b, ev, 'considering'), (b, ev_can, 'considering'), (b, ev_old, 'considering'), (b, ev_att, 'attending'), (b, ev_o, 'considering'),
    (x, ev, 'considering'), (d, ev_blk, 'considering'), (e, ev_blk2, 'considering'), (q, ev_del, 'considering'), (p, ev_pref, 'considering');
  insert into public.user_blocks (blocker_id, blocked_id) values (d, a), (a, e);

  -- tiny helper: become a signed-in person (called only as the superuser, after a reset role)
  execute $f$ create function pg_temp.as_user(u uuid) returns void language plpgsql as $b$
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', u::text, true);
      execute 'set local role authenticated';
    end $b$ $f$;

  -- ── BEFORE: reproduce the bug on the LIVE policy (a is a mutual friend of b, b is considering ev, a does not organise ev)
  perform pg_temp.as_user(a);
  begin
    insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev);
    res := array_append(res, 'NOTE live policy let an ordinary friend through (bug not reproduced)');
    delete from public.convinces where from_user_id = a and to_user_id = b and event_id = ev;
  exception when insufficient_privilege then
    res := array_append(res, 'PASS BUG REPRODUCED on the live policy: an ordinary mutual friend (not the organiser) is refused');
  end;
  -- the organiser case passes today (and must keep passing)
  insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev_o);
  res := array_append(res, 'PASS live policy: the organiser a can nudge b about their own event (existing behaviour)');
  delete from public.convinces where from_user_id = a and to_user_id = b and event_id = ev_o;
  execute 'reset role';
  delete from public.notifications where user_id = b and type = 'friend_convince';   -- start the dedup counts clean

  -- ══ BEGIN PROPOSAL BODY (spliced unchanged from docs/proposals/convince-fix.sql by the generator) ══
  execute $mig$
-- A. "is this friend considering that event" without reading their rsvps. Only about the caller; never raises.
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
    and not exists (select 1 from public.profiles pr where pr.id = p_other and pr.deleted_at is not null)
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
  'Convince policy helper: true only for a mutual, unblocked friend of the caller who is considering a published, not-yet-ended event. Never raises, never returns rsvps data.';

-- B. the INSERT policy: every other condition word for word, the rsvps EXISTS replaced by the helper
drop policy "Mutual friends can send convinces" on public.convinces;
create policy "Mutual friends can send convinces" on public.convinces
  for insert
  with check (
    auth.uid() = from_user_id
    and from_user_id <> to_user_id
    and public.is_mutual_follow(to_user_id)
    and public.is_considering_for_friend(to_user_id, event_id)
  );

-- C. one notification per (sender, friend, event): migration 070's body + the guard. ACL is kept by create or replace (140: service_role only).
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
  select coalesce(full_name, 'Someone')
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

-- D. grants: the public key has no business here; signed-in people only ever select, insert and delete their own rows through the policies
revoke all on public.convinces from anon;
revoke update, truncate, references, trigger on public.convinces from authenticated;

-- E. the standard search_path for the existing helper (same body)
alter function public.is_mutual_follow(uuid) set search_path = pg_catalog, public;
  $mig$;
  -- ══ END PROPOSAL BODY ══

  -- ── AFTER: the happy path, as the sender a
  perform pg_temp.as_user(a);
  begin
    insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev);
    res := array_append(res, 'PASS an ordinary mutual friend (not the organiser) can nudge b, who is considering the event');
  exception when others then
    res := array_append(res, 'FAIL ordinary friend refused: ' || sqlerrm);
  end;
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = b and type = 'friend_convince' and data->>'event_id' = ev::text and data->>'from_user_id' = a::text;
  select title into t from public.notifications where user_id = b and type = 'friend_convince' and data->>'event_id' = ev::text limit 1;
  res := array_append(res, (case when n = 1 and t = 'Probe Sender thinks you should go to Probe event' then 'PASS' else 'FAIL' end) || ' b got exactly one friend_convince notification with the right title (' || n || ', "' || coalesce(t, '') || '")');

  -- duplicate, withdraw, send again
  perform pg_temp.as_user(a);
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev); res := array_append(res, 'FAIL a duplicate convince was accepted'); exception when unique_violation then res := array_append(res, 'PASS a duplicate is refused by the unique row'); end;
  delete from public.convinces where from_user_id = a and to_user_id = b and event_id = ev;
  insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev);
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = b and type = 'friend_convince' and data->>'event_id' = ev::text and data->>'from_user_id' = a::text;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' withdraw and resend wrote the row again but did NOT notify b a second time (notifications: ' || n || ')');

  -- who must be refused
  perform pg_temp.as_user(a);
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, x, ev); res := array_append(res, 'FAIL a one-way follower target was accepted'); exception when insufficient_privilege then res := array_append(res, 'PASS x follows nobody back (one-way): refused even though x is considering'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev_none); res := array_append(res, 'FAIL accepted for an event b has no rsvp for'); exception when insufficient_privilege then res := array_append(res, 'PASS b is not considering this event: refused'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev_att); res := array_append(res, 'FAIL accepted when b is attending, not considering'); exception when insufficient_privilege then res := array_append(res, 'PASS b is attending (not considering): refused'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev_can); res := array_append(res, 'FAIL accepted for a cancelled event'); exception when insufficient_privilege then res := array_append(res, 'PASS cancelled event: refused'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev_old); res := array_append(res, 'FAIL accepted for an ended event'); exception when insufficient_privilege then res := array_append(res, 'PASS ended event: refused'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, d, ev_blk); res := array_append(res, 'FAIL accepted although d blocked a'); exception when insufficient_privilege then res := array_append(res, 'PASS d blocked a: refused'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, e, ev_blk2); res := array_append(res, 'FAIL accepted although a blocked e'); exception when insufficient_privilege then res := array_append(res, 'PASS a blocked e: refused'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, q, ev_del); res := array_append(res, 'FAIL accepted for a deleted account'); exception when insufficient_privilege then res := array_append(res, 'PASS q is a deleted account: refused'); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, a, ev); res := array_append(res, 'FAIL convinced yourself'); exception when insufficient_privilege or check_violation then res := array_append(res, 'PASS cannot convince yourself'); end;
  execute 'reset role';
  perform pg_temp.as_user(b);
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev_none); res := array_append(res, 'FAIL sent a convince as someone else'); exception when insufficient_privilege then res := array_append(res, 'PASS cannot send a convince as someone else'); end;
  execute 'reset role';

  -- controls: lift the block / the deletion and the same sends go through (so the refusals above were the block and the deletion, nothing else)
  delete from public.user_blocks where blocker_id = d and blocked_id = a;
  update public.profiles set deleted_at = null where id = q;
  perform pg_temp.as_user(a);
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, d, ev_blk); res := array_append(res, 'PASS control: once the block is lifted the same nudge is accepted'); exception when others then res := array_append(res, 'FAIL control after unblock: ' || sqlerrm); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, q, ev_del); res := array_append(res, 'PASS control: once the account is restored the same nudge is accepted'); exception when others then res := array_append(res, 'FAIL control after restore: ' || sqlerrm); end;
  -- the organiser case still works, and a friend with the notification pref OFF is nudged but not notified
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, b, ev_o); res := array_append(res, 'PASS the organiser case still works'); exception when others then res := array_append(res, 'FAIL organiser case: ' || sqlerrm); end;
  begin insert into public.convinces (from_user_id, to_user_id, event_id) values (a, p, ev_pref); res := array_append(res, 'PASS a friend with friends_activity off can still be nudged'); exception when others then res := array_append(res, 'FAIL pref-off friend: ' || sqlerrm); end;
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = p and type = 'friend_convince';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' friends_activity off: no notification for p (' || n || ')');

  -- who sees the rows
  perform pg_temp.as_user(b);
  select count(*) into n from public.convinces where to_user_id = b;
  res := array_append(res, (case when n >= 1 then 'PASS' else 'FAIL' end) || ' the recipient b can read the nudges addressed to them (' || n || ')');
  execute 'reset role';
  perform pg_temp.as_user(x);
  select count(*) into n from public.convinces;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a stranger sees no convince rows (' || n || ')');
  execute 'reset role';

  -- the helper reveals nothing to a non-friend: a stranger asking about b, a asking about b, one-way x, junk input, no sign-in
  perform pg_temp.as_user(x);
  select public.is_considering_for_friend(b, ev) into ok;
  res := array_append(res, (case when ok is false then 'PASS' else 'FAIL' end) || ' a stranger asking whether b is considering gets false, not an error and not data');
  execute 'reset role';
  perform pg_temp.as_user(a);
  select public.is_considering_for_friend(b, ev) into ok;
  res := array_append(res, (case when ok is true then 'PASS' else 'FAIL' end) || ' a mutual friend asking about b gets true');
  select public.is_considering_for_friend(x, ev) into ok;
  res := array_append(res, (case when ok is false then 'PASS' else 'FAIL' end) || ' a one-way follow is false even though x is considering');
  select public.is_considering_for_friend(a, ev) into ok;
  res := array_append(res, (case when ok is false then 'PASS' else 'FAIL' end) || ' asking about yourself is false');
  select public.is_considering_for_friend(null, ev) into ok;
  res := array_append(res, (case when ok is not true then 'PASS' else 'FAIL' end) || ' a null person is not true');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role authenticated';
  select public.is_considering_for_friend(b, ev) into ok;
  res := array_append(res, (case when ok is not true then 'PASS' else 'FAIL' end) || ' no sign-in (no auth.uid()) is not true');
  execute 'reset role';

  -- how the objects are set up
  res := array_append(res, (case when not has_function_privilege('anon', 'public.is_considering_for_friend(uuid, uuid)', 'execute') and has_function_privilege('authenticated', 'public.is_considering_for_friend(uuid, uuid)', 'execute') and has_function_privilege('service_role', 'public.is_considering_for_friend(uuid, uuid)', 'execute') then 'PASS' else 'FAIL' end) || ' is_considering_for_friend: signed-in and service role yes, public key no');
  select exists (select 1 from pg_proc where oid = 'public.is_considering_for_friend(uuid, uuid)'::regprocedure and prosecdef and 'search_path=pg_catalog, public' = any (proconfig)) into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' is_considering_for_friend is SECURITY DEFINER with search_path pg_catalog, public');
  select exists (select 1 from pg_proc where oid = 'public.is_mutual_follow(uuid)'::regprocedure and 'search_path=pg_catalog, public' = any (proconfig)) into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' is_mutual_follow now pins search_path pg_catalog, public');
  res := array_append(res, (case when not has_function_privilege('anon', 'public.notify_on_convince()', 'execute') and not has_function_privilege('authenticated', 'public.notify_on_convince()', 'execute') then 'PASS' else 'FAIL' end) || ' notify_on_convince is still not callable by anon or signed-in users (ACL kept)');
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and table_name = 'convinces' and grantee = 'anon';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon holds no privilege on convinces (found ' || n || ')');
  select string_agg(privilege_type, ',' order by privilege_type) into privs from information_schema.role_table_grants where table_schema = 'public' and table_name = 'convinces' and grantee = 'authenticated';
  res := array_append(res, (case when privs = 'DELETE,INSERT,SELECT' then 'PASS' else 'FAIL' end) || ' authenticated holds exactly DELETE,INSERT,SELECT (found ' || coalesce(privs, 'none') || ')');
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'convinces';
  res := array_append(res, (case when n = 3 then 'PASS' else 'FAIL' end) || ' convinces still has exactly its three policies (' || n || ')');

  raise exception 'PROBE RESULT (rolled back):%', E'\n' || array_to_string(res, E'\n');
end
$probe$;
