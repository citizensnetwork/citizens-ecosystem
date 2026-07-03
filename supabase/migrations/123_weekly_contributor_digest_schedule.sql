-- Migration 123: Weekly contributor digest schedule
-- ============================================================
-- Product decision 2026-06-01: contributor/admin digests are weekly
-- analytics summaries, not 5x-daily notification batches.
--
-- This migration unschedules any legacy `contributor-digest` job, then
-- re-registers it for Monday 06:00 UTC (08:00 SAST) only when the required
-- cron/http-post infrastructure and app GUCs are present.
-- ============================================================

DO $$
DECLARE
  has_pg_cron boolean;
  has_pg_net boolean;
  functions_url text;
  anon_key text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    INTO has_pg_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    INTO has_pg_net;

  IF NOT has_pg_cron THEN
    RAISE NOTICE 'pg_cron is not installed; contributor digest schedule skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contributor-digest') THEN
    PERFORM cron.unschedule('contributor-digest');
  END IF;

  IF NOT has_pg_net THEN
    RAISE NOTICE 'pg_net is not installed; legacy contributor-digest job unscheduled but weekly schedule not registered';
    RETURN;
  END IF;

  functions_url := current_setting('app.supabase_functions_url', true);
  anon_key := current_setting('app.supabase_anon_key', true);

  IF coalesce(functions_url, '') = '' OR coalesce(anon_key, '') = '' THEN
    RAISE NOTICE 'app.supabase_functions_url/app.supabase_anon_key are not set; legacy contributor-digest job unscheduled but weekly schedule not registered';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'contributor-digest',
    '0 6 * * 1',
    $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_functions_url') || '/send-contributor-digest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
        ),
        body := jsonb_build_object('period', 'weekly')
      );
    $cron$
  );
END $$;

COMMENT ON COLUMN public.profiles.muted_source_ids IS
  'jsonb array of muted notification sources. Each entry: {"type":"event"|"place"|"org","id":"<uuid>"}. Event broadcasts check event mute only; place broadcasts check place or org mute.';
