---
name: storage-uploads-must-be-server-side
description: Why image/media uploads must go through a server route, not the browser Supabase client
metadata:
  type: project
---

In Citizens Connect, the browser Supabase client (`@supabase/ssr` `createBrowserClient`,
`src/lib/supabase/client.ts`) has an **unreliable JWT at the Storage endpoint** — uploads can
arrive as `anon`, tripping bucket RLS with "new row violates row-level security policy". PostgREST
(DB) writes from the same client work fine; it is specifically the Storage path that fails.

**Rule:** all binary uploads go through a server route that authenticates via the cookie session and
writes with the service-role admin client (`createAdminClient`). Two such routes:
- `POST /api/avatar` — profile photos (pre-existing).
- `POST /api/media/upload` — event/place **covers + galleries** (added 2026-05-31), via client
  helper `src/lib/uploadMedia.ts` (`uploadMediaFile`). Scope enum picks bucket; path is always
  server-built and `${user.id}`-prefixed so callers can't escape their folder despite admin bypass.

Do NOT reintroduce client-side `supabase.storage.from(...).upload(...)` in forms — that was the
exact cause of the long-standing upload failures. Metadata rows (event_photos/place_media) still
insert client-side under the user's RLS session (entity ownership enforced there). See
[[map-navigation-two-surfaces]].
