-- Migration 063 — Allow admins to update any profile.
--
-- Bug: /api/admin/users PATCH returned 200 "success" but the RLS
-- policy `Users can update own profile` used only `auth.uid() = id`,
-- so admin updates against OTHER users' rows matched zero rows and
-- were silently dropped (PostgREST does not raise on zero-match
-- UPDATE). The API therefore reported success while the DB never
-- changed.
--
-- Fix: add an admin UPDATE policy with matching USING + WITH CHECK.
-- The existing `protect_role_column()` BEFORE trigger still enforces
-- role-change authorisation at the DB level, and the
-- `on_role_change_side_effects()` BEFORE trigger still stamps
-- `force_reauth_at` + `bio_setup_required` on role transitions — we
-- are only unblocking the row-level authorisation.
--
-- Idempotent.

begin;

-- Drop the legacy policy (if present under a prior, non-admin name) so
-- this migration can re-run cleanly.
drop policy if exists "Admins can update any profile" on public.profiles;

create policy "Admins can update any profile"
  on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- Also allow admins to SELECT the columns the list endpoint needs
-- (the existing "Profiles are viewable by everyone" policy already
-- covers this for SELECT — no change required).

commit;
