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
| 7 | Event Enrichment & Discovery | **Complete** | End time, contact info, capacity, status, feed view, OG meta, city search, view tracking |
| 8 | Social Graph | **Complete** | Follows, friends, public profiles, follow button, who's attending with friend badges |
| 9 | Interest Profile & Onboarding | **Complete** | Interest tables, onboarding wizard, location/radius, event tags, profile interests |
| 8.5 | Role Refactor & UX Polish | **Complete** | Community Citizen rename, all-user event creation, vendor place booking, nav fixes, cancel/unsaved guard, performance indexes, accessibility |
| — | Architect Audit Fixes (P8–9) | **Complete** | All 10 fixes applied. RLS, API error handling, a11y, TW v4, query optimization |

---

## Phase 8.5 — Role Refactor & UX Polish (COMPLETE)

### Delivered
- [x] "Community Member" renamed to "Community Citizen" across all UI (signup, profile, reviews)
- [x] Event creation open to ALL logged-in users (vendor gate removed from `/events/new`)
- [x] Vendors get extra "Book at Place" section in EventForm (inline place creation)
- [x] "Add Place" button removed from BurgerMenu (place creation only via vendor event booking)
- [x] Places cannot be removed within 6 months (admin-only, noted in UI)
- [x] Navbar: "Citizens Connect" → `/events` (map home); "Events" → `/events?view=calendar`
- [x] EventsView reads `?view=calendar` query param for initial view
- [x] Cancel button + `beforeunload` unsaved changes guard ("Booking in progress, cancel editing?")
- [x] Map autoLocate no longer overrides event bounds (extends bounds instead)
- [x] Place form: custom category text input for "other" + reverse geocode address auto-populate
- [x] Performance: 7 DB indexes, `trending_events` RPC, `safe_rsvp` RPC (migration 009)
- [x] BurgerMenu extracted from EventsView (413→378 lines), AccordionSection with scrollHeight
- [x] Focus trap + Escape key for drawers, ARIA attributes
- [x] ProfileEditor component (avatar upload, name edit, password change)
- [x] `isVendor` prop removed from BurgerMenu (no longer needed)

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

## Phase 7 — Event Enrichment, Lifecycle & Discovery Surface (COMPLETE)

### Delivered
- [x] Migration 006_event_enrichment — end_time, website_url, contact_email, contact_phone, max_attendees, status, attendees_visible columns + event_photos + event_views tables
- [x] EventForm + EditEventForm — end time, website, contact, max attendees, status, attendees_visible, cancel event
- [x] EventDetailContent — end time display, contact info grid, capacity indicator ("X/Y attending", "Sold Out"), cancelled/draft banners
- [x] RSVP API hardening — status check, capacity check, 409 "Event full"
- [x] View tracking API — /api/events/[id]/view, fire-and-forget on detail mount
- [x] OG Meta Tags — generateMetadata() with Open Graph + Twitter Card, structured data
- [x] Feed View — EventFeed.tsx, three-way toggle (Map/Calendar/Feed), date/distance sort
- [x] Map city search — Nominatim geocoding in search bar, pan + zoom
- [x] Calendar buttons — "Add to Google Calendar" + "Download .ics" after RSVPing
- [x] iCal API — GET /api/events/[id]/ical generates ICS file

### Deferred
- [ ] EventPhotoGallery (multi-photo rendering component)
- [ ] VendorAnalytics (creator-only views/RSVP/comment counts)
- [ ] Multi-photo upload in EventForm

---

## Phase 8 — Social Graph (COMPLETE)

### Delivered
- [x] Migration 007_social_graph — follows table with self-follow CHECK, unique constraint, indexes, RLS
- [x] Follow API route — POST (follow) + DELETE (unfollow) with auth, duplicate handling, self-follow prevention
- [x] FollowButton component — Follow/Following/Friends states, login redirect for unauthenticated
- [x] Public profile page (/profile/[id]) — name, role, followers/following/mutual counts, friend badge, organiser events, follow button
- [x] Own profile page updated — followers, following, friends counts displayed
- [x] WhoIsAttending component — attendee list with privacy levels (public/authenticated/count_only), friends highlighted with gold badge, profile links
- [x] Event detail page wired — server-side attendee fetching with friend detection via bidirectional follow cross-reference

### Deferred
- [ ] Followers/following list pages (clickable counts)
- [ ] Mutual friends list on public profiles

---

## Phase 9 — Interest Profile & Location-Aware Onboarding (COMPLETE)

### Delivered
- [x] Migration 011_interest_profile — interest_groups, interests, user_interests, event_interest_tags tables + profile columns (onboarding_completed, notification_email, home_latitude, home_longitude, notification_radius_km)
- [x] ~56 interests seeded across 5 groups: Events I Enjoy (12), Spiritual Goals (10), Industry / Profession (14), Hobbies & Passions (13), Stage of Life (7)
- [x] RLS policies on all interest tables (public select; user manages own interests; event creator manages event tags)
- [x] Onboarding API route (POST /api/onboarding) — saves interests, location, radius, notification email with full validation
- [x] OnboardingWizard component — single-page with collapsible interest group sections, GPS + city search location, radius slider (10–200 km), notification email, edit mode
- [x] OnboardingOverlay — full-screen overlay after first login when !onboarding_completed
- [x] Events page integration — checks onboarding_completed, renders overlay for new users
- [x] ProfileInterests component — shows selected interests grouped with emoji pills, location/radius display, "Edit interests" re-opens wizard
- [x] Profile page updated — fetches interest groups, user interests, and renders ProfileInterests section
- [x] EventForm + EditEventForm — searchable interest tag selector, saves event_interest_tags on create/edit
- [x] TypeScript types updated — InterestGroup, Interest, InterestGroupWithItems, UserInterest, EventInterestTag; Profile extended
- [x] Canonical schema.sql updated to reflect migration 011
- [x] Build verified — clean compilation, no errors

### Deferred
- [ ] Progressive profiling fallback (subtle re-prompt after first RSVP if skipped)

---

## Architect Audit Fixes (COMPLETE)

> Applied after Phase 6-8 architect review. 4 critical, 6 warnings, 5 recommendations evaluated.

### Delivered
- [x] UUID validation helper (`src/lib/validation.ts`) — regex-based `isValidUUID()`
- [x] Follow API + RSVP API input validation with `isValidUUID()`
- [x] Events listing filters draft/cancelled events (`.eq("status", "published")`)
- [x] iCal route rejects non-published events with 404
- [x] Push notification listeners return `PluginListenerHandle` for cleanup
- [x] OG type changed from "website" to "article" on event detail pages
- [x] Supabase client lazy initialization in EventsView (avoids duplicate client per render)
- [x] Default map center changed from Durban to Pretoria `[-25.7479, 28.2293]`

### Deferred
- [ ] RSVP capacity race condition RPC (needs DB migration for `rsvp_with_capacity_check` function)
- [ ] Friend count RPC (sequential waterfall → single query optimization)

---

## Auth & Deployment Fixes (COMPLETE)

### Delivered
- [x] Vercel env vars configured (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — were missing, causing "Failed to fetch" on login/signup
- [x] Vercel CLI installed + project linked (`vercel link`)
- [x] Production redeployment with correct env vars verified
- [x] Auth callback route (`/auth/callback`) — PKCE code exchange for email links
- [x] Forgot password page (`/login/forgot-password`) — email input → `resetPasswordForEmail()`
- [x] Reset password page (`/login/reset-password`) — new password form → `updateUser()`
- [x] "Forgot password?" link added to login form

### Required (manual)
- [ ] Supabase Dashboard → Authentication → URL Configuration: set Site URL to `https://citizens-connect.vercel.app` and add `https://citizens-connect.vercel.app/auth/callback` to Redirect URLs

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
| Mobile | Capacitor | 8.x |
| Testing | Vitest + Testing Library | 4.x |
| Deployment | Vercel (auto-deploy from GitHub) | — |

## Agent System

| Agent | File | Type | Status |
|-------|------|------|--------|
| Architect | `architect.agent.md` | Read-only reviewer | **Live** |
| Testing | `testing.agent.md` | Edit-capable | **Live** |
| Refactor | `refactor.agent.md` | Edit-capable | **Live** |
| Data | `data.agent.md` | Edit-capable | **Live** |
| Community | `community.agent.md` | Edit-capable | **Live** |
| Notification | `notification.agent.md` | Edit-capable | **Live** |
| Product Lead | `product-lead.agent.md` | Edit-capable | **Live** |
| UI | `ui.agent.md` | Edit-capable | Live (pre-existing) |
| UI Consistency Review | `ui-consistency-review.agent.md` | Read-only auditor | Live (pre-existing) |
| Schema Architect | `schema-architect.agent.md` | Read-only advisor | Live (pre-existing) |
| Continuity Manager | `continuity-manager.agent.md` | Edit-capable | Live (pre-existing) |
| Operations | — | Deferred | Create at 100 users |

See `.github/AGENTS.md` for full registry, invocation guide, and multi-agent workflows.

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
| follows | **Live** | Social graph — A follows B, bidirectional = friends |
| event_photos | **Live** | Multi-photo support for events |
| event_views | **Live** | View tracking for event analytics |
