# Citizens — the ecosystem monorepo

> **Connecting the Kingdom.** (Ephesians 2:19–21)
>
> One identity, one shared data plane, one build pipeline — three apps serving
> citizens, contributors, and the needs between them.
> North star: [`apps/connect/VISION.md`](apps/connect/VISION.md) — read it first, every time.

## The apps

| App         | Path                           | What it is                                                                    | Runtime                                                                 |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Connect** | [`apps/connect`](apps/connect) | Map-first Christian community discovery — events, places, contributors.       | Next.js (API-only) + standalone HTML frontend + Capacitor (iOS/Android) |
| **Vision**  | [`apps/vision`](apps/vision)   | Impact intelligence back-office for organisations — reach, engagement, goals. | Next.js (API-only) + standalone HTML frontend (desktop)                 |
| **Wear**    | [`apps/wear`](apps/wear)       | Kingdom fashion social platform — brands, posts, stories, DMs.                | Next.js (API-only) + standalone HTML frontend                           |

The **front door**, [`apps/hub`](apps/hub), is not a product. It will own the shared domain (`219.co.za`):
it serves the `/citizens` landing page and the coming-soon pages, and proxies `/citizens/<app>` to each app above
([`packages/ecosystem`](packages/ecosystem) is the one list of those paths). The move is staged and off until the
cutover in [`apps/connect/docs/CUTOVER_219.md`](apps/connect/docs/CUTOVER_219.md).

All three share **one Supabase project** (one `auth.users`, per-app Postgres schemas
`public` / `vision` / `wear`) governed by
[`apps/connect/docs/SHARED_DB_CONTRACT.md`](apps/connect/docs/SHARED_DB_CONTRACT.md),
and one static-frontend pipeline ([`packages/frontend-build`](packages/frontend-build)).

## Layout

```
apps/
  connect/         Citizens Connect (incl. android/ + ios/ Capacitor shells)
  vision/          Citizens Vision
  wear/            Citizens Wear
  hub/             Citizens hub: the front door of the shared domain (/citizens landing page, coming-soon pages, proxy to each app)
packages/
  frontend-build/  @citizens/frontend-build — shared esbuild static-frontend pipeline
  ecosystem/       @citizens/ecosystem — where each app lives on the shared domain (/citizens/<app>)
  connect-client/  @citizens/connect-client — typed client for Connect's /api/v1
  db/              @citizens/db — Wear store contract + memory reference impl
  ui/              @citizens/ui — design tokens (Wear)
  config/          @citizens/config — shared TS/ESLint config
supabase/          THE single migration lineage (public/vision/wear schemas, one project)
docs/              Wear-era architecture docs + ADRs (ecosystem docs live in apps/connect/docs)
```

## Getting started

```bash
corepack enable          # pnpm via packageManager field
pnpm install
pnpm build               # turbo run build (all apps + packages)
pnpm lint && pnpm typecheck && pnpm test
```

Per-app work: `pnpm --filter @citizens/wear dev`, `pnpm --filter citizens-connect test`,
`pnpm --filter citizens-vision build`, etc.

## Database — one lineage, three schemas

`supabase/migrations/` is owned by the **repo**, not one app (hoisted from Connect in
ecosystem Step 5). Head **146**. Rules live in the
[shared DB contract](apps/connect/docs/SHARED_DB_CONTRACT.md): migrations are applied via
MCP `apply_migration` with pre-apply git tags + security-advisor checks, numbered
sequentially across all apps. Cross-app data flows through Connect's `/api/v1`
([contract](apps/connect/docs/api-v1.md)) — never raw sibling tables.

## Deploys (Vercel — one project per app)

Each app deploys independently. Per project, set **Root Directory** to
`apps/connect`, `apps/vision` or `apps/wear`.

Each app's `vercel.json` sets `ignoreCommand` to
[`scripts/vercel-ignore.mjs`](scripts/vercel-ignore.mjs). That command overrides
the dashboard Ignored Build Step. Exit 0 cancels the deployment before the
build; exit 1 builds.

Vercel skips an app when the commit only changes documentation, or when it does
not touch that app or a shared package the app depends on. Documentation is any
`*.md` file, anything under `docs/` or `apps/<app>/docs/`, and
`.github/ISSUE_TEMPLATE/`. A change in one app builds that app. A shared
package builds every app that depends on it. GitHub Actions is separate and
always runs.

The script builds whenever it cannot be sure. That includes no previous
deployment SHA, a checkout too shallow to contain that commit, a git error, or
a path it does not recognise (the lockfile, root config, a workflow, a
migration). A production deploy of real code is never skipped by mistake.

Deploy-gate env values per app are listed in
[`apps/connect/RESUME_HERE.md`](apps/connect/RESUME_HERE.md) (§2 env snapshot + §4A founder actions).

## History

This repo grew out of `citizens-wear` (the Turborepo seed) in ecosystem Step 5
(2026-07-03): `citizens-connect` and `citizens-vision` were lifted in with full history
via `git filter-repo --to-subdirectory-filter`. Pre-lift anchor tags
(`{connect,vision,wear}-pre-monorepo`) live in the three original repos.
Project log + current state: [`apps/connect/RESUME_HERE.md`](apps/connect/RESUME_HERE.md).
Ecosystem plan: [`apps/connect/docs/strategy/ECOSYSTEM_DECISION_BRIEF.md`](apps/connect/docs/strategy/ECOSYSTEM_DECISION_BRIEF.md).
