-- ============================================================
-- Migration 121: Re-register the dormant pg_cron jobs
-- ============================================================
-- pg_cron was installed in migration 120, but every job defined BEFORE that
-- (migrations 107/110/116/117) was skipped at apply time by its
-- `IF EXISTS (pg_cron)` guard and so was never registered. This migration
-- registers them now so the platform's scheduled work actually runs.
--
-- Scope = the five DB-internal, idempotent, no-side-effect jobs only:
--   • messaging-purge-60d                  (107) daily 03:00 UTC
--   • contributor-analytics-daily          (110) daily 02:15 UTC
--   • contributor-analytics-purge          (110) Sun  03:00 UTC
--   • contributor-analytics-vision-snapshot(116) 1 Jan 03:30 UTC
--   • search-term-stats-purge              (117) Sun  03:30 UTC
-- Each calls a function/SQL that already exists (verified): the two analytics
-- functions take a single DEFAULTed arg so `SELECT fn();` resolves fine.
--
-- DELIBERATELY EXCLUDED — contributor-digest (108): it uses net.http_post
-- (pg_net is NOT installed) + two unset GUCs (app.supabase_functions_url /
-- app.supabase_anon_key) and has USER-FACING side effects (sends digests
-- 5×/day). Reviving it needs pg_net + config + a product decision — left for
-- a separate, explicitly-approved step.
--
-- Pattern: cron.unschedule() RAISES when a job is absent, so each is guarded
-- by a cron.job existence check (NOT the legacy `WHERE TRUE`).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not installed — apply migration 120 first';
  END IF;

  -- 1. messaging-purge-60d (107) — 60d active / 30d deleted-account retention
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'messaging-purge-60d') THEN
    PERFORM cron.unschedule('messaging-purge-60d');
  END IF;
  PERFORM cron.schedule(
    'messaging-purge-60d',
    '0 3 * * *',
    $cron$
      DELETE FROM public.messages
      WHERE created_at < now() - INTERVAL '60 days'
        AND sender_id IN (
          SELECT id FROM public.profiles WHERE deleted_at IS NULL
        );

      DELETE FROM public.messages m
      WHERE m.created_at < now() - INTERVAL '30 days'
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = m.sender_id AND p.deleted_at IS NOT NULL
        );
    $cron$
  );

  -- 2. contributor-analytics-daily (110) — aggregate yesterday
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contributor-analytics-daily') THEN
    PERFORM cron.unschedule('contributor-analytics-daily');
  END IF;
  PERFORM cron.schedule(
    'contributor-analytics-daily',
    '15 2 * * *',
    $cron$ SELECT public.aggregate_contributor_analytics_daily(); $cron$
  );

  -- 3. contributor-analytics-purge (110) — 1-year retention, weekly
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contributor-analytics-purge') THEN
    PERFORM cron.unschedule('contributor-analytics-purge');
  END IF;
  PERFORM cron.schedule(
    'contributor-analytics-purge',
    '0 3 * * 0',
    $cron$ SELECT public.purge_old_analytics(); $cron$
  );

  -- 4. contributor-analytics-vision-snapshot (116) — yearly, 1 Jan
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contributor-analytics-vision-snapshot') THEN
    PERFORM cron.unschedule('contributor-analytics-vision-snapshot');
  END IF;
  PERFORM cron.schedule(
    'contributor-analytics-vision-snapshot',
    '30 3 1 1 *',
    $cron$ SELECT public.snapshot_contributor_analytics_for_vision(); $cron$
  );

  -- 5. search-term-stats-purge (117) — 180-day retention, weekly
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'search-term-stats-purge') THEN
    PERFORM cron.unschedule('search-term-stats-purge');
  END IF;
  PERFORM cron.schedule(
    'search-term-stats-purge',
    '30 3 * * 0',
    $cron$ SELECT public.purge_old_search_terms(); $cron$
  );
END $$;
