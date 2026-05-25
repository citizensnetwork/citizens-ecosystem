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

-- Server-enforced length cap (migration 087). Client cap is 1000; DB allows
-- headroom for legacy rows. Bypassable client paths are protected by the CHECK.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_body_length_chk'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_body_length_chk
      check (char_length(body) between 1 and 2000) not valid;
    alter table public.comments validate constraint comments_body_length_chk;
  end if;
end $$;

create index if not exists comments_event_id_idx on public.comments(event_id);
create index if not exists comments_user_id_idx on public.comments(user_id);

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

-- Admin write policies (mirrors migration 083).
-- Admins may create, modify, and delete categories via the /admin/categories
-- surface. No functional scope change -- this restores the originally-intended
-- write path that was blocked by RLS having only a SELECT policy.
-- VERIFICATION: after applying, run:
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='categories' order by cmd;
-- and mcp_supabase_get_advisors type:"security" (expect no new warnings).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'categories'
      and policyname = 'categories_insert_admin'
  ) then
    create policy "categories_insert_admin"
      on public.categories for insert
      to authenticated
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'categories'
      and policyname = 'categories_update_admin'
  ) then
    create policy "categories_update_admin"
      on public.categories for update
      to authenticated
      using  (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'categories'
      and policyname = 'categories_delete_admin'
  ) then
    create policy "categories_delete_admin"
      on public.categories for delete
      to authenticated
      using (public.is_admin());
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

-- Length CHECK constraints (migration 088). Forms only enforce maxLength on
-- custom_category; the DB constraints close storage-DoS via direct
-- supabase-js writes. NOT VALID + VALIDATE pattern; if any existing row
-- violates the bound the constraint stays NOT VALID for remediation.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('places_name_length_chk',
        'char_length(name) between 1 and 120'),
      ('places_description_length_chk',
        'char_length(description) between 0 and 4000'),
      ('places_address_length_chk',
        'char_length(address) between 0 and 500'),
      ('places_phone_length_chk',
        'phone is null or char_length(phone) <= 32'),
      ('places_website_length_chk',
        'website is null or char_length(website) <= 500'),
      ('places_custom_category_length_chk',
        'custom_category is null or char_length(custom_category) <= 120')
    ) as t(name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c.name and conrelid = 'public.places'::regclass
    ) then
      execute format(
        'alter table public.places add constraint %I check (%s) not valid',
        c.name, c.expr
      );
      begin
        execute format('alter table public.places validate constraint %I', c.name);
      exception when check_violation then
        raise notice 'constraint % left NOT VALID (existing rows fail check)', c.name;
      end;
    end if;
  end loop;
end $$;

-- 6-month delete window (migration 089). EditPlaceForm enforces client-side;
-- this trigger closes the bypass via direct supabase-js delete. Admins bypass.
create or replace function public.enforce_place_six_month_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.is_admin() then
    return old;
  end if;

  if old.created_at > (now() - interval '6 months') then
    raise exception 'places cannot be removed within 6 months of creation'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

revoke all on function public.enforce_place_six_month_delete() from public;
revoke all on function public.enforce_place_six_month_delete() from anon, authenticated;

drop trigger if exists trg_enforce_place_six_month_delete on public.places;
create trigger trg_enforce_place_six_month_delete
  before delete on public.places
  for each row execute function public.enforce_place_six_month_delete();

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

-- Atomic RSVP with capacity check (prevents race condition) — hardened in
-- migration 086 with auth.uid() guard, search_path lock, and minimal grants.
create or replace function public.safe_rsvp(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_max int;
  v_current int;
  v_remaining int;
begin
  -- Authorisation: only the authenticated caller may RSVP themselves.
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select status, max_attendees into v_status, v_max
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  if v_status <> 'published' then
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

revoke all on function public.safe_rsvp(uuid, uuid) from public;
grant execute on function public.safe_rsvp(uuid, uuid) to authenticated;

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
  is_system boolean not null default false,
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


-- --------------------------------------------------------------------
-- FEAT-04: Convince system + friend-activity notifications (migrations 069/070)
-- --------------------------------------------------------------------


-- Convinces table (FEAT-04: friend recommends an event to another friend who is "considering")
create table if not exists public.convinces (
  id uuid primary key default extensions.uuid_generate_v4(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id   uuid not null references public.profiles(id) on delete cascade,
  event_id     uuid not null references public.events(id)   on delete cascade,
  created_at   timestamptz not null default now(),
  constraint convinces_no_self check (from_user_id <> to_user_id),
  constraint convinces_unique unique (from_user_id, to_user_id, event_id)
);

create index if not exists convinces_to_event_idx on public.convinces (to_user_id, event_id);
create index if not exists convinces_from_idx     on public.convinces (from_user_id, event_id);

alter table public.convinces enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Convince participants can read' and tablename = 'convinces') then
    create policy "Convince participants can read" on public.convinces for select
      using (auth.uid() = from_user_id or auth.uid() = to_user_id);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Mutual followers can convince considering friends' and tablename = 'convinces') then
    create policy "Mutual followers can convince considering friends" on public.convinces for insert
      with check (
        auth.uid() = from_user_id
        and from_user_id <> to_user_id
        and exists (
          select 1 from public.follows f1
          join public.follows f2 on f2.follower_id = f1.followee_id and f2.followee_id = f1.follower_id
          where f1.follower_id = from_user_id and f1.followee_id = to_user_id
        )
        and exists (
          select 1 from public.rsvps r where r.user_id = to_user_id and r.event_id = convinces.event_id and r.status = 'considering'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Sender can revoke convince' and tablename = 'convinces') then
    create policy "Sender can revoke convince" on public.convinces for delete
      using (auth.uid() = from_user_id);
  end if;
end $$;

grant select, insert, delete on public.convinces to authenticated;

-- Notifications type allow-list � widen for FEAT-04
do $$ begin
  alter table public.notifications drop constraint if exists notifications_type_check;
  alter table public.notifications add constraint notifications_type_check check (type in (
    'event_reminder','new_event_match','event_cancelled','new_follower','event_update',
    'new_message','review_prompt','admin_elevation_request','friend_convince','friend_attending'
  ));
end $$;

-- Trigger: notify the recipient of a convince
create or replace function public.notify_on_convince()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sender_name text;
  event_title text;
  target_prefs jsonb;
begin
  select coalesce(full_name, 'Someone') into sender_name from public.profiles where id = new.from_user_id;
  select title into event_title from public.events where id = new.event_id;
  if event_title is null then return new; end if;
  select notification_prefs into target_prefs from public.profiles where id = new.to_user_id;
  if coalesce((target_prefs->>'friends_activity')::boolean, true) = false then return new; end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.to_user_id, 'friend_convince',
    sender_name || ' thinks you should go to ' || event_title,
    'Tap to revisit the event',
    jsonb_build_object('event_id', new.event_id, 'from_user_id', new.from_user_id)
  );
  return new;
end $$;

drop trigger if exists trg_notify_on_convince on public.convinces;
create trigger trg_notify_on_convince after insert on public.convinces
  for each row execute function public.notify_on_convince();

-- Trigger: notify mutual friends when a user RSVPs attending
create or replace function public.notify_friends_on_rsvp_attending()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_name text;
  event_title text;
begin
  if new.status is distinct from 'attending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'attending' then return new; end if;
  select coalesce(full_name, 'Someone') into actor_name from public.profiles where id = new.user_id;
  select title into event_title from public.events where id = new.event_id;
  if event_title is null then return new; end if;
  insert into public.notifications (user_id, type, title, body, data)
  select
    f1.follower_id, 'friend_attending',
    actor_name || ' is going to ' || event_title,
    'Tap to view the event',
    jsonb_build_object('event_id', new.event_id, 'actor_id', new.user_id)
  from public.follows f1
  join public.follows f2 on f2.follower_id = f1.followee_id and f2.followee_id = f1.follower_id
  join public.profiles p on p.id = f1.follower_id
  where f1.followee_id = new.user_id
    and f1.follower_id <> new.user_id
    and coalesce((p.notification_prefs->>'friends_activity')::boolean, true) = true
    and not exists (
      select 1 from public.notifications n
      where n.user_id = f1.follower_id
        and n.type = 'friend_attending'
        and (n.data->>'event_id')::uuid = new.event_id
        and (n.data->>'actor_id')::uuid = new.user_id
        and n.created_at > now() - interval '24 hours'
    );
  return new;
end $$;

drop trigger if exists trg_notify_friends_on_rsvp_attending on public.rsvps;
create trigger trg_notify_friends_on_rsvp_attending
  after insert or update of status on public.rsvps
  for each row execute function public.notify_friends_on_rsvp_attending();

-- toggle_consider RPC (FEAT-04 hardened; see migrations 022 + 070)
create or replace function public.toggle_consider(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;
  select id into v_existing from public.rsvps where user_id = p_user_id and event_id = p_event_id;
  if v_existing is not null then
    delete from public.rsvps where id = v_existing and status = 'considering';
    return jsonb_build_object('success', true, 'action', 'removed');
  else
    insert into public.rsvps (user_id, event_id, status) values (p_user_id, p_event_id, 'considering');
    return jsonb_build_object('success', true, 'action', 'added');
  end if;
end;
$$;

revoke all on function public.toggle_consider(uuid, uuid) from public;
grant execute on function public.toggle_consider(uuid, uuid) to authenticated;

-- ============================================================================
-- Batch 6 (migrations 072 + 073 + 074 + 075 + 076) � Citizens ecosystem
-- preparation: extended profile schema for Wear/Learn/Connect, content
-- labels with auto-labelling trigger, replica identity tightening, and
-- search RPC bio truncation.  Idempotent.
-- ============================================================================

-- Migration 072: profile extensions for cross-app personalisation.
alter table public.profiles
  add column if not exists wear_style_preferences jsonb not null default '{}'::jsonb,
  add column if not exists wear_wardrobe_visibility text not null default 'private'
    check (wear_wardrobe_visibility in ('public', 'private', 'friends')),
  add column if not exists learn_enrolled_listings uuid[] not null default '{}'::uuid[],
  add column if not exists connect_home_province text;

comment on column public.profiles.wear_style_preferences is 'Citizens Wear style preferences bag; free-form jsonb validated client-side.';
comment on column public.profiles.wear_wardrobe_visibility is 'Wear wardrobe visibility: public | private | friends. Default private.';
comment on column public.profiles.learn_enrolled_listings is 'Citizens Learn enrolled course/listing ids.';
comment on column public.profiles.connect_home_province is 'Connect-specific home province for province-level filtering.';

-- Migration 073 + 076: content_labels table + auto-label trigger.
create table if not exists public.content_labels (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('event', 'place', 'profile')),
  entity_id uuid not null,
  label text not null check (char_length(label) between 1 and 64),
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, label)
);

create index if not exists idx_content_labels_entity on public.content_labels (entity_type, entity_id);
create index if not exists idx_content_labels_label on public.content_labels (label);

alter table public.content_labels enable row level security;

drop policy if exists content_labels_select_all on public.content_labels;
drop policy if exists content_labels_select_public_entities on public.content_labels;
create policy content_labels_select_public_entities on public.content_labels
  for select using (entity_type in ('event', 'place'));

drop policy if exists content_labels_admin_write on public.content_labels;
create policy content_labels_admin_write on public.content_labels
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.apply_event_content_labels()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Clear rule-managed labels first so a category change clears stale tags.
  delete from public.content_labels
    where entity_type = 'event'
      and entity_id = new.id
      and label in ('market', 'education');

  if new.category = 'markets-expos' then
    insert into public.content_labels (entity_type, entity_id, label)
      values ('event', new.id, 'market')
      on conflict (entity_type, entity_id, label) do nothing;
  end if;
  if new.category in ('education-equipping', 'education', 'equip') then
    insert into public.content_labels (entity_type, entity_id, label)
      values ('event', new.id, 'education')
      on conflict (entity_type, entity_id, label) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.apply_event_content_labels() from public;
revoke execute on function public.apply_event_content_labels() from anon, authenticated;
grant execute on function public.apply_event_content_labels() to service_role;

drop trigger if exists trg_apply_event_content_labels on public.events;
create trigger trg_apply_event_content_labels
  after insert or update of category on public.events
  for each row execute function public.apply_event_content_labels();

-- Migration 077: cascade-cleanup of content_labels on entity delete.
create or replace function public.cleanup_content_labels_on_entity_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entity_type text := tg_argv[0];
begin
  delete from public.content_labels
    where entity_type = v_entity_type
      and entity_id = old.id;
  return old;
end;
$$;

revoke all on function public.cleanup_content_labels_on_entity_delete() from public;
revoke execute on function public.cleanup_content_labels_on_entity_delete() from anon, authenticated;
grant execute on function public.cleanup_content_labels_on_entity_delete() to service_role;

drop trigger if exists trg_cleanup_content_labels_event on public.events;
create trigger trg_cleanup_content_labels_event
  after delete on public.events
  for each row execute function public.cleanup_content_labels_on_entity_delete('event');

drop trigger if exists trg_cleanup_content_labels_place on public.places;
create trigger trg_cleanup_content_labels_place
  after delete on public.places
  for each row execute function public.cleanup_content_labels_on_entity_delete('place');

drop trigger if exists trg_cleanup_content_labels_profile on public.profiles;
create trigger trg_cleanup_content_labels_profile
  after delete on public.profiles
  for each row execute function public.cleanup_content_labels_on_entity_delete('profile');

-- Migration 074: replica identity full on event_updates so DELETE realtime
-- events arrive with the full old-row payload (drops the JS-side ghost filter).
alter table public.event_updates replica identity full;

-- =====================================================================
-- Batch 7b (migrations 079, 080) � Provinces lookup + array dedupe helper
-- =====================================================================

-- Migration 079 — Provinces lookup table + FK on profiles.connect_home_province
--
-- Batch 7b. Closes the deferred "SA-province CHECK" Architect nice-to-have from
-- Batch 6 by using a proper lookup table + FK instead of a CHECK constraint.
-- A lookup table beats a CHECK because:
--   1. Admin UI can edit the list without a schema change.
--   2. We can attach labels / display order / metadata to provinces later.
--   3. FK errors surface cleanly in PostgREST (23503) instead of generic CHECK.
--
-- The FK is intentionally DEFERRABLE INITIALLY IMMEDIATE so backfill / data
-- imports can defer the check inside a transaction if needed, while default
-- behaviour stays strict.

create table if not exists public.provinces (
  name text primary key,
  display_order int not null,
  created_at timestamptz not null default now()
);

comment on table public.provinces is
  'Lookup table of South African provinces. Referenced by profiles.connect_home_province.';

-- Seed the nine SA provinces idempotently.
insert into public.provinces (name, display_order) values
  ('Eastern Cape',   1),
  ('Free State',     2),
  ('Gauteng',        3),
  ('KwaZulu-Natal',  4),
  ('Limpopo',        5),
  ('Mpumalanga',     6),
  ('Northern Cape',  7),
  ('North West',     8),
  ('Western Cape',   9)
on conflict (name) do nothing;

-- Public read; no writes from the API.
alter table public.provinces enable row level security;

drop policy if exists "provinces read" on public.provinces;
create policy "provinces read"
  on public.provinces
  for select
  to anon, authenticated
  using (true);

-- Attach FK on profiles.connect_home_province only if it isn't already there.
do $$
begin
  if not exists (
    select 1
    from   pg_constraint
    where  conname = 'profiles_connect_home_province_fkey'
    and    conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_connect_home_province_fkey
      foreign key (connect_home_province)
      references public.provinces(name)
      on update cascade
      on delete set null
      deferrable initially immediate;
  end if;
end
$$;
-- Migration 080 — No-duplicates CHECK on profiles.learn_enrolled_listings
--
-- Batch 7b. Closes the deferred "CHECK no-dupes on learn_enrolled_listings"
-- Architect nice-to-have from Batch 6.
--
-- Postgres forbids subqueries directly inside CHECK expressions, so we wrap the
-- dedupe predicate in an IMMUTABLE helper function. The CHECK then calls the
-- function and Postgres is happy.

create or replace function public.uuid_array_has_no_duplicates(arr uuid[])
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select arr is null
      or cardinality(arr) = cardinality(array(select distinct unnest(arr)));
$$;

comment on function public.uuid_array_has_no_duplicates(uuid[]) is
  'IMMUTABLE helper for CHECK constraints — true iff arr is null/empty or all elements are distinct.';

do $$
begin
  if not exists (
    select 1
    from   pg_constraint
    where  conname = 'profiles_learn_enrolled_listings_no_dupes'
    and    conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_learn_enrolled_listings_no_dupes
      check (public.uuid_array_has_no_duplicates(learn_enrolled_listings));
  end if;
end
$$;

-- =====================================================================
-- Batch 8 (migration 081) — FEAT-06 Contributor Billing Foundation
-- =====================================================================

-- Migration 081 — FEAT-06 Contributor Billing Foundation (Batch 8)
--
-- Per MASTER_DIRECTION Part 5 / FEAT-06. Tracks per-contributor monthly event
-- and place counts and a calculated total in ZAR. The actual PayFast recurring
-- billing wiring is deferred until D11 / T5 are resolved — this migration is
-- the data foundation and the in-app bill preview.
--
-- Pricing tiers (from MASTER_DIRECTION):
--   individual / small brand           → R30 per event
--   medium organisation (50-500)       → R150 per event
--   large ministry / corporate (500+)  → R250 per event
--   place markers                      → flat rate TBD per month (price stays 0
--                                        in calculated_total for now; we still
--                                        store the count so we can charge once
--                                        a price is set)
--
-- Trial: "first 3 months free" surfaces in the UI by comparing
-- coalesce(billing_trial_started_at, created_at) to now. The trigger itself
-- always records the raw counts and full calculated_total — the UI presents
-- the trial discount so historical numbers stay meaningful.
--
-- This migration intentionally does NOT backfill historical events/places so
-- contributors aren't billed for posts they made before billing existed.

----------------------------------------------------------------
-- 1. profiles columns: billing_tier + billing_trial_started_at
----------------------------------------------------------------

alter table public.profiles
  add column if not exists billing_tier text not null default 'individual',
  add column if not exists billing_trial_started_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from   pg_constraint
    where  conname = 'profiles_billing_tier_check'
    and    conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_billing_tier_check
      check (billing_tier in ('individual','medium','large'));
  end if;
end
$$;

comment on column public.profiles.billing_tier is
  'Billing tier — individual (R30/event), medium (R150/event), large (R250/event). Set by admin during contributor approval. Default individual.';
comment on column public.profiles.billing_trial_started_at is
  'Optional explicit trial start timestamp. Falls back to profiles.created_at when null. Used by the UI to compute the "first 3 months free" window.';

----------------------------------------------------------------
-- 2. contributor_billing table
----------------------------------------------------------------

create table if not exists public.contributor_billing (
  profile_id        uuid           not null references public.profiles(id) on delete cascade,
  month             text           not null,                              -- YYYY-MM
  event_count       integer        not null default 0,
  place_count       integer        not null default 0,
  calculated_total  numeric(12,2)  not null default 0,
  updated_at        timestamptz    not null default now(),
  primary key (profile_id, month),
  constraint contributor_billing_month_format
    check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint contributor_billing_counts_nonneg
    check (event_count >= 0 and place_count >= 0 and calculated_total >= 0)
);

comment on table public.contributor_billing is
  'Monthly tally of billable activity per contributor. Rows are written exclusively by the tally_contributor_event/_place triggers.';

create index if not exists contributor_billing_month_idx
  on public.contributor_billing (month);

----------------------------------------------------------------
-- 3. RLS — owner reads own, admin reads all, no client writes
----------------------------------------------------------------

alter table public.contributor_billing enable row level security;

drop policy if exists "contributor_billing owner read" on public.contributor_billing;
create policy "contributor_billing owner read"
  on public.contributor_billing
  for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- Explicitly revoke direct mutation rights; triggers run as table owner.
revoke insert, update, delete on public.contributor_billing from anon, authenticated;

----------------------------------------------------------------
-- 4. Tier → rate helper
----------------------------------------------------------------

create or replace function public.contributor_event_rate(tier text)
returns numeric
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case lower(coalesce(tier, 'individual'))
    when 'large'  then 250.00
    when 'medium' then 150.00
    else               30.00          -- individual / unknown
  end::numeric;
$$;

comment on function public.contributor_event_rate(text) is
  'Returns the per-event ZAR rate for a billing tier. Unknown tiers fall back to the individual rate (R30) so a misconfigured profile never blocks event creation.';

----------------------------------------------------------------
-- 5. Trigger: tally_contributor_event on events INSERT
----------------------------------------------------------------

create or replace function public.tally_contributor_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role  text;
  v_tier  text;
  v_rate  numeric;
  v_month text;
begin
  -- Only tally when the row has a creator we can attribute to.
  if new.created_by is null then
    return new;
  end if;

  select role, billing_tier
    into v_role, v_tier
    from public.profiles
   where id = new.created_by;

  -- Citizens (or missing profiles) are not billed.
  if v_role is distinct from 'contributor' then
    return new;
  end if;

  v_rate  := public.contributor_event_rate(v_tier);
  v_month := to_char(coalesce(new.created_at, now()), 'YYYY-MM');

  insert into public.contributor_billing as cb
    (profile_id, month, event_count, place_count, calculated_total, updated_at)
  values
    (new.created_by, v_month, 1, 0, v_rate, now())
  on conflict (profile_id, month) do update
    set event_count       = cb.event_count + 1,
        calculated_total  = cb.calculated_total + v_rate,
        updated_at        = now();

  return new;
end;
$$;

revoke execute on function public.tally_contributor_event() from public, anon, authenticated;

drop trigger if exists trg_tally_contributor_event on public.events;
create trigger trg_tally_contributor_event
  after insert on public.events
  for each row execute function public.tally_contributor_event();

----------------------------------------------------------------
-- 6. Trigger: tally_contributor_place on places INSERT
--    Counts only; calculated_total stays 0 until the place price is decided.
----------------------------------------------------------------

create or replace function public.tally_contributor_place()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role  text;
  v_month text;
begin
  if new.created_by is null then
    return new;
  end if;

  select role into v_role
    from public.profiles
   where id = new.created_by;

  if v_role is distinct from 'contributor' then
    return new;
  end if;

  v_month := to_char(coalesce(new.created_at, now()), 'YYYY-MM');

  insert into public.contributor_billing as cb
    (profile_id, month, event_count, place_count, calculated_total, updated_at)
  values
    (new.created_by, v_month, 0, 1, 0, now())
  on conflict (profile_id, month) do update
    set place_count = cb.place_count + 1,
        updated_at  = now();

  return new;
end;
$$;

revoke execute on function public.tally_contributor_place() from public, anon, authenticated;

drop trigger if exists trg_tally_contributor_place on public.places;
create trigger trg_tally_contributor_place
  after insert on public.places
  for each row execute function public.tally_contributor_place();

-- =====================================================================
-- Batch 8 Architect Should-fixes (migration 082) � billing column privacy + trial stamp
-- =====================================================================

-- Migration 082 — Batch 8 Architect Should-fixes (tighten billing column
-- privacy + stamp trial start on contributor approval).
--
-- 1. REVOKE column-level SELECT on the two new billing columns from anon and
--    authenticated. The existing `profiles` SELECT policy (using (true)) was
--    designed for the public-by-design fields (full_name, avatar_url, bio …)
--    — billing data must not ride the same broad read.
-- 2. Provide an authoritative `get_my_billing_context()` RPC the UI uses
--    instead of selecting columns it can no longer see. The function runs as
--    the table owner (SECURITY DEFINER) but only ever returns the caller's
--    OWN row, keyed on auth.uid(). It is also the only path admin/UI code
--    ever needs to read these columns for the signed-in user.
-- 3. Stamp `billing_trial_started_at = now()` on the profiles row the moment
--    `contributor_status` transitions to 'approved' (and only if it hasn't
--    already been stamped). Without this, a citizen who signs up months
--    before being approved would have a partially-burned trial — making the
--    "First 3 months from your contributor approval are free" copy untrue.

-- ---------------------------------------------------------------------------
-- 1. Column-level privacy
-- ---------------------------------------------------------------------------

revoke select (billing_tier, billing_trial_started_at)
  on public.profiles
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_my_billing_context — owner-self RPC
-- ---------------------------------------------------------------------------

create or replace function public.get_my_billing_context()
returns table (
  billing_tier              text,
  billing_trial_started_at  timestamptz,
  created_at                timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.billing_tier, p.billing_trial_started_at, p.created_at
    from public.profiles p
   where p.id = auth.uid();
$$;

comment on function public.get_my_billing_context() is
  'Returns the signed-in user''s billing tier + trial start + account created_at. Used by the BillPreviewCard to compute the trial window without granting broad column SELECT on profiles.';

revoke execute on function public.get_my_billing_context() from public, anon;
grant  execute on function public.get_my_billing_context() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Stamp trial start on contributor approval
-- ---------------------------------------------------------------------------

create or replace function public.stamp_billing_trial_on_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Only fire on the transition into 'approved'. NEW.billing_trial_started_at
  -- may already be set (manual seed in 061, admin override) — never clobber.
  if  coalesce(new.contributor_status, '') = 'approved'
  and coalesce(old.contributor_status, '') is distinct from 'approved'
  and new.billing_trial_started_at is null
  then
    new.billing_trial_started_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.stamp_billing_trial_on_approval() from public, anon, authenticated;

drop trigger if exists trg_stamp_billing_trial_on_approval on public.profiles;
create trigger trg_stamp_billing_trial_on_approval
  before update of contributor_status on public.profiles
  for each row execute function public.stamp_billing_trial_on_approval();

-- ============================================================================
-- Polish 2026-05-23 � get_user_places_with_stats (migration 094)
-- ============================================================================
-- Aggregates the caller's places with follower/review counts in one round-trip,
-- replacing the per-place client-side filter in /api/manage/places.
-- SECURITY INVOKER + auth.uid() filter; safe under existing RLS.

create or replace function public.get_user_places_with_stats()
returns table (
  id            uuid,
  name          text,
  address       text,
  verified      boolean,
  created_at    timestamptz,
  follow_count  bigint,
  review_count  bigint,
  avg_rating    numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.name,
    p.address,
    p.verified,
    p.created_at,
    coalesce(f.cnt, 0)::bigint                                as follow_count,
    coalesce(r.cnt, 0)::bigint                                as review_count,
    case when coalesce(r.cnt, 0) > 0 then r.avg else null end as avg_rating
  from public.places p
  left join lateral (
    select count(*)::bigint as cnt
    from public.place_follows pf
    where pf.place_id = p.id
  ) f on true
  left join lateral (
    select count(*)::bigint as cnt, avg(rating)::numeric as avg
    from public.reviews rv
    where rv.place_id = p.id
  ) r on true
  where p.created_by = auth.uid()
  order by p.created_at desc;
$$;

revoke all on function public.get_user_places_with_stats() from public;
revoke all on function public.get_user_places_with_stats() from anon;
grant execute on function public.get_user_places_with_stats() to authenticated;
