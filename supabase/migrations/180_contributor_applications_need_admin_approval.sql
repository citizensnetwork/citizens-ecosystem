-- 180 — Self-serve "Become a Contributor" waits for an admin (founder decision D-12).
--
-- Why this migration exists
-- -------------------------
-- Until now submitting the apply form approved the applicant on the spot
-- (mig 164: `self_approve_contributor_application`). D-12 reverses that: the
-- applicant gets their Dashboard at once, but nothing of theirs is public until
-- an admin approves. Deleting one RPC is not enough, because there were FOUR
-- ways for an applicant to approve themselves, and this closes all of them:
--
--   1. The RPC `self_approve_contributor_application`.            -> dropped.
--   2. `protect_role_column()` allowed a signed-in user to flip their OWN row
--      citizen -> contributor and pending -> approved (it existed so that the
--      RPC above could run as the caller). `authenticated` has table-level
--      UPDATE on profiles, so a direct PostgREST call
--        PATCH /rest/v1/profiles?id=eq.<me>  {"contributor_status":"pending"}
--        PATCH /rest/v1/profiles?id=eq.<me>  {"contributor_status":"approved","role":"contributor"}
--      approved anyone, with or without an application.             -> tightened.
--   3. `contributor_applications` was writable by `authenticated` (and, in the
--      Supabase default grants, even by `anon`, held back only by RLS), so an
--      applicant could rewrite their own row after any validation: a
--      `javascript:` website, a made-up category, megabytes of text, all of it
--      copied onto the public profile when an admin pressed Approve.
--                                                                    -> server-written only.
--   4. The same table's "withdraw own pending application" UPDATE policy, which
--      let a user change ANY column of a pending row, not just the status.
--                                                                    -> unreachable (no privilege).
--
-- What stays allowed (and why each path still works)
-- --------------------------------------------------
--   * The applicant's own `not_applied -> pending` and `rejected -> pending`
--     transitions (this is "apply" and "re-apply").
--   * Admin approve / reject: SECURITY DEFINER RPCs called on the admin's own
--     session (`is_admin()`); and every other server path that sets role or
--     status (the claim RPC, the Form intake, admin Create, admin Delete) is a
--     SECURITY DEFINER function or service_role.
--
-- How the guard tells a server path from a signed-in user's own request
-- ---------------------------------------------------------------------
-- It cannot while it is itself SECURITY DEFINER (current_user is then always the
-- function owner). So it becomes SECURITY INVOKER and uses the same test as
-- `guard_profile_server_columns` (mig 175): a statement running as anything
-- other than anon/authenticated is server code and is trusted. Only requests
-- that arrive as the user (PostgREST, `set role authenticated`) are policed.
--
-- Where a pending applicant's profile edits live
-- ----------------------------------------------
-- NOT on `profiles`: its SELECT policy is `true` (column-allowlisted), so
-- anything a pending applicant saved there would be readable by anyone calling
-- the API directly. They live on the applicant's own `contributor_applications`
-- row (readable by the owner and admins only), through a validated server route,
-- and approval copies them onto the profile. The extra columns below (cover,
-- X / LinkedIn / WhatsApp, public contact email) are the ones the onboarding
-- profile has that the application did not.
--
-- Footguns restated (RESUME §3): CREATE OR REPLACE drops `set search_path`, so
-- it is re-stated and every reference is schema-qualified; grants are re-stated.

-- ── 1. The application row is written by the server, never by the client ──
revoke all on table public.contributor_applications from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.contributor_applications from authenticated;
-- authenticated keeps SELECT (RLS: own rows, or an admin); service_role is unchanged.

comment on table public.contributor_applications is
  'Self-serve Contributor applications (D-12: an admin approves before anything goes public). Written ONLY by the server (service_role) after validation; clients may read their own row. A pending applicant''s profile edits are staged here, not on profiles (profiles is world-readable), and approve_contributor_application copies them over.';

-- ── 2. The profile fields an applicant can stage while pending ────────────
alter table public.contributor_applications
  add column if not exists cover_photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists x_handle text,
  add column if not exists linkedin_url text,
  add column if not exists whatsapp_number text,
  add column if not exists contributor_contact_email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.contributor_applications'::regclass
                 and conname = 'contributor_applications_cover_photo_urls_shape') then
    alter table public.contributor_applications
      add constraint contributor_applications_cover_photo_urls_shape
      check (jsonb_typeof(cover_photo_urls) = 'array' and jsonb_array_length(cover_photo_urls) <= 6);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.contributor_applications'::regclass
                 and conname = 'contributor_applications_extra_fields_length') then
    alter table public.contributor_applications
      add constraint contributor_applications_extra_fields_length
      check (
        (x_handle is null or char_length(x_handle) <= 500)
        and (linkedin_url is null or char_length(linkedin_url) <= 500)
        and (whatsapp_number is null or char_length(whatsapp_number) <= 500)
        and (contributor_contact_email is null or char_length(contributor_contact_email) <= 254)
      );
  end if;
end $$;

-- ── 3. approve_contributor_application: copy the staged fields too ────────
-- (mig 179's body + the five columns above.)
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
    contributor_hidden = false,
    contributor_kind = coalesce(app.contributor_kind, contributor_kind),
    contributor_category = coalesce(app.contributor_category, contributor_category),
    full_name = coalesce(nullif(app.display_name, ''), full_name),
    bio = coalesce(app.bio, bio),
    website_url = coalesce(app.website_url, website_url),
    contributor_contact_email = coalesce(app.contributor_contact_email, contributor_contact_email),
    instagram_handle = coalesce(app.instagram_handle, instagram_handle),
    facebook_url = coalesce(app.facebook_url, facebook_url),
    tiktok_handle = coalesce(app.tiktok_handle, tiktok_handle),
    youtube_url = coalesce(app.youtube_url, youtube_url),
    x_handle = coalesce(app.x_handle, x_handle),
    linkedin_url = coalesce(app.linkedin_url, linkedin_url),
    whatsapp_number = coalesce(app.whatsapp_number, whatsapp_number),
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
    cover_photo_urls = case
      when jsonb_array_length(coalesce(app.cover_photo_urls, '[]'::jsonb)) > 0
        then app.cover_photo_urls
      else cover_photo_urls
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

revoke all on function public.approve_contributor_application(uuid) from public, anon;
grant execute on function public.approve_contributor_application(uuid) to authenticated;

-- ── 4. Nobody can approve themselves through an RPC any more ──────────────
drop function if exists public.self_approve_contributor_application(uuid);

-- ── 5. ...or through the table ────────────────────────────────────────────
-- Same trigger, same name; only the transitions a signed-in user may make on
-- their own row are left: apply (not_applied -> pending) and re-apply after a
-- rejection (rejected -> pending). A user can never change their own role.
create or replace function public.protect_role_column()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Server code (SECURITY DEFINER functions, service_role, the SQL editor) runs
  -- as a role other than anon/authenticated and is trusted; this guard polices
  -- requests that arrive as the user. Same test as guard_profile_server_columns.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only admins may change role. Use the contributor application flow.';
  end if;

  if new.contributor_status is distinct from old.contributor_status then
    if not (
      (old.contributor_status = 'not_applied' and new.contributor_status = 'pending')
      or (old.contributor_status = 'rejected' and new.contributor_status = 'pending')
    ) then
      raise exception 'contributor_status transition % -> % is not allowed.',
        old.contributor_status, new.contributor_status;
    end if;
  end if;

  return new;
end;
$function$;
