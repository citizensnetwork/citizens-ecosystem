-- 069_convinces_and_friend_activity.sql
--
-- Batch 4 — FEAT-04: Consider → Convince complete implementation.
--
-- 1. `convinces` table — one row per (sender, target, event); permanent UNIQUE
--    so a citizen can convince a friend about a given event exactly once.
-- 2. RLS:
--      • SELECT: sender or target may read (so the UI can show "Convinced"
--        state and the inbox can render the notification target side).
--      • INSERT: sender = auth.uid(); sender ≠ target; sender and target must
--        be mutual followers; target must currently be considering the event.
--      • DELETE: sender may revoke (lets the UI undo).
-- 3. Trigger fires on convince INSERT → in-app notification for the target,
--    gated by the existing `notification_prefs.friends_activity` flag.
-- 4. Trigger fires on `rsvps` INSERT/UPDATE (status='attending') → fan-out
--    in-app notifications to every mutual follower whose `friends_activity`
--    pref is true. Powers the "[Name] is going to [Event]" loop.
-- 5. notifications.type CHECK is widened to allow the new types.

begin;

-- ── Convinces table ──────────────────────────────────────────────────────
create table if not exists public.convinces (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint convinces_no_self check (from_user_id <> to_user_id),
  constraint convinces_unique  unique (from_user_id, to_user_id, event_id)
);

create index if not exists convinces_to_event_idx on public.convinces(to_user_id, event_id);
create index if not exists convinces_from_idx     on public.convinces(from_user_id, event_id);

alter table public.convinces enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'convinces' and policyname = 'Convinces visible to participants'
  ) then
    create policy "Convinces visible to participants"
      on public.convinces for select
      using (auth.uid() = from_user_id or auth.uid() = to_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'convinces' and policyname = 'Mutual friends can send convinces'
  ) then
    create policy "Mutual friends can send convinces"
      on public.convinces for insert
      with check (
        auth.uid() = from_user_id
        and from_user_id <> to_user_id
        and exists (
          select 1 from public.follows
          where follower_id = auth.uid() and followee_id = to_user_id
        )
        and exists (
          select 1 from public.follows
          where follower_id = to_user_id and followee_id = auth.uid()
        )
        and exists (
          select 1 from public.rsvps r
          where r.user_id = to_user_id
            and r.event_id = convinces.event_id
            and r.status = 'considering'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'convinces' and policyname = 'Sender can revoke own convince'
  ) then
    create policy "Sender can revoke own convince"
      on public.convinces for delete
      using (auth.uid() = from_user_id);
  end if;
end $$;

-- ── Widen notifications.type CHECK to cover the new types ────────────────
-- (Also rolls in `new_message`, which was already in TS-land but missing
-- from the DB constraint — latent bug fixed here.)
do $$
declare
  _con text;
begin
  select conname into _con
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%type%'
  limit 1;

  if _con is not null then
    execute format('alter table public.notifications drop constraint %I', _con);
  end if;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'event_reminder',
      'new_event_match',
      'event_cancelled',
      'new_follower',
      'event_update',
      'new_message',
      'review_prompt',
      'admin_elevation_request',
      'friend_convince',
      'friend_attending'
    ));
end $$;

-- ── Trigger: insert convince row → notify target ─────────────────────────
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

  -- Default ON if key missing.
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

drop trigger if exists trg_notify_on_convince on public.convinces;
create trigger trg_notify_on_convince
  after insert on public.convinces
  for each row execute function public.notify_on_convince();

-- ── Trigger: RSVP status=attending → notify mutual friends ──────────────
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
  -- Only fire when the row ends in 'attending'.
  if new.status is distinct from 'attending' then
    return new;
  end if;

  -- On UPDATE, suppress no-op transitions where status was already attending.
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

  -- Fan out to mutual followers with the pref enabled.
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
    and coalesce((p.notification_prefs->>'friends_activity')::boolean, true) = true;

  return new;
end $$;

drop trigger if exists trg_notify_friends_on_rsvp_attending on public.rsvps;
create trigger trg_notify_friends_on_rsvp_attending
  after insert or update of status on public.rsvps
  for each row execute function public.notify_friends_on_rsvp_attending();

grant select, insert, delete on public.convinces to authenticated;

commit;
