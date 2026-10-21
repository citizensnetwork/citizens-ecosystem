-- ════════════════════════════════════════════════════════════════════
--  197_service_areas_anon_read: a fix to migration 195's three read policies.
--
--  APPLIED 2026-10-21 through MCP apply_migration as `197_service_areas_anon_read` (remote version 20261021205449), on Stephen's
--  yes in chat naming this file (pre-apply tag `connect-pre-mig197-service-areas-anon-read`). The statements applied are this
--  file's, with the comments left out. The number is 197 because another session applied `196_listing_claim_verify_first` first.
--  Rollback-only probe docs/audit/probes/195_service_areas.probe.sql is the probe for 195 and 197 together: run live AFTER this
--  apply, every line PASSed and nothing persisted (26 areas, no links, no probe users left). Security advisor after: unchanged
--  from after 195 (0 ERROR / 142 WARN / 3 INFO).
--
--  WHAT WENT WRONG IN 195. The three link-table SELECT policies (contributor_service_areas, contributor_service_radius,
--  contributor_service_presence) were written as one policy "for select using (live listing OR own row OR is_active_team_member(...)
--  OR is_admin())". Since migration 193, `anon` cannot EXECUTE is_active_team_member (by design). When `anon` reads a link
--  row that is not for a live listing (a hidden or pending Contributor), the third arm is evaluated and Postgres raises
--  `42501 permission denied for function is_active_team_member`, so the public globe read (serving_area_listings runs as the
--  caller) would error instead of returning the list. Found by the rollback-only probe run on the live objects right after the
--  apply (2026-10-21). It was not seen before because the scratch database used for the dry run let anon execute the helper.
--  Impact until this file is applied: none for users. The link tables are empty (no Contributor has chosen an area) and no UI
--  or deployed route reads them yet.
--
--  THE FIX. Split each policy by role, so the helper is never in a policy `anon` evaluates:
--   * `to anon`:          only the approval wall (a live listing: approved, not hidden, not deleted).
--   * `to authenticated`: the approval wall, OR the caller's own row, OR an active team member, OR an admin (as before).
--  Nothing else changes: same tables, same grants (SELECT only), same functions. Expected advisor change: none (the policies
--  are on different roles, so no "multiple permissive policies" finding is added).
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── contributor_service_areas ─────────────────────────────────────────
drop policy contributor_service_areas_select on public.contributor_service_areas;

create policy contributor_service_areas_select_public on public.contributor_service_areas
  for select to anon
  using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_areas.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
  );

create policy contributor_service_areas_select_signed_in on public.contributor_service_areas
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_areas.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
    or contributor_id = (select auth.uid())
    or public.is_active_team_member(contributor_id, array['editor', 'viewer'])
    or (select public.is_admin())
  );

-- ── contributor_service_radius ────────────────────────────────────────
drop policy contributor_service_radius_select on public.contributor_service_radius;

create policy contributor_service_radius_select_public on public.contributor_service_radius
  for select to anon
  using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_radius.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
  );

create policy contributor_service_radius_select_signed_in on public.contributor_service_radius
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_radius.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
    or contributor_id = (select auth.uid())
    or public.is_active_team_member(contributor_id, array['editor', 'viewer'])
    or (select public.is_admin())
  );

-- ── contributor_service_presence ──────────────────────────────────────
drop policy contributor_service_presence_select on public.contributor_service_presence;

create policy contributor_service_presence_select_public on public.contributor_service_presence
  for select to anon
  using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_presence.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
  );

create policy contributor_service_presence_select_signed_in on public.contributor_service_presence
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = contributor_service_presence.contributor_id
        and p.role = 'contributor' and p.contributor_status = 'approved'
        and coalesce(p.contributor_hidden, false) = false and p.deleted_at is null
    )
    or contributor_id = (select auth.uid())
    or public.is_active_team_member(contributor_id, array['editor', 'viewer'])
    or (select public.is_admin())
  );

commit;

-- Rollback (restores 195's single policies, which have the anon defect described above):
--   drop policy contributor_service_areas_select_public on public.contributor_service_areas;
--   drop policy contributor_service_areas_select_signed_in on public.contributor_service_areas;
--   (the same pair for contributor_service_radius and contributor_service_presence), then re-create the three
--   `<table>_select` policies from 195_service_areas.sql sections 2 and 3.
