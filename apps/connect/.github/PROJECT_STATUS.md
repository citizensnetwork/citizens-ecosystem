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
| 10 | Smart Notifications + Calendar Sync | **Complete** | In-app notifications, push tokens, bell UI, preferences, Edge Functions, realtime |
| 11 | In-app Direct Messaging | **Complete** | Conversations, messages, inbox view, real-time chat, message organizer from events/profiles |
| — | UI Maturity Overhaul | **Complete** | Monochrome + gold design, emojis → SVGs, mature markers, 50 mock places seeded |
| — | UI Refinement Pass | **Complete** | Calendar white/grey/gold, smaller place markers, map memory, follow places, glance z-fix |
| — | Map & Brand Polish | **Complete** | Filled place icons, gold brand tag with zoom, province auto-locate, calendar mobile fix |
| — | UX Bug Fixes + Quality Hardening | **Complete** | Notification bounce, glance panel jitter, category filter zoom, 333 tests, CI pipeline, place edit/delete, admin categories |
| 12A | Security Hardening | **Complete** | CSP/HSTS/security headers, auth middleware, rate limiting, error sanitization, open redirect fix |
| 12B | Featured Panel | **Complete** | Featured listings table + API + premium social-feed panel replacing glance panel |
| 12C | Live Location Foundation | **Complete** | User locations table, location API, geolocation hook, attendee markers, privacy controls |
| — | Phase 12 Architect Review Fixes | **Complete** | UUID validation, coordinate range checks, RLS RSVP enforcement, idempotent migrations, CSP hardening |
| 11 | In-app Direct Messaging | **Complete** | Conversations, messages, inbox view, real-time chat, message organizer from events/profiles |
| — | UI Maturity Overhaul | **Complete** | Monochrome + gold design, emojis → SVGs, mature markers, 50 mock places seeded |
| — | UI Refinement Pass | **Complete** | Calendar white/grey/gold, smaller place markers, map memory, follow places, glance z-fix |
| — | Map & Brand Polish | **Complete** | Filled place icons, gold brand tag with zoom, province auto-locate, calendar mobile fix |
| — | UX Bug Fixes + Quality Hardening | **Complete** | Notification bounce, glance panel jitter, category filter zoom, 333 tests, CI pipeline, place edit/delete, admin categories |
| — | Sprint 1: Auth & Categories | **Complete** | Email verification polling, Google OAuth, 15 new event categories (migration 020) |
| 14A | Social Sharing | **Complete** | SocialShareButtons (WhatsApp, Facebook, copy-link, native share) on event detail |
| 14B | Social Profile Links | **Complete** | instagram_handle, facebook_url, tiktok_handle on profiles; SocialLinksEditor in profile |
| 15A | Map Quick-Action Popup | **Complete** | 5-button popup (View, Join, Share, Consider, Visit) on marker click |
| 15B | Consider System | **Complete** | consider RSVP status, ConsiderBadge in navbar, friend join tracking |
| 15C | Custom Map Markers | **Complete** | Profile photo markers, SVG icon picker, organiser logo, default fallback |
| 15D | Live Events | **Complete** | isToday/isInSession badges, temporal encoding, cc-marker-today CSS pulse |
| 15E | Live Location Tracking Prompt | **Complete** | LiveTrackingPrompt on event detail for RSVP'd attendees |
| 16 | Manage Events & Places | **Complete** | ManageEventsView, ManagePlacesView, manage pages, stats (attendee/consider/view counts) |
| 16B | Event Rating Rework | **Complete** | InlineEventRating component under event title (hover/click 5-star, avg display) |
| 12C-auth | Phone Auth + 2FA | **Complete** | PhoneAuthForm (OTP login), TwoFactorSetup (TOTP), Login email/phone toggle |
| 17 | Indemnity Forms | **Complete** | indemnity_templates + indemnity_signatures tables, IndemnityForm gate before event creation |

---

## Sprint 2–4: Social Sharing, Map UX, Manage, Rating, Phone Auth, Indemnity (COMPLETE)

### Phase 14A — Social Sharing (COMPLETE)
- [x] `SocialShareButtons.tsx` — WhatsApp, Facebook, copy-link, TikTok copy, native Capacitor share
- [x] Share URLs include event title + link; native share uses `@capacitor/share`
- [x] Rendered in `EventDetailContent` replacing previous `ShareButton`

### Phase 14B — Social Profile Links (COMPLETE)
- [x] Migration `021_social_profiles.sql` — `instagram_handle`, `facebook_url`, `tiktok_handle` columns on `profiles`
- [x] `SocialLinksEditor.tsx` — edit social links in profile with validation
- [x] Displayed in public profile view with brand-coloured icons

### Phase 15A — Map Quick-Action Popup (COMPLETE)
- [x] `QuickActionPopup.tsx` — 5-button popup: View Details, Join/Leave, Share, Consider, Visit
- [x] Rendered on event marker click in `EventMap.tsx` (replaces direct popup open)
- [x] Optimistic local state for Join/Consider counts
- [x] EventsView updated to receive and forward `onQuickAction` callbacks

### Phase 15B — Consider System (COMPLETE)
- [x] Migration `022_consider_system.sql` — adds `consider` RSVP status; `consider_count` column on events
- [x] `ConsiderBadge.tsx` — navbar icon showing count of events user is considering
- [x] `/api/consider` API route — toggle consider status (POST)
- [x] Friend join tracking: who's attending badge includes "considering" friends

### Phase 15C — Custom Map Markers (COMPLETE)
- [x] Migration `023_custom_markers.sql` — `marker_icon`, `marker_color` columns on events; `organiser_logo` on profiles
- [x] `createCustomMarkerEl()` in `markers.ts` — profile photo, SVG icon picker, organiser logo, default fallback
- [x] Fallback chain: profile photo → organiser logo → SVG icon → default category marker

### Phase 15D — Live Events (COMPLETE)
- [x] `isToday` and `isInSession` computed in `getTemporalStyle()` — events active today get scale 1.1
- [x] Live badge (gold pulse) + In-Session badge on event detail for live events
- [x] `cc-marker-today` CSS class in `globals.css` — animated gold ring for today's markers

### Phase 15E — Live Location Tracking Prompt (COMPLETE)
- [x] `LiveTrackingPrompt.tsx` — opt-in prompt on event detail for RSVP'd attendees (links to LocationSharingToggle)
- [x] Only shown when event is today and user has RSVP'd

### Phase 16 — Manage Events & Places (COMPLETE)
- [x] `ManageEventsView.tsx` — event dashboard with attendee/consider/view counts, expandable attendee list, edit links
- [x] `ManagePlacesView.tsx` — place dashboard with follower/rating/review stats, edit links
- [x] `/events/manage` page — auth-gated, fetches from `/api/manage/events`
- [x] `/places/manage` page — auth-gated, fetches from `/api/manage/places`
- [x] `/api/manage/events` route — returns user's events with aggregated participant counts
- [x] `/api/manage/places` route — returns user's places with follower/review stats
- [x] "Manage Events" + "Manage Places" links added to profile page (Account Settings)

### Phase 16B — Event Rating Rework (COMPLETE)
- [x] `InlineEventRating.tsx` — compact 5-star interactive rating component
- [x] Shows avg rating + total count fetched from `reviews` table
- [x] Hover/click rating submits upsert to `reviews` (event_id + user_id unique)
- [x] Rendered directly under event title in `EventDetailContent`
- [x] Disabled/read-only when not authenticated

### Phase 12C-auth — Phone Auth + 2FA (COMPLETE)
- [x] `PhoneAuthForm.tsx` — 2-step phone OTP: enter phone → verify 6-digit OTP via `signInWithOtp`/`verifyOtp`
- [x] `TwoFactorSetup.tsx` — TOTP 2FA management: enroll with QR code, verify challenge, unenroll; shows Active badge
- [x] `LoginForm.tsx` updated — email/phone toggle segment; phone mode renders `PhoneAuthForm`
- [x] `profile/page.tsx` updated — `TwoFactorSetup` section in Account Settings (below ProfileEditor)

### Phase 17 — Indemnity Forms (COMPLETE)
- [x] Migration `024_indemnity_forms.sql` — `indemnity_templates` + `indemnity_signatures` tables
- [x] RLS: anyone reads templates; users insert own signatures; admins manage all
- [x] 2 seed templates: `organiser-event-liability` (required, events) + `attendee-participation-waiver` (not required)
- [x] `IndemnityTemplate` + `IndemnitySignature` types added to `db.ts`
- [x] `/api/indemnity` route — GET templates + user signatures + `allSigned` flag; POST sign with IP audit trail
- [x] `IndemnityForm.tsx` — sequential multi-template form: legal text, full name field, agree checkbox
- [x] `EventFormWithIndemnity.tsx` — wrapper: shows IndemnityForm gate, then EventForm after all signed
- [x] `/events/new` updated to render `EventFormWithIndemnity`

### Build & Test Verification
- [x] `npx tsc --noEmit` — 0 errors (3 type assertion fixes applied)
- [x] `next build` — all routes compiled, new routes `/events/manage`, `/places/manage` included
- [x] `npx vitest run` — **335 tests, 37 files, 0 failures** ✅

---

## Phase 12: Security + Featured + Live Location (COMPLETE)

### Phase 12A: Security Hardening
- [x] Security headers: CSP, HSTS (2yr + preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/mic denied, geolocation self)
- [x] `poweredByHeader: false` — removed Next.js server fingerprint
- [x] CSP: `unsafe-eval` removed from production (only `unsafe-inline` for Next.js requirements)
- [x] Open redirect fix: `/auth/callback` validates `next` param starts with `/` and not `//`
- [x] Auth enforcement middleware: protected routes (`/profile`, `/events/new`, `/messages`, `/admin`) redirect unauthenticated users to `/login?redirect=...`
- [x] In-memory sliding-window rate limiter (`src/lib/rate-limit.ts`) with pre-configured limits (mutation/message/auth/heavy)
- [x] Rate limiting on: follow, rsvp, conversations, messages, push-token, place-follow, location, featured POST/DELETE
- [x] All 22 error message leaks fixed across 9 API routes — generic client messages + `console.error` server-side logging
- [x] Retry-After header on all 429 responses

### Phase 12B: Featured Panel
- [x] `featured_listings` table (migration 018): polymorphic event/place references, priority, lifecycle dates, admin-only RLS
- [x] `/api/featured` route: public GET (explicit column selection), admin-only POST/DELETE with UUID validation and rate limiting
- [x] `FeaturedPanel.tsx`: premium social-feed panel with hero carousel, upcoming RSVP'd events, featured grid cards
- [x] Replaced "Events at a Glance" glance panel in EventsView — renamed all state from `glanceOpen` to `featuredOpen`
- [x] Gold accent styling, gradient overlays, smooth slide animation

### Phase 12C: Live Location Foundation
- [x] `user_locations` table (migration 019): user/event location records with RSVP-enforced RLS INSERT/UPDATE policies
- [x] `location_sharing` column on profiles (default `false`)
- [x] `/api/location` route: POST (rate-limited, UUID-validated, coordinate-range-checked, precision-truncated to 4dp ~11m), GET (rate-limited, UUID-validated), DELETE (UUID-validated)
- [x] `useLocationTracking` hook: Capacitor geolocation + browser fallback, 15s min interval, stops polling on error
- [x] `LocationSharingToggle` component: opt-in toggle on event detail pages for RSVP'd users
- [x] `AttendeeMarkers` component: gold-bordered profile photo markers on MapLibre map, 15s refresh
- [x] Integrated into MiniMap and EventDetailContent

### Phase 12 Architect Review Fixes
- [x] Added UUID validation to all location API handlers
- [x] Added coordinate range validation (-90/90, -180/180) to location POST
- [x] Removed `unsafe-eval` from CSP production policy
- [x] Added POST/DELETE handlers to featured API (was GET-only)
- [x] Made all RLS policies idempotent (DO $$ IF NOT EXISTS pattern) in migrations 018 and 019
- [x] RLS INSERT/UPDATE on user_locations now requires RSVP check (prevents Supabase client bypass)
- [x] Added rate limiting to place-follow and location GET routes
- [x] Added Retry-After header to all 429 responses
- [x] Renamed `glanceOpen` → `featuredOpen` throughout EventsView
- [x] Coordinate precision truncated to 4 decimal places (~11m) for privacy
- [x] Minimum 15s tracking interval enforced in useLocationTracking hook
- [x] Hook stops polling on error (clears interval instead of infinite retry)
- [x] Hook sends accuracy field with location updates
- [x] Added console.error to place-follow error paths
- [x] Featured GET uses explicit column selection (no wildcard data leakage)
- [x] All SE agent reviews passed (Architect B+→A-, Security clear after fixes)
- [x] 323 tests passing across 36 test files, zero failures

---

## UX Bug Fixes + Quality Hardening (COMPLETE)

### Delivered
- [x] Notification bell: removed scale/brightness bounce from wrapper div — only button animates, added active:scale-95 to bell `<button>`
- [x] Glance sidebar: removed active:scale-95 from edge tab (caused map/panel shift), replaced with transition-colors + active:bg-black/5
- [x] Category filter: map no longer zooms out on filter change — `hasRestoredView` stays true after initial fitBounds
- [x] GitHub Actions CI pipeline: typecheck + lint + test + build on push/PR to main
- [x] Place edit/delete: `/places/[id]/edit` page with EditPlaceForm, owner/admin gated, 6-month deletion rule
- [x] Admin category management: `/admin/categories` page with CategoryManager (add, edit, delete, reorder)
- [x] Admin link in BurgerMenu (visible only to admin role)
- [x] Edit Place button on place detail page (visible to owner or admin)
- [x] Test coverage expanded: 204 → 333 tests across 37 files (11 new test files)
  - Pure function tests: validation.ts (12), calendar.ts (13), map/config.ts (6)
  - API route tests: follow (14), onboarding (18), notifications (16+8), push-token (15), conversations (10+13+4)
  - Supabase mock helpers extended: upsert, neq, in, lt, gt, limit chains
- [x] All SE agents reviewed and approved (Architecture A, Security clear, DevOps clear, RAI pass, UX pass, Product pass)
- [x] Vision alignment assessment: A- grade (scaffold agent analysis)

---

## Map & Brand Polish (COMPLETE)

### Delivered
- [x] Place map markers: filled black (#111) with gold (#D4AF37) strokes, size 28→36px (near event size)
- [x] "Citizens Connect" floating tag: always gold text, active:scale-95 + brightness-90 press animation
- [x] Brand click → flyTo all of South Africa (center [-28.7, 25.5], zoom 5.5) from map or calendar view
- [x] Navbar "Citizens Connect" link: always gold, same press animation
- [x] Auto-locate zoom: province-level (zoom 8) instead of city-level (zoom 14)
- [x] EventMap: `flyToZoom` prop for dynamic zoom on flyTo
- [x] Calendar mobile: increased top padding (pt-28 mobile, pt-24 desktop) to clear floating controls
- [x] Realtime publication enabled on `notifications` and `messages` tables

---

## UI Refinement Pass (COMPLETE)

### Delivered
- [x] Calendar colors: `CATEGORY_COLORS` changed from monochrome dark to alternating white/grey palette (#d4d4d4–#f5f5f5)
- [x] RSVP-aware calendar: gold (#D4AF37) background for RSVP'd events, white/grey for un-RSVP'd
- [x] EventsView fetches user RSVPs and passes `rsvpEventIds` set to EventCalendar
- [x] Event map markers: enlarged 36→40px, icon color changed gold→black (#111), border changed black→gold (#D4AF37)
- [x] Place map markers: shrunk 34→28px, removed all background/bubble, bare gold SVG icon with drop-shadow
- [x] Burger menu section icons colored gold (`text-(--gold)`)
- [x] Map viewpoint persistence via sessionStorage (`cc-map-viewpoint` key) — restores center+zoom on remount
- [x] `place_follows` table + RLS (migration 017), `/api/place-follow` route (POST/DELETE), `FollowPlaceButton` component
- [x] Website URLs added to all 50 seeded places (migration 017)
- [x] Place detail page: FollowPlaceButton + dedicated website card + remaining emojis removed
- [x] Events at a Glance panel z-index raised (button z-1005, panel z-1004, above detail panel z-1004→z-1003 area)
- [x] All 190 tests passing (24 files)
- [x] Clean production build verified

---

## UI Maturity Overhaul (COMPLETE)

### Delivered
- [x] All emojis removed from UI — replaced with inline SVGs or Unicode glyphs
- [x] `CATEGORY_COLORS` changed from rainbow to monochrome dark palette (#111111–#6b7280)
- [x] `CATEGORY_LABELS` stripped of emoji prefixes (clean text only)
- [x] Event map markers redesigned: gold (#D4AF37) SVG icon, white circle, 2px black (#111) outline
- [x] Place map markers redesigned: black (#111) SVG icon, gold (#D4AF37) rounded-square, 2px black outline
- [x] Cluster badges: black circle with gold border and text
- [x] Calendar event blocks: monochrome backgrounds with gold left border accent
- [x] Burger menu section icons: folder, chart, star, users (inline SVGs)
- [x] AccordionSection icon prop: `string` → `React.ReactNode` for SVG support
- [x] Burger menu separators: thin black lines (`border-black/[.12]`)
- [x] Map/calendar toggle: SVG icons replacing 📅/🗺 emojis
- [x] EventDetailContent: 8 emoji instances → SVGs (calendar, location, attendees, globe, phone, email)
- [x] NotificationPanel: emoji type icons → Unicode glyphs (●, ◆, ✕, ○, ▸)
- [x] EditEventForm, PlaceForm, EventForm, OnboardingWizard, ProfileInterests: emoji cleanup
- [x] EventMap: place popup rating emoji removed
- [x] 50 mock places seeded via migration 016 (25 Gauteng, 13 Eastern Cape, 12 Western Cape)
- [x] All 190 tests updated and passing (24 files)
- [x] Clean build verified (0 warnings)

---

## Phase 11 — In-app Direct Messaging (COMPLETE)

### Delivered
- [x] Migration 014_direct_messages.sql — `conversations`, `conversation_participants`, `messages` tables
- [x] RLS policies: participants-only access, auth-gated creation, self-only read status updates
- [x] Indexes on messages (conversation+created, sender) and participants (user)
- [x] `find_conversation(user_a, user_b)` helper function — prevents duplicate conversations
- [x] Auto-update `conversations.updated_at` trigger on new message
- [x] Conversations API (`GET/POST /api/conversations`) — list inbox, create/find conversation
- [x] Messages API (`GET/POST /api/conversations/[id]/messages`) — paginated fetch, send message
- [x] Read status API (`PATCH /api/conversations/[id]/read`) — mark conversation as read
- [x] `ConversationList` component — inbox with unread badges, last message preview, timeAgo, realtime updates
- [x] `ChatView` component — full chat UI with date separators, auto-scroll, load older messages, realtime subscription
- [x] `MessageButton` component — "Message" button + icon variant for profiles and event details
- [x] `/messages` page — authenticated inbox view
- [x] `/messages/[id]` page — individual conversation chat view
- [x] Messages icon in Navbar (chat bubble icon linking to /messages)
- [x] "Message Organizer" button on event detail page (visible to non-creators)
- [x] Message icon on public profiles (next to Follow button)
- [x] Loading skeleton for messages page
- [x] TypeScript types: `Conversation`, `ConversationParticipant`, `Message`, `ConversationPreview`
- [x] `NotificationType` extended with `new_message`

### Data Seeding
- [x] 50 randomized published events seeded across South Africa
  - 30 events in Gauteng (Pretoria, Johannesburg, Soweto, Centurion, Midrand, Sandton, Fourways, Roodepoort, etc.)
  - 10 events in Eastern Cape (Gqeberha, East London, Mthatha, Makhanda)
  - 10 events in Western Cape (Cape Town, Stellenbosch, Paarl, Khayelitsha, Somerset West, Bellville)
- [x] Events span April–June 2026 with varied categories, times, capacities and contact info
- [x] Event interest tags auto-applied based on category mapping

---

## Phase 10 — Smart Notifications + Calendar Sync (COMPLETE)

### Delivered
- [x] Migration 013_notifications.sql — `push_tokens`, `notifications` tables, `notification_digest` column on profiles
- [x] RLS policies: users own their tokens and notifications; admin can insert notifications
- [x] Indexes on notifications (user+created, unread) and push_tokens (user)
- [x] Push token API (`POST/DELETE /api/push-token`) — register/remove device tokens
- [x] Notifications API (`GET/PATCH/DELETE /api/notifications`) — fetch, mark read, delete
- [x] Notification preferences API (`PATCH /api/notifications/preferences`) — update digest frequency
- [x] `usePushNotifications` hook — Capacitor push registration, foreground listener, notification tap handler
- [x] `NotificationBell` component — bell icon with unread badge, realtime subscription
- [x] `NotificationPanel` component — rich notification cards with type icons, time ago, mark read, delete, links
- [x] `NotificationPreferences` component — instant / daily / off radio selector
- [x] Bell integrated into Navbar (all non-events pages) + floating controls on /events map page
- [x] Profile page: notification preferences section with digest frequency selector
- [x] TypeScript types: `Notification`, `PushTokenRecord`, `NotificationDigest`, `NotificationType`
- [x] Edge Functions scaffolded:
  - `_shared/push.ts` — shared push delivery utility (FCM + in-app insert)
  - `notify-interested-users` — interest + location match on new event publish
  - `notify-event-cancelled` — notifies RSVPed users on cancellation
  - `send-rsvp-reminders` — daily cron for events within 24 hours
  - `notify-new-follower` — follow notification
  - `send-daily-digest` — batched daily summary for digest-mode users
- [x] Calendar sync (from Phase 7): Google Calendar URL + .ics download already complete

### Edge Function Deployment Notes
Edge Functions are scaffolded but require Supabase deployment + DB webhook configuration:
- `notify-interested-users`: DB webhook on `events` INSERT WHERE status='published'
- `notify-event-cancelled`: DB webhook on `events` UPDATE WHERE status='cancelled'
- `send-rsvp-reminders`: pg_cron daily at 8 AM
- `notify-new-follower`: DB webhook on `follows` INSERT
- `send-daily-digest`: pg_cron daily at 7 AM
- `FCM_SERVICE_ACCOUNT_JSON` env var required for push delivery (FCM HTTP v1 API with OAuth2)
- In-app notifications work without FCM credentials (graceful degradation)
- Realtime publication enabled on `notifications` and `messages` tables (via `ALTER PUBLICATION supabase_realtime`)

### Architect Audit Fixes (Phase 10)
- [x] FCM legacy API → v1 HTTP API with RSA-SHA256 OAuth2 JWT assertion
- [x] `sendNotifications()` accepts Supabase client parameter (no duplicate clients)
- [x] Push token length validation (max 500 chars)
- [x] Stale closure fix in `usePushNotifications` (useRef pattern)
- [x] N+1 query fix in `send-rsvp-reminders` (batch RSVP fetch)
- [x] N+1 query fix in `send-daily-digest` (batch user_interests + event_interest_tags)
- [x] Shared haversine utility (`_shared/geo.ts`) — eliminates duplication
- [x] NotificationPanel: z-[9999], role=dialog, focus trap, Escape key handler
- [x] Floating bell padding fix in EventsView
- [x] `makeProfile()` test fixture: added `notification_digest` field
- [x] `deno.json` created for Edge Functions (import map + compiler options)
- [x] Stale token auto-cleanup on FCM UNREGISTERED response

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

## Phase 1 — Data Foundation (COMPLETE)

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
- [x] Category management UI (admin)
- [x] Place edit/delete functionality
- [ ] Migrate events from hardcoded categories to category_id FK (optional phase)
- [ ] Expanded roles: individual, ministry, organization, business
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
| Maps | MapLibre GL JS | 5.x |
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
| InviteFlow Architect | `invite-flow.agent.md` | Edit-capable | **Live** |
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
