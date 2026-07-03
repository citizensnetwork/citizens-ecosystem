-- 052_categories_consolidation.sql
-- ───────────────────────────────────────────────────────────────────────────
-- Consolidates the public.categories table to match the 16 EventCategory
-- slugs known to the application (src/types/db.ts + src/lib/categories.ts).
--
-- BEFORE: 23 rows including stale duplicates `church-service`, `church`,
-- `social`, `social-fun`, plus legacy `youth`, `community-outreach`,
-- `worship`, `bible-study`, `prayer`, `other` that no event references.
-- AFTER:  16 coherent rows, distinct colours matching CATEGORY_HEX, gap-free
-- sort_order 1..16, distinct emoji per slug.
--
-- Idempotent. Safe to re-run.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Verify no event or place references a slug we are about to delete.
do $$
declare
  bad_count int;
begin
  select count(*) into bad_count
  from public.events
  where category in (
    'church-service','youth','community-outreach','worship',
    'bible-study','prayer','social','other'
  );
  -- Note: `worship` is NOT in the EventCategory union; we drop it too.
  -- Existing events using these slugs would block the consolidation.
  if bad_count > 0 then
    raise exception
      'Cannot consolidate: % event(s) still reference legacy slugs.',
      bad_count;
  end if;
end $$;

-- 2. Drop the legacy rows. category_id FK on events/places uses ON DELETE SET NULL
--    in schema.sql; even if it didn't, no rows reference these IDs.
delete from public.categories
where slug in (
  'church-service','youth','community-outreach','worship',
  'bible-study','prayer','social','other'
);

-- 3. Upsert the canonical 16. Each gets a distinct colour + emoji + sort_order.
--    Colours mirror src/lib/categories.ts CATEGORY_HEX so map markers, badges,
--    and calendar all agree visually.
insert into public.categories (slug, name, emoji, color, applies_to, sort_order) values
  ('church',                'Church',              '⛪',  '#D4AF37', 'both',   1),
  ('community-upliftment',  'Community Upliftment','🤝', '#9B59B6', 'events', 2),
  ('missional',             'Missional',           '🌍', '#1ABC9C', 'events', 3),
  ('social-fun',            'Social',              '☕', '#E91E63', 'events', 4),
  ('entertainment',         'Entertainment',       '🎭', '#FF6B35', 'events', 5),
  ('sport-fun',             'Sport',               '⚽', '#2ECC71', 'events', 6),
  ('education',             'Education',           '📚', '#3498DB', 'events', 7),
  ('equip',                 'Equip',               '🛠️', '#27AE60', 'events', 8),
  ('care',                  'Care',                '💗', '#B59CD9', 'events', 9),
  ('recovery',              'Recovery',            '🕊️', '#8E44AD', 'events', 10),
  ('marriage-and-couples',  'Marriage & Couples',  '💍', '#E74C3C', 'events', 11),
  ('mens',                  'Mens',                '👔', '#34495E', 'events', 12),
  ('womens',                'Womens',              '👗', '#F39C12', 'events', 13),
  ('kids',                  'Kids',                '🧒', '#00BCD4', 'events', 14),
  ('weekend',               'Weekend',             '☀️', '#FF9800', 'events', 15),
  ('members-only',          'Members Only',        '🔒', '#212121', 'events', 16)
on conflict (slug) do update
  set name       = excluded.name,
      emoji      = excluded.emoji,
      color      = excluded.color,
      applies_to = excluded.applies_to,
      sort_order = excluded.sort_order;

-- 4. Sanity check: exactly 16 rows after consolidation, matching the
--    EventCategory union in src/types/db.ts.
do $$
declare
  total int;
begin
  select count(*) into total from public.categories;
  if total <> 16 then
    raise exception 'Unexpected category count after consolidation: %', total;
  end if;
end $$;
