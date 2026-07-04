# Mobile Launch Runbook — Citizens Connect (Capacitor)

> **Status (2026-07-01):** Steps 0, 3, 4 and 6-partial are now SHIPPED (see RESUME_HERE.md §3G)
> — the frontend is precompiled (no more Babel-standalone/`?v=`), the rate limiter is
> Upstash-backed for multi-instance correctness, OAuth-on-device deep linking + native
> geolocation are wired, and notched-device safe-area insets are handled. **What remains
> (Steps 1/2/5/6-rest/7) genuinely needs founder accounts/decisions** (Firebase, Apple
> Developer, store listings, legal content) that no amount of code can substitute for — laid
> out below in order. Source spec: `docs/PHASE_4_5_ADDENDUM.md` §B.

---

## What already works

| Piece | Where | State |
|---|---|---|
| Mobile web bundle | `npm run build:mobile` → `mobile-dist/` (gitignored) | ✅ copies `src/frontend/`, generates `config.js` with **production API base** (`MOBILE_API_BASE_URL` env override; env-first, gitignored-dev-config fallback for Supabase/MapTiler keys) |
| Capacitor sync | `npm run cap:sync` (runs build:mobile first) | ✅ Android + iOS shells populated; plugins: app, browser, geolocation, push-notifications, share, splash-screen, status-bar |
| Bundled assets (no webview wrapper) | `capacitor.config.ts` | ✅ `webDir: mobile-dist`, `server.url` removed — offline boot, store-review friendly |
| API CORS for the shells | `src/middleware.ts` | ✅ allow-list: deployed frontend + `capacitor://localhost` + `http(s)://localhost` + dev `:3001`; OPTIONS → 204 (covered by 4 unit tests) |
| In-app compliance surfaces | Settings / reports / blocks | ✅ account deletion (`/api/account/delete`), UGC report (`/api/reports`) + block (`/api/blocks`) APIs exist |

## ✅ Step 0 — Precompile the frontend — DONE (2026-07-01) — addendum §B0
`scripts/build-frontend.js` now precompiles the 19 `app/*.jsx` screens (esbuild JSX-strip per
file, concatenated in load order, minified into one content-hashed `app/bundle.<hash>.js`) —
no more Babel-standalone JIT-compiling in the browser, no more `?v=` cache-bust ritual.
**Scope note:** React/ReactDOM/supabase-js/maplibre-gl/lucide deliberately stay on CDN UMD
`<script>` tags (not bundled from npm) — that was the "preferred" (not required) part of this
step; it fixes the actual JIT-compile perf problem and the `?v=` ritual without the larger risk
of touching how 19 interdependent global-scope files load. Full vendor bundling for true
offline-first boot is a fast-follow if wanted. Detail: RESUME_HERE.md §3G.

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

## ✅ Step 3 — OAuth on device — CODE DONE (2026-07-01) — addendum §B1
1. ✅ Custom scheme `citizensconnect://auth-callback` — found ALREADY registered in
   `android/app/src/main/AndroidManifest.xml` (intent-filter) and `ios/App/App/Info.plist`
   (`CFBundleURLTypes`) from the original Capacitor scaffold.
2. **⏳ Founder action still needed:** Supabase Auth → URL allow-list: add
   `citizensconnect://auth-callback`; Google OAuth client: add the Android SHA-1 fingerprint +
   iOS bundle id (`com.citizensconnect.app`) once real signed builds exist.
3. ✅ `auth-client.js`: `signInWithOAuth({ skipBrowserRedirect: true })` on native +
   `src/frontend/capacitor-bridge.js` (new — bundles `@capacitor/browser`/`@capacitor/app`) +
   `CapApp.addListener('appUrlOpen')` → `exchangeCodeForSession`. Web path unchanged.
4. **⏳ Still needed:** the actual device test matrix (cold-start sign-in, token refresh after
   1h, sign-out, reinstall) — needs a real `cap:sync` + Android Studio/Xcode build, which no
   amount of further code work can substitute for. Detail: RESUME_HERE.md §3G.

## ✅ Step 4 — Native geolocation — DONE (2026-07-01) — addendum §B4
`map.jsx`'s "user location first" framing now routes through `@capacitor/geolocation`
(via `capacitor-bridge.js`) when running natively, raw `navigator.geolocation` on web — same
permission-pre-prompt-on-first-map-view behaviour either way, never at boot. Android
`ACCESS_FINE_LOCATION` + iOS usage strings were already present in the native manifests.
Detail: RESUME_HERE.md §3G. (The salvage ref `docs/salvage/useLocationTracking.ts.ref` covers a
*different* feature — live location SHARING during an RSVP'd event, already implemented via
`/api/location` — not this map-framing use case.)

## ✅ Step 5 — Backend prerequisite before traffic scales — DONE (2026-07-01) — addendum §A2
`src/lib/rate-limit.ts`'s `checkRateLimit()` is now Upstash Redis-backed when
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set (free tier — REST API over `fetch`,
no SDK), falling back to the original in-memory limiter otherwise. All call sites unchanged in
shape (same function name, now `await`ed). **⏳ Founder action still needed:** create the free
Upstash DB and set the two env vars in Vercel to actually activate it in prod — until then the
app behaves exactly as before (in-memory, single-instance-only). Detail: RESUME_HERE.md §3G.

## Step 6 — Store compliance & assets (addendum §B5) — PARTIAL (2026-07-01)
- ✅ `viewport-fit=cover` + safe-area insets for notched devices (map top overlay + bottom nav).
- ✅ **Demo mode already stripped** (`SHOW_DEMO`/`signInDemo` — 0 hits confirmed by grep; done in
  an earlier session, §2L/§2M).
- **⏳ Still needed (legal/content, not code):** surface account-deletion + report/block in the
  mobile UI nav (the APIs already exist); live public privacy policy + terms URLs; data-safety
  forms (location, photos, messaging); icons, splash, screenshots per device class, Play feature
  graphic, age rating.

## Step 7 — Release process (addendum §B7)
- Bundled assets ⇒ app updates ship via store releases; document cadence.
- `appId` is `com.citizensconnect.app` — changing it later means a NEW app in both stores.
- Build: `npm run cap:sync` → `cap:open:android` (Android Studio → signed AAB) /
  `cap:open:ios` (Xcode → archive). Consider Capacitor Live Updates later if cadence hurts.

---
*Generated during the Phase 3–5 rollout session (2026-06-12); Steps 0/3/4/5/6-partial updated
during the launch-hardening session (2026-07-01, RESUME_HERE.md §3G). Pairs with
`docs/PHASE_4_5_ADDENDUM.md` and `docs/HTML_FRONTEND_WIRING_SPEC.md` PART 5.*
