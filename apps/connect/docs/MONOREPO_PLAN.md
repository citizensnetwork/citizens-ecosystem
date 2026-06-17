# Monorepo Migration Plan — Citizens Ecosystem

> ⚠️ **SUPERSEDED (2026-06-16) by [`docs/strategy/ECOSYSTEM_DECISION_BRIEF.md`](strategy/ECOSYSTEM_DECISION_BRIEF.md).**
> Two assumptions here are overtaken by reality: (1) "Wear starts fresh inside the monorepo" —
> Wear is **already** a standalone Turborepo and is now the monorepo *seed*; (2) the single-shared-
> Supabase-project layout is confirmed, but the migration is a *consolidation of 3 existing repos*,
> not "lift Connect + start Wear." **Still valid:** the `git filter-repo` mechanics, the risks/
> mitigations (§4), and the cutover checklist (§5). Read the brief first.

> **Status:** Planning. No code has moved. This document defines the target state and the cutover steps.
> Triggered by: MASTER_DIRECTION Part 7 — "Monorepo Migration (before building Wear)".

## 1. Why a monorepo

Connect, Wear, Vision, Learn, Impact, Social, Play share:

- **Auth** — the same Supabase project / `auth.users` rows / cookie shape.
- **Profile** — one `profiles` row per user, with app-specific columns (see migration `072_extended_profile_schema`).
- **Design tokens** — white-black-gold 60/30/10, glass overlays, royal typography.
- **TypeScript types** — `Profile`, `EventCategory`, `ContributorKind`, `ContentLabel` etc.
- **Map primitives** — MapLibre + MapTiler config, marker builders.
- **Validation utilities** — UUID checks, rate-limit helpers, sanitisation.

Running each channel in its own repo means re-implementing all of the above from scratch every time a new channel boots. That is the failure mode the spec exists to prevent.

## 2. Target state

```
citizens/                       (new repo: github.com/citizens-network/citizens)
├── apps/
│   ├── connect/                ← this repo, lifted in whole into apps/connect/
│   ├── wear/                   ← new (will start in monorepo)
│   ├── vision/                 ← existing citizens-vision repo, lifted
│   ├── learn/                  ← Phase 5
│   ├── impact/                 ← Phase 5
│   ├── social/                 ← Phase 6
│   └── play/                   ← Phase 4
├── packages/
│   ├── ui/                     ← shared design system (buttons, cards, glass overlay)
│   ├── auth/                   ← Supabase SSR + client wrappers
│   ├── database/               ← `@citizens/database` — Supabase generated types + helpers
│   ├── config/                 ← ESLint, TypeScript, Tailwind base configs
│   └── utils/                  ← formatters, validators, rate-limit, UUID, sanitise
├── supabase/                   ← single shared `supabase/` folder (one project per env)
│   ├── migrations/
│   ├── functions/
│   └── schema.sql
├── docs/
├── turbo.json
├── package.json                ← workspaces: [ "apps/*", "packages/*" ]
└── pnpm-workspace.yaml         ← (pnpm preferred for monorepo perf over npm)
```

### Tooling

- **Turborepo** (`turbo.json`) — task pipeline + remote caching.
- **pnpm workspaces** — preferred over npm for hard-link efficiency and stricter peer-dep resolution.
- **Node 22.x** (`.nvmrc` at root).
- **TypeScript 5.x** with project references in each package's `tsconfig.json`.

### Shared package boundaries

- `@citizens/ui`: pure presentational components, no data fetching, no Supabase imports.
- `@citizens/auth`: thin wrappers around `@supabase/ssr`. Exports `createServerClient()`, `createBrowserClient()`. **No** Next.js-specific code (so Wear / Vision can be on any framework).
- `@citizens/database`: generated types via `supabase gen types typescript`. Plus zod schemas for runtime validation.
- `@citizens/utils`: pure functions. No I/O.

## 3. Migration plan

1. **Snapshot Connect** — tag `connect-pre-monorepo` on `origin/main`. This is the rollback anchor.
2. **Create `citizens-network/citizens` repo** — empty, README only.
3. **Move Connect verbatim** — `git mv` the whole `citizens-connect/` tree into `apps/connect/`. Keep history via `git filter-repo --to-subdirectory-filter apps/connect/`.
4. **Hoist `supabase/`** — top-level `supabase/` is shared by every app. Adjust `apps/connect/` to reference `../../supabase/` (or symlink) for the CLI.
5. **Wire workspace package.json** — `pnpm-workspace.yaml`, root `package.json` with `"workspaces": ["apps/*", "packages/*"]`, install Turborepo.
6. **Extract first package** — `@citizens/database` is the smallest, highest-leverage: regenerate `src/types/db.ts` and move it under `packages/database/src/index.ts`. Update Connect imports to `@citizens/database`.
7. **Extract `@citizens/auth`** — move `src/lib/supabase/{server,client}.ts` to `packages/auth/`.
8. **Extract `@citizens/utils`** — move `src/lib/rate-limit*.ts`, `src/lib/validation.ts`, `src/lib/cn.ts`.
9. **Extract `@citizens/ui`** — only after Wear begins. Connect-internal components stay in `apps/connect/src/components/` until they have a second consumer.
10. **Set up Turborepo pipeline** — `turbo run build|lint|test` with `dependsOn: ["^build"]`.
11. **Vercel** — link the new `citizens` repo to a Vercel project per app. `apps/connect` deploys to `connect.kingdomcommons.co.za`.

## 4. Risks & mitigations

- **History loss** during the lift → mitigated by `git filter-repo --to-subdirectory-filter` which preserves history under the new path.
- **Supabase CLI confusion** with `supabase/` at root vs nested → mitigated by a single root `supabase/` directory; each app references it by relative path.
- **Capacitor build paths** (`android/`, `ios/`) currently live at Connect repo root → will be moved to `apps/connect/native/` with `capacitor.config.ts` paths updated.
- **Vercel preview deploys** that today auto-trigger on PRs to Connect will need per-app filters in Turborepo (`turbo.json` `"globalEnv"` + Vercel "Ignored Build Step").

## 5. Cutover criteria

Do not begin the cutover until ALL of these are true:

- [ ] BUG-01 .. BUG-10 (MASTER_DIRECTION Part 3) all resolved on Connect.
- [ ] T1–T9 (MASTER_DIRECTION Part 9 — owner tasks) status known; T1, T2, T3, T4 done.
- [ ] Citizens Wear feature spec drafted (Part 12 mentions a separate planning session).
- [ ] Citizens Network PBO has decided on a github org name and ownership.
- [ ] At least one external pilot user has signed up on Connect (Part 9 T8).

Once those are true: the cutover itself is a 1–2 day exercise. Until they are true, this document is the plan and `apps/connect/` does not exist.

## 6. Where stub folders live

Inside this repo, [`monorepo-prep/`](../monorepo-prep/) holds placeholder README files for each future package. They document the intended responsibility of each package without containing any source. When the cutover happens, those README files travel into the new `citizens/` repo as the seed of each `packages/<name>/README.md`.

---

*Document version: 1.0 · Author: Citizens Network · Aligns with MASTER_DIRECTION.md Part 7 / Batch 6.*
