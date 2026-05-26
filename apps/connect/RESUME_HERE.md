# RESUME_HERE — Citizens Connect

> **Read this first. Single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch.

---

## 1. Project at a glance

- **Citizens Connect** — map-first Christian community discovery (events, places, Contributors).
- Stack: Next.js 15 App Router (RSC) + TypeScript + Supabase + MapLibre GL JS + MapTiler Cloud + Tailwind CSS v4 + Capacitor (iOS/Android).
- Design: white-black-gold (60/30/10), full-screen map-first, glass-overlay floating controls.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- **Locked direction: `.github/MASTER_DIRECTION.md`.**

---

## 2. What just shipped — Stage D: specialised services + keyword bank (commit `04c3118`)

**Completed Stage D of the contributor-dashboard plan**: services chip editor in the Places dashboard panel + tightened validation on both tables.

### Migration 106 (`106_services_keywords_rls_tighten.sql`)
- RLS enabled on `specialised_services` and `contributor_keywords` — both were previously **unprotected** (no RLS at all).
- Policies: `SELECT` public for both; `INSERT` gated by `contributor_id = auth.uid()`; `DELETE` by owner or admin.
- Unique constraints: `(place_id, service)` and `(contributor_id, keyword)`.
- Length constraints tightened from 100 → 40 chars.
- Allowlist check constraint `[A-Za-z0-9 ._-]` added to both.

### API hardening
- `services/route.ts`: `sanitiseService()` — NFC-normalize, strip control chars, dedupe spaces, trim, 40-char cap. Server-side allowlist regex 422 response. `contributor_id` now passed on insert (required by new RLS policy).
- `keywords/route.ts`: `sanitiseKeyword()` — same pattern + `.toLowerCase()`. Allowlist regex 422 response. Cap 50 → 40.

### UI
- `PlacesDashboardClient.tsx`: inline chip editor in the right panel (replaces dead "Manage services →" link). Fetches services when place is selected, shows predefined suggestions from `PREDEFINED_SERVICES`, allows add/remove, enforces max 10, client-side allowlist filter mirrors server.
- `SettingsDashboardClient.tsx`: client-side input filter updated to allow `.` and `_` (matching server allowlist); `maxLength` 50 → 40.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (82 files)
- `npx next lint --dir src` → clean
- Advisors: **86 WARN unchanged**

---

## 2a. Previous batch — Stage E.2+E.3: broadcast public banners + edge function (commit `c189620`)

- New `OrgBroadcastList` component renders "From the Organiser" banners on `/e/[id]`, `/events/[id]` (EventDetailContent), and `/places/[id]`.
- `notify-broadcast` edge function v2 deployed with correct `_shared/` bundling (per-function `deno.json` remaps `../\_shared/` → `./_shared/`).
- `_shared/push.ts` gains `broadcast_sent` type + `skipInApp` flag.
- Broadcasts API: `broadcast_sent` type for in-app; fire-and-forget call to `notify-broadcast` for FCM push.
- Migration 105: widens `notifications_type_check` to include `broadcast_sent`.

---

## 2b. Previous batch — Stage E.1: contributor dashboard broadcasts page + composer (commit `1098b27`)

Wires up the previously-broken `Broadcast to attendees` link from `EventsDashboardClient.tsx` and the `Broadcast` nav item from `DashboardHomeClient.tsx` into a real page at `/c/[slug]/dashboard/broadcasts`. New `BroadcastsDashboardClient` component with directory + entity compose modes. 744 tests, tsc 0, lint clean.

---

## 3. Current platform state

- 82 test files, **744 tests**, all passing.
- 106 migrations applied. Live DB in sync with files.
- Latest commit on `origin/main`: **`04c3118`**.

---

## 4. Next batches queued

From `docs/plans/contributor-dashboard.md`:

- **Stage G — Team management UX**: "+ Add team member" popup (3 search bars: name/user_id/email), invite flow → `team_memberships` row + in-app notification, accept/decline, owner transfer, public team list on contributor profile.
- **Stage H — Analytics depth + export**: daily aggregation via pg_cron → `contributor_analytics`, time-window selector (7/14/30/60/90d, 6mo, 1yr), CSV export endpoint, 1-year retention.
- **Stage I — Planning cards**: card open/close UI for tasks + ideas, completion checkbox, idea delete, public toggle.
- **Stage J — Suggestion button polish**: glass-panel composer with server-side validation, admin suggestion inbox, XLSX export, 10/day rate limit.
- **Stage K — Handle change rule**: warning copy on slug edit, 1-change-per-month enforcement, admin override endpoint.
- **Stage L — Search term analytics**: capture sanitised queries in rolling table, top-10 display, feed keywords into autocomplete (A66).

---

## 5. Open questions

None blocking.

---

## 6. How to verify locally

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
npx vitest run
npx next lint --dir src
npm run dev
# Dashboard → Places: select a place → right panel shows inline services chip editor
# Dashboard → Settings: keyword editor has max 40 chars, allows . and _
# /e/[id] or /places/[id]: "From the Organiser" banner visible if broadcasts exist
```

---

## 7. Memory pointers

- `/memories/repo/coding-patterns.md` — Connect patterns.
- `/memories/repo/outstanding-items.md` — running backlog.

---

## 8. Architecture quick-orient

- **Layout-level auth gating** for the dashboard lives at `src/app/c/[slug]/dashboard/layout.tsx`. It computes `isOwner` / `isAdmin` / `adminSessionActive` and decides which surfaces to render. The new banner is mounted there for owners; `markViewingStarted` is called there for admins.
- **All notification deep-links** must use `data.url` (not `link_url`/`metadata` — those columns do not exist). See decision log entry "Notification deep-links — `data.url` only".
- **Admin attribution helper** lives in `src/lib/dashboard/adminAttribution.ts`. Any mutating contributor route should call `getActiveAdminGrant` and, if non-null, `logAdminOnBehalfAction` after the mutation succeeds.
- **A48** is encoded in `viewerIsOwner` server prop + server-side route gating. Do not allow contributors to revoke grants client-side; the route rejects it server-side anyway.
