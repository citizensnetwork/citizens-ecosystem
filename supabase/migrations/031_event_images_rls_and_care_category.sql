-- Migration 031: Fix event-images storage RLS + add "care" event category
--
-- 1. Create the `event-images` storage bucket (idempotent) and add the
--    owner-scoped RLS policies that were missing, so that authenticated users
--    can actually upload their event covers and media.
-- 2. Add a new "care" event category (counseling, mental-health help, helps
--    ministries, restorative retreats, etc.) — extend the events.category CHECK
--    constraint and seed the categories table row.

-- ══════════════════════════════════════════════
-- 1. event-images bucket + RLS policies
-- ══════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Public read — bucket is public, anyone can view uploaded event images.
DROP POLICY IF EXISTS "Event images public read" ON storage.objects;
CREATE POLICY "Event images public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'event-images');

-- Authenticated users can upload into their own folder (prefix = auth.uid()).
DROP POLICY IF EXISTS "Event images upload own" ON storage.objects;
CREATE POLICY "Event images upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners can update/overwrite their own files (upsert).
DROP POLICY IF EXISTS "Event images update own" ON storage.objects;
CREATE POLICY "Event images update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners can delete their own files.
DROP POLICY IF EXISTS "Event images delete own" ON storage.objects;
CREATE POLICY "Event images delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ══════════════════════════════════════════════
-- 2. New "care" event category
-- ══════════════════════════════════════════════
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_category_check;
ALTER TABLE public.events ADD CONSTRAINT events_category_check CHECK (
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
    'members-only',
    'care'
  )
);

-- Seed (or upsert) the "care" category row.
INSERT INTO public.categories (slug, name, emoji, color, applies_to, sort_order)
VALUES ('care', 'Care', '💗', '#B59CD9', 'events', 16)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  color = EXCLUDED.color,
  applies_to = EXCLUDED.applies_to,
  sort_order = EXCLUDED.sort_order;
