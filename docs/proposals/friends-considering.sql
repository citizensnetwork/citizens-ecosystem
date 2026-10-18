-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL (not applied): friends_considering, the read side of Convince (FEAT-04) and the one switch that goes with it.
--  NO MIGRATION NUMBER on purpose: take the next free one at apply time (the live head on 2026-10-18 was 190_convince_fix, version 20261018115907, so this would be 191).
--  Authored 2026-10-18. Needs a fresh yes from Stephen for THIS file, then the usual steps: pre-apply git tag, MCP apply_migration, the
--  rollback-only probe docs/audit/probes/friends_considering.probe.sql, the security advisor, and move this file to supabase/migrations/ in the
--  same PR. ROLLBACK at the foot.
--
--  WHY: the Convince fix (migration 190: policy + public.is_considering_for_friend) lets a person nudge a mutual friend who is considering an event, but
--  nothing lets a person LIST which of their friends that is: `rsvps` is readable only by its owner and the event's organiser, so the
--  Convince row on the event screen has nothing to read. This file adds that read, and the privacy switch Stephen ruled on 2026-10-18:
--  a person's "considering" is SHOWN to mutual, unblocked friends BY DEFAULT, and a switch in Settings hides it.
--
--  WHAT THIS DOES:
--   A. update_notification_prefs: the same body as the live function (read from the live database 2026-10-18) with ONE more allowed key,
--      `share_considering` (boolean). The setting lives in profiles.notification_prefs, so it is private by construction (that column is
--      not in the public allowlist), is written only by this function (atomic merge, boolean values only), and reaches the browser through
--      get_my_profile_private() exactly like the other switches. A missing key means ON: nobody has to be migrated.
--   B. is_considering_for_friend: the same body as the live function plus the opt-out, so the switch binds the WRITE path too. Without this,
--      a friend who hid "considering" could still be probed by POSTing a nudge and reading 201 vs 403. With it, a hidden friend and a friend who
--      is simply not considering look the same: false, and the same neutral 403.
--      The test is on the TEXT 'false' on purpose: `authenticated` holds a column UPDATE on notification_prefs (verified 2026-10-18), so a
--      person can store any junk there; a boolean cast would raise inside the INSERT policy. This never raises.
--   C. friends_considering_event(p_event): the reader. Returns, for ONE event, the caller's mutual, unblocked friends who are considering it
--      and have not hidden it: id, full_name, avatar_url (all three already public on a profile) and `nudged` (whether the CALLER has already
--      nudged that friend about this event; it is the caller's own action). Nothing else: no rsvps row, no time, no count. It asks
--      is_considering_for_friend for every row, so the list and the INSERT policy can never disagree about who may be nudged. Alphabetical,
--      never by popularity, at most 50 rows. A stranger, a one-way follower, a block, a hidden friend, a cancelled or ended event, junk input
--      and no sign-in all give ZERO ROWS: never an error and never a hint of which condition failed.
--   D. notify_on_convince: the live body with ONE change, a sender with no name shows as "Someone". `profiles.full_name` is NOT NULL and an
--      email sign-up starts with '' (not NULL), so `coalesce(full_name, 'Someone')` never fired and the friend would read " thinks you
--      should go to <event>". This was unreachable while nothing in the app sent a nudge; the new button makes it reachable. ACL is kept
--      (create or replace keeps it; migration 140: service_role only) and not touched here.
--   Grants: the reader is executable by signed-in users and the service role only, never the public key.
--
--  PRIVACY NOTE (a yes-item, ruled 2026-10-18): a mutual follower sees that you are considering an event unless you switch it off. The
--  event screen says so in one line under the Consider button, and the switch sits in Settings > Privacy.
--
--  Evidence: rollback-only dry run docs/audit/probes/friends_considering.probe.sql (synthetic users, the proposal body spliced in, then the
--  checks; it ends with RAISE EXCEPTION so nothing persists). Expected advisor change: +1 WARN, `friends_considering_event` (SECURITY DEFINER,
--  executable by signed-in users, on purpose, like is_considering_for_friend); 0 ERROR; the baseline 132 (after migration 190) becomes 133.
-- ════════════════════════════════════════════════════════════════════

begin;

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

commit;

-- ── ROLLBACK (keep with the migration) ──────────────────────────────
-- begin;
--   drop function public.friends_considering_event(uuid);
--   -- is_considering_for_friend back to the Convince-fix body (no opt-out):
--   create or replace function public.is_considering_for_friend(p_other uuid, p_event uuid) returns boolean language sql stable security definer set search_path = pg_catalog, public as $r$
--     select auth.uid() is not null and p_other is not null and p_event is not null and p_other <> auth.uid() and public.is_mutual_follow(p_other)
--       and not exists (select 1 from public.user_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p_other) or (b.blocker_id = p_other and b.blocked_id = auth.uid()))
--       and not exists (select 1 from public.profiles pr where pr.id = p_other and pr.deleted_at is not null)
--       and exists (select 1 from public.events e where e.id = p_event and e.status = 'published' and coalesce(e.end_time, e.date + interval '1 day') >= now())
--       and exists (select 1 from public.rsvps r where r.user_id = p_other and r.event_id = p_event and r.status = 'considering');
--   $r$;
--   -- notify_on_convince back to the Convince-fix body: the same function with `coalesce(full_name, 'Someone')` in place of `coalesce(nullif(btrim(full_name), ''), 'Someone')`.
--   -- update_notification_prefs back to five keys: re-run the body of supabase/migrations/174_profiles_private_readers.sql section 2
--   -- (a stored share_considering key is then ignored by everything and is harmless).
-- commit;
