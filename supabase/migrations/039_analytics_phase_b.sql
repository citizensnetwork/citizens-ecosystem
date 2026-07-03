-- ============================================================
-- Migration 039: Ecosystem Phase B — Analytics foundation
-- ============================================================
-- Adds a read-only analytics surface powering:
--   * /dashboard — contributor-role gated stats (own org only)
--   * /api/v1/contributors/{slug}/stats — public ecosystem stats
--   * Platform-wide community health metrics for admins
--
-- Design decisions:
--
-- 1. Live RPCs, not materialised tables. The data volumes are modest
--    (thousands of events, tens of thousands of rsvps/follows) and
--    trust in freshness is more valuable than shaving milliseconds.
--    `analytics_daily` is created as a thin rollup table for future
--    use but is NOT populated by this migration — a later pg_cron or
--    Edge Function will backfill it once volumes justify the cost.
--
-- 2. SECURITY DEFINER with explicit auth checks instead of RLS-heavy
--    views. The RPCs aggregate across tables with differing RLS
--    policies (events: public.select, rsvps: public.select,
--    event_views: owner/admin only); encoding the auth gate in
--    plpgsql is both clearer and easier to audit than composing
--    per-table policies.
--
-- 3. All RPCs run as `security definer` so they can read
--    `event_views` (which is owner-only) — but they always filter
--    events/views to the requested org_id so the caller never sees
--    cross-org data.
--
-- 4. `get_community_health()` is admin-only. `get_contributor_public_stats()`
--    is unauthenticated-safe (approved contributors only, public
--    events only).
--
-- Idempotent. Safe to re-run.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 1. analytics_daily — thin platform rollup table (future use)
-- ────────────────────────────────────────────────────────────
-- Each row: one metric, one day, optionally scoped to an org.
-- org_id NULL means platform-wide.  Kept narrow so we can add new
-- metric keys without schema churn.
create table if not exists public.analytics_daily (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  org_id uuid references public.profiles(id) on delete cascade,
  metric_key text not null,
  metric_value numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (day, org_id, metric_key)
);

create index if not exists analytics_daily_day_key_idx
  on public.analytics_daily(day, metric_key);
create index if not exists analytics_daily_org_day_idx
  on public.analytics_daily(org_id, day)
  where org_id is not null;

alter table public.analytics_daily enable row level security;

-- Admins read everything; contributors read their own rows only.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'analytics_daily'
      and policyname = 'Admins can read all analytics'
  ) then
    create policy "Admins can read all analytics"
      on public.analytics_daily for select
      using (public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'analytics_daily'
      and policyname = 'Orgs can read own analytics'
  ) then
    create policy "Orgs can read own analytics"
      on public.analytics_daily for select
      using (auth.uid() = org_id);
  end if;
end $$;

-- No client-side writes.  Inserts/updates happen via service_role
-- (Edge Function / pg_cron backfill) only — the absence of INSERT/UPDATE
-- policies is intentional: service_role bypasses RLS.

-- ────────────────────────────────────────────────────────────
-- 2. Supporting indexes for live RPC performance
-- ────────────────────────────────────────────────────────────
create index if not exists follows_followee_created_at_idx
  on public.follows(followee_id, created_at desc);

create index if not exists events_created_by_date_idx
  on public.events(created_by, date);

create index if not exists rsvps_created_at_idx
  on public.rsvps(created_at desc);

-- ────────────────────────────────────────────────────────────
-- 3. get_org_event_stats(p_org_id uuid)
-- ────────────────────────────────────────────────────────────
-- Per-contributor headline numbers.  Requires auth.uid() = p_org_id
-- or admin.
create or replace function public.get_org_event_stats(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
  v_total_events int;
  v_upcoming int;
  v_past int;
  v_total_rsvps int;
  v_views_total int;
  v_new_followers_30d int;
  v_avg_rsvps numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if auth.uid() <> p_org_id and not public.is_admin() then
    raise exception 'Not authorised to view this org' using errcode = '42501';
  end if;

  select count(*) into v_total_events
    from public.events where created_by = p_org_id and status = 'published';
  select count(*) into v_upcoming
    from public.events
    where created_by = p_org_id and status = 'published' and date >= now();
  select count(*) into v_past
    from public.events
    where created_by = p_org_id and status = 'published' and date < now();

  select count(*) into v_total_rsvps
    from public.rsvps r
    join public.events e on e.id = r.event_id
    where e.created_by = p_org_id;

  select count(*) into v_views_total
    from public.event_views v
    join public.events e on e.id = v.event_id
    where e.created_by = p_org_id;

  select count(*) into v_new_followers_30d
    from public.follows
    where followee_id = p_org_id
      and created_at >= now() - interval '30 days';

  v_avg_rsvps := case
    when v_total_events = 0 then 0
    else round(v_total_rsvps::numeric / v_total_events, 2)
  end;

  v_result := jsonb_build_object(
    'total_events', v_total_events,
    'upcoming', v_upcoming,
    'past', v_past,
    'total_rsvps', v_total_rsvps,
    'avg_rsvps_per_event', v_avg_rsvps,
    'views_total', v_views_total,
    'new_followers_30d', v_new_followers_30d
  );
  return v_result;
end;
$$;

revoke all on function public.get_org_event_stats(uuid) from public;
grant execute on function public.get_org_event_stats(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. get_org_audience(p_org_id uuid)
-- ────────────────────────────────────────────────────────────
-- 30-day daily time series of RSVPs received + new followers.
-- Returns jsonb with two arrays of {day, count}.
create or replace function public.get_org_audience(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rsvps jsonb;
  v_followers jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if auth.uid() <> p_org_id and not public.is_admin() then
    raise exception 'Not authorised to view this org' using errcode = '42501';
  end if;

  with days as (
    select (current_date - (n || ' days')::interval)::date as day
    from generate_series(0, 29) n
  ),
  rsvp_counts as (
    select date_trunc('day', r.created_at)::date as day, count(*)::int as c
    from public.rsvps r
    join public.events e on e.id = r.event_id
    where e.created_by = p_org_id
      and r.created_at >= current_date - interval '30 days'
    group by 1
  ),
  follower_counts as (
    select date_trunc('day', created_at)::date as day, count(*)::int as c
    from public.follows
    where followee_id = p_org_id
      and created_at >= current_date - interval '30 days'
    group by 1
  )
  select
    jsonb_agg(
      jsonb_build_object('day', d.day, 'count', coalesce(r.c, 0))
      order by d.day
    ),
    jsonb_agg(
      jsonb_build_object('day', d.day, 'count', coalesce(f.c, 0))
      order by d.day
    )
  into v_rsvps, v_followers
  from days d
  left join rsvp_counts r on r.day = d.day
  left join follower_counts f on f.day = d.day;

  return jsonb_build_object(
    'rsvps_30d', coalesce(v_rsvps, '[]'::jsonb),
    'new_followers_30d', coalesce(v_followers, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_org_audience(uuid) from public;
grant execute on function public.get_org_audience(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. get_category_trends()
-- ────────────────────────────────────────────────────────────
-- Per-category event growth: last 30 days vs previous 30 days.
-- Admin-only (strategic data — not for general consumption).
create or replace function public.get_category_trends()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  with current_window as (
    select category, count(*)::int as c
    from public.events
    where category is not null
      and date >= now() - interval '30 days'
      and date < now()
      and status = 'published'
    group by 1
  ),
  prior_window as (
    select category, count(*)::int as c
    from public.events
    where category is not null
      and date >= now() - interval '60 days'
      and date < now() - interval '30 days'
      and status = 'published'
    group by 1
  ),
  all_categories as (
    select category from current_window
    union
    select category from prior_window
  )
  select jsonb_agg(
    jsonb_build_object(
      'category', ac.category,
      'current_30d', coalesce(cw.c, 0),
      'prior_30d', coalesce(pw.c, 0),
      'growth_pct', case
        when coalesce(pw.c, 0) = 0 then null
        else round(((coalesce(cw.c, 0) - pw.c)::numeric / pw.c) * 100, 1)
      end
    )
    order by coalesce(cw.c, 0) desc
  ) into v_result
  from all_categories ac
  left join current_window cw on cw.category = ac.category
  left join prior_window pw on pw.category = ac.category;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_category_trends() from public;
grant execute on function public.get_category_trends() to authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. get_community_health()
-- ────────────────────────────────────────────────────────────
-- Platform-wide headline numbers.  Admin-only.
create or replace function public.get_community_health()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'active_contributors', (
      select count(*) from public.profiles
      where role = 'contributor' and contributor_status = 'approved'
    ),
    'new_contributors_30d', (
      select count(*) from public.profiles
      where role = 'contributor'
        and contributor_status = 'approved'
        and created_at >= now() - interval '30 days'
    ),
    'events_30d', (
      select count(*) from public.events
      where status = 'published' and created_at >= now() - interval '30 days'
    ),
    'rsvps_30d', (
      select count(*) from public.rsvps
      where created_at >= now() - interval '30 days'
    ),
    'unique_rsvpers_30d', (
      select count(distinct user_id) from public.rsvps
      where created_at >= now() - interval '30 days'
    ),
    'total_citizens', (
      select count(*) from public.profiles where role = 'citizen'
    ),
    'total_events_all_time', (
      select count(*) from public.events where status = 'published'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_community_health() from public;
grant execute on function public.get_community_health() to authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. get_contributor_public_stats(p_org_id uuid)
-- ────────────────────────────────────────────────────────────
-- Unauthenticated-safe: surfaces only counts derived from public
-- data (approved contributor + public published events).  No views,
-- no demographic data.  Powers the ecosystem API
-- /api/v1/contributors/{slug}/stats.
create or replace function public.get_contributor_public_stats(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
  v_role text;
  v_status text;
begin
  select role, contributor_status into v_role, v_status
    from public.profiles where id = p_org_id;

  if v_role is distinct from 'contributor' or v_status is distinct from 'approved' then
    -- Never expose stats for non-approved contributors.
    return null;
  end if;

  v_result := jsonb_build_object(
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
    'followers', (
      select count(*) from public.follows where followee_id = p_org_id
    )
  );
  return v_result;
end;
$$;

revoke all on function public.get_contributor_public_stats(uuid) from public;
grant execute on function public.get_contributor_public_stats(uuid) to anon, authenticated;

commit;
