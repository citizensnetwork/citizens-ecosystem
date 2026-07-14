-- 155_vision_cross_pollination.sql
-- Vision Phase C, item 13 (VISION_BACKEND_WIRING_SPEC §4.2 + §8): the
-- Cross-Pollination Index — the single most VISION-central measurement in the
-- platform. It answers "are citizens discovering NEW organisations over time?"
-- and so directly measures "de-scattering the Body of Christ" (VISION.md core
-- mission; Ephesians 2:19 — "no longer strangers and foreigners, but fellow
-- citizens"). For an org O it reports, across O's engaged audience, how many of
-- those citizens connected in the window with an organisation they had NEVER
-- engaged with before — the associational discovery signal.
--
-- Contract (IDENTICAL class to the mig-148 / 151 / 153 / 154 readers):
--   * SECURITY DEFINER, stable, search_path = vision, public, pg_catalog.
--   * Take the VISION org id; gate is_org_member OR is_platform_admin (42501).
--   * Resolve connect_contributor_id + timezone from the mig-142 bridge
--     (vision.organisations ⟕ public.profiles); an unlinked org returns nothing.
--   * EXECUTE authenticated + service_role (called with the caller's JWT so the
--     membership gate resolves via auth.uid()); anon/public revoked. This adds
--     exactly ONE by-design authenticated-SECDEF advisor WARN (cross_pollination)
--     — the vision authenticated-SECDEF wiring class becomes THIRTEEN. Document,
--     do NOT re-flag.
--   * Display Convention #8 (spec §5): every ratio ships with its num + den.
--
-- NO PII: this reader touches only rsvps / follows / events. The single join to
-- public.profiles reads `role` (to identify organisations) and, via the bridge
-- resolve, `timezone` — never full_name / email / avatar_url. (Contrast mig 154,
-- which deliberately reads display-safe profile identity.) So there is nothing
-- to hand-pick against R2 here.
--
-- DEFINITIONS (documented, honest, conservative — never overclaims):
--   * Window is org-local. Default = trailing 90 days ending yesterday (discovery
--     is slower than attendance, so a 90-day lens carries more signal than a
--     month). A caller span is honoured but CAPPED at 366 days so a forged
--     all-time range cannot turn this into a full-history scan (scale guard).
--   * Audience = vision.org_active_persons(cc, tz, from, to, NULL) — the canonical
--     "who engaged this org" set (rsvps + follows + reviews), reused so the
--     audience denominator is the exact same person set retention_rate() uses.
--   * Discovery signal = rsvps + follows only (per §4.2). "Engaged with entity X"
--     uses the ACT time — rsvp.created_at / follows.created_at (org-local) — which
--     matches org_active_persons; a discovery is when the citizen's FIRST-EVER
--     engagement with X falls inside the window (NOT EXISTS any engagement with X
--     before `from`).
--   * A discovered "organisation" X must be a public.profiles row with
--     role = 'contributor' and X <> this org. That keeps the metric true to the
--     "organisations" copy and to Vision's identity model (org = contributor):
--     it excludes citizen↔citizen follows, citizen-hosted community events, and
--     platform staff (admin). Conservative: it can only ever LOWER the rate.
--   * Reviewers sit in the audience (via org_active_persons) but review is not a
--     discovery channel — a reviewer who did not also rsvp/follow a new org simply
--     contributes 0, which is the honest, conservative direction.
--
-- This is ASSOCIATIONAL (audience-scoped discovery), NOT strict causal
-- attribution — the surfaces frame it as "your engaged citizens discovered",
-- never "your events caused". Performance rests on existing indexes
-- (rsvps_user_id_idx, events_created_by_date_idx, follows_unique(follower,followee),
-- follows_follower_idx) — no new index needed.

create or replace function vision.cross_pollination(
  p_org_id uuid,
  p_from   date default null,
  p_to     date default null
) returns table (
  audience_size            integer,
  citizens_discovering     integer,
  new_connections          integer,
  distinct_new_orgs        integer,
  discovery_rate_pct       numeric,
  avg_new_orgs_per_citizen numeric,
  period_start             date,
  period_end               date
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc   uuid;
  v_tz   text;
  v_from date;
  v_to   date;
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
    return; -- org not linked to Connect yet → no audience to measure
  end if;

  -- Resolve + bound the window (org-local).
  v_to   := coalesce(p_to, (now() at time zone v_tz)::date - 1);
  v_from := coalesce(p_from, v_to - 89);
  if v_from > v_to then
    v_from := v_to; -- degenerate range → single day, never negative
  end if;
  if v_to - v_from > 366 then
    v_from := v_to - 366; -- scale guard: never a full-history scan
  end if;

  return query
  with aud as (
    -- O's audience: the canonical org_active_persons set (rsvps+follows+reviews).
    select distinct t.uid
    from vision.org_active_persons(v_cc, v_tz, v_from, v_to, null) as t(uid)
  ),
  inwin as (
    -- audience citizens' in-window engagements with OTHER organisations
    -- (contributor profiles, X <> this org) via rsvps + follows. Distinct (uid,org).
    select rs.user_id as uid, ev.created_by as org
    from public.rsvps rs
    join public.events ev on ev.id = rs.event_id
    join public.profiles po on po.id = ev.created_by and po.role = 'contributor'
    where rs.user_id in (select uid from aud)
      and ev.created_by <> v_cc
      and (rs.created_at at time zone v_tz)::date between v_from and v_to
    union
    select f.follower_id, f.followee_id
    from public.follows f
    join public.profiles pf on pf.id = f.followee_id and pf.role = 'contributor'
    where f.follower_id in (select uid from aud)
      and f.followee_id <> v_cc
      and (f.created_at at time zone v_tz)::date between v_from and v_to
  ),
  new_pairs as (
    -- keep only pairs where the citizen had NO engagement with that org before
    -- the window start → a genuinely NEW organisation for them (first-ever touch
    -- inside the window). inwin is already distinct (uid,org) via UNION.
    select iw.uid, iw.org
    from inwin iw
    where not exists (
      select 1 from public.rsvps r2
      join public.events e2 on e2.id = r2.event_id
      where r2.user_id = iw.uid and e2.created_by = iw.org
        and (r2.created_at at time zone v_tz)::date < v_from
    )
    and not exists (
      select 1 from public.follows f2
      where f2.follower_id = iw.uid and f2.followee_id = iw.org
        and (f2.created_at at time zone v_tz)::date < v_from
    )
  ),
  agg as (
    select
      (select count(*) from aud)::integer as aud_n,
      count(distinct np.uid)::integer     as disc_n,
      count(*)::integer                   as conn_n,
      count(distinct np.org)::integer     as org_n
    from new_pairs np
  )
  select
    agg.aud_n,
    agg.disc_n,
    agg.conn_n,
    agg.org_n,
    case when agg.aud_n = 0 then null
         else round(agg.disc_n::numeric / agg.aud_n * 100, 1) end,
    case when agg.aud_n = 0 then null
         else round(agg.conn_n::numeric / agg.aud_n, 2) end,
    v_from,
    v_to
  from agg;
end;
$$;

revoke all on function vision.cross_pollination(uuid, date, date) from public, anon;
grant execute on function vision.cross_pollination(uuid, date, date) to authenticated, service_role;
