-- 064_refine_categories_v2.sql
-- ───────────────────────────────────────────────────────────────────────────
-- Batch S1 — Refine event taxonomy to 17 canonical slugs and place taxonomy
-- to 10 canonical slugs. Idempotent. Safe to re-run.
--
-- BEFORE (events): 16 slugs incl. entertainment / sport-fun / social-fun /
-- missional / marriage-and-couples / mens / womens / equip / weekend / care.
-- AFTER  (events): 17 slugs — see mapping below. `weekend` is removed and
-- becomes a derived tag in S3.
--
-- BEFORE (places): 8 slugs (church / relax / exercise / media / shopping /
-- health / education / arts).
-- AFTER  (places): 10 slugs — see mapping below; adds christian-businesses
-- and safe-spaces.
--
-- Steps:
--   1. Drop existing CHECK constraint on events.category.
--   2. UPDATE events.category old → new.
--   3. Update default to 'church-services'.
--   4. Re-add CHECK with the 17 new slugs.
--   5. Insert / upsert 17 event-applies rows + 10 place-applies rows in
--      public.categories (idempotent on slug).
--   6. Remap events.category_id and places.category_id via slug-keyed lookup
--      (old rows still exist at this point so the mapping is unambiguous).
--   7. Delete legacy categories rows.
--   8. Verify counts.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- ──────────────────────────────────────────────────────────────
-- 1. Drop old CHECK on events.category (constraint name fluctuates
--    across earlier migrations, so look it up dynamically).
-- ──────────────────────────────────────────────────────────────
do $$
declare
  con_name text;
begin
  for con_name in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'events'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%category%'
  loop
    execute format('alter table public.events drop constraint %I', con_name);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- 2. Remap event category text values old → new.
-- ──────────────────────────────────────────────────────────────
update public.events
   set category = case category
     when 'entertainment'         then 'arts-culture'
     when 'sport-fun'             then 'sport-recreation'
     when 'social-fun'            then 'social-gatherings'
     when 'community-upliftment'  then 'community-upliftment'
     when 'education'             then 'education-equipping'
     when 'church'                then 'church-services'
     when 'missional'             then 'outreach-missions'
     when 'marriage-and-couples'  then 'marriage-family'
     when 'mens'                  then 'mens-community'
     when 'womens'                then 'womens-community'
     when 'kids'                  then 'kids'
     when 'recovery'              then 'care-recovery'
     when 'equip'                 then 'education-equipping'
     when 'weekend'               then 'conferences-summits'
     when 'members-only'          then 'members-only'
     when 'care'                  then 'care-recovery'
     -- fallback — leave unknown values alone; the CHECK below will fail loudly
     else category
   end
 where category is not null;

-- ──────────────────────────────────────────────────────────────
-- 3. New default for the column.
-- ──────────────────────────────────────────────────────────────
alter table public.events alter column category set default 'church-services';

-- ──────────────────────────────────────────────────────────────
-- 4. Re-add CHECK constraint with the new 17-slug whitelist.
-- ──────────────────────────────────────────────────────────────
alter table public.events
  add constraint events_category_check
  check (category in (
    'worship-prayer',
    'church-services',
    'outreach-missions',
    'markets-expos',
    'sport-recreation',
    'arts-culture',
    'social-gatherings',
    'community-upliftment',
    'education-equipping',
    'marriage-family',
    'mens-community',
    'womens-community',
    'youth-students',
    'kids',
    'care-recovery',
    'members-only',
    'conferences-summits'
  ));

-- ──────────────────────────────────────────────────────────────
-- 5. Upsert the 27 canonical category rows.
--    Event rows use applies_to='events'; place rows use 'places'.
-- ──────────────────────────────────────────────────────────────
insert into public.categories (slug, name, emoji, color, applies_to, sort_order) values
  -- events (sort 1..17)
  ('worship-prayer',       'Worship & Prayer',     '🙏',  '#B8860B', 'events',  1),
  ('church-services',      'Church Services',      '⛪',  '#D4AF37', 'events',  2),
  ('outreach-missions',    'Outreach & Missions',  '🌍',  '#1ABC9C', 'events',  3),
  ('markets-expos',        'Markets & Expos',      '🛍️', '#F39C12', 'events',  4),
  ('sport-recreation',     'Sport & Recreation',   '⚽',  '#2ECC71', 'events',  5),
  ('arts-culture',         'Arts & Culture',       '🎭',  '#FF6B35', 'events',  6),
  ('social-gatherings',    'Social Gatherings',    '☕',  '#E91E63', 'events',  7),
  ('community-upliftment', 'Community Upliftment', '🤝',  '#9B59B6', 'events',  8),
  ('education-equipping',  'Education & Equipping','📚',  '#3498DB', 'events',  9),
  ('marriage-family',      'Marriage & Family',    '💍',  '#E74C3C', 'events', 10),
  ('mens-community',       'Men''s Community',     '👔',  '#34495E', 'events', 11),
  ('womens-community',     'Women''s Community',   '👗',  '#C71585', 'events', 12),
  ('youth-students',       'Youth & Students',     '🔥',  '#FF8C42', 'events', 13),
  ('kids',                 'Kids',                 '🧒',  '#00BCD4', 'events', 14),
  ('care-recovery',        'Care & Recovery',      '💗',  '#8E44AD', 'events', 15),
  ('members-only',         'Members Only',         '🔒',  '#212121', 'events', 16),
  ('conferences-summits',  'Conferences & Summits','🎤',  '#5D6D7E', 'events', 17),
  -- places (sort 101..110 to keep grouped)
  ('churches-ministries',  'Churches & Ministries','⛪',  '#D4AF37', 'places', 101),
  ('hospitality-cafes',    'Hospitality & Cafés',  '☕',  '#8B4513', 'places', 102),
  ('recreation-sport',     'Recreation & Sport',   '🏃',  '#2ECC71', 'places', 103),
  ('media-broadcasting',   'Media & Broadcasting', '📻',  '#9B59B6', 'places', 104),
  ('retail-shopping',      'Retail & Shopping',    '🛍️', '#E91E63', 'places', 105),
  ('health-wellness',      'Health & Wellness',    '🩺',  '#E74C3C', 'places', 106),
  ('education-training',   'Education & Training', '📚',  '#3498DB', 'places', 107),
  ('arts-creative',        'Arts & Creative',      '🎨',  '#FF6B35', 'places', 108),
  ('christian-businesses', 'Christian Businesses', '🏢',  '#A67C00', 'places', 109),
  ('safe-spaces',          'Safe Spaces',          '🕊️', '#B59CD9', 'places', 110)
on conflict (slug) do update
  set name       = excluded.name,
      emoji      = excluded.emoji,
      color      = excluded.color,
      applies_to = excluded.applies_to,
      sort_order = excluded.sort_order;

-- ──────────────────────────────────────────────────────────────
-- 6. Remap events.category_id and places.category_id via the
--    OLD slug → NEW slug mapping (old categories rows still exist).
-- ──────────────────────────────────────────────────────────────
with mapping(old_slug, new_slug) as (values
  -- events
  ('entertainment',         'arts-culture'),
  ('sport-fun',             'sport-recreation'),
  ('social-fun',            'social-gatherings'),
  ('education',             'education-equipping'),
  ('church',                'church-services'),
  ('missional',             'outreach-missions'),
  ('marriage-and-couples',  'marriage-family'),
  ('mens',                  'mens-community'),
  ('womens',                'womens-community'),
  ('recovery',              'care-recovery'),
  ('equip',                 'education-equipping'),
  ('weekend',               'conferences-summits'),
  ('care',                  'care-recovery'),
  -- places
  ('relax',                 'hospitality-cafes'),
  ('exercise',              'recreation-sport'),
  ('media',                 'media-broadcasting'),
  ('shopping',              'retail-shopping'),
  ('health',                'health-wellness'),
  ('arts',                  'arts-creative')
)
update public.events e
   set category_id = new_cat.id
  from mapping m
  join public.categories old_cat on old_cat.slug = m.old_slug
  join public.categories new_cat on new_cat.slug = m.new_slug
 where e.category_id = old_cat.id;

with mapping(old_slug, new_slug) as (values
  ('church',    'churches-ministries'),
  ('relax',     'hospitality-cafes'),
  ('exercise',  'recreation-sport'),
  ('media',     'media-broadcasting'),
  ('shopping',  'retail-shopping'),
  ('health',    'health-wellness'),
  ('education', 'education-training'),
  ('arts',      'arts-creative')
)
update public.places p
   set category_id = new_cat.id
  from mapping m
  join public.categories old_cat on old_cat.slug = m.old_slug
  join public.categories new_cat on new_cat.slug = m.new_slug
 where p.category_id = old_cat.id;

-- ──────────────────────────────────────────────────────────────
-- 7. Delete legacy category rows now that nothing references them.
-- ──────────────────────────────────────────────────────────────
delete from public.categories
 where slug not in (
   'worship-prayer','church-services','outreach-missions','markets-expos',
   'sport-recreation','arts-culture','social-gatherings','community-upliftment',
   'education-equipping','marriage-family','mens-community','womens-community',
   'youth-students','kids','care-recovery','members-only','conferences-summits',
   'churches-ministries','hospitality-cafes','recreation-sport','media-broadcasting',
   'retail-shopping','health-wellness','education-training','arts-creative',
   'christian-businesses','safe-spaces'
 );

-- ──────────────────────────────────────────────────────────────
-- 8. Sanity checks.
-- ──────────────────────────────────────────────────────────────
do $$
declare
  ev_count int;
  pl_count int;
  bad_events int;
begin
  select count(*) into ev_count from public.categories where applies_to = 'events';
  select count(*) into pl_count from public.categories where applies_to = 'places';
  if ev_count <> 17 then
    raise exception 'Expected 17 event categories, got %', ev_count;
  end if;
  if pl_count <> 10 then
    raise exception 'Expected 10 place categories, got %', pl_count;
  end if;
  select count(*) into bad_events
    from public.events
   where category is not null
     and category not in (
       'worship-prayer','church-services','outreach-missions','markets-expos',
       'sport-recreation','arts-culture','social-gatherings','community-upliftment',
       'education-equipping','marriage-family','mens-community','womens-community',
       'youth-students','kids','care-recovery','members-only','conferences-summits'
     );
  if bad_events > 0 then
    raise exception '% event(s) have a category outside the new whitelist', bad_events;
  end if;
end $$;

commit;
