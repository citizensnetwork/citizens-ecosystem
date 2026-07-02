-- ============================================================================
-- 145_wear_admin_moderation.sql  — ⛔ DRAFT, NOT APPLIED
--
-- Closes the Wear admin/moderation gap (ECOSYSTEM_PROFILE_LEVELS.md §5;
-- decision brief §6 row 4b). Adds the assigned-authority moderator/admin
-- tier, a reports triage lifecycle, and moderator takedown policies.
--
-- ⛔ Founder confirmation REQUIRED before applying. Apply protocol
-- (SHARED_DB_CONTRACT R7): pre-apply git tag → move this file to
-- supabase/migrations/145_wear_admin_moderation.sql (renumber if Connect
-- shipped a later migration first) → apply_migration on xyiajtrvhlxaeplsiajj
-- → get_advisors(security) = 0 ERROR / 0 new findings → stamp contract §9.
--
-- Design notes (why this shape — ECOSYSTEM_PROFILE_LEVELS.md P2.1–P2.3):
--  * SEPARATE service_role-managed table, not a role column on wear.users:
--    wear.users is self-updatable (users_self_update), so a role column
--    would need Connect's protect_role_column trigger machinery. A table
--    with NO insert/update/delete policy gives the same no-self-escalation
--    guarantee structurally.
--  * admin ⊇ moderator: is_moderator() returns true for both roles.
--  * DMs (wear.messages) get NO moderator policy on purpose — private
--    content stays service_role-only (moderators must not gain reach into
--    conversations they aren't members of).
-- ============================================================================

-- ── 1. Roles (assigned authority; service_role-managed) ─────────────────────
create type wear.platform_role as enum ('moderator', 'admin');

create table wear.user_roles (
  user_id    uuid not null references wear.users(id) on delete cascade,
  role       wear.platform_role not null,
  granted_by uuid references wear.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table wear.user_roles enable row level security;
-- Self-visibility only. Deliberately NO insert/update/delete policy: grants
-- are issued exclusively by service_role (founder via MCP/SQL until an admin
-- UI exists), which bypasses RLS. This is the P2.2 no-self-escalation wall.
create policy user_roles_self_read on wear.user_roles
  for select using (auth.uid() = user_id);

-- ── 2. Capability helpers (mig 143/144 SECDEF conventions) ──────────────────
create or replace function wear.is_moderator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from wear.user_roles r
    where r.user_id = auth.uid()
  );
$$;
revoke all on function wear.is_moderator() from public;
grant execute on function wear.is_moderator() to authenticated, service_role;

create or replace function wear.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from wear.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'admin'
  );
$$;
revoke all on function wear.is_admin() from public;
grant execute on function wear.is_admin() to authenticated, service_role;

-- ── 3. Reports triage lifecycle ──────────────────────────────────────────────
create type wear.report_status as enum ('open', 'reviewed', 'actioned', 'dismissed');

alter table wear.reports
  add column status     wear.report_status not null default 'open',
  add column handled_by uuid references wear.users(id) on delete set null,
  add column handled_at timestamptz;

create index reports_status_idx on wear.reports(status, created_at desc);

-- Moderators read the queue and record triage outcomes. (Reporter INSERT
-- policy from mig 143 is unchanged; there is still no anon/self SELECT —
-- reporters cannot enumerate other users' reports.)
create policy reports_moderator_read on wear.reports
  for select using (wear.is_moderator());
create policy reports_moderator_triage on wear.reports
  for update using (wear.is_moderator()) with check (wear.is_moderator());

-- ── 4. Takedown policies (public content only; DMs excluded on purpose) ─────
create policy posts_moderator_delete on wear.posts
  for delete using (wear.is_moderator());
create policy comments_moderator_delete on wear.comments
  for delete using (wear.is_moderator());
create policy stories_moderator_delete on wear.stories
  for delete using (wear.is_moderator());
-- post_media / likes / comment_likes / saved_posts / story_views /
-- story_reactions cascade via their FKs — no extra policies needed.

-- ============================================================================
-- Post-apply checklist:
--  * get_advisors(security) = 0 ERROR, 0 new findings vs mig-144 baseline
--    (72 WARN / 3 INFO). The two new SECDEF fns will surface as the usual
--    intentional `authenticated_security_definer_function_executable` WARNs.
--  * Smoke: non-moderator SELECT on wear.reports → 0 rows; non-moderator
--    DELETE on another user's post → 0 rows affected; moderator (after a
--    service_role grant into wear.user_roles) can read reports + update
--    status; user_roles INSERT as authenticated → RLS denial.
--  * Update SHARED_DB_CONTRACT §9 (tables 22→23, policies 42→47, fns 7→9,
--    enums 10→12) + ECOSYSTEM_PROFILE_LEVELS §4/§5 (Wear Admin ✅).
--  * Wear app follow-up: /api/admin/* routes gated on wear.is_moderator().
-- ============================================================================
