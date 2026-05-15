-- MASTER_DIRECTION Batch 6 — Part 7: Unified Profile Schema
-- ════════════════════════════════════════════════════════════
-- Forward-looking columns that prepare `profiles` for the wider
-- Citizens ecosystem (Wear, Learn) without forcing Connect users
-- to interact with them. All columns are nullable; population is
-- driven by the respective app when the user opts in.
--
-- This is architecture work — no Connect UI surfaces these columns
-- yet. They exist so that when Citizens Wear / Learn boot inside the
-- monorepo, a shared `profiles` row already carries their fields.
--
-- See: .github/MASTER_DIRECTION.md Part 7 "Unified Profile Schema".

-- 1. Wear — wardrobe style preferences (free-form jsonb bag)
alter table public.profiles
  add column if not exists wear_style_preferences jsonb not null default '{}'::jsonb;

-- 2. Wear — wardrobe visibility (default private so opt-in is explicit)
alter table public.profiles
  add column if not exists wear_wardrobe_visibility text
    not null default 'private'
    check (wear_wardrobe_visibility in ('public', 'private', 'friends'));

-- 3. Learn — array of enrolled listing UUIDs (no FK; cross-app data,
--    listings live in a different schema/app once Learn ships)
alter table public.profiles
  add column if not exists learn_enrolled_listings uuid[] not null default '{}'::uuid[];

-- 4. Connect — home province text (free-form for now; can become an
--    enum once we settle a SA province taxonomy)
alter table public.profiles
  add column if not exists connect_home_province text;

-- 5. Connect — notification radius in km. Connect already ships
--    `notification_radius_km` (default 50) which serves this purpose.
--    Add a thin alias column only if a future Connect setting needs to
--    diverge. For now we keep the existing column as the source of
--    truth and add NOTHING — documented here to prevent future drift.
--    (Intentional no-op; see DECISIONS.md.)

comment on column public.profiles.wear_style_preferences is
  'Citizens Wear — free-form style preference bag (sizes, palettes, brands).';
comment on column public.profiles.wear_wardrobe_visibility is
  'Citizens Wear — who can see this user wardrobe. Defaults to private.';
comment on column public.profiles.learn_enrolled_listings is
  'Citizens Learn — array of listing UUIDs the user has enrolled in.';
comment on column public.profiles.connect_home_province is
  'Citizens Connect — user-declared home province (free-form).';
