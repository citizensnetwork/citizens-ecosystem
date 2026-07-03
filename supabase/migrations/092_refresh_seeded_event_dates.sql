-- Migration 092: Refresh seeded event dates to upcoming
-- Seeds from migration 061 used now() at apply time, so all events are stale.
-- Spreads each org's events across the next 5 weeks (5 days, 12, 19, 26, 33).
-- The event with the smallest original date per org (was the seeded "past event")
-- becomes a recent past event (now() - 45 days) — keeps profile history populated.
--
-- HOW TO APPLY (MCP not available — run in Supabase SQL editor):
--   1. Go to supabase.com → Project xyiajtrvhlxaeplsiajj → SQL Editor
--   2. Paste this file and click Run
--   3. Verify: SELECT title, date FROM events
--              WHERE creator_id = '11111111-1111-4111-8111-000000000005'
--              ORDER BY date;
--
-- Rollback: re-run migration 061 (destructive — don't do in production)

WITH ranked AS (
  SELECT
    id,
    end_time - date AS duration,
    ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY date ASC) AS rn
  FROM events
  WHERE creator_id IN (
    '11111111-1111-4111-8111-000000000001'::uuid,  -- CRC Cape Town
    '11111111-1111-4111-8111-000000000002'::uuid,  -- Every Nation Mooikloof
    '11111111-1111-4111-8111-000000000003'::uuid,  -- Lynnwood Farmers Market
    '11111111-1111-4111-8111-000000000004'::uuid,  -- Ellel Ministries South Africa
    '11111111-1111-4111-8111-000000000005'::uuid,  -- POPUP Skills Development Centre
    '11111111-1111-4111-8111-000000000006'::uuid   -- U-Turn Homeless Ministries
  )
),
new_dates AS (
  SELECT
    id,
    duration,
    CASE
      -- Lowest-date event per org was seeded as past — keep it past
      WHEN rn = 1 THEN now() - interval '45 days'
      -- Remaining events spread 7 days apart starting 5 days from now
      ELSE now() + ((rn - 2)::int * interval '7 days') + interval '5 days'
    END AS new_date
  FROM ranked
)
UPDATE events e
SET
  date     = nd.new_date,
  end_time = nd.new_date + nd.duration
FROM new_dates nd
WHERE e.id = nd.id;
