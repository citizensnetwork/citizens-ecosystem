-- 060 — Additional physical locations per Contributor.
--
-- Contributors (ministries, organisations, businesses) may operate from
-- more than one venue. The existing `profiles.physical_address` + lat/lng
-- columns capture the *primary* venue; this table adds zero-or-more
-- secondary venues that are rendered in the public profile "Find us"
-- section and on the map for place-mode discovery in future batches.
--
-- Keep this purely additive — the single-primary pair on `profiles`
-- remains authoritative for map place pins (phase-gated in a later
-- migration when we add multi-pin support).

create table if not exists public.contributor_locations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default '',
  address text not null,
  latitude double precision,
  longitude double precision,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists contributor_locations_profile_idx
  on public.contributor_locations(profile_id, sort_order);

alter table public.contributor_locations enable row level security;

-- Public read: locations are published alongside the contributor profile.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Contributor locations are viewable by everyone'
      and tablename = 'contributor_locations'
  ) then
    create policy "Contributor locations are viewable by everyone"
      on public.contributor_locations
      for select
      using (true);
  end if;
end $$;

-- Owner writes.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Contributors manage own locations'
      and tablename = 'contributor_locations'
  ) then
    create policy "Contributors manage own locations"
      on public.contributor_locations
      for all
      using (auth.uid() = profile_id or public.is_admin())
      with check (auth.uid() = profile_id or public.is_admin());
  end if;
end $$;

comment on table public.contributor_locations is
  'Additional physical venues for a Contributor profile beyond the primary address stored on profiles.';
