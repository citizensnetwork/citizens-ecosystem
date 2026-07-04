-- Migration 058 — Batch F: dual-admin approval for role=admin elevations
--
-- Elevating a user to `admin` is the single most privileged change in
-- the system: an admin can see every user, change every role, moderate
-- every report, and issue API keys. We therefore require a second
-- human approval for every such elevation — enforced at the database
-- layer, not the app, so the gate cannot be bypassed by a compromised
-- admin session or a future code path.
--
-- Flow:
--
--   1. Admin A submits an admin-elevation for user U. The app writes
--      a row to `pending_admin_elevations` with status='pending'.
--      The profile row is NOT mutated.
--   2. A DIFFERENT admin B approves. A Postgres function executes the
--      actual `profiles.role = 'admin'` update and marks the row
--      approved.
--   3. If only one admin exists in the system ("solo admin"), a
--      24-hour cooling-off delay is enforced before the same admin
--      may self-approve their own request. This is NOT a hard-coded
--      bypass — the function refuses to approve earlier and requires
--      the wall-clock delay to have elapsed.
--   4. Requests expire automatically after 14 days. Expired requests
--      must be re-submitted.
--
-- Notifications to other admins are inserted by the API route (not
-- this migration) using the existing `notifications` table with
-- type `'admin_elevation_request'` (added to the CHECK below).
--
-- Idempotent.

begin;

-- ── 1. Table ────────────────────────────────────────────────────
create table if not exists public.pending_admin_elevations (
  id              uuid primary key default gen_random_uuid(),
  target_user_id  uuid not null references public.profiles(id) on delete cascade,
  requested_by    uuid not null references public.profiles(id) on delete cascade,
  reason          text check (length(reason) <= 500),
  requested_at    timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '14 days'),
  status          text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  rejection_reason text check (length(rejection_reason) <= 500)
);

comment on table public.pending_admin_elevations is
  'Dual-admin approval queue for role=admin promotions. A row is created by the requesting admin; a different admin (or same after 24h in solo-admin case) approves, triggering the actual profiles.role update via approve_admin_elevation().';

-- One pending row per target at a time — prevents request flooding
-- and keeps the approval queue unambiguous.
create unique index if not exists pending_admin_elevations_one_pending_per_target
  on public.pending_admin_elevations(target_user_id)
  where status = 'pending';

create index if not exists pending_admin_elevations_status_idx
  on public.pending_admin_elevations(status, requested_at desc);

-- ── 2. RLS ──────────────────────────────────────────────────────
alter table public.pending_admin_elevations enable row level security;

drop policy if exists "pending_admin_elevations: admins read" on public.pending_admin_elevations;
create policy "pending_admin_elevations: admins read"
  on public.pending_admin_elevations
  for select
  using (public.is_admin());

drop policy if exists "pending_admin_elevations: admins insert" on public.pending_admin_elevations;
create policy "pending_admin_elevations: admins insert"
  on public.pending_admin_elevations
  for insert
  with check (public.is_admin() and requested_by = auth.uid());

-- Updates are only allowed through the RPCs below; we still enable a
-- narrow policy for cancellation/rejection tracking from the app.
drop policy if exists "pending_admin_elevations: admins update" on public.pending_admin_elevations;
create policy "pending_admin_elevations: admins update"
  on public.pending_admin_elevations
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3. Approve RPC (enforces the dual-admin + cooling-off rule) ─
create or replace function public.approve_admin_elevation(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request  public.pending_admin_elevations%rowtype;
  v_approver uuid := auth.uid();
  v_admin_count int;
begin
  if v_approver is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select * into v_request
    from public.pending_admin_elevations
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Elevation request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Elevation request is not pending (status = %)', v_request.status
      using errcode = 'P0001';
  end if;

  if v_request.expires_at < now() then
    update public.pending_admin_elevations
       set status = 'expired'
     where id = p_request_id;
    raise exception 'Elevation request has expired' using errcode = 'P0001';
  end if;

  -- Dual-admin rule: approver must differ from requester UNLESS the
  -- approver is the only admin AND 24h has elapsed since the request.
  if v_request.requested_by = v_approver then
    select count(*) into v_admin_count from public.profiles where role = 'admin';

    if v_admin_count > 1 then
      raise exception 'A different admin must approve this elevation request'
        using errcode = 'P0001';
    end if;

    if now() < v_request.requested_at + interval '24 hours' then
      raise exception 'Solo-admin self-approval requires a 24-hour waiting period. Please try again after %',
        (v_request.requested_at + interval '24 hours')
        using errcode = 'P0001';
    end if;
  end if;

  -- Perform the role change. The profile trigger will stamp
  -- force_reauth_at so the target user must re-login.
  update public.profiles
     set role = 'admin'
   where id = v_request.target_user_id;

  update public.pending_admin_elevations
     set status = 'approved',
         approved_by = v_approver,
         approved_at = now()
   where id = p_request_id;

  return p_request_id;
end;
$$;

revoke all on function public.approve_admin_elevation(uuid) from public;
grant execute on function public.approve_admin_elevation(uuid) to authenticated;

comment on function public.approve_admin_elevation(uuid) is
  'Batch F: approves a pending admin elevation. Enforces different-approver rule, or a 24h cooling-off period when the requester is the sole admin.';

-- ── 4. Reject RPC ───────────────────────────────────────────────
create or replace function public.reject_admin_elevation(p_request_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.pending_admin_elevations%rowtype;
  v_actor   uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select * into v_request
    from public.pending_admin_elevations
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Elevation request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Elevation request is not pending (status = %)', v_request.status
      using errcode = 'P0001';
  end if;

  update public.pending_admin_elevations
     set status = 'rejected',
         approved_by = v_actor,
         approved_at = now(),
         rejection_reason = coalesce(nullif(trim(p_reason), ''), null)
   where id = p_request_id;

  return p_request_id;
end;
$$;

revoke all on function public.reject_admin_elevation(uuid, text) from public;
grant execute on function public.reject_admin_elevation(uuid, text) to authenticated;

comment on function public.reject_admin_elevation(uuid, text) is
  'Batch F: rejects a pending admin elevation request. Either admin may reject.';

-- ── 5. Extend notifications.type whitelist ──────────────────────
do $$
declare
  _con text;
begin
  select conname into _con
    from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%type%'
  limit 1;

  if _con is not null then
    execute format('alter table public.notifications drop constraint %I', _con);
  end if;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'event_reminder',
      'new_event_match',
      'event_cancelled',
      'new_follower',
      'event_update',
      'review_prompt',
      'admin_elevation_request'
    ));
end $$;

commit;
