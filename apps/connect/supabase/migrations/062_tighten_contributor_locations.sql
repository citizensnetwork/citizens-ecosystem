-- 062 - Tighten contributor_locations policies + coord validation.
--
-- Architect review of batch N recommended:
--  1. Split the owner `FOR ALL` policy from 060 into explicit INSERT /
--     UPDATE / DELETE policies so future "private locations" work can
--     narrow them without ambiguity.
--  2. Add CHECK constraints on latitude/longitude so garbage coords
--     cannot poison the map.
--
-- Idempotent.

-- 1. Split policies.
drop policy if exists "owners manage own contributor_locations" on public.contributor_locations;

drop policy if exists "owners insert own contributor_locations" on public.contributor_locations;
create policy "owners insert own contributor_locations"
  on public.contributor_locations
  for insert
  with check (auth.uid() = profile_id or public.is_admin());

drop policy if exists "owners update own contributor_locations" on public.contributor_locations;
create policy "owners update own contributor_locations"
  on public.contributor_locations
  for update
  using (auth.uid() = profile_id or public.is_admin())
  with check (auth.uid() = profile_id or public.is_admin());

drop policy if exists "owners delete own contributor_locations" on public.contributor_locations;
create policy "owners delete own contributor_locations"
  on public.contributor_locations
  for delete
  using (auth.uid() = profile_id or public.is_admin());

-- 2. Coordinate sanity.
alter table public.contributor_locations
  drop constraint if exists contributor_locations_latitude_check,
  drop constraint if exists contributor_locations_longitude_check;

alter table public.contributor_locations
  add constraint contributor_locations_latitude_check
    check (latitude is null or (latitude between -90 and 90)),
  add constraint contributor_locations_longitude_check
    check (longitude is null or (longitude between -180 and 180));
