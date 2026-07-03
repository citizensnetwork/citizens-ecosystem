-- ============================================
-- Migration 004: Phase 5 Reviews + Verification
-- ============================================

-- 1) Expand reviews to support both places and events.
alter table public.reviews
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.reviews
  alter column place_id drop not null;

-- Keep exactly one review target: either place or event.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
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

-- 2) Place verification lifecycle fields.
alter table public.places
  add column if not exists verification_flagged boolean not null default false;

-- 3) Auto-flag places with repeated "no longer exists" signals.
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
