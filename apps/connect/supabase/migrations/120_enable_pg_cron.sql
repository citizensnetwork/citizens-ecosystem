-- ============================================================
-- Migration 120: Enable pg_cron + (re)register the map-prominence job
-- ============================================================
-- pg_cron was not installed on this project, so every prior migration that
-- tried to schedule a job (110/116/117 analytics, 119 prominence) hit its
-- `IF EXISTS (pg_cron)` guard and silently skipped. Enabling the extension
-- here turns those guards "on" going forward and lets us register the
-- prominence recompute now.
--
-- The recompute is DB-internal (zero app / map-runtime cost) — this is the
-- lightest possible refresh path: once daily, in Postgres, off the user path.
--
-- NOTE (scoped on purpose): this migration only (re)registers the
-- map-prominence job. The dormant analytics jobs (contributor-analytics-*,
-- search-term purge, messaging purge, digest) can be re-registered in a
-- follow-up once their schedules are re-confirmed — kept out of here so this
-- change stays small and reviewable.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- (Re)register the daily prominence recompute now that cron exists.
-- 02:45 UTC — after the 02:15 analytics aggregator so both derive from the
-- same settled day. NB: cron.unschedule() RAISES if the job is absent, so it
-- must be guarded by a cron.job existence check (not `WHERE TRUE`, which the
-- prior migrations used only because their outer pg_extension guard meant the
-- unschedule never actually ran while cron was uninstalled).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'map-prominence-recompute') THEN
    PERFORM cron.unschedule('map-prominence-recompute');
  END IF;
  PERFORM cron.schedule(
    'map-prominence-recompute',
    '45 2 * * *',
    $cron$ SELECT public.recompute_map_prominence(); $cron$
  );
END $$;

-- Refresh once immediately so the column is current the moment cron is on.
SELECT public.recompute_map_prominence();
