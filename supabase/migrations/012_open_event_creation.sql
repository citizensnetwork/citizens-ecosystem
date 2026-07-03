-- Migration: Open event creation to all authenticated users
-- Previously restricted to vendor/admin roles only

-- Drop the old vendor-only policy
drop policy if exists "Vendors can create events" on public.events;

-- Create a new policy allowing any authenticated user to create events
create policy "Authenticated users can create events" on public.events
  for insert
  with check (auth.uid() = created_by);
