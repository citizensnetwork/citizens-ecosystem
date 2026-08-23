-- 165 — Tighten migration 164: security_invoker view + explicit search_path.
--
-- Two advisor findings surfaced immediately after 164 applied (caught in
-- the same session, before merge):
--  1. ERROR security_definer_view on directory_contributors — CREATE OR
--     REPLACE VIEW does not preserve reloptions, so it silently dropped
--     the `security_invoker = on` that migration 065 originally set
--     (065's own comment explains why: without it, the view runs as its
--     owner and bypasses profiles' RLS for anon/authenticated callers).
--  2. WARN function_search_path_mutable on the two new SECURITY DEFINER
--     functions from 164 — every other SECDEF function in this codebase
--     sets `search_path = ''` (see 062_tighten_contributor_locations.sql);
--     164's two new functions were missed. Both already fully
--     schema-qualify every reference, so this is a no-behaviour-change fix.

alter view public.directory_contributors set (security_invoker = on);

create or replace function public.self_approve_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    physical_address = coalesce(app.physical_address, physical_address),
    physical_latitude = coalesce(app.physical_latitude, physical_latitude),
    physical_longitude = coalesce(app.physical_longitude, physical_longitude),
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
$$;

create or replace function public.set_contributor_hidden(_user_id uuid, _hidden boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  update public.profiles
    set contributor_hidden = _hidden
    where id = _user_id and role = 'contributor';

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('success', true, 'user_id', _user_id, 'hidden', _hidden);
end;
$$;
