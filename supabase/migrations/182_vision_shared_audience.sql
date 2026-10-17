-- 182_vision_shared_audience.sql
-- Vision Phase C, item 15 (VISION_BACKEND_WIRING_SPEC §4.3 + §8): the Community
-- Network Graph — "which organisations share your audience? who could
-- collaborate?" For an org O it lists the other public Contributors whose
-- audience overlaps O's, with how many citizens they share. It is the natural
-- partner-finder for the de-scattering mission (VISION.md; Ephesians 2:19): the
-- Body is stronger when organisations that already serve the same people know it.
--
-- Contract (IDENTICAL class to the mig-148 / 151 / 153 / 154 / 155 / 156 readers):
--   * SECURITY DEFINER, stable, search_path = vision, public, pg_catalog.
--   * Takes the VISION org id. The gate starts with the mandatory null arm
--     (auth.uid() is null OR not a member and not a platform admin → 42501), so a
--     call with no JWT can never skip the check.
--   * Resolves connect_contributor_id + timezone from the mig-142 bridge
--     (vision.organisations ⟕ public.profiles); an unlinked org returns nothing.
--   * EXECUTE authenticated only (the gate needs auth.uid(), so service_role could
--     never pass it); public/anon revoked. This adds exactly ONE by-design
--     authenticated-SECDEF advisor WARN (shared_audience) — the vision
--     authenticated-SECDEF wiring class becomes FIFTEEN. Document, do NOT re-flag.
--   * Display Convention #8 (spec §5): every ratio ships with its num + den.
--
-- PRIVACY (the reason this reader exists in this shape):
--   * It returns ORGANISATIONS and COUNTS only. No citizen id, name, email or
--     avatar ever leaves it. The only profile fields it reads are the public
--     listing identity of an approved Contributor (full_name, logo_url).
--   * A pair is shown only when it shares AT LEAST 3 citizens (c_min_shared). One
--     or two shared people would let an organisation guess who they are; three
--     is the floor below which the number is not shown at all. Raise it, never
--     lower it, without the founder's decision.
--   * Only APPROVED, NOT-HIDDEN Contributors can appear (exactly the ones the public
--     directory shows). A hidden or unapproved listing is never named here.
--
-- DEFINITIONS (documented, honest, conservative — never overclaims):
--   * Window is org-local. Default = trailing 90 days ending yesterday (same lens
--     as cross_pollination: shared audiences move slowly). A caller span is
--     honoured but CAPPED at 366 days (scale guard).
--   * O's audience = vision.org_active_persons(cc, tz, from, to, NULL) — the
--     canonical "who engaged this org" set (rsvps + follows + reviews), reused so
--     the denominator is the exact person set retention_rate() and
--     cross_pollination() use.
--   * A citizen is "shared" with organisation X when they are in O's audience AND
--     engaged X in the window by rsvp or follow (X <> O). Reviews are not used for
--     X: conservative, it can only ever LOWER the overlap.
--   * X's audience (other_audience) = distinct citizens who rsvp'd to X's events or
--     follow X in the window — the denominator for shared_pct_of_other.
--   * ASSOCIATIONAL, not causal: "your engaged citizens also engage X", never "X
--     takes your audience". The screens say so.
--   * rsvps.status is not filtered, like org_active_persons: the canonical
--     audience is the same set everywhere. (A "cancelled" rsvp still counts as
--     engagement here, as it does in every sibling reader.)
--   * Performance rests on existing indexes (rsvps_user_id_idx,
--     events_created_by_date_idx, follows_unique(follower,followee),
--     follows_follower_idx) — no new index needed. At most 25 organisations are
--     returned (p_limit, default 12), and each costs one bounded lookup.

create or replace function vision.shared_audience(
  p_org_id uuid,
  p_from   date    default null,
  p_to     date    default null,
  p_limit  integer default 12
) returns table (
  other_id            uuid,
  other_name          text,
  other_logo_url      text,
  shared_count        integer,
  my_audience         integer,
  other_audience      integer,
  shared_pct_of_mine  numeric,
  shared_pct_of_other numeric,
  period_start        date,
  period_end          date
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc         uuid;
  v_tz         text;
  v_from       date;
  v_to         date;
  v_limit      integer;
  c_min_shared constant integer := 3; -- privacy floor: never show a pair below this
begin
  if auth.uid() is null
     or not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
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

  -- Resolve + bound the window (org-local) and the list length.
  v_to   := coalesce(p_to, (now() at time zone v_tz)::date - 1);
  v_from := coalesce(p_from, v_to - 89);
  if v_from > v_to then
    v_from := v_to; -- degenerate range → single day, never negative
  end if;
  if v_to - v_from > 366 then
    v_from := v_to - 366; -- scale guard: never a full-history scan
  end if;
  v_limit := least(greatest(coalesce(p_limit, 12), 1), 25);

  return query
  with aud as (
    select distinct t.uid
    from vision.org_active_persons(v_cc, v_tz, v_from, v_to, null) as t(uid)
  ),
  aud_n as (
    select count(*)::integer as n from aud
  ),
  touches as (
    -- O's audience citizens' in-window engagements with OTHER organisations
    -- (rsvps + follows). UNION makes each (citizen, organisation) pair distinct.
    select rs.user_id as uid, ev.created_by as org
    from public.rsvps rs
    join public.events ev on ev.id = rs.event_id
    where rs.user_id in (select uid from aud)
      and ev.created_by <> v_cc
      and (rs.created_at at time zone v_tz)::date between v_from and v_to
    union
    select f.follower_id, f.followee_id
    from public.follows f
    where f.follower_id in (select uid from aud)
      and f.followee_id <> v_cc
      and (f.created_at at time zone v_tz)::date between v_from and v_to
  ),
  shared as (
    -- Only public, approved, not-hidden Contributors; only pairs at or above the floor.
    select tc.org, count(*)::integer as n
    from touches tc
    join public.profiles po
      on po.id = tc.org
     and po.role = 'contributor'
     and po.contributor_status = 'approved'
     and not coalesce(po.contributor_hidden, false)
    group by tc.org
    having count(*) >= c_min_shared
  ),
  top as (
    select s.org, s.n
    from shared s
    order by s.n desc, s.org
    limit v_limit
  ),
  their as (
    -- each shown organisation's own in-window audience, distinct citizens
    select tp.org, count(distinct u.uid)::integer as n
    from top tp
    cross join lateral (
      select rs.user_id as uid
      from public.rsvps rs
      join public.events ev on ev.id = rs.event_id
      where ev.created_by = tp.org
        and (rs.created_at at time zone v_tz)::date between v_from and v_to
      union
      select f.follower_id
      from public.follows f
      where f.followee_id = tp.org
        and (f.created_at at time zone v_tz)::date between v_from and v_to
    ) u
    group by tp.org
  )
  select
    tp.org,
    coalesce(nullif(btrim(po.full_name), ''), 'Organisation'),
    po.logo_url,
    tp.n,
    an.n,
    greatest(coalesce(th.n, 0), tp.n), -- they cannot have fewer than the people we share
    case when an.n = 0 then null
         else round(tp.n::numeric / an.n * 100, 1) end,
    case when greatest(coalesce(th.n, 0), tp.n) = 0 then null
         else round(tp.n::numeric / greatest(coalesce(th.n, 0), tp.n) * 100, 1) end,
    v_from,
    v_to
  from top tp
  join public.profiles po on po.id = tp.org
  cross join aud_n an
  left join their th on th.org = tp.org
  order by tp.n desc, po.full_name, tp.org;
end;
$$;

revoke all on function vision.shared_audience(uuid, date, date, integer) from public, anon;
grant execute on function vision.shared_audience(uuid, date, date, integer) to authenticated;
