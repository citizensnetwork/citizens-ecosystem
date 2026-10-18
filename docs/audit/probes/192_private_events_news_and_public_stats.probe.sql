-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 192. Run AFTER the apply, in the SQL editor.
--  It builds synthetic users only, checks each fix as anon and as signed-in
--  callers, and ends with RAISE EXCEPTION so NOTHING persists. The error text
--  is one PASS or FAIL per line. Nothing here names a real person.
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  owner uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  citizen uuid := gen_random_uuid();
  hidden uuid := gen_random_uuid();
  admin uuid := gen_random_uuid();
  pub uuid; priv uuid; n int; ok boolean; res text[] := '{}';
  post_ok uuid; post_hidden uuid; stats jsonb;
begin
  insert into auth.users (id, email) values
    (owner, 'probe-owner@probe.example'),
    (stranger, 'probe-stranger@probe.example'),
    (guest, 'probe-guest@probe.example'),
    (citizen, 'probe-citizen@probe.example'),
    (hidden, 'probe-hidden@probe.example'),
    (admin, 'probe-admin@probe.example');

  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_slug = 'probe-owner' where id = owner;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = false, contributor_slug = 'probe-guest' where id = guest;
  update public.profiles set role = 'citizen', contributor_status = 'not_applied', contributor_hidden = false where id = citizen;
  update public.profiles set role = 'contributor', contributor_status = 'approved', contributor_hidden = true, contributor_slug = 'probe-hidden' where id = hidden;
  update public.profiles set role = 'admin', contributor_status = 'not_applied' where id = admin;

  insert into public.events (title, date, created_by, status, visibility)
    values ('Probe public', now() + interval '3 days', owner, 'published', 'public') returning id into pub;
  insert into public.events (title, date, created_by, status, visibility)
    values ('Probe private', now() + interval '4 days', owner, 'published', 'private') returning id into priv;
  insert into public.event_cohosts (event_id, contributor_id, invited_by, status)
    values (priv, guest, owner, 'invited');
  insert into public.rsvps (user_id, event_id, status) values (stranger, pub, 'attending');
  insert into public.event_updates (event_id, author_id, body) values (priv, owner, 'private update');
  insert into public.comments (event_id, user_id, body) values (priv, owner, 'private comment');
  insert into public.news_posts (contributor_id, title, body) values (owner, 'Public note', 'visible');
  insert into public.news_posts (contributor_id, title, body) values (hidden, 'Hidden note', 'not public') returning id into post_hidden;

  -- anon: public event yes, private event and its children no, hidden news no, public news yes
  execute 'set local role anon';
  select count(*) into n from public.events where id = pub;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' anon reads a public event');
  select count(*) into n from public.events where id = priv;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon cannot read a private event');
  select count(*) into n from public.event_updates where event_id = priv;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon cannot read a private event update');
  select count(*) into n from public.comments where event_id = priv;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon cannot read a private event comment');
  select count(*) into n from public.news_posts where contributor_id = owner;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' anon reads an approved visible contributor news post');
  select count(*) into n from public.news_posts where contributor_id = hidden;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon cannot read a hidden contributor news post');
  select count(*) into n from public.places;
  res := array_append(res, (case when n >= 0 then 'PASS' else 'FAIL' end) || ' anon can still read places');
  select count(*) into n from public.profiles where id = citizen;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' anon can still read a public profile row');
  select public.get_contributor_public_stats(hidden) into stats;
  res := array_append(res, (case when stats is null then 'PASS' else 'FAIL' end) || ' stats of a hidden contributor are null');
  select public.get_contributor_public_stats(owner) into stats;
  res := array_append(res, (case when stats is not null and (stats->>'followers')::int = 0 then 'PASS' else 'FAIL' end) || ' stats followers are the public bucket (0 under 100)');
  select count(*) into n from public.get_active_map_bubbles() b where b.event_id = priv;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' anon map bubbles skip a private event');
  execute 'reset role';

  -- stranger cannot RSVP or consider the private event, and cannot read it
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.events where id = priv;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a stranger cannot read a private event');
  select (public.safe_rsvp(stranger, priv)->>'status')::int = 404 into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' safe_rsvp refuses a private event to a stranger');
  select (public.toggle_consider(stranger, priv)->>'status')::int = 404 into ok;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' toggle_consider refuses a private event to a stranger');
  select count(*) into n from public.rsvps where event_id = priv and user_id = stranger;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' the refused calls left no RSVP');
  begin
    insert into public.news_posts (contributor_id, title, body) values (stranger, 'Nope', 'no');
    res := array_append(res, 'FAIL a non-contributor inserted news');
  exception when insufficient_privilege or check_violation then
    res := array_append(res, 'PASS a non-contributor cannot insert news');
  end;
  execute 'reset role';

  -- citizen insert is refused too
  perform set_config('request.jwt.claims', json_build_object('sub', citizen, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', citizen::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.news_posts (contributor_id, title, body) values (citizen, 'Nope', 'no');
    res := array_append(res, 'FAIL a citizen inserted news');
  exception when insufficient_privilege or check_violation then
    res := array_append(res, 'PASS a citizen cannot insert news');
  end;
  execute 'reset role';

  -- invited co-host can read the private event; the owner can post news
  perform set_config('request.jwt.claims', json_build_object('sub', guest, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', guest::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.events where id = priv;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' an invited co-host can read the private event');
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.events where id = priv;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' the creator can read their private event');
  insert into public.news_posts (contributor_id, title, body) values (owner, 'Another', 'ok') returning id into post_ok;
  res := array_append(res, (case when post_ok is not null then 'PASS' else 'FAIL' end) || ' an approved contributor can post news');
  select count(*) into n from public.news_posts where id = post_hidden;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' the owner does not see another hidden contributor news post');
  execute 'reset role';

  -- the hidden author still sees their own post
  perform set_config('request.jwt.claims', json_build_object('sub', hidden, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', hidden::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.news_posts where id = post_hidden;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' a hidden contributor still sees their own news post');
  execute 'reset role';

  -- admin sees the private event
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.events where id = priv;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end) || ' an admin can read a private event');
  execute 'reset role';

  raise exception '%', array_to_string(res, E'\n');
end
$probe$;
