-- ════════════════════════════════════════════════════════════════════
--  189_follows_tighten: S13 step 4 of 4 (who can read who follows whom). Authored as docs/proposals/s13c-follows-tighten.sql on
--  2026-10-17; applied 2026-10-18 through MCP apply_migration as `189_follows_tighten` on Stephen's yes in chat (pre-apply tag
--  `connect-pre-mig189-follows-tighten`). It waited for migrations 185 and 186 and for PR #137 to be LIVE in production (the four
--  readers now ask the count functions or run as the admin client; checked against the production API first).
--
--  Before this, anyone holding the public key could list which person follows which Contributor or Place (SELECT policy `true`).
--  After it, a person reads only their OWN follow rows and the public key reads none; every count goes through the 185 functions.
--
--  ONE ADDITION to the proposal, found by the day-of audit (a policy on another table reads `follows`): the INSERT policy
--  "Mutual friends can send convinces" on public.convinces checked, as the signed-in person, that the OTHER person follows them
--  back. Under an own-rows policy that second row is invisible, so every Convince would have been refused. The check now goes
--  through public.is_mutual_follow(), a SECURITY DEFINER function bound to the caller (auth.uid()), and the policy keeps every
--  other condition word for word. Nothing else in the live database reads these two tables as the invoking user (no SECURITY
--  INVOKER function, no other policy, no view that anon or authenticated can select), re-checked with pg_proc / pg_policies /
--  pg_views on the day; wear.stories reads wear.follows, a different table.
--
--  Evidence: rollback-only probe docs/audit/probes/189_follows_tighten.probe.sql, 24 of 24 PASS against the live tables, nothing left
--  behind (anon reads and writes nothing; an owner reads only their own rows; the Contributor sees HOW MANY follow them but no longer WHO;
--  search, the count functions and the messaging rule still work with the tables closed; Convince still passes for mutual friends and
--  is refused for a one-way follower). Security advisor: 0 ERROR; +1 WARN (130 -> 131), `is_mutual_follow`, signed-in only, on purpose.
--  Production smoke after the apply: the Contributor API and search still answer (counts through the functions). ROLLBACK at the foot.
--
--  FOUND, NOT CAUSED BY THIS MIGRATION: the Convince policy's third condition reads the OTHER person's `rsvps` row, and `rsvps` is
--  readable only by its owner and the event's organiser, so today only an event's organiser can pass it. Left as it was; see
--  docs/proposals/README.md.
-- ════════════════════════════════════════════════════════════════════

begin;

-- A. the companion: "are we mutual followers" without reading the other person's rows. Only about the caller.
create or replace function public.is_mutual_follow(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (select 1 from public.follows where follower_id = auth.uid() and followee_id = p_other)
    and exists (select 1 from public.follows where follower_id = p_other and followee_id = auth.uid());
$$;
revoke all on function public.is_mutual_follow(uuid) from public, anon;
grant execute on function public.is_mutual_follow(uuid) to authenticated, service_role;

drop policy "Mutual friends can send convinces" on public.convinces;
create policy "Mutual friends can send convinces" on public.convinces
  for insert
  with check (
    auth.uid() = from_user_id
    and from_user_id <> to_user_id
    and public.is_mutual_follow(to_user_id)
    and exists (
      select 1 from public.rsvps r
      where r.user_id = convinces.to_user_id and r.event_id = convinces.event_id and r.status = 'considering'
    )
  );

-- B. s13c: follows: my own rows only
drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy follows_select_own on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()));

-- place_follows: my own rows only
drop policy if exists place_follows_select on public.place_follows;
create policy place_follows_select_own on public.place_follows
  for select to authenticated
  using (user_id = (select auth.uid()));

-- the public key has no business here at all (it also held INSERT / UPDATE / DELETE / TRUNCATE
-- grants that RLS was the only thing stopping: belt and braces)
revoke all on public.follows from anon;
revoke all on public.place_follows from anon;

commit;

-- ── ROLLBACK (keep with the migration) ──────────────────────────────
-- begin;
--   drop policy follows_select_own on public.follows;
--   create policy "Follows are viewable by everyone" on public.follows for select using (true);
--   drop policy place_follows_select_own on public.place_follows;
--   create policy place_follows_select on public.place_follows for select using (true);
--   grant select on public.follows, public.place_follows to anon;
--   drop policy "Mutual friends can send convinces" on public.convinces;
--   create policy "Mutual friends can send convinces" on public.convinces for insert with check (
--     (auth.uid() = from_user_id) and (from_user_id <> to_user_id)
--     and exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = convinces.to_user_id)
--     and exists (select 1 from follows where follows.follower_id = convinces.to_user_id and follows.followee_id = auth.uid())
--     and exists (select 1 from rsvps r where r.user_id = convinces.to_user_id and r.event_id = convinces.event_id and r.status = 'considering'));
--   drop function public.is_mutual_follow(uuid);
-- commit;
