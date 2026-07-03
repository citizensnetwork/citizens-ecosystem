-- 048_reports_hardening.sql
--
-- Follow-up to 047: two small but important fixes surfaced in review.
--
-- 1. `reports_select_own` previously allowed a reporter to read every
--    column of their own row, including admin `resolution_notes`,
--    `resolved_by`, and `resolved_at`.  Admins sometimes record
--    internal context there that should not leak back to the reporter.
--    Tightening the policy to only expose *open* reports keeps the
--    reporter informed ("your report is open") while making resolved
--    records admin-only.  The reporter's server-side GET /api/reports
--    continues to work for open records; resolved receipts can be
--    added later via a view that explicitly whitelists columns.
--
-- 2. Clarify the target_id design: it is a uuid and will remain one.
--    (Comment-only change — no schema change.)

drop policy if exists reports_select_own on public.reports;

create policy reports_select_own
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id and status = 'open');

comment on column public.reports.target_id is
  'UUID of the reported entity. Polymorphic by target_type (event/user/place/comment). Stored as uuid; all current and near-term targets are uuid-keyed.';
