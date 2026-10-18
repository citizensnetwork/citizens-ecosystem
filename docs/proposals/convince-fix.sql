-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL (not applied): convince_fix: make Convince work for ordinary friends, and close the holes found around it.
--  NO MIGRATION NUMBER on purpose: take the next free one at apply time (the live head was 189 on 2026-10-18). Authored 2026-10-18 on the
--  founder's chat ask "fix the Convince bugs". Needs a fresh yes from Stephen for THIS file, then the usual steps: pre-apply git tag, MCP
--  apply_migration, the rollback-only probe docs/audit/probes/convince_fix.probe.sql, the security advisor, and move this file to
--  supabase/migrations/ in the same PR. ROLLBACK at the foot.
--
--  WHAT IS WRONG TODAY (all read from the live database on 2026-10-18; 0 convinces rows and 0 'considering' rsvps exist, so nothing to migrate):
--   1. The policy "Mutual friends can send convinces" checks, AS THE SENDER, that the friend has a `rsvps` row with status 'considering'.
--      `rsvps` is readable only by its owner and the event's organiser ("Users can view own rsvps", "Event creators can view rsvps"), so
--      only an organiser can ever pass. Convince cannot work between ordinary friends. (The probe for 189 passed only because its sender
--      organised the event.)
--   2. A block is ignored: nothing ties user_blocks to the policy, and blocking does not remove follows, so a person you blocked who is still
--      a mutual follower can keep nudging you.
--   3. Cancelled and ended events accept a Convince ("X thinks you should go to <a cancelled event>").
--   4. Withdraw-and-resend defeats the "exactly once" rule and notifies again every time (no dedup in notify_on_convince).
--   5. Grants: anon holds all seven privileges on public.convinces (incl. TRUNCATE, which RLS does not stop); authenticated also holds
--      UPDATE, TRUNCATE, REFERENCES, TRIGGER. Migration 069 granted only select, insert, delete; the platform default added the rest.
--   6. is_mutual_follow (189) pins `public, pg_temp`; the project standard (migration 070) is `pg_catalog, public`.
--
--  WHAT THIS DOES:
--   A. public.is_considering_for_friend(p_other, p_event): SECURITY DEFINER, bound to the caller (auth.uid()). TRUE only when the caller and
--      p_other are mutual followers, neither has blocked the other, p_other's account is not deleted, the event is published and has not
--      ended, and p_other has a 'considering' rsvp for it. Anything else (a stranger, a one-way follower, a block, no rsvp) is simply FALSE,
--      never an error and never any rsvps data, so it reveals nothing to a non-friend. Signed-in only; the public key cannot call it.
--      PRIVACY NOTE (a yes-item): a mutual, unblocked friend can ask "is my friend considering this event". That is exactly what the
--      feature is for (nudge a friend who is considering); nobody else can.
--   B. The Convince INSERT policy keeps every other condition and swaps only the rsvps EXISTS for the helper.
--   C. notify_on_convince: the body of migration 070 plus ONE guard, skip the notification when this sender already notified this person
--      about this event (so withdraw-and-resend cannot spam). The convince row itself is still written.
--   D. Grants on public.convinces: anon none; authenticated keeps select, insert, delete only.
--   E. is_mutual_follow: same body, search_path pg_catalog, public.
--
--  Evidence: rollback-only dry run docs/audit/probes/convince_fix.probe.sql (it first reproduces the bug on the live policy, then applies
--  this file's body inside the same rolled-back transaction, then checks the result; synthetic users only; nothing persists).
--  Expected advisor change: +1 WARN, `is_considering_for_friend` (SECURITY DEFINER, executable by signed-in users, on purpose, like
--  is_mutual_follow); 0 ERROR.
-- ════════════════════════════════════════════════════════════════════

begin;

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

commit;

-- ── ROLLBACK (keep with the migration) ──────────────────────────────
-- begin;
--   drop policy "Mutual friends can send convinces" on public.convinces;
--   create policy "Mutual friends can send convinces" on public.convinces for insert with check (
--     (auth.uid() = from_user_id) and (from_user_id <> to_user_id) and public.is_mutual_follow(to_user_id)
--     and exists (select 1 from public.rsvps r where r.user_id = convinces.to_user_id and r.event_id = convinces.event_id and r.status = 'considering'));
--   drop function public.is_considering_for_friend(uuid, uuid);
--   -- notify_on_convince back to the migration 070 body (no guard):
--   create or replace function public.notify_on_convince() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $r$
--   declare sender_name text; event_title text; target_prefs jsonb;
--   begin
--     select coalesce(full_name, 'Someone') into sender_name from public.profiles where id = new.from_user_id;
--     select title into event_title from public.events where id = new.event_id;
--     if event_title is null then return new; end if;
--     select notification_prefs into target_prefs from public.profiles where id = new.to_user_id;
--     if coalesce((target_prefs->>'friends_activity')::boolean, true) = false then return new; end if;
--     insert into public.notifications (user_id, type, title, body, data) values (new.to_user_id, 'friend_convince',
--       sender_name || ' thinks you should go to ' || event_title, 'Tap to revisit the event',
--       jsonb_build_object('event_id', new.event_id, 'from_user_id', new.from_user_id));
--     return new;
--   end $r$;
--   grant all on public.convinces to anon;
--   grant update, truncate, references, trigger on public.convinces to authenticated;
--   alter function public.is_mutual_follow(uuid) set search_path = public, pg_temp;
-- commit;
