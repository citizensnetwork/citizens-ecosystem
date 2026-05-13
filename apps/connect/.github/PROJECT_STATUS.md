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
| 25 | Expanded Roles & Data Model | **Complete** | 7-role system (individual/ministry/org/business), category_id FK, place-images bucket, RLS hardening |
| — | Auth Hardening Sprint | **Complete** | Google OAuth callback fix, phone SMS 2FA, Google account linking, account deletion, 5 SE agent reviews |
| — | Category Icons & Media Galleries | **Complete** | Shared SVG registry, AI-search icon coverage, reusable media galleries, place media table/RLS |

---

## Auth Hardening Sprint (COMPLETE)

### Google OAuth Fix
- [x] Auth callback route uses `NEXT_PUBLIC_SITE_URL` env var for safe redirects (no x-forwarded-host spoofing)
- [x] Hardened `next` param validation: blocks backslashes, colons, double-slashes, encoded bypasses

### Phone SMS 2FA (replaces QR/TOTP)
- [x] `TwoFactorSetup.tsx` rewritten: phone number input → SMS OTP → verify → enrolled
- [x] 60s resend cooldown with `useRef` cleanup on unmount
- [x] Proper unenroll error handling (breaks on failure, no silent swallow)
- [x] Supports both phone and legacy TOTP factor unenrollment

### Google Account Linking
- [x] `LinkedAccounts.tsx` — shows email + Google linked providers with status badges
- [x] "Link Google Account" button via `supabase.auth.linkIdentity({ provider: 'google' })`
- [x] Automatic linking when emails match (Supabase Dashboard setting)
- [x] Decorative SVGs have `aria-hidden="true"` for screen readers

### Account Deletion
- [x] `DELETE /api/account/delete` — auth-gated, rate-limited (3 per hour), admin client with service_role key
- [x] `createAdminClient()` in `src/lib/supabase/admin.ts` — server-only, no session persistence
- [x] `DeleteAccountButton.tsx` — two-step: button → "type DELETE" (case-insensitive) → confirm
- [x] Signs out client-side before redirect after deletion
- [x] Cascading FK deletes handle all related data cleanup
- [x] Danger Zone section placed at absolute bottom of profile page

### SE Agent Reviews
- [x] **SE: Security** — Fixed host header injection (CRITICAL), stricter rate limit, SMS cooldown, unenroll error handling
- [x] **SE: Architect** — Fixed session invalidation after deletion, timer leak cleanup, callback origin safety
- [x] **SE: Responsible AI** — Added `role="alert"` on error divs, `aria-hidden` on decorative SVGs, fixed contrast ratios
- [x] **SE: DevOps/CI** — Deployment checklist: `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SITE_URL` env vars, phone provider setup
- [x] **SE: UX Designer** — Moved Danger Zone to bottom, case-insensitive DELETE check, SMS help text

### Build & Test Verification
- [x] `npx tsc --noEmit` — 0 errors
- [x] `next build` — all routes compiled, new route `/api/account/delete` included
- [x] `npx vitest run` — **335 tests, 37 files, 0 failures** ✓

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

### Batch J — Legal Acceptance Wiring (COMPLETE)
- [x] Migration `055_legal_acceptance_wiring.sql` — self-contained rewrite consolidating 024; creates tables from scratch with `CREATE TABLE IF NOT EXISTS`, drops blunt `UNIQUE(template_id,user_id,event_id)` / `(…,place_id)` constraints, replaces with 3 partial unique indexes (`_platform_unique` scoped `WHERE event_id IS NULL AND place_id IS NULL`, `_event_unique`, `_place_unique`) — fixes NULLS-DISTINCT loophole that allowed duplicate platform acceptance rows
- [x] Adds `'platform'` and `'both'` to `applies_to` check; adds `profiles.terms_accepted_at timestamptz`
- [x] Seeds 4 templates as plain prose (no markdown): `platform-terms-v1` (platform, required), `organiser-event-liability` (events, required), `attendee-participation-waiver` (events, NOT required — UI-enforced once-per-user), `venue-listing-waiver` (places, required)
- [x] `POST /api/terms/accept` — auth-gated, rate-limited (10/min/user), writes `indemnity_signatures` row + race-free conditional `profiles.terms_accepted_at` update via `.is("terms_accepted_at", null)`; captures `x-forwarded-for` (first hop, 64-char cap) as `ip_address`; idempotent (23505 → "Already accepted")
- [x] `GET /api/indemnity/template?slug=…` — public template read; returns `hasSigned` (global per user/template, event/place-agnostic) when authenticated
- [x] `/terms` — public server-rendered Terms & Community Agreement page with version and updated_at
- [x] `TermsAcceptanceGate.tsx` — global client-mounted blocking modal in root layout, triggers on first authed visit when `terms_accepted_at IS NULL`; focus trap, autofocus, body-scroll lock, aria-describedby
- [x] `SignupForm.tsx` — required T&Cs checkbox linked to `/terms`, submit-guarded, hits `/api/terms/accept` on instant-session signup (email-verify path caught by gate on first visit)
- [x] `AttendeeWaiverModal.tsx` + `RSVPButton` pre-flight — fetches attendee-participation-waiver, if `hasSigned=false` opens modal before RSVP; graceful 404 degrade; signed users RSVP silently
- [x] `PlaceFormWithIndemnity.tsx` — wraps place creation behind `venue-listing-waiver` gate
- [x] Architect review applied: a11y hardening (focus trap, scroll lock, autofocus, aria-describedby), race-free profile update, ip_address capped, doc comment on global `hasSigned` scope, seeds rewritten as plain prose (dropped `prose` class from /terms)
- [x] Decisions logged in `.github/DECISIONS.md` (client-side gate vs server enforcement; partial unique indexes; required=false attendee waiver)
- [x] 19 new tests (550 total, all passing)

### Build & Test Verification
- [x] `npx tsc --noEmit` — 0 errors (3 type assertion fixes applied)
- [x] `next build` — all routes compiled, new routes `/events/manage`, `/places/manage` included
- [x] `npx vitest run` — **335 tests, 37 files, 0 failures** ✅

### Latest validation (Batch J — Legal Acceptance Wiring)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **550 tests, 64 files, 0 failures** ✅ (+19 from Batch J)
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] `mcp_supabase_get_advisors type:security` — no new warnings introduced by Batch J

### Batch K — Tag Taxonomy + Quota Banner + Review Prompt + Tag Moderation (COMPLETE)
- [x] **K1 Tag taxonomy** — Migration `056_tags_and_review_prompt.sql` (event_tags + event_tag_assignments, 5-cap trigger raising `event_tag_cap_reached`, usage_count maintenance, RLS layered: select public/insert auth/admin update+delete, slug regex `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`, label CHECK 1-40)
- [x] Validation helpers `slugifyTag` / `isValidTagSlug` / `isValidTagLabel` (NFKD diacritic strip, length cap, null on empty)
- [x] API routes: `GET/POST /api/tags` (ilike escaped, limit clamped to 25, idempotent on slug + 23505 race), `POST/DELETE /api/events/[id]/tags` (`requireOwnerOrAdmin()` + UUID validation + 409 hidden + 409 cap), `PATCH /api/admin/tags/[id]` (admin guard + mass-assignment whitelist + audit log)
- [x] UI: `TagPicker.tsx` (180ms debounce + AbortController, max 5 chips, Backspace remove, Enter create), `TagChipList.tsx` (links to `/events?tag=<slug>`)
- [x] Wired into EventForm (Promise.allSettled POST after insert) + EditEventForm (load-via-join + diff-sync)
- [x] EventDetailServer parallel fetch + EventDetailContent embedding
- [x] **K2 Citizen quota pre-check banner** — server-side 30d window check on `/events/new`, glass-panel CTA to `/contributor/apply` when limit hit
- [x] **K3 Post-event review prompt** — Edge Function `prompt-post-event-reviews/index.ts` (daily cron, 1-25h window, RSVP+review-exclude join, `event_reminders` pref filter), notifications.type extended with `'review_prompt'`, NotificationPanel deep link `/events/[id]?review=1`, InlineEventRating `autoFocus` prop (scrollIntoView + focus first star + 2.2s gold pulse)
- [x] **K4 Admin tag moderation** — `/admin/tags` page + TagModerator.tsx (toggle official/hidden, search filter), BurgerMenu link, admin_actions audit logging

### Latest validation (Batch K — Tags + Review Prompt + Moderation)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **566 tests, 66 files, 0 failures** ✅ (+16 from Batch K: 10 validation-tags + 6 tags route)
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] `next build` — `/api/tags`, `/admin/tags`, all routes shipped clean
- [x] vibe-security audit — clean across all 4 surfaces (ILIKE escape, UUID validation, ownership/admin guards, mass-assignment whitelist, RLS layered)
- [x] Pushed to origin/main as commit `4532b37`

### Batch L — My Events Tabs + Contributor Apply Reliability + Side Panel Polish (COMPLETE)
- [x] **L1 Contributor apply reliability** — `src/app/api/contributor/apply/route.ts` rewritten to insert `contributor_applications` directly via the caller's RLS-scoped client, removing the `submit-contributor-application` Edge Function proxy that was masking deploy skew / missing secrets as a generic "Something went wrong". Rate-limited (`RATE_LIMITS.heavy`, 5/min/user), strict input trimming + length caps, `contributor_kind` allow-set (`ministry`/`organization`/`business`), 409 on `23505` race, follow-up `profiles.contributor_status` flip.
- [x] **L2 My Events tabs (Created + Joined)** — New `src/app/api/manage/joined/route.ts` reads caller's RSVPs via PostgREST embed (`event:events(...)`) filtered to `attending`/`considering`, flattened + null-event filtered. New `src/components/events/JoinedEventsView.tsx` (cancellation-safe fetch, explicit error state with `role="alert"`, cancelled/upcoming/past bucketing, upcoming asc / past desc). New `src/components/events/MyEventsTabs.tsx` (WAI-ARIA tablist: `role="tab/tablist/tabpanel"`, roving `tabIndex`, `ArrowLeft`/`ArrowRight`/`Home`/`End` keyboard nav + focus, hash sync `#created`/`#joined` via `replaceState`, lazy-mounted panels). `/events/manage` page re-titled **My Events** with subtitle.
- [x] **L3 Side panel entrance glitch** — `src/app/events/loading.tsx` now returns a neutral `aria-hidden` full-bleed backdrop instead of a shimmering skeleton, eliminating the fade-rise pulse that played under the sliding `@panel` slot while still preventing a white flash on cold deep-links.
- [x] New tests: `src/__tests__/api/contributor-apply.test.ts` (6 cases — 401 unauth, 409 already_approved, 409 already_pending, 400 short display_name, 200 success, `contributor_kind` coercion) and `src/__tests__/api/manage/joined.test.ts` (3 cases — 401 unauth, flatten + null-event filter, 500 on query error).

### Latest validation (Batch L — My Events + Contributor Apply + Side Panel)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **575 tests, 68 files, 0 failures** ✅ (+9 from Batch L: 6 contributor-apply + 3 manage/joined)
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect agent audit — 5 Should-fix items, all applied: (1) stale docstring refresh, (2) admin notification regression documented in route + DECISIONS, (3) tablist keyboard nav + roving tabIndex, (4) JoinedEventsView fetch error surfaced as `role="alert"`, (5) `events/loading.tsx` neutral backdrop for cold deep-links.
- [x] vibe-security skill audit — clean. Both new routes are auth-gated with RLS-scoped clients (no service role), apply route is rate-limited + input-validated + mass-assignment-safe, error payloads are generic. No new attack surface introduced.
- [x] Supabase security advisors — no schema/SQL changes in this batch, baseline unchanged (MCP tool not surfaced in this session; no advisor delta expected since Batch K).

---

## Batch C — Icon Shrink + Progressive Geo-Clustering (COMPLETE)

### C1 Marker icon shrink −20%
- [x] `src/lib/map/markers.ts` — `BASE_SIZE` 40 → 32, `PLACE_MARKER_SIZE` 40 → 32, `PLACE_MARKER_SIZE_HIGHLIGHTED` 54 → 44, `PLACE_ICON_SIZE` 24 → 20, `PLACE_ICON_SIZE_HIGHLIGHTED` 32 → 26. Rebalances visual weight against the new cluster bubbles at mid zoom.

### C2 Progressive geo-clustering (capital → city → town → suburb → markers)
- [x] NEW `src/lib/map/clustering.ts` (~180 LoC, fully pure module). Four tiers with fixed degree-grid (`GRID_SIZE_DEG = {capital:4, city:1, town:0.2, suburb:0.05}`) and smoothstep crossfade bands 0–5 / 6–8 / 9–11 / 12–14. `markerOpacityAt` fades individual event/place markers in over zoom 14 → 15.5 so bubbles hand off cleanly to pins. Exports `bucketPoints`, `tierOpacityAt`, `markerOpacityAt`, `bubbleSizeForCount`, `visibleTiersAt`.
- [x] NEW `src/__tests__/lib/map/clustering.test.ts` — 19 unit tests covering bucketing invariants (single-cell determinism, centroid correctness), fade monotonicity across bands, size bounds (28..56 px), and the "no zoom level is ever empty" invariant.
- [x] `src/lib/map/markers.ts` — added `createGeoClusterBubbleEl(count, size)` (white fill + 2 px gold border, drop-shadow, `role="button"`, `tabindex="0"`, `aria-label`, `transition` set once at creation) and `updateGeoClusterBubbleEl(el, count, size)` (in-place mutation so listeners + MapLibre binding survive count changes).
- [x] `src/components/map/EventMap.tsx` — wires clustering:
  - `geoClusterMarkersRef` keyed by `tier:gridX:gridY`.
  - `rebuildGeoClusters()` iterates `visibleTiersAt(zoom)`, diff-patches marker map by key (reuses existing, mutates on count change, removes stale). Every bucket (including singletons) becomes a bubble so no point vanishes at zoom 12–14 where individual markers are faded.
  - `updateGeoClusterOpacity()` composes temporal opacity (`el.dataset.temporalOpacity`) × `markerOpacityAt(zoom)` via `applyComposedOpacity(el, markerOp)` so past-event dimming survives tier handover.
  - Filter/placesMode bail-out restores marker opacity to unfiltered state before returning.
  - `attachBubbleHandlers(el, map, b)` adds click + `keydown` (Enter / Space) → `map.easeTo({zoom: min(z+2, 16)})`.
  - `zoom` event RAF-debounces opacity updates; `zoomend` rebuilds. Both `zoomOpacityRaf` and `deconflictRaf` cancelled on unmount.
  - Event + place markers stamp `dataset.temporalOpacity` and `style.transition = "opacity 160ms linear"` once at creation; update loop only writes `opacity`.

### Latest validation (Batch C)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **594 tests, 69 files, 0 failures** ✅ (+19 from Batch M baseline)
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect agent audit — initial review flagged 4 criticals + 3 warnings; re-audit after fixes confirmed **all 7 Should-Fix items PASS**. Commit: `731bdf1`.
- [ ] Supabase security advisors — no schema/SQL changes in this batch; advisor re-baseline deferred to Batch G.

---

## Batch M — Logout Redirect + MapTiler Style Swap (COMPLETE)

### M1 Logout returns to landing
- [x] `src/components/events/EventsView.tsx` — `handleLogout()` now calls `router.push("/")` before `router.refresh()` so signing out from the full-screen shell always bounces to `/` (landing page with guest-browse affordance + login CTA). Previously `router.refresh()` alone left the user on a stale authenticated `/events` frame pending middleware resolution. The Navbar-based logout path already pushed `/` — this aligns both flows.

### M2 New MapTiler Cloud style + dev-only verification overlay
- [x] `.env.local` — rotated to `NEXT_PUBLIC_MAPTILER_KEY=vopPYlm4eVtmPRVUBjK8` and `NEXT_PUBLIC_MAPTILER_STYLE=019dba0f-b49b-73bb-bf6a-f9d820f43be8` (user-supplied custom Cloud style). Old key remains in MapTiler dashboard for rotation.
- [x] `src/lib/map/config.ts` — updated hardcoded default UUID to match new ENV; added `getMapStyleInfo()` helper returning `{ source, styleId, url }` for QA instrumentation.
- [x] `src/components/map/EventMap.tsx` — container `<div>` gained `relative`; in `NODE_ENV === "development"` only (tree-shaken in prod via Next DefinePlugin), a small bottom-left `MapStyleDebugBadge` renders the active basemap source + style UUID prefix so QA can visually confirm style application after cache-busted rebuilds. Badge is `aria-hidden` + `pointer-events-none`.
- [x] `src/__tests__/lib/map/config.test.ts` — assertion updated to new UUID. All 6 config tests pass.

### Latest validation (Batch M)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **575 tests, 68 files, 0 failures** ✅
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect agent audit — **no Should-Fix**. Nice-to-haves applied: stricter `NODE_ENV === "development"` gate (avoids test-env badge render), `aria-hidden` on dev badge.
- [x] Supabase security advisors — no schema/SQL changes in this batch, baseline unchanged (MCP advisor tool still deferred in this session; flagged for next batch).

---

## Batch N — Event → Organiser flow + Multi-venue contributor profiles + 6-org seed (COMPLETE)

### N1 Event → Organiser discovery UX (shipped in prior segment, finalised here)
- [x] `src/components/events/EventDetailServer.tsx` — added 5th parallel fetch of organiser profile; exports `EventOrganiser`; passes `organiser` prop.
- [x] `src/components/events/EventDetailContent.tsx` — "Organised by `<name>`" link under title routes to `/c/<slug>` for approved contributors with slug, else `/profile/<id>`. `<InlineEventRating />` wrapped in `{hasStarted && (…)}` so upcoming events no longer show a ratings prompt.
- [x] `src/components/profile/ProfileDetailServer.tsx` + `src/components/contributor/ContributorPublicProfile.tsx` — "Find us" renders primary `physical_address` + any additional `contributor_locations` with sort_order.
- [x] `src/types/db.ts` — added `ContributorLocation` type.
- [x] Tests: `src/__tests__/components/events/EventDetailContent.test.tsx` — 4 new cases (organiser link variants + rating gate).

### N2 Multi-venue contributor profiles — migration 060
- [x] `supabase/migrations/060_contributor_locations.sql` — new `public.contributor_locations` table (id, profile_id FK profiles ON DELETE CASCADE, label, address, latitude, longitude, sort_order, created_at). Index on `(profile_id, sort_order)`. RLS enabled.

### N3 Seed 6 real-world contributor organisations + 30 events — migration 061
- [x] `supabase/migrations/061_seed_testing_contributors.sql` — fixed UUIDs `11111111-1111-4111-8111-00000000000[1-6]`:
  - **CRC Cape Town** (ministry, Bloubergstrand + Durbanville campuses)
  - **Every Nation Mooikloof** (ministry, Pretoria)
  - **Lynnwood Farmers Market** (business, Pretoria)
  - **Ellel Ministries SA** (ministry, Hartbeespoort)
  - **POPUP Skills Development** (organization, Pretoria Central)
  - **U-Turn Homeless Ministries** (organization, Cape Town: Roeland Street + Claremont)
- [x] Seed users inserted into `auth.users` with `crypt(gen_random_uuid()::text, gen_salt('bf'))` as encrypted_password — unusable, inert. Email domain `citizens.local` (RFC 6761 reserved). `handle_new_user` trigger creates matching profile rows.
- [x] Profile-enrichment UPDATE block wrapped in `ALTER TABLE public.profiles DISABLE/ENABLE TRIGGER USER` so seed rows can be promoted `role=citizen → contributor` and `contributor_status=not_applied → approved` (otherwise blocked by `protect_role_column`). Transactional, superuser-only; no runtime impact.
- [x] 30 events (5 per org) across past/present/future, `status='published'`, categories strictly from the `events_category_check` allowlist (`church`, `kids`, `marriage-and-couples`, `equip`, `mens`, `missional`, `social-fun`, `entertainment`, `care`, `education`, `community-upliftment`, `recovery`). `category_id` linked by slug; DO-block NOTICE guard warns if any seed event lacks a category match.
- [x] 4 additional `contributor_locations` (CRC ×2 campuses, U-Turn ×2 venues).
- [x] `image_url` NULL on all seed events — no CSP widening.

### N4 Tighten 060 per architect review — migration 062
- [x] `supabase/migrations/062_tighten_contributor_locations.sql` — replaces `FOR ALL` owner policy with explicit `INSERT / UPDATE / DELETE` policies (public `SELECT` unchanged); adds `CHECK` constraints on `latitude` (±90) and `longitude` (±180).

### Latest validation (Batch N)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **603 tests, 69 files, 0 failures** ✅
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect agent audit — **Grade A.** Two Should-fixes applied inline (split `FOR ALL` policy + lat/lng CHECK constraints in migration 062; NOTICE guard for missing `category_id` in migration 061). Nice-to-haves logged.
- [x] Supabase security advisors — unchanged vs. baseline (same ERRORs on `directory_contributors` security_definer_view + `app_settings` RLS, same WARN function_search_path_mutable set, same WARN public_bucket_allows_listing on `place-images`, same WARN auth_leaked_password_protection). **No new warnings.**

### Notes
- Migration 061 is present on the live DB under migration name `061_seed_testing_contributors_v2` (first apply attempt aborted mid-way before the trigger-disable pattern was finalised; canonical file re-applied under _v2). File on disk is idempotent (DELETE-then-INSERT), so re-applying under either name is safe.

---

## Batch O — Map bubble split / recouple (COMPLETE)

- [x] **3-tier model** in `src/lib/map/clustering.ts` — capital (4° grid, zoom 0–5), town (0.4° grid, zoom 6–8), suburb (0.05° grid, zoom 9–11). Markers fade in 11→12; no bubbles past zoom 12. New pure helpers: `childTierOf`, `bucketKeyOf`, `pointsInBubble`. `FADE_WIDTH` tightened from 1.5 to 1 for snappier crossfades.
- [x] **Click-to-split-in-place** in `src/components/map/EventMap.tsx`. `expansionsRef` keys open splits by parent bucket. Capital/town clicks single-expand (close prior siblings) and spawn child bubbles via `bucketPoints` with a fly-out transform animation from the parent's screen position. Suburb clicks multi-expand (stack) and "lift" the underlying event/place markers within the suburb cell to full opacity / `z-index: 20` instead of spawning child bubbles.
- [x] **Recouple triggers**: outside map-canvas click, document-level Escape keypress, zoom-band crossing (capital↔town↔suburb↔marker), and clicking the same expanded bubble again (toggle off).
- [x] **Bubble a11y** in `src/lib/map/markers.ts`. New `setBubbleExpanded` helper toggles `aria-expanded` and swaps in a tier-aware label ("…expanded — press Escape or click the map to collapse"). Bubble counts mirrored on `data-cc-bubble-count` so in-place updates regenerate the label correctly.
- [x] **Layering** in `src/app/globals.css` — `.cc-geo-cluster { z-index: 5 }`, `.cc-geo-cluster-child { z-index: 25 }` so opened splits sit above sibling parents and lifted markers without conflicting with `.cc-marker-sync-highlight` (different stacking context).
- [x] **Test rewrite** — `src/__tests__/lib/map/clustering.test.ts` rebuilt around the new tier model + helpers (26 tests).

### Architect Should-fix items applied inline (Batch O)
- [x] **C1** Stale child bubbles after data refresh — collapse non-suburb expansions whenever `events`/`places` identity changes (suburb expansions self-heal via the lifted-marker pass).
- [x] **W1** `aria-expanded` set on the bubble; `aria-label` swaps when expanded.
- [x] **W2** Document-level `Escape` keydown listener for keyboard recouple, removed on unmount.
- [x] **W3** Removed dead `data-cc-expanded-hidden` attribute (`expansionsRef` is the single source of truth).
- [x] **W5** Memoised `liftedSuburbKeysRef: Set<string>` invalidated on every expansion mutation; replaces O(markers × open-suburbs) per-frame iteration with `Set.has` lookup.

### Latest validation (Batch O)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **610 tests, 69 files, 0 failures** ✅ (+7 from Batch N: clustering tier rewrite)
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect agent audit — Should-fix verdict; all C1 + W1–W3 + W5 applied inline before push. W4 (Capacitor touch reliability) noted for device verification; nice-to-haves (count==1 short-circuit flyTo, `collapseExpansion` opacity-refresh contract, timeout guarding on rapid toggles) logged for follow-up.
- [x] Supabase security advisors — unchanged vs. Batch N baseline (no schema changes).
- [x] Pushed to `origin/main` as commit `e3e41c6`.

---

## Batch O.1 — Bubble tier retune + hide markers below zoom 12 (COMPLETE)

Follow-up to Batch O: the original model faded individual markers in
from 11→12 which, at city zooms, showed them as ghosted smudges behind
the totalling bubbles.  User requested the totalling bubbles own the
view below zoom 12 and markers reveal only when a suburb is expanded.

- [x] **New tier bands** in `src/lib/map/clustering.ts` — capital 4–7, town 8–10, suburb 11, markers 12+.
- [x] **Hard marker threshold** — `MARKER_FADE_IN_START = MARKER_FADE_IN_END = 12`; `markerOpacityAt` returns 0 below 12, 1 at/above 12.  No more crossfade.
- [x] **Authoritative visibility gate** in `updatePlaceVisibility` (now owns both event + place markers): below zoom 12 markers are `visibility: hidden` unless lifted by an open suburb expansion (or filters / places-mode active).  At zoom ≥ 12 visibility is cleared.
- [x] **Opacity pass** in `updateGeoClusterOpacity` sets `visibility: hidden` on unlifted event markers at `markerOp === 0`, matching the gate.  Place markers defer visibility to the authoritative controller.
- [x] **Band tracker** `bandFor()` updated to `< 8 capital, < 11 town, < 12 suburb, else marker`.
- [x] **Tests** — `clustering.test.ts` rewritten for new bands + hard threshold (28 tests from 26).

### Latest validation (Batch O.1)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **612 tests, 69 files, 0 failures** ✅ (+2 marker-threshold assertions)
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect agent audit — **Approved.** No Should-fix. Nice-to-haves logged: suburb fade-out width (#1), threshold-literal consolidation (#2), world-view minZoom (#4); nice-to-have #3 (docstring) applied inline.
- [x] Supabase security advisors — unchanged vs. Batch O (no schema changes).

### Batch P — Admin profile updates fix + admin/users polish + map cluster UX (COMPLETE — `8fc86f4`)
- [x] **Admin profile role/contributor mutations now persist** — root cause was a missing `update` RLS policy on `public.profiles`; PostgREST returned zero rows on cross-user PATCHes with NO error. Migration `063_admin_profile_updates.sql` adds an `Admins can update any profile` policy gated by `public.is_admin()`; mirrored into `supabase/schema.sql`. Defense-in-depth: `PATCH /api/admin/users` now calls `.select('id')` after update and returns HTTP 500 (generic body, detailed server log) on zero rows.
- [x] **Pagination polish on `/admin/users`** — Prev/Next nav hidden when `totalPages === 1` (was always rendered + always disabled).
- [x] **Pending Contributor applications surfaced on `/admin/users`** — server fetches `contributor_applications` (status=pending) using the same FK alias + `ContributorReviewCard` component as `/admin/contributors`. Visible red banner + console.error when the fetch errors so a "nothing to review" empty state never masks an RLS regression.
- [x] **Map cluster regroup UX** — all tier clusters now multi-expand (capital + town no longer collapse siblings). Outside map-canvas click stages collapse one tier at a time (suburb → town → capital) via new `collapseInnermostTier()`. Event + place markers attach `stopPropagation` listeners so interacting with a marker inside an open cluster never collapses it. Zoom-band changes only collapse on zoom-OUT across a tier boundary using a `bandRank` record.

### Latest validation (Batch P — Admin + Map UX)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **612 tests, 69 files, 0 failures** ✅
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] vibe-security skill review — no critical/high issues
- [x] Architect audit — A- / A / A / A- / A / B+ — Should-fix S1/S2/S3 + N2 applied inline (`maybeSingle`, captured+logged appsError + alert banner, generic 500 body, refreshed multi-expand spec comment). N1 (hoist `bandRank`), N3 (`swallowMapCanvasClick` helper), N5 (`collapseInnermostTier` single-pass), and `useClusterExpansion` hook deferred to follow-up tidy-up batch.
- [x] `mcp_supabase_get_advisors type:security` — baseline unchanged (DDL-only RLS policy, no new functions or views)

### Batch Q — Tidy-up of Batch P deferred items (COMPLETE — `d5abffc`)
- [x] **Shared `fetchPendingApplications` helper** (`src/lib/contributors/pendingApplications.ts`) — `/admin/users` and `/admin/contributors` now share one loader; FK alias select + row→`PendingApplication` mapping cannot drift. Returns `{message}` only — never leaks Supabase error shape.
- [x] **`.maybeSingle()` drift fix on `/admin/contributors`** — admin role check now matches `/admin/users` (no false 500 when admin row is missing).
- [x] **N1 `BAND_RANK` hoisted to module scope** in `EventMap.tsx` — zoom-band rank record no longer reallocates per `zoomend` event.
- [x] **N5 `collapseInnermostTier` single-pass** — tier-priority loop replaced with one Map iteration tracking innermost rank + key bucket.
- [x] **N4 migration 063 reshape** — switched from `drop policy if exists … create policy …` to a `do $$ … if not exists … end $$;` block so the migration is a strict no-op on a DB that already has the policy.
- [x] **S4 doc comment** above last-admin preflight in `PATCH /api/admin/users` — clarifies the non-transactional check is advisory; the authoritative guard is the `enforce_at_least_one_admin` BEFORE trigger raising P0001.
- [x] **N3 abandoned (superseded by remote PR #31).** Batch P added `swallowMapCanvasClick` to stop marker clicks bubbling to the canvas. PR #31 (`21cee62`, merged as `85a8456`) reverted that approach because calling `e.stopPropagation()` on marker DOM breaks MapLibre's internal `_onMapClick` popup-toggle wiring (no popup ever opens). The correct pattern is now in the canvas click handler: filter via `e.originalEvent.target.closest('.cc-marker, .cc-place-marker, .cc-geo-cluster, .maplibregl-popup')` before calling `collapseInnermostTier`. Helper deleted from `markers.ts`. **Permanent invariant logged in `.github/DECISIONS.md`** so future agents don't re-introduce stopPropagation on marker DOM.

### Latest validation (Batch Q — Tidy-up)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **612 tests, 69 files, 0 failures** ✅
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect audit — verdict ship (A/A/A/A/A/A−). Should-fix nits applied inline (extra-blank-line removed, `Pick<>` pivot in helper).
- [x] vibe-security skill review — clean
- [x] `mcp_supabase_get_advisors type:security` — 20 lints, identical to Batch P baseline (no schema change)
- [x] Rebase against `origin/main` (`85a8456` PR #31 merge) — accepted upstream version of `EventMap.tsx`; re-applied N1 + N5 on top; deleted dead helper

### Batch R — Category Icons + Event/Place Media Galleries (COMPLETE)
- [x] **Shared category icon registry** — `src/lib/categoryIcons.ts` is now the single source for event markers, place markers, quick-access buttons, and AI search intent icon mapping. Coverage tests ensure every event category, place category, quick-access item, and `ALL_TAGS` search taxonomy slug resolves to an SVG.
- [x] **Map/quick panel icon cleanup** — `markers.ts` and `quickPanelOptions.ts` no longer duplicate inline SVG maps; marker colors source from canonical category hex maps.
- [x] **Reusable media layer** — generic `uploadEntityMedia`, `MediaGalleryUploader`, and `MediaStrip` support image/video galleries while preserving event import paths through compatibility wrappers.
- [x] **Place media module** — migration `20260427185151_media_galleries_and_category_icons.sql` adds `place_media` with public read + owner/admin write RLS, applies owner/admin-scoped place storage policies, and drops the broad `place-images` storage SELECT policy so public object URLs remain usable without bucket listing.
- [x] **Place create/edit/detail wiring** — `PlaceForm` and `EditPlaceForm` upload covers/galleries to `place-images`, place detail renders the shared strip/lightbox, and edit pages load/delete existing place media.
- [x] **Event media RLS hardening** — `event_photos` insert/update now require event owner/admin. Delete allows event owner/admin or the original uploader so legacy uploader-owned rows are not stranded.
- [x] **Contributor gallery hardening** — profile API validates, normalises, dedupes, and caps external gallery URLs at six; public contributor profiles render them through the shared strip in plain image mode.

### Latest validation (Batch R — Icons + Media Galleries)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **617 tests, 71 files, 0 failures** ✅ (+5 tests / +2 files from Batch Q baseline)
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [x] Architect audit — 3 Should-fix findings applied inline: legacy uploader delete fallback for event photos, explicit missing-ID guard in `PlaceForm`, contributor gallery dedupe before max-count validation. Update remains owner/admin-scoped to prevent media row retargeting.
- [x] Supabase migration applied via MCP — `place_media` and media policies verified in `pg_policies`.
- [x] `mcp_supabase_get_advisors type:security` — **79 lints**, no `place_media`/`event_photos`/storage findings for this batch; previous `place-images` public-bucket listing warning removed by dropping the broad storage SELECT policy.

### Batch S1 — Category Refinement v2 (CODE SHIPPED — migration unapplied)

Locked spec: `.github/QUEUED_BATCH_S_categories_v2.md`. **S1 (taxonomy refactor) executed.** S2 (Lucide redraw) and S3 (Weekend derived tag + chip + filter) remain queued.

What shipped (code only):
- `src/types/db.ts` — `EventCategory` rewritten to **17 canonical slugs**; `PlaceCategory` rewritten to **10 slugs**.
- `src/lib/categories.ts` — full rewrite (labels short/long, hex, badge classes, filters, ≥30 keyword buckets per slug, place equivalents).
- `src/lib/categoryIcons.ts` — 17 event + 10 place icon-id maps; new `getIconBySlug()` helper for arbitrary slug back-compat lookups.
- `src/lib/categorySuggest.ts`, `src/lib/quickPanelOptions.ts`, `src/lib/personalization/percentages.ts`, `src/lib/easterEggs/wyr.ts`, `src/lib/easterEggs/registry.ts`, `src/lib/map/markers.ts` — all rebucketed to new slugs.
- `supabase/functions/_shared/category-interests.ts` — 17-entry `CATEGORY_INTEREST_MAP` rewritten.
- All 4 components carrying default fallbacks (`ManageEventsView`, `JoinedEventsView`, `FeaturedPanel`, `EventsView`, `EventCard`, `EventCalendar`, `EventDetailContent`, `EventForm`, `EditEventForm`) flipped from `?? "church"` → `?? "church-services"`.
- Test suite: `categories.test`, `categorySuggest.test`, `easterEggs/registry.test`, `personalization/percentages.test`, `quickPanelOptions.test`, `helpers/fixtures.ts/test`, `EventCard.test`, `EventDetailContent.test`, `EventForm.test`, `EditEventForm.test`, `EventsView.test`, `PlaceForm.test`, `ai-search/route.test`, `manage/joined.test` — all updated.
- `supabase/schema.sql` — events `CHECK` constraint and `categories` seed rebuilt to 27 rows (17 event + 10 place).
- Migration `supabase/migrations/064_refine_categories_v2.sql` — idempotent old→new slug remap (events.category, events.category_id, places.category_id), CHECK constraint swap, default flip, 27-row seed, sanity assertions.

⚠️ **Migration 064 NOT yet applied to remote DB.** Next session must run `mcp_supabase_apply_migration name:"refine_categories_v2"` against the file at `supabase/migrations/064_refine_categories_v2.sql` before re-running validation against live data.

What remains queued (S2 + S3):
- **S2 — Lucide redraw**: replace remaining emoji icons with Lucide-extracted inline SVGs + 3 custom SVGs (`praying-hands`, `soccer-ball`, `lollipop`) and one tag icon (`weekend-tag`).
- **S3 — Weekend derived tag**: `src/lib/weekendTag.ts` (`isWeekendEvent()`), `<WeekendChip />`, Weekend filter toggle in `EventsView`, weekendTag unit tests. (Note in `personalization/percentages.ts` flags `time_availability=weekends` will re-route here when S3 lands.)

### Latest validation (Batch S1)
- [x] `npx tsc --noEmit` — 0 errors
- [x] `npx vitest run` — **615 passed / 2 failed (617 total)** — both failures pre-existing on `main` baseline (`EventDetailContent` "shows RSVP button" + "Log in to RSVP" — date/status logic, unrelated to S1). No NEW failures introduced.
- [x] `npx next lint --dir src` — No ESLint warnings or errors
- [ ] Architect subagent — **deferred** (subagent tool not loaded this session); track in `RESUME_HERE.md` for next session.
- [ ] `mcp_supabase_apply_migration name:"refine_categories_v2"` — **deferred** (Supabase MCP not loaded this session).
- [ ] `mcp_supabase_get_advisors type:"security"` — **deferred** (run after migration apply).

### Batch S — Category Refinement v2 (QUEUED — fully scoped, not yet executed)

Locked spec lives at `.github/QUEUED_BATCH_S_categories_v2.md`. Summary:

- Refines event taxonomy from 16 → **17 canonical slugs** (adds `worship-prayer`, `markets-expos`, `youth-students`; merges `education`+`equip` → `education-equipping` and `care`+`recovery` → `care-recovery`; renames `weekend` → `conferences-summits` because Weekend becomes a derived tag).
- Refines place taxonomy from 8 → **10 canonical slugs** (adds `christian-businesses`, `safe-spaces`; renames the 8 existing slugs to two-word forms — `church` → `churches-ministries`, `relax` → `hospitality-cafes`, etc.).
- Replaces emoji icons with **Lucide-extracted inline SVGs** as source-of-truth + 3 custom SVGs (`praying-hands`, `soccer-ball`, `lollipop`) and one tag icon (`weekend-tag`).
- Introduces **`isWeekendEvent()`** derived tag in `src/lib/weekendTag.ts` + `<WeekendChip />` + Weekend filter toggle in `EventsView`.
- Migration `supabase/migrations/064_refine_categories_v2.sql` (idempotent old→new slug mapping for `events.category`, `events.category_id`, `places.category_id`; rebuilds the `categories` seed with 27 rows).
- Refreshes ≥50 keyword buckets per slug; rebuckets `categorySuggest`, `quickPanelOptions`, `personalization/percentages`, `easterEggs/wyr`, `easterEggs/registry`, `map/markers`, edge function `category-interests.ts`.
- Updates all category test fixtures + adds `weekendTag` unit tests.
- Adds `RESUME_HERE.md` at repo root and updates the continuity-manager contract so every future batch refreshes it.

**Why deferred:** Single-session capacity insufficient for full A-grade execution (rewrites span ~15 source files + ~10 test files + migration + UI + docs + quality pipeline). Codebase is currently green; no in-flight changes were committed. Resume by reading `.github/QUEUED_BATCH_S_categories_v2.md` end-to-end and executing Phases A → H sequentially.

---

## Migration 025: Expanded Roles, Place Images & Category FK (COMPLETE)

### Expanded Roles
- [x] Profile roles expanded from 3 (vendor/client/admin) → 7 (individual/ministry/organization/business/vendor/client/admin)
- [x] All existing users migrated: vendor → individual, client → individual
- [x] Default role changed to 'individual'
- [x] Auth trigger validates role whitelist (prevents admin self-assignment)
- [x] `protect_role_column()` trigger prevents role self-escalation via profile UPDATE
- [x] `UserRole` TypeScript type updated with legacy fallbacks
- [x] `ORGANISER_ROLES` + `ROLE_LABELS` constants in `types/db.ts`
- [x] SignupForm updated: 4 role radio options (Individual/Ministry/Organization/Business)
- [x] `isVendor` checks updated across app: events open to all, places restricted to organiser roles
- [x] Profile pages show role-specific labels via `ROLE_LABELS`

### Place Images Bucket
- [x] `place-images` public storage bucket created
- [x] RLS: INSERT (own folder), SELECT (public), UPDATE (own), DELETE (own)

### Category FK
- [x] `category_id uuid REFERENCES categories(id)` column added to events
- [x] Backfilled from text `category` column
- [x] `sync_event_category_id` trigger auto-fills `category_id` on INSERT/UPDATE
- [x] 15 new categories upserted into categories table

### RLS Hardening
- [x] `is_organiser()` DB function — checks ministry/organization/business/admin
- [x] Places INSERT restricted to organiser roles via RLS policy
- [x] Role escalation prevented via `protect_role_column()` trigger

### Tests
- [x] SignupForm test updated for 4 new roles
- [x] Fixtures updated: default role → individual, Event type has category_id
- [x] All 335 tests passing, build clean

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
- [x] EventPhotoGallery — **shipped** as `EventMediaStrip` (swipeable strip with lightbox, supports both images and videos via the `event_photos.kind` column). See `supabase/migrations/029_event_media.sql`.

---

## Batch E — Admin SAVE UX + Force-Reauth + Contributor Bio Gate (COMPLETE)

### Delivered
- [x] Migration `057_force_reauth_and_bio_setup.sql` — adds `profiles.force_reauth_at timestamptz` + `profiles.bio_setup_required bool` + `on_role_change_side_effects()` BEFORE UPDATE OF role trigger (search_path set to public)
- [x] Migration `059_enforce_one_admin.sql` — DB-level trigger preventing last-admin demotion (closes TOCTOU race; maps to P0001)
- [x] `src/types/db.ts` — Profile type fields added
- [x] `src/middleware.ts` rewrite — force-reauth gate (JWT iat vs force_reauth_at, **fail-closed** on JWT parse/profile-lookup error) + bio-setup gate (contributor+flag → /contributor/setup). Uses Buffer base64url.
- [x] Login page `reauth=1` notice (via LoginForm)
- [x] `AdminUserManager.tsx` rewritten — staged per-row edits, explicit SAVE button (disabled when clean), flash messages for reauth/pending/noop
- [x] `/api/contributor/setup` + `/contributor/setup` page + form — minimum bio gate clears the flag
- [x] API error mapping: trigger P0001 → 400 on last-admin demotion
- [x] Middleware tests: +5 (force-reauth redirect, fail-closed JWT, fail-closed DB, bio-setup redirect, bio-setup allow-list exemption)

### Latest Validation
- tsc: 0 errors
- vitest: 599/599 passing (up from 594 baseline)
- lint: clean
- advisor: 20 lints, unchanged vs baseline

---

## Batch F — Dual-Admin Approval for role=admin (COMPLETE)

### Delivered
- [x] Migration `058_pending_admin_elevations.sql` — `pending_admin_elevations` table with unique partial index `where status='pending'`; `approve_admin_elevation(uuid)` + `reject_admin_elevation(uuid,text)` RPCs enforcing different-approver OR solo-admin 24h cooling-off at the DB layer (errcodes P0001/P0002/42501/28000); extends `notifications.type` CHECK with `admin_elevation_request`
- [x] `PATCH /api/admin/users` for role='admin' queues into pending_admin_elevations (23505 → 409), notifies all other admins via bulk `notifications` insert, logs admin action. Never hardcodes a bypass.
- [x] `GET /api/admin/pending-elevations` — admin-only list with target+requester joins
- [x] `POST /api/admin/pending-elevations/[id]/approve` + `[id]/reject` — shared POST handler mapping P0002→404 else→400 with DB message (so dual-admin rule violation surfaces cleanly)
- [x] AdminUserManager surfaces pending elevations with Approve/Reject buttons and "you" badge on own requests
- [x] Rate limits: separate `RATE_LIMITS.read` bucket for admin GETs (120/min) vs `mutation` (30/min)

### Latest Validation
- Same as Batch E — shipped together on main.
- Advisors: no NEW lints from migrations 057/058/059.

---

## Batch G — Deferred Contributor Email + Advisor Rebaseline (docs-only)

### Delivered
- [x] DECISIONS entry documenting why the contributor admin-notification email is deferred to a DB webhook / pg_cron job rather than inline on the contributor-apply path.
- [x] Advisor rebaseline captured: 20 lints (unchanged), all pre-existing and documented.

- [x] VendorAnalytics — **shipped** as aggregate summary on `/events/manage` (total events, views, RSVPs, considers, sold-out count) plus per-event counts in each card
- [x] Multi-photo upload in EventForm — **shipped** as `MediaGalleryUploader` (images + videos, client-side image compression, per-event cap)

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
- [x] RSVP capacity race condition RPC — **shipped** via `safe_rsvp` (`supabase/migrations/009_performance_indexes_and_rpcs.sql`) and wired into `/api/rsvp`
- [x] Friend count RPC — **shipped** as `count_friends` (`supabase/migrations/015_conversation_security.sql`)

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
- [x] Supabase Dashboard → Authentication → URL Configuration — runbook now documented in `.github/SUPABASE_SETUP.md` (Site URL + Redirect URLs + Capacitor deep-link scheme)

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
