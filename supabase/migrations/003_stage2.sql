-- ============================================
-- Migration 003: Stage 2 additions
-- Add image_url to events + create comments table
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add cover image URL to events
alter table public.events
  add column if not exists image_url text;

-- 2. Comments table
create table if not exists public.comments (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  body text not null check (char_length(body) > 0 and char_length(body) <= 1000),
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
    create policy "Authenticated users can comment" on public.comments for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own comments' and tablename = 'comments') then
    create policy "Users can delete own comments" on public.comments for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- 3. Create Supabase Storage bucket for event images (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true)
-- on conflict do nothing;
