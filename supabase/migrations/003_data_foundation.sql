-- ============================================
-- Migration 003: Phase 1 Data Foundation
-- Adds: comments, categories, places, reviews
-- Fixes: missing image_url on events
-- Run this in Supabase SQL Editor
-- ============================================

-- Fix: add image_url to events if missing
alter table public.events add column if not exists image_url text;

-- 1. Comments table
create table if not exists public.comments (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Comments are viewable by everyone' and tablename = 'comments') then
    create policy "Comments are viewable by everyone" on public.comments for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can comment' and tablename = 'comments') then
    create policy "Authenticated users can comment" on public.comments for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can update own comments' and tablename = 'comments') then
    create policy "Users can update own comments" on public.comments for update using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own comments' and tablename = 'comments') then
    create policy "Users can delete own comments" on public.comments for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 2. Categories table
create table if not exists public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  slug text not null unique,
  emoji text not null default '📌',
  color text not null default '#6b7280',
  applies_to text not null check (applies_to in ('events', 'places', 'both')) default 'both',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Categories are viewable by everyone' and tablename = 'categories') then
    create policy "Categories are viewable by everyone" on public.categories for select using (true);
  end if;
end $$;

-- Seed default categories
insert into public.categories (name, slug, emoji, color, applies_to, sort_order) values
  ('Church Service', 'church-service', '⛪', '#6366f1', 'both', 1),
  ('Youth', 'youth', '🌟', '#f59e0b', 'both', 2),
  ('Community Outreach', 'community-outreach', '🤝', '#10b981', 'both', 3),
  ('Worship', 'worship', '🎵', '#c8a24f', 'both', 4),
  ('Bible Study', 'bible-study', '📖', '#8b5cf6', 'both', 5),
  ('Prayer', 'prayer', '🙏', '#ec4899', 'both', 6),
  ('Social', 'social', '☕', '#06b6d4', 'both', 7),
  ('Other', 'other', '📌', '#6b7280', 'both', 8)
on conflict (slug) do nothing;

-- 3. Places table
create table if not exists public.places (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text not null default '',
  address text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  image_url text,
  phone text,
  website text,
  latitude double precision not null,
  longitude double precision not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.places enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Places are viewable by everyone' and tablename = 'places') then
    create policy "Places are viewable by everyone" on public.places for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can create places' and tablename = 'places') then
    create policy "Authenticated users can create places" on public.places for insert with check (auth.uid() = created_by);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Creators can update own places' and tablename = 'places') then
    create policy "Creators can update own places" on public.places for update using (auth.uid() = created_by);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Creators can delete own places' and tablename = 'places') then
    create policy "Creators can delete own places" on public.places for delete using (auth.uid() = created_by);
  end if;
end $$;

-- 4. Reviews table
create table if not exists public.reviews (
  id uuid default gen_random_uuid() primary key,
  place_id uuid references public.places(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  rating int not null check (rating >= 1 and rating <= 5),
  body text not null default '',
  still_exists boolean not null default true,
  created_at timestamptz not null default now(),
  unique (place_id, user_id)
);

alter table public.reviews enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Reviews are viewable by everyone' and tablename = 'reviews') then
    create policy "Reviews are viewable by everyone" on public.reviews for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can review' and tablename = 'reviews') then
    create policy "Authenticated users can review" on public.reviews for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can update own reviews' and tablename = 'reviews') then
    create policy "Users can update own reviews" on public.reviews for update using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own reviews' and tablename = 'reviews') then
    create policy "Users can delete own reviews" on public.reviews for delete using (auth.uid() = user_id);
  end if;
end $$;
