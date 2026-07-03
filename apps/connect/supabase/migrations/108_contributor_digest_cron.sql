-- Migration 108: Schedule contributor digest edge function via pg_cron
-- ====================================================================
-- Runs the send-contributor-digest function 5× daily at:
--   07:00, 10:00, 13:00, 16:00, 19:00 UTC
-- which corresponds to 09:00, 12:00, 15:00, 18:00, 21:00 SAST (UTC+2).
--
-- Requires pg_cron extension (Supabase Pro — enable via dashboard first).
-- Safe to re-run: unschedules the old job before creating the new one.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any previous version of this job cleanly
    PERFORM cron.unschedule('contributor-digest') WHERE TRUE;

    PERFORM cron.schedule(
      'contributor-digest',
      '0 7,10,13,16,19 * * *',
      $cron$
        SELECT net.http_post(
          url := current_setting('app.supabase_functions_url') || '/send-contributor-digest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
