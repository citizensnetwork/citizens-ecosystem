-- 084_fix_contributor_review_notification_column.sql
--
-- Bugfix: approve_contributor_application() and
-- reject_contributor_application() insert into a non-existent
-- `notifications.url` column. The notifications table stores deep
-- links in the `data` jsonb column (see schema.sql + migrations 069,
-- 070). Result: every admin approve/reject click raised
-- ERROR: column "url" of relation "notifications" does not exist
-- which surfaced as a PostgREST 400 -> Edge Function 500 -> UI
-- "review failed".
--
-- Fix: rewrite both RPCs so the in-app deep link lives in data.url
-- (the canonical pattern used by every other notify trigger).

create or replace function public.approve_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  app record;
  new_slug text;
begin
  if not public.is_admin() then
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
    contributor_kind = coalesce(app.contributor_kind, contributor_kind),
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
    reviewer_id = auth.uid()
  where id = _application_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    app.user_id,
    'contributor_approved',
    'You''re an approved Contributor!',
    'Welcome! You can now create public events and places.',
    jsonb_build_object('url', '/profile/contributor')
  );

  return jsonb_build_object(
    'success', true,
    'action', 'approved',
    'slug', new_slug,
    'user_id', app.user_id
  );
end;
$$;

create or replace function public.reject_contributor_application(
  _application_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  app record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  if _reason is null or length(trim(_reason)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'reason_required');
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
    rejection_reason = _reason
  where id = _application_id;

  update public.profiles set
    contributor_status = 'rejected'
  where id = app.user_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    app.user_id,
    'contributor_rejected',
    'Contributor application update',
    _reason,
    jsonb_build_object('url', '/contributor/apply')
  );

  return jsonb_build_object(
    'success', true,
    'action', 'rejected',
    'user_id', app.user_id
  );
end;
$$;
