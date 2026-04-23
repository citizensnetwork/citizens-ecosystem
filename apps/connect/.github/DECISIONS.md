# Technical Decisions

> Record of key technical choices and their rationale. Prevents future sessions from re-debating solved problems.

## MapTiler Style Verification & Logout Flow (Batch M)

### Dev-only `MapStyleDebugBadge` gated by `NODE_ENV === "development"`
**Decision:** `src/components/map/EventMap.tsx` renders a small bottom-left overlay with the active MapTiler source + style UUID, visible only in dev (`process.env.NODE_ENV === "development"`). Production and test environments render nothing.
**Why:** Previous attempts to swap the MapTiler Cloud style had "no visible effect" reports. Cache-busted rebuilds, `.env.local` reloads, and MapLibre style-loading order all make silent-fallback bugs hard to detect by eye. The badge reads directly from `getMapStyleInfo()` (pure function over the same ENV used by `getMapStyle()`), so if the badge says `maptiler / 019dba0f…` the runtime is unambiguously using that Cloud style. If it says `carto-raster`, MapTiler failed to load (key/network). The `=== "development"` gate (rather than `!== "production"`) is the stricter form: it excludes `"test"` and avoids polluting Vitest component snapshots. Next.js 15 DefinePlugin inlines `process.env.NODE_ENV`, so the badge + `MapStyleDebugBadge` component are dead-code-eliminated from the production client bundle.
**Date:** Batch M.

### Logout from `/events` shell pushes `/` before refreshing
**Decision:** `EventsView.handleLogout` calls `router.push("/")` **then** `router.refresh()`. Navbar's `handleLogout` already did this; the events-shell path did not.
**Why:** `router.refresh()` alone re-renders the current segment (`/events`) with a now-signed-out session; the user briefly sees an authenticated shell frame before middleware resolves, and has no visible path back to login / guest landing. Push-then-refresh navigates first (queued client-side transition) and refresh invalidates the RSC cache so the landing page renders with the new session. `window.location.assign("/")` was considered as a hammer but rejected for now — it's a full reload and only worth it if stale singleton subscriptions (e.g., NotificationBell realtime channel) are observed leaking.
**Date:** Batch M.

## Contributor Applications & My Events (Batch L)

### Direct insert on `/api/contributor/apply` instead of Edge Function proxy
**Decision:** `POST /api/contributor/apply` inserts the `contributor_applications` row directly through the caller's RLS-scoped Supabase client, then flips `profiles.contributor_status` to `pending`. The `submit-contributor-application` Edge Function is no longer invoked synchronously from this route.
**Why:** Previously the route proxied the full insert through the Edge Function so it could attach an admin email. Any deploy skew, missing Resend/HMAC secret, or Edge cold-start error surfaced to users as a generic "Something went wrong" and — critically — left no DB row, so applications were silently lost. Route latency and visible success should not be coupled to an external email provider.
**Trade-off / gap:** Admin email notification is **deferred** in this batch. Pending applications are still reviewable in the `/admin/contributors` inbox (reads `contributor_applications WHERE status='pending'`). When email notification returns, it should be wired as a Supabase DB webhook on insert (or a cron sweep), not reintroduced inline on the request path.
**Date:** Batch L.

### `events/loading.tsx` = neutral backdrop, not skeleton
**Decision:** The events-segment loading boundary renders an `aria-hidden` full-bleed `bg-white` div (no shimmer, no fade-rise) instead of a fade-rise skeleton or `return null`.
**Why:** On `/events/[id]` navigation the `@panel` parallel slot intercepts with `SidePanel`, which owns its own right-edge slide-in. A fade-rise skeleton played at the same time read as "a window drawing up from the bottom mid-way before settling into a side panel" — the exact glitch flagged in the Batch L bug list. `return null` fixed the glitch on intercepted navigation but flashed white on cold deep-links (no prior map paint). A neutral backdrop hides the cold-load flash while being visually inert behind the sliding panel.
**Date:** Batch L.

### Hash-based tab persistence on `/events/manage`
**Decision:** `MyEventsTabs` mirrors the active tab to `window.location.hash` (`#created` / `#joined`) via `history.replaceState` and reads it back lazily in `useState` initialisation + on `hashchange`.
**Why:** Deep-links to "show me the events I RSVPed to" are shareable without server-side routing changes, and `replaceState` keeps the browser back-stack clean (no per-tab-click history entry). Lazy state initialiser paints the right tab on first render, avoiding a hydration flicker from `"created"` → `"joined"`.
**Keyboard a11y:** Roving `tabIndex` (active=0, inactive=-1) + `ArrowLeft`/`ArrowRight`/`Home`/`End` move focus and activate, per WAI-ARIA tab pattern.
**Date:** Batch L.

## Tags & Discovery

### 5-tag cap per event, enforced at DB trigger level
**Decision:** Each event may have at most 5 `event_tag_assignments`. Enforced by a `BEFORE INSERT` trigger raising `event_tag_cap_reached` (P0001), surfaced as HTTP 409 by `/api/events/[id]/tags`.
**Why:** UX hygiene — encourages curation over hashtag spam. Trigger-based enforcement is race-safe vs. application-level pre-count which can be defeated by parallel requests.
**Date:** Batch K (migration 056).

### Tag hide vs delete: soft-hide only
**Decision:** Admin moderation toggles `event_tags.is_hidden=true` rather than deleting rows. Hidden tags are filtered from `GET /api/tags` and from public chip rendering, but historical `event_tag_assignments` rows persist.
**Why:** Preserves attribution history and avoids cascading deletion across past events. Reversible — un-hiding restores discoverability without backfill.
**Date:** Batch K.

### Tag slug regex: `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`
**Decision:** Slugs are 1-40 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens. `slugifyTag()` performs NFKD diacritic strip → lowercase → non-alnum→`-` → trim hyphens → 40-char slice → re-trim trailing hyphen.
**Why:** Matches PostgREST URL safety, avoids accidental empty/leading-hyphen slugs from punctuation-only input, normalises diacritics so `Café` and `Cafe` collide cleanly.
**Date:** Batch K.

### Post-event review prompt window: 1-25 hours after end
**Decision:** Daily cron `prompt-post-event-reviews` selects events whose end-time (or `date + 2h` fallback for date-only events) falls in `(now - 25h, now - 1h)`. Excludes attendees who already reviewed via Set-keyed `${event_id}::${user_id}`. Honours `event_reminders` notification preference.
**Why:** Single daily window catches every event exactly once with safety margin (1h post-end avoids in-progress events; 25h cap allows the cron to slip up to an hour without missing events). Pref filter respects user opt-out.
**Date:** Batch K.

### Citizen event quota: 30-day rolling window (UX banner)
**Decision:** `/events/new` server-component performs a server-side pre-check querying events created in last 30 days for the citizen and renders a glass-panel banner with the next-allowed date + CTA to `/contributor/apply` when limit hit. DB-level enforcement was already shipped in migration 037.
**Why:** Rolling window matches user mental model better than calendar month (which would let someone post 30 Jan + 1 Feb back-to-back). Pre-check is UX-only — RLS / server validation remains the security boundary.
**Date:** Batch K.

## Legal & Indemnity

### Platform-terms acceptance: client-side gate (not server-side blocker)
**Decision:** `TermsAcceptanceGate` is a client-mounted modal in the root layout that blocks UI until `profiles.terms_accepted_at` is set. API mutation routes (`/api/rsvp`, `/api/events`, `/api/places`, `/api/conversations`, etc.) **do NOT** additionally enforce terms acceptance server-side.
**Why:** Acceptance is treated as an onboarding UX step + audit artefact, not a hard precondition for every mutation. All mutations already require auth, and the gate intercepts on first authed visit. Adding a shared `requireTermsAccepted()` wrapper would bloat every route for a theoretical attacker who bypasses JS and accepts Supabase-auth-only access — but they still produce a `platform-terms-v1` signature row audit gap, not a legal exposure, because we hold the terms agreement gate as evidence of notice on first visit.
**Revisit if:** Legal counsel requires proof of acceptance timestamp preceding every event creation / RSVP — in which case promote to server-side middleware.
**Date:** Batch J (legal acceptance wiring).

### Partial unique indexes for platform-scope indemnity signatures
**Decision:** `indemnity_signatures` uniqueness is enforced via three partial unique indexes, not a single `UNIQUE(template_id, user_id, event_id, place_id)` constraint.
**Why:** Postgres defaults to `NULLS DISTINCT`, meaning a composite UNIQUE with nullable columns permits multiple rows where the nullable columns are NULL. The platform terms signature has both `event_id` and `place_id` NULL, so the blunt UNIQUE would allow duplicate platform acceptances. Partial indexes scoped by `WHERE event_id IS NULL AND place_id IS NULL`, `WHERE event_id IS NOT NULL`, and `WHERE place_id IS NOT NULL` produce the correct semantics.
**Date:** Migration 055.

### Attendee participation waiver: `required=false`, UI-enforced per-user
**Decision:** `attendee-participation-waiver` template is seeded with `required=false` so it does not appear in the organiser's `EventFormWithIndemnity` gate (which filters `applies_to=events AND required=true`). Instead, `RSVPButton` calls `/api/indemnity/template?slug=attendee-participation-waiver` before the first RSVP and opens `AttendeeWaiverModal` if `hasSigned=false`.
**Why:** Attendees should sign once across all events, not be prompted every RSVP; organisers should not see the attendee waiver in their creation flow.
**Note:** `hasSigned` in `/api/indemnity/template` is intentionally scoped globally per (template_id, user_id) — ignoring event/place — to support this once-per-user semantics.
**Date:** Batch J.

## Architecture

### Raw Leaflet API (not react-leaflet)
**Decision:** Use `L.map()`, `L.marker()` directly in `useEffect` with `useRef`.
**Why:** react-leaflet breaks under React 18 Strict Mode — double-mounting causes "Map container is already initialized." Raw Leaflet with `map.remove()` cleanup is the only reliable pattern.
**Date:** Early development.

### Server Components + Client Components split
**Decision:** Pages are async Server Components that fetch data. Client interactivity in `src/components/` with `"use client"`.
**Why:** Next.js 15 App Router default. Keeps data fetching on the server (faster, secure), client bundles small.

### Supabase dual-client pattern
**Decision:** Two separate client factories — `server.ts` (async, cookies) and `client.ts` (sync, browser).
**Why:** Supabase SSR package requires cookie access for server-side auth. Using the wrong client causes auth failures or hydration mismatches.

### FullCalendar (not custom grid)
**Decision:** Replaced hand-built month grid with `@fullcalendar/react` in Phase 4.
**Why:** Custom grid couldn't scale to week/day views. FullCalendar provides all 3 views, proper time rendering, event overflow, drag support, and accessibility out of the box.

## UI System

### 60/30/10 white-black-gold ratio
**Decision:** White surfaces (60%), black typography (30%), gold accents (10%).
**Why:** User-specified brand direction. Gold (`#c8a24f`) is the primary accent. No blue-primary patterns.

### Monochrome + Gold mature design (emoji-free)
**Decision:** Remove all emojis from UI. Replace with inline SVGs (icons) or Unicode glyphs (notification indicators). Category colors changed from rainbow to alternating white/grey palette (`#d4d4d4`–`#f5f5f5`). Event markers: black icon (#111) in 40px circle with gold (#D4AF37) outline. Place markers: bare gold SVG icon (28px, no bubble/background) with CSS drop-shadow. Calendar events: RSVP'd = gold background (#D4AF37), un-RSVP'd = white/grey CATEGORY_COLORS. Burger menu section icons in gold.
**Why:** User feedback: emoji + rainbow colors made the app "seem very child-like." Further refined: too much black in calendar → lighter white/grey palette with gold RSVP distinction. Place markers were hiding events → made smaller with no background. Monochrome + gold is mature, premium, and brand-consistent. No icon library added — all SVGs are inline for zero bundle cost.
**Date:** 2026-04-08 (refined from 2026-04-07).

### Map viewpoint persistence
**Decision:** Store map center + zoom in `sessionStorage` (`cc-map-viewpoint` key). Restore on remount; skip autoLocate and first fitBounds when a stored view exists.
**Why:** Users expect the map to stay where they left it when navigating to event details and back. Session-scoped (not localStorage) so it resets with a fresh tab.
**Date:** 2026-04-08.

### Place follows
**Decision:** `place_follows` table (user_id, place_id, UNIQUE) with RLS. API at `/api/place-follow` (POST/DELETE). `FollowPlaceButton` component with optimistic count.
**Why:** Users want to follow favourite places for future notification integration. Mirrors the user-follow pattern from Phase 8.
**Date:** 2026-04-08.

### Map-first full-screen events
**Decision:** `/events` is a full-viewport map with no page headers. All controls float.
**Why:** Google Maps-like experience for community discovery. The map IS the page.

### Floating controls over the map
**Decision:** Search bar, title chip, filter burger, and calendar toggle float above the map with `pointer-events-none` container + `pointer-events-auto` on interactive elements.
**Why:** Maximizes map viewport while keeping navigation accessible.

## Database

### RLS-first security
**Decision:** All tables use Row Level Security. Anon key is safely exposed.
**Why:** Supabase best practice. RLS policies enforce access at the database level regardless of client.

### Idempotent migrations
**Decision:** All migrations use `IF NOT EXISTS`, `DO $$ BEGIN ... END $$` blocks.
**Why:** Safe to re-run. Prevents deployment failures if migration runs twice.

### Auto-create profile on signup
**Decision:** PostgreSQL trigger `on_auth_user_created` creates a `profiles` row from auth metadata.
**Why:** Eliminates race conditions. Profile exists immediately after signup without a second roundtrip.

## Environment

### Local Next.js binary (not global)
**Decision:** Build with `.\node_modules\.bin\next.cmd`, never `npx next build`.
**Why:** Global Next.js 16 is installed on this machine. Project uses Next.js 15. `npx` may resolve the wrong version.

### PATH prepend every session
**Decision:** Run `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` before any Node commands.
**Why:** Windows PowerShell doesn't persist PATH additions between terminal sessions.

### Repository-local Git identity lock (Citizens Connect)
**Decision:** For this repository, enforce local commit identity as Name = Citizens Network and Email = citizensnetworkpbo@gmail.com, with `user.useConfigOnly=true`, plus local hooks that block commits/pushes if identity or origin URL drift.
**Why:** Guarantees all edits, commits, and pushes are attributed to the Citizens Network owner account for this project, independent of global Git config.
**Ops Note:** This enforcement is clone-local (`.git/config` + `.git/hooks`) and is not versioned by Git. Re-apply after cloning to a new machine/clone.
**Date:** 2026-04-13.

### Pin Node runtime to 22.x
**Decision:** Pin project runtime using `.nvmrc` (`22`) and `package.json` engines (`>=20 <23`).
**Why:** Node 24 triggered unstable Next.js build behavior in this environment; Node 22 is the safer baseline for Next.js 15 here.
**Date:** 2026-04-05.

### styled-jsx for component-scoped CSS
**Decision:** Use `<style jsx global>` in map components for marker/cluster animations.
**Why:** Next.js includes styled-jsx by default. Avoids separate CSS files for small component-specific animations (like the live event pulse).

### Supabase secrets in `.env.local` only
**Decision:** Keep Supabase connection secrets in `.env.local` and never duplicate them in `.github/` continuity files.
**Why:** Preserves security while still allowing full project continuity through non-secret docs.
**Date:** 2026-04-05.

### Continuity-first workflow assets
**Decision:** Add reusable continuity assets (`.github/AGENTS.md`, continuity prompt, continuity agent) so tasks can resume from repository files without chat history.
**Why:** User should be able to delete conversations without losing execution context, process, or project memory.
**Date:** 2026-04-05.

### MCP-first migration execution
**Decision:** Use MCP migration tooling as the default path to apply Supabase migrations from this project instead of relying on local Supabase CLI runtime.
**Why:** Local environment instability (Node/CLI/terminal issues) should not block schema progress; MCP provides direct, verifiable migration application.
**Date:** 2026-04-05.

### Dedicated Supabase reconnect workflow
**Decision:** Maintain a reconnect runbook and a reusable reconnect prompt in `.github/`.
**Why:** Fast recovery from auth/env/schema linkage issues without depending on chat history.
**Date:** 2026-04-05.

## Phase 10: Notifications

### In-app + Push notification model
**Decision:** Store all notifications as in-app rows in `notifications` table. Push delivery via FCM is optional — if `FCM_SERVICE_ACCOUNT_JSON` is not configured, notifications are still stored in-app.
**Why:** Graceful degradation. Platform works without FCM credentials. In-app notifications via Supabase Realtime provide instant UX regardless.
**Date:** Phase 10.

### FCM HTTP v1 API (not legacy)
**Decision:** Use `https://fcm.googleapis.com/v1/projects/{project}/messages:send` with OAuth2 service account credentials.
**Why:** FCM legacy API (`fcm.googleapis.com/fcm/send`) was shut down June 2024. v1 is the only supported path.
**Date:** Phase 10.

### Notification digest preferences (instant/daily/off)
**Decision:** `notification_digest` column on `profiles` with three values: `instant` (push immediately), `daily` (batch at 7 AM), `off` (in-app only, no push).
**Why:** Respects user preference for notification frequency. Reduces notification fatigue while keeping in-app discovery.

### Edge Functions for notification triggers
**Decision:** Five Supabase Edge Functions handle notification dispatch: `notify-interested-users`, `notify-event-cancelled`, `send-rsvp-reminders`, `notify-new-follower`, `send-daily-digest`.
**Why:** Server-side processing keeps notification logic out of the client. Edge Functions run on Deno with service role key (bypasses RLS). Triggered by DB webhooks or pg_cron.

### Supabase Realtime for live notifications
**Decision:** NotificationBell subscribes to `postgres_changes` on `notifications` table filtered by `user_id`.
**Why:** Instant in-app notification delivery without polling. Requires Realtime publication enabled on the `notifications` table (Supabase Dashboard → Database → Publications).

### Shared push utility pattern
**Decision:** `supabase/functions/_shared/push.ts` accepts a Supabase client parameter instead of creating its own.
**Why:** Avoids duplicate client instantiation across Edge Functions. Each function creates one client and passes it through.

## Phase 11: Direct Messaging

### DM-only conversations (no group chat)
**Decision:** Conversations are strictly 1:1 between two users. The `find_conversation()` function deduplicates — same two users always share one conversation.
**Why:** Group chat adds UI/UX complexity out of scope. 1:1 covers the primary use case: attendee→organizer communication and user-to-user networking.
**Date:** Phase 11.

### Message body limit 2000 characters
**Decision:** `messages.body CHECK (char_length(body) BETWEEN 1 AND 2000)`.
**Why:** Prevents abuse (wall-of-text spam) while being generous enough for meaningful messages.
**Date:** Phase 11.

### Cursor-based message pagination
**Decision:** Messages API uses `?before=<message_id>` cursor pagination (not offset-based).
**Why:** Cursor pagination is stable under concurrent inserts — new messages don't shift pages. Offset pagination would cause duplicate/skipped messages during active chats.
**Date:** Phase 11.

### `updated_at` trigger for conversation ordering
**Decision:** A trigger on `messages` INSERT updates `conversations.updated_at` to `now()`.
**Why:** Inbox list orders by `updated_at DESC` — most recent conversations float to top without extra queries.
**Date:** Phase 11.

## Avoided Approaches

| Approach | Why Avoided |
|----------|-------------|
| react-leaflet | Strict Mode crash (double mount) |
| tailwind.config.js | Tailwind v4 uses CSS-based config |
| Service role key in client | Security risk — always use anon key + RLS |
| `useCallback` + `loadComments` pattern | Caused setState-during-render. Use inline fetch with `cancelled` flag instead |
| Global `<img>` elements | Lint warning. Use `next/image` for remote, `<img>` with eslint-disable for blob previews only |
| Annual email verification cron | Removed — email sending cost scales with user base. Community-signal verification (still_exists checkbox + auto-flag trigger) is sufficient for now |

## Agents & Automation

### 11-agent system (9 focused + 2 support)
**Decision:** Build an agent system with Architect, Testing, Refactor, Data, Community, Notification, Product Lead as new agents alongside existing UI, Schema Architect, UI Consistency Review, and Continuity Manager. Operations agent deferred until first 100 users.
**Why:** Prevents "vibe code collapse" — each agent enforces its discipline. Two layers: interactive VS Code agents for dev-time assistance + GitHub Actions CI for automated enforcement on every push.
**Date:** 2026-04-06.

### Architect absorbs Code Quality Review + API design
**Decision:** Merged code-quality-review.agent.md into a broader Architect agent covering architecture, security, performance, accessibility, and API design review.
**Why:** Three overlapping read-only reviewers (code quality, API, architecture) would cause confusion about which to invoke. One comprehensive Architect agent with a clear scorecard is cleaner.
**Date:** 2026-04-06.

### Community absorbs Growth
**Decision:** Growth/marketing scope merged into Community agent rather than a separate Growth agent.
**Why:** At current scale, SEO/OG/content strategy is community strategy. Separate growth agent would have too thin a scope. Can split later if marketing becomes complex enough to warrant it.
**Date:** 2026-04-06.

### Operations agent deferred
**Decision:** Don't create an Operations agent until first 100 users or first moderation incident.
**Why:** Moderation, support, and partnership agents need real operational data to be useful. Premature creation adds cognitive overhead without providing value.
**Date:** 2026-04-06.

### Vitest for testing (not Jest)
**Decision:** Use Vitest + @testing-library/react for unit/integration tests, Playwright for E2E.
**Why:** Vitest has better ESM support, is faster, and has official Next.js support via `next/vitest`. Playwright is lighter than Cypress with better multi-browser support.
**Date:** 2026-04-06.

### E2E tests local-only initially
**Decision:** Playwright E2E tests run locally via Testing Agent, not in GitHub Actions CI.
**Why:** E2E tests need a running Supabase backend. Mocking Supabase in CI is fragile. CI runs unit tests + typecheck + lint + build. E2E moves to CI when a dedicated test Supabase project is configured.
**Date:** 2026-04-06.

### Free-first infrastructure scaling
**Decision:** Optimize within free tiers first (indexes, caching, pagination). Upgrade to paid services only at measured thresholds (DB > 400MB → Supabase Pro, bandwidth > 100GB → Vercel Pro).
**Why:** No revenue yet. Every optimization within free tier extends runway. Upgrade triggers are documented so the transition is planned, not reactive.
**Date:** 2026-04-06.

## Security

### Platform Vision & Ecosystem Identity
**Decision:** Citizens is the parent brand/ecosystem. Citizens Connect is the flagship channel (events/discovery). Future channels: Citizens Wear (Christian fashion marketplace), Citizens Central (entity directory + collaboration hub), Citizens Impact (corporate social impact platform). Full vision documented in `.github/VISION.md`.
**Why:** Every feature decision must be evaluated against the ecosystem mission: restoring Kingdom unity, visibility, and collaboration. Cross-channel readiness should inform architecture choices. Feature evaluation criteria: does it increase visibility, connect siloed entities, highlight entity value, enable collaboration, serve discovery, and move toward ecosystem readiness?
**Date:** 2026-04-06.

## Phase 12: Security + Featured + Live Location

### In-memory sliding-window rate limiter
**Decision:** Custom in-memory rate limiter using a `Map<string, timestamps[]>` with auto-cleanup. Pre-configured limits: mutation (30/min), message (20/min), auth (10/min), heavy (5/min). All 429 responses include `Retry-After` header.
**Why:** No external dependency needed at current scale. Redis (Upstash) swap documented for multi-instance scaling. Sliding window is more precise than fixed window.
**Date:** Phase 12.

### CSP without unsafe-eval
**Decision:** Content-Security-Policy uses `'unsafe-inline'` (required by Next.js) but NOT `'unsafe-eval'` in production.
**Why:** `unsafe-eval` permits `eval()` and `new Function()` — effectively nullifies XSS protection. Next.js production builds do not require it. Longer-term: migrate to nonce-based CSP.
**Date:** Phase 12.

### Featured listings (polymorphic)
**Decision:** `featured_listings` table with polymorphic `event_id` / `place_id` references (exactly one must be set, enforced by CHECK constraint). Admin-only write, public read. Priority ordering.
**Why:** Featured panel needs to showcase both events and places. Polymorphic pattern with CHECK constraint is simpler than separate featured_events/featured_places tables. Admin control prevents user self-promotion.
**Date:** Phase 12.

### Live location with RSVP-enforced RLS
**Decision:** `user_locations` table with RLS INSERT/UPDATE policies that verify the user has an RSVP for the target event (not just `auth.uid() = user_id`). Coordinate precision truncated to 4 decimal places (~11m).
**Why:** The API validates RSVP, but RLS must also enforce it — the Supabase anon key is client-exposed, so direct inserts would bypass API checks. Precision truncation protects exact position (centimeter accuracy is unnecessary for event attendance).
**Date:** Phase 12.

### Location sharing opt-in model
**Decision:** `location_sharing` boolean column on profiles (default `false`). Users must explicitly enable sharing. Hook enforces minimum 15s tracking interval and stops polling on error.
**Why:** Location data is sensitive. Default-off respects privacy. Minimum interval prevents DoS. Error-stop prevents infinite retry loops.
**Date:** Phase 12.

### Idempotent migration policies
**Decision:** All RLS `CREATE POLICY` statements wrapped in `DO $$ BEGIN IF NOT EXISTS ... END IF; END $$;` pattern.
**Why:** Bare `CREATE POLICY` fails on re-run. Idempotent pattern is the established project convention (per supabase-patterns instructions).
**Date:** Phase 12.

### Vercel env vars for NEXT_PUBLIC_ Supabase config
**Decision:** Always set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Vercel environment variables (production + preview). Verify after every fresh deploy that JS bundles contain real URLs, not placeholders.
**Why:** `NEXT_PUBLIC_` env vars are inlined at build time. The client code has `|| "placeholder..."` fallbacks for prerender resilience, but if Vercel's build environment lacks the vars, the placeholders get baked into production bundles permanently, causing "Failed to fetch" on all auth operations.
**Date:** 2026-04-06.

### Auth callback route for PKCE flows
**Decision:** Add `/auth/callback` route that calls `exchangeCodeForSession(code)`. Password reset, email confirmation, and magic link flows all redirect through this route.
**Why:** Supabase uses PKCE by default for email-based auth flows. Without a callback route, the auth code in the redirect URL is never exchanged for a session.
**Date:** 2026-04-06.

### Diverse content identity (churches included, not dominant)
**Decision:** Connect's hero content is the full tapestry of Kingdom activity — outreaches, creative events, social gatherings, healing retreats, markets, education, church services, prayer meetings, and more. Churches are absolutely valued and present, but are one voice among many, not the dominant content. UI, categories, onboarding, and content strategy should reflect this diversity.
**Why:** The platform's distinctive value is making ALL Kingdom activity visible and discoverable. Every initiative matters equally. The richness comes from the variety.
**Date:** 2026-04-06.

### Equal service to all users
**Decision:** The platform serves organizers and non-organizers with equal dignity. No user or entity type is "first-class" — all are equally valuable Citizens. Non-Christians are welcome to discover the Kingdom too.
**Why:** The platform is a representation of the Kingdom, which serves all its Citizens equally. Organizers create the spaces; non-organizers find where they fit. Both roles are essential — neither is elevated above the other. The Kingdom's door is open.
**Date:** 2026-04-06.

### Event creation open to all users
**Decision:** ALL logged-in users can create events, not just vendors. Vendors get an extra "Book at Place" section in EventForm that allows inline place creation during event booking.
**Why:** User requested. Community Citizens should be able to add events. Organisers have the additional ability to create persistent places via the event booking flow. Place creation is now exclusively through the vendor event form (no standalone "Add Place" button in BurgerMenu).
**Date:** 2026-04-06.

### "Community Member" renamed to "Community Citizen"
**Decision:** The user-facing label for the `client` role is "Community Citizen" (was "Community Member"). DB role value remains `client`.
**Why:** User requested. Aligns with the Citizens brand identity — all users are Citizens.
**Date:** 2026-04-06.

### Places cannot be removed within 6 months
**Decision:** Places cannot be deleted within 6 months of creation. Only admin users can delete places. This is noted in the place creation UI.
**Why:** User requested. Prevents transient/spam place listings and preserves map data integrity.
**Date:** 2026-04-06.

### Navigation: title→map, Events→calendar
**Decision:** "Citizens Connect" title in both Navbar and EventsView links to `/events` (map home). "Events" link in Navbar goes to `/events?view=calendar`. EventsView reads `?view=calendar` query param for initial view.
**Why:** User requested. Provides clear navigation from non-map pages (event creation, profile) back to the primary map/calendar views.
**Date:** 2026-04-06.

### Scale as discovery signal (expected attendance)
**Decision:** Events should expose expected attendance size as a discovery filter. Equal platform dignity means a 5-person home group and a 2,000-person conference both appear and are findable — but users should be able to see and filter by expected scale to self-select the right setting.
**Why:** A large worship night and a small discipleship circle serve different needs. Hiding scale in the name of equity would actually harm discovery. Size is informational, not hierarchical.
**Date:** 2026-04-06.

### Admin role + owner-only mutations
**Decision:** Add `admin` role to profiles. All update/delete RLS policies check `auth.uid() = created_by OR is_admin()`. Regular users can only modify their own data.
**Why:** User observed that vendors could potentially modify other vendors' events. While RLS already enforced `created_by` checks, adding explicit admin bypass future-proofs moderation. The `is_admin()` helper function keeps policies clean.
**Date:** 2026-04-05.

### Community-driven place verification (no email)
**Decision:** Place verification relies solely on community "still exists?" signals in reviews. A DB trigger auto-flags places after 3+ negative signals. No email-based annual verification.
**Why:** Email verification edge function would cost money at scale. Community signals are free and self-sustaining. Owners can manually re-verify from the place detail page.
**Date:** 2026-04-05.

### Events INSERT RLS opened to all authenticated users
**Decision:** Dropped the `"Vendors can create events"` RLS policy (which required `role in ('vendor', 'admin')`) and replaced it with `"Authenticated users can create events"` (`auth.uid() = created_by`). Migration `012_open_event_creation` applied via MCP.
**Why:** After Phase 8.5 removed the vendor gate from `/events/new` UI, non-vendor users could reach the form but RLS blocked their inserts silently. Flagged in architect audit as critical security/functionality mismatch.
**Date:** 2026-04-06.

### Atomic conversation creation via SECURITY DEFINER RPC
**Decision:** Replaced the `find_conversation` + manual INSERT flow with a single `find_or_create_conversation` RPC that atomically finds or creates conversations. The conversation_participants INSERT policy was tightened from `auth.uid() is not null` (any user could join any conversation) to admin-only (all creation goes through the SECURITY DEFINER RPC). Migration `015_conversation_security`.
**Why:** Architect audit identified two critical issues: (1) TOCTOU race — concurrent requests could create duplicate conversations; (2) overly permissive RLS — any authenticated user could add themselves to any conversation.
**Date:** 2026-04-07.

### count_friends RPC for profile page
**Decision:** Added `count_friends(target_user)` Postgres function using a self-join on follows. Profile page includes it in the main `Promise.all` batch instead of a sequential waterfall.
**Why:** Profile page had a sequential await for bidirectional follow counting that depended on data from the first batch. The RPC eliminates the waterfall.
**Date:** 2026-04-07.

### Single useFocusTrap in hooks/ directory
**Decision:** Consolidated two focus trap implementations into one at `src/hooks/useFocusTrap.ts`. Deleted duplicate at `src/components/ui/useFocusTrap.ts`.
**Why:** Two different APIs caused confusion. The hooks/ version is superior — supports `active` toggle, previous focus restoration, and returns a ref.
**Date:** 2026-04-07.

### Font CSS variable renamed from --font-geist-sans to --font-montserrat
**Decision:** The `next/font` variable for Montserrat was renamed from `--font-geist-sans` to `--font-montserrat`. The `@theme inline` block in globals.css builds the full `--font-sans` stack from it.
**Why:** The old name was a leftover from the Next.js starter template (Geist font) and was misleading.
**Date:** 2026-04-07.

## UX & Map Behavior

### Map viewport locked after initial fitBounds
**Decision:** After the first `fitBounds` call (or sessionStorage restore), `hasRestoredView.current` stays `true` permanently. Category filtering, search, and other marker updates never call `fitBounds` — only the initial load or explicit `flyTo` prop can move the camera.
**Why:** Users expect the map to stay where they positioned it when toggling filters. Auto-zooming to fit filtered results destroys spatial context. Aligns with Google Maps convention: filtering is a data operation, not a navigation operation.
**Date:** 2026-04-09.

### No scale transforms on edge-anchored UI elements
**Decision:** Buttons positioned with `absolute` and translate transforms should not use `active:scale-95`. Use `transition-colors` + `active:bg-black/5` for press feedback instead.
**Why:** `scale-95` on absolutely-positioned elements with existing transforms causes compound transform recalculation, visually shifting adjacent panels and the map. Color-only transitions are cheaper and more stable.
**Date:** 2026-04-09.

### Interactive styles belong on buttons, not wrapper divs
**Decision:** `active:scale-95`, `active:brightness-90`, etc. should only be applied to the actual `<button>` element, never to a non-interactive wrapper `<div>`.
**Why:** Wrapper divs may contain dropdown panels or other child elements. Scaling the wrapper causes the entire subtree (including open panels) to bounce, which is a visual bug.
**Date:** 2026-04-09.

## Features

### Place edit/delete (owner + admin)
**Decision:** Place owners and admins can edit places at `/places/[id]/edit`. Deletion enforces the 6-month creation rule client-side. Edit button visible on place detail page for owner/admin only.
**Why:** Completes the place CRUD cycle. Deletion rule already established in Phase 8.5 but lacked UI enforcement.
**Date:** 2026-04-09.

### Admin category management UI
**Decision:** Admin-only page at `/admin/categories` with CategoryManager component for CRUD operations on the `categories` table. Accessible via BurgerMenu link (visible to admin role only).
**Why:** Categories were previously only managed via direct DB access or migrations. Admin needs UI for adding/editing/removing categories as the platform grows.
**Date:** 2026-04-09.

## CI/CD

### GitHub Actions CI pipeline
**Decision:** `.github/workflows/ci.yml` runs typecheck + lint + test + build on every push/PR to main. Uses Node.js version from `.nvmrc`, npm cache.
**Why:** 333 tests exist but no automated enforcement. CI catches regressions before merge. E2E tests remain local-only until a dedicated test Supabase project is configured.
**Date:** 2026-04-09.

### Global iteration framework
**Decision:** Every code iteration follows: Context → Implement → SE Agent Review Chain (Architect → Security → DevOps → Responsible AI → UX → Product Manager → Tech Writer) → Enforce A-grade standards → Optimize file arrangement → Update project assets → Git push.
**Why:** User-requested quality framework. SE agents provide multi-discipline review. Standards enforced on ALL new code (not N-1). Framework saved globally for reuse across projects.
**Date:** 2026-04-09.

### Polyglot testing pipeline
**Decision:** Testing follows: Researcher → Planner → Generator → Builder → Tester → Fixer → Linter. Framework saved globally for reuse.
**Why:** Structured approach ensures comprehensive coverage with proper planning. Research phase identifies gaps, planner prioritizes by ROI, generator implements in phases.
**Date:** 2026-04-09.

### Expanded role system (migration 025)
**Decision:** Replaced 3-role system (vendor/client/admin) with 7 roles (individual/ministry/organization/business + legacy vendor/client + admin). All existing users migrated to `individual`. New signups choose from 4 roles. Legacy roles kept in DB constraint for backward compat.
**Why:** Platform identity serves organizers and non-organizers equally. Expanded roles give ministry, organization, and business entities distinct identity while preserving the "all citizens can create events" principle. Place creation restricted to organiser roles (ministry/organization/business/admin).
**Date:** 2026-06-06.

### Role self-escalation prevention
**Decision:** Two DB triggers protect roles: (1) `handle_new_user()` whitelists self-assignable roles (no admin); (2) `protect_role_column()` silently reverts non-admin role changes on profile UPDATE.
**Why:** SE Security review found users could self-assign admin via signup metadata or profile UPDATE. Both vectors now blocked at the DB level.
**Date:** 2026-06-06.

### category_id FK with text column sync trigger
**Decision:** Added `category_id uuid REFERENCES categories(id)` to events alongside existing text `category` column. A `sync_event_category_id` trigger auto-fills `category_id` from text column on INSERT/UPDATE.
**Why:** Enables proper FK joins for category queries while maintaining backward compatibility with existing code that uses the text category column. Text column to be deprecated in a future migration.
**Date:** 2026-06-06.

### is_organiser() DB function for RLS
**Decision:** Created `is_organiser()` function that checks if current user has role IN ('ministry', 'organization', 'business', 'admin'). Used in places INSERT RLS policy.
**Why:** Centralizes the organiser role check in the DB layer, similar to existing `is_admin()`. Prevents bypass via direct Supabase client calls.
**Date:** 2026-06-06.
