-- ============================================================
-- Platform Admin Bootstrap
-- ============================================================
--
-- Promotes a single existing auth.users account to platform_admin —
-- a global role that every RLS policy in this codebase honours via
-- the `is_platform_admin()` SECURITY DEFINER helper defined in
-- migration 001_foundation.sql.
--
-- What this does:
--   1. Ensures a system organisation named "Platform" exists.
--      (user_org_roles.org_id is NOT NULL, so every role row needs
--      a parent org — even a globally-scoped one. The org itself is
--      inert; it holds no data.)
--   2. Looks up the target user in auth.users by email.
--   3. Inserts (or upserts) a platform_admin row in user_org_roles
--      pointing at the Platform org.
--
-- Safety:
--   - Idempotent. Safe to re-run.
--   - Fails loudly (RAISE EXCEPTION) if the target email has never
--     signed up — no silent no-op that leaves you wondering why
--     nothing happened.
--   - Uses only public helpers + auth.users; no service-role code.
--
-- Portability (re-using this file in other projects):
--   This file assumes your schema has:
--     - a `user_org_roles` table with columns (user_id, org_id, role)
--       and a UNIQUE(user_id, org_id) constraint
--     - an `organisations` table with (id, name, slug, created_by)
--     - a role value of 'platform_admin' accepted by the CHECK
--       constraint on user_org_roles.role
--     - auth.users (standard Supabase)
--   To re-use elsewhere: change the TARGET_EMAIL value below and,
--   if your table/column names differ, adjust the identifiers in
--   the DO block. Nothing else is project-specific.
-- ============================================================

DO $$
DECLARE
  TARGET_EMAIL  CONSTANT TEXT := 'citizensnetworkpbo@gmail.com';
  PLATFORM_SLUG CONSTANT TEXT := 'platform';
  PLATFORM_NAME CONSTANT TEXT := 'Platform';

  v_user_id UUID;
  v_org_id  UUID;
BEGIN
  -- 1. Resolve the target auth user.
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(TARGET_EMAIL)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Platform admin bootstrap: no auth.users row found for %. Sign the user up via the normal auth flow first, then re-run this migration.',
      TARGET_EMAIL;
  END IF;

  -- 2. Ensure the Platform system organisation exists.
  SELECT id INTO v_org_id
  FROM organisations
  WHERE slug = PLATFORM_SLUG
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO organisations (name, slug, description, created_by)
    VALUES (
      PLATFORM_NAME,
      PLATFORM_SLUG,
      'System organisation. Holds platform_admin role bindings. Do not add operational data here.',
      v_user_id
    )
    RETURNING id INTO v_org_id;
  END IF;

  -- 3. Upsert the platform_admin role binding.
  INSERT INTO user_org_roles (user_id, org_id, role)
  VALUES (v_user_id, v_org_id, 'platform_admin')
  ON CONFLICT (user_id, org_id)
  DO UPDATE SET role = 'platform_admin';

  RAISE NOTICE
    'Platform admin bootstrap: % (user %) is now platform_admin on org % (%).',
    TARGET_EMAIL, v_user_id, PLATFORM_NAME, v_org_id;
END
$$;
