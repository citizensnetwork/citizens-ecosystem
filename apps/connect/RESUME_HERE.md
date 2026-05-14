# RESUME_HERE — Citizens Connect

> **Read this first. It is the single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch.

---

## 1. Project at a glance

- **Citizens Connect** — flagship channel of the Citizens ecosystem. Map-first community discovery (events, places, organisers) for the Christian community and anyone curious.
- Stack: Next.js 15 App Router (RSC) + Supabase + MapLibre GL JS + MapTiler Cloud vector tiles + Tailwind CSS v4 + Capacitor (iOS/Android wrapper, no RN/Expo).
- Design: white-black-gold (60/30/10), full-screen map-first, glass-overlay floating controls, royal/Kingdom polish.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- **Locked single source of truth: `MASTER_DIRECTION.md` (Parts 1–12).** A duplicate copy sits at `.github/MASTER_DIRECTION.md` for now; Batch 1b will resolve to a single canonical location under `.github/`.

## 2. What just shipped

**Batch 1 — Admin panel restructure (FEAT-01 + D15)** — `origin/main` @ `793abcd`.

- NEW `src/app/admin/page.tsx` — admin dashboard with five RLS-respecting stat tiles (pending applications, open reports, users, events, places) and a tools grid linking to existing sub-pages.
- NEW `src/app/admin/applications/page.tsx` — canonical contributor application review inbox. Uses shared `fetchPendingApplications` loader + existing `ContributorReviewCard`; visible error banner on fetch failure.
- `src/app/admin/contributors/page.tsx` — collapsed to `redirect("/admin/applications")` so the email approval/rejection deep-links keep working. `/admin/contributors/[id]` detail page is untouched.
- `src/components/events/BurgerMenu.tsx` — six admin links replaced with a single gold-styled "Admin panel →" link, gated on `profile.role === "admin"` (per D15).
- `src/app/profile/page.tsx` — added an admin-only "Admin Panel" management link.
- Stale `fallbackHref="/admin/contributors"` and prose comments updated to reference `/admin/applications` (Architect Should-fix).

✅ **Quality gate (Batch 1):** tsc 0 errors · vitest 656 / 656 · `npx next lint --dir src` clean · Supabase security advisors unchanged vs baseline (still 2 known: `security_definer_view` on `directory_contributors`, `rls_disabled_in_public` on `app_settings` — both addressed in Batch 2 / BUG-06) · Architect review A / A / A on architecture / API / security; A− on perf / a11y / code quality (nice-to-haves deferred).

## 3. Current platform state

- All Phase 1 → 11 work plus prior batches A–R, S1–S3, post-S3 1–3 remain shipped.
- **MASTER_DIRECTION execution begins this session.** Batch 1 shipped; Batches 1b → 6 queued.
- Test suite: 656 / 656. TS: 0 errors. Lint: clean. Advisors: baseline unchanged.
- Git: `origin/main` at `793abcd`. `PROJECT_STATUS.md` + `DECISIONS.md` updated in the same commit.

## 4. Next batches queued (in priority order)

1. **Batch 1b — Re-file.** Move `MASTER_DIRECTION.md` → `.github/MASTER_DIRECTION.md` (delete root copy). Archive `.github/AGENTS.md` + the 11 `.github/agents/*.agent.md` files to `docs/archive/`. Rewrite `.github/copilot-instructions.md` with simplified 2-review workflow (Architect + inline Security). Rewrite `.github/VISION.md` per MASTER_DIRECTION Part 12. Create `docs/FUTURE_IDEAS.md` (seeded per Part 4: AI search, multilingual, CASI, Wear, Learn, Impact, Social, Mapbox-vs-MapTiler note, AI moderation). Create `.env.example` covering owner tasks (T4 MapTiler `NEXT_PUBLIC_MAPTILER_KEY` + `NEXT_PUBLIC_MAPTILER_STYLE=019dba0f-b49b-73bb-bf6a-f9d820f43be8`) and a runbook doc. Refresh `README.md` (drop Leaflet, refresh stack). Update relevant `/memories/repo/*` notes.

2. **Batch 2 — Legacy cleanup + map style + FEAT-02 calendar + BUG-06.**
   - Remove FullCalendar package + `EventCalendar.tsx` + dual-view toggle.
   - Remove FeaturedPanel + `/api/featured` + `featured_listings` table (drop migration).
   - Remove residual Leaflet imports / dependencies.
   - Remove `MapStyleDebugBadge` dev overlay (or confirm tree-shake).
   - Build FEAT-02: simple glass-overlay calendar (~150 LOC, plain CSS grid, drives existing events state).
   - BUG-06 advisor fixes: `directory_contributors` security_definer_view + `app_settings` RLS.
   - README + VISION + copilot-instructions updates.

3. **Batch 3 — FEAT-03 Organisation Profiles & Discovery.**
4. **Batch 4 — FEAT-04 Consider → Convince complete (new `convinces` table).**
5. **Batch 5 — FEAT-05 Broadcast Updates (new `event_broadcasts` table).**
6. **Batch 6 — Extended profiles schema + `content_labels` table + monorepo folder prep.**

(Bug list BUG-01..BUG-10 and owner tasks T1..T6 from `MASTER_DIRECTION.md` Parts 6–8 fold into these batches.)

## 5. Open questions / deferred items

- **T4 (owner task):** `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` are missing on Vercel. Map renders OSM raster fallback until set. Batch 1b will add `.env.example` + runbook; user must paste the key into Vercel project settings. Style UUID locked: `019dba0f-b49b-73bb-bf6a-f9d820f43be8`.
- **Doc-vs-code discrepancy logged in DECISIONS.md:** approval keeps `role='contributor'` + `contributor_kind` sub-type (per migration 033), not the literal "role to match contributor_kind" wording in MASTER_DIRECTION FEAT-01.
- **`/admin/reports` not renamed to `/admin/reported`** per the spec — deferred (logged in DECISIONS).

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

- Locked direction: `MASTER_DIRECTION.md` (root + `.github/` copy — Batch 1b consolidates).
- Batch shipping notes: `/memories/repo/batch-*.md`.
- Standing user workflow: `/memories/quality-pipeline.md` (user-scope).
- Ecosystem vision + slogan: `/memories/repo/citizens-ecosystem-vision.md`, `/memories/repo/citizens-slogan.md`.
- Coding conventions: `/memories/repo/coding-patterns.md`.

## 8. Architecture quick-orient

- Full directory map + data flow + key relationships: `.github/instructions/project-architecture.instructions.md`.
- UI rules (60/30/10, floating controls): `.github/instructions/connect-ui-system.instructions.md`.
- MapLibre + MapTiler patterns: `.github/instructions/leaflet-maps.instructions.md` (file name is legacy; content is MapLibre).
- Supabase dual-client + RLS + storage: `.github/instructions/supabase-patterns.instructions.md`.
- Project ID: `xyiajtrvhlxaeplsiajj`. Default map centre: Pretoria, South Africa `[-25.7479, 28.2293]`.
- Roles: `citizen` / `contributor` / `admin` with `contributor_kind` sub-type (`ministry` / `organization` / `business`) per migration 033.
