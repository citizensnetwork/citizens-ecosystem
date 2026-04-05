# Citizens Connect — Project Status

> Living document. Update after completing each phase or major milestone.

## Phase Overview

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Data Foundation | **Complete** | categories, places, reviews DB + places CRUD + map integration |
| 2 | App Shell | Complete | Full-screen dual-view (map + calendar), floating controls, filter drawer |
| 3 | Full-Screen Map | **Complete** | Category markers, temporal encoding, clustering, geolocation, detail panel |
| 4 | Calendar | **Complete** | FullCalendar with day/week/month, category colors, detail panel, vendor quick-create |
| 5 | Reviews & Verification | **Complete** | Unified reviews (places+events), community verification signals, admin role, share |
| 6 | Capacitor Mobile | **Complete** | iOS/Android wrapper, native plugins, single codebase |

---

## Phase 3 — Full-Screen Map (COMPLETE)

### Delivered
- [x] Full-viewport map with OpenStreetMap tiles (Durban center default)
- [x] Category-specific colored emoji markers (8 categories)
- [x] Temporal visual encoding (opacity + scale based on event proximity)
- [x] Live event pulsing gold animation
- [x] Marker clustering with gold cluster badges
- [x] Geolocation "center on me" button
- [x] Right-side event detail slide-out panel
- [x] XSS-safe popup HTML with `escapeHtml()`
- [x] Floating search bar, title chip, burger filter, calendar toggle
- [x] Left-side filter drawer with categories + event count

### Deferred to Phase 1
- [ ] Places CRUD (needs `places` table first)
- [ ] Category-driven markers for places vs events

---

## Phase 4 — Calendar (COMPLETE)

### Delivered
- [x] Replace custom month grid with FullCalendar library
- [x] Day / week / month views with toolbar switching
- [x] Category-colored event blocks (matching map marker colors)
- [x] Click event → opens same detail panel as map view
- [x] Vendor date-click → quick-create (navigates to /events/new?date=)
- [x] Gold/white/black CSS overrides matching UI system
- [x] Today highlight with gold badge
- [x] Mobile-responsive toolbar (stacks vertically on small screens)
- [x] Now indicator in week/day time grid views
- [x] "+more" link when day overflows (max 3 visible)

### Deferred
- [ ] Personal events (private, user-only) — needs schema change (visibility column)
- [ ] Sync with map view (clicking calendar event centers map) — needs shared state refactor

---

## Phase 1 — Data Foundation (IN PROGRESS)

### Delivered
- [x] Supabase local environment configured (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`)
- [x] Conversation-safe continuity assets added (`.github/AGENTS.md`, continuity prompt, continuity agent)
- [x] Supabase production schema synchronized with data foundation migration (comments, categories, places, reviews)
- [x] MCP-first migration workflow prompt added for no-CLI schema changes (`apply-supabase-migration.prompt.md`)
- [x] Supabase reconnect runbook + reusable reconnect prompt added (`SUPABASE_RECOVERY.md`, `reconnect-supabase.prompt.md`)
- [x] `comments` table + RLS policies (was missing from schema)
- [x] `image_url` column on events (was missing from schema)
- [x] `categories` table — DB-driven with slug, emoji, color, applies_to, sort_order
- [x] Default category seed data (8 categories matching existing system)
- [x] `places` table — permanent map listings with category FK, lat/lng, phone, website, verified flag
- [x] `reviews` table — 1-5 star rating, body, still_exists signal, unique per user+place
- [x] RLS policies for all new tables
- [x] Migration 003_data_foundation.sql (idempotent)
- [x] TypeScript types: Category, Place, Review in db.ts
- [x] Fixed corrupted next.config.ts
- [x] Restored EventMap.tsx — clustering, category markers, temporal encoding, geolocation, onSelectEvent
- [x] Restored EventsView.tsx — detail panel, onSelectEvent wiring to map + calendar
- [x] Places on map — square-icon markers with category emoji/color, clustering, detail panel
- [x] Place search — places filtered by search bar alongside events
- [x] PlaceForm component — name, description, address, category (DB-driven), image, phone, website, LocationPicker (required)
- [x] /places/new page — authenticated users can add places, categories fetched from DB
- [x] /places/[id] page — place detail with info, category badge, average rating, reviews list
- [x] "Add Place" button in filter drawer (available to all authenticated users)
- [x] createPlaceIcon + escapeHtml added to markers.ts
- [x] Marker CSS animations (live pulse, cluster gold overrides) in globals.css
- [x] Events page fetches places in parallel (Promise.all)

### Remaining
- [ ] Category management UI (admin)
- [ ] Migrate events from hardcoded categories to category_id FK (optional phase)
- [ ] Expanded roles: individual, ministry, organization, business
- [ ] Place edit/delete functionality
- [ ] Image storage bucket for places (currently shares event-images)

---

## Phase 5 — Reviews & Verification (COMPLETE)

### Delivered
- [x] Unified review system for both places and events (ReviewCard, ReviewForm, ReviewList)
- [x] Star rating (1-5) with optional comment
- [x] "Does this place still exist?" checkbox on place reviews
- [x] Auto-flag places after 3+ negative "still exists" signals (DB trigger)
- [x] Post-event attendance prompt (PostEventPrompt banner in calendar view)
- [x] Aggregate ratings displayed on map markers (badge + gold glow for high-rated)
- [x] Flagged/possibly-closed places shown with warning badge + dimmed markers
- [x] Share button (native share dialog or clipboard copy) on events and places
- [x] Admin role added to profiles (vendor/client/admin)
- [x] RLS policies tightened: owner-only mutations with admin override
- [x] Migration 004: reviews expansion + community verification signals
- [x] Migration 005: admin role + tightened RLS policies

### Removed
- Annual email verification edge function (cost concern with growing user base)
- Email-lifecycle columns (verified_at, verification_requested_at, verification_due_at)

### Security hardening
- Events/places update+delete: `auth.uid() = created_by OR is_admin()`
- Reviews/comments update+delete: `auth.uid() = user_id OR is_admin()`
- `is_admin()` SQL function (security definer) for clean policy checks

---

## Phase 6 — Capacitor Mobile (COMPLETE)

### Delivered
- [x] Capacitor 8 wrapper with iOS + Android native projects
- [x] Server-based architecture (native shell loads Next.js SSR app via URL)
- [x] Fallback `out/index.html` for Capacitor webDir requirement
- [x] Native geolocation — `@capacitor/geolocation` integrated into EventMap via `lib/capacitor/geolocation.ts`
- [x] Native share — `@capacitor/share` integrated into ShareButton via `lib/capacitor/share.ts`
- [x] Push notifications — `@capacitor/push-notifications` with `lib/capacitor/push.ts` wrapper (register, receive, action)
- [x] StatusBar + SplashScreen — native initialization on app launch via `CapacitorInit` component
- [x] Platform detection — `lib/capacitor/platform.ts` (isNative, getPlatform)
- [x] Safe-area insets — `viewport-fit=cover` + CSS `env(safe-area-inset-*)` padding
- [x] Android permissions — `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `INTERNET`
- [x] iOS permissions — `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`
- [x] npm scripts — `cap:sync`, `cap:open:*`, `cap:run:*`, `mobile:build`
- [x] 5 Capacitor plugins synced to both platforms (geolocation, push, share, splash-screen, status-bar)
- [x] Build verified — compiles successfully with all Capacitor integrations
- [x] Deep linking — Android intent filters (https + custom scheme) + iOS URL scheme configured
- [x] PWA manifest — `public/manifest.json` with app metadata, theme color, icon references
- [x] SVG app icon template at `public/icons/icon.svg` (gold cross + community motif)
- [x] Fixed `.env.local` key name mismatch (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### Not included (future considerations)
- [ ] App store listing assets (final branded icons, screenshots, descriptions)
- [ ] Firebase/APNs configuration for push notification delivery
- [ ] Universal Links verification file (`.well-known/apple-app-site-association` + `assetlinks.json` on deployed domain)
- [ ] Offline support / service worker

---

## Current Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.5.14 |
| Language | TypeScript | 5.x |
| UI | React | 18.x |
| Styling | Tailwind CSS | v4 |
| Backend | Supabase (Auth + Postgres + Storage) | Latest |
| Maps | Leaflet (raw API) + leaflet.markercluster | 1.9.4 |
| Mobile (planned) | Capacitor | TBD |

## Database Tables

| Table | Status | Description |
|-------|--------|-------------|
| profiles | Live | User profiles (vendor/client/admin roles) |
| events | Live | Time-bound events with lat/lng, category, image |
| rsvps | Live | User RSVP to events (unique constraint) |
| comments | Live | Comments on events with profile join |
| categories | **Live** | DB-driven category definitions with emoji, color, sort |
| places | **Live** | Permanent map listings (churches, shops, ministries) |
| reviews | **Live** | Ratings and still-exists signals for places AND events |
