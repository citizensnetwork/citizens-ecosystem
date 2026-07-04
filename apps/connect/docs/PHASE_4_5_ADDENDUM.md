# Phase 4 / Phase 5 Addendum — gaps, missed steps & founder-requested recommendations

> **Status: PLANNING INPUT — written 2026-06-10 while Phase 3 was in flight (separate session).**
> This doc adds to `HTML_FRONTEND_WIRING_SPEC.md` PART 5 (Phases 4–5). Nothing here changes
> Phase 3 scope. Each item below is either a **missed step**, an **undocumented dependency**,
> or a **recommendation** from the 2026-06-10 architecture review (Kotlin assessment + DB
> routing review). Sources: RESUME_HERE deferred items (§2c, §2g, §2j, §2-prev), migration 130
> notes, `next.config.ts`, and the CodeViz DB diagram review.

---

## A. Phase 4 additions (advanced features + backend hardening)

### A1. Data-access policy — adopt ONE deliberate pattern per data class (NEW, recommended)
Today the frontend reaches data three different ways, chosen ad hoc per feature:
1. `fetch()` → Next.js API route → Supabase (most screens)
2. Direct Supabase client under RLS (RSVP/follow seeding effect, `get_active_map_bubbles` RPC)
3. Supabase Realtime subscription (notifications; `event_updates`)

Standardise in Phase 4 (this is the "single source reflected across the UI" direction,
adopted selectively where it wins):

| Data class | Pattern | Why |
|---|---|---|
| Public read-heavy lists (events, places, contributors, categories) | **Cached `/api/v1/*`** (s-maxage CDN) | Cheapest at scale; one request serves many users; rate-limited; stable contract for other Citizens apps |
| User-scoped state (my rsvps, follows, notifications, messages) | **Direct Supabase client under RLS + Realtime channel** → store | Fewer hops; live UI; RLS already enforces identity; removes thin pass-through GET endpoints |
| Writes needing orchestration (rsvp capacity, admin review, uploads) | **API routes** (or SECURITY DEFINER RPCs) | Rate limits, validation, audit, service-role isolation |

Concrete consolidation candidates once adopted: `GET /api/notifications` (realtime + direct
read already exist), `GET /api/conversations` list refresh (keep POST), the dashboard
stats polling. **Do not** move public lists to Realtime — holding a websocket per anonymous
map visitor costs more than a 60s-cached CDN hit and Supabase caps concurrent Realtime
connections per project.

### A2. Shared rate-limit store (missed step — must land before Phase 5 ships)
`src/lib/rate-limit.ts` is in-memory **per serverless instance**: as Vercel scales out,
each instance has its own counters, so real limits weaken exactly when traffic grows
(mobile launch). Move to a shared store (Upstash Redis free tier, or a Postgres-based
counter via RPC). All routes already call `checkRateLimit()` — only the implementation
swaps.

### A3. Ecosystem / app-global data plane (founder clarification 2026-06-10)
"Global databases" = **one data layer consumed by multiple Citizens apps** (Vision, Impact,
Equip, Play…) routing into each other. Decisions to make in Phase 4, before a second app
exists:
- **The contract is `/api/v1/*`, not the tables.** Other apps consume versioned API (already
  rate-limited + API-key capable via `v1Gate`/`api_keys`), so Connect's schema can evolve
  without breaking siblings. Keep `docs/api-v1.md` current as the official contract.
- Apps needing **realtime or user-scoped** data can share the same Supabase project: same
  `auth.users`, RLS already enforces per-user access regardless of which app calls.
  One identity across the ecosystem = one Supabase project; keep per-app concerns in
  separate Postgres **schemas** (e.g. `vision.*`) rather than separate projects, until an
  app's load justifies isolation.
- Add `app_id`/source attribution to analytics events when the second app arrives.

### A4. Deferred product/schema decisions (documented but not yet scheduled — schedule them)
| Item | Origin | Decision needed |
|---|---|---|
| Idea→event auto-transition | migration 130 notes | `events.date` is NOT NULL; an idea has no date — what date does a synthesised event get? (`transition_idea_to_in_process()` is stubbed for this) |
| `rsvps.location_snapshot` source | migration 130 notes | Which location feeds it (profile province? device geo at RSVP?) — feeds the Phase 4 "city reach map" |
| Event↔place association | RESUME_HERE §2g | No FK exists (`events.location` is free text). Needed for "events at this place" on place profiles. Product + schema decision |
| `schema.sql` drift | RESUME_HERE §2g | `places` block: phantom `verification_flagged`, missing `volunteer_openings`/`prominence_base`. Reconcile to live (trust live DB) |

### A5. Carried-over feature debt (so it isn't silently lost)
- **Gallery upload + contributor logo/cover persistence** (§2j): needs persisted entity
  UUIDs (lands with Phase 3 create→DB) + a dedicated contributor media path (currently
  logos go to the event-images bucket and aren't saved to a contributor row).
- **BurgerMenu social features rehome** (§2-prev debt): trending events, favourite orgs,
  friends-considering, convince-from-map. VISION-relevant (cit↔cit connection); the old
  `useBurgerMenuData` logic is recoverable from git. Fits naturally beside Phase 4 #6
  (convince mechanic).
- **Strip `SHOW_DEMO` / `signInDemo`** (§2c): remove the demo fallback from `auth.jsx` /
  `store.jsx` before launch — demo mode must not ship inside the store builds.

---

## B. Phase 5 additions (Capacitor mobile) — missed prerequisites & unspecified steps

The spec's Phase 5 is currently 6 lines of CLI commands. These are the steps between those
lines:

### B0. PREREQUISITE: real frontend build step (the single biggest perf lever in the project)
The HTML app ships **Babel-standalone and compiles 19 `.jsx` files in the browser on every
load**. Acceptable for dev; not shippable to phones (slow first paint on mid-range Android,
wasted battery/data, and app-store reviewers notice). Before `cap:sync`:
- Precompile with **Vite** (or esbuild): `src/frontend/app/*.jsx` → one hashed bundle;
  React/maplibre/supabase stay CDN or get bundled (bundled preferred for offline boot).
- This **also eliminates the `?v=` cache-bust ritual** (hashed filenames) — the recurring
  stale-cache trap documented in §2f/§2g/§2i.
- Keep the no-build dev mode if desired; the build is what `scripts/build-frontend.js`
  copies into `public/` and what Capacitor's `webDir` bundles.
- Effort: ~1 session. Do it at the START of Phase 5 (or late Phase 3) — every subsequent
  device test benefits.

### B1. OAuth on device (undocumented — the trickiest Phase 5 item)
The web flow redirects to Google and back to an `https://` page. Inside a Capacitor shell:
- Add **deep-link return**: custom scheme (`citizensconnect://auth-callback`) or Android App
  Links / iOS Universal Links to the production domain.
- Supabase Auth → URL allow-list must add the scheme/links; Google OAuth client needs the
  Android SHA-1 fingerprint + iOS bundle id entries.
- Use `signInWithOAuth({ skipBrowserRedirect: true })` + `@capacitor/browser` (in-app
  browser tab), then catch the callback via `App.addListener('appUrlOpen')` and
  `exchangeCodeForSession`. localStorage session persistence then works as on web.
- Test matrix: cold start sign-in, token refresh after 1h, sign-out, reinstall.

### B2. CORS for Capacitor origins (missed step — verified in `next.config.ts:80`)
The API echoes **one** static origin (`ALLOWED_FRONTEND_ORIGIN`). Capacitor adds:
`capacitor://localhost` (iOS) and `http://localhost` (Android). Static `headers()` can't
echo from a list — move CORS for `/api/*` into `middleware.ts` (origin ∈ allow-list →
echo + `Vary: Origin`), or set `server.androidScheme/iosScheme` to `https` and serve from
`https://localhost`, and verify the CSP (`connect-src`) covers the API + Supabase + MapTiler
from inside the shell.

### B3. Push notifications end-to-end (partially documented — F1/F2 still open)
Backend is ready (`push_tokens` table, `/api/push-token`, edge functions writing
`notifications`). Missing chain: **F1** Firebase project (FCM, Android) + **F2** Apple
Developer enrollment (APNs) → upload APNs key to FCM → salvage
`docs/salvage/usePushNotifications.ts.ref` into the store (register on login, send token to
`/api/push-token`) → an edge-function step that actually **sends** FCM/APNs pushes when a
`notifications` row is written (today rows only feed the in-app list) → deep-link routing
from a tapped push (`data.url` → app screen, mirroring the web notifications router).

### B4. Native geolocation (undocumented)
The map's "user location first" framing uses `navigator.geolocation` — inside Capacitor this
should route through `@capacitor/geolocation` (already a dependency, salvage
`useLocationTracking.ts.ref`) with native permission prompts + the iOS
`NSLocationWhenInUseUsageDescription` / Android `ACCESS_FINE_LOCATION` manifest entries.
Decide the permission-ask moment (on first map view, with a pre-prompt explainer — not at
boot).

### B5. App-store compliance checklist (unspecified — gates submission)
- **Account deletion in-app**: ✅ exists (`/api/account/delete`) — surface it in Settings.
- **UGC moderation**: Apple/Google require report + block for user-generated content:
  ✅ `/api/reports`, `/api/blocks` exist — ensure both are reachable in the mobile UI.
- Privacy policy + terms URLs (live, public), data-safety forms (location, photos,
  messaging declared), age rating, splash/status-bar config (deps already installed),
  `viewport-fit=cover` + safe-area insets for notched devices.
- Store assets: icons, screenshots per device class, feature graphic (Play).

### B6. Mobile build/config wiring (unspecified)
`scripts/build-frontend.js` generates `public/config.js` from `NEXT_PUBLIC_*` env vars at
deploy. The Capacitor bundle is built locally → decide the mobile config source: bake a
production `config.js` (API_BASE_URL = `https://citizens-connect.vercel.app`,
real MapTiler key) into `webDir` at `cap:sync` time, mirroring the same generator with a
`--mobile` flag. Never point a store build at localhost fallbacks.

### B7. Version/update strategy (unspecified)
Bundled web assets (recommended: offline boot, store-reviewable) mean **app updates ship
via store releases**. Document the cadence; consider Capacitor Live Updates later if needed.
Set `appId`/`appName` in `capacitor.config` deliberately (changing appId later = a new app
in the stores).

---

## C. DB diagram / routing review (founder question 2026-06-10)

Reviewed `.codeviz/.../Citizens-Connect Visual DB Diagram.md` against the live codebase:

1. **The routing is sounder than it looks.** The diagram's many arrows are mostly *schema
   relationships* (FKs) and *trigger/RPC writes*, not request hops. The actual request path
   per feature is short: client → (API route | direct RLS read) → Postgres.
2. **Real redundancy exists in one place**: user-scoped GET endpoints that duplicate what a
   direct RLS read + Realtime subscription already provides (see A1). That's the founder's
   "extra routing" instinct, and it's correct **for that data class** — the fix is the A1
   policy, not removing the API layer wholesale.
3. **Keep the API layer for public lists and writes** — it's the CDN cache, the rate
   limiter, and (per A3) the contract other Citizens apps will consume. Removing it would
   couple every future app directly to table shapes and forfeit caching.
4. **Diagram staleness warning**: it cites `src/app/page.tsx`, `layout.tsx`, and
   `next.config.mjs` — all deleted/renamed in Phase 1 (the project is API-only with
   `next.config.ts`). The edge-function arrows are also generated as a uniform block
   (every function → profiles/events/rsvps/notifications + `is_admin()`), which overstates
   several functions' real table access. Treat CodeViz output as a sketch, not truth;
   regenerate after Phase 3.
5. **`store.jsx` already is the "one single location"** the founder described — every
   screen renders from the central store. Phase 4's A1 makes its *inputs* live (Realtime →
   store → UI) instead of fetch-on-navigate, which is exactly "reflect changes from the
   source directly across the UI".

---

*Authored: Claude (Fable 5) per founder request, 2026-06-10. Review alongside
`HTML_FRONTEND_WIRING_SPEC.md` PART 5 before kicking off Phase 4 or Phase 5.*
