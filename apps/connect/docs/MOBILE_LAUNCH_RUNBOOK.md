# Mobile Launch Runbook — Citizens Connect (Capacitor)

> **Status (2026-06-12):** Phase 5 groundwork is DONE — the static frontend builds into a
> bundled Capacitor app (`npm run cap:sync` succeeds for Android + iOS, 5 plugins registered),
> the API accepts the Capacitor shell origins (multi-origin CORS in `src/middleware.ts`), and
> the mobile config generator never points a store build at localhost.
> What remains needs **founder accounts/decisions** (Firebase, Apple Developer, store listings)
> and is laid out below in order. Source spec: `docs/PHASE_4_5_ADDENDUM.md` §B.

---

## What already works

| Piece | Where | State |
|---|---|---|
| Mobile web bundle | `npm run build:mobile` → `mobile-dist/` (gitignored) | ✅ copies `src/frontend/`, generates `config.js` with **production API base** (`MOBILE_API_BASE_URL` env override; env-first, gitignored-dev-config fallback for Supabase/MapTiler keys) |
| Capacitor sync | `npm run cap:sync` (runs build:mobile first) | ✅ Android + iOS shells populated; plugins: geolocation, push-notifications, share, splash-screen, status-bar |
| Bundled assets (no webview wrapper) | `capacitor.config.ts` | ✅ `webDir: mobile-dist`, `server.url` removed — offline boot, store-review friendly |
| API CORS for the shells | `src/middleware.ts` | ✅ allow-list: deployed frontend + `capacitor://localhost` + `http(s)://localhost` + dev `:3001`; OPTIONS → 204 (covered by 4 unit tests) |
| In-app compliance surfaces | Settings / reports / blocks | ✅ account deletion (`/api/account/delete`), UGC report (`/api/reports`) + block (`/api/blocks`) APIs exist |

## Step 0 — Precompile the frontend (DO FIRST, ~1 session) — addendum §B0
The app still ships Babel-standalone compiling 19 JSX files in the browser. Fine on desktop dev,
not shippable to mid-range phones. Before any device testing:
- Vite (or esbuild) build: `src/frontend/app/*.jsx` → one hashed bundle; bundle React/maplibre/supabase
  (preferred over CDN for offline boot).
- This also kills the `?v=` cache-bust ritual (hashed filenames).
- Wire the build output into `scripts/build-frontend.js` so web (`public/`) and mobile
  (`mobile-dist/`) both consume it.

## Step 1 — Android push (needs **Firebase project** — open question F1)
1. Create the Firebase project; add Android app `com.citizensconnect.app`; download
   `google-services.json` → `android/app/`.
2. Salvage `docs/salvage/usePushNotifications.ts.ref` into `store.jsx` (register on login,
   POST token to `/api/push-token` — route + `push_tokens` table already exist).
3. Add a send step: an edge function (or extension of `_shared/push.ts`) that delivers FCM
   pushes when a `notifications` row is written — today rows only feed the in-app list.
4. Deep-link routing from a tapped push: `data.event_id`/`data.conversation_id` → the same
   in-app router the notifications screen uses.

## Step 2 — iOS push + build (needs **Apple Developer Program** — open question F2)
1. Enroll; register the bundle id; create an APNs key and upload it to Firebase (FCM relays to APNs).
2. iOS builds require Xcode on macOS (`npm run cap:open:ios`); CocoaPods/SwiftPM resolve on first open.
3. `NSLocationWhenInUseUsageDescription` string in `Info.plist` (map "near me" framing).

## Step 3 — OAuth on device (trickiest item — addendum §B1)
1. Custom scheme `citizensconnect://auth-callback` (or App Links/Universal Links to the prod domain).
2. Supabase Auth → URL allow-list: add the scheme; Google OAuth client: add Android SHA-1
   fingerprint + iOS bundle id.
3. In `auth-client.js`: `signInWithOAuth({ skipBrowserRedirect: true })` + `@capacitor/browser`,
   catch the return via `App.addListener('appUrlOpen')` → `exchangeCodeForSession`.
4. Test matrix: cold-start sign-in, token refresh after 1h, sign-out, reinstall.

## Step 4 — Native geolocation (addendum §B4)
- Route the map's "user location first" framing through `@capacitor/geolocation`
  (salvage `docs/salvage/useLocationTracking.ts.ref`); permission pre-prompt on first map view,
  not at boot. Android `ACCESS_FINE_LOCATION` + iOS usage string.

## Step 5 — Backend prerequisite before traffic scales (addendum §A2)
- Swap `src/lib/rate-limit.ts`'s in-memory store for a shared one (Upstash Redis free tier, or a
  Postgres counter RPC). Founder choice of infra needed; all routes already call `checkRateLimit()`
  so only the implementation swaps. **Must land before store launch.**

## Step 6 — Store compliance & assets (addendum §B5)
- Surface account-deletion + report/block in the mobile UI nav (APIs exist).
- Live public privacy policy + terms URLs; data-safety forms (location, photos, messaging).
- `viewport-fit=cover` + safe-area insets for notched devices.
- Icons, splash, screenshots per device class, Play feature graphic; age rating.
- **Strip demo mode** (`SHOW_DEMO` in auth.jsx, `signInDemo` in store.jsx) — demo personas must
  not ship in store builds (addendum §A5).

## Step 7 — Release process (addendum §B7)
- Bundled assets ⇒ app updates ship via store releases; document cadence.
- `appId` is `com.citizensconnect.app` — changing it later means a NEW app in both stores.
- Build: `npm run cap:sync` → `cap:open:android` (Android Studio → signed AAB) /
  `cap:open:ios` (Xcode → archive). Consider Capacitor Live Updates later if cadence hurts.

---
*Generated during the Phase 3–5 rollout session (2026-06-12). Pairs with
`docs/PHASE_4_5_ADDENDUM.md` and `docs/HTML_FRONTEND_WIRING_SPEC.md` PART 5.*
