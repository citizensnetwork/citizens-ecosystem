-- ════════════════════════════════════════════════════════════════════
--  198_intake_upgrade_existing_account
--
--  NOT APPLIED. The owner applies this file after an explicit yes
--  (pre-apply tag, rollback-only probe
--  docs/audit/probes/198_intake_upgrade_existing_account.probe.sql,
--  advisor 0 ERROR). Commit only. Do not apply from a pull request.
--
--  Google Form intake currently refuses an owner email that already
--  has a Citizens account. This file is the confirm-and-upgrade the
--  route uses instead (issue #248):
--
--    * one pending request per account, org details copied from the
--      approved row, listing NOT created yet
--    * single-use token stored only as a sha256 hex hash
--    * the account owner previews, confirms or declines through
--      SECURITY DEFINER functions that start with the auth.uid()
--      null guard and match the row to that uid
--    * confirm promotes citizen → contributor with the stored row
--      (two updates, so protect_role_column's allowed transitions
--      hold) and writes one admin_actions audit row
--    * decline and expiry change nothing on the profile, flag an
--      admin once (admin_actions; no email, no name in metadata)
--    * the sheet's HMAC route uses service_role functions. Those
--      refuse any caller that has an auth.uid(), and EXECUTE is
--      revoked from public, anon and authenticated
--
--  search_path is '' on every function (every name schema-qualified).
--  The owner view is security_invoker. Expected advisor delta after
--  apply: +3 WARN, authenticated SECURITY DEFINER EXECUTE on
--  preview_intake_upgrade, confirm_intake_upgrade and
--  decline_intake_upgrade. 0 ERROR.
-- ════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.intake_upgrade_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'expired')),
  -- sha256 hex of the raw link token. Null once the link has been used.
  token_hash text
    check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  display_name text not null check (char_length(display_name) between 2 and 120),
  contributor_kind text
    check (contributor_kind is null or contributor_kind in ('ministry', 'organization', 'business', 'individual')),
  contributor_category text not null check (char_length(contributor_category) between 1 and 64),
  bio text check (bio is null or char_length(bio) <= 1000),
  website_url text check (website_url is null or char_length(website_url) <= 500),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  instagram_handle text check (instagram_handle is null or char_length(instagram_handle) <= 500),
  facebook_url text check (facebook_url is null or char_length(facebook_url) <= 500),
  tiktok_handle text check (tiktok_handle is null or char_length(tiktok_handle) <= 500),
  youtube_url text check (youtube_url is null or char_length(youtube_url) <= 500),
  x_handle text check (x_handle is null or char_length(x_handle) <= 500),
  linkedin_url text check (linkedin_url is null or char_length(linkedin_url) <= 500),
  whatsapp_number text check (whatsapp_number is null or char_length(whatsapp_number) <= 500),
  no_fixed_location boolean not null default false,
  physical_address text check (physical_address is null or char_length(physical_address) <= 300),
  physical_latitude double precision check (physical_latitude is null or physical_latitude between -90 and 90),
  physical_longitude double precision check (physical_longitude is null or physical_longitude between -180 and 180),
  logo_url text,
  logo_storage_path text,
  cover_photo_urls jsonb not null default '[]'::jsonb,
  cover_storage_path text,
  auto_update_level text
    check (auto_update_level is null or auto_update_level in ('off', 'suggest', 'events_auto')),
  sources jsonb not null default '[]'::jsonb,
  listing_slug text,
  resend_count integer not null default 0 check (resend_count between 0 and 20),
  last_sent_at timestamptz,
  admin_flagged_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint intake_upgrade_pin_pair check (
    (physical_latitude is null and physical_longitude is null)
    or (physical_latitude is not null and physical_longitude is not null)
  ),
  constraint intake_upgrade_cover_shape check (jsonb_typeof(cover_photo_urls) = 'array'),
  constraint intake_upgrade_sources_shape check (jsonb_typeof(sources) = 'array')
);

create unique index if not exists intake_upgrade_one_pending
  on public.intake_upgrade_requests (profile_id)
  where status = 'pending';

create index if not exists intake_upgrade_token_hash_idx
  on public.intake_upgrade_requests (token_hash)
  where token_hash is not null;

comment on table public.intake_upgrade_requests is
  'Pending confirm-and-upgrade for a Google Form row whose owner email already has a citizen account (mig 198). The listing is created only when that account confirms. Token is a hash. No account email is stored here.';

alter table public.intake_upgrade_requests enable row level security;

revoke all on table public.intake_upgrade_requests from public, anon, authenticated;

-- The owner may read the non-secret columns of their own rows. token_hash,
-- contact details and storage paths are not granted, so a table select cannot
-- return them. Writes go through the functions below.
grant select (
  id, status, display_name, contributor_kind, contributor_category, bio,
  no_fixed_location, physical_address, expires_at, created_at, listing_slug
) on public.intake_upgrade_requests to authenticated;

grant all on table public.intake_upgrade_requests to service_role;

drop policy if exists intake_upgrade_requests_select_owner on public.intake_upgrade_requests;
create policy intake_upgrade_requests_select_owner
  on public.intake_upgrade_requests
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Owner-facing read. security_invoker so the policy and the column grants
-- above are the wall, not the view owner.
create or replace view public.my_intake_upgrade
with (security_invoker = on) as
select
  id,
  status,
  display_name,
  contributor_kind,
  contributor_category,
  bio,
  no_fixed_location,
  physical_address,
  expires_at,
  created_at,
  listing_slug
from public.intake_upgrade_requests
where profile_id = (select auth.uid());

comment on view public.my_intake_upgrade is
  'The signed-in account''s intake upgrades, without the token hash or contact fields (mig 198). security_invoker.';

revoke all on public.my_intake_upgrade from public, anon;
grant select on public.my_intake_upgrade to authenticated;

-- ── Shared: flag an admin once. Metadata is an id and a reason. No email, no name.

create or replace function public.intake_upgrade_flag_admin(_request_id uuid, _action text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile uuid;
  v_flagged timestamptz;
begin
  select profile_id, admin_flagged_at into v_profile, v_flagged
    from public.intake_upgrade_requests
   where id = _request_id
   for update;

  if v_profile is null or v_flagged is not null then
    return false;
  end if;

  -- Owner functions call this for their own row. The sheet functions call it
  -- as service_role (no uid). Anyone else flags nothing.
  if auth.uid() is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      return false;
    end if;
  elsif auth.uid() is distinct from v_profile and coalesce(auth.role(), '') <> 'service_role' then
    return false;
  end if;

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (
    v_profile,
    _action,
    'intake_upgrade',
    _request_id::text,
    jsonb_build_object('request_id', _request_id)
  );

  update public.intake_upgrade_requests
     set admin_flagged_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = _request_id;

  return true;
end;
$function$;

revoke all on function public.intake_upgrade_flag_admin(uuid, text) from public, anon, authenticated;

comment on function public.intake_upgrade_flag_admin(uuid, text) is
  'Internal. One admin_actions row per upgrade request. Not granted to any client role (mig 198).';

-- ── Owner: preview. Does not consume the token.

create or replace function public.preview_intake_upgrade(_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.intake_upgrade_requests%rowtype;
  v_notify boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if _token_hash is null or _token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  select * into v_row
    from public.intake_upgrade_requests
   where token_hash = _token_hash
   for update;

  if v_row.id is null then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_row.profile_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'reason', 'wrong_account');
  end if;

  if v_row.status = 'pending' and v_row.expires_at <= pg_catalog.now() then
    update public.intake_upgrade_requests
       set status = 'expired',
           token_hash = null,
           updated_at = pg_catalog.now()
     where id = v_row.id;
    v_notify := public.intake_upgrade_flag_admin(v_row.id, 'intake_upgrade_expired');
    return jsonb_build_object(
      'success', false,
      'reason', 'expired',
      'request_id', v_row.id,
      'notify_admin', v_notify,
      'display_name', v_row.display_name,
      'logo_storage_path', v_row.logo_storage_path,
      'cover_storage_path', v_row.cover_storage_path
    );
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'reason', v_row.status,
      'request_id', v_row.id,
      'listing_slug', v_row.listing_slug
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'request_id', v_row.id,
    'display_name', v_row.display_name,
    'contributor_kind', v_row.contributor_kind,
    'contributor_category', v_row.contributor_category,
    'bio', v_row.bio,
    'no_fixed_location', v_row.no_fixed_location,
    'physical_address', v_row.physical_address,
    'expires_at', v_row.expires_at
  );
end;
$function$;

revoke all on function public.preview_intake_upgrade(text) from public, anon;
grant execute on function public.preview_intake_upgrade(text) to authenticated;

comment on function public.preview_intake_upgrade(text) is
  'Signed-in owner reads the upgrade their link points at (mig 198). auth.uid() must match the row. Does not consume the token. A due link is expired here, once.';

-- ── Owner: decline. No profile change.

create or replace function public.decline_intake_upgrade(_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.intake_upgrade_requests%rowtype;
  v_notify boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if _token_hash is null or _token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  select * into v_row
    from public.intake_upgrade_requests
   where token_hash = _token_hash
   for update;

  if v_row.id is null then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_row.profile_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'reason', 'wrong_account');
  end if;

  if v_row.status = 'pending' and v_row.expires_at <= pg_catalog.now() then
    update public.intake_upgrade_requests
       set status = 'expired', token_hash = null, updated_at = pg_catalog.now()
     where id = v_row.id;
    v_notify := public.intake_upgrade_flag_admin(v_row.id, 'intake_upgrade_expired');
    return jsonb_build_object(
      'success', false, 'reason', 'expired', 'request_id', v_row.id, 'notify_admin', v_notify,
      'display_name', v_row.display_name,
      'logo_storage_path', v_row.logo_storage_path, 'cover_storage_path', v_row.cover_storage_path
    );
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object('success', false, 'reason', v_row.status, 'request_id', v_row.id);
  end if;

  update public.intake_upgrade_requests
     set status = 'declined', token_hash = null, updated_at = pg_catalog.now()
   where id = v_row.id;

  v_notify := public.intake_upgrade_flag_admin(v_row.id, 'intake_upgrade_declined');

  return jsonb_build_object(
    'success', true,
    'status', 'declined',
    'request_id', v_row.id,
    'notify_admin', v_notify,
    'display_name', v_row.display_name,
    'logo_storage_path', v_row.logo_storage_path,
    'cover_storage_path', v_row.cover_storage_path
  );
end;
$function$;

revoke all on function public.decline_intake_upgrade(text) from public, anon;
grant execute on function public.decline_intake_upgrade(text) to authenticated;

comment on function public.decline_intake_upgrade(text) is
  'Signed-in owner says the organisation is not theirs (mig 198). The profile is not changed. One admin flag. The token cannot be reused.';

-- ── Owner: confirm. Promotes the citizen and creates the listing fields.

create or replace function public.confirm_intake_upgrade(_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.intake_upgrade_requests%rowtype;
  v_email text;
  v_slug text;
  v_status text;
  v_notify boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if _token_hash is null or _token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  select * into v_row
    from public.intake_upgrade_requests
   where token_hash = _token_hash
   for update;

  if v_row.id is null then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_row.profile_id is distinct from v_uid then
    return jsonb_build_object('success', false, 'reason', 'wrong_account');
  end if;

  if v_row.status = 'pending' and v_row.expires_at <= pg_catalog.now() then
    update public.intake_upgrade_requests
       set status = 'expired', token_hash = null, updated_at = pg_catalog.now()
     where id = v_row.id;
    v_notify := public.intake_upgrade_flag_admin(v_row.id, 'intake_upgrade_expired');
    return jsonb_build_object(
      'success', false, 'reason', 'expired', 'request_id', v_row.id, 'notify_admin', v_notify,
      'display_name', v_row.display_name,
      'logo_storage_path', v_row.logo_storage_path, 'cover_storage_path', v_row.cover_storage_path
    );
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object(
      'success', false, 'reason', v_row.status, 'request_id', v_row.id, 'listing_slug', v_row.listing_slug
    );
  end if;

  select contributor_status into v_status
    from public.profiles
   where id = v_uid
     and role = 'citizen'
     and contributor_slug is null
     and deleted_at is null
   for update;

  if not found or coalesce(v_status, '') not in ('not_applied', 'rejected', 'pending') then
    return jsonb_build_object('success', false, 'reason', 'not_eligible');
  end if;

  -- protect_role_column allows not_applied/rejected → pending, then
  -- pending → approved with role citizen → contributor for auth.uid().
  if v_status is distinct from 'pending' then
    update public.profiles
       set contributor_status = 'pending'
     where id = v_uid
       and role = 'citizen'
       and contributor_slug is null
       and deleted_at is null;
  end if;

  select email into v_email from auth.users where id = v_uid;
  v_slug := public.generate_contributor_slug(v_row.display_name);

  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_hidden = false,
    contributor_kind = v_row.contributor_kind,
    contributor_category = v_row.contributor_category,
    full_name = v_row.display_name,
    bio = v_row.bio,
    website_url = v_row.website_url,
    contributor_contact_email = v_row.contact_email,
    instagram_handle = v_row.instagram_handle,
    facebook_url = v_row.facebook_url,
    tiktok_handle = v_row.tiktok_handle,
    youtube_url = v_row.youtube_url,
    x_handle = v_row.x_handle,
    linkedin_url = v_row.linkedin_url,
    whatsapp_number = v_row.whatsapp_number,
    contributor_no_fixed_location = v_row.no_fixed_location,
    physical_address = case when v_row.no_fixed_location then null else v_row.physical_address end,
    physical_latitude = case when v_row.no_fixed_location then null else v_row.physical_latitude end,
    physical_longitude = case when v_row.no_fixed_location then null else v_row.physical_longitude end,
    logo_url = v_row.logo_url,
    cover_photo_urls = case
      when jsonb_typeof(v_row.cover_photo_urls) = 'array' then v_row.cover_photo_urls
      else '[]'::jsonb
    end,
    contributor_slug = v_slug,
    contributor_claim_email = v_email,
    contributor_claimed_at = pg_catalog.now(),
    contributor_created_by_admin = null,
    auto_update_level = case
      when v_row.auto_update_level in ('suggest', 'events_auto') then v_row.auto_update_level
      else auto_update_level
    end,
    auto_update_consent_at = case
      when v_row.auto_update_level in ('suggest', 'events_auto') then pg_catalog.now()
      else auto_update_consent_at
    end,
    auto_update_consent_source = case
      when v_row.auto_update_level in ('suggest', 'events_auto') then 'google_form'
      else auto_update_consent_source
    end
  where id = v_uid
    and role = 'citizen'
    and contributor_status = 'pending'
    and contributor_slug is null
    and deleted_at is null;

  if not found then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;

  insert into public.listing_sources (contributor_id, kind, url, enabled)
  select v_uid, s.kind, s.url, coalesce(s.enabled, false)
    from jsonb_to_recordset(coalesce(v_row.sources, '[]'::jsonb))
      as s(kind text, url text, enabled boolean)
   where s.kind in ('website', 'youtube', 'calendar', 'facebook', 'instagram', 'tiktok')
     and s.url ~ '^https://'
     and char_length(s.url) <= 500
     and (s.kind in ('website', 'youtube', 'calendar') or coalesce(s.enabled, false) = false)
  on conflict (contributor_id, kind, url) do update
    set enabled = excluded.enabled;

  update public.contributor_applications
     set status = 'withdrawn',
         reviewed_at = pg_catalog.now(),
         reviewer_id = v_uid
   where user_id = v_uid
     and status = 'pending';

  update public.intake_upgrade_requests
     set status = 'confirmed',
         token_hash = null,
         listing_slug = v_slug,
         updated_at = pg_catalog.now()
   where id = v_row.id;

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (
    v_uid,
    'intake_upgrade_confirmed',
    'intake_upgrade',
    v_row.id::text,
    jsonb_build_object('request_id', v_row.id)
  );

  return jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'request_id', v_row.id,
    'slug', v_slug,
    'display_name', v_row.display_name,
    'no_fixed_location', v_row.no_fixed_location,
    'physical_latitude', v_row.physical_latitude,
    'physical_longitude', v_row.physical_longitude
  );
end;
$function$;

revoke all on function public.confirm_intake_upgrade(text) from public, anon;
grant execute on function public.confirm_intake_upgrade(text) to authenticated;

comment on function public.confirm_intake_upgrade(text) is
  'Signed-in owner confirms the upgrade (mig 198). Copies the stored row onto their profile, withdraws a pending self-serve application, and consumes the token. A failed promotion raises, so the pending flip is not left behind.';

-- ── Sheet (service_role only): create, resend, status, clear files.
--    auth.uid() is null for service_role. A caller who HAS a uid is refused,
--    so a signed-in session cannot drive these even if a grant were widened.

create or replace function public.create_intake_upgrade_request(
  _profile_id uuid,
  _token_hash text,
  _expires_at timestamptz,
  _display_name text,
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
  _logo_storage_path text,
  _cover_photo_urls jsonb,
  _cover_storage_path text,
  _auto_update_level text,
  _sources jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing public.intake_upgrade_requests%rowtype;
  v_id uuid;
  v_expires timestamptz;
  v_notify boolean := false;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'reason', 'forbidden');
  end if;

  if _profile_id is null or _token_hash is null or _token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('success', false, 'reason', 'invalid_input');
  end if;

  if coalesce(pg_catalog.btrim(_display_name), '') = '' or coalesce(pg_catalog.btrim(_contributor_category), '') = '' then
    return jsonb_build_object('success', false, 'reason', 'invalid_input');
  end if;

  perform 1
    from public.profiles
   where id = _profile_id
     and role = 'citizen'
     and contributor_slug is null
     and deleted_at is null
   for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_eligible');
  end if;

  select * into v_existing
    from public.intake_upgrade_requests
   where profile_id = _profile_id
     and status = 'pending'
   for update;

  if v_existing.id is not null and v_existing.expires_at > pg_catalog.now() then
    return jsonb_build_object('success', true, 'reused', true, 'request_id', v_existing.id, 'expires_at', v_existing.expires_at);
  end if;

  if v_existing.id is not null then
    update public.intake_upgrade_requests
       set status = 'expired', token_hash = null, updated_at = pg_catalog.now()
     where id = v_existing.id;
    v_notify := public.intake_upgrade_flag_admin(v_existing.id, 'intake_upgrade_expired');
  end if;

  -- The route asks for 7 days. Never store longer than 8, never a past stamp.
  v_expires := least(
    greatest(coalesce(_expires_at, pg_catalog.now() + interval '7 days'), pg_catalog.now() + interval '1 hour'),
    pg_catalog.now() + interval '8 days'
  );

  insert into public.intake_upgrade_requests (
    profile_id, token_hash, expires_at, display_name, contributor_kind, contributor_category,
    bio, website_url, contact_email, instagram_handle, facebook_url, tiktok_handle, youtube_url,
    x_handle, linkedin_url, whatsapp_number, no_fixed_location, physical_address,
    physical_latitude, physical_longitude, logo_url, logo_storage_path, cover_photo_urls,
    cover_storage_path, auto_update_level, sources, last_sent_at
  ) values (
    _profile_id, _token_hash, v_expires, pg_catalog.left(pg_catalog.btrim(_display_name), 120), _contributor_kind, _contributor_category,
    _bio, _website_url, _contact_email, _instagram_handle, _facebook_url, _tiktok_handle, _youtube_url,
    _x_handle, _linkedin_url, _whatsapp_number, coalesce(_no_fixed_location, false), _physical_address,
    _physical_latitude, _physical_longitude, _logo_url, _logo_storage_path,
    case when jsonb_typeof(_cover_photo_urls) = 'array' then _cover_photo_urls else '[]'::jsonb end,
    _cover_storage_path,
    case when _auto_update_level in ('off', 'suggest', 'events_auto') then _auto_update_level else 'off' end,
    case when jsonb_typeof(_sources) = 'array' then _sources else '[]'::jsonb end,
    pg_catalog.now()
  )
  returning id into v_id;

  return jsonb_build_object(
    'success', true,
    'reused', false,
    'request_id', v_id,
    'expires_at', v_expires,
    'notify_admin', v_notify,
    'expired_request_id', v_existing.id,
    'logo_storage_path', v_existing.logo_storage_path,
    'cover_storage_path', v_existing.cover_storage_path
  );
end;
$function$;

revoke all on function public.create_intake_upgrade_request(
  uuid, text, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, double precision, double precision, text, text, jsonb, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_intake_upgrade_request(
  uuid, text, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, double precision, double precision, text, text, jsonb, text, text, jsonb
) to service_role;

create or replace function public.resend_intake_upgrade(_id uuid, _token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.intake_upgrade_requests%rowtype;
  v_notify boolean := false;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'reason', 'forbidden');
  end if;

  if _id is null or _token_hash is null or _token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('success', false, 'reason', 'invalid_input');
  end if;

  select * into v_row from public.intake_upgrade_requests where id = _id for update;

  if v_row.id is null then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_row.status = 'pending' and v_row.expires_at <= pg_catalog.now() then
    update public.intake_upgrade_requests
       set status = 'expired', token_hash = null, updated_at = pg_catalog.now()
     where id = v_row.id;
    v_notify := public.intake_upgrade_flag_admin(v_row.id, 'intake_upgrade_expired');
    return jsonb_build_object(
      'success', false, 'reason', 'expired', 'request_id', v_row.id, 'notify_admin', v_notify,
      'display_name', v_row.display_name,
      'logo_storage_path', v_row.logo_storage_path, 'cover_storage_path', v_row.cover_storage_path
    );
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object('success', false, 'reason', v_row.status, 'request_id', v_row.id);
  end if;

  if v_row.resend_count >= 8
     or (v_row.last_sent_at is not null and v_row.last_sent_at > pg_catalog.now() - interval '10 minutes') then
    return jsonb_build_object('success', false, 'reason', 'rate_limited', 'request_id', v_row.id);
  end if;

  update public.intake_upgrade_requests
     set token_hash = _token_hash,
         resend_count = resend_count + 1,
         last_sent_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = v_row.id;

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'request_id', v_row.id,
    'profile_id', v_row.profile_id,
    'display_name', v_row.display_name,
    'expires_at', v_row.expires_at
  );
end;
$function$;

revoke all on function public.resend_intake_upgrade(uuid, text) from public, anon, authenticated;
grant execute on function public.resend_intake_upgrade(uuid, text) to service_role;

comment on function public.resend_intake_upgrade(uuid, text) is
  'Sheet resend (mig 198). Rotates the hash, keeps the original expiry, refuses inside 10 minutes or after 8 resends. service_role only.';

create or replace function public.intake_upgrade_statuses(_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_row public.intake_upgrade_requests%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_notify boolean;
  v_seen integer := 0;
  v_on_map boolean;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'reason', 'forbidden');
  end if;

  if _ids is null then
    return jsonb_build_object('success', true, 'results', '[]'::jsonb);
  end if;

  foreach v_id in array _ids loop
    v_seen := v_seen + 1;
    exit when v_seen > 40;

    select * into v_row from public.intake_upgrade_requests where id = v_id for update;
    if v_row.id is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'status', 'unknown'));
      continue;
    end if;

    v_notify := false;
    if v_row.status = 'pending' and v_row.expires_at <= pg_catalog.now() then
      update public.intake_upgrade_requests
         set status = 'expired', token_hash = null, updated_at = pg_catalog.now()
       where id = v_row.id;
      v_row.status := 'expired';
      v_notify := public.intake_upgrade_flag_admin(v_row.id, 'intake_upgrade_expired');
    end if;

    v_on_map := v_row.no_fixed_location = false
      and v_row.physical_latitude is not null
      and v_row.physical_longitude is not null;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'status', case v_row.status
        when 'pending' then 'awaiting_confirmation'
        when 'confirmed' then 'confirmed'
        when 'declined' then 'declined'
        else 'expired'
      end,
      'url_slug', v_row.listing_slug,
      'on_map', v_on_map,
      'notify_admin', v_notify,
      'display_name', case when v_notify then v_row.display_name else null end,
      'logo_storage_path', case when v_row.status in ('declined', 'expired') then v_row.logo_storage_path else null end,
      'cover_storage_path', case when v_row.status in ('declined', 'expired') then v_row.cover_storage_path else null end
    ));
  end loop;

  return jsonb_build_object('success', true, 'results', v_results);
end;
$function$;

revoke all on function public.intake_upgrade_statuses(uuid[]) from public, anon, authenticated;
grant execute on function public.intake_upgrade_statuses(uuid[]) to service_role;

comment on function public.intake_upgrade_statuses(uuid[]) is
  'Sheet poll (mig 198). Expires due rows, flags an admin once, and returns status. At most 40 ids. service_role only.';

create or replace function public.clear_intake_upgrade_storage(_ids uuid[])
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is not null or coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.intake_upgrade_requests
     set logo_storage_path = null,
         cover_storage_path = null,
         updated_at = pg_catalog.now()
   where id = any (_ids)
     and status in ('declined', 'expired');
end;
$function$;

revoke all on function public.clear_intake_upgrade_storage(uuid[]) from public, anon, authenticated;
grant execute on function public.clear_intake_upgrade_storage(uuid[]) to service_role;

comment on function public.clear_intake_upgrade_storage(uuid[]) is
  'After the route deletes leftover images for a declined or expired upgrade (mig 198). service_role only.';

commit;

-- ROLLBACK (manual, only if this file was applied and must be undone):
--   drop function if exists public.clear_intake_upgrade_storage(uuid[]);
--   drop function if exists public.intake_upgrade_statuses(uuid[]);
--   drop function if exists public.resend_intake_upgrade(uuid, text);
--   drop function if exists public.create_intake_upgrade_request(uuid, text, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, double precision, double precision, text, text, jsonb, text, text, jsonb);
--   drop function if exists public.confirm_intake_upgrade(text);
--   drop function if exists public.decline_intake_upgrade(text);
--   drop function if exists public.preview_intake_upgrade(text);
--   drop function if exists public.intake_upgrade_flag_admin(uuid, text);
--   drop view if exists public.my_intake_upgrade;
--   drop table if exists public.intake_upgrade_requests;
