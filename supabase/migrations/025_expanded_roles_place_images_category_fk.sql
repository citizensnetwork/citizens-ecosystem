-- Migration 025: Expanded roles, place-images bucket, category_id FK
-- 1. Expand profile roles: individual, ministry, organization, business (keeping vendor/client/admin for backward compat)
-- 2. Create place-images storage bucket
-- 3. Add category_id FK to events, backfill from text category column

-- ══════════════════════════════════════════════
-- 1. Expanded roles
-- ══════════════════════════════════════════════
-- Drop the old check constraint and add expanded one
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('individual', 'ministry', 'organization', 'business', 'vendor', 'client', 'admin'));

-- Migrate existing data: client → individual, vendor → individual (all users can create events now)
UPDATE public.profiles SET role = 'individual' WHERE role = 'client';
UPDATE public.profiles SET role = 'individual' WHERE role = 'vendor';

-- Update the default for new signups
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'individual';

-- ══════════════════════════════════════════════
-- 2. Place-images storage bucket
-- ══════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('place-images', 'place-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Place images upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'place-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: public read
CREATE POLICY "Place images public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'place-images');

-- RLS: owner or admin can delete
CREATE POLICY "Place images delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'place-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ══════════════════════════════════════════════
-- 3. Events category_id FK
-- ══════════════════════════════════════════════
-- Add nullable FK column
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id);

-- Create index for FK lookups
CREATE INDEX IF NOT EXISTS events_category_id_idx ON public.events(category_id);

-- Backfill: match text category → categories.slug
UPDATE public.events e
SET category_id = c.id
FROM public.categories c
WHERE e.category = c.slug
  AND e.category_id IS NULL;

-- The text `category` column is kept for backward compatibility.
-- It can be dropped in a future migration once all reads use category_id + join.

-- ══════════════════════════════════════════════
-- 4. Update auth trigger — prevent admin self-assignment
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  signup_role text;
BEGIN
  signup_role := coalesce(new.raw_user_meta_data->>'role', 'individual');
  -- Only allow self-assignable roles; admin requires manual DB update
  IF signup_role NOT IN ('individual', 'ministry', 'organization', 'business') THEN
    signup_role := 'individual';
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    signup_role
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════
-- 5. Upsert 15 event categories into categories table
-- ══════════════════════════════════════════════
INSERT INTO public.categories (slug, name, emoji, color, applies_to, sort_order)
VALUES
  ('entertainment', 'Entertainment', '🎭', '#FF6B35', 'events', 1),
  ('sport-fun', 'Sport Fun', '⚽', '#2ECC71', 'events', 2),
  ('social-fun', 'Social Fun', '🎉', '#E91E63', 'events', 3),
  ('community-upliftment', 'Community Upliftment', '🤝', '#9B59B6', 'events', 4),
  ('education', 'Education', '📚', '#3498DB', 'events', 5),
  ('church', 'Church', '⛪', '#D4AF37', 'events', 6),
  ('missional', 'Missional', '🌍', '#1ABC9C', 'events', 7),
  ('marriage-and-couples', 'Marriage & Couples', '💑', '#E74C3C', 'events', 8),
  ('mens', 'Mens', '👔', '#34495E', 'events', 9),
  ('womens', 'Womens', '👗', '#F39C12', 'events', 10),
  ('kids', 'Kids', '🧒', '#00BCD4', 'events', 11),
  ('recovery', 'Recovery', '🕊️', '#8E44AD', 'events', 12),
  ('equip', 'Equip', '🛠️', '#27AE60', 'events', 13),
  ('weekend', 'Weekend', '☀️', '#FF9800', 'events', 14),
  ('members-only', 'Members Only', '🔒', '#212121', 'events', 15)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  color = EXCLUDED.color,
  applies_to = EXCLUDED.applies_to,
  sort_order = EXCLUDED.sort_order;

-- ══════════════════════════════════════════════
-- 6. RLS: Restrict place creation to organiser roles
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_organiser()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('ministry', 'organization', 'business', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Authenticated users can create places" ON public.places;
CREATE POLICY "Organiser roles can create places" ON public.places
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND is_organiser()
  );

-- ══════════════════════════════════════════════
-- 7. Auto-sync category_id from text category
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_event_category_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.category IS NOT NULL AND NEW.category_id IS NULL THEN
    SELECT id INTO NEW.category_id FROM public.categories WHERE slug = NEW.category;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_event_category_id_trigger ON public.events;
CREATE TRIGGER sync_event_category_id_trigger
  BEFORE INSERT OR UPDATE OF category ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_category_id();

-- ══════════════════════════════════════════════
-- 8. Place-images UPDATE policy (missing)
-- ══════════════════════════════════════════════
CREATE POLICY "Place images update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'place-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'place-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ══════════════════════════════════════════════
-- 9. Prevent role self-escalation via profile UPDATE
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.protect_role_column()
RETURNS trigger AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_role_trigger ON public.profiles;
CREATE TRIGGER protect_role_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_column();
