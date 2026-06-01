# Technical Decisions Log

> **Scope:** Active, codebase-wide rules — patterns that bind code being written today.
>
> **Where things live:**
> - Contributor-dashboard decisions → `docs/plans/contributor-dashboard.md` → "Implementation Decisions Log".
> - Pre-2026-05-26 batch decisions (Tags, Legal, Architecture, UI System, Database, Environment, Phase 10/11/12, Features, CI/CD, UX & Map, MASTER_DIRECTION Batch 14g and earlier) → `docs/archive/DECISIONS_ARCHIVE.md`.
>
> Append new entries at the top of the relevant section. Old entries that no longer bind active code are pruned during quarterly cleanup.

---

## Cross-cutting code rules

### Per-event notification opt-out via column-scoped SECURITY DEFINER RPC
**Decision:** RSVP'd/considering users mute a single event's updates + organiser broadcasts via `rsvps.notify_updates boolean not null default true` (migration 126). The only write path is the SECURITY DEFINER RPC `set_rsvp_notify_updates(p_event_id, p_notify)`, which updates `notify_updates` on the caller's own row (`user_id = auth.uid()`) and nothing else. No broad UPDATE RLS policy is opened on `rsvps`. Fan-out queries in `notify-event-update` and `notify-broadcast` (event branch) exclude rows with `.neq("notify_updates", false)`. Event *cancellations* are unaffected — they fan out from the separate `notify-event-cancelled` function, which intentionally ignores the opt-out (cancellation is always safety-critical).
**Why:** A column-blind UPDATE policy on `rsvps` would also let a user flip `status` (considering↔attending) and bypass the capacity checks enforced by `safe_rsvp`/`toggle_consider`. A column-scoped RPC keeps the mute self-service while preserving those invariants. The resulting `authenticated_security_definer_function_executable` advisory is the same accepted pattern as the ~49 other column-scoped RPCs; switching to SECURITY INVOKER would break it by design.
**Date:** 2026-06-02, notif-matrix Batch 1.

### Scheduled edge-function crons use inline config, not GUCs
**Decision:** Postgres cron jobs that invoke edge functions via `pg_net` (e.g. the weekly `contributor-digest`) embed the function URL and publishable anon key as inline literals in the `cron.schedule` command (migration 125), rather than reading `app.supabase_functions_url` / `app.supabase_anon_key` GUCs. The anon/publishable key is committed inline in the migration.
**Why:** `ALTER DATABASE ... SET` is denied to the Supabase management role on this project, so GUC-based config (the approach in migration 123) always short-circuits and never registers the cron. Inline literals are safe under the RLS-first model — RLS, not key secrecy, enforces access; the anon key only lets the gateway accept the scheduled call, and the function itself runs with its own service-role env key. `pg_net` is installed in `public` because it does not support `SET SCHEMA`; the resulting `extension_in_public` WARN advisory is an accepted, known exception.
**Date:** 2026-06-02, notification-batch-deploy.

### Notification digests and source mutes
**Decision:** Contributor/admin digests are weekly analytics summaries, not 5-times-daily notification batches. Per-source notification mutes are stored on `profiles.muted_source_ids` as `{"type":"event"|"place"|"org","id":"<uuid>"}`. Event broadcasts check event mutes only, so a user can mute a contributor but still receive updates for a specific event they care about. Place broadcasts check both place and org mutes.
**Why:** Citizens should not receive digest noise by default, while contributors/admins need periodic operational insight. Source mutes give followers a low-friction way to reduce contributor noise without losing event-specific safety or commitment updates.
**Date:** 2026-06-01, notification-weekly-digest-and-mutes.

### `.maybeSingle()` for all read-one queries
**Decision:** Reserve `.single()` for inserts and RPCs that are contractually guaranteed to return exactly one row. All read-one paths must use `.maybeSingle()` and explicitly handle the `null` case.
**Why:** `.single()` throws PGRST116 on zero rows, which masks legitimate "not found" cases as 500s. `.maybeSingle()` returns `data: null` and lets the route decide the correct HTTP status. Architect Batch 14g flagged 41 call sites; all converted.
**Date:** Batch 14g.

### Browser Supabase client is a module-level singleton
**Decision:** `src/lib/supabase/client.ts` creates and caches one `SupabaseClient` per browser session via a module-scoped variable. Components import a getter, not a fresh `createClient()` call.
**Why:** Each `createClient()` opens its own Realtime WebSocket. Re-mounting the bell, chat, broadcasts, and notification panel simultaneously was opening four sockets per page. The singleton also keeps a stable auth listener for cookie refresh.
**Date:** Batch 16b.

### MapLibre CSS imported once in root layout
**Decision:** `import "maplibre-gl/dist/maplibre-gl.css"` lives in `src/app/layout.tsx`, not in `EventMap.tsx` / `LocationPicker.tsx` / `MiniMap.tsx`.
**Why:** Importing CSS inside dynamic-loaded client components meant the first map render flashed unstyled controls until the chunk landed. Layout-level import inlines it into the initial CSS payload.
**Date:** Batch 16b.

### Avatar uploads pass through a server route
**Decision:** Profile/contributor avatar upload goes through `POST /api/profile/avatar` (server-validates MIME, size, calls `validateImageFile()`, then writes via service-role client to `event-images/${user.id}/avatars/`). The browser never holds storage credentials.
**Why:** Direct browser-to-storage uploads bypass our content-type / dimension / size validation and let arbitrary users write arbitrary files under any path. SVG is rejected because `event-images` serves with the uploaded Content-Type and we cannot mark the bucket sandbox-only without breaking `next/image`.
**Date:** Batch 14b.

### Social URL fields server-sanitized
**Decision:** `/api/profile` social URL inputs are run through `sanitizeUrl()` which enforces `^https?://` and rejects `javascript:`, `data:`, `vbscript:`. Same helper is used everywhere a user-supplied URL touches the DOM (suggestions `page_url`, contributor profile websites, place websites).
**Why:** Profile pages render social links as `<a href>`. A `javascript:` URL would execute in the click context of the visitor. Single chokepoint avoids per-route re-validation.
**Date:** Batch 14c.

### Contributor kind changes require admin review
**Decision:** Changing `profiles.contributor_kind` is not a self-serve UPDATE. The profile editor submits a `contributor_kind_change_requests` row which an admin approves; the trigger then updates the profile.
**Why:** Contributor kind drives capabilities (e.g. business-only features). Allowing arbitrary self-promotion from `individual` → `business` would bypass the spirit of the role split.
**Date:** Batch 16.

### Event-form static interceptor on `/events/new`
**Decision:** `/events/new` is a Server Component that resolves the session and the user's quota / contributor status before rendering the form. Unauthenticated users get redirected; over-quota citizens get the banner instead of the form.
**Why:** Earlier client-side gating meant the form briefly flashed before redirecting. Doing the check in the RSC keeps the redirect server-side and prevents the unauthenticated bundle from ever loading the form.
**Date:** Batch K.

### Broadcast isolation per contributor
**Decision:** `broadcasts` are scoped per contributor; followers of contributor A never see broadcasts from contributor B unless they also follow B. RLS enforces this on SELECT; the API does not filter in application code.
**Why:** Contributor pages need a "tell my followers" channel that doesn't leak into a global feed. RLS-first means a client mistake cannot widen the audience.
**Date:** Batch 16 — Stage E1.

### Notification deep-links validated server-side
**Decision:** Every notification row carries a typed `data.url` field; the click handler in `NotificationPanel` accepts only URLs starting with `/` (and not `//`) to prevent open-redirect / `javascript:` payloads.
**Why:** Notification rows can be written by Edge Functions, triggers, and the RPC layer. Centralising the URL whitelist in the client click handler is the last defensive layer.
**Date:** Batch 14h.

### Place review aggregation lives in `place_review_stats` view
**Decision:** Average rating + count for places is exposed via a SECURITY INVOKER view (`place_review_stats`) joined into the place detail RSC, not computed client-side or in a separate `/api/places/[id]/stats` route.
**Why:** Computing the aggregate on every detail render via a view keeps the count consistent with what RLS allows the viewer to see (e.g. soft-hidden reviews disappear automatically). Materialised view was rejected because the freshness lag would frustrate reviewers.
**Date:** Batch 16b.

### Capabilities sweep — gating is server-side and centralised
**Decision:** `src/lib/capabilities.ts` is the single source for "can this user do X?" checks. RSCs call it; client components receive the boolean as a prop. No client component re-derives capability from `profile.role`.
**Why:** Spreading role checks across components meant a contributor-kind tweak required touching dozens of files. Centralising lets us add a single test per capability and audit the matrix at a glance.
**Date:** Batch O / Batch P.

### Feature Clarity folder is the authoritative spec
**Decision:** Before writing code for messaging, friends, reporting, search/discovery, or dynamic surfaces, consult `docs/feature-clarity/<feature>.md`. PRs that contradict the clarity doc must update the doc in the same PR.
**Why:** These features have repeatedly drifted across batches. The clarity folder is the locked spec; DECISIONS.md is the implementation diary, not the spec.
**Date:** Batch Polish 2.

---

## UI / map / search

### QP1 — quick-search panel
**Decision:** The events page quick-search panel is a single client component that wraps `<SearchInput>` and a dropdown of recent / suggested searches; it does not re-fetch on every keystroke. Debounced at 200ms; suggestions are precomputed server-side.
**Why:** Live search across the full event corpus produced visible jank on mid-tier Android. The debounce + precomputed suggestions hit the same UX without the request storm.
**Date:** Batch QP1.

### MessageButton deferred for un-friended users
**Decision:** "Message" CTA is only rendered for users who already follow you back. Cold-start DMs are gated behind a follow request.
**Why:** Open DMs invited spam from one prior incident. Following each other is the lowest-friction filter that maps to "we know each other".
**Date:** Batch Polish 2.

### RSVP ref pattern for optimistic state
**Decision:** `RSVPButton` keeps the current status in a `useRef`, updates the ref synchronously on click, and reconciles with the server response. State that affects parent counts goes through a `useState`.
**Why:** Double-tap on slow networks was inverting the toggle (going → going). Ref-based latch lets the click handler see its own most-recent value even before React re-renders.
**Date:** Batch Polish 1.

### `community_contributor` chip on profile cards
**Decision:** Profiles with `contributor_kind = 'individual'` who have shipped at least one event surface a "Community Contributor" chip distinct from ministry / org / business chips.
**Why:** Individual contributors are a real category that the role split obscured. The chip restores the distinction without adding a new DB column.
**Date:** Batch Polish 1.

### `ContributorKindLink` is the only contributor name renderer
**Decision:** All places that render a contributor's display name (event card, place card, broadcast author, mention, notification body) go through `<ContributorKindLink contributor={...} />`. The component owns kind-aware routing (`/c/[slug]` vs `/u/[id]`), the kind chip, and visited-state styling.
**Why:** Six different components were rolling their own contributor links and each missed a case (slug vs id, chip vs no chip, anchor vs button). One component, one prop surface.
**Date:** Batch Polish 1.
