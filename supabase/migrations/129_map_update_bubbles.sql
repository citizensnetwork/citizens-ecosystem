-- 129_map_update_bubbles.sql
--
-- Map update bubbles.
--
-- Product decision (docs/feature-clarity/map-layering.md + notifications.md):
--   "Instagram-style/speech-bubble update banners above markers are valuable
--    from around zoom 12+." "Status-style update bubbles should expire around
--    24 hours by default." "Bubbles may dismiss per user after that user has
--    seen them to reduce clutter." "Update bubbles are public visual
--    invitations, not private notifications."
--
-- A bubble is auto-created whenever an organiser posts an event update OR an
-- event broadcast. It carries a short snippet, references the event so the map
-- can anchor it to that marker, and expires ~24h after creation. Any passer-by
-- (incl. anonymous) sees active bubbles; signed-in users can dismiss one for
-- themselves only.

create table if not exists public.map_bubbles (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events(id) on delete cascade,
  body       text        not null check (char_length(body) between 1 and 160),
  source     text        not null check (source in ('event_update', 'broadcast')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

comment on table public.map_bubbles is
  'Public, time-boxed speech-bubble updates anchored to an event marker (z12+). Auto-created by triggers on event_updates / broadcast_messages inserts; expires ~24h after creation.';

-- Map/fan-out queries filter on (event_id, expires_at). A plain composite
-- index covers them; a partial `where expires_at > now()` predicate is not
-- allowed because now() is not IMMUTABLE.
create index if not exists map_bubbles_active_idx
  on public.map_bubbles (event_id, expires_at);

-- Per-user dismissals. No global delete — a dismissal hides the bubble for one
-- user only. Bubble removal otherwise happens by natural expiry.
create table if not exists public.bubble_dismissals (
  bubble_id  uuid        not null references public.map_bubbles(id) on delete cascade,
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bubble_id, user_id)
);

comment on table public.bubble_dismissals is
  'Per-user dismissal of a map bubble. Identity is scoped to the owning user via RLS; a dismissal only suppresses the bubble for that user.';

alter table public.map_bubbles      enable row level security;
alter table public.bubble_dismissals enable row level security;

-- Bubbles are public invitations: anyone (incl. anon) may read live ones.
drop policy if exists "map_bubbles_select_active" on public.map_bubbles;
create policy "map_bubbles_select_active" on public.map_bubbles
  for select using (expires_at > now());
-- No client write policy: bubbles are only ever inserted by the SECURITY
-- DEFINER triggers below.

-- A user may see and create only their own dismissals.
drop policy if exists "bubble_dismissals_select_own" on public.bubble_dismissals;
create policy "bubble_dismissals_select_own" on public.bubble_dismissals
  for select using (user_id = auth.uid());
drop policy if exists "bubble_dismissals_insert_own" on public.bubble_dismissals;
create policy "bubble_dismissals_insert_own" on public.bubble_dismissals
  for insert with check (user_id = auth.uid());

-- ── Trigger: create a bubble when an event update is posted ──
create or replace function public.tg_bubble_from_event_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.map_bubbles (event_id, body, source)
  values (new.event_id, left(new.body, 160), 'event_update');
  return new;
end;
$$;

drop trigger if exists trg_bubble_from_event_update on public.event_updates;
create trigger trg_bubble_from_event_update
  after insert on public.event_updates
  for each row execute function public.tg_bubble_from_event_update();
-- ── Trigger: create a bubble when an event broadcast is posted ──
create or replace function public.tg_bubble_from_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only event broadcasts anchor to an event marker; place broadcasts skip.
  if new.entity_type = 'event' then
    insert into public.map_bubbles (event_id, body, source)
    values (new.entity_id, left(new.body, 160), 'broadcast');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bubble_from_broadcast on public.broadcast_messages;
create trigger trg_bubble_from_broadcast
  after insert on public.broadcast_messages
  for each row execute function public.tg_bubble_from_broadcast();

-- Trigger functions must never be callable directly over the REST RPC surface;
-- revoke execute (Supabase grants execute to anon/authenticated by default).
revoke all on function public.tg_bubble_from_event_update() from public, anon, authenticated;
revoke all on function public.tg_bubble_from_broadcast() from public, anon, authenticated;

-- ── Read RPC: active bubbles minus the caller's dismissals ──
-- SECURITY DEFINER so anonymous callers still get all active bubbles (their
-- auth.uid() is null, so the NOT EXISTS is always satisfied) without exposing
-- other users' dismissal rows.
create or replace function public.get_active_map_bubbles()
returns table (id uuid, event_id uuid, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.event_id, b.body, b.created_at
  from public.map_bubbles b
  where b.expires_at > now()
    and not exists (
      select 1 from public.bubble_dismissals d
      where d.bubble_id = b.id and d.user_id = auth.uid()
    );
$$;

revoke all on function public.get_active_map_bubbles() from public;
grant execute on function public.get_active_map_bubbles() to anon, authenticated;

comment on function public.get_active_map_bubbles() is
  'Returns live map bubbles not dismissed by the caller. Anonymous callers (auth.uid() null) get all active bubbles.';

-- ── Dismiss RPC: hide a bubble for the caller only ──
create or replace function public.dismiss_map_bubble(p_bubble_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_bubble_id is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  insert into public.bubble_dismissals (bubble_id, user_id)
  values (p_bubble_id, v_uid)
  on conflict (bubble_id, user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.dismiss_map_bubble(uuid) from public, anon;
grant execute on function public.dismiss_map_bubble(uuid) to authenticated;

comment on function public.dismiss_map_bubble(uuid) is
  'Records a per-user dismissal of a map bubble for the caller. Idempotent.';
