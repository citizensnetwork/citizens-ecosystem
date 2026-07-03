-- 094_get_user_places_with_stats.sql
--
-- Replaces the per-place client-side filter aggregation in `/api/manage/places`
-- with a single SQL aggregate. The old route fetched every `place_follows` and
-- `reviews` row for the caller's places, then `.filter()`-ed in JS to compute
-- follower_count / review_count / avg_rating. That's O(n*m) network bytes for
-- contributors with many places; this RPC is one round-trip.
--
-- SECURITY INVOKER: respects RLS on `places`, `place_follows`, `reviews`.
-- The explicit `created_by = auth.uid()` filter keeps results scoped to the
-- caller even if a future RLS policy widens select access.
--
-- Polish run 2026-05-23 — Polish Queue row 4 item (d), surface
-- `places-browse-and-follow`.

create or replace function public.get_user_places_with_stats()
returns table (
  id            uuid,
  name          text,
  address       text,
  verified      boolean,
  created_at    timestamptz,
  follow_count  bigint,
  review_count  bigint,
  avg_rating    numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.name,
    p.address,
    p.verified,
    p.created_at,
    coalesce(f.cnt, 0)::bigint                                as follow_count,
    coalesce(r.cnt, 0)::bigint                                as review_count,
    case when coalesce(r.cnt, 0) > 0 then r.avg else null end as avg_rating
  from public.places p
  left join lateral (
    select count(*)::bigint as cnt
    from public.place_follows pf
    where pf.place_id = p.id
  ) f on true
  left join lateral (
    select count(*)::bigint as cnt, avg(rating)::numeric as avg
    from public.reviews rv
    where rv.place_id = p.id
  ) r on true
  where p.created_by = auth.uid()
  order by p.created_at desc;
$$;

-- Tighten executable surface: only authenticated users can call this.
revoke all on function public.get_user_places_with_stats() from public;
revoke all on function public.get_user_places_with_stats() from anon;
grant execute on function public.get_user_places_with_stats() to authenticated;

comment on function public.get_user_places_with_stats() is
  'Returns the caller''s own places enriched with follower/review aggregates. SECURITY INVOKER + auth.uid() filter; safe under existing RLS.';
