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
