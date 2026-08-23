-- 164 — Connect v1: self-serve Contributor go-live + map visibility.
--
-- Founder decision (2026-08-24, V1_SCOPE.md): Contributor applications go
-- live immediately on submission — no admin-approval wait. This migration
-- adds the narrowly-scoped self-approval path (a citizen may only approve
-- their OWN pending application, copying the exact same fields the
-- existing admin RPC copies) and a founder-only hide/flag column as the
-- moderation safety net that replaces pre-publish review.
--
-- It also closes a real gap found while wiring Contributors onto the map:
-- the Apply wizard already collects a map category (EVENT_CATEGORIES,
-- "sets your colour & icon across the map") but there was nowhere on
-- `profiles`/`contributor_applications` to store it — it was being sent
-- as `contributor_kind` (ministry/organization/business) and silently
-- dropped by that column's check constraint. `contributor_category` is
-- the correct, separate column for that.

-- ── 1. New columns ───────────────────────────────────────────────────
alter table public.profiles
  add column if not exists contributor_category text;

alter table public.profiles
  add column if not exists contributor_hidden boolean not null default false;

alter table public.contributor_applications
  add column if not exists contributor_category text;

comment on column public.profiles.contributor_category is
  'Map/event-category slug (EVENT_CATEGORIES id) chosen at application time — sets pin colour & icon. Distinct from contributor_kind (ministry/organization/business).';
comment on column public.profiles.contributor_hidden is
  'Founder/admin-only visibility override. True hides an otherwise-approved Contributor from all public reads (directory_contributors, /api/v1/contributors) without deleting or rejecting them — the moderation safety net for the v1 no-pre-review flow.';

-- ── 2. Self-approval RPC ─────────────────────────────────────────────
-- Mirrors approve_contributor_application(), but gated on the CALLER
-- being the application's own owner instead of is_admin(). Kept as a
-- separate function (not a branch inside the admin one) so the admin
-- path's audit meaning ("an admin reviewed this") stays unambiguous —
-- reviewer_id on a self-approved row is the applicant themselves, which
-- is a distinguishable, honest signal in the applications history.
create or replace function public.self_approve_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
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

comment on function public.self_approve_contributor_application(uuid) is
  'v1 self-serve go-live: applicant approves their OWN pending application immediately on submit. No admin involved. See protect_role_column() for the matching trigger carve-out.';

-- ── 3. Founder-only hide/flag RPC ───────────────────────────────────
create or replace function public.set_contributor_hidden(_user_id uuid, _hidden boolean)
returns jsonb
language plpgsql
security definer
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

comment on function public.set_contributor_hidden(uuid, boolean) is
  'Admin-only. Hides/unhides an approved Contributor from public reads without rejecting or deleting them — the v1 moderation safety net.';

-- ── 4. Trigger carve-out for the self-serve transition ─────────────
-- Narrowly scoped: only the EXACT (citizen→contributor role) +
-- (pending→approved status) pair, only on the caller's own row. Every
-- other role/status transition still requires is_admin() as before.
create or replace function public.protect_role_column()
returns trigger as $$
begin
  -- Admin bypass for both role and contributor_status.
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not (old.role = 'citizen' and new.role = 'contributor' and new.id = auth.uid()) then
      raise exception 'Only admins may change role. Use the contributor application flow.';
    end if;
  end if;

  -- Users may transition not_applied → pending (submitting their own
  -- application) or, as of v1's self-serve flow, pending → approved on
  -- their own row (self_approve_contributor_application). All other
  -- transitions must go through an admin RPC.
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
$$ language plpgsql security definer;

-- (trigger itself is unchanged — CREATE OR REPLACE on the function body
-- above is sufficient; no DROP/CREATE TRIGGER needed.)

-- ── 5. Admin RPC + read contract stay in sync ───────────────────────
create or replace function public.approve_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
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

-- directory_contributors: add contributor_category, hide contributor_hidden rows.
create or replace view public.directory_contributors as
  select
    id,
    contributor_slug as slug,
    full_name as name,
    contributor_kind as kind,
    contributor_category as category,
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
    created_at
  from public.profiles
  where role = 'contributor'
    and contributor_status = 'approved'
    and contributor_slug is not null
    and coalesce(contributor_hidden, false) = false;

grant select on public.directory_contributors to anon, authenticated;

-- ── 6. EXECUTE grants (mirror the mig-140 hardening pattern: internal
--       auth.uid()/is_admin() guard → authenticated only, never anon) ──
revoke execute on function public.self_approve_contributor_application(uuid) from public, anon;
grant  execute on function public.self_approve_contributor_application(uuid) to authenticated;

revoke execute on function public.set_contributor_hidden(uuid, boolean) from public, anon;
grant  execute on function public.set_contributor_hidden(uuid, boolean) to authenticated;
