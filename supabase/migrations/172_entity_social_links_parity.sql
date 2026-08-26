-- 172: Social-link PARITY across the three entity types (Contributor / Place / Event)
--
-- Why this exists
-- ---------------
-- The frontend has collected social handles on the "create Place" form since
-- v1, but `public.places` had NO social columns at all — every handle typed
-- into that form was silently discarded on insert/update. Events carried four
-- (098) and profiles carried four (021/036), so the same listing surfaced a
-- different set of channels depending on which of the three it happened to be.
--
-- This migration makes the set identical everywhere, and widens it to the
-- seven platforms South African ministries, businesses and non-profits
-- actually use. Every column is additive, nullable text — no backfill, no
-- rewrite, safe to re-run.
--
-- Column-naming note: each table keeps ITS OWN existing convention rather
-- than inventing a third one.
--   · events / places  → every social column is `<platform>_url`  (098)
--   · profiles         → handle-style platforms are `<platform>_handle`,
--                        link-style platforms are `<platform>_url`  (021/036)
-- The client tolerates a bare handle OR a full URL for every platform
-- (window.DATA.SOCIAL_PLATFORMS.urlFor), so the column name describes the
-- usual shape, not a constraint on the value.

-- ── Places: the four they never had, plus the three new ones ──────────
alter table public.places
  add column if not exists instagram_url text,
  add column if not exists facebook_url  text,
  add column if not exists tiktok_url    text,
  add column if not exists youtube_url   text,
  add column if not exists x_url         text,
  add column if not exists linkedin_url  text,
  add column if not exists whatsapp_url  text;

-- ── Events: the three new ones (098 already added the first four) ─────
alter table public.events
  add column if not exists x_url        text,
  add column if not exists linkedin_url text,
  add column if not exists whatsapp_url text;

-- ── Profiles (Contributors): the three new ones ───────────────────────
alter table public.profiles
  add column if not exists x_handle        text,
  add column if not exists linkedin_url    text,
  add column if not exists whatsapp_number text;

-- ── Length guards on the NEW columns ──────────────────────────────────
-- Unbounded user-supplied text is a storage/abuse surface. The API routes
-- already cap these, so this is defence in depth. Only the columns this
-- migration introduces are constrained — retro-fitting checks onto the
-- pre-existing social columns is deliberately left alone (it would need a
-- validating scan of live rows and is not what this change is about).
do $$
declare
  t record;
  c text;
begin
  for t in
    select 'places'::text as tbl, unnest(array[
      'instagram_url','facebook_url','tiktok_url','youtube_url',
      'x_url','linkedin_url','whatsapp_url']) as col
    union all
    select 'events', unnest(array['x_url','linkedin_url','whatsapp_url'])
    union all
    select 'profiles', unnest(array['x_handle','linkedin_url','whatsapp_number'])
  loop
    c := t.tbl || '_' || t.col || '_length_chk';
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || t.tbl)::regclass and conname = c
    ) then
      execute format(
        'alter table public.%I add constraint %I check (%I is null or char_length(%I) <= 500)',
        t.tbl, c, t.col, t.col);
    end if;
  end loop;
end $$;

comment on column public.places.instagram_url is 'Instagram page URL or handle (e.g. https://instagram.com/handle or @handle)';
comment on column public.places.facebook_url  is 'Facebook page URL or handle';
comment on column public.places.tiktok_url    is 'TikTok profile URL or @handle';
comment on column public.places.youtube_url   is 'YouTube channel URL or handle';
comment on column public.places.x_url         is 'X (formerly Twitter) profile URL or @handle';
comment on column public.places.linkedin_url  is 'LinkedIn company/person page URL';
comment on column public.places.whatsapp_url  is 'WhatsApp contact — wa.me link, invite link, or phone number';

comment on column public.events.x_url        is 'X (formerly Twitter) profile URL or @handle';
comment on column public.events.linkedin_url is 'LinkedIn company/person page URL';
comment on column public.events.whatsapp_url is 'WhatsApp contact — wa.me link, invite link, or phone number';

comment on column public.profiles.x_handle        is 'X (formerly Twitter) @handle or profile URL';
comment on column public.profiles.linkedin_url    is 'LinkedIn company/person page URL';
comment on column public.profiles.whatsapp_number is 'WhatsApp contact — phone number, wa.me link or invite link';
