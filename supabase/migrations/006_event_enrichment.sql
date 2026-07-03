-- ============================================
-- Phase 7A: Event Enrichment, Lifecycle & Discovery
-- New columns on events, event_photos, event_views tables
-- ============================================

-- 1. New columns on events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_time timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS max_attendees int;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attendees_visible text NOT NULL DEFAULT 'authenticated';

-- Add CHECK constraints (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check'
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_status_check
      CHECK (status IN ('draft', 'published', 'cancelled'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_attendees_visible_check'
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_attendees_visible_check
      CHECK (attendees_visible IN ('public', 'authenticated', 'count_only'));
  END IF;
END $$;

-- 2. Event Photos table
CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Event photos are viewable by everyone' AND tablename = 'event_photos') THEN
    CREATE POLICY "Event photos are viewable by everyone" ON public.event_photos FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload event photos' AND tablename = 'event_photos') THEN
    CREATE POLICY "Authenticated users can upload event photos" ON public.event_photos FOR INSERT WITH CHECK (auth.uid() = uploaded_by);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Photo uploader or admin can delete photos' AND tablename = 'event_photos') THEN
    CREATE POLICY "Photo uploader or admin can delete photos" ON public.event_photos FOR DELETE USING (
      auth.uid() = uploaded_by OR public.is_admin()
    );
  END IF;
END $$;

-- 3. Event Views table (analytics)
CREATE TABLE IF NOT EXISTS public.event_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  view_date date NOT NULL DEFAULT CURRENT_DATE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

-- Unique: one view per authenticated user per day per event
CREATE UNIQUE INDEX IF NOT EXISTS event_views_user_day_idx
  ON public.event_views (event_id, user_id, view_date)
  WHERE user_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can record a view' AND tablename = 'event_views') THEN
    CREATE POLICY "Anyone can record a view" ON public.event_views FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Event creator and admin can see views' AND tablename = 'event_views') THEN
    CREATE POLICY "Event creator and admin can see views" ON public.event_views FOR SELECT USING (
      public.is_admin() OR EXISTS (
        SELECT 1 FROM public.events WHERE events.id = event_views.event_id AND events.created_by = auth.uid()
      )
    );
  END IF;
END $$;

-- 4. Update events RLS to hide drafts from non-creators
-- Drop and recreate the SELECT policy for events
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Events are viewable by everyone' AND tablename = 'events') THEN
    DROP POLICY "Events are viewable by everyone" ON public.events;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Published events visible to all, drafts to creator only' AND tablename = 'events') THEN
    CREATE POLICY "Published events visible to all, drafts to creator only" ON public.events FOR SELECT USING (
      status = 'published'
      OR status = 'cancelled'
      OR created_by = auth.uid()
      OR public.is_admin()
    );
  END IF;
END $$;
