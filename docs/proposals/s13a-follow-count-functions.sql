-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL S13a (gate G1, G6): NOT APPLIED. Step 1 of 2 for the follows privacy gap.
--  Written 2026-10-17. Take the next free migration number at apply time.
--
--  What it does: ADDS four functions. It changes no table, no policy and no grant on
--  `follows` / `place_follows`, so it is safe to apply on its own and nothing that works
--  today can break. It gives every reader that currently counts or looks up rows in those
--  two tables a function to call instead, so that step 2 (s13b) can close the tables.
--
--  Order of the whole change (see s13-follows-privacy.md):
--    1. apply THIS file                       (additive)
--    2. deploy the app code that calls these functions (4 routes + 1 SQL function)
--    3. apply s13b-follows-tighten.sql        (the policy change)
--
--  Every SECURITY DEFINER function pins search_path and revokes EXECUTE from public and
--  anon unless it must be callable by the public key (follower_count_public).
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
