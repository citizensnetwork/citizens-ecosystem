-- ============================================
-- Phase 8: Social Graph — Follows
-- ============================================

-- Follows table: A follows B. If both A→B and B→A exist, they are friends.
create table if not exists public.follows (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_no_self_follow check (follower_id != followee_id),
  constraint follows_unique unique (follower_id, followee_id)
);

-- Indexes for common lookups
create index if not exists follows_follower_idx on public.follows(follower_id);
create index if not exists follows_followee_idx on public.follows(followee_id);

alter table public.follows enable row level security;

-- Everyone can see who follows whom
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Follows are viewable by everyone' and tablename = 'follows') then
    create policy "Follows are viewable by everyone" on public.follows for select using (true);
  end if;
end $$;

-- Users can only create follows from themselves
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can follow others' and tablename = 'follows') then
    create policy "Users can follow others" on public.follows for insert with check (auth.uid() = follower_id);
  end if;
end $$;

-- Users can only delete their own follows
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can unfollow' and tablename = 'follows') then
    create policy "Users can unfollow" on public.follows for delete using (auth.uid() = follower_id);
  end if;
end $$;
