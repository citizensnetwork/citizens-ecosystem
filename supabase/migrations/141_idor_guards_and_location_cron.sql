-- ============================================================
-- Migration 141: IDOR self-check guards + live-location cleanup cron
-- ============================================================
-- Acts on the two open follow-ups recorded in RESUME §3C:
--
--   A. Caller-trust IDOR surface. Three SECURITY DEFINER RPCs accept
--      caller-passed user ids but never enforce that the CALLER actually IS
--      one of those users. A SECURITY DEFINER fn runs as its owner and
--      bypasses RLS, so a caller could pass someone else's id and act/read on
--      their behalf. The app always passes the authenticated id, but the
--      database must enforce it itself (defence in depth). Add an internal
--      `auth.uid()` self-check to:
--        • is_blocked(uuid, uuid)
--        • find_or_create_conversation(uuid, uuid, text)
--        • get_mutual_followers(uuid, uuid, integer)
--
--      NOT touched: safe_rsvp / toggle_consider — they ALREADY enforce
--      `auth.uid() <> p_user_id` (verified live; mig 086 / 028). The §3C note
--      over-listed them.
--
--   B. cleanup_stale_locations() is defined (mig 019) but scheduled by NO cron
--      job — post-event live-location rows were never being purged. Live
--      location is the most privacy-sensitive data the platform holds, so
--      register a frequent cleanup.
--
-- Guard pattern (mirrors the proven safe_rsvp guard):
--   if auth.uid() is null or (auth.uid() <> A and auth.uid() <> B) then
--     raise exception 'unauthorized' using errcode = '42501';
--   end if;
-- The `auth.uid() is null` arm is REQUIRED: without it a NULL uid yields
-- `NULL <> A` = NULL, so `if NULL` would SKIP the raise (a bypass). The caller
-- must be one of the two parties — either slot still means the caller is a
-- legitimate participant of the relationship being queried/created.
--
-- Safe for live callers: is_blocked + find_or_create_conversation are only
-- called from src/app/api/conversations/route.ts, which passes the authed
-- user.id via a user-scoped client (anon key + Bearer/cookie → auth.uid()
-- resolves inside the SECURITY DEFINER body). get_mutual_followers has no live
-- caller yet. All three remain `authenticated`-only (grants from mig 140 are
-- preserved by CREATE OR REPLACE).
-- ============================================================

begin;

-- ── A1. is_blocked — convert to plpgsql + self-check ───────────────────────
create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  -- IDOR guard: caller must be one of the two parties in the block check.
  if auth.uid() is null or (auth.uid() <> user_a and auth.uid() <> user_b) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return exists (
    select 1 from public.user_blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
end;
$$;

-- ── A2. find_or_create_conversation — add self-check ───────────────────────
-- Body otherwise identical to the live definition; only the guard is new.
create or replace function public.find_or_create_conversation(
  user_a uuid,
  user_b uuid,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  conv_id uuid;
begin
  -- IDOR guard: caller may only find/create a conversation they are part of.
  if auth.uid() is null or (auth.uid() <> user_a and auth.uid() <> user_b) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if user_a = user_b then
    raise exception 'Cannot create conversation with yourself';
  end if;

  if p_status not in ('pending', 'active') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select cp1.conversation_id into conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = user_a and cp2.user_id = user_b
  limit 1;

  if conv_id is not null then
    return conv_id;
  end if;

  insert into public.conversations (status) values (p_status) returning id into conv_id;
  insert into public.conversation_participants (conversation_id, user_id)
  values (conv_id, user_a), (conv_id, user_b);

  return conv_id;
end;
$$;

-- ── A3. get_mutual_followers — convert to plpgsql + self-check ─────────────
create or replace function public.get_mutual_followers(
  p_user_a uuid,
  p_user_b uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  role text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  -- IDOR guard: caller must be one of the two parties whose social graphs
  -- are being intersected.
  if auth.uid() is null or (auth.uid() <> p_user_a and auth.uid() <> p_user_b) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, p.avatar_url, p.role
    from public.profiles p
    where p.id in (
      select f1.followee_id
      from public.follows f1
      where f1.follower_id = p_user_a
      intersect
      select f2.followee_id
      from public.follows f2
      where f2.follower_id = p_user_b
    )
    order by p.full_name nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

-- ── B. Schedule live-location cleanup ──────────────────────────────────────
-- cleanup_stale_locations() purges user_locations rows whose event ended >30m
-- ago. Run every 15 minutes so stale live-location data never lingers long.
-- Runs as the cron owner (postgres), which can execute the fn regardless of
-- the mig-140 service_role-only grant (owner privilege; same as job #1's
-- recompute_map_prominence).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is not installed — apply migration 120 first';
  end if;

  if exists (select 1 from cron.job where jobname = 'live-location-cleanup') then
    perform cron.unschedule('live-location-cleanup');
  end if;

  perform cron.schedule(
    'live-location-cleanup',
    '*/15 * * * *',
    $cron$ SELECT public.cleanup_stale_locations(); $cron$
  );
end $$;

commit;
