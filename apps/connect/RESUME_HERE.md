# RESUME_HERE — Citizens Connect

> **Read this first. It is the single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch.

---

## 1. Project at a glance

- **Citizens Connect** — flagship channel of the Citizens ecosystem. Map-first community discovery (events, places, Contributors) for the Christian community and anyone curious.
- Stack: Next.js 15 App Router (RSC) + TypeScript + Supabase + MapLibre GL JS + MapTiler Cloud vector tiles + Tailwind CSS v4 + Capacitor (iOS/Android wrapper, no RN/Expo).
- Design: white-black-gold (60/30/10), full-screen map-first, glass-overlay floating controls, royal/Kingdom polish.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- **Locked single source of truth: `.github/MASTER_DIRECTION.md` (Parts 1–12).**

## 2. What just shipped

**Batch 1b — Re-file** — `origin/main` @ `6d43e06`.

- Root `MASTER_DIRECTION.md` deleted — `.github/MASTER_DIRECTION.md` is now the only copy.
- `.github/AGENTS.md` + 11 `.github/agents/*.agent.md` files archived to `docs/archive/` (D7: 11-agent workflow discarded; replaced by Architect subagent + inline Security review per batch).
- `.github/copilot-instructions.md` rewritten: correct role names (`citizen`/`contributor`+`contributor_kind`/`admin`), removed Agents section, updated roadmap (656 tests, no FullCalendar), session workflow updated.
- `.github/VISION.md` updated: Contributors/Citizens terminology, Pretoria default map centre, Citizens Learn channel added.
- `README.md` rewritten: drops Leaflet, adds MapLibre GL JS + MapTiler Cloud + TypeScript, adds Windows PATH note, MASTER_DIRECTION link.
- `docs/FUTURE_IDEAS.md` created — seeded with AI search, multilingual, CASI, analytics, Citizens Social, ecosystem channels (Wear/Learn/Central/Impact), architecture ideas.
- `.env.example` created — SUPABASE + MAPTILER keys documented; locked style UUID pre-filled.
- `docs/RUNBOOK.md` created — local setup, env vars, Vercel T4 owner task steps, quality gate, Supabase ops, Capacitor builds, git convention, common issues.
- `add-feature.prompt.md` + `debug-build.prompt.md`: Leaflet → MapLibre GL JS; vendor/client → contributor/citizen.
- `PROJECT_STATUS.md` + `DECISIONS.md` updated (Batch 1b shipped row + decisions).

✅ **Quality gate (Batch 1b):** tsc 0 errors · vitest 656/656 · lint clean · Architect A (6 Should-fixes applied: role language, prompt stale refs, PROJECT_STATUS update).

**Batch 1 — Admin panel restructure (FEAT-01 + D15)** — `origin/main` @ `375e7f2`.

- Admin dashboard at `/admin`, contributor applications inbox at `/admin/applications`.
- Burger menu: single "Admin panel →" link (not 6 separate links).
- Profile page: admin management tile.

✅ **Quality gate (Batch 1):** tsc 0 errors · vitest 656/656 · lint clean · advisors baseline unchanged.

## 3. Current platform state

- All Phase 1 → 11 work plus prior batches A–R, S1–S3, post-S3 1–3 remain shipped.
- MASTER_DIRECTION execution: Batches 1 + 1b shipped; Batches 2 → 6 queued.
- Test suite: 656 / 656. TS: 0 errors. Lint: clean. Advisors: baseline unchanged (2 known: `security_definer_view` on `directory_contributors`, `rls_disabled_in_public` on `app_settings` — Batch 2 / BUG-06).
- Git: `origin/main` at `6d43e06`.

## 4. Next batches queued (in priority order)

1. **Batch 2 — Legacy cleanup + map style + FEAT-02 calendar + BUG-06.**
   - Remove FullCalendar package + `EventCalendar.tsx` + dual-view toggle.
   - Remove FeaturedPanel + `/api/featured` + `featured_listings` table (drop migration).
   - Remove residual Leaflet imports / dependencies.
   - Remove `MapStyleDebugBadge` dev overlay (or confirm tree-shake).
   - Build FEAT-02: simple glass-overlay calendar (~150 LOC, plain CSS grid, drives existing events state).
   - BUG-06 advisor fixes: `directory_contributors` security_definer_view + `app_settings` RLS.

2. **Batch 3 — FEAT-03 Organisation Profiles & Discovery.**
3. **Batch 4 — FEAT-04 Consider → Convince complete (new `convinces` table).**
4. **Batch 5 — FEAT-05 Broadcast Updates (new `event_broadcasts` table).**
5. **Batch 6 — Extended profiles schema + `content_labels` table + monorepo folder prep.**

(Bug list BUG-01..BUG-10 and owner tasks T1..T6 from `.github/MASTER_DIRECTION.md` Parts 6–8 fold into these batches.)

## 5. Open questions / deferred items

- **T4 (owner task):** `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` are missing on Vercel. Map renders OSM raster fallback until set. See `docs/RUNBOOK.md` section 2 for Vercel setup steps. Style UUID locked: `019dba0f-b49b-73bb-bf6a-f9d820f43be8`.
- **Doc-vs-code discrepancy logged in DECISIONS.md:** approval keeps `role='contributor'` + `contributor_kind` sub-type (per migration 033), not the literal "role to match contributor_kind" wording in MASTER_DIRECTION FEAT-01.
- **`/admin/reports` not renamed to `/admin/reported`** per the spec — deferred (logged in DECISIONS).
- **Architect nice-to-haves N1–N6** (deferred): rename `leaflet-maps.instructions.md`, fix "vendor-only" in `project-architecture.instructions.md`, fix "Vendor create" in `connect-ui-system.instructions.md`, add DECISIONS note on organizer terminology, fix `QUEUED_BATCH_S_categories_v2.md` AGENTS reference, fix `STATUS_REPORT_2026-05.md` "Vendor Analytics" label.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 656 pass / 0 fail
npx next lint --dir src     # expect clean (deprecation warning is non-blocking)
```

Smoke test the admin restructure:

1. Sign in as an admin user → visit `/admin` → confirm 5 stat tiles render and `/admin/applications` opens from the tools grid.
2. Visit `/admin/contributors` → confirm 302 to `/admin/applications`.
3. Open the burger menu as admin → confirm a single "Admin panel →" entry (not six links).
4. Visit `/profile` as admin → confirm the "Admin Panel" management tile appears.
5. Visit `/admin` as a non-admin → confirm redirect to `/events`.

## 7. Memory pointers

- Locked direction: `.github/MASTER_DIRECTION.md` (sole canonical copy since Batch 1b).
- Batch shipping notes: `/memories/repo/batch-*.md`.
- Standing user workflow: `/memories/quality-pipeline.md` (user-scope).
- Ecosystem vision + slogan: `/memories/repo/citizens-ecosystem-vision.md`, `/memories/repo/citizens-slogan.md`.
- Coding conventions: `/memories/repo/coding-patterns.md`.
- Deferred features: `docs/FUTURE_IDEAS.md`.
- Operations runbook: `docs/RUNBOOK.md`.

## 8. Architecture quick-orient

- Full directory map + data flow + key relationships: `.github/instructions/project-architecture.instructions.md`.
- UI rules (60/30/10, floating controls): `.github/instructions/connect-ui-system.instructions.md`.
- MapLibre + MapTiler patterns: `.github/instructions/leaflet-maps.instructions.md` (filename is legacy; content is MapLibre GL JS — rename is N1 deferred).
- Supabase dual-client + RLS + storage: `.github/instructions/supabase-patterns.instructions.md`.
- Project ID: `xyiajtrvhlxaeplsiajj`. Default map centre: Pretoria, South Africa `[-25.7479, 28.2293]`.
- Roles: `citizen` / `contributor` / `admin` with `contributor_kind` sub-type (`ministry` / `organization` / `business`) per migration 033.
