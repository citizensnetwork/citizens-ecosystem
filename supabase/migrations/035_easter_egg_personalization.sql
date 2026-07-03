-- ============================================
-- 035_easter_egg_personalization.sql
--
-- Replaces the static post-signup onboarding wizard with an organic,
-- in-map "Easter egg" preference system:
--
--   * Lightweight demographic columns on `profiles` (all NULL by default,
--     never required — populated by micro-prompts sprinkled through the
--     app when context makes the question relevant).
--   * A rolling log of AI search queries at `ai_search_queries` so we can
--     (a) show the user their own history and (b) feed a future Vision
--     analytics pass with a time-stamped snapshot of the user's personal
--     preferences at the moment they asked.
--
-- The `profiles.preferences` jsonb column (migration 034) is NOT changed
-- structurally — its shape evolves client-side.  New top-level keys the
-- client now writes into it:
--
--   preferences.tags           Record<string, { value, answered_at, expires_at }>
--   preferences.percentages    Record<categorySlug, 0..100>          (server-cached)
--   preferences.leadership_interest   boolean | null
--   preferences.last_longform_asked_at  ISO timestamp | null
--
-- (Existing `preferences.wyr` slice is preserved.)
-- ============================================

-- ── Part 1: Demographic columns on profiles ───────────────────────

-- All additions are nullable and default NULL.  The app never blocks on
-- any of these values being set — they only sharpen personalisation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS relationship_status text,
  ADD COLUMN IF NOT EXISTS stage_of_life text,
  ADD COLUMN IF NOT EXISTS energy_level text;

COMMENT ON COLUMN public.profiles.gender IS
  'Optional gender tag collected via a one-time Easter-egg prompt when the user '
  'first taps a gender-specific event.  NULL means "not yet asked / declined".';
COMMENT ON COLUMN public.profiles.age_range IS
  'Broad age bucket (e.g. "18-24", "25-34").  3-year expiry is enforced '
  'client-side via preferences.tags.age_range.expires_at.';
COMMENT ON COLUMN public.profiles.relationship_status IS
  'Optional relationship stance (e.g. "single", "dating", "married").  '
  '6-month expiry enforced client-side.';
COMMENT ON COLUMN public.profiles.stage_of_life IS
  'Season slogan bucket: "seeking" / "growing" / "serving" / "leading".  '
  '12-month expiry enforced client-side.';
COMMENT ON COLUMN public.profiles.energy_level IS
  'Preferred gathering intensity (e.g. "quiet", "balanced", "loud").  '
  '3-month expiry enforced client-side.';


-- ── Part 2: AI search query log (rolling 50 per user) ─────────────

CREATE TABLE IF NOT EXISTS public.ai_search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  query text NOT NULL,
  intent jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  -- Time-stamped snapshot of the user's preferences.percentages +
  -- preferences.tags at the moment of the search.  Lets downstream
  -- analytics correlate "what did they ask" with "what did we know".
  preferences_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_search_queries_user_created_idx
  ON public.ai_search_queries (user_id, created_at DESC);

COMMENT ON TABLE public.ai_search_queries IS
  'Rolling log of AI bar searches.  Kept to the most recent 50 rows per user '
  'by trigger ai_search_trim_rolling_50.';


-- ── Part 3: Rolling-50 trim trigger ───────────────────────────────

CREATE OR REPLACE FUNCTION public.ai_search_trim_rolling_50()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ai_search_queries
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.ai_search_queries
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 50
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_search_queries_trim_trigger ON public.ai_search_queries;
CREATE TRIGGER ai_search_queries_trim_trigger
AFTER INSERT ON public.ai_search_queries
FOR EACH ROW EXECUTE FUNCTION public.ai_search_trim_rolling_50();


-- ── Part 4: Row-Level Security ────────────────────────────────────

ALTER TABLE public.ai_search_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_search_queries_select_own ON public.ai_search_queries;
CREATE POLICY ai_search_queries_select_own
  ON public.ai_search_queries
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_search_queries_insert_own ON public.ai_search_queries;
CREATE POLICY ai_search_queries_insert_own
  ON public.ai_search_queries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_search_queries_delete_own ON public.ai_search_queries;
CREATE POLICY ai_search_queries_delete_own
  ON public.ai_search_queries
  FOR DELETE
  USING (auth.uid() = user_id);

-- No UPDATE policy: entries are append-only.
