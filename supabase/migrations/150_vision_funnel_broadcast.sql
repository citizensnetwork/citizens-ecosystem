-- 150_vision_funnel_broadcast.sql
-- Vision Phase C, items 11-12 (VISION_BACKEND_WIRING_SPEC §3.4a / §3.4d /
-- §4.1 / §8): the org-level Citizen-Journey Funnel and Broadcast
-- Effectiveness readers. These flip the Analytics → Funnel and → Broadcast
-- tabs from demo to live (the last two RGRE-adjacent tabs still on sample
-- data after mig-148 increment 1).
--
-- Both follow the exact mig-148 reader contract:
--   * SECURITY DEFINER, search_path = vision, public, pg_catalog
--   * take the VISION org id, gate on is_org_member OR is_platform_admin
--     (42501 when neither), then resolve connect_contributor_id (mig 142)
--     internally — unlinked orgs get an empty/zero result
--   * EXECUTE granted to authenticated + service_role (the /api/metrics
--     route calls them with the caller's JWT so the gate resolves). This is
--     the same intentional authenticated-SECDEF-reader class as the four
--     mig-148 readers — it adds 2 by-design advisor WARNs (do not re-flag).
--   * Display Convention #8 (§5): every percentage ships with the raw stage
--     counts that form its numerator and denominator, so the frontend can
--     render "12% (152/1240)" without recomputation.
--
-- Column reconciliation vs the spec sketch (verified live 2026-07-03):
--   * broadcast_messages carries deleted_at (soft delete) → filtered out.
--   * broadcast_reactions is emoji-aggregated (broadcast_id, emoji, count) —
--     NOT one row per reaction — so reaction totals SUM the count column and
--     cannot be time-windowed (there is no per-reaction timestamp).
--   * events.date is timestamptz → funnel date windows are org-local (tz from
--     profiles.timezone), consistent with migs 147-149.

-- ── 1. Citizen-Journey Funnel (spec §3.4a / §4.1) ───────────────────────
-- Org-level Impression → Consider → Attend → Review → Follow, aggregated
-- across the org's events in the window. Impressions/considering/attending
-- come from reach_per_event; reviews from engagement_per_event; follows are
-- org-level (followee_id = contributor) counted in the same window.
create or replace function vision.activity_funnel(
  p_org_id uuid,
  p_from   date default null,
  p_to     date default null
) returns table (
  impressions              bigint,
  considering              bigint,
  attending                bigint,
  reviews                  bigint,
  follows                  bigint,
  impression_to_attend_pct numeric,
  attend_to_review_pct     numeric,
  review_to_follow_pct     numeric,
  event_count              integer
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
      coalesce(sum(r.impression_count), 0)::bigint  as imp,
      coalesce(sum(r.considering_count), 0)::bigint as con,
      coalesce(sum(r.attending_count), 0)::bigint   as att,
      coalesce(sum(g.reviews), 0)::bigint           as rev,
      count(distinct r.event_id)::integer           as n
    from vision.reach_per_event r
    join public.events e on e.id = r.event_id
    left join vision.engagement_per_event g on g.event_id = r.event_id
    where r.org_id = v_cc
      and (p_from is null or (e.date at time zone v_tz)::date >= p_from)
      and (p_to   is null or (e.date at time zone v_tz)::date <= p_to)
  ),
  fol as (
    select count(*)::bigint as f
    from public.follows f
    where f.followee_id = v_cc
      and (p_from is null or (f.created_at at time zone v_tz)::date >= p_from)
      and (p_to   is null or (f.created_at at time zone v_tz)::date <= p_to)
  )
  select
    agg.imp, agg.con, agg.att, agg.rev, fol.f,
    case when agg.imp = 0 then null else round(agg.att::numeric / agg.imp * 100, 1) end,
    case when agg.att = 0 then null else round(agg.rev::numeric / agg.att * 100, 1) end,
    case when agg.rev = 0 then null else round(fol.f::numeric / agg.rev * 100, 1) end,
    agg.n
  from agg, fol;
end;
$$;

revoke all on function vision.activity_funnel(uuid, date, date) from public, anon;
grant execute on function vision.activity_funnel(uuid, date, date) to authenticated, service_role;

-- ── 2. Broadcast Effectiveness (spec §3.4d) ─────────────────────────────
-- Org-level: for each broadcast in the lookback window, count RSVPs and new
-- follows landing within 48h of it (conversion proxy), plus emoji reactions;
-- aggregated across the org's broadcasts. conversion_pct = (rsvps + follows)
-- / audience. Reactions are emoji-aggregated counts (no per-reaction time).
create or replace function vision.broadcast_effectiveness(
  p_org_id        uuid,
  p_lookback_days integer default 90
) returns table (
  broadcasts_sent   integer,
  audience_total    bigint,
  rsvps_within_48h  bigint,
  follows_within_48h bigint,
  reactions_total   bigint,
  conversion_pct    numeric
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select o.connect_contributor_id into v_cc
  from vision.organisations o
  where o.id = p_org_id;

  if v_cc is null then
    return;
  end if;

  return query
  with base as (
    select
      count(*)::integer                                as sent,
      coalesce(sum(b.audience_size_at_post), 0)::bigint as aud,
      coalesce(sum(r48.cnt), 0)::bigint                 as rsvps,
      coalesce(sum(f48.cnt), 0)::bigint                 as fols,
      coalesce(sum(rx.cnt), 0)::bigint                  as reacts
    from public.broadcast_messages b
    left join lateral (
      select count(*) as cnt
      from public.rsvps r
      join public.events e on e.id = r.event_id
      where e.created_by = v_cc
        and r.created_at >= b.created_at
        and r.created_at <  b.created_at + interval '48 hours'
    ) r48 on true
    left join lateral (
      select count(*) as cnt
      from public.follows f
      where f.followee_id = v_cc
        and f.created_at >= b.created_at
        and f.created_at <  b.created_at + interval '48 hours'
    ) f48 on true
    left join lateral (
      select coalesce(sum(br.count), 0) as cnt
      from public.broadcast_reactions br
      where br.broadcast_id = b.id
    ) rx on true
    where b.contributor_id = v_cc
      and b.deleted_at is null
      and b.created_at >= now() - make_interval(days => p_lookback_days)
  )
  select
    base.sent, base.aud, base.rsvps, base.fols, base.reacts,
    case when base.aud = 0 then null
         else round((base.rsvps + base.fols)::numeric / base.aud * 100, 1) end
  from base;
end;
$$;

revoke all on function vision.broadcast_effectiveness(uuid, integer) from public, anon;
grant execute on function vision.broadcast_effectiveness(uuid, integer) to authenticated, service_role;
