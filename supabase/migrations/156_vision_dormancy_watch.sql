-- 156_vision_dormancy_watch.sql
-- Vision Phase C, item 14 (VISION_BACKEND_WIRING_SPEC §4.5 + §8): the
-- Dormancy / Churn early-warning reader — the guardian complement to the
-- Cross-Pollination Index (mig 155). Cross-pollination measures the Body
-- coming TOGETHER (citizens discovering new organisations); dormancy watches
-- for a member of the Body going QUIET so the community can respond before a
-- fellow contributor fades unseen. This is VISION.md made operational:
-- "make the unseen seen", "honour every role player equally", and honour the
-- SMALL — a small contributor going silent is exactly whom we surface, never
-- bury (litmus #3).
--
-- SUBJECT (founder decision, 2026-07-04): "orbit contributors" — the OTHER
-- Christian organisations that THIS org's own engaged audience connects with
-- (rsvps + follows), flagging which of those neighbours have stopped posting
-- events / broadcasts for longer than a threshold. Per-org, actionable
-- ("an organisation your community also follows has gone quiet — reach out,
-- collaborate, or cover the gap"), and it uses exactly §4.5's stated source
-- (events.created_at + broadcast_messages.created_at, which only orgs author).
-- It is distinct from §4.3 network graph (who to PARTNER with, by shared
-- audience) — this answers who in your orbit is FADING (a recency alarm).
--
-- Contract (IDENTICAL class to the mig-148 / 151 / 153 / 154 / 155 readers):
--   * SECURITY DEFINER, stable, search_path = vision, public, pg_catalog.
--   * Take the VISION org id; gate is_org_member OR is_platform_admin (42501).
--   * Resolve connect_contributor_id + timezone from the mig-142 bridge
--     (vision.organisations ⟕ public.profiles); an unlinked org returns nothing.
--   * EXECUTE authenticated + service_role (called with the caller's JWT so the
--     membership gate resolves via auth.uid()); anon/public revoked. Adds
--     exactly ONE by-design authenticated-SECDEF advisor WARN (dormancy_watch)
--     — the vision authenticated-SECDEF wiring class becomes FOURTEEN. Document,
--     do NOT re-flag.
--   * Display Convention #8 (spec §5): the dormant ratio ships with num + den
--     (dormant_count / orbit_size).
--
-- NO PII: this reader reads rsvps / follows / events / broadcast_messages, and
-- the ONLY join to public.profiles reads `role` (to keep "organisations" true:
-- an orbit member must be a role='contributor' profile) — never full_name /
-- email / avatar_url. The dormant contributors' PUBLIC display names are
-- resolved app-side from Connect's display-safe contributor directory
-- (/api/v1/profiles/{id}, SHARED_DB_CONTRACT R2), so nothing here needs
-- hand-picking against R2. (Contrast mig 154, which deliberately reads
-- display-safe profile identity for an org's OWN members.)
--
-- DEFINITIONS (documented, honest, conservative):
--   * Window is org-local. The AUDIENCE + ORBIT are formed over the trailing
--     p_lookback_days (default 180, clamped 30..366 — a recent enough lens that
--     "your community" means the current community, and a scale guard that keeps
--     this off a full-history scan). p_from / p_to are NOT exposed: dormancy is a
--     "right now" question, not a historical range.
--   * Audience = vision.org_active_persons(cc, tz, lookback_from, today, NULL) —
--     the exact same engaged-person set retention_rate() / cross_pollination()
--     use (rsvps + follows + reviews).
--   * Orbit = distinct role='contributor' profiles X (X <> this org) that any
--     audience member rsvp'd or followed inside the lookback window — mirrors
--     mig 155's `inwin` CTE exactly. Reviewers sit in the audience but review is
--     not an orbit-forming channel (conservative — can only ever shrink the orbit).
--   * last_activity(X) = GREATEST(latest published event.created_at by X, latest
--     non-deleted broadcast_messages.created_at by X). GREATEST ignores NULLs, so
--     an org with events but no broadcasts still resolves. An org with NEITHER →
--     NULL → it was never "previously active" → excluded from the denominator
--     (§4.5 measures orgs that HAVE gone quiet, not orgs that never spoke).
--   * threshold: p_threshold_days (default 60 per §4.5's example, clamped 1..365).
--     Dormant = last_activity older than threshold days ago (org-local). days_quiet
--     = today − last_activity date.
--
-- ASSOCIATIONAL, not causal: the surfaces frame it as "an organisation your
-- community engages with has gone quiet", never "you caused". Performance rests
-- on existing indexes (rsvps_user_id_idx, follows_follower_idx, follows_unique,
-- events_created_by_date_idx) plus small per-orbit-org indexed max() lookups —
-- no new index needed.

create or replace function vision.dormancy_watch(
  p_org_id         uuid,
  p_threshold_days integer default 60,
  p_lookback_days  integer default 180
) returns table (
  threshold_days integer,
  orbit_size     integer,
  dormant_count  integer,
  dormant_pct    numeric,
  max_days_quiet integer,
  dormant_ids    uuid[],
  period_start   date,
  period_end     date
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc     uuid;
  v_tz     text;
  v_thr    integer;
  v_look   integer;
  v_today  date;
  v_from   date;
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
    return; -- org not linked to Connect yet → no orbit to watch
  end if;

  -- Clamp the tunables (forged / out-of-range values fall back to defaults).
  v_thr  := coalesce(nullif(p_threshold_days, 0), 60);
  if v_thr < 1   then v_thr := 60;  end if;
  if v_thr > 365 then v_thr := 365; end if;
  v_look := coalesce(nullif(p_lookback_days, 0), 180);
  if v_look < 30  then v_look := 30;  end if;
  if v_look > 366 then v_look := 366; end if;

  v_today := (now() at time zone v_tz)::date;
  v_from  := v_today - (v_look - 1);

  return query
  with aud as (
    -- this org's engaged audience over the lookback window
    select distinct t.uid
    from vision.org_active_persons(v_cc, v_tz, v_from, v_today, null) as t(uid)
  ),
  orbit as (
    -- OTHER contributor orgs the audience connected with in the window
    -- (rsvps + follows; role='contributor', X <> this org) — mig-155 `inwin`.
    select rs.user_id as uid, ev.created_by as org
    from public.rsvps rs
    join public.events ev on ev.id = rs.event_id
    join public.profiles po on po.id = ev.created_by and po.role = 'contributor'
    where rs.user_id in (select uid from aud)
      and ev.created_by <> v_cc
      and (rs.created_at at time zone v_tz)::date between v_from and v_today
    union
    select f.follower_id, f.followee_id
    from public.follows f
    join public.profiles pf on pf.id = f.followee_id and pf.role = 'contributor'
    where f.follower_id in (select uid from aud)
      and f.followee_id <> v_cc
      and (f.created_at at time zone v_tz)::date between v_from and v_today
  ),
  orbit_orgs as (
    select distinct org from orbit
  ),
  last_act as (
    -- previously-active orbit orgs + their most recent public activity
    select
      oo.org,
      (greatest(
        (select max(e.created_at) from public.events e
           where e.created_by = oo.org and e.status = 'published'),
        (select max(b.created_at) from public.broadcast_messages b
           where b.contributor_id = oo.org and b.deleted_at is null)
      ) at time zone v_tz)::date as last_day
    from orbit_orgs oo
  ),
  active_orbit as (
    -- denominator: orbit orgs that were EVER active (spoke at least once)
    select org, last_day, (v_today - last_day) as days_quiet
    from last_act
    where last_day is not null
  ),
  dormant as (
    -- numerator: gone quiet longer than the threshold
    select org, days_quiet
    from active_orbit
    where days_quiet > v_thr
  )
  select
    v_thr,
    (select count(*) from active_orbit)::integer,
    (select count(*) from dormant)::integer,
    case when (select count(*) from active_orbit) = 0 then null
         else round((select count(*) from dormant)::numeric
                    / (select count(*) from active_orbit) * 100, 1) end,
    (select max(days_quiet) from dormant)::integer,
    coalesce(
      (select array_agg(d.org order by d.days_quiet desc)
       from (select org, days_quiet from dormant
             order by days_quiet desc limit 20) d),
      '{}'::uuid[]
    ),
    v_from,
    v_today;
end;
$$;

revoke all on function vision.dormancy_watch(uuid, integer, integer) from public, anon;
grant execute on function vision.dormancy_watch(uuid, integer, integer) to authenticated, service_role;
