-- Migration 134: Citizens Vision — period snapshots table (Growth/Retention groundwork)
-- Implements the one remaining shared-DB data point from
-- Citizens_Vision_Backend_Architecture.md: vision.vision_period_snapshots, the
-- table Growth (#4) and Retention (#5) read from. Population (the daily snapshot
-- job, resolved in profiles.timezone) and the growth/retention math live in
-- Vision's application layer — Connect never writes this table.
-- Next migration #: 135

create table if not exists vision.vision_period_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references profiles(id) on delete cascade,
  -- null = whole-org snapshot; non-null = per-Space (same free uuid as
  -- vision.category_space_map.space_id; FK added once vision.spaces exists).
  space_id      uuid,
  period_kind   text not null default 'day' check (period_kind in ('day','week','month')),
  -- Period boundaries are resolved in the org's timezone (profiles.timezone).
  period_start  date not null,
  period_end    date not null,

  -- Reach numerators — stored as COUNTS, not ratios, so Vision can render
  -- "92% (11/12)" without a second query (display convention #8).
  reach_total        integer not null default 0,
  impression_count   integer not null default 0,
  attending_count    integer not null default 0,
  considering_count  integer not null default 0,
  cancellation_count integer not null default 0,

  -- Engagement: the six-component weighted score for this scope/period.
  engagement_score   numeric,

  -- Distinct-person reach (Retention / Reach v2 Tier 2): distinct users across
  -- rsvps + follows + place_follows within the scope.
  distinct_persons   integer not null default 0,

  -- Denominator for ratio displays (e.g. active events in the scope).
  active_events      integer not null default 0,

  created_at         timestamptz not null default now()
);

-- Idempotent upsert key for the daily job. space_id NULL is folded into a
-- single bucket so a whole-org snapshot is unique per (org, kind, period_start).
create unique index if not exists vps_org_space_period_uniq
  on vision.vision_period_snapshots (
    org_id,
    coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_kind,
    period_start
  );

alter table vision.vision_period_snapshots enable row level security;

-- Orgs read their OWN snapshots; admins read all. Mirrors csm_own_write's
-- own/admin model. Writes come from the Vision daily job running as a backend
-- (service_role) identity, which bypasses RLS — there is deliberately NO
-- insert/update/delete policy for org/anon/authenticated roles.
create policy "vps_own_read"
  on vision.vision_period_snapshots
  for select
  using (
    auth.uid() = org_id
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Make the table reachable + writable by the Vision backend (service_role only;
-- never exposed to clients). anon/authenticated are intentionally NOT granted —
-- the org-scoped read path is enabled later when Vision's auth model is
-- confirmed (the vps_own_read policy above already scopes it correctly).
grant usage on schema vision to service_role;
grant select, insert, update, delete on vision.vision_period_snapshots to service_role;

comment on table vision.vision_period_snapshots is
  'Vision-owned per-org (optionally per-Space) period snapshots feeding Growth (#4) and Retention (#5). Populated once per org-day by Vision''s daily snapshot job, resolved in profiles.timezone. Connect never writes this table.';
