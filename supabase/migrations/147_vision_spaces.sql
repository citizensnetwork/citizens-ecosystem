-- 147_vision_spaces.sql
-- Vision Phase A.1 (VISION_BACKEND_WIRING_SPEC §3.5a / §8): the vision.spaces
-- table — org-defined groupings of activity (department, ministry, product
-- line, programme — universal, org-type-agnostic). Unblocks Space-level
-- analytics (§3.5b) and the Configure Spaces surface (build plan §3).
--
-- Also FK-wires the two tables that have carried a dangling space_id since
-- migrations 133/134 (both verified EMPTY on 2026-07-03, so the constraints
-- add cleanly), and adds the day-snapshot dedup indexes migration 148's
-- snapshot job relies on.
--
-- Identity note: vision.spaces.org_id references vision.organisations(id)
-- (the app-world org identity; RBAC fns key on it). category_space_map.org_id
-- and vision_period_snapshots.org_id reference public.profiles(id) (the
-- Connect contributor identity) — the two are bridged by
-- vision.organisations.connect_contributor_id (migration 142).

create table vision.spaces (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references vision.organisations(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  description text,
  colour      text not null default '#4a90d9',
  icon        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, name)
);

create index idx_spaces_org on vision.spaces(org_id);

create trigger trg_spaces_updated_at
  before update on vision.spaces
  for each row execute function vision.update_updated_at_column();

alter table vision.spaces enable row level security;

create policy spaces_select_member on vision.spaces
  for select using (vision.is_org_member(org_id) or vision.is_platform_admin());

create policy spaces_insert_admin on vision.spaces
  for insert to authenticated
  with check (vision.is_org_admin(org_id) or vision.is_platform_admin());

create policy spaces_update_admin on vision.spaces
  for update using (vision.is_org_admin(org_id) or vision.is_platform_admin())
  with check (vision.is_org_admin(org_id) or vision.is_platform_admin());

create policy spaces_delete_admin on vision.spaces
  for delete using (vision.is_org_admin(org_id) or vision.is_platform_admin());

-- Same grant pattern as the rest of vision.* (mig 137): authenticated gets
-- DML, RLS is the isolation wall; service_role bypasses RLS for jobs.
grant select, insert, update, delete on vision.spaces to authenticated;
grant all on vision.spaces to service_role;

-- ── FK wiring (spec §3.5a) ─────────────────────────────────────────────
alter table vision.category_space_map
  add constraint fk_csm_space
  foreign key (space_id) references vision.spaces(id) on delete cascade;

alter table vision.vision_period_snapshots
  add constraint fk_vps_space
  foreign key (space_id) references vision.spaces(id) on delete set null;

-- ── Day-snapshot dedup (structural idempotency for mig 148's cron) ─────
-- Partial pair because NULL space_id (whole-org row) never collides under a
-- plain unique constraint.
create unique index uq_vps_org_period_whole
  on vision.vision_period_snapshots(org_id, period_kind, period_start)
  where space_id is null;

create unique index uq_vps_org_period_space
  on vision.vision_period_snapshots(org_id, period_kind, period_start, space_id)
  where space_id is not null;
