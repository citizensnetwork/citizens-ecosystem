---
name: storage-uploads-must-be-server-side
description: Why media uploads are authorised server-side (signed upload URLs), never a raw browser Storage upload
metadata:
  type: project
---

In Citizens Connect, the browser Supabase client (`@supabase/ssr` `createBrowserClient`,
`src/lib/supabase/client.ts`) has an **unreliable JWT at the Storage endpoint** — raw uploads can
arrive as `anon`, tripping bucket RLS with "new row violates row-level security policy". PostgREST
(DB) writes from the same client work fine; it is specifically the Storage path that fails.

**Rule:** never call `supabase.storage.from(...).upload(...)` directly from a form. Upload
authorisation is always minted server-side.

- `POST /api/avatar` — profile photos. Proxies the bytes through the server (admin client).
- `POST /api/media/upload` — event/place **covers + galleries**. As of 2026-06-01 this is a
  **signed-upload-URL** endpoint, NOT a byte proxy: it takes JSON metadata
  `{scope, entityId?, filename, contentType, size}`, validates + builds a server-controlled
  `${user.id}`-scoped path, and returns `{bucket, path, token, publicUrl, kind}` from
  `admin.storage.createSignedUploadUrl`. The browser then uploads bytes DIRECTLY to Storage via
  `uploadToSignedUrl` (client helper `src/lib/uploadMedia.ts` `uploadMediaFile`, same
  `{url,kind}|{error}` return type as before). The token authorises the upload independent of the
  unreliable JWT, so it still works — but bytes travel one hop (browser→Storage) instead of two.
  Faster, esp. for video and users far from eu-central-1.

Because the server no longer sees the bytes, **bucket-level limits are the real guard**: migration
`121_storage_bucket_limits.sql` sets `event-images`/`place-images` `allowed_mime_types` (blocks
`image/svg+xml` stored-XSS) + `file_size_limit` 100 MB. The route's sign-time `validateMediaMeta`
is the early friendly check + the cover-scope video block.

Metadata rows (event_photos/place_media) still insert client-side under the user's RLS session
(entity ownership enforced there). NB: `event_photos.kind/thumbnail_url/title` come from migration
`029_event_media.sql`, which had been missing from prod until 2026-06-01 — re-check it's applied if
the "Could not find the 'kind' column" error returns. See [[map-navigation-two-surfaces]].
