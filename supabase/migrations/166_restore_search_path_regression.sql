-- 166 — Fix a regression 164 introduced: CREATE OR REPLACE FUNCTION on
-- protect_role_column() and approve_contributor_application() omitted
-- `set search_path = ''`, silently dropping the hardening a prior
-- session had already applied to both (advisor confirmed: both flagged
-- function_search_path_mutable immediately after 164, absent before).
-- Re-declaring with the same bodies (already fully public.*-qualified)
-- plus the missing clause — no behaviour change, hardening restored.

create or replace function public.protect_role_column()
returns trigger as $$
begin
  if public.is_admin() then
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
$$ language plpgsql security definer set search_path = '';

create or replace function public.approve_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
    reviewer_id = auth.uid()
  where id = _application_id;

  insert into public.notifications (user_id, type, title, body, url)
  values (
    app.user_id,
    'contributor_approved',
    'You''re an approved Contributor!',
    'Welcome! You can now create public events and places.',
    '/profile/contributor'
  );

  return jsonb_build_object(
    'success', true,
    'action', 'approved',
    'slug', new_slug,
    'user_id', app.user_id
  );
end;
$$;
