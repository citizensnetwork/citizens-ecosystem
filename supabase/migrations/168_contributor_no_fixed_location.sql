-- Adds a "no fixed physical location" flag for Contributors who operate
-- online, mobile, or without a permanent office — so the apply wizard can
-- stop forcing an address/pin for them. A contributor with this flag set
-- keeps physical_address/physical_latitude/physical_longitude null, which
-- already, correctly, excludes them from map markers (home.jsx filters on
-- lat/lng != null) without any map-layer change needed.

alter table public.profiles
  add column if not exists contributor_no_fixed_location boolean not null default false;

alter table public.contributor_applications
  add column if not exists no_fixed_location boolean not null default false;

comment on column public.profiles.contributor_no_fixed_location is
  'Contributor operates online/mobile/without a permanent office — physical_address/lat/lng are intentionally null; excluded from map markers by design, still listed in Kingdom Discovery.';
comment on column public.contributor_applications.no_fixed_location is
  'Applicant-selected: no fixed physical location (online/mobile). Copied to profiles.contributor_no_fixed_location on approval.';

-- directory_contributors: CREATE OR REPLACE VIEW drops reloptions unless
-- restated (bit us in migration 165) — re-specify security_invoker=on.
-- New column MUST be appended at the end — CREATE OR REPLACE VIEW rejects
-- inserting/reordering existing output columns.
create or replace view public.directory_contributors
  with (security_invoker = on) as
select
  id,
  contributor_slug as slug,
  full_name as name,
  contributor_kind as kind,
  bio,
  website_url,
  instagram_handle,
  facebook_url,
  tiktok_handle,
  youtube_url,
  physical_address,
  physical_latitude,
  physical_longitude,
  avatar_url,
  logo_url,
  gallery_urls,
  created_at,
  contributor_category as category,
  contributor_no_fixed_location as no_fixed_location
from public.profiles
where role = 'contributor'
  and contributor_status = 'approved'
  and contributor_slug is not null
  and coalesce(contributor_hidden, false) = false;

-- self_approve_contributor_application: copy the new flag across on
-- approval, and null the address/lat/lng fields when it's set (defensive —
-- the API route also nulls them before insert, this is belt-and-braces so
-- the RPC is correct even if called with stale application data).
-- CREATE OR REPLACE FUNCTION drops SET clauses unless restated (bit us in
-- migration 166) — search_path='' is re-specified below.
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
