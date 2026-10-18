-- ════════════════════════════════════════════════════════════════════
--  185_follow_count_functions: S13 step 1 of 4 (who can read who follows whom). Authored as
--  docs/proposals/s13a-follow-count-functions.sql on 2026-10-17; applied the same day through MCP apply_migration as
--  `185_follow_count_functions` on Stephen's yes in chat (one yes per file; pre-apply tag
--  `connect-pre-mig185-follow-count-functions`). Rollback-only probe
--  docs/audit/probes/185_follow_count_functions.probe.sql: 18 of 18 PASS against the live functions, nothing left behind.
--  Security advisor: 0 ERROR; 5 new WARN (125 -> 130), all by design: follower_count_public (callable by anon and signed-in,
--  it returns only a bucket), follower_count_exact, recipient_follows_me and count_friends (signed-in only; each checks
--  auth.uid() or returns an aggregate, like the existing functions of that class).
--
--  ADDS four functions and changes no table, no policy and no grant on `follows` / `place_follows`, so nothing that works
--  today can break. They give every reader that counts or looks up rows in those two tables something to call instead, so
--  that s13c (the policy change, a later yes after the code that calls these is live) can close the tables.
--    follower_count_public(uuid)  bucketed (0 under 100, else rounded down), callable by the public key
--    follower_count_exact(uuid)   exact, signed-in only (the Contributor's own dashboard)
--    recipient_follows_me(uuid)   the messaging rule; the caller is always auth.uid()
--    count_friends(uuid)          same body, now SECURITY DEFINER and no longer callable by the public key
--  Order of the whole change: s13a (this) -> s13b (186, search) -> deploy the code -> s13c. See docs/proposals/s13-follows-privacy.md.
-- ════════════════════════════════════════════════════════════════════

begin;

-- 1. The public number: rounded DOWN to a step, and 0 below 100 ("show nothing"). The steps are the
--    twin of MapV2.countBucket in app/map-v2-lib.jsx (P2-08), so a small ministry is never put next
--    to a low figure by ANY reader of this database, not only by the Map v2 sheet.
create or replace function public.follower_count_public(p_followee uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with n as (select count(*)::bigint as c from public.follows where followee_id = p_followee)
  select case
    when n.c < 100 then 0::bigint
    else (select max(s) from unnest(array[100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]::bigint[]) as s where s <= n.c)
  end
  from n;
$$;
revoke all on function public.follower_count_public(uuid) from public;
grant execute on function public.follower_count_public(uuid) to anon, authenticated, service_role;

-- 2. The exact number, for a signed-in reader (the Contributor's own dashboard). Not callable by the public key.
create or replace function public.follower_count_exact(p_followee uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::bigint from public.follows where followee_id = p_followee;
$$;
revoke all on function public.follower_count_exact(uuid) from public, anon;
grant execute on function public.follower_count_exact(uuid) to authenticated, service_role;

-- 3. "Has this person followed me or one of my places?": the messaging rule in POST /api/conversations
--    (a Contributor may message a citizen who interacted with them). The caller is always the Contributor
--    (auth.uid()); nobody can ask about a pair that does not include themselves.
create or replace function public.recipient_follows_me(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.follows f where f.follower_id = p_recipient and f.followee_id = auth.uid())
    or exists (
      select 1
      from public.place_follows pf
      join public.places pl on pl.id = pf.place_id
      where pf.user_id = p_recipient and pl.created_by = auth.uid()
    )
  );
$$;
revoke all on function public.recipient_follows_me(uuid) from public, anon;
grant execute on function public.recipient_follows_me(uuid) to authenticated, service_role;

-- 4. count_friends: no caller was found in the app code (searched 2026-10-17). It reads BOTH directions of a
--    pair, so it cannot survive an own-rows policy as SECURITY INVOKER. Same body, now DEFINER, no longer
--    callable by the public key.
create or replace function public.count_friends(target_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
  from public.follows f1
  join public.follows f2
    on f1.followee_id = f2.follower_id
   and f1.follower_id = f2.followee_id
  where f1.follower_id = target_user;
$$;
revoke all on function public.count_friends(uuid) from public, anon;
grant execute on function public.count_friends(uuid) to authenticated, service_role;

commit;
