-- 148_vision_intelligence_engine.sql
-- Vision Phase B, first tranche (VISION_BACKEND_WIRING_SPEC §3.1b, §3.4a-d,
-- §6.1, §6.4, §8 items 5-7 + 10): the daily snapshot job (CRITICAL — unblocks
-- Growth + Retention), org-level Reach/Engagement aggregation readers, the
-- Growth + Retention calculation functions, and the missing MV refresh cron.
--
-- Identity model (verified live, 2026-07-03): snapshot/claim/map tables key on
-- the CONNECT contributor id (public.profiles.id = events.created_by =
-- reach_per_event.org_id). The app world keys on vision.organisations.id.
-- Every reader below takes the VISION org id, gates on
-- is_org_member/is_platform_admin, then resolves connect_contributor_id
-- (migration 142 bridge) internally. Unlinked orgs get an empty result set.
--
-- Documented deviations from the spec §6.1 draft (predates mig 142):
--   1. Orgs are iterated from vision.organisations WHERE connect_contributor_id
--      IS NOT NULL (the draft iterated category_space_map, which misses orgs
--      that have not configured Spaces yet).
--   2. distinct_persons counts people who ACTED that day (rsvps/follows/reviews
--      created that org-local day) — the draft's unbounded follows subquery
--      would have re-counted the entire follower base every day.
--   3. Per-space snapshot rows are implemented (draft left a TODO). A
--      category_space_map row only feeds a space whose owning org bridges to
--      the same contributor, so a forged cross-org mapping is inert.
--   4. events.date is timestamptz — all day boundaries are computed in the
--      org's timezone (public.profiles.timezone, default Africa/Johannesburg).
--
-- Display Convention #8 (spec §5): every ratio returns its numerator and
-- denominator alongside the percentage.

-- ── 1. Internal helper: distinct persons active for an org in a window ──
-- Person = created an rsvp on the org's events, followed the org, or reviewed
-- one of its events, within [p_from, p_to] (org-local dates). With a space
-- filter, only event-scoped signals count (follows are org-level).
-- Internal-only: EXECUTE = service_role; the SECURITY DEFINER callers below
-- reach it via ownership.
create or replace function vision.org_active_persons(
  p_cc_id    uuid,
  p_tz       text,
  p_from     date,
  p_to       date,
  p_space_id uuid default null
) returns setof uuid
language sql stable security definer
set search_path = vision, public, pg_catalog
as $$
  select rs.user_id
  from public.rsvps rs
  join public.events ev on ev.id = rs.event_id
  where ev.created_by = p_cc_id
    and (rs.created_at at time zone p_tz)::date between p_from and p_to
    and (p_space_id is null or exists (
      select 1 from vision.category_space_map m
      where m.org_id = p_cc_id
        and m.category_id = ev.category_id
        and m.space_id = p_space_id))
  union
  select f.follower_id
  from public.follows f
  where f.followee_id = p_cc_id
    and p_space_id is null
    and (f.created_at at time zone p_tz)::date between p_from and p_to
  union
  select rv.user_id
  from public.reviews rv
  join public.events ev2 on ev2.id = rv.event_id
  where ev2.created_by = p_cc_id
    and rv.user_id is not null
    and (rv.created_at at time zone p_tz)::date between p_from and p_to
    and (p_space_id is null or exists (
      select 1 from vision.category_space_map m2
      where m2.org_id = p_cc_id
        and m2.category_id = ev2.category_id
        and m2.space_id = p_space_id))
$$;

revoke all on function vision.org_active_persons(uuid, text, date, date, uuid) from public, anon, authenticated;
grant execute on function vision.org_active_persons(uuid, text, date, date, uuid) to service_role;

-- ── 2. The daily snapshot job (spec §6.1 — unblocks Growth + Retention) ─
-- Hourly cron; per org, writes yesterday's 'day' snapshot once org-local
-- midnight has passed (idempotent via the EXISTS check + mig 147's unique
-- indexes). Writes one whole-org row (space_id NULL) + one row per space.
-- Returns the number of orgs snapshotted this run (cron log observability).
create or replace function vision.run_daily_snapshots()
returns integer
language plpgsql volatile security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_org record;
  v_yesterday date;
  v_written integer := 0;
begin
  for v_org in
    select distinct o.connect_contributor_id as cc_id,
           coalesce(p.timezone, 'Africa/Johannesburg') as tz
    from vision.organisations o
    join public.profiles p on p.id = o.connect_contributor_id
    where o.connect_contributor_id is not null
  loop
    v_yesterday := (now() at time zone v_org.tz)::date - 1;

    if exists (
      select 1 from vision.vision_period_snapshots s
      where s.org_id = v_org.cc_id and s.period_kind = 'day'
        and s.period_start = v_yesterday and s.space_id is null
    ) then
      continue;
    end if;

    -- Whole-org row. Zero-activity days still write a row (series continuity).
    insert into vision.vision_period_snapshots (
      org_id, space_id, period_kind, period_start, period_end,
      reach_total, impression_count, attending_count, considering_count,
      cancellation_count, engagement_score, distinct_persons, active_events
    )
    select
      v_org.cc_id, null, 'day', v_yesterday, v_yesterday,
      coalesce(sum(r.reach), 0),
      coalesce(sum(r.impression_count), 0),
      coalesce(sum(r.attending_count), 0),
      coalesce(sum(r.considering_count), 0),
      coalesce(sum(r.cancellation_count), 0),
      avg(g.engagement_score),
      (select count(*)::integer
         from vision.org_active_persons(v_org.cc_id, v_org.tz, v_yesterday, v_yesterday, null)),
      count(r.event_id)::integer
    from vision.reach_per_event r
    join public.events e on e.id = r.event_id
    left join vision.engagement_per_event g on g.event_id = r.event_id
    where r.org_id = v_org.cc_id
      and (e.date at time zone v_org.tz)::date = v_yesterday;

    -- Per-space rows (deviation #3): only spaces whose owning org bridges to
    -- this contributor; follows are excluded from space-level distinct persons.
    insert into vision.vision_period_snapshots (
      org_id, space_id, period_kind, period_start, period_end,
      reach_total, impression_count, attending_count, considering_count,
      cancellation_count, engagement_score, distinct_persons, active_events
    )
    select
      v_org.cc_id, s.id, 'day', v_yesterday, v_yesterday,
      coalesce(sum(r.reach), 0),
      coalesce(sum(r.impression_count), 0),
      coalesce(sum(r.attending_count), 0),
      coalesce(sum(r.considering_count), 0),
      coalesce(sum(r.cancellation_count), 0),
      avg(g.engagement_score),
      (select count(*)::integer
         from vision.org_active_persons(v_org.cc_id, v_org.tz, v_yesterday, v_yesterday, s.id)),
      count(r.event_id)::integer
    from vision.spaces s
    join vision.organisations o2
      on o2.id = s.org_id and o2.connect_contributor_id = v_org.cc_id
    left join vision.category_space_map csm
      on csm.space_id = s.id and csm.org_id = v_org.cc_id
    left join public.events e
      on e.category_id = csm.category_id
     and e.created_by = v_org.cc_id
     and e.status = 'published'
     and (e.date at time zone v_org.tz)::date = v_yesterday
    left join vision.reach_per_event r on r.event_id = e.id
    left join vision.engagement_per_event g on g.event_id = e.id
    group by s.id;

    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

revoke all on function vision.run_daily_snapshots() from public, anon, authenticated;
grant execute on function vision.run_daily_snapshots() to service_role;

-- ── 3. Org-level Reach (spec §3.1b/§3.4a) ───────────────────────────────
create or replace function vision.reach_per_org(
  p_org_id uuid,
  p_from   date default null,
  p_to     date default null
) returns table (
  total_reach        bigint,
  impression_total   bigint,
  attending_total    bigint,
  considering_total  bigint,
  cancellation_total bigint,
  event_count        integer,
  avg_reach          numeric
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
  v_tz text;
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select o.connect_contributor_id, coalesce(p.timezone, 'Africa/Johannesburg')
    into v_cc, v_tz
  from vision.organisations o
  left join public.profiles p on p.id = o.connect_contributor_id
  where o.id = p_org_id;

  if v_cc is null then
    return; -- org not linked to Connect yet → no Connect metrics
  end if;

  return query
  select
    coalesce(sum(r.reach), 0)::bigint,
    coalesce(sum(r.impression_count), 0)::bigint,
    coalesce(sum(r.attending_count), 0)::bigint,
    coalesce(sum(r.considering_count), 0)::bigint,
    coalesce(sum(r.cancellation_count), 0)::bigint,
    count(r.event_id)::integer,
    round(coalesce(avg(r.reach), 0), 2)
  from vision.reach_per_event r
  join public.events e on e.id = r.event_id
  where r.org_id = v_cc
    and (p_from is null or (e.date at time zone v_tz)::date >= p_from)
    and (p_to   is null or (e.date at time zone v_tz)::date <= p_to);
end;
$$;

revoke all on function vision.reach_per_org(uuid, date, date) from public, anon;
grant execute on function vision.reach_per_org(uuid, date, date) to authenticated, service_role;

-- ── 4. Org-level Engagement (spec §3.1b/§3.4d) ──────────────────────────
-- engagement_score = AVG of per-event scores (bounded 0-100 — applying the
-- 35/20/15/10/10/10 weights to raw org totals would saturate the LEAST caps
-- for any org with >1 event). top_component = the component with the largest
-- average weighted contribution, for the narrative engine's {topComponent}.
-- followers_total is the org's current follower count (org-level signal — the
-- per-event view repeats it, so summing would multiply it).
create or replace function vision.engagement_per_org(
  p_org_id uuid,
  p_from   date default null,
  p_to     date default null
) returns table (
  attending_total   bigint,
  considering_total bigint,
  followers_total   bigint,
  reviews_total     bigint,
  broadcasts_total  bigint,
  updates_total     bigint,
  engagement_score  numeric,
  event_count       integer,
  top_component     text
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
  v_tz text;
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select o.connect_contributor_id, coalesce(p.timezone, 'Africa/Johannesburg')
    into v_cc, v_tz
  from vision.organisations o
  left join public.profiles p on p.id = o.connect_contributor_id
  where o.id = p_org_id;

  if v_cc is null then
    return;
  end if;

  return query
  with agg as (
    select
      coalesce(sum(g.attending), 0)::bigint     as att_t,
      coalesce(sum(g.considering), 0)::bigint   as con_t,
      coalesce(sum(g.reviews), 0)::bigint       as rev_t,
      coalesce(sum(g.broadcasts), 0)::bigint    as bro_t,
      coalesce(sum(g.event_updates), 0)::bigint as upd_t,
      round(coalesce(avg(g.engagement_score), 0), 2) as score,
      count(g.event_id)::integer                as n,
      coalesce(avg(least(g.attending, 100)) * 0.35, 0)         as w_att,
      coalesce(avg(least(g.considering, 100)) * 0.20, 0)       as w_con,
      coalesce(avg(least(g.org_followers, 100)) * 0.15, 0)     as w_fol,
      coalesce(avg(least(g.reviews * 10, 100)) * 0.10, 0)      as w_rev,
      coalesce(avg(least(g.broadcasts * 5, 100)) * 0.10, 0)    as w_bro,
      coalesce(avg(least(g.event_updates * 5, 100)) * 0.10, 0) as w_upd
    from vision.engagement_per_event g
    join public.events e on e.id = g.event_id
    where g.org_id = v_cc
      and (p_from is null or (e.date at time zone v_tz)::date >= p_from)
      and (p_to   is null or (e.date at time zone v_tz)::date <= p_to)
  )
  select
    agg.att_t,
    agg.con_t,
    (select count(*) from public.follows f where f.followee_id = v_cc)::bigint,
    agg.rev_t,
    agg.bro_t,
    agg.upd_t,
    agg.score,
    agg.n,
    (select v.comp from (values
       ('attending',   agg.w_att),
       ('considering', agg.w_con),
       ('followers',   agg.w_fol),
       ('reviews',     agg.w_rev),
       ('broadcasts',  agg.w_bro),
       ('updates',     agg.w_upd)
     ) as v(comp, w)
     order by v.w desc, v.comp
     limit 1)
  from agg;
end;
$$;

revoke all on function vision.engagement_per_org(uuid, date, date) from public, anon;
grant execute on function vision.engagement_per_org(uuid, date, date) to authenticated, service_role;

-- ── 5. Calendar Growth (spec §3.4b) ─────────────────────────────────────
-- Aggregates 'day' snapshots over the trailing window ending yesterday
-- (day=1, week=7, month=30 org-local days) vs the window before it.
-- distinct_persons is deliberately absent here — day counts cannot be
-- unioned; retention_rate() computes person sets live instead.
create or replace function vision.calendar_growth(
  p_org_id      uuid,
  p_period_kind text default 'month',
  p_space_id    uuid default null
) returns table (
  metric_name           text,
  current_value         numeric,
  previous_value        numeric,
  growth_pct            numeric,
  current_period_start  date,
  previous_period_start date
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
  v_tz text;
  v_len integer;
  v_cur_start date;
  v_cur_end date;
  v_prev_start date;
  v_prev_end date;
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_period_kind not in ('day', 'week', 'month') then
    raise exception 'invalid period kind %', p_period_kind using errcode = '22023';
  end if;

  select o.connect_contributor_id, coalesce(p.timezone, 'Africa/Johannesburg')
    into v_cc, v_tz
  from vision.organisations o
  left join public.profiles p on p.id = o.connect_contributor_id
  where o.id = p_org_id;

  if v_cc is null then
    return;
  end if;

  v_len := case p_period_kind when 'day' then 1 when 'week' then 7 else 30 end;
  v_cur_end := (now() at time zone v_tz)::date - 1;
  v_cur_start := v_cur_end - v_len + 1;
  v_prev_end := v_cur_start - 1;
  v_prev_start := v_prev_end - v_len + 1;

  return query
  with cur as (
    select
      coalesce(sum(s.reach_total), 0)::numeric      as reach,
      coalesce(sum(s.impression_count), 0)::numeric as impressions,
      coalesce(sum(s.attending_count), 0)::numeric  as attending,
      avg(s.engagement_score)                       as engagement,
      coalesce(sum(s.active_events), 0)::numeric    as active_events
    from vision.vision_period_snapshots s
    where s.org_id = v_cc and s.period_kind = 'day'
      and s.period_start between v_cur_start and v_cur_end
      and ((p_space_id is null and s.space_id is null)
        or (p_space_id is not null and s.space_id = p_space_id))
  ),
  prev as (
    select
      coalesce(sum(s.reach_total), 0)::numeric      as reach,
      coalesce(sum(s.impression_count), 0)::numeric as impressions,
      coalesce(sum(s.attending_count), 0)::numeric  as attending,
      avg(s.engagement_score)                       as engagement,
      coalesce(sum(s.active_events), 0)::numeric    as active_events
    from vision.vision_period_snapshots s
    where s.org_id = v_cc and s.period_kind = 'day'
      and s.period_start between v_prev_start and v_prev_end
      and ((p_space_id is null and s.space_id is null)
        or (p_space_id is not null and s.space_id = p_space_id))
  )
  select
    m.mname,
    m.cur_v,
    m.prev_v,
    case when m.prev_v is null or m.prev_v = 0 then null
         else round((m.cur_v - m.prev_v) / m.prev_v * 100, 1) end,
    v_cur_start,
    v_prev_start
  from (
    select 'reach'::text as mname, cur.reach as cur_v, prev.reach as prev_v from cur, prev
    union all
    select 'impressions', cur.impressions, prev.impressions from cur, prev
    union all
    select 'attending', cur.attending, prev.attending from cur, prev
    union all
    select 'engagement', round(cur.engagement, 2), round(prev.engagement, 2) from cur, prev
    union all
    select 'active_events', cur.active_events, prev.active_events from cur, prev
  ) m;
end;
$$;

revoke all on function vision.calendar_growth(uuid, text, uuid) from public, anon;
grant execute on function vision.calendar_growth(uuid, text, uuid) to authenticated, service_role;

-- ── 6. Retention (spec §3.4c) ───────────────────────────────────────────
-- Live distinct-person sets (not snapshots): current vs previous trailing
-- window, same boundaries as calendar_growth. Returns counts beside every
-- percentage (Display Convention #8).
create or replace function vision.retention_rate(
  p_org_id      uuid,
  p_period_kind text default 'month',
  p_space_id    uuid default null
) returns table (
  current_distinct      integer,
  previous_distinct     integer,
  returning_count       integer,
  new_count             integer,
  churned_count         integer,
  retention_pct         numeric,
  acquisition_pct       numeric,
  churn_pct             numeric,
  current_period_start  date,
  previous_period_start date
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
  v_tz text;
  v_len integer;
  v_cur_start date;
  v_cur_end date;
  v_prev_start date;
  v_prev_end date;
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_period_kind not in ('day', 'week', 'month') then
    raise exception 'invalid period kind %', p_period_kind using errcode = '22023';
  end if;

  select o.connect_contributor_id, coalesce(p.timezone, 'Africa/Johannesburg')
    into v_cc, v_tz
  from vision.organisations o
  left join public.profiles p on p.id = o.connect_contributor_id
  where o.id = p_org_id;

  if v_cc is null then
    return;
  end if;

  v_len := case p_period_kind when 'day' then 1 when 'week' then 7 else 30 end;
  v_cur_end := (now() at time zone v_tz)::date - 1;
  v_cur_start := v_cur_end - v_len + 1;
  v_prev_end := v_cur_start - 1;
  v_prev_start := v_prev_end - v_len + 1;

  return query
  with cur as (
    select t.uid
    from vision.org_active_persons(v_cc, v_tz, v_cur_start, v_cur_end, p_space_id) as t(uid)
  ),
  prev as (
    select t.uid
    from vision.org_active_persons(v_cc, v_tz, v_prev_start, v_prev_end, p_space_id) as t(uid)
  ),
  counts as (
    select
      (select count(*) from cur)::integer  as cur_n,
      (select count(*) from prev)::integer as prev_n,
      (select count(*) from cur c where exists (select 1 from prev p where p.uid = c.uid))::integer as ret_n
  )
  select
    c.cur_n,
    c.prev_n,
    c.ret_n,
    c.cur_n - c.ret_n,
    c.prev_n - c.ret_n,
    case when c.prev_n = 0 then null
         else round(c.ret_n::numeric / c.prev_n * 100, 1) end,
    case when c.cur_n = 0 then null
         else round((c.cur_n - c.ret_n)::numeric / c.cur_n * 100, 1) end,
    case when c.prev_n = 0 then null
         else round((c.prev_n - c.ret_n)::numeric / c.prev_n * 100, 1) end,
    v_cur_start,
    v_prev_start
  from counts c;
end;
$$;

revoke all on function vision.retention_rate(uuid, text, uuid) from public, anon;
grant execute on function vision.retention_rate(uuid, text, uuid) to authenticated, service_role;

-- ── 7. Cron registrations ───────────────────────────────────────────────
-- Hourly snapshot check (each org's day closes at its own local midnight;
-- the fn no-ops for orgs already snapshotted — spec §6.1).
select cron.schedule(
  'vision_daily_snapshots',
  '15 * * * *',
  'SELECT vision.run_daily_snapshots();'
);

-- Daily refresh of the MVs jobs 8/9 do not cover (spec §6.4). All four MVs
-- carry unique indexes (verified) → CONCURRENTLY is safe.
select cron.schedule(
  'vision_mv_refresh_daily',
  '20 3 * * *',
  $cron$
  SELECT vision.refresh_boundary_coverage();
  REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_goal_alignment_matrix;
  REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_department_ranking;
  REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_org_activity_summary;
  $cron$
);
