-- 176 — public.profiles: column-level SELECT lockdown (POPIA PII exposure).
--
-- The finding (verified live 2026-09-26)
-- ---------------------------------------
-- RLS policy "Profiles are viewable by everyone" is FOR SELECT USING (true)
-- for every role, and anon + authenticated held a TABLE-level SELECT grant
-- (Supabase's default). So the public anon key — shipped in the static
-- frontend — could run
--   GET /rest/v1/profiles?select=email,notification_email,contributor_claim_email
-- and harvest every user's private email, home coordinates, demographics,
-- billing tier and preferences.
--
-- Why mig 082's attempt never worked
-- ----------------------------------
-- 082 ran `revoke select (billing_tier, billing_trial_started_at) ... from
-- anon, authenticated`. A column-level REVOKE is a silent no-op while the
-- role still holds the TABLE-level grant (the table grant is checked first
-- and covers every column). The only working shape is: revoke the table
-- grant, then grant back an explicit column allowlist — this migration.
-- Side effect worth keeping: a column added to profiles from now on is
-- PRIVATE by default until a migration grants it (see SHARED_DB_CONTRACT §9).
--
-- Rows stay world-readable (the RLS policy is unchanged): directory,
-- contributor pages, map pins and messaging all read other people's public
-- identity. Only the COLUMNS narrow.
--
-- Column classification (founder decision, 2026-09-26)
-- ----------------------------------------------------
-- PUBLIC (33) — identity + public-listing fields, granted below.
-- PRIVATE (28) — email, notification_email, contributor_claim_email,
--   home_latitude, home_longitude, connect_home_province, gender, age_range,
--   relationship_status, stage_of_life, energy_level, billing_tier,
--   billing_trial_started_at, preferences, notification_prefs,
--   notification_radius_km, notification_digest, muted_source_ids,
--   learn_enrolled_listings, wear_style_preferences, location_sharing,
--   timezone, terms_accepted_at, force_reauth_at, bio_setup_required,
--   needs_re_review, contributor_claimed_at, contributor_created_by_admin.
--
-- Rollout (expand / contract)
-- ---------------------------
-- 174 added the own-row RPCs; this migration closes the leak NOW; 177
-- finishes it once the matching app code is deployed. Five private columns
-- stay granted here, TRANSITIONALLY, because the pre-174 app code still in
-- production reads them with the user's own client on critical paths:
--   force_reauth_at, bio_setup_required  — middleware (every page request)
--                                          and /api/contributor/setup
--   terms_accepted_at                    — /api/terms/accept's WHERE
--   location_sharing                     — /api/location
--   notification_prefs                   — Settings meta in store.jsx
-- They are flags / timestamps, not personal data. 177 revokes them.
-- Until the new code is live, these pre-174 paths degrade (admin-only or
-- non-critical): the admin screens that show other users' emails, the
-- api-key owner-by-email lookup, the personalization quiz save
-- (/api/preferences), contributors in /api/ai-search results, and the
-- (frontend-unused) team member email search.
--
-- Who keeps full access: service_role (edge functions, createAdminClient
-- routes) and SECURITY DEFINER functions — they run as roles that keep the
-- table-level grant.

-- REVOKE on the table also clears any column-level SELECT entries (incl.
-- the inert ones 082 left behind), so the GRANT below is the whole truth.
revoke select on table public.profiles from anon, authenticated;

grant select (
  -- identity
  id,
  full_name,
  role,
  created_at,
  avatar_url,
  bio,
  handle,
  handle_changed_at,
  discoverable,
  deleted_at,
  -- contributor listing
  contributor_kind,
  contributor_status,
  contributor_slug,
  contributor_category,
  contributor_hidden,
  contributor_no_fixed_location,
  contributor_contact_email,
  community_contributor_score,
  website_url,
  instagram_handle,
  facebook_url,
  tiktok_handle,
  youtube_url,
  x_handle,
  linkedin_url,
  whatsapp_number,
  physical_address,
  physical_latitude,
  physical_longitude,
  logo_url,
  gallery_urls,
  cover_photo_urls,
  -- Wear
  wear_wardrobe_visibility,
  -- TRANSITIONAL — private, revoked by 177 once the new app code is live.
  force_reauth_at,
  bio_setup_required,
  terms_accepted_at,
  location_sharing,
  notification_prefs
) on table public.profiles to anon, authenticated;

-- PostgREST caches column privileges in its schema cache.
notify pgrst, 'reload schema';
