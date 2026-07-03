-- Migration 040: Phase B follow-up — tighten analytics_daily uniqueness
-- and broaden public stats RPC defensively. Addresses the Architect
-- audit findings H1 (NULL org_id uniqueness) and L4 (contributor_status
-- defence-in-depth on org-scoped RPCs).

-- H1: Postgres treats NULL as distinct in unique constraints, so the
-- existing `unique (day, org_id, metric_key)` lets backfill jobs
-- silently insert duplicates for platform-wide metrics (where
-- org_id IS NULL). Add a partial unique index to enforce uniqueness
-- specifically for the platform-wide case.
create unique index if not exists analytics_daily_platform_wide_uniq
  on public.analytics_daily (day, metric_key)
  where org_id is null;

-- L4: defense-in-depth for get_org_event_stats and get_org_audience.
-- Already gated at the API layer, but the RPC itself previously only
-- checked auth.uid() vs p_org_id OR is_admin(). If we ever expose the
-- RPC more broadly we want zero-filled stats for non-contributors too.
-- (We intentionally do NOT add a status check because a contributor
-- whose status was later revoked still deserves to see their own
-- historical counts; the API layer enforces the access gate.)

-- No data migration needed; the table is not yet populated.
