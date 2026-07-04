-- 096: Two fixes:
--   A) Separate system-generated event_updates from organiser broadcasts.
--      Migration 050 has a trigger that auto-inserts into event_updates when
--      an organiser saves changes to date/end_time/location/coordinates.
--      Those rows were surfacing in the "From the Organiser" broadcast feed,
--      making every event edit look like a broadcast message. We add an
--      `is_system` flag so the API can filter them out of the broadcast feed
--      (they still drive push notifications via the webhook path).
--   B) Restore event-images storage RLS policies that were lost. Migration
--      031 created them but they are absent from the live DB, causing all
--      cover-photo and gallery uploads to fail with an RLS violation.

-- ── A) event_updates.is_system ───────────────────────────────────────────────

ALTER TABLE public.event_updates
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Re-create the trigger function to mark auto-generated rows as system.
CREATE OR REPLACE FUNCTION public.notify_event_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[] := array[]::text[];
  msg   text;
BEGIN
  -- Only care about published events. Status-change cancellations are
  -- handled by notify-event-cancelled.
  IF COALESCE(NEW.status, '') <> 'published' THEN
    RETURN NEW;
  END IF;

  IF NEW.date IS DISTINCT FROM OLD.date THEN
    parts := array_append(parts, 'date');
  END IF;
  IF NEW.end_time IS DISTINCT FROM OLD.end_time THEN
    parts := array_append(parts, 'end time');
  END IF;
  IF NEW.location IS DISTINCT FROM OLD.location THEN
    parts := array_append(parts, 'venue');
  END IF;
  IF NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    IF NOT ('venue' = ANY(parts)) THEN
      parts := array_append(parts, 'location');
    END IF;
  END IF;

  IF array_length(parts, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  msg := 'Organiser updated the ' || array_to_string(parts, ', ') || '.';

  -- is_system = TRUE so these rows are filtered out of the public broadcast
  -- feed while still triggering the notify-event-update Edge Function webhook.
  INSERT INTO public.event_updates (event_id, author_id, body, is_system)
  VALUES (NEW.id, NEW.created_by, msg, TRUE);

  RETURN NEW;
END;
$$;

-- ── B) Restore event-images storage RLS policies ─────────────────────────────

-- Upload: any authenticated user can upload into their own uid-prefixed folder.
DROP POLICY IF EXISTS "Event images upload own"  ON storage.objects;
CREATE POLICY "Event images upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update / upsert (used by upload with upsert:true).
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

-- Delete: owners or admins may delete event images.
DROP POLICY IF EXISTS "Event images delete own" ON storage.objects;
CREATE POLICY "Event images delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );
