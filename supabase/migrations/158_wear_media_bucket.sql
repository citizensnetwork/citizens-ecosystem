-- ============================================================================
-- 158_wear_media_bucket.sql — Citizens Wear media-upload pipeline (storage)
-- ============================================================================
-- Wear posts / stories / brand logos / concept artwork have been URL-only since
-- Phase 3 (RESUME §3L/§3R debt). This migration adds the ONE piece of durable
-- state the signed-upload pipeline needs: a Storage bucket + its RLS. Every media
-- COLUMN already exists as plain `text` (wear.brands.logo_url, wear.post_media.url,
-- wear.stories.media_url, wear.concept_media.url, wear.concept_proposals.mockup_urls[])
-- — an upload just yields a public URL that flows into those same columns, so the
-- existing "paste a URL" path stays as a fallback and NO data table changes here.
--
-- Mirrors Connect's signed-upload pattern (src/app/api/media/upload/route.ts +
-- mig-122 bucket limits): bytes travel browser → Storage directly via a short-lived
-- signed upload URL, so the API server never sees them. The signed URL is minted by
-- the Wear API authenticated AS THE USER (no service_role in Wear — SHARED_DB_CONTRACT
-- R3: RLS is the only isolation wall), and `createSignedUploadUrl` requires only the
-- objects INSERT policy below to pass for that user's own folder.
--
-- Backstops (the server can't size/MIME-check bytes it never sees):
--   * file_size_limit    — 15 MB hard cap (images only; Wear ships no video today).
--   * allowed_mime_types — allow-list; blocks image/svg+xml (stored-XSS on a public
--                          bucket origin) and every non-image type.
-- Path scoping is enforced twice: the API builds `{auth.uid()}/…` server-side, AND
-- the INSERT/UPDATE/DELETE policies pin the first folder segment to `auth.uid()`.
-- Public reads are served by the bucket's `public` flag (no SELECT policy needed —
-- same as Connect's place-images), so object URLs render without auth.

-- ── Bucket (idempotent) ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wear-media',
  'wear-media',
  true,
  15728640,  -- 15 MB
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Object policies — owner-scoped by first folder segment = auth.uid() ──────
-- INSERT: a user may only sign/write into their own `{uid}/…` folder. This is the
-- policy createSignedUploadUrl checks at sign time, so it is what makes the
-- user-authed (non-service_role) mint safe.
drop policy if exists "Wear media upload own" on storage.objects;
create policy "Wear media upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wear-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE own: allows re-upload / upsert into the same path (owner only).
drop policy if exists "Wear media update own" on storage.objects;
create policy "Wear media update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wear-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wear-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE own: owner may prune their own uploads.
drop policy if exists "Wear media delete own" on storage.objects;
create policy "Wear media delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wear-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
