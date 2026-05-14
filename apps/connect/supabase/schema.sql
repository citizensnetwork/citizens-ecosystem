-- ============================================
-- Citizens Connect - Database Schema
-- Canonical full schema (idempotent — safe to re-run)
-- Reflects all migrations through 019_live_location
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
-- Role model collapsed in migration 033 from a seven-way enum to a clean
-- three-way model.  `contributor_kind` preserves the historical sub-type
-- (ministry / organization / business) for contributors who want to
-- declare it; it's nullable for citizens, admins, and contributors who
-- haven't picked one.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null
    check (role in ('citizen', 'contributor', 'admin'))
    default 'citizen',
  contributor_kind text
    check (contributor_kind is null or contributor_kind in ('ministry', 'organization', 'business')),
  avatar_url text,
  onboarding_completed boolean not null default false,
  notification_email text,
  home_latitude double precision,
  home_longitude double precision,
  notification_radius_km int not null default 50,
  -- Lightweight per-user preference bag (migration 034).  Houses the
  -- Would-You-Rather answers under preferences.wyr.
  preferences jsonb not null default '{}'::jsonb,
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
  if not exists (select 1 from pg_policies where policyname = 'Admins can update any profile' and tablename = 'profiles') then
    create policy "Admins can update any profile" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
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
    'worship-prayer', 'church-services', 'outreach-missions', 'markets-expos',
    'sport-recreation', 'arts-culture', 'social-gatherings', 'community-upliftment',
    'education-equipping', 'marriage-family', 'mens-community', 'womens-community',
    'youth-students', 'kids', 'care-recovery', 'members-only', 'conferences-summits'
  )) default 'church-services',
  category_id uuid references public.categories(id) on delete set null,
  image_url text,
  website_url text,
  contact_email text,
  contact_phone text,
  max_attendees int,
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  attendees_visible text not null default 'authenticated' check (attendees_visible in ('public', 'authenticated', 'count_only')),
  latitude double precision,
  longitude double precision,
  search_profile jsonb,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

-- Ensure column exists for pre-existing databases (see migration 032).
alter table public.events add column if not exists search_profile jsonb;

alter table public.events enable row level security;

create index if not exists events_status_date_idx on public.events(status, date);
create index if not exists events_created_by_idx on public.events(created_by);
create index if not exists events_visibility_idx on public.events(visibility);
create index if not exists events_search_profile_gin_idx on public.events using gin (search_profile jsonb_path_ops);

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

-- Seed default categories (refined v2 taxonomy: 17 event-applies + 10 place-applies)
-- Hex + emoji values must mirror supabase/migrations/064_refine_categories_v2.sql
-- and src/lib/categories.ts (CATEGORY_HEX / PLACE_CATEGORY_HEX). Update all three together.
insert into public.categories (name, slug, emoji, color, applies_to, sort_order) values
  -- Event-applies (sort_order 1..17)
  ('Worship & Prayer',      'worship-prayer',      '🙏',  '#B8860B', 'events', 1),
  ('Church Services',       'church-services',     '⛪',  '#D4AF37', 'events', 2),
  ('Outreach & Missions',   'outreach-missions',   '🌍',  '#1ABC9C', 'events', 3),
  ('Markets & Expos',       'markets-expos',       '🛍️', '#F39C12', 'events', 4),
  ('Sport & Recreation',    'sport-recreation',    '⚽',  '#2ECC71', 'events', 5),
  ('Arts & Culture',        'arts-culture',        '🎭',  '#FF6B35', 'events', 6),
  ('Social Gatherings',     'social-gatherings',   '☕',  '#E91E63', 'events', 7),
  ('Community Upliftment',  'community-upliftment','🤝',  '#9B59B6', 'events', 8),
  ('Education & Equipping', 'education-equipping', '📚',  '#3498DB', 'events', 9),
  ('Marriage & Family',     'marriage-family',     '💍',  '#E74C3C', 'events', 10),
  ('Men''s Community',      'mens-community',      '👔',  '#34495E', 'events', 11),
  ('Women''s Community',    'womens-community',    '👗',  '#C71585', 'events', 12),
  ('Youth & Students',      'youth-students',      '🔥',  '#FF8C42', 'events', 13),
  ('Kids',                  'kids',                '🧒',  '#00BCD4', 'events', 14),
  ('Care & Recovery',       'care-recovery',       '💗',  '#8E44AD', 'events', 15),
  ('Members Only',          'members-only',        '🔒',  '#212121', 'events', 16),
  ('Conferences & Summits', 'conferences-summits', '🎤',  '#5D6D7E', 'events', 17),
  -- Place-applies (sort_order 101..110)
  ('Churches & Ministries', 'churches-ministries', '⛪',  '#D4AF37', 'places', 101),
  ('Hospitality & Cafés',   'hospitality-cafes',   '☕',  '#8B4513', 'places', 102),
  ('Recreation & Sport',    'recreation-sport',    '🏃',  '#2ECC71', 'places', 103),
  ('Media & Broadcasting',  'media-broadcasting',  '📻',  '#9B59B6', 'places', 104),
  ('Retail & Shopping',     'retail-shopping',     '🛍️', '#E91E63', 'places', 105),
  ('Health & Wellness',     'health-wellness',     '🩺',  '#E74C3C', 'places', 106),
  ('Education & Training',  'education-training',  '📚',  '#3498DB', 'places', 107),
  ('Arts & Creative',       'arts-creative',       '🎨',  '#FF6B35', 'places', 108),
  ('Christian Businesses',  'christian-businesses','🏢',  '#A67C00', 'places', 109),
  ('Safe Spaces',           'safe-spaces',         '🕊️', '#B59CD9', 'places', 110)
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
  search_profile jsonb,
  created_by uuid references public.profiles(id) on delete cascade not null,
  verified boolean not null default false,
  verification_flagged boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ensure column exists for pre-existing databases (see migration 032).
alter table public.places add column if not exists search_profile jsonb;

alter table public.places enable row level security;

create index if not exists places_search_profile_gin_idx on public.places using gin (search_profile jsonb_path_ops);

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

create index if not exists reviews_event_id_idx
  on public.reviews(event_id) where event_id is not null;

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
  kind text not null default 'image' check (kind in ('image', 'video')),
  thumbnail_url text,
  title text,
  sort_order int not null default 0,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists event_photos_event_sort_idx
  on public.event_photos (event_id, sort_order);

alter table public.event_photos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event photos are viewable by everyone' and tablename = 'event_photos') then
    create policy "Event photos are viewable by everyone" on public.event_photos for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event owners or admins can upload event photos' and tablename = 'event_photos') then
    create policy "Event owners or admins can upload event photos" on public.event_photos
      for insert with check (
        auth.uid() = uploaded_by
        and exists (
          select 1 from public.events e
          where e.id = event_id
            and (e.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event owners or admins can update event photos' and tablename = 'event_photos') then
    create policy "Event owners or admins can update event photos" on public.event_photos
      for update using (
        exists (
          select 1 from public.events e
          where e.id = event_id
            and (e.created_by = auth.uid() or public.is_admin())
        )
      ) with check (
        exists (
          select 1 from public.events e
          where e.id = event_id
            and (e.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event owners, admins, or uploaders can delete event photos' and tablename = 'event_photos') then
    create policy "Event owners, admins, or uploaders can delete event photos" on public.event_photos
      for delete using (
        auth.uid() = uploaded_by
        or exists (
          select 1 from public.events e
          where e.id = event_id
            and (e.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 8b. Place Media
-- ══════════════════════════════════════════════
create table if not exists public.place_media (
  id uuid default gen_random_uuid() primary key,
  place_id uuid not null references public.places(id) on delete cascade,
  url text not null,
  kind text not null default 'image' check (kind in ('image', 'video')),
  thumbnail_url text,
  title text,
  sort_order int not null default 0,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists place_media_place_sort_idx
  on public.place_media (place_id, sort_order);

alter table public.place_media enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Place media are viewable by everyone' and tablename = 'place_media') then
    create policy "Place media are viewable by everyone" on public.place_media for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Place owners or admins can upload place media' and tablename = 'place_media') then
    create policy "Place owners or admins can upload place media" on public.place_media
      for insert with check (
        auth.uid() = uploaded_by
        and exists (
          select 1 from public.places p
          where p.id = place_id
            and (p.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Place owners or admins can update place media' and tablename = 'place_media') then
    create policy "Place owners or admins can update place media" on public.place_media
      for update using (
        exists (
          select 1 from public.places p
          where p.id = place_id
            and (p.created_by = auth.uid() or public.is_admin())
        )
      ) with check (
        exists (
          select 1 from public.places p
          where p.id = place_id
            and (p.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Place owners or admins can delete place media' and tablename = 'place_media') then
    create policy "Place owners or admins can delete place media" on public.place_media
      for delete using (
        exists (
          select 1 from public.places p
          where p.id = place_id
            and (p.created_by = auth.uid() or public.is_admin())
        )
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

-- Auto-create profile on signup.  Reflects the citizen / contributor /
-- admin role model post-migration 033.  Both `role` and the optional
-- `contributor_kind` are read from the user metadata supplied by the
-- signup form; admin still requires manual elevation in the database.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  signup_role text;
  signup_kind text;
begin
  signup_role := coalesce(new.raw_user_meta_data->>'role', 'citizen');
  signup_kind := nullif(new.raw_user_meta_data->>'contributor_kind', '');

  if signup_role not in ('citizen', 'contributor') then
    signup_role := 'citizen';
  end if;

  if signup_kind is not null
     and signup_kind not in ('ministry', 'organization', 'business') then
    signup_kind := null;
  end if;

  -- contributor_kind is only meaningful for contributors
  if signup_role <> 'contributor' then
    signup_kind := null;
  end if;

  insert into public.profiles (id, email, full_name, role, contributor_kind)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    signup_role,
    signup_kind
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Prevent role self-escalation via profile UPDATE
create or replace function public.protect_role_column()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    ) then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_role_trigger on public.profiles;
create trigger protect_role_trigger
  before update on public.profiles
  for each row execute function public.protect_role_column();

-- Helper: check if current user is an organiser-tier role.  The function
-- name is preserved across the role rename (migration 033) so RLS
-- policies on places, event_updates, etc. don't need to be updated.
create or replace function public.is_organiser()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('contributor', 'admin')
  );
$$ language sql security definer stable;

-- Auto-sync category_id from text category column
create or replace function public.sync_event_category_id()
returns trigger as $$
begin
  if new.category is not null and new.category_id is null then
    select id into new.category_id from public.categories where slug = new.category;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists sync_event_category_id_trigger on public.events;
create trigger sync_event_category_id_trigger
  before insert or update of category on public.events
  for each row execute function public.sync_event_category_id();

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

-- ══════════════════════════════════════════════
-- Push Tokens (Phase 10)
-- ══════════════════════════════════════════════
create table if not exists public.push_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users read own push tokens' and tablename = 'push_tokens') then
    create policy "Users read own push tokens" on public.push_tokens for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users insert own push tokens' and tablename = 'push_tokens') then
    create policy "Users insert own push tokens" on public.push_tokens for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users delete own push tokens' and tablename = 'push_tokens') then
    create policy "Users delete own push tokens" on public.push_tokens for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- Notifications (Phase 10)
-- ══════════════════════════════════════════════
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('event_reminder', 'new_event_match', 'event_cancelled', 'new_follower', 'event_update')),
  title text not null,
  body text not null default '',
  image_url text,
  data jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

alter table public.notifications enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users read own notifications' and tablename = 'notifications') then
    create policy "Users read own notifications" on public.notifications for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users update own notifications' and tablename = 'notifications') then
    create policy "Users update own notifications" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Admin insert notifications' and tablename = 'notifications') then
    create policy "Admin insert notifications" on public.notifications for insert with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users delete own notifications' and tablename = 'notifications') then
    create policy "Users delete own notifications" on public.notifications for delete using (auth.uid() = user_id);
  end if;
end $$;

-- notification_digest column on profiles
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'notification_digest') then
    alter table public.profiles add column notification_digest text default 'instant' check (notification_digest in ('instant', 'daily', 'off'));
  end if;
end $$;

-- Notification indexes
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications(user_id) where read = false;
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

-- ══════════════════════════════════════════════
-- 14. Conversations (Phase 11 — Direct Messaging)
-- ══════════════════════════════════════════════
create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  last_read_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants enable row level security;
create index if not exists idx_conv_participants_user on public.conversation_participants(user_id);

create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_sender on public.messages(sender_id);

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Participants can view conversations' and tablename = 'conversations') then
    create policy "Participants can view conversations" on public.conversations
      for select using (exists (select 1 from public.conversation_participants where conversation_id = conversations.id and user_id = auth.uid()) or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Authenticated users can create conversations' and tablename = 'conversations') then
    create policy "Authenticated users can create conversations" on public.conversations for insert with check (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users see participants of their conversations' and tablename = 'conversation_participants') then
    create policy "Users see participants of their conversations" on public.conversation_participants for select using (
      exists (select 1 from public.conversation_participants cp where cp.conversation_id = conversation_participants.conversation_id and cp.user_id = auth.uid()) or public.is_admin()
    );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Only RPC or admin can add participants' and tablename = 'conversation_participants') then
    create policy "Only RPC or admin can add participants" on public.conversation_participants for insert with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Participants can update own read status' and tablename = 'conversation_participants') then
    create policy "Participants can update own read status" on public.conversation_participants for update using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Participants can view messages' and tablename = 'messages') then
    create policy "Participants can view messages" on public.messages for select using (
      exists (select 1 from public.conversation_participants where conversation_id = messages.conversation_id and user_id = auth.uid()) or public.is_admin()
    );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Participants can send messages' and tablename = 'messages') then
    create policy "Participants can send messages" on public.messages for insert with check (
      sender_id = auth.uid() and exists (select 1 from public.conversation_participants where conversation_id = messages.conversation_id and user_id = auth.uid())
    );
  end if;
end $$;

create or replace function public.find_or_create_conversation(user_a uuid, user_b uuid)
returns uuid language plpgsql security definer as $$
declare
  conv_id uuid;
begin
  if user_a = user_b then
    raise exception 'Cannot create conversation with yourself';
  end if;
  select cp1.conversation_id into conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2 on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = user_a and cp2.user_id = user_b limit 1;
  if conv_id is not null then return conv_id; end if;
  insert into public.conversations default values returning id into conv_id;
  insert into public.conversation_participants (conversation_id, user_id) values (conv_id, user_a), (conv_id, user_b);
  return conv_id;
end;
$$;

-- Legacy alias kept for backward compat
create or replace function public.find_conversation(user_a uuid, user_b uuid)
returns uuid language sql stable as $$
  select cp1.conversation_id from public.conversation_participants cp1
  join public.conversation_participants cp2 on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = user_a and cp2.user_id = user_b limit 1;
$$;

create or replace function public.update_conversation_timestamp()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_sent on public.messages;
create trigger on_message_sent after insert on public.messages
  for each row execute function public.update_conversation_timestamp();

-- ══════════════════════════════════════════════
-- 15. Utility RPCs
-- ══════════════════════════════════════════════

-- Count mutual (bidirectional) follows for a user
create or replace function public.count_friends(target_user uuid)
returns bigint language sql stable as $$
  select count(*)
  from public.follows f1
  join public.follows f2
    on f1.followee_id = f2.follower_id
   and f1.follower_id = f2.followee_id
  where f1.follower_id = target_user;
$$;

-- ══════════════════════════════════════════════
-- 16. Place Follows
-- ══════════════════════════════════════════════
create table if not exists public.place_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  place_id uuid references public.places(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, place_id)
);

alter table public.place_follows enable row level security;
create index if not exists idx_place_follows_user on public.place_follows(user_id);
create index if not exists idx_place_follows_place on public.place_follows(place_id);

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Anyone can view place follows' and tablename = 'place_follows') then
    create policy "Anyone can view place follows" on public.place_follows for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Auth users can follow places' and tablename = 'place_follows') then
    create policy "Auth users can follow places" on public.place_follows for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can unfollow places' and tablename = 'place_follows') then
    create policy "Users can unfollow places" on public.place_follows for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 17. Featured Listings (removed in Batch 2 — see migration 065)
-- ══════════════════════════════════════════════
-- The legacy featured_listings table was dropped in
-- 065_batch2_cleanup_and_security.sql; intentionally kept out of the
-- canonical schema dump.

-- ══════════════════════════════════════════════
-- 18. Live Location Sharing
-- ══════════════════════════════════════════════
create table if not exists public.user_locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  accuracy    double precision,
  updated_at  timestamptz not null default now(),
  unique(user_id, event_id)
);

alter table public.user_locations enable row level security;

create index if not exists idx_user_locations_event on public.user_locations (event_id, updated_at desc);
create index if not exists idx_user_locations_user on public.user_locations (user_id);

alter table public.profiles add column if not exists location_sharing boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Attendees can view event locations' and tablename = 'user_locations') then
    create policy "Attendees can view event locations" on public.user_locations for select
      using (exists (select 1 from public.rsvps where rsvps.event_id = user_locations.event_id and rsvps.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can upsert own location' and tablename = 'user_locations') then
    create policy "Users can upsert own location" on public.user_locations for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can update own location' and tablename = 'user_locations') then
    create policy "Users can update own location" on public.user_locations for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own location' and tablename = 'user_locations') then
    create policy "Users can delete own location" on public.user_locations for delete using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.cleanup_stale_locations()
returns void language plpgsql security definer as $$
begin
  delete from public.user_locations ul
  where not exists (
    select 1 from public.events e
    where e.id = ul.event_id
      and (
        (e.end_time is not null and e.end_time::timestamptz > now() - interval '30 minutes')
        or
        (e.end_time is null and e.date::timestamptz + interval '4 hours' > now() - interval '30 minutes')
      )
  );
end;
$$;

-- ══════════════════════════════════════════════
-- Event Updates (migration 030)
-- ══════════════════════════════════════════════

create table if not exists public.event_updates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists event_updates_event_created_idx
  on public.event_updates (event_id, created_at desc);

alter table public.event_updates enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'event_updates_select_all' and tablename = 'event_updates') then
    create policy event_updates_select_all on public.event_updates for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'event_updates_insert_creator' and tablename = 'event_updates') then
    create policy event_updates_insert_creator on public.event_updates for insert with check (
      auth.uid() = author_id and (
        exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
    );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'event_updates_delete_author_or_admin' and tablename = 'event_updates') then
    create policy event_updates_delete_author_or_admin on public.event_updates for delete using (
      auth.uid() = author_id
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ===========================================================================
-- FEAT-03 contributor fuzzy search (Batch 3, migrations 066/067/068)
-- pg_trgm in the `extensions` schema, plus the search_contributors RPC.
-- Idempotent.
-- ===========================================================================
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Trigram indexes on profile name/bio for fuzzy contributor search.
create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (lower(full_name) extensions.gin_trgm_ops);
create index if not exists profiles_bio_trgm_idx
  on public.profiles using gin (lower(bio) extensions.gin_trgm_ops);

create or replace function public.search_contributors(
  q              text default null,
  kinds          text[] default null,
  location_query text default null,
  category_slug  text default null,
  sort_by        text default 'auto',
  result_limit   int  default 25
)
returns table (
  id                uuid,
  full_name         text,
  contributor_slug  text,
  contributor_kind  text,
  logo_url          text,
  avatar_url        text,
  physical_address  text,
  bio               text,
  followers_count   bigint,
  similarity        real
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with norm as (
    select
      nullif(lower(coalesce(q, '')), '')              as qn,
      nullif(lower(coalesce(location_query, '')), '') as locn
  ), esc as (
    select
      qn,
      locn,
      replace(replace(replace(qn,   '\', '\\'), '%', '\%'), '_', '\_') as qn_like,
      replace(replace(replace(locn, '\', '\\'), '%', '\%'), '_', '\_') as locn_like
    from norm
  ), base as (
    select
      p.id,
      p.full_name,
      p.contributor_slug,
      p.contributor_kind,
      p.logo_url,
      p.avatar_url,
      p.physical_address,
      p.bio,
      (select count(*)::bigint from public.follows f where f.followee_id = p.id) as followers_count,
      case
        when (select qn from esc) is null then 0
        else greatest(
          extensions.word_similarity((select qn from esc), lower(coalesce(p.full_name, ''))),
          extensions.similarity(lower(coalesce(p.full_name, '')), (select qn from esc))
        )
      end::real as similarity
    from public.profiles p
    where p.role = 'contributor'
      and p.contributor_status = 'approved'
      and p.contributor_slug is not null
      and (
        (select qn from esc) is null
        or extensions.word_similarity((select qn from esc), lower(coalesce(p.full_name, ''))) >= 0.3
        or lower(coalesce(p.full_name, '')) ilike '%' || (select qn_like from esc) || '%' escape '\'
        or lower(coalesce(p.bio, ''))       ilike '%' || (select qn_like from esc) || '%' escape '\'
      )
      and (kinds is null or p.contributor_kind = any(kinds))
      and (
        (select locn from esc) is null
        or lower(coalesce(p.physical_address, '')) ilike '%' || (select locn_like from esc) || '%' escape '\'
      )
      and (
        category_slug is null
        or exists (select 1 from public.events e where e.created_by = p.id and e.category = category_slug)
      )
  )
  select *
  from base
  order by
    case when sort_by = 'similarity' or (sort_by = 'auto' and (select qn from esc) is not null) then base.similarity end desc nulls last,
    case when sort_by in ('followers', 'auto') then base.followers_count end desc nulls last,
    base.full_name asc
  limit greatest(1, least(coalesce(result_limit, 25), 100));
$$;

revoke all on function public.search_contributors(text, text[], text, text, text, int) from public;
grant execute on function public.search_contributors(text, text[], text, text, text, int) to anon, authenticated;

