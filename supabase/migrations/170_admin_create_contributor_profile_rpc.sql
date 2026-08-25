-- Companion RPC to migration 169's claim flow. The API route creates the
-- placeholder auth user via the Admin Auth API (service_role — the only way
-- to create an auth.users row), but service_role has no auth.uid(), so it
-- cannot satisfy protect_role_column()'s admin bypass (which checks
-- public.is_admin(), itself keyed on auth.uid()) when flipping that new
-- user's role to 'contributor' on someone else's row. This RPC is called
-- through the ADMIN'S OWN authenticated session instead (getRouteAuth's
-- client, not the service_role client) so auth.uid() correctly resolves to
-- the real admin and the bypass fires — exactly how set_contributor_hidden
-- and every other admin-privileged profiles RPC already works in this repo.
create or replace function public.admin_create_contributor_profile(
  _target_id uuid,
  _display_name text,
  _claim_email text,
  _contributor_kind text,
  _contributor_category text,
  _bio text,
  _website_url text,
  _instagram_handle text,
  _facebook_url text,
  _tiktok_handle text,
  _youtube_url text,
  _no_fixed_location boolean,
  _physical_address text,
  _physical_latitude double precision,
  _physical_longitude double precision,
  _logo_url text,
  _gallery_urls jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_slug text;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  new_slug := public.generate_contributor_slug(coalesce(nullif(_display_name, ''), 'contributor'));

  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_kind = _contributor_kind,
    contributor_category = _contributor_category,
    full_name = coalesce(nullif(_display_name, ''), full_name),
    bio = _bio,
    website_url = _website_url,
    instagram_handle = _instagram_handle,
    facebook_url = _facebook_url,
    tiktok_handle = _tiktok_handle,
    youtube_url = _youtube_url,
    contributor_no_fixed_location = _no_fixed_location,
    physical_address = _physical_address,
    physical_latitude = _physical_latitude,
    physical_longitude = _physical_longitude,
    logo_url = _logo_url,
    gallery_urls = coalesce(_gallery_urls, '[]'::jsonb),
    contributor_slug = new_slug,
    contributor_claim_email = _claim_email,
    contributor_created_by_admin = auth.uid()
  where id = _target_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'target_not_found');
  end if;

  return jsonb_build_object('success', true, 'slug', new_slug);
end;
$function$;

revoke all on function public.admin_create_contributor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text,
  boolean, text, double precision, double precision, text, jsonb
) from public, anon;
grant execute on function public.admin_create_contributor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text,
  boolean, text, double precision, double precision, text, jsonb
) to authenticated;
