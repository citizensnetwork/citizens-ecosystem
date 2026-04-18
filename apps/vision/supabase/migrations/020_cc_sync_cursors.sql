-- Phase 17: Per-type sync cursors for incremental Connect pull
--
-- Today the sync-from-connect edge function reads its "since" value
-- from `cc_sync_log` rows where sync_type='full' (a single global
-- cursor). That made it cheap to ship in Phase 7, but it conflates
-- three independent streams (events / places / profiles) and offers
-- no way to backfill or rewind one stream without losing the others.
--
-- This migration introduces an explicit cursor table — one row per
-- sync_type — that the edge function can UPSERT atomically per
-- stream. Backfills become a single UPDATE; per-stream cadence and
-- partial failures no longer poison the next run.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS cc_sync_cursors (
  sync_type        TEXT PRIMARY KEY
                    CHECK (sync_type IN ('events', 'places', 'profiles')),
  last_synced_at   TIMESTAMPTZ,        -- highest source updated_at consumed
  last_started_at  TIMESTAMPTZ,        -- when the most recent run started
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed rows so the edge function can rely on COALESCE without
-- needing an INSERT branch on its first run per stream.
INSERT INTO cc_sync_cursors (sync_type)
  VALUES ('events'), ('places'), ('profiles')
  ON CONFLICT (sync_type) DO NOTHING;

ALTER TABLE cc_sync_cursors ENABLE ROW LEVEL SECURITY;

-- Service role only. Authenticated users can read sync state via
-- cc_sync_log; the cursor table is internal plumbing.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'cc_sync_cursors_no_access'
  ) THEN
    CREATE POLICY cc_sync_cursors_no_access ON cc_sync_cursors
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- Helper to advance a cursor in one statement. Returns the new value
-- so the caller can echo it in the sync log without a follow-up read.
CREATE OR REPLACE FUNCTION advance_cc_sync_cursor(
  p_sync_type TEXT,
  p_last_synced_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result TIMESTAMPTZ;
BEGIN
  -- Never move the cursor backwards: if a delayed run produces an
  -- older watermark we keep the higher one. Defensive guard against
  -- replays.
  UPDATE cc_sync_cursors
     SET last_synced_at = GREATEST(
           COALESCE(last_synced_at, p_last_synced_at),
           p_last_synced_at
         ),
         last_started_at = now(),
         updated_at = now()
   WHERE sync_type = p_sync_type
   RETURNING last_synced_at INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION advance_cc_sync_cursor(TEXT, TIMESTAMPTZ) FROM public;
-- Edge function uses service role; no GRANT to authenticated needed.
