# Technical Decisions

> Record of key technical choices and their rationale. Prevents future sessions from re-debating solved problems.

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
