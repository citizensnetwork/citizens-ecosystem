-- 099_contributor_type_change_requests.sql
--
-- Adds:
--   1. contributor_type_change_requests table — stores one pending slot per
--      contributor; unique on user_id so upsert onConflict="user_id" works.
--   2. RLS policies — contributors see/upsert own row; admins see all + update.
--   3. Widens notifications_type_check to include 'contributor_type_change_request'
--      (required by api/contributor/type-change admin-notification insert).

-- ── 1. Table ────────────────────────────────────────────────────────────────

create table if not exists public.contributor_type_change_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  current_kind    text not null,
  requested_kind  text not null,
  reason          text,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewer_note   text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  -- One active slot per contributor.
  constraint contributor_type_change_requests_user_id_key unique (user_id)
);

comment on table public.contributor_type_change_requests is
  'One-row-per-contributor queue for contributor kind (ministry/org/business) change requests.';

-- ── 2. RLS ──────────────────────────────────────────────────────────────────

alter table public.contributor_type_change_requests enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Contributors see own type-change request'
    and tablename = 'contributor_type_change_requests'
  ) then
    create policy "Contributors see own type-change request"
      on public.contributor_type_change_requests
      for select using (user_id = auth.uid() or public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Contributors upsert own type-change request'
    and tablename = 'contributor_type_change_requests'
  ) then
    create policy "Contributors upsert own type-change request"
      on public.contributor_type_change_requests
      for insert with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Admins update type-change requests'
    and tablename = 'contributor_type_change_requests'
  ) then
    create policy "Admins update type-change requests"
      on public.contributor_type_change_requests
      for update using (public.is_admin());
  end if;
end $$;

-- ── 3. Widen notifications_type_check ───────────────────────────────────────
-- Supersedes the constraint set in migration 085; keeps all existing values
-- and adds 'contributor_type_change_request'.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type = any (array[
      'event_reminder',
      'new_event_match',
      'event_cancelled',
      'new_follower',
      'event_update',
      'new_message',
      'review_prompt',
      'admin_elevation_request',
      'friend_convince',
      'friend_attending',
      'contributor_approved',
      'contributor_rejected',
      'contributor_type_change_request'
    ])
  );
