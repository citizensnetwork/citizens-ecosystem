# Citizens Connect — Architecture & Migration Strategy
### Produced from deep codebase scan · June 2026
### Status: Reference document for HTML-first + mobile migration decisions

---

> *"You are no longer strangers and foreigners, but fellow citizens."*
> — Ephesians 2:19

---

## HOW TO USE THIS DOCUMENT

This document captures the architectural reality of the Citizens Connect codebase as of June 2026, and provides a clear strategy for:

1. Decoupling the frontend from Next.js (so the HTML version can lead)
2. Making Next.js a pure API backend
3. Shipping the mobile app via Capacitor (already scaffolded)
4. Preserving every Supabase integration, auth flow, and API route intact

---

## PART 1 — WHAT THE SCAN FOUND

### 1.1 You are NOT starting from scratch

The deep scan of `citizens-connect/` revealed something important: **you are already most of the way to the target architecture.** Here is what exists today:

| Asset | Status |
|---|---|
| `capacitor.config.ts` | ✅ Already configured — `appId`, splash, status bar, push |
| `android/` directory | ✅ Android scaffold fully present |
| `ios/` directory | ✅ iOS scaffold fully present |
| `package.json` cap scripts | ✅ `cap:sync`, `cap:run:android`, `cap:run:ios` all wired |
| `src/app/api/` | ✅ 30+ API route namespaces fully implemented |
| `src/app/api/v1/` | ✅ Public versioned API already exists (analytics, categories, contributors, events) |
| Supabase integration | ✅ RLS, migrations 1–130, all applied to live DB |
| CORS headers | ⚠️ Currently locked to `self` — needs update for cross-origin HTML client |
| `next.config.ts` CSP | ⚠️ Restricts `script-src`, `connect-src` to `self` — needs updating |
| `out/` directory | ⚠️ Only contains a loading shell — the real HTML export hasn't been built yet |

### 1.2 What the "HTML version" actually is

The `out/` directory currently contains only a placeholder loading shell (`index.html` with a "Loading…" spinner). This is the result of `next export` producing a static shell — **not a full HTML-first frontend.**

The "HTML version that performs better" is almost certainly the **client-rendered Next.js output** (`next build` → `next export`), or a separate HTML prototype that was built independently. Before proceeding, clarify which one:

- **Option A**: The existing Next.js app, statically exported → `out/` → served via Capacitor
- **Option B**: A completely separate HTML/CSS/JS prototype with its own codebase

> **Action required from founder:** Confirm which HTML version you mean. The strategy below works for both, but the steps differ slightly.

### 1.3 The 30+ API routes that must be preserved

The following API namespaces exist in `src/app/api/` and form the backend that any frontend must talk to:

```
/api/account          — profile settings, handle changes
/api/admin            — admin panel (users, categories, audit log, suggestions)
/api/ai-search        — AI-powered event/place/org ranking
/api/avatar           — server-side image upload (already fixed for RLS)
/api/blocks           — user blocking
/api/broadcasts       — contributor broadcast messages + reactions
/api/consider         — Consider mechanic
/api/contributor      — contributor profile, analytics, team, broadcasts, volunteers
/api/contributors     — public contributors list
/api/conversations    — messaging, permission model, spam detection
/api/convince         — Convince mechanic (friend nudging)
/api/dashboard        — dashboard data
/api/events           — event CRUD, notify-preference, volunteers
/api/follow           — social following
/api/indemnity        — indemnity gate
/api/location         — geo services
/api/manage           — contributor management
/api/map              — map bubbles, bubble dismiss
/api/media            — server-side binary upload (fixed for Supabase RLS)
/api/notifications    — bell, panel, preferences, mark-read
/api/place-follow     — place following
/api/preferences      — user preferences
/api/push-token       — FCM/APNs token registration (Capacitor)
/api/reports          — content reporting
/api/rsvp             — RSVP (attending / considering), cancellations
/api/search           — search autocomplete
/api/shares           — share logging
/api/suggestions      — community idea submission
/api/tags             — tagging
/api/team-invites     — team invite acceptance
/api/terms            — terms of service gate
/api/v1/analytics     — public analytics API (Vision-facing)
/api/v1/categories    — public categories API
/api/v1/contributors  — public contributors API
/api/v1/events        — public events API
```

---

## PART 2 — THE TARGET ARCHITECTURE

```
┌──────────────────────────────────────────────────┐
│              Mobile App (iOS + Android)           │
│         Capacitor wrapping the HTML frontend      │
│   Push, Geolocation, Share, SplashScreen native   │
└───────────────────────┬──────────────────────────┘
                        │ WebView
┌───────────────────────▼──────────────────────────┐
│              HTML Frontend                        │
│  (Static export of Next.js OR separate HTML app)  │
│  Hosted: Vercel / Netlify / Cloudflare Pages      │
│  MapLibre GL, Tailwind CSS, Vanilla JS or React   │
└───────────────────────┬──────────────────────────┘
                        │ fetch() API calls
                        │ (CORS headers required)
┌───────────────────────▼──────────────────────────┐
│         Next.js — API Routes Only                 │
│   No SSR pages, no getServerSideProps             │
│   Just /api/* and /api/v1/* endpoints             │
│   Hosted: Vercel (current deployment)             │
│   Auth: Supabase SSR cookie middleware            │
└───────────────────────┬──────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────┐
│              Supabase                             │
│   Project: xyiajtrvhlxaeplsiajj                   │
│   130 migrations applied, all RLS enforced        │
│   Edge functions: notify-broadcast,               │
│   notify-event-update, send-contributor-digest    │
│   pg_cron: 6 active jobs                         │
│   MapTiler: Kingdom Commons style                 │
└──────────────────────────────────────────────────┘
```

---

## PART 3 — WHAT NEEDS TO CHANGE

### 3.1 CORS (Required — blocks everything without it)

Currently `next.config.ts` sets all headers with `source: "/(.*)"` including a strict CSP with `connect-src 'self'`. This must be updated to allow the HTML frontend to call the API cross-origin.

**File:** `next.config.ts`

Add CORS headers to the API routes:

```typescript
async headers() {
  return [
    // Existing security headers on all routes (keep these)
    {
      source: "/(.*)",
      headers: [
        // ... existing headers ...
      ],
    },
    // NEW: CORS on all /api routes for the HTML frontend
    {
      source: "/api/(.*)",
      headers: [
        {
          key: "Access-Control-Allow-Origin",
          // Replace with your actual frontend domain in production
          value: process.env.ALLOWED_FRONTEND_ORIGIN || "http://localhost:3001",
        },
        { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, Cookie" },
        { key: "Access-Control-Allow-Credentials", value: "true" },
      ],
    },
  ];
}
```

**Also update CSP** — change `connect-src 'self'` to include your frontend origin:

```typescript
"connect-src 'self' https://your-frontend-domain.com ...(rest unchanged)"
```

> **Security note:** Never set `Access-Control-Allow-Origin: *` when credentials are involved. Always specify the exact origin(s).

### 3.2 Capacitor Configuration (Minor update needed)

`capacitor.config.ts` currently points `server.url` to `http://localhost:3000`. For production mobile builds this should point to the deployed Next.js API URL:

```typescript
server: {
  url: process.env.CAPACITOR_SERVER_URL || "https://citizens-connect.vercel.app",
  cleartext: false, // HTTPS only in production
},
```

The `webDir: "out"` setting is already correct — this is where the built HTML frontend goes.

### 3.3 The `out/` Directory Strategy

Currently `out/` only has a placeholder. The Capacitor `webDir: "out"` config means the mobile app will load whatever is in `out/`.

**Two paths forward:**

**Path A — Next.js static export (recommended for fastest delivery):**
```bash
# In next.config.ts, add:
output: "export"

# Then build:
npm run build
# This populates out/ with the full static site
npm run cap:sync
# Syncs to Android + iOS native projects
```
> ⚠️ Static export removes API routes and middleware — but since we're decoupling those to Vercel anyway, this is fine. The HTML shell calls the Vercel-hosted API.

**Path B — Serve your separate HTML app via Capacitor:**
```bash
# Copy your HTML app's built files into out/
# Then sync Capacitor
npm run cap:sync
```

### 3.4 Environment Variables for Cross-Origin

The HTML frontend will need to know where the API lives. Add:

```
NEXT_PUBLIC_API_BASE_URL=https://citizens-connect.vercel.app
```

Or for static HTML, configure via a `config.js` file loaded before your app code.

---

## PART 4 — CAPACITOR MOBILE BUILD PLAN

Capacitor is already fully scaffolded. Here is the complete path to app store submission.

### 4.1 What's already done ✅

- `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` all installed (v8.3.0)
- `@capacitor/push-notifications` installed
- `@capacitor/geolocation` installed (needed for the map)
- `@capacitor/share`, `@capacitor/splash-screen`, `@capacitor/status-bar` installed
- `android/` native project present
- `ios/` native project present
- `capacitor.config.ts` configured with `appId: "com.citizensconnect.app"`
- `cap:sync`, `cap:run:android`, `cap:run:ios` scripts in `package.json`

### 4.2 What still needs to happen

| Step | Action | Effort |
|---|---|---|
| 1 | Build the HTML frontend into `out/` | 30 min |
| 2 | Run `npm run cap:sync` | 5 min |
| 3 | Open Android Studio: `npm run cap:open:android` | Setup |
| 4 | Test on Android device/emulator: `npm run cap:run:android` | 30–60 min |
| 5 | Wire FCM credentials for push notifications | 1–2 hrs |
| 6 | Open Xcode: `npm run cap:open:ios` | Setup |
| 7 | Test on iOS simulator/device | 30–60 min |
| 8 | Wire APNs credentials for iOS push | 1–2 hrs |
| 9 | Apple Developer Program enrollment (R1,950/yr) | 1 day admin |
| 10 | App Store Connect setup + submission | 1–2 days |
| 11 | Google Play Console setup + submission | 1 day |

### 4.3 Push Notifications (Phase 22 from roadmap)

The push token registration endpoint already exists at `/api/push-token`. The edge function `notify-event-update` and `notify-broadcast` are deployed. What's missing:

- **FCM credentials** (Firebase Cloud Messaging) → for Android
- **APNs credentials** (Apple Push Notification service) → for iOS

These are credentials you generate from Firebase Console (FCM) and Apple Developer Console (APNs) and add to your Supabase edge function environment variables.

### 4.4 Geolocation on Mobile

`@capacitor/geolocation` is already installed. The existing `next.config.ts` `Permissions-Policy` already includes `geolocation=(self)`. For native mobile, Capacitor handles the native permission prompt automatically — no additional code needed beyond the existing `src/lib/map/` geo utilities.

---

## PART 5 — THE API-ONLY NEXT.JS PATTERN

To formally strip Next.js down to API-only (no SSR rendering), the cleanest approach is:

### 5.1 Keep these (the backend)

```
src/app/api/          ← all API routes — KEEP ALL
src/lib/              ← all business logic — KEEP ALL
src/middleware.ts     ← auth + session enforcement — KEEP ALL
src/types/            ← TypeScript types — KEEP ALL
supabase/             ← migrations, edge functions, schema — KEEP ALL
```

### 5.2 Eventually move these (the frontend) to a separate repo or the `out/` build

```
src/app/(page files)          ← move to HTML frontend
src/components/               ← move to HTML frontend
src/hooks/                    ← move to HTML frontend (if React-based HTML)
src/app/globals.css           ← move to HTML frontend
```

> **Founder note:** There is no urgency to do this before June 9. The current architecture already works — Next.js handles both frontend and API. This split is a future optimisation for performance and mobile delivery. Do not execute before the WCI presentation.

### 5.3 The monorepo (from CITIZENS_STRATEGIC_DIRECTION_MAY2026.md)

The strategic plan already calls for a Turborepo monorepo **after** June 9. The API-only split fits naturally into that:

```
citizens/
├── apps/
│   ├── connect-web/    ← HTML/static frontend
│   ├── connect-api/    ← Next.js API routes only (current repo, stripped)
│   ├── vision/
│   └── wear/
├── packages/
│   ├── ui/
│   ├── auth/
│   ├── database/
│   └── config/
└── turbo.json
```

---

## PART 6 — IMMEDIATE ACTIONS (Priority Order)

### Before June 9 (WCI Presentation)

These do NOT require any architecture changes:

1. **Fix Vercel MapTiler env vars** — `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` (10-minute fix, highest visual impact)
2. **Polish POPUP Skills Development profile** on `citizens-connect.vercel.app`
3. **Verify all 6 seeded org profiles** look presentable
4. **Rewrite landing page copy** for NPO/ministry audience
5. **End-to-end demo walkthrough** from a phone

### After June 9 (Architecture work)

1. **Add CORS headers** to `next.config.ts` for the HTML frontend origin
2. **Build `out/` directory** — either via `next build` + static export, or copy separate HTML app
3. **Run `npm run cap:sync`** to push the built frontend into the native Android + iOS projects
4. **Test on Android device** via Android Studio
5. **Wire FCM credentials** for push notifications
6. **Test on iOS** via Xcode
7. **Wire APNs credentials**
8. **Submit to Play Store** (faster review, good to do first)
9. **Submit to App Store** (slower review, submit simultaneously)

### After Mobile Launch

1. **Monorepo migration** (Turborepo — per strategic plan, post-June 9)
2. **Citizens Vision** dedicated planning session
3. **Citizens Wear** planning session

---

## PART 7 — QUESTIONS THAT NEED FOUNDER ANSWERS

Before executing the architecture work, these questions need answers:

| # | Question | Why it matters |
|---|---|---|
| Q1 | Which HTML version — Next.js static export, or a separate HTML prototype? | Determines whether we use `next export` or copy files |
| Q2 | What is the URL of the separate HTML app (if it exists)? | Needed for CORS `Access-Control-Allow-Origin` |
| Q3 | Do you have a Firebase project set up for FCM? | Needed for Android push notifications |
| Q4 | Are you enrolled in the Apple Developer Program? | Required for iOS distribution (R1,950/yr) |
| Q5 | Is the Claude design API link for generating UI components for the HTML version? | Clarifies what the "offhand" refers to |

---

## PART 8 — WHAT THE CLAUDE API LINK IS FOR

You mentioned having a "Claude design API link ready for offhanding." This likely refers to using the Anthropic API (via Artifacts or a connected tool) to:

- **Generate UI components** for the HTML frontend (drop-in replacements for the React components)
- **Build the static HTML export** of existing Next.js pages
- **Power an in-app AI feature** (like the existing `/api/ai-search` route)

When you're ready to use it, share the link and clarify what you'd like built — whether that's converting specific React components to plain HTML/CSS/JS, building new screens, or something else.

---

## PART 9 — ARCHITECTURE DECISION RECORD

These decisions are locked for the current phase:

| # | Decision | Reasoning |
|---|---|---|
| A1 | **Keep Next.js as the API backend** | 30+ routes, Supabase SSR auth, middleware — too much to rewrite |
| A2 | **Use Capacitor (not React Native)** | Already scaffolded; wraps any HTML with zero rewrite |
| A3 | **Capacitor `webDir: "out"`** | Already set; just needs the HTML build placed there |
| A4 | **CORS before any cross-origin calls** | Credentials-based auth requires specific origin, not wildcard |
| A5 | **Mobile after WCI presentation** | Real users first, then app store submission |
| A6 | **Monorepo after June 9** | High-risk migration; wrong time before the most important presentation |
| A7 | **Vision describes in words at WCI, not demo** | Not demo-ready; one sentence beats an unfinished dashboard |

---

*Document version: 1.0 · Produced June 7, 2026*
*Source: Deep codebase scan + Claude architecture session*
*Owner: Citizens Network PBO · Stephen*
*Next review: After the Whole City Talks (June 9, 2026)*
