-- ════════════════════════════════════════════════════════════════════
--  201_open_to_collaborate
--
--  NOT APPLIED. This file is a proposal in a draft pull request.
--  The founder approved the change (issue #314, 2026-11-01). The
--  Builder does not apply it. Apply only after a pre-apply git tag
--  is pushed, then run
--  docs/audit/probes/201_open_to_collaborate.probe.sql (it rolls
--  itself back) and the security advisor (0 ERROR, no new finding).
--
--  WHAT THIS ADDS
--   public.profiles.open_to_collaborate boolean not null default false.
--   A listing says, in public, that it welcomes working with other
--   contributors. Existing rows stay false, so no chip appears until
--   an owner or editor turns it on.
--
--  WHO MAY WRITE IT
--   The approved contributor, on their own row, through the existing
--   profiles UPDATE policy (POST /api/contributor/profile).
--   An active editor, through update_contributor_public_profile
--   (the allow-list gains this one key; every other rule of migration
--   193 is restated, including search_path = '').
--   service_role, SECURITY DEFINER bodies, and is_admin() pass the
--   guard, which is how the editor function (it runs as its owner)
--   and an admin session can set the flag.
--   A citizen, a pending applicant, a stranger, and a missing JWT
--   cannot change it. The null auth.uid() arm is mandatory.
--
--  WHO MAY READ IT
--   anon and authenticated, column grant only (contract R3.5: a new
--   profiles column is private until this grant). Rows stay as
--   readable as the rest of the public listing. Directory queries
--   still require an approved, visible contributor. No new policy,
--   no table-level SELECT, no view.
--
--  WHAT THIS DOES NOT DO
--   It does not rank listings, store a message, or add a rate-limit
--   bypass. The flag is a boolean. The profile routes keep their
--   existing mutation limit.
-- ════════════════════════════════════════════════════════════════════

begin;

alter table public.profiles
  add column if not exists open_to_collaborate boolean not null default false;

comment on column public.profiles.open_to_collaborate is
  'Public listing flag (mig 201). True when an approved contributor says they welcome collaboration with other contributors. Default false. Citizens cannot set it.';

grant select (open_to_collaborate) on table public.profiles to anon, authenticated;

-- Raw API callers (anon / authenticated, not an admin) may change the flag
-- only on their own approved contributor row. SECURITY INVOKER on purpose:
-- current_user must stay the caller's role, which a SECURITY DEFINER
-- trigger would hide. service_role and SECURITY DEFINER bodies (the editor
-- RPC) pass because current_user is not anon or authenticated.
create or replace function public.guard_open_to_collaborate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.open_to_collaborate is not distinct from old.open_to_collaborate then
    return new;
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if auth.uid() is null
     or auth.uid() is distinct from old.id
     or old.role is distinct from 'contributor'
     or old.contributor_status is distinct from 'approved'
     or old.deleted_at is not null then
    raise exception 'open_to_collaborate is managed by the listing'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_open_to_collaborate() is
  'BEFORE UPDATE guard (mig 201). A raw anon/authenticated caller who is not an admin may change open_to_collaborate only on their own approved, non-deleted contributor row. A missing JWT fails the auth.uid() arm. service_role and SECURITY DEFINER bodies pass.';

revoke all on function public.guard_open_to_collaborate() from public, anon, authenticated;

drop trigger if exists trg_guard_open_to_collaborate on public.profiles;
create trigger trg_guard_open_to_collaborate
  before update on public.profiles
  for each row
  execute function public.guard_open_to_collaborate();

-- Restate the editor profile writer (migration 193) so the new key is
-- allow-listed. CREATE OR REPLACE drops search_path, so it is set again.
-- Unknown keys still raise forbidden_field and change nothing. A non-boolean
-- value raises invalid_field. Callers who are not an active editor of an
-- approved, visible listing still get unauthorized.
create or replace function public.update_contributor_public_profile(p_contributor_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_allowed constant text[] := array[
    'bio',
    'website_url',
    'instagram_handle',
    'facebook_url',
    'tiktok_handle',
    'youtube_url',
    'x_handle',
    'linkedin_url',
    'whatsapp_number',
    'physical_address',
    'physical_latitude',
    'physical_longitude',
    'contributor_no_fixed_location',
    'logo_url',
    'gallery_urls',
    'contributor_contact_email',
    'contributor_category',
    'open_to_collaborate'
  ];
  v_lat double precision;
  v_lng double precision;
  v_gallery jsonb;
  v_item jsonb;
  v_url text;
begin
  if v_uid is null or not public.is_active_team_member(p_contributor_id, array['editor']) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_patch)
  loop
    if not (v_key = any (v_allowed)) then
      raise exception 'forbidden_field' using errcode = '42501';
    end if;
  end loop;

  if p_patch ? 'bio' and p_patch->>'bio' is not null and char_length(p_patch->>'bio') > 2000 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'physical_address' and p_patch->>'physical_address' is not null and char_length(p_patch->>'physical_address') > 500 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'contributor_category' and p_patch->>'contributor_category' is not null and char_length(p_patch->>'contributor_category') > 80 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'contributor_contact_email' and p_patch->>'contributor_contact_email' is not null and char_length(p_patch->>'contributor_contact_email') > 254 then
    raise exception 'invalid_field' using errcode = '22023';
  end if;

  if p_patch ? 'website_url' and p_patch->>'website_url' is not null and p_patch->>'website_url' !~ '^https?://' then
    raise exception 'invalid_field' using errcode = '22023';
  end if;
  if p_patch ? 'logo_url' and p_patch->>'logo_url' is not null and p_patch->>'logo_url' !~ '^https://' then
    raise exception 'invalid_field' using errcode = '22023';
  end if;

  if p_patch ? 'physical_latitude' and p_patch->'physical_latitude' <> 'null'::jsonb then
    v_lat := (p_patch->>'physical_latitude')::double precision;
    if v_lat < -90 or v_lat > 90 then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'physical_longitude' and p_patch->'physical_longitude' <> 'null'::jsonb then
    v_lng := (p_patch->>'physical_longitude')::double precision;
    if v_lng < -180 or v_lng > 180 then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'gallery_urls' and p_patch->'gallery_urls' <> 'null'::jsonb then
    v_gallery := p_patch->'gallery_urls';
    if jsonb_typeof(v_gallery) <> 'array' or jsonb_array_length(v_gallery) > 6 then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(v_gallery)
    loop
      if jsonb_typeof(v_item) <> 'string' then
        raise exception 'invalid_field' using errcode = '22023';
      end if;
      v_url := v_item #>> '{}';
      if v_url is null or v_url !~ '^https://' or char_length(v_url) > 2000 then
        raise exception 'invalid_field' using errcode = '22023';
      end if;
    end loop;
  end if;

  if p_patch ? 'open_to_collaborate' and jsonb_typeof(p_patch->'open_to_collaborate') <> 'boolean' then
    raise exception 'invalid_field' using errcode = '22023';
  end if;

  update public.profiles set
    bio = case when p_patch ? 'bio' then nullif(p_patch->>'bio', '') else bio end,
    website_url = case when p_patch ? 'website_url' then nullif(p_patch->>'website_url', '') else website_url end,
    instagram_handle = case when p_patch ? 'instagram_handle' then nullif(p_patch->>'instagram_handle', '') else instagram_handle end,
    facebook_url = case when p_patch ? 'facebook_url' then nullif(p_patch->>'facebook_url', '') else facebook_url end,
    tiktok_handle = case when p_patch ? 'tiktok_handle' then nullif(p_patch->>'tiktok_handle', '') else tiktok_handle end,
    youtube_url = case when p_patch ? 'youtube_url' then nullif(p_patch->>'youtube_url', '') else youtube_url end,
    x_handle = case when p_patch ? 'x_handle' then nullif(p_patch->>'x_handle', '') else x_handle end,
    linkedin_url = case when p_patch ? 'linkedin_url' then nullif(p_patch->>'linkedin_url', '') else linkedin_url end,
    whatsapp_number = case when p_patch ? 'whatsapp_number' then nullif(p_patch->>'whatsapp_number', '') else whatsapp_number end,
    physical_address = case
      when p_patch ? 'contributor_no_fixed_location' and (p_patch->>'contributor_no_fixed_location')::boolean then null
      when p_patch ? 'physical_address' then nullif(p_patch->>'physical_address', '')
      else physical_address
    end,
    physical_latitude = case
      when p_patch ? 'contributor_no_fixed_location' and (p_patch->>'contributor_no_fixed_location')::boolean then null
      when p_patch ? 'physical_latitude' and p_patch->'physical_latitude' = 'null'::jsonb then null
      when p_patch ? 'physical_latitude' then (p_patch->>'physical_latitude')::double precision
      else physical_latitude
    end,
    physical_longitude = case
      when p_patch ? 'contributor_no_fixed_location' and (p_patch->>'contributor_no_fixed_location')::boolean then null
      when p_patch ? 'physical_longitude' and p_patch->'physical_longitude' = 'null'::jsonb then null
      when p_patch ? 'physical_longitude' then (p_patch->>'physical_longitude')::double precision
      else physical_longitude
    end,
    contributor_no_fixed_location = case
      when p_patch ? 'contributor_no_fixed_location' then (p_patch->>'contributor_no_fixed_location')::boolean
      else contributor_no_fixed_location
    end,
    logo_url = case when p_patch ? 'logo_url' then nullif(p_patch->>'logo_url', '') else logo_url end,
    gallery_urls = case
      when p_patch ? 'gallery_urls' and p_patch->'gallery_urls' = 'null'::jsonb then null
      when p_patch ? 'gallery_urls' then p_patch->'gallery_urls'
      else gallery_urls
    end,
    contributor_contact_email = case
      when p_patch ? 'contributor_contact_email' then nullif(lower(p_patch->>'contributor_contact_email'), '')
      else contributor_contact_email
    end,
    contributor_category = case
      when p_patch ? 'contributor_category' then nullif(p_patch->>'contributor_category', '')
      else contributor_category
    end,
    open_to_collaborate = case
      when p_patch ? 'open_to_collaborate' then (p_patch->>'open_to_collaborate')::boolean
      else open_to_collaborate
    end
  where id = p_contributor_id;

  insert into public.activity_log (
    contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    p_contributor_id,
    v_uid,
    'team_editor',
    'update_profile',
    'profile',
    p_contributor_id::text,
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_patch) as k))
  );

  return jsonb_build_object('success', true);
end;
$$;

comment on function public.update_contributor_public_profile(uuid, jsonb) is
  'Mig 201: an active editor updates the public profile columns of a listing they edit, including open_to_collaborate. Any other key raises forbidden_field. A non-boolean flag raises invalid_field. Owners keep their existing profile route. Authenticated EXECUTE is by design (auth.uid() guard inside).';

revoke all on function public.update_contributor_public_profile(uuid, jsonb) from public, anon;
grant execute on function public.update_contributor_public_profile(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
