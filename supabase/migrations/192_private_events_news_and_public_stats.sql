-- ════════════════════════════════════════════════════════════════════
--  192_private_events_news_and_public_stats
--
--  NOT APPLIED. The owner applies this file after review (pre-apply tag,
--  rollback-only probe docs/audit/probes/192_private_events_news_and_public_stats.probe.sql,
--  advisor 0 ERROR). Expected advisor change: +1 WARN,
--  public.caller_may_read_private_event (SECURITY DEFINER, executable by
--  anon and signed-in users on purpose: the events SELECT policy calls it,
--  and a missing EXECUTE would make every events read fail). It returns
--  only a boolean about the caller, and false when there is no JWT.
--  get_contributor_public_stats, get_active_map_bubbles, safe_rsvp and
--  toggle_consider already exist and stay the same callable set.
--
--  WHAT WAS WRONG
--   1. events SELECT ("Published events visible to all, drafts to creator
--      only", migration 006) is status in (published, cancelled) OR
--      creator OR admin. Migration 027 added visibility and said a private
--      event is only for the creator and invited or RSVPed people, but the
--      policy never read the column. The anon key can therefore read every
--      private published event. /api/v1/events filters visibility = public;
--      PostgREST does not.
--   2. news_posts INSERT is auth.uid() = contributor_id, so any signed-in
--      citizen can publish a world-readable post. Moments (migration 188)
--      already require an approved Contributor or an admin.
--   3. get_contributor_public_stats returns an exact follows count, and
--      GET /api/v1/contributors/<slug>/stats does not exclude
--      contributor_hidden. The sibling contributor read and
--      follower_count_public (migration 185) already do both.
--
--  RELATED READS OF A PRIVATE EVENT (same hole, fixed here)
--   event_updates, event_photos and comments SELECT were using (true), so
--   the text and pictures of a private event stayed public even after the
--   events policy. Map bubbles are public invitations (migration 129); a
--   private event must not mint one, and get_active_map_bubbles is
--   SECURITY DEFINER so it has to apply the same rule itself.
--   safe_rsvp and toggle_consider are SECURITY DEFINER and ignore RLS, so
--   a signed-in stranger who knew the id could insert an RSVP and then
--   qualify as "RSVPed". Both now refuse a private event unless the caller
--   may already read it. A direct INSERT on rsvps has the same limit,
--   expressed as "the caller can already see that event".
--
--  REVIEWED AND LEFT ALONE (intended public reads)
--   places SELECT is using (true). A place is commons directory data
--   (migration 003). There is no visibility column. Cancelled places stay
--   readable on purpose (migration 167); /api/v1/places filters status.
--   profiles SELECT is using (true) with the column allowlist (migrations
--   174-177). The row is the person's public identity (name, avatar) as
--   well as a Contributor listing. contributor_hidden hides the listing
--   from directory_contributors and /api/v1/contributors; it is not a
--   reason to hide the person from messaging and the rest of the community.
--   The places UPDATE policy still has no separate WITH CHECK (Postgres
--   reuses USING). That is tenant work, not this fix.
--
--  WHO LOSES ACCESS once this is applied
--   * A private event (published or cancelled), its photos, comments,
--     updates and map bubbles: everyone except the creator, an admin, an
--     invited or accepted co-host, and someone who already has an RSVP.
--     Public published and cancelled events stay public. Drafts stay
--     creator-or-admin, as today.
--   * A new RSVP or Consider on a private event: anyone who is not the
--     creator, an admin, or an invited or accepted co-host.
--   * News: a signed-in user who is not an approved Contributor and not an
--     admin can no longer insert. The public can no longer read a post
--     whose author is not an approved, visible, non-deleted Contributor.
--     The author and an admin still can.
--   * Stats: a hidden, unapproved or deleted Contributor returns null from
--     the RPC (the route answers 404). followers is the public bucket
--     (0 under 100, otherwise rounded down), never the exact count.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Who may see a private event, without recursing into RLS ────────
-- events SELECT must not subquery rsvps or event_cohosts as the caller:
-- those policies read events back. This helper runs as the owner, so it
-- sees the rows, and it only answers "is the CALLER an invitee".
create or replace function public.caller_may_read_private_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and p_event is not null
     and (
       exists (
         select 1
         from public.events e
         where e.id = p_event
           and e.created_by = (select auth.uid())
       )
       or (select public.is_admin())
       or exists (
         select 1
         from public.rsvps r
         where r.event_id = p_event
           and r.user_id = (select auth.uid())
       )
       or exists (
         select 1
         from public.event_cohosts c
         where c.event_id = p_event
           and c.contributor_id = (select auth.uid())
           and c.status in ('invited', 'accepted')
       )
     );
$$;

comment on function public.caller_may_read_private_event(uuid) is
  'True when the signed-in caller may read a private event: they created it, they are an admin, they already have an RSVP, or they are an invited or accepted co-host. False with no JWT. Never returns row data.';

revoke all on function public.caller_may_read_private_event(uuid) from public;
grant execute on function public.caller_may_read_private_event(uuid) to anon, authenticated;

-- ── 2. events SELECT honours visibility ───────────────────────────────
-- Fail closed if a second SELECT policy is already OR-ed in: dropping only
-- the known name would leave the hole open.
do $$
declare
  extra int;
begin
  select count(*) into extra
  from pg_policies
  where schemaname = 'public'
    and tablename = 'events'
    and cmd = 'SELECT'
    and policyname <> 'Published events visible to all, drafts to creator only';
  if extra > 0 then
    raise exception 'events has an unexpected SELECT policy; read pg_policies before applying 192';
  end if;
end $$;

drop policy if exists "Published events visible to all, drafts to creator only" on public.events;

create policy "Published events visible to all, drafts to creator only"
  on public.events
  for select
  using (
    (
      visibility = 'public'
      and status in ('published', 'cancelled')
    )
    or created_by = (select auth.uid())
    or (select public.is_admin())
    or (
      visibility = 'private'
      and status in ('published', 'cancelled')
      and (select public.caller_may_read_private_event(id))
    )
  );

-- ── 3. Child rows follow the event the caller can already see ─────────
drop policy if exists event_updates_select_all on public.event_updates;
create policy event_updates_select_all on public.event_updates
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_updates.event_id
    )
  );

drop policy if exists "Event photos are viewable by everyone" on public.event_photos;
create policy "Event photos are viewable by everyone" on public.event_photos
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_photos.event_id
    )
  );

drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone" on public.comments
  for select using (
    exists (
      select 1 from public.events e
      where e.id = comments.event_id
    )
  );

drop policy if exists "Authenticated users can comment" on public.comments;
create policy "Authenticated users can comment" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = comments.event_id
    )
  );

drop policy if exists "map_bubbles_select_active" on public.map_bubbles;
create policy "map_bubbles_select_active" on public.map_bubbles
  for select using (
    expires_at > now()
    and exists (
      select 1 from public.events e
      where e.id = map_bubbles.event_id
    )
  );

-- ── 4. Do not mint a public bubble for a private event ────────────────
create or replace function public.tg_bubble_from_event_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.events e
    where e.id = new.event_id
      and e.visibility = 'public'
      and e.status in ('published', 'cancelled')
  ) then
    insert into public.map_bubbles (event_id, body, source)
    values (new.event_id, left(new.body, 160), 'event_update');
  end if;
  return new;
end;
$$;

create or replace function public.tg_bubble_from_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entity_type = 'event' and exists (
    select 1 from public.events e
    where e.id = new.entity_id
      and e.visibility = 'public'
      and e.status in ('published', 'cancelled')
  ) then
    insert into public.map_bubbles (event_id, body, source)
    values (new.entity_id, left(new.body, 160), 'broadcast');
  end if;
  return new;
end;
$$;

revoke all on function public.tg_bubble_from_event_update() from public, anon, authenticated;
revoke all on function public.tg_bubble_from_broadcast() from public, anon, authenticated;

-- Same return shape as migration 129. The dismissal test is unchanged.
-- The event test is repeated here because this function bypasses RLS.
create or replace function public.get_active_map_bubbles()
returns table (id uuid, event_id uuid, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.event_id, b.body, b.created_at
  from public.map_bubbles b
  where b.expires_at > now()
    and exists (
      select 1
      from public.events e
      where e.id = b.event_id
        and (
          (e.visibility = 'public' and e.status in ('published', 'cancelled'))
          or e.created_by = (select auth.uid())
          or (select public.is_admin())
          or (
            e.visibility = 'private'
            and e.status in ('published', 'cancelled')
            and public.caller_may_read_private_event(e.id)
          )
        )
    )
    and not exists (
      select 1
      from public.bubble_dismissals d
      where d.bubble_id = b.id
        and d.user_id = (select auth.uid())
    );
$$;

revoke all on function public.get_active_map_bubbles() from public;
grant execute on function public.get_active_map_bubbles() to anon, authenticated;

comment on function public.get_active_map_bubbles() is
  'Live map bubbles the caller may see (public events, or a private event they may read) and has not dismissed. Anonymous callers see public events only.';

-- ── 5. RSVP cannot be used to unlock a private event ──────────────────
-- Direct insert: the caller must already be able to read the event.
-- Drop every INSERT policy first so a permissive leftover cannot OR with this.
do $$
declare
  r record;
begin
  for r in
    select pol.polname as name
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'rsvps'
      and pol.polcmd = 'a'
  loop
    execute format('drop policy %I on public.rsvps', r.name);
  end loop;
end $$;

create policy "Authenticated users can rsvp" on public.rsvps
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = rsvps.event_id
    )
  );

-- safe_rsvp: migration 132's body, plus the private-event refusal.
-- search_path is restated empty and every reference is schema-qualified.
create or replace function public.safe_rsvp(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_visibility text;
  v_max int;
  v_current int;
  v_remaining int;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select status, visibility, max_attendees
    into v_status, v_visibility, v_max
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  if v_visibility = 'private' and not public.caller_may_read_private_event(p_event_id) then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  if v_status <> 'published' then
    return jsonb_build_object('success', false, 'error',
      'Cannot RSVP to a ' || v_status || ' event', 'status', 400);
  end if;

  if v_max is not null then
    select count(*)::int into v_current
    from public.rsvps
    where event_id = p_event_id;

    if v_current >= v_max then
      return jsonb_build_object('success', false, 'error', 'Event is full',
        'remaining', 0, 'status', 409);
    end if;

    v_remaining := v_max - v_current - 1;
  else
    v_remaining := null;
  end if;

  begin
    insert into public.rsvps (user_id, event_id, location_snapshot)
    values (
      p_user_id,
      p_event_id,
      (select connect_home_province from public.profiles where id = p_user_id)
    );
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error',
      'Already RSVPed to this event', 'status', 409);
  end;

  return jsonb_build_object('success', true, 'remaining', v_remaining, 'status', 201);
end;
$$;

revoke all on function public.safe_rsvp(uuid, uuid) from public, anon;
grant execute on function public.safe_rsvp(uuid, uuid) to authenticated;

-- toggle_consider: migration 070's body, plus the same refusal on the
-- insert path only. Removing an existing Consider still works.
create or replace function public.toggle_consider(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select id into v_existing
  from public.rsvps
  where user_id = p_user_id and event_id = p_event_id;

  if v_existing is not null then
    delete from public.rsvps
    where id = v_existing and status = 'considering';
    return jsonb_build_object('success', true, 'action', 'removed');
  end if;

  if exists (
    select 1 from public.events e
    where e.id = p_event_id and e.visibility = 'private'
  ) and not public.caller_may_read_private_event(p_event_id) then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  insert into public.rsvps (user_id, event_id, status)
  values (p_user_id, p_event_id, 'considering');
  return jsonb_build_object('success', true, 'action', 'added');
end;
$$;

revoke all on function public.toggle_consider(uuid, uuid) from public, anon;
grant execute on function public.toggle_consider(uuid, uuid) to authenticated;

-- ── 6. News: only an approved Contributor or an admin, and only as themselves
drop policy if exists "Contributors can create own news posts" on public.news_posts;
create policy "Contributors can create own news posts"
  on public.news_posts
  for insert to authenticated
  with check (
    contributor_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.deleted_at is null
        and (
          p.role = 'admin'
          or (p.role = 'contributor' and p.contributor_status = 'approved')
        )
    )
  );

-- Public read stays for a real public listing. A citizen's post, a hidden
-- Contributor's post and a deleted account's post are not a public listing.
-- The author and an admin still see the row (so it can be taken down).
drop policy if exists "News posts are viewable by everyone" on public.news_posts;
create policy "News posts are viewable by everyone"
  on public.news_posts
  for select
  using (
    contributor_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1
      from public.profiles p
      where p.id = news_posts.contributor_id
        and p.role = 'contributor'
        and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false
        and p.deleted_at is null
    )
  );

revoke insert, update, delete, truncate on table public.news_posts from anon;

-- ── 7. Public stats: hide a hidden listing, bucket the follower count ─
-- Body of migration 039, with two changes: a hidden or deleted Contributor
-- returns null (the same answer as "not an approved Contributor"), and
-- followers comes from follower_count_public so the steps cannot drift.
create or replace function public.get_contributor_public_stats(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_status text;
  v_hidden boolean;
  v_deleted timestamptz;
begin
  if p_org_id is null then
    return null;
  end if;

  select p.role, p.contributor_status, p.contributor_hidden, p.deleted_at
    into v_role, v_status, v_hidden, v_deleted
  from public.profiles p
  where p.id = p_org_id;

  if v_role is distinct from 'contributor'
     or v_status is distinct from 'approved'
     or coalesce(v_hidden, false)
     or v_deleted is not null then
    return null;
  end if;

  return jsonb_build_object(
    'total_events', (
      select count(*) from public.events
      where created_by = p_org_id
        and status = 'published' and visibility = 'public'
    ),
    'upcoming_events', (
      select count(*) from public.events
      where created_by = p_org_id
        and status = 'published' and visibility = 'public'
        and date >= now()
    ),
    'total_rsvps', (
      select count(*) from public.rsvps r
      join public.events e on e.id = r.event_id
      where e.created_by = p_org_id
        and e.status = 'published' and e.visibility = 'public'
    ),
    'followers', public.follower_count_public(p_org_id)
  );
end;
$$;

comment on function public.get_contributor_public_stats(uuid) is
  'Public counts for one approved, visible Contributor. Null for anyone else, including a hidden listing. followers is the public bucket (0 under 100), never an exact count.';

revoke all on function public.get_contributor_public_stats(uuid) from public;
grant execute on function public.get_contributor_public_stats(uuid) to anon, authenticated;

commit;

-- ── ROLLBACK (do not run as part of the apply) ──
-- drop function public.caller_may_read_private_event(uuid);
-- Recreate the events SELECT policy from migration 006 (status in
-- published/cancelled OR creator OR admin, no visibility test).
-- Recreate event_updates / event_photos / comments / map_bubbles SELECT
-- policies as using (true) or expires_at > now(), and the comments INSERT
-- policy as user_id = auth.uid().
-- Recreate tg_bubble_from_event_update, tg_bubble_from_broadcast and
-- get_active_map_bubbles from migration 129 (set search_path = public).
-- Recreate the rsvps INSERT policy as auth.uid() = user_id.
-- Recreate safe_rsvp from migration 132 and toggle_consider from migration 070.
-- Recreate the news INSERT policy as auth.uid() = contributor_id and the
-- news SELECT policy as using (true); grant insert, update, delete back to anon
-- only if anon held them before this file (it did, by the table default).
-- Recreate get_contributor_public_stats from migration 039.
