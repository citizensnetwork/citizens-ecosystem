-- Migration 043: Lightweight admin audit log
-- ============================================================
-- Backs the /admin/users + /admin/api-keys surfaces so every
-- privileged action (role change, contributor status change, key mint,
-- key revoke) writes a single auditable row. Keeps the notifications
-- feed clean (those are user-facing; this is operator-only).
--
-- Intentionally minimal:
--   - append-only from the app's perspective
--   - RLS: admins can read; no one can update or delete via RLS
--   - INSERT is allowed from authenticated role only; the policy
--     requires the writer to be the actor and to currently be admin
-- ============================================================

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete set null,
  action text not null check (length(action) between 1 and 64),
  target_type text check (target_type is null or length(target_type) <= 32),
  target_id text check (target_id is null or length(target_id) <= 200),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_created_idx
  on public.admin_actions (created_at desc);
create index if not exists admin_actions_actor_idx
  on public.admin_actions (actor_id, created_at desc);
create index if not exists admin_actions_target_idx
  on public.admin_actions (target_type, target_id);

alter table public.admin_actions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'admin_actions' and policyname = 'admin_actions_select_admin'
  ) then
    create policy admin_actions_select_admin
      on public.admin_actions for select
      using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'admin_actions' and policyname = 'admin_actions_insert_admin'
  ) then
    create policy admin_actions_insert_admin
      on public.admin_actions for insert
      with check (
        public.is_admin() and auth.uid() = actor_id
      );
  end if;
end
$$;

comment on table public.admin_actions is
  'Append-only audit log of privileged admin actions (role changes, API key mint/revoke, etc.)';
