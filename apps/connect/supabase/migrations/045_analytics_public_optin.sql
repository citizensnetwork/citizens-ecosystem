-- Migration 045: Gate public platform analytics behind explicit opt-in.
--
-- Architect audit H2 + H3.
--
-- Migration 044 exposed every `analytics_daily` row with `org_id IS
-- NULL` to anon reads. Future columns (`top_events`, `sample_user_ids`,
-- debug fields) or sensitive metrics seeded accidentally would leak
-- with zero code change. This migration tightens the contract:
--
--   * Adds a `public` boolean column (default FALSE) so rows are
--     private unless explicitly opted in by the job/backfill.
--   * Rewrites the anon SELECT policy to require `public = TRUE`.
--
-- Existing rows keep `public = FALSE`. Publication becomes a
-- conscious act by the seeding job.

begin;

alter table public.analytics_daily
  add column if not exists public boolean not null default false;

drop policy if exists "Platform analytics are public" on public.analytics_daily;

create policy "Platform analytics are public"
  on public.analytics_daily for select
  using (org_id is null and public = true);

commit;
