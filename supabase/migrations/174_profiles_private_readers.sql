-- 174 — public.profiles: own-row readers/writers for the private columns.
--
-- EXPAND step of the profiles PII lockdown (174 → 175 → 176 → 177).
-- Purely additive: nothing here removes access, so it is safe to apply
-- before the app code that uses it is deployed.
--
-- Why: 176 revokes table-level SELECT on public.profiles from anon +
-- authenticated and grants back a PUBLIC column allowlist (the anon key
-- could read every user's email, home coordinates, demographics, billing
-- and preferences — POPIA). After that, a user's OWN private columns are
-- read through get_my_profile_private(), and the two own-row writes whose
-- statement READS a private column (a WHERE / SET expression on it needs
-- SELECT) move into caller-row-only SECURITY DEFINER functions.
--
-- Footguns restated (§3AE, migs 165/166): CREATE OR REPLACE FUNCTION drops
-- SET search_path unless restated, and keeps the old ACL — so every
-- function below restates its search_path and its grants.

-- ── 1. get_my_profile_private() ───────────────────────────────────────
-- Caller's row only; 0 rows for anon or a user without a profile.
-- Admin-internal moderation state (needs_re_review, contributor_claim_email,
-- contributor_claimed_at, contributor_created_by_admin) is deliberately
-- NOT returned — no caller needs it. role / contributor_status ride along
-- so middleware stays at one round trip.
create or replace function public.get_my_profile_private()
returns table (
  id uuid,
  role text,
  contributor_status text,
  email text,
  notification_email text,
  home_latitude double precision,
  home_longitude double precision,
  connect_home_province text,
  gender text,
  age_range text,
  relationship_status text,
  stage_of_life text,
  energy_level text,
  billing_tier text,
  billing_trial_started_at timestamptz,
  preferences jsonb,
  notification_prefs jsonb,
  notification_radius_km integer,
  notification_digest text,
  muted_source_ids jsonb,
  learn_enrolled_listings uuid[],
  wear_style_preferences jsonb,
  location_sharing boolean,
  timezone text,
  terms_accepted_at timestamptz,
  force_reauth_at timestamptz,
  bio_setup_required boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.role,
    p.contributor_status,
    p.email,
    p.notification_email,
    p.home_latitude,
    p.home_longitude,
    p.connect_home_province,
    p.gender,
    p.age_range,
    p.relationship_status,
    p.stage_of_life,
    p.energy_level,
    p.billing_tier,
    p.billing_trial_started_at,
    p.preferences,
    p.notification_prefs,
    p.notification_radius_km,
    p.notification_digest,
    p.muted_source_ids,
    p.learn_enrolled_listings,
    p.wear_style_preferences,
    p.location_sharing,
    p.timezone,
    p.terms_accepted_at,
    p.force_reauth_at,
    p.bio_setup_required
  from public.profiles p
  where p.id = (select auth.uid());
$$;

comment on function public.get_my_profile_private() is
  'Own-row reader for the private profiles columns (migs 174/176). Caller''s row only (auth.uid()); 0 rows for anon. Use .rpc(''get_my_profile_private'').select(''col,...'').maybeSingle().';

revoke all on function public.get_my_profile_private() from public, anon;
grant execute on function public.get_my_profile_private() to authenticated;

-- ── 2. update_notification_prefs → SECURITY DEFINER ────────────────────
-- Its SET reads notification_prefs (coalesce(notification_prefs, …) ||
-- delta). Body unchanged; it already writes the caller's row only
-- (where id = auth.uid()) and whitelists keys + boolean values.
create or replace function public.update_notification_prefs(delta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_keys text[] := array[
    'friends_activity',
    'event_reminders',
    'contributor_updates',
    'announcements',
    'weekly_digest'
  ];
  k text;
  v jsonb;
  sanitized jsonb := '{}'::jsonb;
  uid uuid := auth.uid();
  merged jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(delta) is distinct from 'object' then
    raise exception 'delta must be a jsonb object' using errcode = '22023';
  end if;

  for k, v in select key, value from jsonb_each(delta) loop
    if not (k = any(allowed_keys)) then
      raise exception 'unknown preference key: %', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) is distinct from 'boolean' then
      raise exception 'preference % must be boolean', k using errcode = '22023';
    end if;
    sanitized := sanitized || jsonb_build_object(k, v);
  end loop;

  update public.profiles
     set notification_prefs = coalesce(notification_prefs, jsonb_build_object(
            'friends_activity',    true,
            'event_reminders',     true,
            'contributor_updates', true,
            'announcements',       true,
            'weekly_digest',       true
          )) || sanitized
   where id = uid
  returning notification_prefs into merged;

  if merged is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  return merged;
end;
$$;

revoke all on function public.update_notification_prefs(jsonb) from public, anon;
grant execute on function public.update_notification_prefs(jsonb) to authenticated;

-- ── 3. mark_my_terms_accepted() ───────────────────────────────────────
-- /api/terms/accept stamps terms_accepted_at only while it is still NULL
-- (keeps the original acceptance time under concurrent calls). That WHERE
-- reads a private column, so the stamp moves into a caller-row-only RPC.
create or replace function public.mark_my_terms_accepted()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles
     set terms_accepted_at = now()
   where id = (select auth.uid())
     and terms_accepted_at is null;
$$;

comment on function public.mark_my_terms_accepted() is
  'Stamps the caller''s profiles.terms_accepted_at once (only while NULL). Mig 174 — after 177 the column is not SELECT-able by authenticated, so the old .is(''terms_accepted_at'', null) filter cannot run.';

revoke all on function public.mark_my_terms_accepted() from public, anon;
grant execute on function public.mark_my_terms_accepted() to authenticated;
