-- ============================================
-- Citizens Connect - Database Schema
-- Canonical full schema (idempotent — safe to re-run)
-- Reflects all migrations through 011_interest_profile
-- ============================================

-- ── Helper: admin check ──────────────────────────────────
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

-- ══════════════════════════════════════════════
-- 1. Profiles (extends Supabase Auth users)
-- ══════════════════════════════════════════════
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null check (role in ('vendor', 'client', 'admin')) default 'client',
  avatar_url text,
  onboarding_completed boolean not null default false,
  notification_email text,
  home_latitude double precision,
  home_longitude double precision,
  notification_radius_km int not null default 50,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

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

-- ══════════════════════════════════════════════
-- 2. Events
-- ══════════════════════════════════════════════
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text not null default '',
  date timestamptz not null,
  end_time timestamptz,
  location text not null default '',
  category text check (category in (
    'church-service', 'youth', 'community-outreach', 'worship',
    'bible-study', 'prayer', 'social', 'other'
  )) default 'other',
  image_url text,
  website_url text,
  contact_email text,
  contact_phone text,
  max_attendees int,
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  attendees_visible text not null default 'authenticated' check (attendees_visible in ('public', 'authenticated', 'count_only')),
  latitude double precision,
  longitude double precision,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create index if not exists events_status_date_idx on public.events(status, date);
create index if not exists events_created_by_idx on public.events(created_by);

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Published events visible to all, drafts to creator only' and tablename = 'events') then
    create policy "Published events visible to all, drafts to creator only" on public.events for select using (
      status = 'published'
      or status = 'cancelled'
      or created_by = auth.uid()
      or public.is_admin()
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can create events' and tablename = 'events') then
    create policy "Authenticated users can create events" on public.events for insert
      with check (
        auth.uid() = created_by
      );
  end if;
end $$;

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

-- ══════════════════════════════════════════════
-- 3. RSVPs
-- ══════════════════════════════════════════════
create table if not exists public.rsvps (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_id uuid references public.events(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create index if not exists rsvps_event_id_idx on public.rsvps(event_id);
create index if not exists rsvps_user_id_idx on public.rsvps(user_id);

alter table public.rsvps enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'RSVPs are viewable by everyone' and tablename = 'rsvps') then
    create policy "RSVPs are viewable by everyone" on public.rsvps for select using (true);
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

-- ══════════════════════════════════════════════
-- 4. Comments
-- ══════════════════════════════════════════════
create table if not exists public.comments (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create index if not exists comments_event_id_idx on public.comments(event_id);

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

-- ══════════════════════════════════════════════
-- 5. Categories (DB-driven)
-- ══════════════════════════════════════════════
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

-- ══════════════════════════════════════════════
-- 6. Places (persistent map listings)
-- ══════════════════════════════════════════════
create table if not exists public.places (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text not null default '',
  address text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  custom_category text,
  image_url text,
  phone text,
  website text,
  latitude double precision not null,
  longitude double precision not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  verified boolean not null default false,
  verification_flagged boolean not null default false,
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

-- ══════════════════════════════════════════════
-- 7. Reviews (for places and events)
-- ══════════════════════════════════════════════
create table if not exists public.reviews (
  id uuid default gen_random_uuid() primary key,
  place_id uuid references public.places(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade not null,
  rating int not null check (rating >= 1 and rating <= 5),
  body text not null default '',
  still_exists boolean not null default true,
  created_at timestamptz not null default now(),
  constraint reviews_one_target_check check (
    (place_id is not null and event_id is null)
    or (place_id is null and event_id is not null)
  )
);

create unique index if not exists reviews_place_user_unique
  on public.reviews(place_id, user_id) where place_id is not null;

create unique index if not exists reviews_event_user_unique
  on public.reviews(event_id, user_id) where event_id is not null;

create index if not exists reviews_place_id_idx
  on public.reviews(place_id) where place_id is not null;

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

-- ══════════════════════════════════════════════
-- 8. Event Photos
-- ══════════════════════════════════════════════
create table if not exists public.event_photos (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  url text not null,
  sort_order int not null default 0,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.event_photos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event photos are viewable by everyone' and tablename = 'event_photos') then
    create policy "Event photos are viewable by everyone" on public.event_photos for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can upload event photos' and tablename = 'event_photos') then
    create policy "Authenticated users can upload event photos" on public.event_photos for insert with check (auth.uid() = uploaded_by);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Photo uploader or admin can delete photos' and tablename = 'event_photos') then
    create policy "Photo uploader or admin can delete photos" on public.event_photos for delete using (
      auth.uid() = uploaded_by or public.is_admin()
    );
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 9. Event Views (analytics)
-- ══════════════════════════════════════════════
create table if not exists public.event_views (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  view_date date not null default current_date,
  viewed_at timestamptz not null default now()
);

-- Unique: one view per authenticated user per day per event
create unique index if not exists event_views_user_day_idx
  on public.event_views (event_id, user_id, view_date)
  where user_id is not null;

create index if not exists event_views_event_id_idx on public.event_views(event_id);

alter table public.event_views enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can record own views' and tablename = 'event_views') then
    create policy "Authenticated users can record own views" on public.event_views for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event creator and admin can see views' and tablename = 'event_views') then
    create policy "Event creator and admin can see views" on public.event_views for select using (
      public.is_admin() or exists (
        select 1 from public.events where events.id = event_views.event_id and events.created_by = auth.uid()
      )
    );
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 10. Functions & Triggers
-- ══════════════════════════════════════════════

-- Auto-create profile on signup
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-flag places with repeated "no longer exists" signals
create or replace function public.recompute_place_verification(p_place_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  signal_count int;
begin
  select count(*)::int into signal_count
  from public.reviews
  where place_id = p_place_id
    and still_exists = false;

  if signal_count >= 3 then
    update public.places
    set verified = false,
        verification_flagged = true
    where id = p_place_id;
  else
    update public.places
    set verification_flagged = false
    where id = p_place_id;
  end if;
end;
$$;

create or replace function public.handle_place_review_verification()
returns trigger
language plpgsql
security definer
as $$
declare
  affected_place uuid;
begin
  affected_place := coalesce(new.place_id, old.place_id);

  if affected_place is not null then
    perform public.recompute_place_verification(affected_place);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_review_place_verification on public.reviews;

create trigger trg_review_place_verification
after insert or update or delete on public.reviews
for each row
execute function public.handle_place_review_verification();

-- ══════════════════════════════════════════════
-- 8. Follows (Social Graph)
-- ══════════════════════════════════════════════
create table if not exists public.follows (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_no_self_follow check (follower_id != followee_id),
  constraint follows_unique unique (follower_id, followee_id)
);

create index if not exists follows_follower_idx on public.follows(follower_id);
create index if not exists follows_followee_idx on public.follows(followee_id);

alter table public.follows enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Follows are viewable by everyone' and tablename = 'follows') then
    create policy "Follows are viewable by everyone" on public.follows for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can follow others' and tablename = 'follows') then
    create policy "Users can follow others" on public.follows for insert with check (auth.uid() = follower_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can unfollow' and tablename = 'follows') then
    create policy "Users can unfollow" on public.follows for delete using (auth.uid() = follower_id);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 11. RPC Functions (Performance)
-- ══════════════════════════════════════════════

-- Trending events: server-side aggregation (replaces full rsvps table scan)
create or replace function public.trending_events(lim int default 5)
returns table(event_id uuid, rsvp_count bigint)
language sql stable
security definer
as $$
  select r.event_id, count(*) as rsvp_count
  from public.rsvps r
  join public.events e on e.id = r.event_id
  where e.status = 'published' and e.date >= now()
  group by r.event_id
  order by rsvp_count desc
  limit lim;
$$;

-- Atomic RSVP with capacity check (prevents race condition)
create or replace function public.safe_rsvp(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_status text;
  v_max int;
  v_current int;
  v_remaining int;
begin
  select status, max_attendees into v_status, v_max
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  if v_status != 'published' then
    return jsonb_build_object('success', false, 'error', 'Cannot RSVP to a ' || v_status || ' event', 'status', 400);
  end if;

  if v_max is not null then
    select count(*)::int into v_current
    from public.rsvps
    where event_id = p_event_id;

    if v_current >= v_max then
      return jsonb_build_object('success', false, 'error', 'Event is full', 'remaining', 0, 'status', 409);
    end if;

    v_remaining := v_max - v_current - 1;
  else
    v_remaining := null;
  end if;

  begin
    insert into public.rsvps (user_id, event_id)
    values (p_user_id, p_event_id);
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error', 'Already RSVPed to this event', 'status', 409);
  end;

  return jsonb_build_object('success', true, 'remaining', v_remaining, 'status', 201);
end;
$$;

-- ══════════════════════════════════════════════
-- Interest Groups
-- ══════════════════════════════════════════════
create table if not exists public.interest_groups (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  label text not null,
  sort_order int not null default 0
);

alter table public.interest_groups enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Interest groups are viewable by everyone' and tablename = 'interest_groups') then
    create policy "Interest groups are viewable by everyone" on public.interest_groups for select using (true);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- Interests
-- ══════════════════════════════════════════════
create table if not exists public.interests (
  id uuid default gen_random_uuid() primary key,
  group_id uuid not null references public.interest_groups(id) on delete cascade,
  slug text not null unique,
  label text not null,
  emoji text not null default '📌',
  sort_order int not null default 0
);

alter table public.interest_groups enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Interests are viewable by everyone' and tablename = 'interests') then
    create policy "Interests are viewable by everyone" on public.interests for select using (true);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- User Interests (composite PK)
-- ══════════════════════════════════════════════
create table if not exists public.user_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);

alter table public.user_interests enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'User interests are viewable by everyone' and tablename = 'user_interests') then
    create policy "User interests are viewable by everyone" on public.user_interests for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage own interests' and tablename = 'user_interests') then
    create policy "Users can manage own interests" on public.user_interests for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own interests' and tablename = 'user_interests') then
    create policy "Users can delete own interests" on public.user_interests for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- Event Interest Tags (composite PK)
-- ══════════════════════════════════════════════
create table if not exists public.event_interest_tags (
  event_id uuid not null references public.events(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  primary key (event_id, interest_id)
);

alter table public.event_interest_tags enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event interest tags are viewable by everyone' and tablename = 'event_interest_tags') then
    create policy "Event interest tags are viewable by everyone" on public.event_interest_tags for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event creators can manage interest tags' and tablename = 'event_interest_tags') then
    create policy "Event creators can manage interest tags" on public.event_interest_tags for insert
      with check (
        exists (select 1 from public.events where id = event_id and (created_by = auth.uid() or public.is_admin()))
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event creators can delete interest tags' and tablename = 'event_interest_tags') then
    create policy "Event creators can delete interest tags" on public.event_interest_tags for delete
      using (
        exists (select 1 from public.events where id = event_id and (created_by = auth.uid() or public.is_admin()))
      );
  end if;
end $$;

-- Interest indexes
create index if not exists user_interests_user_idx on public.user_interests(user_id);
create index if not exists user_interests_interest_idx on public.user_interests(interest_id);
create index if not exists event_interest_tags_event_idx on public.event_interest_tags(event_id);
create index if not exists event_interest_tags_interest_idx on public.event_interest_tags(interest_id);
create index if not exists interests_group_idx on public.interests(group_id);
