-- 153_vision_activity_metrics.sql
-- Vision Phase C, per-activity tranche (VISION_BACKEND_WIRING_SPEC §3.2b): the
-- per-Activity Reach / Engagement / Rating reader. This flips the Activities log
-- from demo to live WITHOUT regressing below the demo — a claimed activity shows
-- its REAL Connect reach/engagement/rating; a manually logged (unclaimed)
-- activity has no Connect metrics and honestly shows none (spec §3.2b note).
--
-- Contract (identical to the mig-148 / mig-150 / mig-151 readers):
--   * SECURITY DEFINER, search_path = vision, public, pg_catalog.
--   * Take the VISION org id; gate is_org_member OR is_platform_admin (42501
--     when neither). No connect_contributor_id resolution is needed here: the
--     activity↔event link is vision.cc_event_claims (cv_activity_id → cc_event_id),
--     and cc_event_id IS the Connect event id that keys reach/engagement/
--     ratings_per_event — so the join is direct within the org.
--   * EXECUTE granted to authenticated + service_role (the /api/metrics/activities
--     route calls it with the caller's JWT so the membership gate resolves). Same
--     intentional authenticated-SECDEF class as the mig-148/150/151 readers: this
--     adds ONE by-design advisor WARN (activity_metrics). Document, do not re-flag.
--   * Display Convention #8 (§5): reach ships with impression_count + attending_count;
--     rating ships with review_count — the frontend renders the metric + its
--     supporting counts with no recomputation.
--
-- Returns ONE ROW PER CLAIMED ACTIVITY (an activity with a cc_event_claim in this
-- org). The MVs it reads (reach/engagement/ratings_per_event) are service_role-only;
-- reading them here is safe because a SECURITY DEFINER function runs as its owner —
-- the exact reason the mig-148/151 space readers can read the same MVs. avg_rating
-- stays NULL when an event has no reviews (honest — the frontend shows an em dash).

create or replace function vision.activity_metrics(p_org_id uuid)
returns table (
  activity_id       uuid,
  cc_event_id       uuid,
  reach             integer,
  impression_count  integer,
  attending_count   integer,
  engagement_score  numeric,
  review_count      integer,
  avg_rating        numeric
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    c.cc_event_id,
    coalesce(r.reach, 0)::integer,
    coalesce(r.impression_count, 0)::integer,
    coalesce(r.attending_count, 0)::integer,
    round(coalesce(g.engagement_score, 0), 2),
    coalesce(rt.review_count, 0)::integer,
    rt.avg_rating
  from vision.activities a
  join vision.cc_event_claims c
    on c.cv_activity_id = a.id and c.cv_org_id = p_org_id
  left join vision.reach_per_event r      on r.event_id  = c.cc_event_id
  left join vision.engagement_per_event g on g.event_id  = c.cc_event_id
  left join vision.ratings_per_event rt   on rt.event_id = c.cc_event_id
  where a.org_id = p_org_id;
end;
$$;

revoke all on function vision.activity_metrics(uuid) from public, anon;
grant execute on function vision.activity_metrics(uuid) to authenticated, service_role;
