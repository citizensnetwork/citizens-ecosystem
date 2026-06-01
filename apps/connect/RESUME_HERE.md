# RESUME_HERE — Citizens Connect

> **Read this first. Single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch.
> **Also read [CLAUDE.md](CLAUDE.md) — auto-loaded standing instructions for every session.**

---

## 1. Project at a glance

- **Citizens Connect** — map-first Christian community discovery (events, places, Contributors).
- Stack: Next.js 15 App Router (RSC) + TypeScript + Supabase + MapLibre GL JS + MapTiler Cloud + Tailwind CSS v4 + Capacitor (iOS/Android).
- Design: white-black-gold (60/30/10), full-screen map-first, glass-overlay floating controls.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- **Locked direction: `.github/MASTER_DIRECTION.md`.**

---

## 2. What just shipped — Notification matrix Batches 1–4 ✅ COMPLETE (2026-06-02)

All 4 remaining notification-matrix features shipped, one batch each through the full
quality gate + push. **Price field skipped entirely** (events have no price column).
The notification matrix is now fully implemented. Next migration number: **130**.

### Batch 4 — Map update bubbles — commit `9ac16c5` (latest, FINAL matrix item)
- **Migration 129** (applied live): `map_bubbles(event_id, body≤160,
  source∈{event_update,broadcast}, created_at, expires_at default now()+24h)` +
  `bubble_dismissals(bubble_id, user_id)` PK. RLS: bubbles public-readable only while
  `expires_at > now()` (no client writes); dismissals own-row only. AFTER-INSERT SECURITY
  DEFINER triggers `tg_bubble_from_event_update` / `tg_bubble_from_broadcast` (event-only)
  auto-create a snippet bubble on every event update / event broadcast — both trigger fns
  have EXECUTE **revoked** from public/anon/authenticated (REST-RPC hardening). SECURITY
  DEFINER `get_active_map_bubbles()` (anon+authenticated) returns live, non-dismissed
  bubbles (anon callers get all live); `dismiss_map_bubble(uuid)` (authenticated) records a
  per-user dismissal idempotently.
- POST `/api/map/bubbles/[id]/dismiss` (auth + UUID + rate-limit → RPC). `createBubbleEl` +
  `BUBBLE_MIN_ZOOM=12` in `markers.ts` (escapeHtml-sanitised speech bubble + dismiss ×).
  `.cc-bubble` CSS in globals.css. EventsView fetches via `rpc("get_active_map_bubbles")`,
  keeps one bubble per event, passes `bubbles` + `onDismissBubble` to EventMap, which renders
  an **isolated** bubble marker layer (separate ref + own zoom listener, not entangled with
  marker deconfliction), anchored above each event, revealed z12+. 4-case dismiss route test;
  EventsView test mock gained `rpc`.
- Gates: tsc 0, vitest **813/813** (94 files), lint clean. Advisors 110 WARN / 53 auth-secdef
  (+3 vs baseline 107 — the 3 intentional SECURITY DEFINER RPCs; the 4 would-be trigger-fn
  exposures were hardened away).

### Batch 3 — Anonymous broadcast reactions — commit `a307bad`
- **Migration 128** (applied live): aggregate-only `broadcast_reactions(broadcast_id,
  emoji, count)` — PK `(broadcast_id, emoji)`, **no user id column** (identity-free by
  construction), five-emoji check constraint, RLS SELECT-public + no write policy.
  SECURITY DEFINER `increment_broadcast_reaction(p_broadcast_id, p_emoji)` validates
  auth + emoji whitelist + live broadcast, atomic `on conflict … count+1`.
- New `src/lib/broadcasts.ts` is the single source for the five emoji (🙏❤️🎉🙌🔥),
  shared by table/RPC/route/UI. POST `/api/broadcasts/[id]/react` (auth + UUID +
  rate-limit + emoji guard → RPC; 404 on missing broadcast). New `BroadcastReactions`
  client component (optimistic, rollback) wired into `OrgBroadcastList` behind a
  `showReactions` prop — event views only (`EventDetailContent` + `/e/[id]`, both server
  fetchers attach per-broadcast counts). 7-case route test.
- Gates: tsc 0, vitest **809/809** (93 files), lint clean. Advisors 107 WARN / 51
  auth-secdef (+1 = the new RPC, accepted SECURITY DEFINER pattern).

### Batch 2 — Material-change push filtering — commit `f35535a`
- **Migration 127** (applied live): `event_updates.is_material boolean default false`;
  `notify_event_field_changes()` now also watches `volunteer_openings` and stamps every
  synthetic field-change row `is_material = true`; trigger recreated to fire on
  `volunteer_openings` too. Mirrored into `supabase/schema.sql`.
- **`_shared/push.ts`**: new `skipPush` flag → inserts in-app rows then returns before FCM.
- **`notify-event-update` (redeployed v2, `verify_jwt=false`)**: reads `record.is_material`,
  splits attending vs considering RSVPs, delivers **in-app** to all pref-allowed recipients
  (attending+considering minus per-event opt-outs), delivers **push** to all only when
  material, otherwise attending only. Two `sendNotifications` calls (skipPush, then skipInApp).
- Cancellations untouched (separate `notify-event-cancelled`). Gates: tsc 0, vitest 802/802,
  lint clean. Advisors 106 WARN / 50 auth-secdef = identical to baseline (no new findings).

### Batch 1 — Per-event opt-out for RSVP'd/considering users — commit `6b0775b`
- **Migration 126** (applied live): `rsvps.notify_updates boolean default true` + partial
  muted index + SECURITY DEFINER RPC `set_rsvp_notify_updates(p_event_id, p_notify)`
  (column-scoped to caller's own row; no broad UPDATE policy).
- `PATCH /api/events/[id]/notify-preference` (auth + UUID + rate-limit + boolean → RPC; 409
  when no RSVP). `EventNotifyToggle` switch under RSVPButton. `EventDetailServer` selects
  `notify_updates`. Edge fns `notify-event-update` (deployed **v1 — never deployed before!**)
  and `notify-broadcast` (v4) exclude `notify_updates=false` rows. 6-case route test.

### Next batches (queued, not started)
- **Notification matrix is COMPLETE** — all 4 items shipped (Batches 1–4). No queued
  notification-matrix work remains.

> **Verify webhook wiring (carried over, still unverified):** confirm the `event_updates`
> INSERT DB webhook actually targets the `notify-event-update` function (it was deployed for
> the first time in Batch 1). Also note: Batch 4 now adds a DB trigger on the same
> `event_updates` INSERT (bubble creation) — independent of the webhook, so it works
> regardless, but the push webhook itself remains unverified.

---

## 2b. Earlier — Notification batch DEPLOYED end-to-end (2026-06-02)

**The notification batch is now live in Supabase, not just in code.** The prior session
left the migrations/cron/edge functions undeployed; this session applied and verified them.

### Deployment completion (this session)
- **Migrations applied to live:** `122` (storage bucket size/MIME limits), `123`
  (weekly digest schedule + `muted_source_ids` comment), `124` (enable `pg_net`),
  `125` (register the weekly `contributor-digest` cron with **inline** function URL +
  anon key — `123`'s GUC-based path always short-circuits because `ALTER DATABASE` is
  denied to the management role on this project).
- **`pg_net` enabled** so Postgres cron can issue the outbound HTTP POST.
- **`send-contributor-digest` edge function deployed** (v1, ACTIVE, `verify_jwt=true`).
- **Weekly digest cron is registered and active:** `contributor-digest`, schedule
  `0 6 * * 1` (Mon 06:00 UTC / 08:00 SAST), `active=true`. **Smoke-tested end-to-end** via
  `net.http_post` → gateway accepted the anon JWT → function returned `200 {"digests":0}`
  (correctly found no reportable 7-day activity).
- **`notify-broadcast` redeployed** (v3, ACTIVE, `verify_jwt=false`) — the previously
  deployed v2 was stale: it lacked source-mute filtering and only notified `attending`
  (not `considering`). The live version now matches the repo source.
- **Security advisors re-run:** the only NEW advisory is `extension_in_public` (WARN) for
  `pg_net`, which is **unfixable** (pg_net does not support `SET SCHEMA`) and is a known,
  accepted low-severity exception common to all Supabase projects using pg_net. No new
  ERROR-level findings.

> **Note on the inline anon key (migration 125):** the anon/publishable key is committed
> inline in the cron command. This is safe under the platform's RLS-first model — RLS, not
> key secrecy, enforces access. The key only lets the Supabase gateway accept the scheduled
> invocation; the edge function runs with its own service-role key from its environment.

---

### Feature work (prior session) — Notification clarity, weekly contributor digest, and source mutes (2026-06-01)

**Notification decisions from the feature-clarity session are now encoded in docs and backend fan-out rules.**
Feature commit: **`05f9c97`** (`feat(notifications): apply weekly digest and mute rules`).

### Product decisions captured
- `docs/feature-clarity/notifications.md` is now the notification source of truth:
  contributor/admin digests only, weekly analytics cadence, material-event push rules,
  per-user map-bubble dismissal, contributor/event mute direction, admin push for
  moderation/security items, and anonymous broadcast reactions.
- `docs/feature-clarity/messaging.md` no longer promises 5-times-daily contributor/admin
  digests; it now references weekly analytics summaries.

### Implementation
- `send-contributor-digest` now uses a 7-day window and writes titled/body notifications
  summarising connects, considers, RSVP cancellations, followers, place follows,
  volunteer applications, DMs, and comments.
- Migration `123_weekly_contributor_digest_schedule.sql` unschedules any legacy
  `contributor-digest` cron and re-registers it weekly (`0 6 * * 1`) only when
  `pg_cron`, `pg_net`, and the Supabase function URL/anon-key GUCs are available.
- `muted_source_ids` is now validated through `/api/notifications/preferences` and typed
  in `src/types/db.ts`.
- Broadcast notification fan-out respects source mutes:
  event broadcasts check event mutes only; place broadcasts check place and org mutes.
- Broadcast-flood admin alerts now go through `sendNotifications`, so admins with instant
  push enabled can receive push as well as in-app rows.

### Verification
- `npx.cmd tsc --noEmit` -> 0 errors.
- `npx.cmd vitest run` -> **794/794 tests** across 91 files.
- `npx.cmd next lint --dir src` -> clean.
- Focused rerun after final edge-function count cleanup:
  `npx.cmd vitest run src/__tests__/api/notifications/preferences/route.test.ts src/__tests__/lib/notifications/sourceMutes.test.ts src/__tests__/api/contributor-broadcasts.test.ts`
  -> 22/22 tests.
- Supabase advisors were **not runnable** in the prior session; this session ran them via
  the Supabase MCP — see "Deployment completion" above (only the known `pg_net`
  `extension_in_public` WARN is new).

### Security notes
- New preference writes are authenticated, rate-limited, UUID-validated, bounded to 100
  source mutes, and update only the caller's own `profiles` row through the existing
  RLS-scoped server client.
- Broadcast fan-out reads mute state through the server/service path and fails open on
  lookup errors so notification delivery does not silently disappear during DB issues.
- No service-role key was introduced into client code.

### Follow-ups
- The weekly contributor digest cron is now registered and active (see "Deployment
  completion"); it fires Mondays 06:00 UTC. `pg_net` + the inline cron (migration 125)
  replace the GUC requirement.
- Consider-to-connect conversions are documented as a desired digest metric, but there is
  no direct conversion timestamp in the current RSVP model. The current digest reports
  connects and considers separately.
- UI controls for event/contributor/place mutes can now be built on top of
  `muted_source_ids`.

---

## 2-prev. Previously shipped - Map prominence tiering (zoom + prominence layers) (2026-06-01)

**Markers now reveal in tiers (dot → mid → full → photo) driven by `zoom + a prominence
score`, the way Google Maps layers POIs — not zoom alone.** `tsc 0`, lint clean,
**782/782 tests** (88 files, +20 prominence unit tests). Migration 119 applied to live;
feature committed (see git note below).

### The model (hybrid, founder-chosen)
- **Server (heavy, precomputed):** `events.prominence_base` + `places.prominence_base`
  ∈ [0,1] — a saturating-log popularity score (`raw = Σ wᵢ·ln(1+countᵢ)`, `base =
  raw/(raw+K)`; row-independent so one viral item can't bury the rest). Events:
  rsvps/comments/views(90d). Places: follows/reviews. Migration 119
  ([119_map_prominence.sql](supabase/migrations/119_map_prominence.sql)):
  `recompute_map_prominence()` SECURITY-DEFINER, service-only, + a guarded daily
  pg_cron schedule + one-time backfill. Flows to the client free via the existing
  `events`/`places` `select("*")` in [events/page.tsx](src/app/events/page.tsx).
- **Client (live):** [src/lib/map/prominence.ts](src/lib/map/prominence.ts) folds in
  **time-proximity** (dominant, W_TIME 0.6) + **newcomer boost** (decays over 7d) on top
  of the base (W_POP 0.4). `computeProminence` + `markerTier(zoom, prominence)`, pure +
  unit-tested ([prominence.test.ts](src/__tests__/lib/map/prominence.test.ts), 20 tests).
- **Fairness floor (VISION "don't bury the small"):** prominence only sets *tier* and
  *collision/photo priority* — it NEVER hides. Every item is always ≥ a dot; a
  prominence-0 marker still reaches full at MID_MODE_ZOOM. Newcomer boost + time-dominant
  weighting lift fresh/small items.

### Wiring ([EventMap.tsx](src/components/map/EventMap.tsx))
- `DOT_MODE_ZOOM`/`MID_MODE_ZOOM` moved into prominence.ts (single source of truth); tier
  is now per-marker (`markerTier`) — high-prominence markers reveal a couple zoom levels
  earlier (Google-style promotion).
- **Photo tier** — top-`PHOTO_TIER_CAP` (4) most-prominent *full-tier* markers in the
  viewport get a larger thumbnail overlay (`.cc-marker-photo` + `.cc-marker-photo-img`,
  56px), events AND places, recomputed on settle (zoomend/moveend). Reversible overlay
  (doesn't fight per-zoom inline sizing); falls back to the pin + remembers failure if the
  image 404s. CSS in [globals.css](src/app/globals.css).
- **Collision by prominence** — `runDeconfliction` weights the force-push by
  `0.5 + prominence` so the heavier (more prominent) marker yields less. Equal-prominence
  behaviour is mathematically identical to before (no regression).

### pg_cron ENABLED — refresh now automated (migration 120)
Founder approved "the cron". Migration 120
([120_enable_pg_cron.sql](supabase/migrations/120_enable_pg_cron.sql)) ran
`CREATE EXTENSION pg_cron` (was not installed) and registered
**`map-prominence-recompute`** (daily 02:45 UTC, verified `active=true`). The refresh is
DB-internal — **zero app/map-runtime cost** (the lightest path). Backfill values sane:
22/191 events scored, 2/40 places, max event base 0.36.
- **Gotcha fixed:** `cron.unschedule(name)` RAISES if the job is absent, so it must be
  guarded by `IF EXISTS (SELECT 1 FROM cron.job WHERE jobname=…)` — NOT the `WHERE TRUE`
  the prior migrations used (those only worked because their outer pg_extension guard meant
  the unschedule never ran while cron was off).
- **Dormant crons revived — migration 121**
  ([121_register_dormant_crons.sql](supabase/migrations/121_register_dormant_crons.sql)).
  All 5 DB-internal jobs from 107/110/116/117 are now registered + `active=true`:
  `messaging-purge-60d` (daily 03:00), `contributor-analytics-daily` (02:15),
  `contributor-analytics-purge` (Sun 03:00), `contributor-analytics-vision-snapshot`
  (1 Jan 03:30), `search-term-stats-purge` (Sun 03:30). Verified the aggregator runs
  clean (manual `aggregate_contributor_analytics_daily()` → 3 rows, no error). cron.job
  now lists 6 active jobs total (incl. map-prominence-recompute).
- **STILL EXCLUDED — `contributor-digest` (108):** uses `net.http_post` but **pg_net is
  NOT installed**, and its two GUCs (`app.supabase_functions_url`/`app.supabase_anon_key`)
  are **unset**; it also has user-facing side effects (digests 5×/day). Reviving needs:
  (1) enable `pg_net`, (2) `ALTER DATABASE … SET app.supabase_functions_url/anon_key`,
  (3) a product decision. Left for an explicitly-approved follow-up.

### Phase 5 — DONE, reframed as a performance pass (founder priority: speed/lightweight)
The original cosmetic Phase 5 was dropped on purpose: dot **desaturation contradicts the
documented founder preference for crisp/"illuminous" markers** (dimming was already removed
once for looking dull — see `markers.ts` + the mid-tier `opacity:1` revert), and a
fractional-zoom fade needs a per-frame zoom listener that risks the pan smoothness. Instead
Phase 5 hardened the real hot path:
- **Deconfliction now skips off-screen markers.** `runDeconfliction` filtered `n` to only
  on-screen markers (`display:none`/`visibility:hidden` excluded) before the O(n²) force
  loop + projection. Off-screen markers can't visually overlap, so this is a pure win that
  **grows with zoom and dataset size** — the scaling lever as events/places multiply.
- **Early-out** when <2 on-screen markers (resets the lone offset, skips the loop).
- Equal-prominence collision behaviour remains mathematically identical (no visual regression).

### git — all committed + pushed
**origin/main @ `8845eb7`** (working tree clean). This session's commits:
- `9267510` — tiering + photo tier wiring (bulk also swept into founder commit `3fba76e`).
- `a5c3bf9` — Phase 5 deconfliction perf + migration 120 (enable pg_cron).
- `8845eb7` — migration 121 (re-register dormant crons).

Migrations applied to live: **119** (prominence base), **120** (enable pg_cron),
**121** (register dormant jobs). Final gate: `tsc 0` · **782/782 tests** · lint clean ·
vibe-security CLEAN.

> ⚠️ **Repo git-identity hook:** commits are rejected unless
> `git config --local user.name "Citizens Network"` and
> `user.email "citizensnetworkpbo@gmail.com"` are set. Set them once per clone.

---

## 2-prev. Previously shipped — Image-upload RLS fix + marker fill + panel-nav (2026-06-01)

**Fixed the long-standing "new row violates row-level security policy" on event/place image
uploads, the square-in-circle map marker, and the "X reopens the panel / surfaces get confused"
navigation bug.** `tsc 0`, lint clean, **762/762 tests** (87 files). Build-green; founder to
browser-test then it's ready (committed this session).

### Root cause (durable — see `memory/storage-uploads-must-be-server-side.md`)
The **browser** Supabase client (`@supabase/ssr`) has an unreliable JWT **at the Storage endpoint** —
uploads arrive as `anon` → bucket RLS denies them. PostgREST/DB writes from the same client are fine;
only Storage fails. Avatars already dodged this via the server route `/api/avatar`. Event/place
covers + galleries still uploaded client-side → failed. Live storage INSERT policy verified correct
via MCP (`foldername[1] = auth.uid() OR is_admin()`); impersonation test returned `path_ok = true`.

### The fix — all binary uploads now go server-side
- **New `POST /api/media/upload`** ([route.ts](src/app/api/media/upload/route.ts)) — auth + per-user
  `RATE_LIMITS.heavy` + `validateMediaFile` (image/video) + **service-role admin-client upload**.
  Path is server-built and always `${user.id}`-prefixed; `scope` enum picks the bucket
  (`event-images`/`place-images`) so callers can't write to arbitrary buckets or escape their folder.
- **Client helper** [uploadMedia.ts](src/lib/uploadMedia.ts) (`uploadMediaFile`) — posts FormData,
  returns `{ url, kind } | { error }`.
- Rewired the 4 cover sites (`EventForm`, `EditEventForm`, `PlaceForm`, `EditPlaceForm`) + the shared
  gallery lib [mediaUpload.ts](src/lib/mediaUpload.ts) to the route. Metadata rows
  (`event_photos`/`place_media`) still insert client-side under the user's RLS session (ownership
  enforced there — no regression). Updated `placeMedia.test.ts` to the server-route path.

### Marker square-in-circle — FIXED
[markers.ts](src/lib/map/markers.ts) logo variant img `80%/contain` → **`100%/cover`** so the image
fills the gold ring (flat sides touch the border). Profile variant already filled.

### Panel-nav "X reopens the panel / surfaces confused" — FIXED + mapped
- Cause: the **View** action (`handleQuickAction` case `"view"`, `EventsView.tsx`) pushed the
  `/events/[id]` SidePanel route but left `selectedEvent` set, so the inline glass card (z-1200)
  stayed mounted under the SidePanel (z-1700); closing one revealed the other. **Fix:** `"view"` now
  clears `selectedEvent`/`selectedPlace` before `router.push`.
- Wrote **[docs/NAVIGATION_SURFACES.md](docs/NAVIGATION_SURFACES.md)** (the founder-requested map of
  every overlay over the map: state-driven glass cards vs URL-driven `@panel` SidePanel, z-index,
  open/close triggers, collisions).
- **Nav hardening — APPLIED** (commit `c41d4d8`): new singleton `src/lib/map/panelBus.ts` — SidePanel
  **X** publishes `publishPanelClosed()`, `EventsView` subscribes → `closeDetail()` (surfaces can't
  desync on deep-linked/nested panels). SidePanel `animateThen` now hands off on the drawer's real
  `transform` `transitionend` (guarded 400ms fallback) instead of a fixed 300ms timer — no more
  navigating mid-animation / "stuck" feel.

### Not a bug (confirmed)
"All my events adopted my new profile photo" — expected: profile/logo markers pull the creator's
avatar. Working as designed.

---

## 2-prev. Previously shipped — Figma glassmorphism map UX migration (Batches A–C)

**Reskinned the main map (`/events`, `EventsView.tsx`) into the Figma "Glassmorphism
Community Map" design, wired to real Supabase data, over 3 batches.** Kept the existing
MapLibre map underneath. Build verified by the founder locally (`tsc 0`, lint clean,
`next build` clean). ⚠️ NOT verifiable inside the Cowork sandbox — see "git" note below.

### New glass component layer — `src/components/map/glass/`
- `GlassMapHeader.tsx` — frosted brand header (hex logo + "Citizens Connect / Connecting
  the Kingdom"), integrated search wired to the live `search` filter, Filters/Layers pills.
- `MapFiltersPanel.tsx` — "Filter the Map" glass panel: real `CATEGORY_LABELS` multi-select
  (→ `toggleCategory`) + Weekends-only toggle.
- `MapLayersPanel.tsx` + `mapLayers.ts` — Impact Glow / Activity Pulse / Connections toggles;
  drive marker visuals via `data-layer-*` on the map wrapper (CSS only, no EventMap rewrite).
- `MapStatsFooter.tsx` — bottom pill: Organizations (contributors) / Members (live `profiles`
  count) / Active Projects (events).
- `PlacePreviewCard.tsx` + `EventPreviewCard.tsx` — Figma glass side panels. Event card has the
  5 actions (View/Join/Share/Consider/Visit) wired to `handleQuickAction`.
- `GlassSearchResults.tsx` — glass dropdown under the header search (events/places/orgs), fed by
  the existing AI ranking (`filtered`, `filteredPlaces`, `topContributorMatches`).

### Batch A (safe fixes)
- Quick-select now shows BOTH events + places (panel + map); `placesMode` no longer hides events
  when a quick tool is active.
- Pill relocated above the stats bar, leads with "For me in this area".
- Burger-menu category sections gated off (`showCategorySections=false`) — category filtering now
  lives only in the glass Filters panel.

### Batch B (event panel + inline previews)
- Marker clicks now open the inline glass panels (new `onSelectEvent` prop on `EventMap`; place
  clicks set `selectedPlace` instead of `router.push`) → **removed the redirect-flash** from the
  intercepted `@panel` route. Legacy MapLibre event popup is bypassed when `onSelectEvent` is set.
- `EventPreviewPanel` import removed from `EventsView` (events → `EventPreviewCard`).

### Batch C (markers + navigation + load screen)
- **Navigation/"stuck map" fix** — `SidePanel.tsx` hardened the `inert` logic so a leaked `inert`
  can never freeze the map (root cause of "icons don't appear / events won't open / feels stuck").
  Tags frozen nodes `data-cc-inert-by-panel` + sweeps strays on next open.
- **Markers recoloured** — `lib/map/markers.ts`: events GOLD-ringed, places BLACK; each marker sets
  `--cc-pulse-color` = category hex; `globals.css` Glow/Pulse layers tint via `color-mix` (gold
  fallback, degrades safely).
- **Load screen identified** — it's the intentional `LandingPage` (`/`) `LandingBackdrop` shown for
  ~300ms during the hand-off to `/events`. Not an error.

### VISION
- `VISION.md` (root) created — north star + the Alignment Self-Prompt; wired into `CLAUDE.md` as
  mandatory step 0 (read every run). Founder has since expanded it (scripture, ecosystem, culture).

### Batch C-2 — DONE (2026-05-31): clustering removal + dead-code excision + gold markers
The previously-deferred Batch C items are now shipped (founder asked for "everything remaining"),
build-verified in-sandbox (`tsc --noEmit` → **0 errors**; ESLint clean on all changed files).
- **Clustering/bubbles removed → zoom-reveal.** Deleted `src/lib/map/clustering.ts` and its test
  `src/__tests__/lib/map/clustering.test.ts`. Gutted the entire bubble engine from `EventMap.tsx`
  (geo-cluster refs, expansion/lift state, `updateGeoClusterOpacity`, `expandBubble`/collapse/
  `rebuildGeoClusters`, band tracker, map-click-collapse + Esc recouple + zoom-crossfade handlers,
  `BAND_RANK`). Density now comes only from the kept primitives: **dot-mode (<z7) → mid (z7–10) →
  full (z10+)** + force-deconfliction + viewport culling. `updatePlaceVisibility` simplified to a
  plain zoom-reveal gate (events show at all zooms unless a place-cat filter is active; places
  reveal at `z>=PLACE_ZOOM_MIN`). Removed dead bubble helpers + `createClusterEl` from `markers.ts`
  and `.cc-geo-cluster*` from `globals.css`.
- **Legacy popup + viewport-scope deleted.** Removed the MapLibre event popup entirely (marker
  click now always → `onSelectEvent`/`EventPreviewCard`). Removed the "Search this area" subsystem
  from `EventsView.tsx` (`viewportScoped`/`mapBounds`/`showSearchAreaPill` state, the pan handlers,
  the bbox filters in both memos, the `onMoveEnd`/`onBoundsChange` props); the top pill is now just
  the single **"For me in this area"** variant.
- **Custom event markers gold-themed.** `createCustomMarkerEl` profile/logo/icon variants now use a
  GOLD ring + category/custom `--cc-pulse-color` (matches `createCategoryMarkerEl`).
- **LandingPage hand-off** shortened 300ms → 150ms.
- Residual (non-blocking): `EventMap` still *declares* `onQuickAction`/`rsvpEventIds`/
  `considerEventIds` props (EventsView still passes them) — now unused inside EventMap (were
  popup-only); harmless optional API, candidate for a later tidy.

### Deferred → next session (queued)
- Build the other surfaces from Figma — ready-to-paste prompt at `docs/FIGMA_SURFACES_PROMPT.md`
  (org dashboard, contributor profile, event/place detail, citizen dashboard, messages, auth).
- Working log for this whole effort: `.claude/sessions/figma-map-ux-migration.md` (gitignored).

### ⚠️ git note (important — still applies after Batch C-2)
The Cowork Linux sandbox still reports a **whole-repo CRLF diff** (~660 files show as modified from
line-ending churn alone), so a sandbox commit would be destructive. **Commit/push from the founder's
machine.** New this session: editing certain files through the sandbox intermittently left **trailing
NUL-byte padding** (EventsView.tsx) or a **mid-file truncation** (LandingPage.tsx, restored from git);
both were detected and repaired, and the final `tsc`/ESLint passes confirm the on-disk files are
intact. After pulling these edits, re-run the local quality gate before committing (commands below).

---

## 2-prev. Previously shipped — Optional hardening: `log_search_term` lockdown + real XLSX exports

**Picked up the two non-blocking hardening items from the old §4 backlog** (search-term
poisoning vector + CSV-with-xlsx-MIME fallback). `tsc 0`, lint clean, **790/790 tests**
(88 files, +10 vs Stage L).

### Search-term hardening — Migration 118 ([118_lock_log_search_term_to_service_role.sql](supabase/migrations/118_lock_log_search_term_to_service_role.sql))
- `log_search_term(text)` is now **REVOKEd from anon + authenticated** and **GRANTed to
  `service_role` only**. This removes the documented direct-RPC autocomplete/top-10 poisoning
  vector (anyone with an anon key could previously call it in a loop).
- [ai-search/route.ts](src/app/api/ai-search/route.ts) now invokes it through the
  **service-role admin client** (`createAdminClient`) inside a try/catch fire-and-forget block.
  Because `POST /api/ai-search` is already rate-limited **per-IP and per-user**, that endpoint is
  now the single throttled write path into `search_term_stats`. Search never breaks if the
  service key is absent (logs + continues). Anonymous-search logging behaviour is preserved.
- Read side unchanged: `get_search_autocomplete` stays anon+auth (escaped, read-only),
  `get_top_search_terms` stays authenticated.

### Real XLSX exports — [xlsx.ts](src/lib/analytics/xlsx.ts) (new, zero-dep OOXML writer)
- New `buildXlsx(sheetName, header, rows)` produces a **genuine `.xlsx`** (Content_Types + rels +
  workbook + one worksheet) that Excel/Numbers/Sheets open natively. Replaces the old
  CSV-body-with-xlsx-MIME fallback in **both** export endpoints
  ([analytics export](src/app/api/contributor/[handle]/analytics/export/route.ts) +
  [suggestions export](src/app/api/admin/suggestions/export/route.ts)).
- **Why hand-rolled, not SheetJS:** we only *write*, never parse, so SheetJS's parse-path CVEs
  (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS) don't apply — and the fixed SheetJS
  builds aren't on npm anyway. exceljs would drag a large dep tree for a tiny job. Matches the
  existing zero-dep `csv.ts` philosophy. **(Open to swapping to SheetJS/exceljs if a customer
  needs richer workbooks — flagged for the user.)**
- Implementation: STORED (uncompressed) ZIP + CRC-32 + **inline strings**. Inline strings are
  never evaluated as formulas, so the CSV formula-injection neutraliser is deliberately NOT
  applied on the xlsx path (it would corrupt data); the CSV path keeps `neutraliseFormula`.
  Numbers written as numeric cells via `Number.isFinite` guard.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **790/790 passed** (88 files; +10: 10 xlsx unit tests + 1 ai-search
  admin-log-path test; −1 net from reworking the suggestions xlsx test to assert a real workbook)
- `npx next lint --dir src` → clean
- Sec audit (self): **CLEAN.** Service-role key stays server-side (never shipped to browser);
  xlsx is write-only (no parse-path CVE surface) + XML-escaped + strips illegal control chars;
  export access control/rate-limit/`no-store` unchanged; `workbook.buffer` is full-width
  (`Uint8Array.from`) so no adjacent-memory leak.

### Operator action
None new. (The Stage-L/H backfill below is still the only pending operator step.)

---

## 2-prev. Previously shipped — Stage H follow-ups + Stage L (search term analytics)

**Completed the final two queued items of the contributor-dashboard plan.** This closes out every stage (A–L) plus the deferred Stage H follow-ups. `tsc 0`, lint clean, **780/780 tests** (87 files, +11 vs Stage K).

### Stage H follow-ups — Migration 116 ([116_analytics_sources_and_vision_snapshot.sql](supabase/migrations/116_analytics_sources_and_vision_snapshot.sql))
- **`rsvp_cancellations`** + **`shares`** source-of-truth tables (RLS, indexes). Both populated at the **app layer** (no triggers — a `BEFORE DELETE` trigger on `rsvps` can't tell a user un-RSVP from event-teardown CASCADE).
- **Aggregator v2**: `aggregate_contributor_analytics_daily` now also writes `cancellations` (per event) and `shares` (per event / place / contributor), REPLACE-not-increment like the existing metrics.
- **Vision snapshot wired**: the migration-110 NOTICE stub is rewritten into a real materialiser that builds nested per-contributor rollups (`totals` + `places[]` + `events[]`, A17) into a new **`contributor_analytics_snapshots`** table (A21 — Vision pulls from it; no external HTTP). Yearly cron (Jan 1 03:30 UTC). Param gained `p_year` default; old zero-arg dropped.
- `purge_old_analytics()` extended to trim raw cancellation/share logs at 90 days.

### Stage H wiring (app)
- **`DELETE /api/rsvp`** ([rsvp/route.ts](src/app/api/rsvp/route.ts)) logs `rsvp_cancellations` on a genuine un-RSVP (`.select("id")` guard — never on a no-op delete).
- **`POST /api/shares`** ([shares/route.ts](src/app/api/shares/route.ts)) — best-effort, anon-allowed, rate-limited by user/IP, entity_type allowlist + UUID validation.
- **`logShare`** helper ([logShare.ts](src/lib/analytics/logShare.ts)) wired into `ShareButton` (place), `SocialShareButtons` (event), `ConsiderBadge` (event — native/WhatsApp/copy paths). `EventDetailContent` + `PlaceDetailServer` pass entity props.

### Stage L — Search term analytics — Migration 117 ([117_search_term_analytics.sql](supabase/migrations/117_search_term_analytics.sql))
- **`search_term_stats`** — anonymised `(term, day)` rolling aggregate, **no `user_id`** (A65). **No RLS policies** — access is RPC-only.
- **`log_search_term(text)`** SECURITY DEFINER sanitises server-side; `POST /api/ai-search` fires it best-effort for every search (incl. anonymous).
- **`get_top_search_terms`** (authenticated) → dashboard "Top searches this month" panel (A64) in [AnalyticsDashboardClient.tsx](src/components/contributor/dashboard/AnalyticsDashboardClient.tsx).
- **`get_search_autocomplete`** (anon+auth, A66) merges contributor keywords (ranked first) + popular recent terms, LIKE-metachar-escaped prefix.
- **`GET /api/search/autocomplete`** ([autocomplete/route.ts](src/app/api/search/autocomplete/route.ts)) + a debounced combobox dropdown in the global search bar ([EventsView.tsx](src/components/events/EventsView.tsx)).
- 180-day retention via `purge_old_search_terms()` (weekly cron).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **780/780 passed** (87 files, +11: shares, autocomplete, rsvp-cancellation)
- `npx next lint --dir src` → clean
- Sec audit (self): shares anon-allowed but RLS blocks user-id forgery + polymorphic entity_id only aggregates real owned entities; cancellation log gated by `.select("id")` + `user_id=auth.uid()`; all new RPCs SECURITY DEFINER with clamped inputs + LIKE-escaping; snapshot table read-only RLS, function service-only; search-term inputs sanitised in Postgres (non-XSS). **Accepted residual**: anon `log_search_term` direct-RPC poisoning of autocomplete/top-10 (low-severity, sanitised, curated keywords outrank) — hardening path documented in the plan DECISIONS log.

### Operator action (post-deploy)
After applying migrations **116 + 117**: run from psql with service_role to hydrate the last 90 days (now incl. cancellations/shares for already-logged rows):
```sql
SELECT * FROM public.backfill_contributor_analytics(90);
```

---

## 2-prev. Previously shipped — Stage K: Handle change rule (1/30d + admin override)

**Completed Stage K of the contributor-dashboard plan**: contributor `handle` (slug) is now editable from the Settings dashboard with a server-enforced 30-day cooldown, an admin-only override that bypasses the cooldown via SECURITY DEFINER RPC, and warning copy + a two-click confirm gate on the UI.

### Migration 115 ([115_contributor_slug_change.sql](supabase/migrations/115_contributor_slug_change.sql))
- `admin_change_contributor_slug(p_contributor_id uuid, p_new_slug text, p_reason text)` SECURITY DEFINER RPC. Server-side admin role re-check (defence-in-depth — SECURITY DEFINER alone is not enough), server-side regex format guard (`^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$`), uniqueness via existing `profiles_contributor_slug_key` partial index translated to a clean `slug_taken` (23505) exception. Writes `admin_actions` (canonical admin trail) AND `activity_log` (admin-on-behalf attribution) atomically with the UPDATE. REVOKE from anon/public; GRANT to authenticated only.

### Backend ([slug/route.ts](src/app/api/contributor/[handle]/slug/route.ts))
- PATCH `/api/contributor/[handle]/slug` with `{ new_slug, reason? }`.
- Owner path: API enforces 30-day cooldown from `profiles.handle_changed_at`; on success, atomically writes new slug + updates timestamp + records activity via `recordContributorMutation`.
- Admin path: requires non-empty `reason`, delegates to the RPC; Postgres exception codes mapped 23505→409, 42501→403, 22023→400.
- Rate-limited via `RATE_LIMITS.mutation`. UUID/format guard at the API matches the regex inside the RPC so a compromised admin session cannot inject arbitrary strings.
- Per A62: no legacy-handle redirect — old handles stop resolving the instant the write commits. Client hard-navigates to `/c/{new}/dashboard/settings`.

### UI ([SettingsDashboardClient.tsx](src/components/contributor/dashboard/SettingsDashboardClient.tsx) + [settings/page.tsx](src/app/c/[slug]/dashboard/settings/page.tsx))
- New **Public handle** section at the top of Settings (owners and admin-with-grant viewers only).
- Server-computed `handleCooldownDaysRemaining` so the disabled state and the cooldown banner are correct on first paint (no client flash).
- Constrained input (`[a-z0-9-]` only, 40-char cap) with `/c/` prefix decoration. Two-click confirm flow with the exact A61 copy: *"This will break any existing links to your profile. Are you sure?"*
- Admin-with-grant viewers see a reason textarea (required); button label switches to "Override handle".

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **769/769 passed** (84 files, +10 tests vs Stage J)
- `npx next lint --dir src` → clean
- Sec audit (self):
  - RPC SECURITY DEFINER but re-checks admin role inside Postgres; format regex enforced both in RPC and API; UNIQUE INDEX still authoritative for collisions.
  - Owner path can never trigger admin behaviour (`isAdminWithAccess && !isOwner` gate).
  - API rate-limited; reason field control-char stripped and length-capped (500).
  - UI confirm gate; input character allowlist defends against client-side experimentation; redirect uses `encodeURIComponent` even though slug is already constrained.
  - `recordContributorMutation` handles admin-on-behalf attribution automatically when the admin (rather than owner) drives the change.

---

## 2-prev. Previously shipped — Stage J: Suggestion polish + admin inbox + CSV-injection hardening

**Completed Stage J of the contributor-dashboard plan**: admin suggestion inbox UI, dedicated `suggestion_response` notification type, CSV/XLSX export, glass-panel composer polish, and a security-driven fix to CSV formula injection (covers both Stage J's new export and the pre-existing Stage H analytics export).

### Migration 114 ([114_suggestion_response_notification.sql](supabase/migrations/114_suggestion_response_notification.sql))
- Extends `notifications_type_check` to include `suggestion_response`. Replaces the prior hack where the PATCH route reused `contributor_approved` to notify submitters.

### Backend ([suggestions/[id]/route.ts](src/app/api/suggestions/[id]/route.ts))
- Notification insert now uses `type: "suggestion_response"` with `data: { suggestion_id, status }`. No `data.url` field — there is no meaningful destination page for the submitter, and the body conveys the outcome.

### Admin inbox UI ([admin/suggestions/page.tsx](src/app/admin/suggestions/page.tsx) + [SuggestionsManager.tsx](src/components/admin/SuggestionsManager.tsx))
- Mirrors `/admin/reported` UX: status tab nav (Open / In review / Actioned / Declined), server-fetched list capped at 100 rows, client manager component for status updates and inline written response.
- **Origin-safe page-URL rendering** — `page_url` is parsed via `new URL(rawUrl, window.location.origin)`; only same-origin URLs render as Next `<Link>` (pathname + search + hash only). External URLs collapse to plain `(external)` text. Raw URL appears only in the `title` attribute. Eliminates phishing risk of clicking an attacker-supplied href on an admin surface. The check runs in a post-mount `useEffect` to avoid SSR/CSR hydration mismatch.
- **CSV / XLSX export buttons** in the tab nav linking to the new export endpoint.

### Export endpoint ([admin/suggestions/export/route.ts](src/app/api/admin/suggestions/export/route.ts))
- GET `/api/admin/suggestions/export?format=csv|xlsx&status=open|in_review|actioned|declined|all`
- Admin-only (role check via `profiles`), rate-limited via `RATE_LIMITS.heavy`, `Cache-Control: no-store`.
- Stage H precedent: CSV body served with xlsx MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) for the `xlsx` format. Zero new deps.
- Hard cap 5000 rows.
- Filename sanitised via `sanitiseExportFilename`.

### CSV formula injection hardening ([admin/suggestions/export/route.ts](src/app/api/admin/suggestions/export/route.ts) + [analytics/csv.ts](src/lib/analytics/csv.ts))
- **Self-audit finding**: a malicious submitter could put `=cmd|'/c calc'!A0` (or `@SUM(...)`, `+...`, `-...`) in a suggestion title; when an admin opens the CSV in Excel/Sheets, the formula would execute.
- Added `neutraliseFormula()` that prefixes values starting with `=`, `+`, `-`, `@`, TAB, or CR with a single quote so spreadsheet apps render the literal text.
- Applied to **both** the new suggestions export (Stage J) **and** the pre-existing analytics export (Stage H, shipped without this protection) — per CLAUDE.md item 3, no broken code left unaddressed.

### Admin home wiring ([admin/page.tsx](src/app/admin/page.tsx))
- New "Open suggestions" stat card with emphasis when count > 0.
- New tools-grid tile linking to `/admin/suggestions`.
- Grid layout bumped `lg:grid-cols-5` → `lg:grid-cols-6` to accommodate the 6th stat card.

### Composer polish ([SuggestionButton.tsx](src/components/ui/SuggestionButton.tsx))
- Glass-panel treatment: `bg-white/90 backdrop-blur-md` + gold inset ring + existing 2xl rounded card.
- **Trigger-context preview**: post-mount effect reads `window.location.pathname + search` and renders a small italic "Submitted from <path>" line above the submit button. Builds submitter trust by confirming the platform knows which page their feedback is about (satisfies A57 "capture surface / URL / page / event / place").

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **759/759 passed** (83 files, +1 file +14 tests vs prior)
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- Sec audit (self):
  - PATCH notification uses dedicated type, no `data.url` injection vector.
  - Admin export role-gated, rate-limited, filename sanitised, formula-injection neutralised.
  - Admin inbox renders submitter-supplied URLs through origin allowlist; external URLs never rendered as `href`.
  - `safeInternalPath` returns null on SSR + before-mount to avoid hydration mismatch.
  - Suggestion POST input still: 10/day rate limit, control-char strip, `^https?://` page_url validation, 3+/10+ length minima.
  - Anonymous submissions still allowed (`user_id IS NULL OR user_id = auth.uid()` RLS from migration 100b).

### Operator action
None required — migration 114 is a pure enum extension; deploy + apply.

---

## 2-prev. Previously shipped — Stage G.2 + Stage H optional + Stage I (commit `847f3b8`)

**Completed three Stages in one batch**: full atomic owner transfer (G.2 follow-up), historic analytics backfill RPC (H optional), and expandable Planning cards with structured fields (I).

### Migration 111 ([111_team_owner_transfer_atomic.sql](supabase/migrations/111_team_owner_transfer_atomic.sql)) — Stage G.2
- `team_owner_transfers` table — proposal record with status (`pending|accepted|declined|cancelled`), one pending per contributor enforced by partial unique index. RLS read-only to contributor/transferee/proposer/admins; **all writes flow through SECURITY DEFINER RPCs**.
- **Backfill**: every approved contributor profile gets a self-owner `team_memberships` row (`member_id=contributor_id, role='owner', status='active'`) via idempotent INSERT … ON CONFLICT DO UPDATE.
- **Trigger** `ensure_contributor_self_owner` on `profiles` — fires when `contributor_status` transitions to `'approved'`. SECURITY DEFINER so admin approval RLS doesn't block. **Guarded against re-promotion** if another active owner already exists (prevents two-owners-after-re-approval edge case).
- `propose_team_owner_transfer(p_contributor_id, p_proposed_owner_id)` RPC — validates `auth.uid()` is the active owner per `team_memberships`; validates transferee is an active non-owner member; cancels any prior pending proposal before insert. Notifies the transferee + writes activity_log.
- `respond_team_owner_transfer(p_transfer_id, p_action)` RPC — `auth.uid()` must equal `proposed_owner_id` and status must be `pending` (FOR UPDATE locks the row). On accept: **atomic demote of prior owner to 'editor' + promotion of acceptor to 'owner'** in a single function body. Notifies both parties + activity_log. Defensive `no_current_owner` raise if no owner row found.
- All RPCs REVOKE from anon/public; GRANT to authenticated only.

### `checkDashboardAccess` refactor ([access.ts](src/lib/dashboard/access.ts))
- `isOwner` now sourced from `team_memberships.role='owner' AND status='active' AND member_id=auth.uid()`.
- Self-id check (`user.id === contributor.id`) retained as a defensive fallback only — should be unreachable in steady state because the trigger covers all future approvals.
- Same refactor applied in [team/page.tsx](src/app/c/[slug]/dashboard/team/page.tsx) and [settings/page.tsx](src/app/c/[slug]/dashboard/settings/page.tsx) for their independent `viewerIsOwner` computations.

### Backend wiring ([team/route.ts](src/app/api/contributor/[handle]/team/route.ts))
- `propose_owner_transfer` action now delegates to the `propose_team_owner_transfer` RPC. Postgres exception codes mapped to 403/400/500. Dead helper `sendOwnerTransferNotification` removed.
- [`team-invites/route.ts`](src/app/api/team-invites/route.ts) — GET returns `{ invites, owner_transfers }`. POST accepts `kind: "invite" | "owner_transfer"` to route to the correct RPC.

### UI ([TeamInvitesClient.tsx](src/components/team/TeamInvitesClient.tsx) + [team-invites/page.tsx](src/app/account/team-invites/page.tsx))
- Renders a dedicated "Ownership transfers" section (gold-tinted border + "Owner transfer" pill) above the regular team invites. Accept/decline buttons POST to `/api/team-invites` with `kind: "owner_transfer"`.
- Empty state copy widened to mention transfers.

### Migration 112 ([112_backfill_contributor_analytics.sql](supabase/migrations/112_backfill_contributor_analytics.sql)) — Stage H optional
- `backfill_contributor_analytics(p_days_back integer DEFAULT 90)` SECURITY DEFINER function — loops `aggregate_contributor_analytics_daily` over the last N days (clamped 1..365). Returns `(target_date, rows_written)` rows so operators see per-date progress when invoked interactively.
- Idempotent: underlying aggregator uses REPLACE-not-increment, so re-runs self-correct.
- REVOKE from anon/authenticated/public. **Invoke via psql with service_role**:
  ```sql
  SELECT * FROM public.backfill_contributor_analytics(90);
  ```
- Skips "today's yesterday" (handled by the existing 02:15 UTC daily cron).

### Migration 113 ([113_planning_card_fields.sql](supabase/migrations/113_planning_card_fields.sql)) — Stage I
- `planning_tasks` AND `planning_ideas` each gain: `checklist jsonb`, `links jsonb`, `assigned_place_ids uuid[]`.
- CHECK constraints cap collection sizes (50 checklist · 20 links · 10 places) + enforce `jsonb_typeof = 'array'` so payloads can't sneak in malformed shapes. All columns default to empty so existing rows + existing inserts continue to work.

### Backend wiring ([cardFields.ts](src/lib/planning/cardFields.ts) + tasks/ideas routes)
- New shared validator module `src/lib/planning/cardFields.ts`:
  - `sanitiseChecklist` — strips control chars, length caps text (200), dedupes by id, mints fresh UUID if client supplies a non-UUID id (blocks injected external refs), caps at 50 items.
  - `sanitiseLinks` — enforces `^https?:\/\/` (blocks `javascript:` / `data:` schemes), length caps url (500) + label (120), dedupes, caps at 20.
  - `sanitiseAssignedPlaceIds` — UUID-validates, dedupes, caps at 10.
  - `filterContributorPlaceIds(supabase, contributorId, ids)` — server filters down to places this contributor owns, blocking cross-contributor assignment.
- `tasks/route.ts` + `ideas/route.ts` accept the new fields in both POST and PATCH. PATCH supports partial updates so a single checkbox toggle ships only `{id, checklist}`.

### UI ([PlanningDashboardClient.tsx](src/components/contributor/dashboard/PlanningDashboardClient.tsx))
- **Replaced the 3-column kanban with a responsive 2-column expandable card grid**. Same tab switcher (Tasks · Ideas) up top, with counts.
- Each card collapsed shows: title + status pill (tasks) or tag chips (ideas) + visible_to_team chip + assigned-places count. Click expands.
- **Top-right control**:
  - Tasks → binary completion checkbox (circle, green when complete). Toggle flips status pending ↔ completed. Legacy `in_progress` renders as "incomplete" but stays valid server-side.
  - Ideas → delete X.
- **Public toggle** (visible_to_team) sits below the top-right control as a small slide switch.
- Expanded body: description textarea (onBlur save), inline checklist editor (add via Enter, toggle, remove), links editor (url + optional label, validates `^https?:\/\/`), multi-place picker (chips, capped at 10), tag editor (ideas only), due-date row (tasks only), delete button (tasks).
- Server-fetched `places` (contributor-owned only) passed once from the page for the picker.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **745/745 passed** (82 files)
- `npx next lint --dir src` → clean (Next 16 lint deprecation banner only)
- Sec audit (self):
  - **G.2** — All ownership writes go through SECURITY DEFINER RPCs; `auth.uid()` checked server-side; FOR UPDATE locks the transfer row before mutating; partial unique index collapses concurrent proposals to 23505; trigger guarded against double-owner edge case; notification text passes through React default escaping.
  - **H** — Backfill RPC REVOKEd from non-service roles; window clamped to [1,365]; idempotent.
  - **I** — JSONB CHECK constraints cap collection size + enforce array shape at the DB; URL regex blocks non-http schemes; `filterContributorPlaceIds` blocks cross-contributor place assignment; checklist client-supplied ids are UUID-validated and minted fresh otherwise; links rendered with `rel="noreferrer noopener"`.

---

## 2-prev. Previously shipped — Stage H: Analytics depth + export (commit `1e74b92`)

**Completed Stage H of the contributor-dashboard plan**: daily aggregation pg_cron job, public-safe RPC per A19, server-side CSV/XLSX export, public-profile Activity (30d) chips, Vision-export stub.

### Migration 110 ([110_analytics_aggregation_public.sql](supabase/migrations/110_analytics_aggregation_public.sql))
- `aggregate_contributor_analytics_daily(p_target_date date)` SECURITY DEFINER — idempotent rebuild of `contributor_analytics` for one calendar date. Pulls counters from `events`, `rsvps` (attending), `consider_joins`, `comments`, `convinces`, `event_views`, `reports`, `broadcast_messages`, `follows`, `place_follows`, `places`. ON CONFLICT REPLACE (not increment) so re-runs self-correct. REVOKE from anon/authenticated/public — service_role / pg_cron only.
- `get_public_contributor_analytics(p_contributor_id uuid, p_days integer)` SECURITY DEFINER — returns aggregated `(metric, total)` rows for the public-safe metric allowlist (`follows`, `joins`) only. `p_days` clamped to [1, 365]. Returns rollups across all `entity_type`s so callers can't enumerate per-event/per-place activity. GRANT EXECUTE to anon + authenticated.
- `snapshot_contributor_analytics_for_vision()` — Stage H plan item 5 stub. RAISE NOTICE only; Vision endpoint wired in a follow-up. REVOKE EXECUTE from non-service roles.
- pg_cron schedules: `contributor-analytics-daily` (`15 2 * * *` UTC = 04:15 SAST), `contributor-analytics-purge` (`0 3 * * 0` UTC — calls existing `purge_old_analytics()` for 1-year retention).
- Metrics omitted from daily aggregator (no source table): `cancellations` (rsvps cancel via DELETE not status), `shares` (no shares table). Counters stay at whatever `increment_contributor_metric` writes from app code.

### Backend ([export/route.ts](src/app/api/contributor/[handle]/analytics/export/route.ts))
- GET `/api/contributor/[handle]/analytics/export?format=csv|xlsx&period=…&entity_type=…&entity_id=…`
- Auth via `checkDashboardAccess` (owner OR admin-with-grant). 401 if no user; 403 if no access.
- Whitelists `format`, `period` (7/14/30/60/90/180/365), `entity_type` (`contributor`/`event`/`place`). `entity_id` validated through `isValidUUID`.
- Rate-limited via `RATE_LIMITS.heavy` (5/min) per user — export is heavier than the standard read endpoint.
- CSV body built via `buildAnalyticsCsv` in [csv.ts](src/lib/analytics/csv.ts) — RFC-4180 escaping (comma/quote/CR/LF wrapped, embedded quotes doubled, CRLF row separator). Filename hardened by `sanitiseExportFilename` (strips path separators, control chars, length-capped 80).
- `xlsx` format reuses the CSV body with the spreadsheet MIME so Excel/Numbers open it natively. Zero new deps — plan doc Stage H item 4 explicitly allows this fallback ("…else CSV with `.xlsx` MIME left as TODO").
- `Cache-Control: no-store` prevents intermediary caching of contributor data.

### Backend ([public/route.ts](src/app/api/contributor/[handle]/analytics/public/route.ts))
- GET `/api/contributor/[handle]/analytics/public?period=…` — anon-readable. Resolves slug → contributor id via existing `resolveContributorSlug` helper, calls `get_public_contributor_analytics`. Folds the RPC's `[{metric,total}]` shape into `{ period, totals: {follows, joins} }`. Rate-limited per `user.id ?? handle` (read bucket = 120/min).

### UI ([AnalyticsDashboardClient.tsx](src/components/contributor/dashboard/AnalyticsDashboardClient.tsx))
- Replaced client-built CSV with two `<a>` buttons pointing at `/api/contributor/[handle]/analytics/export` — one for CSV, one for XLSX. Disabled (`opacity-40 pointer-events-none`) when there's no data. Query string built with `URLSearchParams` so encoding is safe.

### UI ([ContributorPublicProfile.tsx](src/components/contributor/ContributorPublicProfile.tsx) + [ProfileDetailServer.tsx](src/components/profile/ProfileDetailServer.tsx))
- New `publicAnalytics` prop on `ContributorPublicProfileProps`. `ProfileDetailServer` fetches 30-day totals via `get_public_contributor_analytics` and passes them down.
- Renders an "Activity (30d)" section between Team and Past events when either follows or joins are non-zero. Two glass-pill chips with the formatted totals.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **745/745 passed** (82 files)
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- Sec audit (self): aggregator + Vision stub revoked from non-service roles; public RPC server-enforces metric allowlist + clamps window + aggregates across entities; export endpoint enforces dashboard access + validates entity_id + RFC-4180 escapes CSV + sanitises filename + sets `Cache-Control: no-store` + heavy rate-limit; public endpoint goes through SECURITY DEFINER RPC, no raw query; numeric values rendered via React-escaped `toLocaleString()`.

---

## 2-prev. Previously shipped — Stage G: Team Management UX (commit `028ba7a`)

**Completed Stage G of the contributor-dashboard plan**: 3-search-bar add-member popup, invite flow with accept/decline notification round-trip, owner-transfer proposal (notification-only — full atomic swap deferred), public team list on contributor profile. Also fixed a latent volunteer-notification bug while in the area.

### Migration 109 ([109_team_invite_owner_transfer.sql](supabase/migrations/109_team_invite_owner_transfer.sql))
- `team_memberships.status` CHECK widened: `pending | active | declined | removed` (was `active | removed`).
- `team_memberships.role` CHECK widened: `owner | editor | viewer` (was `editor | viewer`). Only the propose-transfer flow ever creates 'owner' rows; invites are role-restricted to editor/viewer.
- `team_memberships.responded_at timestamptz` (NULL while status='pending').
- `notifications.type` CHECK extended: `+team_invite, +team_invite_response, +team_owner_transfer, +volunteer_application, +volunteer_application_response`. (Volunteer types added to fix latent 'system' typo — see below.)
- `respond_team_invite(p_membership_id uuid, p_action text)` SECURITY DEFINER RPC — member-side accept/decline. Validates `auth.uid()=member_id` + `status='pending'`, writes notification back to contributor, appends activity_log row. REVOKE/GRANT to authenticated only.
- `get_public_team(p_contributor_id uuid)` SECURITY DEFINER RPC — returns `member_id, full_name, avatar_url, role` for active rows only. Granted to anon+authenticated. Keeps email/invited_by/created_at private while exposing the safe display columns for the public profile.

### Backend ([team/route.ts](src/app/api/contributor/[handle]/team/route.ts))
- **POST `action: "search"`** — accepts `name`, `email`, `user_id` independently (any combination). Each field fires a scoped ILIKE/eq query in parallel; results merged via Map dedupe, capped at 20. `sanitiseLike()` strips `%_\` wildcards + control chars to neutralise LIKE injection. UUID-validated. 3+ char minimum on partial email search.
- **POST `action: "invite"`** — creates `team_memberships` row with `status='pending'`. Pre-flight existence check returns 409 for active/pending; allows re-invite over declined/removed rows via upsert on `(contributor_id, member_id)`. Service-role notification insert (notifications RLS insert is admin-only) with `type='team_invite'` and `data.url='/account/team-invites'`. Best-effort: notification failure logged but doesn't fail invite. `recordContributorMutation` writes activity_log.
- **POST `action: "propose_owner_transfer"`** — gated on `access.isOwner` (excludes admin-with-grant impersonation). Proposed transferee must be an active team member. Notification-only this batch: `type='team_owner_transfer'` to the proposed owner with deep link to `/account/team-invites`. No schema swap — accepting just dismisses the notification. Full atomic ownership swap deferred until a follow-up reworks the `user.id === contributor.id` access model.

### Backend ([team-invites/route.ts](src/app/api/team-invites/route.ts))
- **GET** — lists `auth.uid()`'s pending team_memberships joined to contributor profile.
- **POST** — `{membership_id, action: "accept" | "decline"}` → delegates to `respond_team_invite` RPC. Maps Postgres exceptions to 404/403/400.

### UI ([AddTeamMemberPopup.tsx](src/components/contributor/dashboard/AddTeamMemberPopup.tsx))
- New glass-overlay popup with 3 labelled search fields (name, email, user_id). Auto-focuses name. Escape closes. Results render with avatar + name + email + Invite-as-Editor / Viewer buttons. Inline error band, optimistic add to parent.

### UI ([TeamDashboardClient.tsx](src/components/contributor/dashboard/TeamDashboardClient.tsx))
- Single search input replaced with "+ Add team member" button → popup.
- Members split into **Pending invites** (cancel button) and **Active members** sections.
- "Make owner" button on active member rows, visible only when `viewerIsOwner` (server-computed from `user.id === contributor.id`).
- New `viewerIsOwner` prop wired from [team/page.tsx](src/app/c/[slug]/dashboard/team/page.tsx).

### UI ([account/team-invites/page.tsx](src/app/account/team-invites/page.tsx) + [TeamInvitesClient.tsx](src/components/team/TeamInvitesClient.tsx))
- New `/account/team-invites` route — invitee-side acceptance pane listing pending invites with Accept/Decline. Notifications `type='team_invite'` deep-link here via `data.url`.

### UI ([ContributorPublicProfile.tsx](src/components/contributor/ContributorPublicProfile.tsx) + [ProfileDetailServer.tsx](src/components/profile/ProfileDetailServer.tsx))
- New **Team** section on the public contributor profile. Server-fetched via `get_public_team` RPC, rendered as avatar+name chips. Owner chip prefixed with a gold "OWNER" tag.

### Drive-by fix — volunteer notifications
- `volunteers/route.ts` was inserting `type:"system"` (not in CHECK) and `link:null` (column doesn't exist). Silent failures. Migrated both inserts to use the new `volunteer_application` / `volunteer_application_response` types (added in 109) with `data.url` deep-links. Routed through `createAdminClient()` (notifications RLS insert is admin-only).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- `npx vitest run` → **745/745 passed** (82 files)
- Sec audit (self): LIKE-injection neutralised; role enum restricts owner via invite; propose_owner_transfer gated on real owner only; RPCs validate `auth.uid()` server-side; public RPC exposes only safe columns; notification body uses React-escaped text (no XSS); concurrent invite race collapsed by `(contributor_id, member_id)` UNIQUE.

---

## 2-prev2. Previously shipped — Full Messaging System + Vibe-Security Audit

**Completed all 12 steps of the messaging product plan + ran a full vibe-security audit, fixing 2 HIGH and 2 MEDIUM findings.** Multi-session effort. `tsc 0`, lint clean, **745/745 tests**.

### Step 1 — DB Schema ([107_messaging_permission_model.sql](supabase/migrations/107_messaging_permission_model.sql))
- `conversations.status` enum (`pending | active | rejected`, default `active`)
- `user_blocks` table with RLS (own blocks only) + `is_blocked()` SECURITY DEFINER bilateral check
- `conversation_participants.muted_at` (timestamptz, suppresses push)
- `messages.deleted_at` (soft-delete display window for retention purge)
- `profiles.handle` (`^[a-z0-9_]+$`, 3-30 chars, partial unique index)
- `profiles.discoverable` (boolean default false, opt-in attendee visibility)
- `profiles.muted_source_ids` (jsonb array — broadcast source mutes)
- `profiles.deleted_at` (soft-delete; 30-day message retention thereafter)
- Extended `reports.target_type` to include `'conversation'`
- Extended `notifications` type CHECK to include `spam_flag, broadcast_flood, dm_received, dm_response`
- Updated `find_or_create_conversation(user_a, user_b, p_status DEFAULT 'active')` SECURITY DEFINER
- pg_cron `messaging-purge-60d` (03:00 daily): 60d active, 30d soft-deleted account purge

### Step 2 — Permission Rules ([src/app/api/conversations/route.ts](src/app/api/conversations/route.ts))
- Citizen↔Citizen: always `active`
- Citizen→Contributor: always `active`
- Contributor→Citizen with prior RSVP/follow/place_follow: `pending` (request)
- Contributor→Citizen with NO prior interaction: 403 blocked
- Either party blocked: 400 (via `is_blocked` RPC)
- All gating via Promise.all for parallelism

### Step 3 — Request UX ([MessageRequestCard.tsx](src/components/messaging/MessageRequestCard.tsx))
Pending-state card with Allow/Deny → PATCH `/api/conversations/[id]` with `action: 'accept' | 'reject'`. Per-button loading state.

### Step 4 — Floating panel ([MessagesPanel.tsx](src/components/messaging/MessagesPanel.tsx))
- Anchored `top-14 right-4 z-[9999]`, w-360px, max-h 50vh
- `bg-white/90 backdrop-blur-sm` + gold inset shadow tint
- Sort: pending first, then by `updated_at`
- Inline ChatView when row selected (back arrow returns to list)
- Hover-revealed ConversationCardActions on each row
- Realtime: subscribes to messages INSERT + conversations UPDATE
- Backdrop click closes panel

### Step 5 — Navbar badge ([Navbar.tsx](src/components/ui/Navbar.tsx))
Wraps message icon with unread count badge (same pattern as NotificationBell). Click toggles MessagesPanel.

### Step 6 — MessageButton placements (small `variant="icon"`)
- [EventDetailContent](src/components/events/EventDetailContent.tsx) — near organiser card
- [PlaceDetailServer](src/components/places/PlaceDetailServer.tsx) — owner block
- [ContributorPublicProfile](src/components/contributor/ContributorPublicProfile.tsx) — restored

### Step 7 — [ConversationCardActions](src/components/messaging/ConversationCardActions.tsx)
Mute/unmute · Delete (confirm) · Report (reason picker) · Block (confirm + auto-delete). Browser `confirm()` for destructive (acceptable MVP).

### Step 8 — Spam detection ([api/conversations/[id]/messages/route.ts](src/app/api/conversations/[id]/messages/route.ts))
On message POST: count sender's messages in last 60s; if ≥5, **allow send** but fire-and-forget upsert into `reports` with `onConflict: 'reporter_id,target_type,target_id', ignoreDuplicates: true`. Never blocks legit traffic.

### Step 9 — Broadcast flood detection ([notify-broadcast/index.ts](supabase/functions/notify-broadcast/index.ts))
On each broadcast: count broadcasts from source in last 7d; if >15, insert admin `broadcast_flood` notification. Uses service client (correct for fan-out).

### Step 10 — Contributor digest ([send-contributor-digest/](supabase/functions/send-contributor-digest/index.ts) + [108_contributor_digest_cron.sql](supabase/migrations/108_contributor_digest_cron.sql))
- Counts new RSVPs, followers, place_follows, volunteer_applications, DMs in last 3 hours per approved contributor
- pg_cron schedule `0 7,10,13,16,19 * * *` UTC = 09/12/15/18/21 SAST
- Skip if no activity. Reuses `event_update` notification type (`data.digest=true`) to avoid CHECK constraint expansion.
- Bearer auth guard at function entry.

### Step 11 — Citizen discovery
- @handle opt-in in [ProfileDiscoverySettings](src/components/profile/ProfileDiscoverySettings.tsx). Resolves `/profile/[handle]` or fallback to UUID.
- "Copy profile link" on profile pages.
- "People attending" chips on event detail (only `discoverable=true` RSVPers; only visible to fellow RSVPers).

### Step 12 — Deleted-account display
`profiles.deleted_at IS NOT NULL` → sender name rendered as ~~strikethrough~~ in [ChatView](src/components/messaging/ChatView.tsx) + MessagesPanel. Message body retained 30 days per pg_cron retention.

### Vibe-Security Audit — 4 findings, all fixed
1. **HIGH** — PATCH `accept`/`reject` had no recipient verification: contributor could auto-approve their own pending request via direct API call.
   **Fix** ([conversations/[id]/route.ts](src/app/api/conversations/[id]/route.ts)): Two parallel counts (total messages, user's own messages). If user has sent any message in this conversation OR there are 0 messages total → 403. Works because in pending state only the initiator sends. No schema change.

2. **HIGH** — `send-contributor-digest` used nested `.in("conversation_id", supabase.from(...).select(...))` — Supabase JS doesn't support nested subqueries; silently returned 0 DM counts.
   **Fix**: Pre-fetch `convIds` as array BEFORE Promise.all, then `.in("conversation_id", convIds)` properly.

3. **MEDIUM** — Digest missing `.is("deleted_at", null)` on contributors query.
   **Fix**: Added the filter so soft-deleted accounts don't get digests.

4. **MEDIUM** — Digest had no auth guard.
   **Fix**: `Authorization: Bearer ...` required at function entry. pg_cron path (migration 108 passes anon key) keeps working.

### Standing instructions persisted
[CLAUDE.md](CLAUDE.md) created at project root — auto-loaded every session. Contains the 7-point operating ruleset (start with RESUME_HERE, compact often, no broken code left alone, ask questions, A+ quality, vibe-security check, push+update+report).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx next lint --dir src` → **clean** (only the Next 16 deprecation notice for the lint command itself)
- `npx vitest run` → **745/745 passed** (82 files)

---

## 2a. Previous batch — Quality Gate Fixes (commit `d116ea5`)

**Committed + pushed 2026-05-28.** Resolved TS build errors introduced by stage-f.

Files changed:

- `src/lib/quickPanelOptions.ts` — added `specialFilter?: "volunteer"` to `QuickAccessItem` type (was missing from HEAD; `EventsView.tsx` referenced it)
- `src/lib/quickPanelPrefs.ts` — default quick-panel IDs updated; count 4→5; replaced `"outreaches"` with `"where-to-serve"`
- `src/lib/categoryIcons.ts` — added `"where-to-serve": "heart-handshake"` to `QUICK_ACCESS_ICON_IDS`

**Quality gate on `d116ea5`:**

- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **82 files, 745 tests, all passing**
- `npx next lint --dir src` → **Exit 0, clean**

---

## 2b. Previous batch — Stage F: Volunteers UX (commit `e3c401d`)

**Completed Stage F of the contributor-dashboard plan**: citizen volunteer apply/withdraw flow + contributor approve/decline with reason.

### New component: `VolunteerApplyButton`
- Citizen CTA rendered on event/place detail pages when `volunteer_openings=true` and `organiserHandle` is available.
- States: none (CTA) → form (optional message, 500-char, char counter + aria-live) → submitting → status badge.
- Status badges: pending=amber, approved=green, declined=gray ("Not selected"), withdrawn=silent.
- Withdraw: POST `action=withdraw` → `status=withdrawn`; gated by `applicant_id=user.id` + status in `[pending, approved]`.
- Login gate: Link to /login when `userId=null`. Owner guard: returns null when `isOwner=true`.

### API changes (`volunteers/route.ts`)
- `withdrawn` added to `ALLOWED_STATUSES`.
- New `withdraw` action: UUID validation + ownership check (`applicant_id = user.id`) + status gate + DB update.
- `update_status`: reads + sanitizes `response_message` from body; includes it in `.update()` when present.

### EventDetailServer + EventDetailContent
- `EventDetailServer` fetches user's volunteer application (`maybeSingle`) when `volunteer_openings && user`.
- Passes `volunteerStatus`, `volunteerApplicationId`, and `organiserHandle` (contributor_slug) to `EventDetailContent`.
- `EventDetailContent` renders `VolunteerApplyButton` after LocationSharingToggle when `volunteer_openings && organiserHandle`.

### PlaceDetailServer
- Added `volunteerAppRes` to the parallel `Promise.all` queries (conditional on `user && volunteer_openings`).
- Replaced static "Volunteer" gold pill with interactive `VolunteerApplyButton`.
- `volunteerStatus` and `volunteerApplicationId` extracted from result.

### TeamDashboardClient
- `Volunteer` interface gains `response_message: string | null`.
- Controlled volunteer list (`volunteerList` state) replaces prop-direct rendering.
- Inline respond form: appears on pending rows; confirm action (approve/decline) + optional message textarea (2 rows, 500-char, `maxLength`).
- Optimistic update: `setVolunteers(prev => prev.map(...))` on success; error displayed via `role="alert"`.
- `response_message` shown on declined rows.
- `STATUS_CLASSES` map for consistent status badge styling.

### team/page.tsx
- Volunteer query changed `.in("status", ["pending", "approved", "declined"])` — includes declined for private contributor view.
- `VolunteerRow` type gains `response_message: string | null`.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (82 files)
- `npx next lint --dir src` → clean
- Architect review: security clean — UUID validation on all IDs, `applicant_id` double-gated in both SELECT and UPDATE for withdraw, `sanitize()` on all user text input.
- Advisors: **86 WARN unchanged**

---

## 2c. Previous batch — Stage D: specialised services + keyword bank (commit `04c3118`)

Migration 106: RLS on `specialised_services` + `contributor_keywords`, length 100→40, allowlist `[A-Za-z0-9 ._-]`, unique constraints. Services API: `sanitiseService()`, NFC-normalize. Keywords API: `sanitiseKeyword()`. `PlacesDashboardClient`: inline chip editor. `SettingsDashboardClient`: corrected filter. 744 tests, tsc 0, lint clean.

---

## 2d. Previous batch — Stage E.2+E.3: broadcast public banners + edge function (commit `c189620`)

`OrgBroadcastList` renders "From the Organiser" banners on event/place detail pages. `notify-broadcast` edge function v2 with correct `_shared/` bundling. `_shared/push.ts`: `broadcast_sent` type + `skipInApp` flag. Migration 105: widens `notifications_type_check`. 744 tests, tsc 0, lint clean.

---

## 3. Current platform state

- 87 test files, **762 tests**, all passing. (Count dropped from 790: the Figma Batch C-2 removed
  the clustering engine + its test file.)
- 119 migrations — **all now APPLIED to the live `Citizens-Connect` Supabase project**
  (`xyiajtrvhlxaeplsiajj`). Note: the live DB was silently stuck at 106; a prior session applied
  the **107→118** gap. **Migration 119 (`map_prominence`) applied 2026-06-01** — adds
  `events/places.prominence_base` + `recompute_map_prominence()` + backfill (22 events / 2 places
  scored; rest at fairness-floor 0). ⚠️ **pg_cron is NOT installed on this project**, so the daily
  `map-prominence-recompute` (and the older analytics cron schedules) never registered — prominence
  must be refreshed by calling `select public.recompute_map_prominence();` manually (or install
  pg_cron). 119 was authored in a prior session but left untracked; committed 2026-06-01.
- Analytics **backfill executed** (`backfill_contributor_analytics(90)`, 2026-02-28→05-28).
- Security advisor: **0 errors** (105 informational/by-design lints).
- The Figma glassmorphism map UX migration (Batches A–C + C-2) **is now committed on `main`**
  (`e74346a`, `4934c5b`) — the old "not yet pushed" warning is resolved.
- Latest commit on `main`: the 2026-06-01 image-upload RLS fix + marker fill + panel-nav (§2 above).
  Committed from the founder's Windows machine (no CRLF-churn artifact here — only real changes diff).
  **Founder to-do:** browser-test a real event/place cover + gallery upload to confirm end-to-end,
  then `git push` if not already pushed.

---

## 4. Next batches queued

### Map UX (Figma migration) — Batch C-2 DONE; remaining follow-ups
Batch C-2 (clustering removal, dead-code excision, gold custom markers, landing hand-off) shipped
this session — see §2 "Batch C-2 — DONE" above (tsc 0 / ESLint clean). Items 1–3 + the optional
hand-off are complete. Still queued:
1. ~~Remove clustering/bubbles~~ ✅ DONE — replaced with dot→mid→full zoom-reveal + deconfliction.
2. ~~Delete dead legacy popup + viewport-scope~~ ✅ DONE.
3. ~~Gold-theme custom event markers~~ ✅ DONE.
4. **Build the other surfaces from Figma** — paste `docs/FIGMA_SURFACES_PROMPT.md` into the Figma
   Make file, generate one surface at a time, then wire to real data. Highest-value first:
   the **Organisation Dashboard** (the "Hearts United Foundation" preview). NOTE: its
   Impact Score / Lives Impacted metrics don't exist in the schema — decide real columns vs proxies
   before building (VISION: honour real data).
5. Optional polish: ~~shorten the LandingPage→/events hand-off~~ ✅ (300→150ms); still open — wire
   Next 15 View Transitions + per-route glass `loading.tsx` skeletons for snappier navigation.
6. Optional tidy: drop the now-unused `onQuickAction`/`rsvpEventIds`/`considerEventIds` props from
   `EventMap` (popup-only; EventsView still passes them harmlessly).
- Full working log: `.claude/sessions/figma-map-ux-migration.md` (gitignored).

### Contributor dashboard
**The entire contributor-dashboard plan (Stages A–L + Stage H follow-ups) is now complete.** No further stages are queued from `docs/plans/contributor-dashboard.md`.

~~Outstanding operator action (backfill)~~ — **DONE this session.** All migrations 107→118 are
applied to the live Citizens-Connect DB and `backfill_contributor_analytics(90)` has been run.
No operator DB actions are pending.

> **DB migration discovery (this session):** the live DB's migration tracker was at `106` while
> the repo had files through `118`. Object-level probing showed **107→118 were ALL unapplied**
> (not just 116–118). Applied them in order via Supabase MCP, one at a time, halting-on-error.
> Found + fixed a real bug: migration **108** nested `$$` inside `DO $$` (invalid dollar-quoting)
> — corrected to `$cron$` in the DB and the file. Also hardened file **111**'s policy create with
> a `pg_policies` guard. All verified present; 118 grants confirmed (anon/authenticated can't
> execute `log_search_term`, service_role can).

**Optional hardening — two of three now DONE** (`log_search_term` lockdown ✅, real XLSX ✅). Remaining:

### Citizens Vision + ecosystem (active strategy — NEXT SESSION)
The founder reframed the goal (2026-05-29): an **ecosystem of apps sharing data**, with **Vision as
the back-office analytics/intelligence app** for contributors + organisations to glean analytics,
map activity across **all** ecosystem apps (source-selectable), and receive recommendations/trends.
Connect must stay lightweight + scale (phones via Capacitor + browser). Monorepo (Turborepo) is
the founder's lean but to be confirmed.

**Inspected this session:** Vision (`../citizens-vision`) is **largely feature-complete** — Next 16 /
React 19, Phases **0–21b** done (incl. Connect integration + incremental sync, advisory, federation),
separate Supabase project `Citizens-Vision` (`ijdmcudcrncmaprmzgfk`, currently INACTIVE). Its
`README.md` is boilerplate; real docs are `ARCHITECTURE.md`, `.github/VISION.md`, `PROJECT_STATUS.md`.

**→ Full context + open questions captured in
[docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md](docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md).**
That doc is the agenda for the dedicated strategy session: ecosystem intent, data architecture
(linchpin), Vision scope, audiences, monorepo vs polyrepo, React/Next version reconciliation
(founder Q2 — needs a Capacitor compatibility audit I still owe), and first-deliverable sequencing.
**No monorepo/integration code until those decisions are made.**

### Other non-blocking
- `docs/design/FIGMA_PROMPT.md` remains **untracked** in the Connect repo per founder instruction
  (leave uncommitted).

---

## 5. Open questions

None blocking.

---

## 6. How to verify locally

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
npx vitest run
npx next lint --dir src
npm run dev
```

**Messaging system verification** (12 steps):

1. **Permission gate**: as contributor, try messaging a citizen who has not RSVP'd → API returns 403.
2. **Request flow**: contributor messages a citizen who has RSVP'd → conversation created `status='pending'`; citizen sees MessageRequestCard in MessagesPanel with Allow/Deny.
3. **Recipient-only gate (HIGH fix)**: as contributor, PATCH `/api/conversations/[id]` with `action:accept` on your own pending request → 403 "Only the recipient can respond to a message request".
4. **Floating panel**: click message icon in Navbar → glassmorphism panel opens top-right; click conversation row → inline ChatView; back arrow returns to list.
5. **Badge**: send message to test account → badge appears on Navbar message icon.
6. **MessageButton placements**: visible on event detail, place detail, contributor profile.
7. **Block flow**: block a user → existing conversation hidden, future POST returns 400.
8. **Spam flag**: send 6 messages in 60s → row appears in `reports` table with `reason='spam'`.
9. **Broadcast flood**: create 16 broadcasts from one source in 7d → admin notification with `type='broadcast_flood'`.
10. **Deleted-account display**: soft-delete a profile (`UPDATE profiles SET deleted_at = now() WHERE id = ...`) → their name renders ~~strikethrough~~ in ChatView header + MessagesPanel row.
11. **Discoverable opt-in**: enable in profile settings → name+avatar chip appears on event detail "People attending" for fellow RSVPers.
12. **Digest dry-run**: `curl -H "Authorization: Bearer <ANON_KEY>" https://<project>.functions.supabase.co/send-contributor-digest` → returns `{digests: N}`. Without header → 401.

**Volunteers (Stage F)**:

- Dashboard → Team → Volunteers tab: pending applications show Approve/Decline buttons.
- Decline click reveals inline textarea for reason; Confirm sends POST `update_status`.
- `/e/[id]` or `/places/[id]` when `volunteer_openings=true`: VolunteerApplyButton CTA appears.
- Citizen can apply with optional message, see status badge, or withdraw pending/approved apps.

---

## 7. Memory pointers

- `/memories/repo/coding-patterns.md` — Connect patterns.
- `/memories/repo/outstanding-items.md` — running backlog.

---

## 8. Architecture quick-orient

- **Layout-level auth gating** for the dashboard lives at `src/app/c/[slug]/dashboard/layout.tsx`. It computes `isOwner` / `isAdmin` / `adminSessionActive` and decides which surfaces to render.
- **All notification deep-links** must use `data.url` (not `link_url`/`metadata` — those columns do not exist). See decision log entry "Notification deep-links — `data.url` only".
- **Admin attribution helper** lives in `src/lib/dashboard/adminAttribution.ts`. Any mutating contributor route should call `getActiveAdminGrant` and, if non-null, `logAdminOnBehalfAction` after the mutation succeeds.
- **A48** is encoded in `viewerIsOwner` server prop + server-side route gating.
- **`VolunteerApplyButton`** is a client component at `src/components/volunteer/VolunteerApplyButton.tsx`. It takes `entityType/entityId/contributorHandle/userId/initialStatus/initialApplicationId/isOwner` and handles the full apply/withdraw lifecycle client-side.
- **`withdraw` in volunteers API** is gated by `applicant_id = user.id` in BOTH the SELECT ownership check and the UPDATE WHERE clause — no dashboard access needed (citizen self-action).
- **Messaging recipient identification** (no `created_by` column): in `pending` state only the initiator has sent messages, so PATCH accept/reject blocks any user with `messages.sender_id = user.id` count > 0 OR conversations with 0 messages total. See [conversations/[id]/route.ts](src/app/api/conversations/[id]/route.ts).
- **Conversation creation** goes through `find_or_create_conversation(user_a, user_b, p_status)` SECURITY DEFINER — `user_a` is the initiator. The RPC validates `p_status IN ('pending', 'active')`; `rejected` cannot be created, only set via PATCH (currently the PATCH deletes the conversation instead of setting `rejected`).
- **Supabase JS `.in()` limitation**: nested subqueries (`.in("col", supabase.from(...).select(...))`) silently return 0 results. ALWAYS pre-fetch the array first. Caught in vibe-security audit on `send-contributor-digest`.
- **Edge function auth pattern**: cron-triggered functions should reject requests without `Authorization: Bearer ...` header. pg_cron (migration 108) passes `Bearer ${anon_key}`.
