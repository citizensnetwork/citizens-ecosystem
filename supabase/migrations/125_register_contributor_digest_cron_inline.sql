-- Migration 125: Register the weekly contributor-digest cron with inline config
-- ============================================================================
-- Migration 123 registers the weekly contributor-digest job ONLY when the
-- `app.supabase_functions_url` / `app.supabase_anon_key` GUCs are set. On this
-- project those GUCs cannot be set (ALTER DATABASE is denied to the management
-- role), so 123 always short-circuits before scheduling.
--
-- This migration registers the same weekly job (Mon 06:00 UTC / 08:00 SAST)
-- using inline literal values:
--   * the project Functions base URL (public), and
--   * the project publishable "anon" key.
-- The anon key is publishable and safe to commit per the platform's RLS-first
-- security model (RLS — not key secrecy — enforces access). It only lets the
-- Supabase gateway accept the scheduled invocation; the edge function itself
-- runs with the service-role key from its own environment.
--
-- Guarded by pg_cron + pg_net presence and idempotent (unschedule-then-create).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; contributor-digest cron not registered';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net not installed; contributor-digest cron not registered';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contributor-digest') THEN
    PERFORM cron.unschedule('contributor-digest');
  END IF;

  PERFORM cron.schedule(
    'contributor-digest',
    '0 6 * * 1',
    $cron$
      SELECT net.http_post(
        url := 'https://xyiajtrvhlxaeplsiajj.supabase.co/functions/v1/send-contributor-digest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5aWFqdHJ2aGx4YWVwbHNpYWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMyNzksImV4cCI6MjA5MDcyOTI3OX0.oAsnS2vdT3QDOxOu6lfkxo-5SO1C0TQCUlxc6L4aaOA'
        ),
        body := jsonb_build_object('period', 'weekly')
      );
    $cron$
  );
END $$;
