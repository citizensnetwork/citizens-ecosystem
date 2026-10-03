-- 179 — Approving a Contributor resets the hide flag; repair the admin review RPCs.
--
-- The bug (founder's live A2 walk, 2026-10-03)
-- --------------------------------------------
-- Admin Delete (mig 178, `admin_remove_contributor_listing`) removes a listing
-- but keeps the PERSON, and leaves `profiles.contributor_hidden = TRUE` on
-- purpose. When that same account applied again it was approved (new slug, new
-- category, new pin) but stayed hidden, so the listing never appeared on the
-- map. NEITHER approve function ever touched `contributor_hidden`. Every path
-- that turns an account into an approved Contributor now resets the flag in the
-- same statement:
--
--   approve_contributor_application          (the admin's approval)
--   self_approve_contributor_application     (the v1 instant path; mig 180 retires it)
--   claim_admin_created_contributor          (a person claiming an admin-created
--                                             listing: the same hidden-account
--                                             case, reached through the claim)
--
-- Why resetting is right: an admin removing a listing is moderation, and the
-- gate for coming back is an admin's approval (D-12). The Admin → Applications
-- card tells the admin when the applicant was removed before, so the decision
-- is made knowingly.
--
-- Found while reading the live definitions (this is why approve is rewritten
-- rather than patched)
-- --------------------------------------------
-- 1. approve_contributor_application inserted into notifications(…, url): that
--    column does not exist (it is `data jsonb`; mig 084 fixed exactly this and
--    mig 164 re-created the pre-084 body). So an admin approval RAISED at the
--    notification insert and rolled back: the admin approve button has not
--    worked since mig 164.
-- 2. It never copied `no_fixed_location` (self-approve does, mig 168), so an
--    online-only applicant approved by an admin would be given a pin anyway.
-- 3. The `auth.uid() is null or …` arm was missing (RESUME §3).
-- 4. reject_contributor_application ran with search_path = pg_catalog, public
--    instead of '' (mig 084 style), and accepted an unbounded reason.
--
-- Footguns restated (RESUME §3): CREATE OR REPLACE drops `set search_path`, so
-- every function below re-states `set search_path to ''` and schema-qualifies
-- every reference. Grants are re-stated too (mig 140 baseline: authenticated
-- only, never anon/public).

-- ── approve_contributor_application ────────────────────────────────────
create or replace function public.approve_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  app record;
  new_slug text;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  select * into app from public.contributor_applications
    where id = _application_id and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found_or_not_pending');
  end if;

  new_slug := public.generate_contributor_slug(app.display_name);

  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    -- An approved listing is visible. A hide flag left by an earlier admin
    -- removal (mig 178) must not survive the approval that follows it.
    contributor_hidden = false,
    contributor_kind = coalesce(app.contributor_kind, contributor_kind),
    contributor_category = coalesce(app.contributor_category, contributor_category),
    full_name = coalesce(nullif(app.display_name, ''), full_name),
    bio = coalesce(app.bio, bio),
    website_url = coalesce(app.website_url, website_url),
    instagram_handle = coalesce(app.instagram_handle, instagram_handle),
    facebook_url = coalesce(app.facebook_url, facebook_url),
    tiktok_handle = coalesce(app.tiktok_handle, tiktok_handle),
    youtube_url = coalesce(app.youtube_url, youtube_url),
    contributor_no_fixed_location = coalesce(app.no_fixed_location, contributor_no_fixed_location),
    physical_address = case when app.no_fixed_location then null else coalesce(app.physical_address, physical_address) end,
    physical_latitude = case when app.no_fixed_location then null else coalesce(app.physical_latitude, physical_latitude) end,
    physical_longitude = case when app.no_fixed_location then null else coalesce(app.physical_longitude, physical_longitude) end,
    logo_url = coalesce(app.logo_url, logo_url),
    gallery_urls = case
      when jsonb_array_length(coalesce(app.gallery_urls, '[]'::jsonb)) > 0
        then app.gallery_urls
      else gallery_urls
    end,
    contributor_slug = new_slug,
    needs_re_review = false
  where id = app.user_id;

  update public.contributor_applications set
    status = 'approved',
    reviewed_at = now(),
    reviewer_id = auth.uid()
  where id = _application_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    app.user_id,
    'contributor_approved',
    'You''re live on Citizens Connect!',
    'Your Contributor listing was approved. It is now on the map and in Kingdom Discovery.',
    jsonb_build_object('url', '/dashboard')
  );

  return jsonb_build_object(
    'success', true,
    'action', 'approved',
    'slug', new_slug,
    'user_id', app.user_id
  );
end;
$function$;

-- ── reject_contributor_application ─────────────────────────────────────
create or replace function public.reject_contributor_application(
  _application_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  app record;
begin
  if auth.uid() is null or not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  if _reason is null or length(trim(_reason)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'reason_required');
  end if;
  -- The reason is shown to the applicant (notification + email): keep it kind
  -- and keep it bounded.
  if length(_reason) > 1000 then
    return jsonb_build_object('success', false, 'reason', 'reason_too_long');
  end if;

  select * into app from public.contributor_applications
    where id = _application_id and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found_or_not_pending');
  end if;

  update public.contributor_applications set
    status = 'rejected',
    reviewed_at = now(),
    reviewer_id = auth.uid(),
    rejection_reason = trim(_reason)
  where id = _application_id;

  -- rejected -> pending is the one transition the applicant may make again
  -- (protect_role_column), which is how "re-apply" works.
  update public.profiles set
    contributor_status = 'rejected'
  where id = app.user_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    app.user_id,
    'contributor_rejected',
    'About your Contributor application',
    trim(_reason),
    jsonb_build_object('url', '/')
  );

  return jsonb_build_object(
    'success', true,
    'action', 'rejected',
    'user_id', app.user_id
  );
end;
$function$;

-- ── self_approve_contributor_application (until mig 180 retires it) ─────
create or replace function public.self_approve_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  app record;
  new_slug text;
begin
  select * into app from public.contributor_applications
    where id = _application_id and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found_or_not_pending');
  end if;

  if app.user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'reason', 'not_owner');
  end if;

  new_slug := public.generate_contributor_slug(app.display_name);

  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_hidden = false,
    contributor_kind = coalesce(app.contributor_kind, contributor_kind),
    contributor_category = coalesce(app.contributor_category, contributor_category),
    full_name = coalesce(nullif(app.display_name, ''), full_name),
    bio = coalesce(app.bio, bio),
    website_url = coalesce(app.website_url, website_url),
    instagram_handle = coalesce(app.instagram_handle, instagram_handle),
    facebook_url = coalesce(app.facebook_url, facebook_url),
    tiktok_handle = coalesce(app.tiktok_handle, tiktok_handle),
    youtube_url = coalesce(app.youtube_url, youtube_url),
    contributor_no_fixed_location = coalesce(app.no_fixed_location, contributor_no_fixed_location),
    physical_address = case when app.no_fixed_location then null else coalesce(app.physical_address, physical_address) end,
    physical_latitude = case when app.no_fixed_location then null else coalesce(app.physical_latitude, physical_latitude) end,
    physical_longitude = case when app.no_fixed_location then null else coalesce(app.physical_longitude, physical_longitude) end,
    logo_url = coalesce(app.logo_url, logo_url),
    gallery_urls = case
      when jsonb_array_length(coalesce(app.gallery_urls, '[]'::jsonb)) > 0
        then app.gallery_urls
      else gallery_urls
    end,
    contributor_slug = new_slug,
    needs_re_review = false
  where id = app.user_id;

  update public.contributor_applications set
    status = 'approved',
    reviewed_at = now(),
    reviewer_id = app.user_id
  where id = _application_id;

  return jsonb_build_object(
    'success', true,
    'action', 'approved',
    'slug', new_slug,
    'user_id', app.user_id
  );
end;
$function$;

-- ── claim_admin_created_contributor ────────────────────────────────────
-- Body is the live definition (mig 173) plus one line: `contributor_hidden =
-- false` on the CLAIMANT's own row. A person whose earlier listing an admin
-- removed (hidden = true) and who then claims a listing an admin created for
-- them would otherwise get a dashboard but no map pin, the same bug by a
-- different door.
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
    contributor_hidden = false,
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

-- ── grants (CREATE OR REPLACE keeps them; restated as the mig 140 baseline) ─
revoke all on function public.approve_contributor_application(uuid) from public, anon;
grant execute on function public.approve_contributor_application(uuid) to authenticated;

revoke all on function public.reject_contributor_application(uuid, text) from public, anon;
grant execute on function public.reject_contributor_application(uuid, text) to authenticated;

revoke all on function public.self_approve_contributor_application(uuid) from public, anon;
grant execute on function public.self_approve_contributor_application(uuid) to authenticated;

revoke all on function public.claim_admin_created_contributor() from public, anon;
grant execute on function public.claim_admin_created_contributor() to authenticated;
