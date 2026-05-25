-- 101_get_place_review_stats.sql
--
-- Replaces the 5,000-row JS reduce in `src/app/events/page.tsx` with a single
-- SQL aggregate. The old page fetched every review in the 12-month window and
-- computed total_rating / review_count / negative_signals in a JS for-loop.
-- This RPC is one round-trip that returns only the aggregated values.
--
-- Called from the public events page — must be executable by `anon` (not just
-- `authenticated`) because the events map is visible without login.
--
-- SECURITY INVOKER: respects RLS on `reviews`. Existing RLS already allows
-- `anon` to SELECT reviews (evidenced by the old raw-select fetch working for
-- unauthenticated visitors).
--
-- Perf P0 batch — 2026-05-25.

create or replace function public.get_place_review_stats(
  p_window_start timestamptz default now() - interval '12 months'
)
returns table (
  place_id         uuid,
  review_count     bigint,
  total_rating     numeric,
  negative_signals bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    r.place_id,
    count(*)::bigint                                                  as review_count,
    sum(r.rating)::numeric                                            as total_rating,
    count(*) filter (where r.still_exists = false)::bigint           as negative_signals
  from public.reviews r
  where r.place_id is not null
    and r.created_at >= p_window_start
  group by r.place_id
$$;

-- Tighten executable surface to named roles only.
revoke all on function public.get_place_review_stats(timestamptz) from public;
grant execute on function public.get_place_review_stats(timestamptz) to anon;
grant execute on function public.get_place_review_stats(timestamptz) to authenticated;

comment on function public.get_place_review_stats(timestamptz) is
  'Returns per-place review aggregates (count, total_rating, negative_signals) within the given time window. SECURITY INVOKER; respects existing reviews RLS. Callable by anon — events map is public.';
