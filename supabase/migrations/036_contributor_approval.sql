-- ============================================
-- Migration 036: Contributor Approval Flow
-- ============================================
-- Introduces a formal application + approval workflow for Contributors
-- (the organiser role). Citizens can apply from within the app; admins
-- review via /admin/contributors or a signed email deep-link.
--
-- Key concepts:
--  * profiles.contributor_status — lifecycle: not_applied → pending → approved/rejected
--  * profiles.role flips to 'contributor' ONLY on approval (role stays
--    'citizen' during pending state so pending users keep Citizen app access).
--  * contributor_applications — audit trail of every submission.
--  * is_approved_contributor() — RLS helper mirroring is_admin().
--  * directory_contributors view — stable read contract for Citizens Central.
--  * events.community_contributor — citizens can still create public events
--    (rate-limited in API layer); this flag surfaces a "Community Contributor"
--    chip on the event so attendees understand the distinction.
--
-- Idempotent. Safe to re-run.
-- ============================================

-- ── 0. Defensive: ensure social-handle columns exist ───────────────
-- Migration 021 added these to schema.sql but wasn't applied in the
-- live DB when 036 was authored. Guarded so this is a no-op on a
-- fully-migrated DB.
alter table public.profiles add column if not exists instagram_handle text;
alter table public.profiles add column if not exists facebook_url text;
alter table public.profiles add column if not exists tiktok_handle text;

-- ── 1. Profile columns ──────────────────────────────────────────────
alter table public.profiles
  add column if not exists contributor_status text
    not null default 'not_applied'
    check (contributor_status in ('not_applied', 'pending', 'approved', 'rejected'));

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  add column if not exists website_url text;

alter table public.profiles
  add column if not exists physical_address text;

alter table public.profiles
  add column if not exists physical_latitude double precision;

alter table public.profiles
  add column if not exists physical_longitude double precision;

-- logo_url is distinct from avatar_url: citizens use avatar; contributors
-- may use either or both. Keeping them separate avoids stamping over a
-- personal avatar when someone becomes a contributor.
alter table public.profiles
  add column if not exists logo_url text;

alter table public.profiles
  add column if not exists gallery_urls jsonb not null default '[]'::jsonb;

alter table public.profiles
  add column if not exists youtube_url text;

alter table public.profiles
  add column if not exists contributor_slug text;

create unique index if not exists profiles_contributor_slug_key
  on public.profiles(contributor_slug)
  where contributor_slug is not null;

-- Dormant columns — wired in later phases, added now so those phases
-- don't need a migration:
--  * needs_re_review flips true when material contributor fields change
--    after approval (roadmap: optional admin re-moderation).
--  * community_contributor_score accumulates positive signals (converted
--    considers, RSVPs brought in) so citizens can earn a badge.
alter table public.profiles
  add column if not exists needs_re_review boolean not null default false;

alter table public.profiles
  add column if not exists community_contributor_score int not null default 0;

-- ── 2. Event flag for citizen-created public events ─────────────────
alter table public.events
  add column if not exists community_contributor boolean not null default false;

create index if not exists events_community_contributor_created_by_idx
  on public.events(created_by, created_at)
  where community_contributor = true;

-- ── 3. Contributor applications (audit trail) ───────────────────────
create table if not exists public.contributor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  -- Snapshot of submitted content at moment of application:
  display_name text not null,
  contributor_kind text
    check (contributor_kind is null or contributor_kind in ('ministry', 'organization', 'business')),
  bio text,
  website_url text,
  instagram_handle text,
  facebook_url text,
  tiktok_handle text,
  youtube_url text,
  physical_address text,
  physical_latitude double precision,
  physical_longitude double precision,
  logo_url text,
  gallery_urls jsonb not null default '[]'::jsonb,
  motivation_text text
);

create index if not exists contributor_applications_user_id_idx
  on public.contributor_applications(user_id);

create index if not exists contributor_applications_status_submitted_idx
  on public.contributor_applications(status, submitted_at desc);

-- Only ONE pending application per user at a time. Rejected/approved
-- applications don't block; withdrawn doesn't block.
create unique index if not exists contributor_applications_one_pending_per_user
  on public.contributor_applications(user_id)
  where status = 'pending';

alter table public.contributor_applications enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Users see own applications'
    and tablename = 'contributor_applications'
  ) then
    create policy "Users see own applications" on public.contributor_applications
      for select using (user_id = auth.uid() or public.is_admin());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Users create own applications'
    and tablename = 'contributor_applications'
  ) then
    create policy "Users create own applications" on public.contributor_applications
      for insert with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Admins update applications'
    and tablename = 'contributor_applications'
  ) then
    create policy "Admins update applications" on public.contributor_applications
      for update using (public.is_admin());
  end if;
end $$;

-- Users can withdraw their own pending applications (update status only).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Users withdraw own pending applications'
    and tablename = 'contributor_applications'
  ) then
    create policy "Users withdraw own pending applications" on public.contributor_applications
      for update using (user_id = auth.uid() and status = 'pending')
      with check (user_id = auth.uid() and status in ('pending', 'withdrawn'));
  end if;
end $$;

-- ── 4. Helper functions ─────────────────────────────────────────────

-- Returns true when the current auth user is an approved contributor
-- OR an admin. Used by RLS policies on places and future contributor-
-- gated tables.
create or replace function public.is_approved_contributor()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and (
      role = 'admin'
      or (role = 'contributor' and contributor_status = 'approved')
    )
  );
$$;

-- Slug generator: lowercase, ascii, hyphenated; appends -2, -3, ... on
-- collision. Called by the approval RPC.
create or replace function public.generate_contributor_slug(_name text)
returns text
language plpgsql
as $$
declare
  base_slug text;
  candidate text;
  counter int := 1;
begin
  -- Strip accents (crude), lowercase, keep only a-z/0-9, hyphenate runs.
  base_slug := regexp_replace(lower(coalesce(_name, '')), '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');
  if base_slug = '' or base_slug is null then
    base_slug := 'contributor';
  end if;
  candidate := base_slug;
  while exists (select 1 from public.profiles where contributor_slug = candidate) loop
    counter := counter + 1;
    candidate := base_slug || '-' || counter::text;
  end loop;
  return candidate;
end;
$$;

-- Approval RPC: admin-only. Copies snapshot from application onto
-- profile, flips role + status, generates slug, notifies the user.
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

create or replace function public.reject_contributor_application(
  _application_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
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

  -- Flip the profile status so the applicant can see the rejection
  -- (and can re-apply after the cooldown). Role stays 'citizen'.
  update public.profiles set
    contributor_status = 'rejected'
  where id = app.user_id;

  insert into public.notifications (user_id, type, title, body, url)
  values (
    app.user_id,
    'contributor_rejected',
    'Contributor application update',
    _reason,
    '/contributor/apply'
  );

  return jsonb_build_object(
    'success', true,
    'action', 'rejected',
    'user_id', app.user_id
  );
end;
$$;

-- ── 5. Citizens Central read contract ───────────────────────────────
-- `directory_contributors` is the STABLE view Citizens Central (and any
-- future ecosystem surface) reads from. Internal columns on `profiles`
-- can evolve; this view must not change shape without coordinating with
-- downstream consumers. Keep columns additive.
create or replace view public.directory_contributors as
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
    created_at
  from public.profiles
  where role = 'contributor'
    and contributor_status = 'approved'
    and contributor_slug is not null;

-- Allow anon + authenticated reads via RLS inheritance.
grant select on public.directory_contributors to anon, authenticated;

-- ── 6. Tighten signup trigger ───────────────────────────────────────
-- New users always land as role='citizen'. Their intent (if they picked
-- "contributor" at signup) is preserved in contributor_kind so the
-- post-signup application form can pre-fill it.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  signup_kind text;
begin
  signup_kind := nullif(new.raw_user_meta_data->>'contributor_kind', '');
  if signup_kind is not null
     and signup_kind not in ('ministry', 'organization', 'business') then
    signup_kind := null;
  end if;

  insert into public.profiles (id, email, full_name, role, contributor_kind, contributor_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'citizen',
    signup_kind,
    'not_applied'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 7. Protect role escalation ──────────────────────────────────────
-- Users cannot self-promote to contributor/admin. Role changes must
-- flow through approve_contributor_application() or direct DB access
-- (admin-only). contributor_status is similarly locked — only the
-- approval RPC can move it out of 'not_applied'/'pending'.
create or replace function public.protect_role_column()
returns trigger as $$
begin
  -- Admin bypass for both role and contributor_status.
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only admins may change role. Use the contributor application flow.';
  end if;

  -- Users may transition not_applied → pending (by submitting their
  -- own application via the RLS-allowed insert into
  -- contributor_applications, which is followed by a same-user update
  -- to profiles.contributor_status in the API route). All other
  -- transitions must go through the RPCs.
  if new.contributor_status is distinct from old.contributor_status then
    if not (
      old.contributor_status = 'not_applied' and new.contributor_status = 'pending'
      or old.contributor_status = 'rejected' and new.contributor_status = 'pending'
    ) then
      raise exception 'contributor_status transition % -> % is not allowed.',
        old.contributor_status, new.contributor_status;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_role_on_update on public.profiles;
create trigger protect_role_on_update
  before update on public.profiles
  for each row execute procedure public.protect_role_column();

-- ── 8. Notification type extension ──────────────────────────────────
-- If the notifications.type column has a CHECK constraint, extend it.
-- Guarded so it no-ops when the check isn't present.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'notifications'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%type%';
  if constraint_name is not null then
    execute format('alter table public.notifications drop constraint %I', constraint_name);
  end if;
end $$;

-- Comments for Citizens Central maintainers
comment on view public.directory_contributors is
  'Stable read contract for ecosystem consumers (Citizens Central). Columns are additive-only.';
comment on column public.profiles.contributor_status is
  'Lifecycle: not_applied → pending → approved | rejected. Role flips to contributor ONLY on approval.';
comment on column public.profiles.contributor_slug is
  'Human-friendly URL segment for /c/[slug]. Unique. Auto-generated on approval.';
comment on column public.events.community_contributor is
  'True when event was created by a Citizen under the rate-limited community-event path. Surfaces a "Community Contributor" chip in UI.';
