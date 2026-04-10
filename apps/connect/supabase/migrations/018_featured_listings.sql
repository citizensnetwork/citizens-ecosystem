-- 018: Featured Listings
-- Admin-managed premium listings for the Featured panel (replaces "Events at a Glance")

-- ── Table ───────────────────────────────────────
create table if not exists public.featured_listings (
  id            uuid primary key default gen_random_uuid(),
  -- Polymorphic: link to an event OR a place (exactly one must be set)
  event_id      uuid references public.events(id) on delete cascade,
  place_id      uuid references public.places(id) on delete cascade,
  -- Display fields
  cover_url     text not null,          -- Cover photo URL (event-images bucket)
  tagline       text not null default '',-- Short marketing tagline
  priority      int not null default 0, -- Higher = shown first
  -- Lifecycle
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,            -- NULL = indefinite
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),

  constraint exactly_one_target check (
    (event_id is not null and place_id is null) or
    (event_id is null and place_id is not null)
  )
);

-- Indexes
create index if not exists idx_featured_listings_active
  on public.featured_listings (priority desc, starts_at)
  where ends_at is null or ends_at > now();

create index if not exists idx_featured_listings_event
  on public.featured_listings (event_id) where event_id is not null;

create index if not exists idx_featured_listings_place
  on public.featured_listings (place_id) where place_id is not null;

-- ── RLS ─────────────────────────────────────────
alter table public.featured_listings enable row level security;

-- Anyone can read active featured listings
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read featured listings' AND tablename = 'featured_listings') THEN
  create policy "Anyone can read featured listings"
    on public.featured_listings for select
    using (true);
END IF;
END $$;

-- Only admins can manage featured listings
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin insert featured listings' AND tablename = 'featured_listings') THEN
  create policy "Admin insert featured listings"
    on public.featured_listings for insert
    with check (public.is_admin());
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update featured listings' AND tablename = 'featured_listings') THEN
  create policy "Admin update featured listings"
    on public.featured_listings for update
    using (public.is_admin());
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin delete featured listings' AND tablename = 'featured_listings') THEN
  create policy "Admin delete featured listings"
    on public.featured_listings for delete
    using (public.is_admin());
END IF;
END $$;
