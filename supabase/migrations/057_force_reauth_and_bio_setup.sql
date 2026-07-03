-- Migration 057 — Batch E: force re-login + contributor bio setup gate
--
-- Adds two scalar columns to `profiles`:
--
--   force_reauth_at      — bumped by admin when a user's role changes.
--                          Middleware compares this to the session
--                          `iat`; if force_reauth_at > iat the session
--                          is signed out and the user must log in again
--                          so that their JWT + RLS context reflect the
--                          new role.
--   bio_setup_required   — flipped to TRUE on citizen→contributor
--                          promotion. Cleared to FALSE when the user
--                          completes minimal contributor setup
--                          (display name + contact details). The app
--                          routes contributors with this flag set to
--                          /contributor/setup on next login.
--
-- The role-change side-effects are applied by a DB trigger so that
-- every code path that legally updates `profiles.role` (admin PATCH,
-- contributor approval RPCs, future bulk tools) picks them up
-- automatically. The trigger runs AFTER the existing protect_role_column
-- BEFORE trigger so we don't second-guess authorisation — we just react
-- to a role change that the BEFORE trigger already allowed.
--
-- Idempotent: safe to re-run.

begin;

-- ── 1. Columns ──────────────────────────────────────────────────
alter table public.profiles
  add column if not exists force_reauth_at timestamptz;

alter table public.profiles
  add column if not exists bio_setup_required boolean not null default false;

comment on column public.profiles.force_reauth_at is
  'Set to now() when an admin changes the user''s role. Middleware invalidates sessions whose iat is older than this value.';

comment on column public.profiles.bio_setup_required is
  'TRUE when a citizen has been promoted to contributor and has not yet supplied the minimum public profile (display name + contact). Cleared by /api/contributor/setup.';

-- ── 2. Trigger: propagate role-change side-effects ──────────────
-- Fires AFTER UPDATE so the role change has already passed the
-- BEFORE protect_role_column trigger + RLS. The trigger itself is
-- security definer (via default) and only reads the row that was just
-- updated; no cross-row writes.
create or replace function public.on_role_change_side_effects()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- Always force re-auth so JWT role claims refresh.
    new.force_reauth_at := now();

    -- citizen -> contributor: require bio setup on next login.
    if old.role = 'citizen' and new.role = 'contributor' then
      new.bio_setup_required := true;
    end if;

    -- Any move off contributor clears the bio flag so a demoted user
    -- isn't stuck on a setup screen.
    if old.role = 'contributor' and new.role <> 'contributor' then
      new.bio_setup_required := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_role_change_side_effects on public.profiles;

create trigger trg_profiles_role_change_side_effects
  before update of role on public.profiles
  for each row
  execute function public.on_role_change_side_effects();

comment on function public.on_role_change_side_effects() is
  'Batch E: when profiles.role changes, stamp force_reauth_at and flip bio_setup_required for new contributors.';

commit;
