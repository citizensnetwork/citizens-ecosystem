-- Drop dead `profiles.onboarding_completed` column.
--
-- The static onboarding flow (OnboardingWizard / OnboardingOverlay /
-- /api/onboarding) was removed earlier in the project. The column was
-- left behind as a dead pass-through — read in `/profile/page.tsx`,
-- typed in `Profile`, and set in two seed/test fixtures, but nothing
-- in the live UI ever wrote to it (so it stayed `false` for every
-- user post-removal).
--
-- This migration removes the column. The audit checkpoint
-- (`.audit/surfaces/onboarding.md`) flagged it as Report-only;
-- /audit-polish row 1 promotes it to a clean drop. Re-introducing a
-- re-entry onboarding cue in the future would warrant a new column
-- with a clearer name (e.g. `tour_seen_at`).
--
-- Safe: column has no FK, no index, no trigger reference, and no RLS
-- policy predicate (verified via grep before drop). Idempotent guard
-- so the migration is safe to re-run.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'onboarding_completed'
  ) then
    alter table public.profiles drop column onboarding_completed;
  end if;
end $$;
