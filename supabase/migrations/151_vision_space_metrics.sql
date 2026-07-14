-- 151_vision_space_metrics.sql
-- Vision Phase B/C, space-level tranche (VISION_BACKEND_WIRING_SPEC §3.4a /
-- §3.4d / §3.5b / §8 item (a)): the per-Space Reach and Engagement readers
-- plus a Space-mapping writer. These flip the Spaces DIRECTORY (per-space
-- reach / people / activities / trend) and the Configure Spaces category→space
-- mapping surface from demo to live WITHOUT regressing below the demo — the
-- reason space metrics ship before the Spaces CRUD wiring (a live directory
-- with no space numbers would read worse than the sample data it replaces).
--
-- Contract (identical to the mig-148 / mig-150 readers):
--   * SECURITY DEFINER, search_path = vision, public, pg_catalog.
--   * Take the VISION org id; gate is_org_member/is_org_admin OR
--     is_platform_admin (42501 when neither). Resolve connect_contributor_id
--     (mig 142 bridge) + timezone internally. An UNLINKED org still lists its
--     spaces (with honest zero metrics) rather than returning nothing — the
--     directory must always render every space.
--   * EXECUTE granted to authenticated + service_role (the /api/spaces route
--     calls them with the caller's JWT so the membership gate resolves). Same
--     intentional authenticated-SECDEF class as the six mig-148/150 readers:
--     this adds THREE by-design advisor WARNs (2 readers + 1 writer). Document,
--     do not re-flag.
--   * Display Convention #8 (§5): every count that forms a numerator/denominator
--     is returned alongside, so the frontend renders "N reach / M people" and
--     the per-space conversion evidence without recomputation.
--
-- Design deviation from the spec §3.4a sketch (reach_per_space(org, SPACE, ...)):
--   these return ONE ROW PER SPACE for the whole org in a single call, because
--   the Spaces directory renders every space at once — one RPC beats N calls
--   (VISION.md litmus #5, efficiency). A single-space view is the caller
--   filtering the result. Every space is LEFT-JOINed from vision.spaces so a
--   space with no mapped categories / no events still appears with real zeros.
--
-- Join shape mirrors mig 148's per-space snapshot block (the authoritative
-- precedent): spaces → category_space_map (space_id, org_id = cc) → events
-- (category_id, created_by = cc, status='published', org-local date window in
-- the JOIN so zero-event spaces survive) → reach_per_event / engagement_per_event
-- by event_id. distinct persons reuse vision.org_active_persons (mig 148) with
-- the space filter; follows are org-level so they are excluded from a space's
-- person set (the helper already enforces this).
--
-- Window semantics: p_from / p_to NULL = all-time (the directory shows a space's
-- cumulative reach + total distinct people). distinct_persons defaults the
-- helper window to [1970-01-01, org-today] so an unbounded call still counts
-- everyone (the helper treats NULL bounds as "no match", so we never pass NULL).

-- ── 1. Space-level Reach (spec §3.4a / §3.5b) ───────────────────────────
create or replace function vision.reach_per_space(
  p_org_id uuid,
  p_from   date default null,
  p_to     date default null
) returns table (
  space_id           uuid,
  space_name         text,
  total_reach        bigint,
  impression_total   bigint,
  attending_total    bigint,
  considering_total  bigint,
  cancellation_total bigint,
  distinct_persons   integer,
  event_count        integer,
  avg_reach          numeric
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
  v_tz text;
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

  -- Bounded window for the distinct-person helper (it treats NULL as no-match).
  v_from := coalesce(p_from, date '1970-01-01');
  v_to   := coalesce(p_to, (now() at time zone coalesce(v_tz, 'Africa/Johannesburg'))::date);

  return query
  select
    s.id,
    s.name,
    coalesce(sum(r.reach), 0)::bigint,
    coalesce(sum(r.impression_count), 0)::bigint,
    coalesce(sum(r.attending_count), 0)::bigint,
    coalesce(sum(r.considering_count), 0)::bigint,
    coalesce(sum(r.cancellation_count), 0)::bigint,
    case when v_cc is null then 0
         else (select count(*)::integer
                 from vision.org_active_persons(v_cc, v_tz, v_from, v_to, s.id)) end,
    count(distinct e.id)::integer,
    round(coalesce(avg(r.reach), 0), 2)
  from vision.spaces s
  left join vision.category_space_map csm
    on csm.space_id = s.id and csm.org_id = v_cc
  left join public.events e
    on e.category_id = csm.category_id
   and e.created_by = v_cc
   and e.status = 'published'
   and (p_from is null or (e.date at time zone v_tz)::date >= p_from)
   and (p_to   is null or (e.date at time zone v_tz)::date <= p_to)
  left join vision.reach_per_event r on r.event_id = e.id
  where s.org_id = p_org_id
  group by s.id, s.name
  order by s.name;
end;
$$;

revoke all on function vision.reach_per_space(uuid, date, date) from public, anon;
grant execute on function vision.reach_per_space(uuid, date, date) to authenticated, service_role;

-- ── 2. Space-level Engagement (spec §3.4d / §3.5b) ──────────────────────
-- engagement_score = AVG of per-event scores (bounded 0-100). followers are
-- deliberately absent: a follow is an org-level signal, not attributable to a
-- space. top_component = the space-relevant component (of 5, no followers) with
-- the largest average weighted contribution, for the narrative {topComponent}.
create or replace function vision.engagement_per_space(
  p_org_id uuid,
  p_from   date default null,
  p_to     date default null
) returns table (
  space_id          uuid,
  space_name        text,
  attending_total   bigint,
  considering_total bigint,
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

  return query
  select
    s.id,
    s.name,
    coalesce(sum(g.attending), 0)::bigint,
    coalesce(sum(g.considering), 0)::bigint,
    coalesce(sum(g.reviews), 0)::bigint,
    coalesce(sum(g.broadcasts), 0)::bigint,
    coalesce(sum(g.event_updates), 0)::bigint,
    round(coalesce(avg(g.engagement_score), 0), 2),
    count(distinct e.id)::integer,
    (select v.comp from (values
       ('attending',   coalesce(avg(least(g.attending, 100)) * 0.35, 0)),
       ('considering', coalesce(avg(least(g.considering, 100)) * 0.20, 0)),
       ('reviews',     coalesce(avg(least(g.reviews * 10, 100)) * 0.10, 0)),
       ('broadcasts',  coalesce(avg(least(g.broadcasts * 5, 100)) * 0.10, 0)),
       ('updates',     coalesce(avg(least(g.event_updates * 5, 100)) * 0.10, 0))
     ) as v(comp, w)
     order by v.w desc, v.comp
     limit 1)
  from vision.spaces s
  left join vision.category_space_map csm
    on csm.space_id = s.id and csm.org_id = v_cc
  left join public.events e
    on e.category_id = csm.category_id
   and e.created_by = v_cc
   and e.status = 'published'
   and (p_from is null or (e.date at time zone v_tz)::date >= p_from)
   and (p_to   is null or (e.date at time zone v_tz)::date <= p_to)
  left join vision.engagement_per_event g on g.event_id = e.id
  where s.org_id = p_org_id
  group by s.id, s.name
  order by s.name;
end;
$$;

revoke all on function vision.engagement_per_space(uuid, date, date) from public, anon;
grant execute on function vision.engagement_per_space(uuid, date, date) to authenticated, service_role;

-- ── 3. Category → Space mapping writer (spec §3.5a / §3.10) ─────────────
-- The Configure Spaces mapping UI assigns each Connect category to at most one
-- Space (single-select). vision.category_space_map's own RLS only lets the
-- account whose auth.uid() = org_id (the Connect contributor / link owner)
-- write rows — so a non-owner org_admin could not map through the user client.
-- This SECDEF writer gates on is_org_admin(VISION org id) instead and resolves
-- the contributor id internally, so ANY admin of the linked org can manage
-- mappings (intuitive service — VISION.md litmus). p_space_id NULL clears the
-- category's mapping. The space must belong to the org (forged ids are inert).
create or replace function vision.set_category_space(
  p_org_id      uuid,
  p_category_id uuid,
  p_space_id    uuid default null
) returns void
language plpgsql volatile security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
begin
  if not (vision.is_org_admin(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select o.connect_contributor_id into v_cc
  from vision.organisations o
  where o.id = p_org_id;

  if v_cc is null then
    raise exception 'organisation is not linked to Connect' using errcode = '22023';
  end if;

  -- Single-select: clear any existing mapping for this org+category first.
  delete from vision.category_space_map
  where org_id = v_cc and category_id = p_category_id;

  -- Assign, only if the target space belongs to this org (else leave cleared).
  if p_space_id is not null then
    if not exists (
      select 1 from vision.spaces s where s.id = p_space_id and s.org_id = p_org_id
    ) then
      raise exception 'space does not belong to organisation' using errcode = '22023';
    end if;
    insert into vision.category_space_map (org_id, category_id, space_id)
    values (v_cc, p_category_id, p_space_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function vision.set_category_space(uuid, uuid, uuid) from public, anon;
grant execute on function vision.set_category_space(uuid, uuid, uuid) to authenticated, service_role;
