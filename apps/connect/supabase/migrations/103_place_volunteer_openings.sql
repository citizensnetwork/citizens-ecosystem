-- 103_place_volunteer_openings.sql
-- Stage F (docs/plans/contributor-dashboard.md): add a boolean flag on
-- public.places so contributors can advertise that the place itself has
-- ongoing volunteer needs (distinct from per-event volunteer openings,
-- which are already on public.events via migration 098).
--
-- Idempotent: safe to re-run.

alter table public.places
  add column if not exists volunteer_openings boolean not null default false;

comment on column public.places.volunteer_openings is
  'When true, the place advertises an ongoing need for volunteers. '
  'Surfaced as a "Volunteer" pill on the public place view. '
  'Distinct from events.volunteer_openings which is per-event.';
