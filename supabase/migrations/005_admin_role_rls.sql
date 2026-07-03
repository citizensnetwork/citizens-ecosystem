-- ============================================
-- Migration 005: Admin role + tightened RLS
-- ============================================

-- 1) Expand role check to include 'admin'
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('vendor', 'client', 'admin'));

-- 2) Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── Events: tighten update/delete, allow admin override ──

-- Drop old permissive policies and recreate with admin fallback
drop policy if exists "Vendors can update own events" on public.events;
drop policy if exists "Vendors can delete own events" on public.events;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can update events' and tablename = 'events') then
    create policy "Owners or admins can update events" on public.events
      for update using (auth.uid() = created_by or public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can delete events' and tablename = 'events') then
    create policy "Owners or admins can delete events" on public.events
      for delete using (auth.uid() = created_by or public.is_admin());
  end if;
end $$;

-- ── Places: same pattern ──

drop policy if exists "Creators can update own places" on public.places;
drop policy if exists "Creators can delete own places" on public.places;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can update places' and tablename = 'places') then
    create policy "Owners or admins can update places" on public.places
      for update using (auth.uid() = created_by or public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can delete places' and tablename = 'places') then
    create policy "Owners or admins can delete places" on public.places
      for delete using (auth.uid() = created_by or public.is_admin());
  end if;
end $$;

-- ── Reviews: owners or admins can manage ──

drop policy if exists "Users can update own reviews" on public.reviews;
drop policy if exists "Users can delete own reviews" on public.reviews;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can update reviews' and tablename = 'reviews') then
    create policy "Owners or admins can update reviews" on public.reviews
      for update using (auth.uid() = user_id or public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can delete reviews' and tablename = 'reviews') then
    create policy "Owners or admins can delete reviews" on public.reviews
      for delete using (auth.uid() = user_id or public.is_admin());
  end if;
end $$;

-- ── Comments: owners or admins ──

drop policy if exists "Users can update own comments" on public.comments;
drop policy if exists "Users can delete own comments" on public.comments;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can update comments' and tablename = 'comments') then
    create policy "Owners or admins can update comments" on public.comments
      for update using (auth.uid() = user_id or public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Owners or admins can delete comments' and tablename = 'comments') then
    create policy "Owners or admins can delete comments" on public.comments
      for delete using (auth.uid() = user_id or public.is_admin());
  end if;
end $$;
