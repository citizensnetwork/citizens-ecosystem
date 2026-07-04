-- FEAT-04 hardening follow-up to migrations 022 + 069.
--
-- Why this migration exists:
--   1. The deployed `toggle_consider` (from 022) was hardened in-flight
--      (auth.uid() check + revoke/grant) but its `search_path` is still
--      `public, pg_temp`. Project standard (see 051) is `pg_catalog, public`
--      so that no public-schema object can shadow a built-in inside the
--      SECURITY DEFINER context.
--   2. The two triggers added by 069 use the same loose `search_path`. Move
--      them to `pg_catalog, public` for the same reason.
--   3. Add a 24h dedup guard to `notify_friends_on_rsvp_attending` so a user
--      who toggles RSVP status back and forth doesn't fan out duplicate
--      notifications to every mutual friend on every flip.
--
-- All three function bodies are kept byte-identical with the currently
-- deployed semantics — this migration only changes `search_path` and adds
-- the dedup `not exists` predicate. No behavioural changes to the toggle.

set check_function_bodies = off;

-- ── 1. Re-create toggle_consider with hardened search_path ─────────────
create or replace function public.toggle_consider(
  p_user_id uuid,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  select id into v_existing
  from public.rsvps
  where user_id = p_user_id and event_id = p_event_id;

  if v_existing is not null then
    delete from public.rsvps
    where id = v_existing and status = 'considering';
    return jsonb_build_object('success', true, 'action', 'removed');
  else
    insert into public.rsvps (user_id, event_id, status)
    values (p_user_id, p_event_id, 'considering');
    return jsonb_build_object('success', true, 'action', 'added');
  end if;
end;
$$;

revoke all on function public.toggle_consider(uuid, uuid) from public;
grant execute on function public.toggle_consider(uuid, uuid) to authenticated;

-- ── 2. notify_on_convince — search_path hardening only ─────────────────
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

-- ── 3. notify_friends_on_rsvp_attending — search_path + dedup guard ────
create or replace function public.notify_friends_on_rsvp_attending()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_name text;
  event_title text;
begin
  if new.status is distinct from 'attending' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'attending' then
    return new;
  end if;

  select coalesce(full_name, 'Someone')
    into actor_name
    from public.profiles
   where id = new.user_id;

  select title
    into event_title
    from public.events
   where id = new.event_id;

  if event_title is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select
    f1.follower_id,
    'friend_attending',
    actor_name || ' is going to ' || event_title,
    'Tap to view the event',
    jsonb_build_object(
      'event_id', new.event_id,
      'actor_id', new.user_id
    )
  from public.follows f1
  join public.follows f2
    on f2.follower_id = f1.followee_id
   and f2.followee_id = f1.follower_id
  join public.profiles p
    on p.id = f1.follower_id
  where f1.followee_id = new.user_id
    and f1.follower_id <> new.user_id
    and coalesce((p.notification_prefs->>'friends_activity')::boolean, true) = true
    -- 24h dedup: avoid re-notifying on rapid status-toggles for the same event.
    and not exists (
      select 1
        from public.notifications n
       where n.user_id = f1.follower_id
         and n.type   = 'friend_attending'
         and (n.data->>'event_id')::uuid = new.event_id
         and (n.data->>'actor_id')::uuid = new.user_id
         and n.created_at > now() - interval '24 hours'
    );

  return new;
end $$;
