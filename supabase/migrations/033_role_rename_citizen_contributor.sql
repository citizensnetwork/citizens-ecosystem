-- ============================================
-- 033_role_rename_citizen_contributor.sql
--
-- Collapses the seven-way role enum into a clean three-way model:
--   individual / ministry / organization / business / vendor / client / admin
--   ─────────────────────────────────────────────────────────────────────►
--   citizen / contributor / admin
--
-- The previous *kind* of contributor (ministry / organization / business)
-- is preserved in a new `contributor_kind` column so we don't lose the
-- affiliation information already gathered on existing profiles.
--
-- Why a single migration that flips the constraint twice:
--   We need the OLD values temporarily writeable while we backfill the new
--   ones (DROP → backfill → ADD), so we drop the constraint first,
--   rewrite the data in two passes, then add the new constraint.  Doing
--   this in a transaction (the default for a single migration) keeps the
--   table in a consistent state for any concurrent readers.
--
-- Idempotency: the migration is safe to re-run.  Each step guards on
-- existence (column / constraint / role value) before acting.
-- ============================================

BEGIN;

-- ── 1. Add contributor_kind column ──────────────────────────────────────
-- Nullable, free of constraints initially so we can backfill cleanly.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contributor_kind text;

-- ── 2. Drop the old role check constraint ───────────────────────────────
-- The constraint name varies depending on which migration created it
-- (Postgres auto-generates `<table>_<column>_check` by default but
-- previous hand-written migrations used named constraints).  Drop both
-- the auto-generated form and the historical names defensively.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

DO $$
DECLARE
  con record;
BEGIN
  -- Catch any straggling check constraint on `role` regardless of name.
  FOR con IN
    SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'profiles'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%role%IN%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', con.conname);
  END LOOP;
END $$;

-- ── 3. Backfill contributor_kind from existing role ─────────────────────
-- Important: temporarily disable the `protect_role_column` trigger
-- defined in schema.sql.  That trigger silently reverts any role UPDATE
-- whenever the caller is not an admin — and `auth.uid()` is NULL inside
-- a migration context, so every UPDATE below would otherwise no-op
-- (and the new check constraint in step 5 would then fail with
-- "violated by some row").  We re-enable the trigger immediately after
-- the data flip so the protection holds in normal application traffic.
ALTER TABLE public.profiles DISABLE TRIGGER protect_role_trigger;

-- Only fill rows that currently carry a contributor-style role and that
-- don't already have a kind set (allows safe re-runs).
UPDATE public.profiles
   SET contributor_kind = role
 WHERE role IN ('ministry', 'organization', 'business')
   AND contributor_kind IS NULL;

-- ── 4. Collapse role values to citizen / contributor / admin ────────────
UPDATE public.profiles
   SET role = 'contributor'
 WHERE role IN ('ministry', 'organization', 'business');

-- Legacy 'vendor' / 'client' values pre-date the four-role era.  Map them
-- to citizen so they end up in the same bucket as `individual`.
UPDATE public.profiles
   SET role = 'citizen'
 WHERE role IN ('individual', 'vendor', 'client');

ALTER TABLE public.profiles ENABLE TRIGGER protect_role_trigger;

-- ── 5. Re-add the new constraint and the contributor_kind constraint ────
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('citizen', 'contributor', 'admin'));

-- contributor_kind only meaningful for contributor rows; null for everyone
-- else.  We don't *force* contributors to have a kind (a future rename
-- might want a generic "contributor" without sub-type) but if it's set
-- it must be one of the three known values.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_contributor_kind_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_contributor_kind_check
  CHECK (
    contributor_kind IS NULL
    OR contributor_kind IN ('ministry', 'organization', 'business')
  );

-- ── 6. Update default for new rows ──────────────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'citizen';

-- ── 7. Refresh the trigger that auto-creates profiles on signup ─────────
-- Now accepts citizen / contributor as self-assignable roles, plus the
-- optional contributor_kind in user_metadata.  Admin still requires
-- manual elevation in the database.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  signup_role text;
  signup_kind text;
BEGIN
  signup_role := coalesce(new.raw_user_meta_data->>'role', 'citizen');
  signup_kind := nullif(new.raw_user_meta_data->>'contributor_kind', '');

  -- Only allow self-assignable roles; admin requires manual DB update.
  IF signup_role NOT IN ('citizen', 'contributor') THEN
    signup_role := 'citizen';
  END IF;

  -- Only valid kinds; null otherwise.
  IF signup_kind IS NOT NULL
     AND signup_kind NOT IN ('ministry', 'organization', 'business') THEN
    signup_kind := NULL;
  END IF;

  -- Kind is only meaningful for contributors.
  IF signup_role <> 'contributor' THEN
    signup_kind := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, contributor_kind)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    signup_role,
    signup_kind
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Refresh is_organiser() helper to use the new vocabulary ──────────
-- We keep the function name `is_organiser` (used by RLS policies on
-- places, event_updates, etc.) but it now matches the new role values
-- so every existing policy keeps working without edits.
CREATE OR REPLACE FUNCTION public.is_organiser()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND role IN ('contributor', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 9. Policy audit ─────────────────────────────────────────────────────
-- Audited every policy in `supabase/migrations/` and `supabase/schema.sql`
-- against the rename and confirmed:
--   * `places` insert policy ("Authenticated users can create places")
--     only checks auth.uid() = created_by — no role list, untouched.
--   * `places` update/delete policies ("Owners or admins…") use
--     `is_admin()` which checks role = 'admin' — admin value preserved,
--     untouched.
--   * `event_updates` policies (migration 030) reference role = 'admin'
--     directly — admin value preserved, untouched.
--   * `is_organiser()` (refreshed above) was the only function using the
--     old contributor role names.
-- No further policy edits required.

COMMIT;

