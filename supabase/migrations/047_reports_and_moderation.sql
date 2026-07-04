-- Migration 047: Reports & moderation (Batch G — Trust & Safety v1)
-- ============================================================
-- User-submitted reports for bad content or behaviour.  Anyone
-- authenticated can file a report; only admins can see or resolve them.
-- Resolution writes a row into `admin_actions` via the API layer so we
-- keep a single audit trail.
--
-- target_type is intentionally a text check (not an enum) so we can add
-- new surfaces later (e.g. 'message') without a type migration.  The
-- `target_id` is text rather than uuid because comments use uuid but we
-- may in future point at non-uuid resources.
-- ============================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null
    check (target_type in ('event', 'user', 'place', 'comment')),
  target_id uuid not null,
  reason text not null
    check (reason in (
      'spam',
      'harassment',
      'hate_speech',
      'sexual_content',
      'violence',
      'misinformation',
      'impersonation',
      'illegal',
      'other'
    )),
  body text check (body is null or length(body) <= 1000),
  status text not null
    check (status in ('open', 'actioned', 'dismissed'))
    default 'open',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text check (resolution_notes is null or length(resolution_notes) <= 1000),
  created_at timestamptz not null default now(),
  -- A single user may not file duplicate open reports against the same
  -- target; reuse the existing row via an upsert.  Actioned/dismissed
  -- rows do not block re-reporting because status is part of the key
  -- via a partial unique index (below).
  constraint reports_body_not_blank
    check (body is null or length(trim(body)) > 0)
);

-- Admin dashboard: most recent first
create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);
-- Target lookup (all reports against X)
create index if not exists reports_target_idx
  on public.reports (target_type, target_id);
-- Reporter's own submissions
create index if not exists reports_reporter_idx
  on public.reports (reporter_id, created_at desc);
-- Block duplicate *open* reports by same user on same target
create unique index if not exists reports_unique_open
  on public.reports (reporter_id, target_type, target_id)
  where status = 'open';

alter table public.reports enable row level security;

do $$
begin
  -- Admins see everything
  if not exists (
    select 1 from pg_policies
    where tablename = 'reports' and policyname = 'reports_select_admin'
  ) then
    create policy reports_select_admin
      on public.reports for select
      using (public.is_admin());
  end if;

  -- Reporters can see their own submissions
  if not exists (
    select 1 from pg_policies
    where tablename = 'reports' and policyname = 'reports_select_own'
  ) then
    create policy reports_select_own
      on public.reports for select
      using (auth.uid() = reporter_id);
  end if;

  -- Authenticated users can file reports (but only as themselves)
  if not exists (
    select 1 from pg_policies
    where tablename = 'reports' and policyname = 'reports_insert_self'
  ) then
    create policy reports_insert_self
      on public.reports for insert
      with check (
        auth.uid() = reporter_id
        and status = 'open'
        and resolved_by is null
        and resolved_at is null
      );
  end if;

  -- Only admins can update status / resolution
  if not exists (
    select 1 from pg_policies
    where tablename = 'reports' and policyname = 'reports_update_admin'
  ) then
    create policy reports_update_admin
      on public.reports for update
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  -- No deletes via API; keep the audit trail.
  -- (No DELETE policy means the RLS default denies.)
end
$$;

comment on table public.reports is
  'User-submitted reports of bad content or behaviour.  Admin-only visibility and resolution; reporters can see their own.';

comment on column public.reports.target_type is
  'Surface being reported: event, user, place, or comment.';
comment on column public.reports.reason is
  'Enumerated reason code; use `body` for free-form context.';
comment on column public.reports.status is
  'Lifecycle: open → actioned | dismissed.  Updated only by admins.';
