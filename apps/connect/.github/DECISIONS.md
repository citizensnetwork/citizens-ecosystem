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

### Diverse content identity (churches included, not dominant)
**Decision:** Connect's hero content is the full tapestry of Kingdom activity — outreaches, creative events, social gatherings, healing retreats, markets, education, church services, prayer meetings, and more. Churches are absolutely valued and present, but are one voice among many, not the dominant content. UI, categories, onboarding, and content strategy should reflect this diversity.
**Why:** The platform's distinctive value is making ALL Kingdom activity visible and discoverable. Every initiative matters equally. The richness comes from the variety.
**Date:** 2026-04-06.

### Equal service to all users
**Decision:** The platform serves organizers and non-organizers with equal dignity. No user or entity type is "first-class" — all are equally valuable Citizens. Non-Christians are welcome to discover the Kingdom too.
**Why:** The platform is a representation of the Kingdom, which serves all its Citizens equally. Organizers create the spaces; non-organizers find where they fit. Both roles are essential — neither is elevated above the other. The Kingdom's door is open.
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
