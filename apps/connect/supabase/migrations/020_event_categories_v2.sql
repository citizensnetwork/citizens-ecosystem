-- Migration 020: Update event categories from 8 to 15 new categories
-- Maps old slugs to the closest new categories

BEGIN;

-- Step 1: Map existing events to new categories
UPDATE events SET category = 'church' WHERE category = 'church-service';
UPDATE events SET category = 'church' WHERE category = 'worship';
UPDATE events SET category = 'education' WHERE category = 'bible-study';
UPDATE events SET category = 'church' WHERE category = 'prayer';
UPDATE events SET category = 'community-upliftment' WHERE category = 'community-outreach';
UPDATE events SET category = 'kids' WHERE category = 'youth';
UPDATE events SET category = 'social-fun' WHERE category = 'social';
UPDATE events SET category = 'church' WHERE category = 'other';

-- Step 2: Drop old check constraint if it exists
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_category_check;

-- Step 3: Add new check constraint with all 15 categories
ALTER TABLE events ADD CONSTRAINT events_category_check CHECK (
  category IS NULL OR category IN (
    'entertainment',
    'sport-fun',
    'social-fun',
    'community-upliftment',
    'education',
    'church',
    'missional',
    'marriage-and-couples',
    'mens',
    'womens',
    'kids',
    'recovery',
    'equip',
    'weekend',
    'members-only'
  )
);

COMMIT;
