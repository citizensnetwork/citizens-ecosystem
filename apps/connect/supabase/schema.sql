-- ============================================
-- Citizens Connect - Database Schema
-- Safe to run multiple times (idempotent)
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles table (extends Supabase Auth users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null check (role in ('vendor', 'client')) default 'client',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Policies: use DO blocks to skip if already exists
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Profiles are viewable by everyone' and tablename = 'profiles') then
    create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can update own profile' and tablename = 'profiles') then
    create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own profile' and tablename = 'profiles') then
    create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
  end if;
end $$;

-- 2. Events table
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text not null default '',
  date timestamptz not null,
  location text not null default '',
  category text check (category in (
    'church-service', 'youth', 'community-outreach', 'worship',
    'bible-study', 'prayer', 'social', 'other'
  )) default 'other',
  image_url text,
  latitude double precision,
  longitude double precision,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

-- Add columns if they don't exist yet (for older installs)
alter table public.events add column if not exists latitude double precision;
alter table public.events add column if not exists longitude double precision;
alter table public.events add column if not exists image_url text;
alter table public.events add column if not exists category text check (category in (
  'church-service', 'youth', 'community-outreach', 'worship',
  'bible-study', 'prayer', 'social', 'other'
)) default 'other';

alter table public.events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Events are viewable by everyone' and tablename = 'events') then
    create policy "Events are viewable by everyone" on public.events for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Vendors can create events' and tablename = 'events') then
    create policy "Vendors can create events" on public.events for insert
      with check (
        auth.uid() = created_by
        and exists (
          select 1 from public.profiles
          where id = auth.uid() and role = 'vendor'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Vendors can update own events' and tablename = 'events') then
    create policy "Vendors can update own events" on public.events for update using (auth.uid() = created_by);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Vendors can delete own events' and tablename = 'events') then
    create policy "Vendors can delete own events" on public.events for delete using (auth.uid() = created_by);
  end if;
end $$;

-- 3. RSVPs table
create table if not exists public.rsvps (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_id uuid references public.events(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.rsvps enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own rsvps' and tablename = 'rsvps') then
    create policy "Users can view own rsvps" on public.rsvps for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event creators can view rsvps' and tablename = 'rsvps') then
    create policy "Event creators can view rsvps" on public.rsvps for select
      using (
        exists (
          select 1 from public.events
          where events.id = event_id and events.created_by = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can rsvp' and tablename = 'rsvps') then
    create policy "Authenticated users can rsvp" on public.rsvps for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can cancel own rsvp' and tablename = 'rsvps') then
    create policy "Users can cancel own rsvp" on public.rsvps for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 4. Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: drop and recreate to avoid "already exists" error
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
