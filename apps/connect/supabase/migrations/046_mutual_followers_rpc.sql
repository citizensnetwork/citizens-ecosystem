-- ============================================
-- Phase E: Social Graph Polish
-- Mutual followers RPC for profile pages.
-- ============================================
--
-- Returns the intersection of "accounts that user_a follows" and
-- "accounts that user_b follows" — i.e. people both parties know in
-- common. The RPC is SECURITY DEFINER so callers can traverse the
-- social graph without needing SELECT on follows (they already do,
-- but this keeps us forward-compatible if the public SELECT policy
-- tightens) and it only ever exposes public profile columns.

create or replace function public.get_mutual_followers(
  p_user_a uuid,
  p_user_b uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.get_mutual_followers(uuid, uuid, int) to authenticated;
