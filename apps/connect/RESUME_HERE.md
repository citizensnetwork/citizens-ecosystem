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

**Batch 5 — FEAT-05 Broadcast Updates polish + retroactive infrastructure fix** — `origin/main` @ `a198be7`.

- **Critical finding:** migration `030_event_updates.sql` was authored locally on the Phase E ship date but never applied to the remote project. Every FEAT-05 surface (composer, viewer, GET/POST API, edge function) had been silently 500'ing in production since Phase E shipped. Applied retroactively via MCP.
- **New migration `071_event_updates_realtime.sql`** adds `event_updates` to the `supabase_realtime` publication (idempotent), applied.
- **New `DELETE /api/events/:id/updates/:updateId`** — RLS-gated (author or admin), UUID-validated, scoped by both `event_id` and `id` so a caller can't reach across events. Maps 42501/RLS → 403, missing row → 404, success → 200. 5 new tests.
- **`EventUpdatesList` rewritten** — resolves current viewer + admin role on mount; subscribes to `postgres_changes` INSERT and DELETE filtered by `event_id`; renders inline Delete button when `viewer.id === author_id` or `viewer.isAdmin`; optimistic local removal; cleans up channel on unmount. Initial snapshot uses merge-not-replace dedupe to avoid a sub-second race against the realtime channel (Architect Should-fix).
- **`OrgSearchPanel` kind-label dedupe** — triple ternary replaced with a local `KIND_BADGE_LABEL` record at file scope; commented why the short "Org" label intentionally diverges from canonical `CONTRIBUTOR_KIND_LABELS`.
- **`leaflet-maps.instructions.md` renamed to `maplibre-maps.instructions.md`** via `git mv`; refs updated in `copilot-instructions.md`, `RESUME_HERE.md`, `docs/STATUS_REPORT_2026-05.md`.
- **`.github/MASTER_DIRECTION.md` FEAT-05 doc reconciled** — `event_broadcasts` is the spec name; `event_updates` (1000 chars, not 500) is the shipped name. Future readers won't re-debate this.

✅ **Quality gate (Batch 5):** tsc 0 errors · vitest 77 files / 682 tests · lint clean · Architect 1 Should-fix applied inline (race), 2 Nice-to-haves logged · advisors **0 ERROR / 83 WARN — unchanged from Batch 4 baseline**.

**Batch 4 — FEAT-04 Consider → Convince + friend-activity notifications** — `origin/main` @ `a99366d`.

- **`convinces` table** (id, from_user_id, to_user_id, event_id, created_at) + RLS: participants read; mutual-friend + target-is-considering insert; sender-only delete. `UNIQUE (from_user_id, to_user_id, event_id)` makes Convinced a one-time act per recipient/event — duplicate INSERT returns 23505 → API maps to 409 → UI flips to "Convinced ✓".
- **`/api/convince` (POST + DELETE)** — rate-limited, UUID-validated, self-block, error-code mapping (23505 → 409, 42501 → 403, 201 on success). 9 new tests.
- **Two new SECURITY DEFINER triggers** (both `search_path = pg_catalog, public`, per project hardening standard from migration 051):
  - `notify_on_convince` — fires on `convinces` INSERT, respects `notification_prefs.friends_activity` (default ON), writes `friend_convince` notification.
  - `notify_friends_on_rsvp_attending` — fires on `rsvps` INSERT or UPDATE when `status=attending` (first-time transition only), fans out `friend_attending` notifications to every mutual follower with the pref on, **with 24h dedup `not exists` guard** so rapid attending↔considering toggles don't re-fan-out.
- **Notifications type allow-list widened** for `friend_convince` and `friend_attending`.
- **`useBurgerMenuData` rewritten** — 6 parallel queries: trending, favourite orgs, friends, friend-considerings (grouped mutuals per event), userConsidering, incomingConvinceEventIds (`Set<event_id>` of events convinced TO me), outgoingConvinceKeys (`Set<event_id|to_user_id>`). Returns a `refetch()` callable.
- **BurgerMenu refactored** into unified **Considerations** section: segmented My/Friends toggle; combined badge `userConsidering.length + friendConsiderings.length`; new `FriendConsideringCard` renders event card + mutual avatars + Convince button (treats 201 || 409 as success → flips to "Convinced" pill via `localSent` || `outgoingConvinceKeys.has(...)`). Old Friends accordion + `BurgerConsiderSection` + `FriendAccordion` helpers removed.
- **EventsView wired**: passes new hook fields to BurgerMenu; quick-action `consider` calls `refetchBurgerData()` after `setConsiderVersion`; both horizontal-card grids (trending + quick-panel) render a small "✦ Convinced" overlay on events present in `incomingConvinceEventIds`.
- **NotificationPanel** `TYPE_ICONS` extended with `friend_convince: "✦"`, `friend_attending: "♥"`, `new_message: "✉"`. Existing `data.event_id` deep-link already navigates.
- **Migrations**: `022` source updated on-disk to match deployed hardened state (auth.uid() check + revoke/grant). `069` created (table + RLS + widened CHECK + 2 triggers). `070` created (search_path hardening on all 3 functions + dedup guard) — both applied to remote via MCP and verified.
- **`supabase/schema.sql`** canonical FEAT-04 block appended.

✅ **Quality gate (Batch 4):** tsc 0 errors · vitest 76 files / 677 tests (+9 new for /api/convince) · lint clean · Architect B→A after applying both Must-fixes + one Should-fix inline (see DECISIONS.md) · advisors **0 ERROR / 83 WARN** (baseline 77 + 4 expected for new SECURITY DEFINER triggers + 2 scan variability; no new ERROR-level findings).

**Batch 3 — FEAT-03 Organisation Profiles & Discovery + N1/N3/N5 + place owner link** — `origin/main` @ `ef7fac6`.

- **Typo-tolerant contributor search** (`pg_trgm` in the `extensions` schema). RPC `public.search_contributors(q, kinds, location_query, category_slug, sort_by, result_limit)` — SECURITY INVOKER, STABLE, `search_path = public, extensions, pg_temp`, `word_similarity(qn, full_name) >= 0.3`. "evry naton" → "Every Nation Mooikloof" (sim 0.43). ILIKE branches escape `\ % _` to prevent wildcard injection.
- **API:** `GET /api/contributors/search` — anon-allowed, rate-limited per IP (120/min), bare `@supabase/supabase-js` client singleton (no cookie, CDN-cacheable). `Cache-Control: public, s-maxage=15, stale-while-revalidate=60`.
- **UI:** `OrgSearchPanel` (debounced 220ms, AbortController) mounted as an "Organisations" tab in the events bottom search bar (segmented Everything / Organisations toggle). Results → `/c/<slug>`.
- **N1:** removed dead `isVendor` prop from EventsView + deduped router declaration.
- **N3:** simplified profile select on `/events` page.
- **N5:** GlassCalendar autofocuses its close button on open.
- **URL hygiene:** single `closeCalendar()` callback routes every dismiss path (Escape, GlassCalendar onClose, event/place select, brand click, focus-event) so `?view=calendar` is always stripped.
- **Place owner link:** `/places/[id]` now shows "Owned by <full_name>" linked to `/c/<slug>` when role=contributor + status=approved + slug.
- **Migrations:** 066 (RPC + pg_trgm), 067 (pg_trgm relocated to `extensions`), 068 (ILIKE escaping). `supabase/schema.sql` canonical block appended.

✅ **Quality gate (Batch 3):** tsc 0 errors · vitest 75 files / 668 tests (+12 new) · lint clean · Architect B→A after applying all three Should-fixes inline · advisors **0 ERROR / 77 WARN — unchanged from Batch 2 baseline**.

**Batch 2 — Events surface simplification + RLS hardening (FEAT-02 + BUG-06)** — `origin/main` @ `ffd8133`.

- **Removed:** FullCalendar (5 packages), `EventCalendar.tsx`, `FeaturedPanel.tsx`, `/api/featured` route, `featured_listings` table (migration 065), trending modal in EventsView, `leaflet.markercluster.d.ts`, ~150 LOC of `.fc-*` CSS overrides, calendar province filter.
- **Added:** `src/components/events/GlassCalendar.tsx` (~280 LOC, zero-dep frosted month-grid overlay rendered above the persistent map). Category-coloured left border, gold tint for RSVPed events, max 3 events/day + "+N more", Escape closes, arrow-key month nav (guarded against INPUT/TEXTAREA/contentEditable).
- **EventsView refactor:** `view: "map"|"calendar"` state replaced with `calendarOpen: boolean` overlay; `?view=calendar` deep-link still works.
- **Migration 065 applied:** dropped `featured_listings`; `directory_contributors` recreated `WITH (security_invoker = on)`; `app_settings` RLS enabled (admin-only). Supabase advisors **2 ERROR → 0 ERROR**.

✅ **Quality gate (Batch 2):** tsc 0 errors · vitest 73 files / 656 tests · lint clean · Architect (no Must-fix; S1 + S2 applied inline; N1–N5 deferred) · advisors 2 ERROR cleared, no NEW warnings.

**Batch 1b — Re-file** — `origin/main` @ `6d43e06`.

- Root `MASTER_DIRECTION.md` deleted — `.github/MASTER_DIRECTION.md` is now the only copy.
- `.github/AGENTS.md` + 11 `.github/agents/*.agent.md` files archived to `docs/archive/` (D7: 11-agent workflow discarded; replaced by Architect subagent + inline Security review per batch).
- `.github/copilot-instructions.md` rewritten: correct role names (`citizen`/`contributor`+`contributor_kind`/`admin`), removed Agents section, updated roadmap (656 tests, no FullCalendar), session workflow updated.
- `.github/VISION.md` updated: Contributors/Citizens terminology, Pretoria default map centre, Citizens Learn channel added.
- `README.md` rewritten: drops Leaflet, adds MapLibre GL JS + MapTiler Cloud + TypeScript, adds Windows PATH note, MASTER_DIRECTION link.
- `docs/FUTURE_IDEAS.md` created — seeded with AI search, multilingual, CASI, analytics, Citizens Social, ecosystem channels (Wear/Learn/Central/Impact), architecture ideas.
- `.env.example` created — SUPABASE + MAPTILER keys documented; locked style UUID pre-filled.
- `docs/RUNBOOK.md` created — local setup, env vars, Vercel T4 owner task steps, quality gate, Supabase ops, Capacitor builds, git convention, common issues.

✅ **Quality gate (Batch 1b):** tsc 0 errors · vitest 656/656 · lint clean · Architect A (6 Should-fixes applied).

**Batch 1 — Admin panel restructure (FEAT-01 + D15)** — `origin/main` @ `375e7f2`.

- Admin dashboard at `/admin`, contributor applications inbox at `/admin/applications`.
- Burger menu: single "Admin panel →" link (not 6 separate links).
- Profile page: admin management tile.

✅ **Quality gate (Batch 1):** tsc 0 errors · vitest 656/656 · lint clean · advisors baseline unchanged.

## 3. Current platform state

- All Phase 1 → 11 work plus prior batches A–R, S1–S3, post-S3 1–3 remain shipped.
- MASTER_DIRECTION execution: Batches 1, 1b, 2, 3, 4, **5** shipped; Batch 6 queued.
- Test suite: 682 / 682. TS: 0 errors. Lint: clean.
- Supabase advisors security: 0 ERROR, 83 WARN (unchanged from Batch 4 baseline).
- Git: `origin/main` at `a198be7`.

## 4. Next batches queued (in priority order)

1. **Batch 6 — Extended profiles schema + `content_labels` table + monorepo folder prep.**

(Bug list BUG-01..BUG-10 and owner tasks T1..T6 from `.github/MASTER_DIRECTION.md` Parts 6–8 fold into these batches.)

## 5. Open questions / deferred items

- **T4 (owner task):** `NEXT_PUBLIC_MAPTILER_KEY` and `NEXT_PUBLIC_MAPTILER_STYLE` are missing on Vercel. Map renders OSM raster fallback until set. See `docs/RUNBOOK.md` section 2 for Vercel setup steps. Style UUID locked: `019dba0f-b49b-73bb-bf6a-f9d820f43be8`.
- **Doc-vs-code discrepancy logged in DECISIONS.md:** approval keeps `role='contributor'` + `contributor_kind` sub-type (per migration 033), not the literal "role to match contributor_kind" wording in MASTER_DIRECTION FEAT-01.
- **`/admin/reports` not renamed to `/admin/reported`** per the spec — deferred (logged in DECISIONS).
- **Batch 5 Architect Nice-to-haves:** `REPLICA IDENTITY FULL` on `event_updates` so the server-side DELETE filter works (currently filtered in JS, correctness preserved); toast on optimistic DELETE failure when toast infra lands.
- **Batch 3 Architect nice-to-haves** — deferred: `word_similarity` is not directly indexable (revisit beyond ~5k contributors); add trgm index on `bio` if bios grow long; truncate `bio` to ~160 chars in RPC return.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 682 pass / 0 fail
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
- MapLibre + MapTiler patterns: `.github/instructions/maplibre-maps.instructions.md`.
- Supabase dual-client + RLS + storage: `.github/instructions/supabase-patterns.instructions.md`.
- Project ID: `xyiajtrvhlxaeplsiajj`. Default map centre: Pretoria, South Africa `[-25.7479, 28.2293]`.
- Roles: `citizen` / `contributor` / `admin` with `contributor_kind` sub-type (`ministry` / `organization` / `business`) per migration 033.
