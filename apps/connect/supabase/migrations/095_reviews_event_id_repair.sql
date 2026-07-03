-- ============================================================
-- Migration 095: Reviews event_id (repair of missed 026 apply)
-- ============================================================
-- Background: Migration 026 added event_id + still_exists + the
-- one-target check + per-target unique indexes to public.reviews.
-- On the remote DB only place_id ever shipped — 026 never applied.
-- This migration is the canonical idempotent reapply; safe to
-- run regardless of current state.
--
-- Renumbered to 095 to keep the migration sequence monotonic
-- with what's been applied. 026 is left in repo for history.

alter table public.reviews
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.reviews
  alter column place_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reviews_one_target_check'
  ) then
    alter table public.reviews
      add constraint reviews_one_target_check
      check (
        (place_id is not null and event_id is null)
        or
        (place_id is null and event_id is not null)
      );
  end if;
end $$;

alter table public.reviews drop constraint if exists reviews_place_id_user_id_key;

create unique index if not exists reviews_place_user_unique
  on public.reviews(place_id, user_id)
  where place_id is not null;

create unique index if not exists reviews_event_user_unique
  on public.reviews(event_id, user_id)
  where event_id is not null;

create index if not exists reviews_event_id_idx
  on public.reviews(event_id)
  where event_id is not null;
