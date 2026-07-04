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
