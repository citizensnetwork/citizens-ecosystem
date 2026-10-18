-- ════════════════════════════════════════════════════════════════════
--  190_convince_fix: make Convince work for ordinary friends, and close the holes found around it. Authored as
--  docs/proposals/convince-fix.sql on 2026-10-18 on the founder's chat ask "fix the Convince bugs"; applied 2026-10-18 through MCP
--  apply_migration as `190_convince_fix` on Stephen's yes in chat (pre-apply tag `connect-pre-mig190-convince-fix`, on origin/main
--  c8909ee). In the same yes he accepted the one privacy call in it: a mutual, unblocked friend can learn that you are considering
--  an event (that is the purpose of the feature); a person who is not your friend learns nothing.
--
--  What was wrong (all read from the live database before the apply; 0 convinces rows and 0 'considering' rsvps existed, so nothing
--  to migrate):
--   1. The policy "Mutual friends can send convinces" checked, AS THE SENDER, that the friend has a `rsvps` row with status
--      'considering'. `rsvps` is readable only by its owner and the event's organiser, so only an organiser could ever pass: Convince
--      could not work between ordinary friends (the probe for 189 passed only because its sender organised the event).
--   2. A block was ignored (blocking does not remove follows). 3. Cancelled and ended events accepted a Convince. 4. Withdraw and
--      resend notified again every time. 5. `anon` held all seven privileges on public.convinces (incl. TRUNCATE, which RLS does not
--      stop) and `authenticated` also held UPDATE, TRUNCATE, REFERENCES, TRIGGER. 6. is_mutual_follow (189) pinned `public, pg_temp`;
--      the project standard (migration 070) is `pg_catalog, public`.
--
--  What it does: A. public.is_considering_for_friend(p_other, p_event), SECURITY DEFINER, bound to the caller: true only for a mutual,
--  unblocked friend whose account is not deleted, for a published event that has not ended, with a 'considering' rsvp; anything else is
--  plain false (never an error, never rsvps data); signed-in and service role only. B. The INSERT policy swaps only its rsvps EXISTS for
--  the helper. C. notify_on_convince: migration 070's body plus one guard (one notification per sender, friend and event). D. anon loses
--  every privilege on convinces; authenticated keeps select, insert, delete. E. is_mutual_follow gets search_path pg_catalog, public.
--
--  Evidence: the rollback-only dry run docs/audit/probes/convince_fix.probe.sql, re-run against the live database before the apply:
--  36 of 36 PASS (line 1 reproduced the bug on the old policy), rolled back, nothing left behind. After the apply, the probe
--  docs/audit/probes/190_convince_fix.probe.sql: 34 of 34 PASS against the live objects, rolled back, nothing left behind (no probe
--  users, profiles, events, convinces or notifications). The stored migration statements are byte-for-byte this file's body (md5
--  checked). Security advisor: 0 ERROR; +1 WARN (131 -> 132), `is_considering_for_friend`, signed-in only, on purpose; every other
--  finding unchanged. Production smoke after the apply: the Contributor, event and place APIs and contributor search answer 200.
--  ROLLBACK at the foot.
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
