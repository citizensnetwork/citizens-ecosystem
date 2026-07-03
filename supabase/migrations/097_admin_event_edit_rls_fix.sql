-- 097: Fix admin event-edit RLS gaps.
--
-- Three issues found:
--
-- 1) events UPDATE/DELETE — The live DB still had old "Vendors can update/delete
--    own events" policies (no admin bypass). schema.sql had the correct
--    "Owners or admins can ..." variants but they were never applied because
--    the idempotent check used the NEW name while the OLD policy was already there.
--    Fix: drop the old policies and recreate with admin bypass.
--
-- 2) event-images storage INSERT/UPDATE — Migration 096 restored these policies
--    but omitted the `OR is_admin()` bypass (unlike place-images which has it).
--    An admin editing another contributor's event uploads to their own UID
--    folder so foldername[1]=auth.uid() passes for the folder check, BUT upsert
--    can also trigger the UPDATE policy path; adding is_admin() closes the gap
--    and aligns with place-images.

-- ─────────────────────────────────────────────────────────────────
-- 1) events table: replace stale owner-only UPDATE policy
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Vendors can update own events" ON public.events;
DROP POLICY IF EXISTS "Owners or admins can update events"  ON public.events;

CREATE POLICY "Owners or admins can update events" ON public.events
  FOR UPDATE
  USING  (auth.uid() = created_by OR public.is_admin())
  WITH CHECK (auth.uid() = created_by OR public.is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 2) events table: replace stale owner-only DELETE policy
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Vendors can delete own events" ON public.events;
DROP POLICY IF EXISTS "Owners or admins can delete events"  ON public.events;

CREATE POLICY "Owners or admins can delete events" ON public.events
  FOR DELETE
  USING  (auth.uid() = created_by OR public.is_admin());

-- ─────────────────────────────────────────────────────────────────
-- 3) event-images storage: add is_admin() bypass to INSERT / UPDATE
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Event images upload own" ON storage.objects;
CREATE POLICY "Event images upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Event images update own" ON storage.objects;
CREATE POLICY "Event images update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'event-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );
