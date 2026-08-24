# Citizens Connect

**Connecting the Kingdom.** Map-first discovery for Pretoria's Christian community —
find a church, ministry, business, or event; be found by the citizens looking for you.

Part of the [Citizens ecosystem](../../README.md) monorepo, alongside Citizens Vision
(impact intelligence) and Citizens Wear (Kingdom-aligned fashion), sharing one Supabase
project under a locked cross-app data contract.

---

## What the platform does

Citizens Connect is a map-first discovery app built around three concepts:

- **Contributor** — the identity that adds to the platform: an individual or a formally
  established entity (church, ministry, non-profit, business). Applies once, goes live
  immediately (v1: no admin approval wait — see `V1_SCOPE.md`).
- **Place** — a physical location a Contributor owns or is tied to.
- **Event** — time-bound, attached to a Contributor, on the map only while scheduled.

Citizens browse Contributors/Places/Events on a MapLibre map centered on Pretoria, or in
**Kingdom Discovery**, the scrollable list view — same underlying data, two ways to find
what you're looking for.

Full product framing, language, and the "why" behind every feature lives in
[`VISION.md`](VISION.md) — read it first, every session. Current v1 scope and
what's shipped vs. still open is tracked in [`V1_SCOPE.md`](V1_SCOPE.md) and
[`RESUME_HERE.md`](RESUME_HERE.md) (the single source of truth for project state).

## Architecture

- **Frontend**: a standalone, no-build HTML/React app (`src/frontend/`) — screens are
  IIFE modules registered on `window`, routed by a single `nav.page` switch in
  `shell.jsx`. Compiled by `scripts/build-frontend.js` (esbuild) into `public/` on
  every build; also wrapped for iOS/Android via Capacitor (`android/`, `ios/`).
- **Backend**: Next.js, API-only (`src/app/api/`) — no server-rendered pages. Talks to
  the shared Supabase (Postgres) project: RLS on every table, SECURITY DEFINER RPCs for
  privileged actions, migrations in `../../supabase/migrations/` (one shared lineage
  across Connect/Vision/Wear — see `docs/SHARED_DB_CONTRACT.md`).
- **Public API**: `/api/v1/*` is the cross-app + ecosystem-facing contract — documented
  in `docs/api-v1.md`.

## Local development

```bash
pnpm install                       # from the monorepo root
cp apps/connect/src/frontend/config.example.js apps/connect/src/frontend/config.js
# fill in config.js with your Supabase/MapTiler keys
pnpm --filter citizens-connect dev
```

## Gates (run before every push)

```bash
npx tsc --noEmit
npx vitest run
npx eslint
node scripts/build-frontend.js
npx playwright test
```

Or from the monorepo root: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.

## Key paths

- `src/frontend/app/` — the frontend screens (`.jsx`, IIFE modules)
- `src/app/api/` — the Next.js API routes
- `scripts/build-frontend.js` — compiles `src/frontend/` into `public/`
- `e2e/` — Playwright end-to-end tests (`playwright.config.ts`)
- `docs/` — architecture, migration strategy, launch runbook, API contract
- `CATEGORIES.md` — the event/place category taxonomy (colors + icons)
- `RESUME_HERE.md` — **read this first** — current project state, resumable across sessions
- `VISION.md` — the product's north star; read before planning or shipping anything
