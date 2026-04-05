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

## Security

### Admin role + owner-only mutations
**Decision:** Add `admin` role to profiles. All update/delete RLS policies check `auth.uid() = created_by OR is_admin()`. Regular users can only modify their own data.
**Why:** User observed that vendors could potentially modify other vendors' events. While RLS already enforced `created_by` checks, adding explicit admin bypass future-proofs moderation. The `is_admin()` helper function keeps policies clean.
**Date:** 2026-04-05.

### Community-driven place verification (no email)
**Decision:** Place verification relies solely on community "still exists?" signals in reviews. A DB trigger auto-flags places after 3+ negative signals. No email-based annual verification.
**Why:** Email verification edge function would cost money at scale. Community signals are free and self-sustaining. Owners can manually re-verify from the place detail page.
**Date:** 2026-04-05.
