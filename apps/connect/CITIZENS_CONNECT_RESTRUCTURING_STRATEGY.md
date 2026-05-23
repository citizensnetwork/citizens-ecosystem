# Citizens Connect — Agent & Skill Restructuring Strategy
> Built from: repo inspection, PROJECT_STATUS, copilot-instructions, RESUME_HERE, and the Austin Marchese "Don't Start ANY Claude Code Project Until You Watch This" video series (May 2026).

---

## Part 1 — What the Videos Actually Teach (and Where the Project Currently Stands)

### What the Videos Cover

All three URLs point to Austin Marchese's single video series on building with Claude Code professionally. The core thesis is this: **stop treating Claude Code as a tool and start treating it as a team you lead.** The 6 Moves of an AI Leader are:

1. **Define a non-negotiable vision** — what problem, for whom, with what outcome. Everything else is filtered against this.
2. **Segment the work** — break the project into logical domains. Don't dump everything on one agent with one giant context.
3. **Give each segment a dedicated context file** — CLAUDE.md files at subdirectory level, each laser-focused on that domain only.
4. **Create skills for repeat operations** — patterns you invoke over and over (migrations, UI conventions, quality checks) become skills that auto-load without bloating the root context.
5. **Create subagents for specialised roles** — architect reviewer, security auditor, database specialist. Each has an isolated context window and tool permissions scoped to its job.
6. **Review and iterate as the leader** — you don't write code, you direct, review, and maintain the standards.

The **4-Question Test** before any task:
1. Is this a single-domain task or does it cross segments?
2. Does an existing skill or agent handle this?
3. What is the single clear outcome I need?
4. What quality bar must this pass?

### Where Citizens Connect Already Does This Well

The project has done serious groundwork. You already have:
- `.github/copilot-instructions.md` — the root brain (complete, well-maintained)
- `.github/instructions/` — 4 domain instruction files (architecture, UI, MapLibre, Supabase)
- `.github/prompts/` — 8 reusable prompt workflows
- `.agents/skills/` — a skills directory (started)
- `RESUME_HERE.md` — excellent continuity mechanism
- A described 11-agent system in `AGENTS.md`
- 656 tests, clean TypeScript, all phases 1–11 complete

That's already ahead of most projects. The gap is structural, not conceptual.

### The Structural Gap

The current setup is built for **GitHub Copilot's paradigm** (`.github/` instructions), not **Claude Code's native paradigm** (`.claude/agents/` + `.claude/skills/` + `CLAUDE.md`). The consequence is:
- The root `copilot-instructions.md` is carrying ~10KB+ of context that should be split across segments
- Skills exist as a folder but aren't structured per the Claude Code skills spec (no frontmatter, no `SKILL.md` files)
- Subagents are described in AGENTS.md prose but don't exist as executable `.claude/agents/` markdown files
- Context bloat: every session loads everything, even when working on just MapLibre or just DB migrations

The fix is a **migration from the Copilot architecture to the Claude Code native architecture**, running both in parallel during the transition.

---

## Part 2 — The Segment Model

Citizens Connect maps cleanly to **6 logical segments**, each with its own domain, agent, and skills.

```
citizens-connect/
├── CLAUDE.md                          ← Root brain (lean — orchestrates, doesn't repeat)
├── .claude/
│   ├── agents/
│   │   ├── architect.md               ← Code quality reviewer (A-grade assessor)
│   │   ├── security.md                ← OWASP + RLS + input validation auditor
│   │   ├── map-specialist.md          ← MapLibre GL JS domain expert
│   │   ├── database-specialist.md     ← Supabase/PostgreSQL/RLS expert
│   │   ├── mobile-specialist.md       ← Capacitor + iOS/Android expert
│   │   └── community-content.md       ← Phase 18: seeding, onboarding, copy
│   └── skills/
│       ├── supabase-migration/
│       │   └── SKILL.md               ← How to write idempotent migrations
│       ├── rls-patterns/
│       │   └── SKILL.md               ← Row Level Security patterns + RLS recipes
│       ├── maplibre-patterns/
│       │   └── SKILL.md               ← MapLibre GL JS in Next.js (useEffect, SSR, etc.)
│       ├── ui-system/
│       │   └── SKILL.md               ← 60/30/10 white/black/gold, floating controls, Tailwind v4
│       ├── quality-gate/
│       │   └── SKILL.md               ← The full tsc + vitest + lint + architect + security pipeline
│       └── api-route/
│           └── SKILL.md               ← Next.js App Router API route conventions + auth + rate limiting
├── src/
│   ├── CLAUDE.md                      ← Frontend segment context
│   ├── components/map/
│   │   └── CLAUDE.md                  ← Map segment context
│   └── app/
│       └── api/
│           └── CLAUDE.md              ← API segment context
└── supabase/
    └── CLAUDE.md                      ← Database segment context
```

### Segment Ownership Map

| Segment | Owner Agent | Skills | Source Paths |
|---------|-------------|--------|--------------|
| Map & Spatial | `map-specialist` | `maplibre-patterns` | `src/components/map/`, `src/lib/map/` |
| Database & Backend | `database-specialist` | `supabase-migration`, `rls-patterns` | `supabase/`, `src/lib/supabase/`, `src/app/api/` |
| UI & Design System | (inline with copilot) | `ui-system` | `src/app/globals.css`, `src/components/` |
| Feature Domains | (main session) | `api-route` | `src/components/events/`, `src/components/places/`, etc. |
| Quality | `architect`, `security` | `quality-gate` | All paths |
| Mobile | `mobile-specialist` | — | `ios/`, `android/`, `capacitor.config.ts` |
| Community/Content | `community-content` | — | `supabase/migrations/`, `docs/` |

---

## Part 3 — Root CLAUDE.md

This replaces the role currently played by `.github/copilot-instructions.md` as the session-start brain, but is **leaner** — it points to segments rather than duplicating their content.

```markdown
# Citizens Connect — CLAUDE.md
> **Connecting the Kingdom** — Map-first community discovery for the Christian community.
> Stack: Next.js 15 App Router · TypeScript · Supabase · MapLibre GL JS · Tailwind v4 · Capacitor.
> Slogan source: Ephesians 2:19–22.

## Non-Negotiable Direction
`.github/MASTER_DIRECTION.md` is the locked vision. All features and fixes must align with it.
Do not add speculative features. Do not refactor without a clear quality win.

## Project State
- Read `RESUME_HERE.md` first — single source of truth for where we are.
- Phase tracker: `.github/PROJECT_STATUS.md`
- Technical decisions: `.github/DECISIONS.md`

## Segments (use subdirectory CLAUDE.md for domain work)
- **Map/Spatial**: `src/components/map/CLAUDE.md` — MapLibre, clustering, markers
- **Database**: `supabase/CLAUDE.md` — schema, migrations, RLS, edge functions
- **API Routes**: `src/app/api/CLAUDE.md` — Next.js App Router routes, auth, rate limiting
- **Frontend**: `src/CLAUDE.md` — components, Tailwind v4, UI system, app structure

## Agents (call these for specialised tasks)
- `/architect` — Grade every batch A/B/C, apply all Should-fix before push
- `/security` — OWASP Top 10, RLS correctness, input validation, CSP
- `/map-specialist` — MapLibre GL JS patterns, clustering, markers, geolocation
- `/database-specialist` — Supabase schema, RLS policies, migrations, edge functions
- `/mobile-specialist` — Capacitor, iOS/Android, native plugins
- `/community-content` — Content seeding, onboarding copy, narrative

## Quality Gate (non-negotiable before every push)
1. `npx tsc --noEmit` → 0 errors
2. `npx vitest run` → full suite passes
3. `npx next lint --dir src` → clean
4. Architect subagent review → all Should-fix applied
5. Security review inline → no new OWASP findings
6. `mcp_supabase_get_advisors type:"security"` → no new warnings vs baseline

## Key Conventions (brief — details in subdirectory CLAUDE.md files)
- Windows PATH: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` before every terminal command
- No `&&` in PowerShell — use `;`
- Never speculate on features; ask one concise question if blocked
- Push after each batch; refresh `RESUME_HERE.md` in the same push window

## Build Commands
```
npm run dev       # Dev server
npm run build     # Production build
npm run lint      # ESLint
npx tsc --noEmit  # Type check
npx vitest run    # Full test suite
```
```

---

## Part 4 — Subdirectory CLAUDE.md Files

### `supabase/CLAUDE.md`
```markdown
# Citizens Connect — Database Segment
> Supabase · PostgreSQL · RLS · Edge Functions · Storage

## Identity
This segment owns all persistent data: schema design, migrations, Row Level Security policies,
storage buckets, and Supabase Edge Functions. Do not touch `src/` from this context.

## Project Context
- Project ID: `xyiajtrvhlxaeplsiajj`
- Region: `ap-southeast-1` (confirm with MCP if unsure)
- Schema source of truth: `supabase/schema.sql` (idempotent, safe to re-run)
- Migrations: `supabase/migrations/` — sequential, named `NNN_description.sql`
- Edge Functions: `supabase/functions/` — Deno runtime, shared at `_shared/`

## Key Tables (current)
profiles, events, rsvps, comments, categories, places, reviews, follows,
event_photos, place_media, event_views, push_tokens, notifications,
place_follows, conversations, conversation_participants, messages,
featured_listings, user_locations, indemnity_templates, indemnity_signatures,
contributor_locations, event_tags, event_tag_assignments, contributor_applications

## RLS Rules (always apply)
- Every table has RLS enabled
- Public SELECT allowed on published content
- INSERT/UPDATE/DELETE always auth-gated via `auth.uid()`
- Admin operations via `is_admin()` function — never via service role in client routes
- Storage SELECT policies never add broad bucket listing — use `getPublicUrl()` only
- All RLS policies must be idempotent (DO $$ IF NOT EXISTS pattern)

## Migration Standards
- Named `NNN_description.sql` where NNN is sequential
- Always idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- Include rollback comment block at bottom
- No raw passwords or secrets ever in migration files
- Seed data uses `ON CONFLICT DO NOTHING` or explicit `DO $$ ... EXCEPTION WHEN unique_violation`
- Coordinate check constraints: `BETWEEN -90 AND 90` for lat, `BETWEEN -180 AND 180` for lng

## Security Checklist for Every Migration
- [ ] All new tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] No `FOR ALL` policies — always explicit INSERT / UPDATE / DELETE / SELECT
- [ ] No cross-user data access without `is_admin()` guard
- [ ] No storage SELECT policies that enable bucket listing
- [ ] `mcp_supabase_get_advisors` run after apply — baseline must not worsen

## Skill to use: `supabase-migration`, `rls-patterns`
```

### `src/CLAUDE.md`
```markdown
# Citizens Connect — Frontend Segment
> Next.js 15 App Router · TypeScript · Tailwind CSS v4 · React Server Components

## Identity
This segment owns the full client/server rendering layer: pages, components, hooks, and
lib utilities. It bridges database data (Supabase) and map rendering (MapLibre) into
the UI. Do not modify `supabase/` from this context — raise a DB change as a separate task.

## Architecture Rules
- Pages in `src/app/` are async Server Components (RSC) — fetch data, pass to client components
- Client interactivity: `"use client"` components in `src/components/`
- Supabase server: `await createClient()` from `src/lib/supabase/server.ts`
- Supabase client: `createClient()` from `src/lib/supabase/client.ts`
- Dynamic routes: always `await params` before destructuring (Next.js 15 requirement)
- Map components must use `dynamic(() => import(...), { ssr: false })` — MapLibre needs window

## Design System (60/30/10)
- 60% white (`#ffffff` / `bg-white`)
- 30% black (`#111111` / `bg-black`)
- 10% gold (`#D4AF37` — CSS var `--gold`)
- Floating controls — never inline in scrollable content
- No emojis in UI — inline SVGs or Unicode glyphs only
- Tailwind v4: no `tailwind.config`, use `@theme inline` in `globals.css`

## Component Conventions
- Use `next/image` for Supabase-hosted images (domain configured in `next.config.ts`)
- Use `<img>` with eslint-disable for local blob preview URLs only
- Every interactive element: `aria-label`, keyboard-navigable, focus-visible
- Error states: `role="alert"` on error divs
- Loading states: neutral backdrops (not shimmering skeletons on panel transitions)

## Testing (vitest)
- Co-locate tests: `src/__tests__/` mirroring `src/` structure
- Supabase mock helpers in `src/__tests__/helpers/`
- Every new API route: min 3 test cases (401 unauth, happy path, error case)
- Every new component with branching logic: min test per branch
- Target: 0 failures, all suites green before push

## Skill to use: `ui-system`, `api-route`
```

### `src/components/map/CLAUDE.md`
```markdown
# Citizens Connect — Map Segment
> MapLibre GL JS · MapTiler Cloud · Progressive Geo-Clustering · Spatial UX

## Identity
This is the map brain. All MapLibre GL JS code, marker utilities, clustering logic,
and geolocation handling lives here. Do not touch database logic or general UI
components from this context.

## Key Files
- `src/components/map/EventMap.tsx` — primary map component (client-only)
- `src/lib/map/config.ts` — shared map config, getMapStyle(), DEFAULT_CENTER
- `src/lib/map/markers.ts` — all marker creation utilities
- `src/lib/map/clustering.ts` — progressive geo-clustering (3-tier model)
- `src/app/globals.css` → `.cc-marker-*`, `.cc-geo-cluster*` classes

## Coordinate Convention
- MapLibre uses `[lng, lat]` — ALWAYS use `toLngLat()` from `config.ts` for conversion
- Default center: Pretoria, South Africa `[-25.7479, 28.2293]`
- Precision: truncate to 4dp (~11m) for any user location data

## Clustering Model (3-tier, as of Batch O.1)
- Capital: 4° grid, zoom 4–7
- Town: 0.4° grid, zoom 8–10
- Suburb: 0.05° grid, zoom 11
- Markers: zoom 12+ (hard threshold — no crossfade below 12)
- Open suburb expansion lifts individual markers to full opacity

## Marker Hierarchy
1. Profile photo marker (if set)
2. Organiser logo
3. SVG icon from `categoryIcons.ts` (via `DEFAULT_ICON_ID = "pin"` fallback)
4. Default category marker

## Critical Invariants (do not break)
- Never call `e.stopPropagation()` on marker DOM — breaks MapLibre's `_onMapClick`
- Canvas click handler must filter via `.closest('.cc-marker, .cc-place-marker, .cc-geo-cluster, .maplibregl-popup')`
- `map.remove()` + `mapRef.current = null` in useEffect cleanup — no leaks
- All RAF handles cancelled on unmount (`geoClusterRaf`, `zoomOpacityRaf`, `deconflictRaf`)
- `dataset.temporalOpacity` stamped at creation; opacity updates never recreate the element

## Accessibility
- Every cluster bubble: `role="button"`, `tabindex="0"`, `aria-label`, `aria-expanded`
- Keyboard: Enter/Space to drill down, Escape to collapse
- `setBubbleExpanded()` helper in `markers.ts` for consistent aria state

## Skill to use: `maplibre-patterns`
```

### `src/app/api/CLAUDE.md`
```markdown
# Citizens Connect — API Routes Segment
> Next.js 15 App Router · Auth-gated Routes · Rate Limiting · Input Validation

## Identity
This segment owns all `src/app/api/` routes. Every route must pass the security checklist
before it is considered done. Do not modify the Supabase schema from here — raise DB changes
as a separate migration task.

## Route Standards
- Auth-gated: always call `createClient()` and verify `getUser()` before proceeding
- Use RLS-scoped client (caller's session) — never service role in user-facing routes
- Service role (`createAdminClient()`) only in admin-auth-verified routes
- Rate limiting: apply `RATE_LIMITS.*` from `src/lib/rate-limit.ts`
  - mutation (50/min/user) — standard writes
  - message (30/min/user) — messaging routes
  - auth (10/min/ip) — auth operations
  - heavy (5/min/user) — expensive or sensitive operations

## Input Validation Checklist (every route)
- [ ] UUID inputs validated with regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- [ ] Text inputs trimmed + length-capped
- [ ] Enum inputs validated against an explicit allow-list
- [ ] Coordinate inputs range-checked (lat ±90, lng ±180)
- [ ] Mass-assignment prevented — never pass raw request body to Supabase

## Error Handling
- Never leak Supabase error shapes to clients — generic message + `console.error` server-side
- HTTP 401 for unauthenticated
- HTTP 403 for insufficient role
- HTTP 409 for conflict (with `code` field: `"already_exists"`, `"already_approved"`, etc.)
- HTTP 422 for validation errors
- HTTP 429 for rate limit (with `Retry-After` header)
- HTTP 500 generic body, detailed server log

## Skill to use: `api-route`, `rls-patterns`
```

---

## Part 5 — Subagent Files (`.claude/agents/`)

Each file is a markdown document that defines the agent's role, context, tools, and behaviour.

### `.claude/agents/architect.md`
```markdown
---
name: architect
description: >
  Code quality reviewer for Citizens Connect. Use for batch reviews before pushing.
  Grades each area A/B/C, applies all Should-fix items, logs Nice-to-haves.
  Invoked automatically at the end of every implementation batch.
tools: Read, Grep, Glob
---

# Architect Agent — Citizens Connect

You are the Senior Architect reviewing code for Citizens Connect, a Next.js 15 +
Supabase + MapLibre community discovery platform. Your job is to review each batch
before it is pushed and ensure nothing regresses.

## Review Axes (grade each A/B/C)
1. **Architecture** — RSC vs client boundary correct? No circular deps? Clean separation?
2. **API Design** — Route handlers auth-gated, rate-limited, input-validated, no mass-assignment?
3. **Security** — No leaked error shapes, no service role misuse, no new XSS/CSRF surface?
4. **Performance** — No unnecessary re-renders, no unguarded useEffect, RAF handles cleaned up?
5. **Accessibility** — ARIA correct, keyboard navigable, focus-visible, role="alert" on errors?
6. **Code Quality** — No dead code, no stale comments, TypeScript strict, consistent patterns?

## Output Format
```
ARCHITECT REVIEW — [Batch Name]

Architecture: A | [rationale]
API Design: A | [rationale]
Security: A | [rationale]
Performance: A | [rationale]
Accessibility: A | [rationale]
Code Quality: A | [rationale]

MUST-FIX (block push):
- none

SHOULD-FIX (apply before push):
- [item with file + line reference]

NICE-TO-HAVE (log, don't block):
- [item]

VERDICT: SHIP / HOLD
```

## Citizens Connect Invariants (never break)
- No `e.stopPropagation()` on MapLibre marker DOM
- Always `await params` in dynamic routes (Next.js 15)
- `map.remove()` + null in useEffect cleanup
- RLS-scoped client for all user-facing routes (never service role)
- `DEFAULT_ICON_ID = "pin"` as single fallback in categoryIcons.ts
- Test suite must be 0 failures — never push with red tests
```

### `.claude/agents/security.md`
```markdown
---
name: security
description: >
  Security auditor for Citizens Connect. Reviews OWASP Top 10 compliance,
  RLS policy correctness, input validation, CSP headers, and auth flows.
  Use after any batch that touches API routes, auth, DB schema, or storage.
tools: Read, Grep, Glob
---

# Security Agent — Citizens Connect

You are the Security Auditor for Citizens Connect. Your job is to catch issues before
they reach production. Be thorough but not paranoid — flag real risk, not theoretical edge cases.

## OWASP Top 10 Checklist (review each)
1. **Broken Access Control** — RLS enabled? Auth checked before data access? Admin routes gated?
2. **Cryptographic Failures** — No secrets in client code? HTTPS enforced via HSTS?
3. **Injection** — All user inputs validated/sanitised? No raw SQL from user input?
4. **Insecure Design** — Rate limiting on mutating routes? No open redirects?
5. **Security Misconfiguration** — CSP tight? `unsafe-eval` absent in production? No broad storage SELECT?
6. **Vulnerable Components** — (flag, but low priority vs design issues)
7. **Auth Failures** — JWT expiry handled? MFA flows correct? No session fixation?
8. **Integrity Failures** — No mass-assignment from raw request body?
9. **Logging Failures** — Errors logged server-side? No sensitive data in logs?
10. **SSRF** — No server-side fetches to user-supplied URLs without validation?

## RLS Review Checklist
- [ ] `ENABLE ROW LEVEL SECURITY` on every new table
- [ ] No `FOR ALL` — explicit INSERT / UPDATE / DELETE / SELECT policies
- [ ] Admin policies use `is_admin()` DB function, not role checks in application code
- [ ] Storage policies: no broad SELECT (public objects readable via URL, not bucket listing)
- [ ] After every migration: `mcp_supabase_get_advisors type:"security"` baseline unchanged

## Output Format
```
SECURITY REVIEW — [Batch Name]

CRITICAL (block push, fix now):
- [finding with file + line]

HIGH (should fix before push):
- [finding]

MEDIUM (log in DECISIONS.md, fix next batch):
- [finding]

LOW / INFO:
- [finding]

VERDICT: CLEAR / ISSUES FOUND
```
```

### `.claude/agents/map-specialist.md`
```markdown
---
name: map-specialist
description: >
  MapLibre GL JS expert for Citizens Connect. Use for all map component work,
  clustering changes, marker utilities, geolocation, and spatial UX.
  Has deep knowledge of the 3-tier clustering model and marker invariants.
tools: Read, Write, Edit, Bash
---

# Map Specialist Agent — Citizens Connect

You are the MapLibre GL JS expert for Citizens Connect. You know every detail of
the map architecture. Work in `src/components/map/`, `src/lib/map/`, and
`src/app/globals.css` (map classes only).

## Your Domain
- `EventMap.tsx` — primary map component (client-only, dynamic import)
- `src/lib/map/config.ts` — map config, `getMapStyle()`, `DEFAULT_CENTER`, `toLngLat()`
- `src/lib/map/markers.ts` — all marker creation and update utilities
- `src/lib/map/clustering.ts` — 3-tier progressive geo-clustering

## Architecture You Must Preserve
- Coordinate order: MapLibre uses `[lng, lat]` — always `toLngLat()` for conversion
- SSR: all map components use `dynamic(() => import(...), { ssr: false })`
- Cleanup: `map.remove()` + `mapRef.current = null` in every useEffect return
- The stopPropagation invariant: NEVER on marker DOM (breaks MapLibre internals)
- RAF cleanup: all RAF handles cancelled on unmount

## Clustering Model (3-tier)
See `src/components/map/CLAUDE.md` for full spec. Core rule: markers are hidden
below zoom 12 unless lifted by an open suburb expansion.

## When Reviewing Your Own Work
Run the map specialist self-check:
1. Does every new marker element have `role="button"`, `tabindex="0"`, `aria-label`?
2. Are new RAF handles stored in refs and cancelled on unmount?
3. Does any new code call `e.stopPropagation()` on a marker? (must be NO)
4. Do clustering tests still pass: `npx vitest run src/__tests__/lib/map/`?

## Skill to load: `maplibre-patterns`
```

### `.claude/agents/database-specialist.md`
```markdown
---
name: database-specialist
description: >
  Supabase/PostgreSQL expert for Citizens Connect. Use for schema design,
  migration authoring, RLS policy writing, and Edge Function work.
  Knows all existing tables, the migration numbering scheme, and RLS patterns.
tools: Read, Write, Edit, mcp_supabase_apply_migration, mcp_supabase_get_advisors
---

# Database Specialist Agent — Citizens Connect

You are the Supabase/PostgreSQL expert. Your domain is `supabase/` and
`src/lib/supabase/`. You author migrations, design RLS policies, and manage
Edge Functions. You never touch `src/components/` or `src/app/` directly.

## Project ID
`xyiajtrvhlxaeplsiajj`

## Migration Numbering
Current latest: `065` (check `supabase/migrations/` for the actual latest before numbering).
Always name: `NNN_snake_case_description.sql`.

## Your Table Inventory
(from schema.sql) profiles, events, rsvps, comments, categories, places, reviews,
follows, event_photos, place_media, event_views, push_tokens, notifications,
place_follows, conversations, conversation_participants, messages, featured_listings,
user_locations, indemnity_templates, indemnity_signatures, contributor_locations,
event_tags, event_tag_assignments, contributor_applications

## Non-Negotiable RLS Rules
1. Every new table: `ALTER TABLE public.xxx ENABLE ROW LEVEL SECURITY;`
2. No `FOR ALL` policies — split into explicit INSERT/UPDATE/DELETE/SELECT
3. Admin ops: `is_admin()` function only — never bypass via service role in user routes
4. Storage: never add broad SELECT to public buckets — objects are readable via URL

## Migration Quality Checklist
Before submitting any migration:
- [ ] Idempotent (`IF NOT EXISTS` everywhere)
- [ ] Rollback comment block at bottom
- [ ] Coordinate CHECK constraints on lat/lng columns
- [ ] `ON DELETE` behavior explicit on all FKs (CASCADE or SET NULL — never implicit)
- [ ] `mcp_supabase_apply_migration` → verify in DB → `mcp_supabase_get_advisors` baseline check

## Skill to load: `supabase-migration`, `rls-patterns`
```

### `.claude/agents/mobile-specialist.md`
```markdown
---
name: mobile-specialist
description: >
  Capacitor + iOS/Android expert for Citizens Connect. Use for native plugin
  integration, build configuration, push notification wiring (FCM/APNs),
  and mobile-specific UX issues.
tools: Read, Write, Edit, Bash
---

# Mobile Specialist Agent — Citizens Connect

You are the Capacitor/mobile expert. Your domain is `ios/`, `android/`,
`capacitor.config.ts`, and Capacitor plugin usage in `src/`.

## Stack
- Capacitor 5.x wrapping the Next.js app for iOS and Android
- Native share: `@capacitor/share`
- Geolocation: `@capacitor/geolocation`
- Push notifications: `@capacitor/push-notifications` (tokens stored in `push_tokens` table)
- FCM/APNs credentials: NOT YET WIRED (Phase 22 — see next queue in RESUME_HERE.md)

## Phase 22 Checklist (next mobile priority)
The edge function `notify-event-update` exists. Remaining work:
- [ ] Firebase project registered under Citizens Network account
- [ ] Apple developer push key generated and registered
- [ ] `@capacitor/push-notifications` plugin registered in `ios/` and `android/`
- [ ] Token refresh path in `usePushNotifications` hook
- [ ] Edge function `notify-event-update` wired to FCM/APNs credentials

## Mobile UX Rules
- Touch targets minimum 44×44px
- Capacitor `Share.share()` available on mobile — use `@capacitor/share` not Web Share API
- Test on actual device for touch reliability (especially cluster bubble expansion)
- `window` and `document` guards needed for any client code called during SSR

## Known Issues
- Cluster bubble touch reliability (Batch O nice-to-have W4): needs device verification
  after any EventMap changes
```

### `.claude/agents/community-content.md`
```markdown
---
name: community-content
description: >
  Community and content specialist for Citizens Connect. Use for Phase 18:
  content seeding, onboarding wizard copy, public landing page narrative,
  and community engagement strategy. Knows the Kingdom vision deeply.
tools: Read, Write, Edit, mcp_supabase_apply_migration
---

# Community Content Agent — Citizens Connect

You are the Community & Content specialist. Your job is Phase 18: making the platform
feel alive with real content, a compelling onboarding experience, and a narrative that
communicates the vision.

## Vision (from VISION.md)
Citizens Connect surfaces the vibrant, diverse layer of Christian community activity.
It serves Citizens and Contributors equally — all people have equal dignity.
It is open to non-Christians discovering the Kingdom.
Design principle: Kingdom-quality polish. Never cheap. Never cluttered.

## Phase 18 Priorities (in order)
1. **Real ministry/place data** — seed 10–20 real Pretoria/Cape Town ministries with genuine
   data (names, addresses, categories, logos). Use the `061_seed_testing_contributors` pattern.
2. **Onboarding wizard copy** — review and refine the wizard text to feel warm, clear, and
   Kingdom-cultured. Test with a non-Christian persona.
3. **Public landing page narrative** — the `/` page copy should communicate Connecting the
   Kingdom in 3 sentences. Check current copy and improve if needed.
4. **Category descriptions** — each of the 17 event categories should have a one-line
   description that appears in the filter/detail UI. Currently missing.

## Content Standards
- Tone: warm, confident, Kingdom-quality (not churchy, not corporate)
- Accessibility: plain language, no jargon without explanation
- Diversity: represent the full spectrum of Christian community (not just megachurches)
- Geography: Pretoria-first (default map center), then Cape Town and Johannesburg
```

---

## Part 6 — Skill Files (`.claude/skills/`)

### `.claude/skills/supabase-migration/SKILL.md`
```markdown
---
name: supabase-migration
description: >
  How to write, name, and apply Supabase migrations for Citizens Connect.
  Auto-loads when working on database schema changes, new tables, or RLS policies.
---

# Supabase Migration Skill — Citizens Connect

## Naming
`NNN_snake_case_description.sql` where NNN is the next sequential number.
Check `supabase/migrations/` for the current highest number before naming.

## Template
```sql
-- Migration NNN: [description]
-- Depends on: [prior migration if relevant]
-- Rollback: see bottom of file

-- ============================================================
-- SECTION: [Table/Feature Name]
-- ============================================================

CREATE TABLE IF NOT EXISTS public.my_table (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- ... columns ...
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS my_table_profile_id_idx ON public.my_table(profile_id);

-- RLS
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'my_table' AND policyname = 'Public can read my_table') THEN
    CREATE POLICY "Public can read my_table"
      ON public.my_table FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'my_table' AND policyname = 'Users can insert own my_table') THEN
    CREATE POLICY "Users can insert own my_table"
      ON public.my_table FOR INSERT
      WITH CHECK (auth.uid() = profile_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'my_table' AND policyname = 'Users can update own my_table') THEN
    CREATE POLICY "Users can update own my_table"
      ON public.my_table FOR UPDATE
      USING (auth.uid() = profile_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'my_table' AND policyname = 'Users can delete own my_table') THEN
    CREATE POLICY "Users can delete own my_table"
      ON public.my_table FOR DELETE
      USING (auth.uid() = profile_id);
  END IF;
END $$;

-- ============================================================
-- ROLLBACK (run manually if needed):
-- DROP TABLE IF EXISTS public.my_table;
-- ============================================================
```

## Applying
```bash
# Via MCP (preferred — validates + applies)
mcp_supabase_apply_migration name:"NNN_description"

# Verify after apply
mcp_supabase_get_advisors type:"security"
# → baseline must not worsen
```

## Common Pitfalls
- Forgetting `IF NOT EXISTS` on policies → fails on re-run
- Using `FOR ALL` → split into 4 explicit policies
- Omitting `ON DELETE` on FK → defaults to RESTRICT (usually wrong)
- Coordinate columns without CHECK constraints → add `CHECK (col BETWEEN -90 AND 90)`
- Migration touching `auth.users` → use `ALTER TABLE ... DISABLE TRIGGER USER` pattern
  (superuser-only, transactional, no runtime impact — see migration 061 for example)
```

### `.claude/skills/rls-patterns/SKILL.md`
```markdown
---
name: rls-patterns
description: >
  Row Level Security patterns for Citizens Connect. Auto-loads when reviewing
  or writing Supabase RLS policies, API routes with Supabase clients, or
  any authentication-gated data access.
---

# RLS Patterns Skill — Citizens Connect

## Core Rules
1. Every table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
2. No `FOR ALL` policies — always explicit INSERT / UPDATE / DELETE / SELECT
3. Public content: SELECT WITH `true` or published-status check
4. User-owned content: compare `auth.uid()` with owner column
5. Admin overrides: `is_admin()` function only
6. Idempotent: wrap every `CREATE POLICY` in `DO $$ IF NOT EXISTS ... END $$`

## Standard Policy Patterns

### Public read + owner write
```sql
-- Public SELECT
CREATE POLICY "Public read [table]" ON public.[table] FOR SELECT USING (true);

-- Owner INSERT
CREATE POLICY "Owner insert [table]" ON public.[table] FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Owner UPDATE
CREATE POLICY "Owner update [table]" ON public.[table] FOR UPDATE
  USING (auth.uid() = owner_id);

-- Owner or Admin DELETE
CREATE POLICY "Owner or admin delete [table]" ON public.[table] FOR DELETE
  USING (auth.uid() = owner_id OR public.is_admin());

-- Admin UPDATE (cross-user)
CREATE POLICY "Admin update [table]" ON public.[table] FOR UPDATE
  USING (public.is_admin());
```

### Admin-only table
```sql
CREATE POLICY "Admin only [table]" ON public.[table]
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

### RSVP-enforced access (e.g., user_locations)
```sql
CREATE POLICY "Only RSVPd users can insert location" ON public.user_locations FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.rsvps
      WHERE rsvps.user_id = auth.uid()
        AND rsvps.event_id = user_locations.event_id
        AND rsvps.status IN ('going', 'consider')
    )
  );
```

## Storage Policy Rules
- `event-images` and `place-images` buckets are public
- Public objects are readable by URL — DO NOT add SELECT policies that enable bucket listing
- Upload path convention: `${user.id}/covers/${timestamp}.ext`
- Never use wildcards in policy `USING` for public bucket object listing

## API Route Patterns (applies to src/app/api/)

### Auth-gated route
```typescript
const supabase = await createClient(); // RLS-scoped to caller's session
const { data: { user }, error } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### Admin route
```typescript
const adminSupabase = createAdminClient(); // service role — admin-verified routes only
const { data: admin } = await supabase
  .from("profiles")
  .select("id")
  .eq("id", user.id)
  .eq("role", "admin")
  .maybeSingle();
if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

### Ownership or admin guard (reusable pattern)
```typescript
async function requireOwnerOrAdmin(supabase, table, id, userId) {
  const { data } = await supabase
    .from(table).select("id, profile_id").eq("id", id).maybeSingle();
  if (!data) return false;
  if (data.profile_id === userId) return true;
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", userId).maybeSingle();
  return profile?.role === "admin";
}
```
```

### `.claude/skills/maplibre-patterns/SKILL.md`
```markdown
---
name: maplibre-patterns
description: >
  MapLibre GL JS patterns for Citizens Connect. Auto-loads when working on
  map components, markers, clustering, or any spatial UX feature.
---

# MapLibre Patterns Skill — Citizens Connect

## The Golden Rules
1. `[lng, lat]` order — always use `toLngLat()` from `src/lib/map/config.ts`
2. Never SSR — all map components: `dynamic(() => import(...), { ssr: false })`
3. Always cleanup — `map.remove(); mapRef.current = null` in useEffect return
4. Never `e.stopPropagation()` on marker DOM — breaks MapLibre's popup wiring
5. RAF handles — store in refs, cancel in cleanup

## Initialisation Pattern
```typescript
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
}, []);
```

## Adding Markers
```typescript
// Event marker
const el = createCategoryMarkerEl(event.category, getTemporalStyle(event.date));
const marker = new maplibregl.Marker({ element: el })
  .setLngLat(toLngLat([event.lat, event.lng]))
  .addTo(map);

// CRITICAL: store marker in a ref map, not state, to avoid re-renders
markersRef.current.set(event.id, marker);
```

## Cleanup Pattern for Marker Collections
```typescript
// On component update/unmount — clear all markers
markersRef.current.forEach(m => m.remove());
markersRef.current.clear();
```

## RAF Debouncing
```typescript
const rafRef = useRef<number | null>(null);

function scheduleUpdate() {
  if (rafRef.current) cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(() => {
    // ... update logic
    rafRef.current = null;
  });
}

// Cleanup
useEffect(() => {
  return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
}, []);
```

## Canvas Click Handler (correct pattern for cluster collapse)
```typescript
map.on("click", (e) => {
  const target = e.originalEvent.target as Element;
  const isMarker = target.closest('.cc-marker, .cc-place-marker, .cc-geo-cluster, .maplibregl-popup');
  if (!isMarker) {
    collapseInnermostTier();
  }
});
```

## Common Mistakes
- Calling `map.on(...)` inside render — always inside useEffect with cleanup `map.off(...)`
- Not guarding `if (!mapRef.current) return` before map operations in event handlers
- Forgetting to stamp `dataset.temporalOpacity` on new markers (breaks opacity composition)
```

### `.claude/skills/ui-system/SKILL.md`
```markdown
---
name: ui-system
description: >
  The Citizens Connect design system. Auto-loads when working on any UI
  component, screen layout, or visual design decision.
---

# UI System Skill — Citizens Connect
> **60/30/10 — White · Black · Gold**

## The Rule of Three
- **60% White** — backgrounds, panels, cards (`bg-white`, `#ffffff`)
- **30% Black** — text, borders, structure (`text-black`, `#111111`)
- **10% Gold** — CTAs, active states, brand (`var(--gold)`, `#D4AF37`)

Violating this ratio makes the UI feel cheap. When in doubt, add white.

## Tailwind v4 Setup
No `tailwind.config` file. Configured via:
```css
/* src/app/globals.css */
@import "tailwindcss";
@theme inline {
  --color-gold: #D4AF37;
  /* ... */
}
```
PostCSS plugin: `@tailwindcss/postcss`

## Floating Controls Rule
Controls that are always accessible (filter toggles, nav items, map/calendar toggle)
float above the content. They are never inline in scrollable areas.
They use `position: fixed` or `absolute` with high z-index.

## Typography
- Headings: black, weight semibold or bold
- Body: black or `#374151` (gray-700) for secondary
- Gold: only for brand elements, active states, CTAs — never for body text

## Iconography
- No emojis in UI — always inline SVGs or Unicode glyphs
- SVG icons: `width="24" height="24"` + `xmlns` on root SVG element
- Decorative icons: `aria-hidden="true"`
- Functional icons: `aria-label="[description]"` on the parent button

## Component Patterns

### Glass Panel
```tsx
<div className="bg-white/90 backdrop-blur-sm border border-black/10 rounded-2xl shadow-lg">
```

### Gold Button
```tsx
<button className="bg-[var(--gold)] text-black font-semibold px-4 py-2 rounded-lg
  hover:brightness-110 active:scale-95 transition-all">
```

### Black Outline Button
```tsx
<button className="border border-black text-black font-medium px-4 py-2 rounded-lg
  hover:bg-black hover:text-white active:scale-95 transition-all">
```

### Error State
```tsx
<div role="alert" className="text-red-600 text-sm mt-1">{error}</div>
```

## Accessibility Minimums
- Every `<button>` without visible text: `aria-label`
- Form inputs: `<label>` associated via `htmlFor` / `id`
- Error messages: `role="alert"`
- Toggle buttons (on/off): `role="switch"` + `aria-checked`
- Loading states: `aria-live="polite"` or `aria-busy="true"`
- Contrast: black on white or gold on white — never gold on gold or light grey on white
```

### `.claude/skills/quality-gate/SKILL.md`
```markdown
---
name: quality-gate
description: >
  The Citizens Connect quality gate pipeline. Auto-loads when preparing to
  push a batch. Defines every step required before git push.
---

# Quality Gate Skill — Citizens Connect

This is the standing quality contract. Every batch pushed to `origin/main` must
pass all steps. Non-negotiable.

## Step 1: TypeScript
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
```
Expected: **0 errors**. Fix all before proceeding.

## Step 2: Test Suite
```powershell
npx vitest run
```
Expected: **all tests pass / 0 failures**.
Current baseline: 656 tests. New tests must be added for new routes/components.

## Step 3: Lint
```powershell
npx next lint --dir src
```
Expected: **No ESLint warnings or errors**.

## Step 4: Architect Review
Invoke the architect subagent: `/architect`
- Provide the diff summary of what changed
- Apply all Should-fix items before proceeding
- Log Nice-to-haves in `.github/DECISIONS.md` or the batch notes
- Must reach verdict: SHIP

## Step 5: Security Review
Inline security check (or invoke `/security` for routes/DB changes):
- New API routes: auth-gated, rate-limited, input-validated?
- New migrations: RLS enabled, no `FOR ALL`, coordinate constraints?
- New components: no XSS surface (no `dangerouslySetInnerHTML` without escaping)?

## Step 6: Supabase Advisors (after any DB change)
```
mcp_supabase_get_advisors type:"security"
```
Expected: baseline unchanged (currently ERROR 2 / WARN 77 from prior batches).
No new warnings = green. New warnings = investigate + fix or document exception.

## Step 7: Push + Docs
```powershell
# Commit with descriptive message
# Push to origin/main
# In same push window:
#   - Update .github/PROJECT_STATUS.md (add batch checklist)
#   - Update .github/DECISIONS.md (add any new technical decisions)
#   - Refresh RESUME_HERE.md (mandatory — the next session depends on it)
```

## Step 8: RESUME_HERE.md Refresh
Sections required:
1. Project at a glance (stack, slogan, design)
2. What just shipped (commit SHA + description)
3. Current platform state (test count, TS errors, lint status)
4. Next batches queued (priority order)
5. Open questions / deferred items
6. How to verify locally (Windows PowerShell commands)
7. Memory pointers (file paths for key docs)
8. Architecture quick-orient (key instruction file paths)
```

### `.claude/skills/api-route/SKILL.md`
```markdown
---
name: api-route
description: >
  Next.js App Router API route conventions for Citizens Connect.
  Auto-loads when creating or modifying src/app/api/ route handlers.
---

# API Route Skill — Citizens Connect

## File Structure
```
src/app/api/
├── [feature]/
│   └── route.ts          # GET, POST, PATCH, DELETE handlers
└── [feature]/[id]/
    └── route.ts          # handlers with dynamic id
```

## Route Handler Template
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimiter, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // 1. Rate limit
  const limit = await rateLimiter(request, RATE_LIMITS.mutation);
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  // 2. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 3. Parse + validate input
  const body = await request.json();
  const text = body.text?.trim();
  if (!text || text.length < 1 || text.length > 500) {
    return NextResponse.json({ error: "Invalid input" }, { status: 422 });
  }

  // 4. UUID validation (if needed)
  const targetId = body.targetId;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(targetId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 422 });
  }

  // 5. DB operation (explicit column selection — no wildcards)
  const { data, error } = await supabase
    .from("my_table")
    .insert({ user_id: user.id, text, target_id: targetId })
    .select("id, text, created_at")  // explicit columns only
    .single();

  if (error) {
    console.error("[api/my-route] Insert failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
```

## Error Response Conventions
```typescript
// 401 — not logged in
{ error: "Unauthorized" }

// 403 — logged in but insufficient role
{ error: "Forbidden" }

// 409 — conflict with code
{ error: "Already exists", code: "already_exists" }

// 422 — validation error
{ error: "Invalid input" }  // never expose which field specifically for security

// 429 — rate limited
{ error: "Too many requests" }  // + Retry-After header

// 500 — server error
{ error: "Internal server error" }  // never leak Supabase error shape
```

## Rate Limit Constants (from src/lib/rate-limit.ts)
- `RATE_LIMITS.mutation` — 50/min/user (standard writes)
- `RATE_LIMITS.message` — 30/min/user (messaging)
- `RATE_LIMITS.auth` — 10/min/ip (auth operations)
- `RATE_LIMITS.heavy` — 5/min/user (expensive/sensitive)

## Test Coverage Requirements
Every route must have tests in `src/__tests__/api/[feature].test.ts`:
- 401 when unauthenticated
- Happy path (success response)
- 409 on conflict (if applicable)
- 422 on invalid input
- 500 on DB error (mock supabase to throw)
```

---

## Part 7 — Migration Plan (How to Implement This)

### Phase A — Create the `.claude/` structure (30 minutes)
These are new files only — nothing existing is deleted yet.

1. Create `CLAUDE.md` at repo root (content from Part 3 above)
2. Create `.claude/agents/` directory with all 6 agent files (Part 5)
3. Create `.claude/skills/` directory with all 6 skill directories (Part 6)
4. Create `supabase/CLAUDE.md` (Part 4)
5. Create `src/CLAUDE.md` (Part 4)
6. Create `src/components/map/CLAUDE.md` (Part 4)
7. Create `src/app/api/CLAUDE.md` (Part 4)

### Phase B — Validate the Copilot system still works (0 changes)
`.github/copilot-instructions.md` is untouched. Both systems run in parallel.
GitHub Copilot reads `.github/`. Claude Code reads `CLAUDE.md` + `.claude/`.

### Phase C — Gradually thin `.github/copilot-instructions.md`
Over the next 3–4 batches, move verbose domain content from `copilot-instructions.md`
into the relevant subdirectory `CLAUDE.md` files and skills. The root file becomes
a pointer document rather than a content document.

### Phase D — Wire the agents into the quality workflow
Replace manual "Architect subagent review" prose in copilot-instructions.md with:
`/architect` invocation (Claude Code reads `.claude/agents/architect.md` automatically)

### Immediate Priority Order for Batches
1. **Phase A (this batch)** — create all files above, push, update RESUME_HERE
2. **Phase 18 (Community Content)** — invoke `/community-content`, seed real data
3. **Phase 22 (Mobile Push)** — invoke `/mobile-specialist`, wire FCM/APNs

---

## Part 8 — The "4-Question Test" Applied to Citizens Connect

Before starting any batch, run this check:

**Q1: Is this a single-domain task or cross-domain?**
- Map UX change → `map-specialist` agent + `maplibre-patterns` skill
- DB migration → `database-specialist` agent + `supabase-migration` skill
- New feature (Event → DB + API + UI) → main session, reference all 4 subdirectory CLAUDE.md files

**Q2: Does an existing skill or agent handle this?**
Check `.claude/agents/` and `.claude/skills/` before building custom context.

**Q3: What is the single clear outcome I need?**
Write it in one sentence before starting. "Add FCM token registration to the push-notifications
Capacitor plugin and wire it to the push_tokens table" is good. "Improve mobile" is not.

**Q4: What quality bar must this pass?**
Default: full quality gate (Step 1–8 from `quality-gate` skill).
Exception: docs-only or tests-only changes skip Step 4 (architect) but still run Steps 1–3.

---

## Part 9 — The Vision Alignment Test

Every feature or refactor should pass this before it's started:

1. **Does it serve Citizens (discovery/community) or Contributors (creation/promotion)?** If neither, cut it.
2. **Does it move the platform toward Phase 18 (real, living community data) or Phase 22 (push delivery)?** If not, it's likely premature polish.
3. **Does it maintain Kingdom-quality polish?** If it introduces visual noise, clutter, or complexity, simplify before merging.
4. **Can the next session agent reconstruct context from RESUME_HERE.md alone?** If not, RESUME_HERE needs updating before push.

---

*This document is the strategic foundation. Implement Part 7 Phase A first — the actual files are ready to copy-paste above. Everything else follows.*
