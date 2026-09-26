-- 173 — Google Form → map: Contributor intake (+ "Individual" kind).
--
-- Why this exists
-- ---------------
-- A new Contributor fills in the founder's Google Form; the founder ticks
-- "Approve" in the responses Sheet; an Apps Script POSTs the row (HMAC-signed)
-- to Connect's /api/intake/google-form, which creates the listing. That route
-- has NO user session — it runs with the service-role key — so it cannot use
-- admin_create_contributor_profile (mig 170, gated on is_admin(), which keys
-- on auth.uid() = null for service_role), and protect_role_column() rejects
-- the citizen → contributor flip for the same reason (the §3AL PR #54 bug).
-- Build brief: apps/connect/docs/handoffs/CONTRIBUTOR_FORM_INTAKE_HANDOFF.md.
--
-- Contents
--   1. 'individual' Contributor kind on every kind CHECK (founder decision).
--   2. protect_role_column(): service_role carve-out (+ drop the duplicate
--      trigger that ran the same check twice per update).
--   3. intake_create_contributor_profile(): service_role-only SECDEF RPC.
--   4. claim_admin_created_contributor(): copy the post-mig-171/172 fields too
--      (the different-Google-account claim fallback silently dropped them).
--   5. mark_own_listing_claimed(): own-row stamp for the owner who signs in
--      AS the listing account (Supabase auto-links same-email Google sign-in).
--
-- Footguns restated (§3AE, migs 165/166): CREATE OR REPLACE FUNCTION drops
-- `SET search_path` unless it is restated — every function below restates it.
-- CREATE OR REPLACE keeps the existing ACL, so grants are only (re)stated for
-- the two NEW functions.

-- ── 1. 'individual' kind ──────────────────────────────────────────────
-- A person serving in their own capacity (freelancer, counsellor, speaker,
-- photographer, artist). Kind = how you're set up; category = what you do.
alter table public.profiles
  drop constraint if exists profiles_contributor_kind_check;
alter table public.profiles
  add constraint profiles_contributor_kind_check
  check (contributor_kind is null
         or contributor_kind = any (array['ministry', 'organization', 'business', 'individual']));

alter table public.contributor_applications
  drop constraint if exists contributor_applications_contributor_kind_check;
alter table public.contributor_applications
  add constraint contributor_applications_contributor_kind_check
  check (contributor_kind is null
         or contributor_kind = any (array['ministry', 'organization', 'business', 'individual']));

alter table public.contributor_type_change_requests
  drop constraint if exists contributor_type_change_requests_requested_kind_check;
alter table public.contributor_type_change_requests
  add constraint contributor_type_change_requests_requested_kind_check
  check (requested_kind = any (array['ministry', 'organization', 'business', 'individual']));

-- ── 2. protect_role_column(): service_role carve-out ──────────────────
-- Safe: service_role already bypasses RLS entirely and can write any row;
-- this trigger exists to stop END USERS escalating their own role/status.
-- auth.role() reads the verified JWT claim (request.jwt.claims), so it is
-- correct inside this SECURITY DEFINER body — unlike mig 038's
-- `current_user = 'service_role'`, which can never be true in a SECDEF
-- function (current_user is the owner there) and was later dropped.
-- Every service-role write to profiles in the app today is fixed-column
-- (avatar_url, cover_photo_urls), so no request data can steer this path.
-- Body otherwise verbatim from the live definition (read 2026-09-26).
create or replace function public.protect_role_column()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if public.is_admin() then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not (old.role = 'citizen' and new.role = 'contributor' and new.id = auth.uid()) then
      raise exception 'Only admins may change role. Use the contributor application flow.';
    end if;
  end if;

  if new.contributor_status is distinct from old.contributor_status then
    if not (
      old.contributor_status = 'not_applied' and new.contributor_status = 'pending'
      or old.contributor_status = 'rejected' and new.contributor_status = 'pending'
      or (old.contributor_status = 'pending' and new.contributor_status = 'approved' and new.id = auth.uid())
    ) then
      raise exception 'contributor_status transition % -> % is not allowed.',
        old.contributor_status, new.contributor_status;
    end if;
  end if;

  return new;
end;
$function$;

-- 025 created `protect_role_trigger` and 036 created `protect_role_on_update`
-- — both BEFORE UPDATE … EXECUTE FUNCTION protect_role_column(), so every
-- profiles update ran the identical check twice. Keep 036's; drop 025's.
drop trigger if exists protect_role_trigger on public.profiles;

comment on function public.protect_role_column() is
  'BEFORE UPDATE guard on profiles.role / contributor_status. Bypassed for admins (is_admin) and service_role (JWT role claim; mig 173). Users may only self-promote via the apply → self-approve flow.';

-- ── 3. intake_create_contributor_profile() ────────────────────────────
-- Mirrors admin_create_contributor_profile (mig 170) with the FULL field set
-- and no is_admin() gate. Callable only by service_role (grants below + the
-- in-body check as defence in depth). The target must be a FRESH account
-- (citizen / not_applied / no slug) so a caller bug can never overwrite an
-- existing person's profile.
create or replace function public.intake_create_contributor_profile(
  _target_id uuid,
  _display_name text,
  _claim_email text,
  _contributor_kind text,
  _contributor_category text,
  _bio text,
  _website_url text,
  _contact_email text,
  _instagram_handle text,
  _facebook_url text,
  _tiktok_handle text,
  _youtube_url text,
  _x_handle text,
  _linkedin_url text,
  _whatsapp_number text,
  _no_fixed_location boolean,
  _physical_address text,
  _physical_latitude double precision,
  _physical_longitude double precision,
  _logo_url text,
  _cover_photo_urls jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_slug text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'reason', 'forbidden');
  end if;

  if coalesce(trim(_display_name), '') = '' or coalesce(trim(_claim_email), '') = '' then
    return jsonb_build_object('success', false, 'reason', 'invalid_input');
  end if;

  new_slug := public.generate_contributor_slug(_display_name);

  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_kind = _contributor_kind,
    contributor_category = _contributor_category,
    full_name = _display_name,
    bio = _bio,
    website_url = _website_url,
    contributor_contact_email = _contact_email,
    instagram_handle = _instagram_handle,
    facebook_url = _facebook_url,
    tiktok_handle = _tiktok_handle,
    youtube_url = _youtube_url,
    x_handle = _x_handle,
    linkedin_url = _linkedin_url,
    whatsapp_number = _whatsapp_number,
    contributor_no_fixed_location = coalesce(_no_fixed_location, false),
    physical_address = _physical_address,
    physical_latitude = _physical_latitude,
    physical_longitude = _physical_longitude,
    logo_url = _logo_url,
    cover_photo_urls = case
      when jsonb_typeof(_cover_photo_urls) = 'array' then _cover_photo_urls
      else '[]'::jsonb
    end,
    contributor_slug = new_slug,
    contributor_claim_email = _claim_email,
    contributor_claimed_at = null,
    contributor_created_by_admin = null
  where id = _target_id
    and role = 'citizen'
    and contributor_status = 'not_applied'
    and contributor_slug is null;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'target_not_fresh');
  end if;

  return jsonb_build_object('success', true, 'slug', new_slug);
end;
$function$;

revoke all on function public.intake_create_contributor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, text, double precision, double precision, text, jsonb
) from public, anon, authenticated;
grant execute on function public.intake_create_contributor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, text, double precision, double precision, text, jsonb
) to service_role;

comment on function public.intake_create_contributor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, boolean, text, double precision, double precision, text, jsonb
) is
  'Google Form intake (POST /api/intake/google-form, HMAC-verified): turns a freshly created placeholder auth user''s profile into a live, approved, claimable Contributor listing. service_role only. Returns {success, slug} or {success:false, reason}.';

-- ── 4. claim_admin_created_contributor(): copy the newer fields ───────
-- Mig 169 predates 171 (contributor_contact_email) and 172 (x / linkedin /
-- whatsapp), and never copied cover_photo_urls — so an owner claiming from a
-- DIFFERENT Google account lost those fields. Body otherwise verbatim from
-- the live definition (read 2026-09-26).
create or replace function public.claim_admin_created_contributor()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller_email text;
  caller_role text;
  caller_status text;
  placeholder record;
  new_slug text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select role, contributor_status into caller_role, caller_status
    from public.profiles where id = auth.uid();

  if caller_role is distinct from 'citizen' or caller_status is distinct from 'not_applied' then
    return jsonb_build_object('success', false, 'reason', 'not_eligible');
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null or caller_email = '' then
    return jsonb_build_object('success', false, 'reason', 'no_email');
  end if;

  select * into placeholder from public.profiles
    where lower(contributor_claim_email) = lower(caller_email)
      and contributor_claimed_at is null
      and id <> auth.uid()
    order by created_at desc
    limit 1
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_claim');
  end if;

  new_slug := public.generate_contributor_slug(coalesce(nullif(placeholder.full_name, ''), 'contributor'));

  -- Step 1/2: not_applied -> pending (own row) — required before the trigger
  -- will allow pending -> approved in step 2.
  update public.profiles set contributor_status = 'pending' where id = auth.uid();

  -- Step 2/2: citizen -> contributor + pending -> approved (own row), plus
  -- the actual field copy.
  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_kind = placeholder.contributor_kind,
    contributor_category = placeholder.contributor_category,
    full_name = coalesce(nullif(placeholder.full_name, ''), full_name),
    bio = coalesce(placeholder.bio, bio),
    website_url = coalesce(placeholder.website_url, website_url),
    contributor_contact_email = coalesce(placeholder.contributor_contact_email, contributor_contact_email),
    instagram_handle = coalesce(placeholder.instagram_handle, instagram_handle),
    facebook_url = coalesce(placeholder.facebook_url, facebook_url),
    tiktok_handle = coalesce(placeholder.tiktok_handle, tiktok_handle),
    youtube_url = coalesce(placeholder.youtube_url, youtube_url),
    x_handle = coalesce(placeholder.x_handle, x_handle),
    linkedin_url = coalesce(placeholder.linkedin_url, linkedin_url),
    whatsapp_number = coalesce(placeholder.whatsapp_number, whatsapp_number),
    contributor_no_fixed_location = placeholder.contributor_no_fixed_location,
    physical_address = placeholder.physical_address,
    physical_latitude = placeholder.physical_latitude,
    physical_longitude = placeholder.physical_longitude,
    logo_url = coalesce(placeholder.logo_url, logo_url),
    gallery_urls = case
      when jsonb_array_length(coalesce(placeholder.gallery_urls, '[]'::jsonb)) > 0
        then placeholder.gallery_urls
      else gallery_urls
    end,
    cover_photo_urls = case
      when jsonb_array_length(coalesce(placeholder.cover_photo_urls, '[]'::jsonb)) > 0
        then placeholder.cover_photo_urls
      else cover_photo_urls
    end,
    contributor_slug = new_slug,
    needs_re_review = false
  where id = auth.uid();

  -- Neutralize the placeholder — only non-role/status columns, so this never
  -- touches protect_role_column()'s restricted transitions. contributor_
  -- hidden = true removes it from every public listing (/api/v1/contributors,
  -- directory_contributors, Kingdom Discovery, the map) exactly like the
  -- existing admin moderation flag does.
  update public.profiles set
    contributor_hidden = true,
    contributor_slug = null,
    contributor_claim_email = null,
    contributor_claimed_at = now()
  where id = placeholder.id;

  return jsonb_build_object('success', true, 'slug', new_slug);
end;
$function$;

comment on function public.claim_admin_created_contributor() is
  'Claim an admin- or form-created Contributor listing from a DIFFERENT account whose verified email matches contributor_claim_email: copies every public listing field onto the caller''s own profile and hides the placeholder. Mig 173 added contact email, X, LinkedIn, WhatsApp and cover photos to the copy.';

-- ── 5. mark_own_listing_claimed() ─────────────────────────────────────
-- The common case: Supabase auto-links a Google sign-in to the existing
-- same-email auth user, so the owner signs in AS the listing account. The
-- session bootstrap calls this once to record the claim and route them to
-- their dashboard. Own row only; no-op unless the row is an unclaimed listing.
create or replace function public.mark_own_listing_claimed()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  own_slug text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  update public.profiles set
    contributor_claimed_at = now(),
    contributor_claim_email = null
  where id = auth.uid()
    and role = 'contributor'
    and contributor_claim_email is not null
    and contributor_claimed_at is null
  returning contributor_slug into own_slug;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_mark');
  end if;

  return jsonb_build_object('success', true, 'slug', own_slug);
end;
$function$;

revoke all on function public.mark_own_listing_claimed() from public, anon;
grant execute on function public.mark_own_listing_claimed() to authenticated;

comment on function public.mark_own_listing_claimed() is
  'Owner signed in AS their admin/form-created listing account (same-email Google auto-link): stamps contributor_claimed_at and clears contributor_claim_email on the caller''s OWN row. Returns {success, slug} or {success:false, reason:''nothing_to_mark''}.';
