# Citizens Connect

Part of the **Citizens ecosystem** — see `.github/VISION.md` for full platform vision, mission, and feature evaluation criteria.

Citizens Connect is the flagship channel: a map-first community discovery platform that serves Citizens and Contributors equally. It surfaces the vibrant, diverse layer of Christian community activity — outreaches, creative events, social gatherings, workshops, healing retreats, markets, celebrations, church services, and more — helping people find the spaces where they fit best and grow the most. Open to all, including non-Christians discovering the Kingdom.

Stack: Next.js 15 App Router · TypeScript · Supabase · MapLibre GL JS · MapTiler Cloud · Tailwind CSS v4 · Capacitor (iOS + Android). Slogan: **Connecting the Kingdom** (Ephesians 2:19–22).

**Locked direction:** `.github/MASTER_DIRECTION.md` is the single source of truth. All features, fixes, and decisions must align with it. Do not add features or refactor speculatively.

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
- **RLS-first security:** All tables use Row Level Security. The Supabase anon key is safe to expose — RLS policies enforce access. Contributor role gates event creation. Admin role can override all update/delete policies via `is_admin()` function.
- **Next.js 15 params:** Dynamic route params are `Promise<{id: string}>` — always `await params` before destructuring.

## Key Conventions

### MapLibre GL Maps

Map components use MapLibre GL JS API with `useEffect`/`useRef` and `map.remove()` cleanup. Shared config lives in `src/lib/map/config.ts`.

```tsx
// Pattern: MapLibre GL in useEffect
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapStyle, toLngLat, DEFAULT_CENTER } from "@/lib/map/config";

const containerRef = useRef<HTMLDivElement>(null);
const mapRef = useRef<maplibregl.Map | null>(null);

useEffect(() => {
  if (!containerRef.current || mapRef.current) return;
  const map = new maplibregl.Map({
    container: containerRef.current,
    style: getMapStyle(),
    center: toLngLat(DEFAULT_CENTER),
    zoom: 12,
  });
  mapRef.current = map;
  return () => { map.remove(); mapRef.current = null; };
}, [deps]);
```

MapLibre uses `[lng, lat]` coordinate order — always use `toLngLat()` for conversion.
`getMapStyle()` returns MapTiler vector tiles if `NEXT_PUBLIC_MAPTILER_KEY` is set, otherwise free OSM raster tiles.

All map components must use `dynamic(() => import(...), { ssr: false })` — MapLibre accesses WebGL/`window` and cannot run server-side.

### Tailwind CSS v4

No `tailwind.config` file. Configured via `@import "tailwindcss"` and `@theme inline` in `src/app/globals.css`. PostCSS plugin is `@tailwindcss/postcss`.

### Supabase Storage

Buckets `event-images` and `place-images` are public. Cover upload path: `${user.id}/covers/${timestamp}.ext`; gallery upload path: `${user.id}/gallery/${entity}/${entityId}/${timestamp}-${index}-${rand}.ext`. Use `getPublicUrl()` for URLs and store gallery metadata in `event_photos` / `place_media`. Do not add broad storage `SELECT` policies for public buckets; public object URLs do not require bucket listing. The Supabase storage domain is configured in `next.config.ts` for `next/image`.

### Event Categories

17 canonical event slugs and 10 place slugs. Authoritative source: `src/lib/categories.ts` (`EVENT_CATEGORIES`, `PLACE_CATEGORIES`) and `src/types/db.ts` (`EventCategory`, `PlaceCategory`). Do **not** hard-code category strings inline — always import from `categories.ts`.

## Database

Schema in `supabase/schema.sql` (idempotent — safe to re-run). Migrations in `supabase/migrations/`.

Tables: `profiles` (extends auth.users, roles: `citizen` / `contributor` / `admin`; contributors have a `contributor_kind` sub-type: `ministry` / `organization` / `business`), `events` (with lat/lng, category, category_id FK, image_url), `rsvps` (unique per user+event; status includes `going` / `consider`), `comments` (on events, with profile join), `categories` (DB-driven), `places` (permanent map listings), `reviews` (ratings + still_exists for places and events), `follows` (social graph, bidirectional = friends), `event_photos`, `place_media`, `event_views`, `push_tokens` (device push tokens), `notifications` (in-app + push), `place_follows` (user follows place, optimistic count), `conversations` (DM threads), `conversation_participants` (many-to-many), `messages` (chat messages with 2000 char limit).

Trigger `on_auth_user_created` auto-creates a profile row from auth metadata on signup.

Storage buckets `event-images` and `place-images` are public. Use `getPublicUrl()` for URLs and table-backed gallery metadata; avoid storage object listing for public galleries.

## Images

Use `next/image` `<Image>` for Supabase-hosted images (the storage domain is configured in `next.config.ts`). For local blob preview URLs (file upload previews), use `<img>` with `// eslint-disable-next-line @next/next/no-img-element`.

### Map Markers & Clustering

Marker utilities live in `src/lib/map/markers.ts`:
- `createCategoryMarkerEl(category, temporal)` — Returns an `HTMLDivElement` for MapLibre GL markers with category-specific color and inline SVG icon
- `createPlaceMarkerEl(category)` — Returns a place marker element
- `createClusterEl(count)` — Returns a gold-branded cluster badge element
- `getTemporalStyle(dateStr, endDateStr?)` — Returns opacity/scale/isLive based on event proximity to now
- `escapeHtml(str)` — Sanitizes user input for popup HTML

## Project Roadmap

See `.github/PROJECT_STATUS.md` for full phase tracker. Current status: 714 tests, all phases through Batch 14h shipped.

Platform has two full-screen primary views:
1. **Map view** — full-viewport map with category markers, temporal encoding, clustering, geolocation, detail panel, floating controls
2. **Calendar view** — lightweight glass-overlay calendar (FEAT-02; replaces removed FullCalendar)

**Platform identity:** Serves Citizens and Contributors equally. All people and entities have equal dignity. Open to non-Christians discovering the Kingdom. See `.github/VISION.md` for full vision.

Roles: `citizen` / `contributor` (with `contributor_kind`: ministry / organization / business) / `admin`. Contributors can create events and places.

## Project Customization Files

### Instructions (auto-applied by file pattern)
- `.github/instructions/project-architecture.instructions.md` — File map, component relationships, data flow, environment details
- `.github/instructions/connect-ui-system.instructions.md` — UI system rules (60/30/10 white-black-gold, floating controls)
- `.github/instructions/maplibre-maps.instructions.md` — MapLibre GL JS API patterns for map components
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

### Project Tracking
- `.github/PROJECT_STATUS.md` — Living phase tracker with completion checklists
- `.github/DECISIONS.md` — Technical decision log with rationale (prevents re-debating solved problems)
- `.github/SUPABASE_RECOVERY.md` — Fast reconnect + validation runbook for Supabase issues

If a future request conflicts with these standards, follow explicit user direction for that request and then update the files above to keep the baseline current.

## Default session workflow (user standard — do not re-ask)

For every multi-batch session the user's standing expectations are:

1. **Thoroughness over speed.** No time pressure. Never rush.
2. **A-grade quality gate on every batch** before moving on:
   - `npx tsc --noEmit` → 0 errors
   - `npx vitest run` → full suite passes
   - `npx next lint --dir src` → clean
   - **Architect subagent review** with a detailed diff summary → apply every Should-fix inline, note Nice-to-haves, then re-run tsc + vitest
   - **Security review inline** (OWASP Top 10, RLS correctness, input validation) → fix any findings before push
   - `mcp_supabase_get_advisors type:"security"` → no NEW warnings vs baseline
3. **Push after each batch** (not only at end). Update `.github/PROJECT_STATUS.md`
   and `.github/DECISIONS.md` in the same push cadence.
4. **Implement as much as capacity allows, in order.** When capacity ends,
   persist important context before the conversation is deleted:
   - Update `RESUME_HERE.md` at repo root (what shipped + commit SHA + next items)
   - Leave PROJECT_STATUS + DECISIONS current on `origin/main`
5. **Final report** lists what shipped + what remains + resume instructions.
6. **Windows env reminder:** prepend `$env:PATH = "C:\\Program Files\\nodejs;" + $env:PATH`
   to every terminal command; never use `&&` in PowerShell, use `;`.
7. **When something is missing or blocked,** ask the user with a single
   concise question rather than guessing.
8. **After push and status update, refresh `RESUME_HERE.md` at the repo root**
   so the next conversation can resume with zero loss. This is mandatory,
   not optional. Sections required: project at a glance / what just shipped
   (with commit SHA + any deferred MCP applies) / current platform state /
   next batches queued / open questions / how to verify locally / memory
   pointers / architecture quick-orient.

This standing workflow is the canonical "quality, refining and pushing
procedure" the user references. Follow it silently unless the user
explicitly overrides it for a specific request.
