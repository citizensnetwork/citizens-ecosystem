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
