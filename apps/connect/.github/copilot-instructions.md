# Citizens Connect

Part of the **Citizens ecosystem** — see `.github/VISION.md` for full platform vision, mission, and feature evaluation criteria.

Citizens Connect is the flagship channel: a map-first community discovery platform that serves organizers and non-organizers equally. It surfaces the vibrant, diverse layer of Christian community activity — outreaches, creative events, social gatherings, workshops, healing retreats, markets, celebrations, church services, and more — helping people find the spaces where they fit best and grow the most. Open to all, including non-Christians discovering the Kingdom. Next.js 15 App Router + Supabase + Leaflet + Tailwind CSS v4. Slogan: **Connecting the Kingdom** (Ephesians 2:19–22).

## Build & Run

```bash
npm run dev      # Dev server (may auto-pick port if 3000 is busy)
npm run build    # Production build
npm run lint     # ESLint
npx tsc --noEmit # Type check (no test framework yet)
```

Preferred Node.js version: 22.x (`.nvmrc` is pinned to `22`).

**Windows PATH issue:** Node.js PATH doesn't persist between terminal sessions. Prepend before running commands:
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
```

## Architecture

- **App Router (RSC):** Pages in `src/app/` are async Server Components that fetch data. Client interactivity lives in `src/components/` with `"use client"`.
- **Supabase dual-client:** `await createClient()` from `src/lib/supabase/server.ts` in server components/routes. `createClient()` from `src/lib/supabase/client.ts` in client components (useEffect, form handlers).
- **RLS-first security:** All tables use Row Level Security. The Supabase anon key is safe to expose — RLS policies enforce access. Vendor role gates event creation. Admin role can override all update/delete policies via `is_admin()` function.
- **Next.js 15 params:** Dynamic route params are `Promise<{id: string}>` — always `await params` before destructuring.

## Key Conventions

### Leaflet Maps (NOT react-leaflet)

Map components use raw Leaflet API with `useEffect`/`useRef` and `map.remove()` cleanup. This avoids React Strict Mode's "Map container already initialized" error.

```tsx
// Pattern: raw Leaflet in useEffect
const containerRef = useRef<HTMLDivElement>(null);
const mapRef = useRef<L.Map | null>(null);

useEffect(() => {
  if (!containerRef.current || mapRef.current) return;
  const map = L.map(containerRef.current).setView(center, zoom);
  mapRef.current = map;
  // ... add tiles, markers
  return () => { map.remove(); mapRef.current = null; };
}, [deps]);
```

All map components must use `dynamic(() => import(...), { ssr: false })` — Leaflet accesses `window` and cannot run server-side.

### Tailwind CSS v4

No `tailwind.config` file. Configured via `@import "tailwindcss"` and `@theme inline` in `src/app/globals.css`. PostCSS plugin is `@tailwindcss/postcss`.

### Supabase Storage

Bucket `event-images` is public. Upload path: `${user.id}/${timestamp}.ext`. Use `getPublicUrl()` for URLs. The Supabase storage domain is configured in `next.config.ts` for `next/image`.

### Event Categories

Hardcoded in components as `CATEGORY_LABELS` and `CATEGORY_COLORS` maps. Categories: church-service, youth, community-outreach, worship, bible-study, prayer, social, other.

## Database

Schema in `supabase/schema.sql` (idempotent — safe to re-run). Migrations in `supabase/migrations/`.

Tables: `profiles` (extends auth.users, roles: vendor/client/admin), `events` (with lat/lng, category, image_url), `rsvps` (unique per user+event), `comments` (on events, with profile join), `categories` (DB-driven), `places` (permanent map listings), `reviews` (ratings + still_exists for places and events), `follows` (social graph, bidirectional = friends), `event_photos`, `event_views`, `push_tokens` (device push tokens), `notifications` (in-app + push), `conversations` (DM threads), `conversation_participants` (many-to-many), `messages` (chat messages with 2000 char limit).

Trigger `on_auth_user_created` auto-creates a profile row from auth metadata on signup.

Storage bucket `event-images` is public. Upload path: `${user.id}/${timestamp}.ext`. Use `getPublicUrl()` for URLs.

## Images

Use `next/image` `<Image>` for Supabase-hosted images (the storage domain is configured in `next.config.ts`). For local blob preview URLs (file upload previews), use `<img>` with `// eslint-disable-next-line @next/next/no-img-element`.

### Map Markers & Clustering

Marker utilities live in `src/lib/map/markers.ts`:
- `createCategoryIcon(category, temporal)` — Returns a Leaflet `divIcon` with category-specific color and emoji
- `getTemporalStyle(dateStr, endDateStr?)` — Returns opacity/scale/isLive based on event proximity to now
- Clustering via `leaflet.markercluster` with gold-branded cluster badges
- Type declarations in `src/types/leaflet.markercluster.d.ts`

## Project Roadmap

See `.github/PROJECT_STATUS.md` for full phase tracker with detailed checklists.

**Completed phases:** App Shell (Phase 2), Full-Screen Map (Phase 3), Calendar (Phase 4), Reviews & Verification (Phase 5), Capacitor Mobile (Phase 6), Event Enrichment & Discovery (Phase 7), Social Graph (Phase 8), Interest Profile & Onboarding (Phase 9), Smart Notifications (Phase 10), Direct Messaging (Phase 11)
**Current phase:** All core phases complete (Phases 1–11)
**Upcoming:** Community feedback & iteration

Platform has two full-screen primary views:
1. **Map view** — full-viewport map with category markers, temporal encoding, clustering, geolocation, detail panel, floating controls
2. **Calendar view** — FullCalendar with day/week/month views, category-colored events, detail panel integration, vendor quick-create on date click
**Platform identity:** Serves organizers and non-organizers equally. All people and entities have equal dignity. Open to non-Christians discovering the Kingdom. See `.github/VISION.md` for full vision.

Upcoming tables: `places` (persistent map listings), `categories` (DB-driven), `reviews` (ratings + "place still exists?" signals). Roles expanding to: individual, ministry, organization, business.", "oldString": "- **Map view** — full-viewport map with category markers, temporal encoding, clustering, geolocation, detail panel, floating controls
2. **Calendar view** — FullCalendar with day/week/month views, category-colored events, detail panel integration, vendor quick-create on date click
Upcoming tables: `places` (persistent map listings), `categories` (DB-driven), `reviews` (ratings + "place still exists?" signals). Roles expanding to: individual, ministry, organization, business.

Mobile via Capacitor wrapper (single codebase).

## Project Customization Files

To preserve decisions across sessions, the project uses these customization files:

### Instructions (auto-applied by file pattern)
- `.github/instructions/project-architecture.instructions.md` — File map, component relationships, data flow, environment details
- `.github/instructions/connect-ui-system.instructions.md` — UI system rules (60/30/10 white-black-gold, floating controls)
- `.github/instructions/leaflet-maps.instructions.md` — Raw Leaflet patterns for map components
- `.github/instructions/supabase-patterns.instructions.md` — Dual-client pattern, RLS, storage, migrations

### Prompts (reusable workflows)
- `.github/prompts/add-supabase-table.prompt.md` — Generate table with migration, types, RLS
- `.github/prompts/apply-supabase-migration.prompt.md` — Create + apply migration via MCP and verify
- `.github/prompts/reconnect-supabase.prompt.md` — Diagnose/reconnect Supabase linkage and verify end-to-end
- `.github/prompts/add-feature.prompt.md` — Scaffold end-to-end feature (DB + API + UI)
- `.github/prompts/apply-connect-ui-spec.prompt.md` — Apply UI system to screens
- `.github/prompts/debug-build.prompt.md` — Diagnose and fix build/type/lint errors
- `.github/prompts/resume-project.prompt.md` — Reconstruct context from files and execute tasks end-to-end
- `.github/prompts/capture-session-context.prompt.md` — Persist progress/decisions after a work session

### Agents (specialized reviewers)
- `.github/agents/architect.agent.md` — Architecture, code quality, security, API design reviewer (read-only)
- `.github/agents/testing.agent.md` — Writes/runs tests, generates fixtures, identifies coverage gaps
- `.github/agents/refactor.agent.md` — Cleans code, enforces patterns, extracts utilities (never changes behavior)
- `.github/agents/data.agent.md` — Seeds data, query performance analysis, index recommendations
- `.github/agents/community.agent.md` — Content strategy, categories, onboarding copy, SEO/OG meta, brand voice
- `.github/agents/notification.agent.md` — Notification templates, Edge Functions, push delivery, frequency management
- `.github/agents/product-lead.agent.md` — Roadmap alignment, feature specs, scope control, progress tracking
- `.github/agents/ui.agent.md` — UI/UX implementation specialist
- `.github/agents/ui-consistency-review.agent.md` — Read-only UI compliance auditor
- `.github/agents/schema-architect.agent.md` — Read-only DB schema advisor
- `.github/agents/continuity-manager.agent.md` — Context reconstruction + implementation + continuity updates

See `.github/AGENTS.md` for the full agent registry, invocation guide, and multi-agent workflows.

### Project Tracking
- `.github/PROJECT_STATUS.md` — Living phase tracker with completion checklists
- `.github/DECISIONS.md` — Technical decision log with rationale (prevents re-debating solved problems)
- `.github/AGENTS.md` — Always-on continuity contract and startup protocol
- `.github/SUPABASE_RECOVERY.md` — Fast reconnect + validation runbook for Supabase issues

If a future request conflicts with these standards, follow explicit user direction for that request and then update the files above to keep the baseline current.
