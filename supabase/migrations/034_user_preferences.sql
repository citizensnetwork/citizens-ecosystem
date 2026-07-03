-- ============================================
-- 034_user_preferences.sql
--
-- Adds a `preferences` JSONB column on profiles for storing the
-- "Would You Rather" answers and any future lightweight preference data
-- that doesn't deserve its own column (e.g. preferred quick-panel
-- ordering, theme tweaks, accessibility flags).
--
-- Why JSONB rather than a separate table:
--   * Each user has at most one row of preferences; a child table would
--     just be a 1:1 relation with no benefit.
--   * Preference shapes evolve quickly during onboarding-experiment
--     iterations.  Adding/removing keys in app code is friction-free
--     when the DB just stores `jsonb`.
--   * RLS already covers profiles row-by-row, so the column inherits
--     the right access controls automatically.
--
-- Defaults to an empty JSON object so reads never need null-checks.
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index on the JSONB column so future queries that match against keys
-- (e.g. "users who prefer small groups") can use a GIN index instead of
-- scanning every row.  Cheap to add now while the table is tiny.
CREATE INDEX IF NOT EXISTS profiles_preferences_gin_idx
  ON public.profiles USING gin (preferences jsonb_path_ops);

COMMENT ON COLUMN public.profiles.preferences IS
  'Lightweight per-user preference bag.  Currently houses Would-You-Rather '
  'answers under preferences.wyr (Record<string, "left"|"right">).';
