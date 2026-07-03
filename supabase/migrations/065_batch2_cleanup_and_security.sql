-- 065_batch2_cleanup_and_security.sql
-- Batch 2: cleanup + security advisor fixes.
--
-- 1. Drop the legacy `featured_listings` table — paid promotion was removed
--    from the MASTER_DIRECTION simplification pass (kingdom-equity: every
--    contributor is surfaced equally, no "boosted" tier).
-- 2. Fix BUG-06 security advisor warnings:
--     a) `public.directory_contributors` previously used SECURITY DEFINER
--        semantics (the default for views, which run as the view owner).
--        That bypassed RLS on `profiles` and let anon read columns the
--        caller might otherwise be denied. Recreate with
--        `security_invoker = on` so the caller's RLS applies. The existing
--        "Profiles are viewable by everyone" policy still grants anon
--        SELECT on the underlying rows, so consumers (Citizens Central +
--        anon directory listing) keep working — but column-level future
--        policies will now be respected.
--     b) `public.app_settings` had RLS disabled. Enable RLS and add
--        admin-only policies. The trigger functions that read this table
--        (`events_enforce_community_rate_limit`, defined in 037) are
--        SECURITY DEFINER, so they bypass RLS automatically and continue
--        to function for citizens creating community events.
--
--        ⚠ INVARIANT: This bypass works because migrations and trigger
--        functions are owned by the `postgres` role on Supabase, which has
--        the `BYPASSRLS` attribute. SECURITY DEFINER *alone* does not
--        bypass RLS in Postgres. If anyone re-owns
--        `events_enforce_community_rate_limit` (or
--        `community_event_rate_limit_check`) to a non-BYPASSRLS role,
--        citizen community-event creation will fail because the trigger
--        will be unable to read `public.app_settings`. Keep these
--        functions owned by `postgres`.

begin;

-- ── 1. Drop legacy featured_listings ────────────────────────────────
drop table if exists public.featured_listings cascade;

-- ── 2a. Recreate directory_contributors with security_invoker ───────
drop view if exists public.directory_contributors cascade;

create view public.directory_contributors
with (security_invoker = on)
as
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

grant select on public.directory_contributors to anon, authenticated;

comment on view public.directory_contributors is
  'Stable read contract for Citizens Central. SECURITY INVOKER so the '
  'caller''s RLS on profiles applies. Columns are additive — never break.';

-- ── 2b. Enable RLS + admin policies on app_settings ────────────────
alter table public.app_settings enable row level security;

drop policy if exists "Admins read app_settings" on public.app_settings;
create policy "Admins read app_settings"
  on public.app_settings
  for select
  using (public.is_admin());

drop policy if exists "Admins write app_settings" on public.app_settings;
create policy "Admins write app_settings"
  on public.app_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.app_settings is
  'System-wide tuning knobs (e.g. community_event_rate_limit). RLS '
  'restricts direct reads/writes to admins; SECURITY DEFINER trigger '
  'functions (037_community_event_rate_limit) bypass RLS to read.';

commit;
