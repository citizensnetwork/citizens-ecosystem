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

## 2. What just shipped — Stage E.1: contributor dashboard broadcasts page + composer (commit `1098b27`)

**Wires up the previously-broken `Broadcast to attendees` link** from `EventsDashboardClient.tsx` (line 251) and the `Broadcast` nav item from `DashboardHomeClient.tsx` into a real page at `/c/[slug]/dashboard/broadcasts`.

### New files
- `src/app/c/[slug]/dashboard/broadcasts/page.tsx` — server page (`dynamic = "force-dynamic"`). Resolves contributor via `resolveContributorSlug`, loads contributor-owned events (id/title/date) and places (id/name) in parallel (limit 100 each), and computes per-entity broadcast counts via a single grouped query on `broadcast_messages` (`deleted_at IS NULL`, `contributor_id = contributor.id`) bucketed in memory. Supports `?entity_type=event|place&entity_id=<uuid>` deep-link: validates ownership by intersecting with owned lists, silently degrades to directory view on invalid/non-owned. When valid, fetches up to 50 most-recent broadcasts for that entity.
- `src/components/contributor/dashboard/BroadcastsDashboardClient.tsx` — `"use client"`. Two render modes:
  - **Directory**: lists owned events + places with broadcast counts; each item links to entity mode (preserves other searchParams via `URLSearchParams`).
  - **Entity**: 500-char composer (textarea with native `maxLength`, `.slice` belt-and-braces, `aria-describedby` + `aria-live="polite"` char counter, amber warning <50 left); Send POSTs to existing `/api/contributor/[handle]/broadcasts` with optimistic prepend; history list with soft-delete via DELETE `?id=<id>` and `pendingDelete` guard against double-tap; error banner with `role="alert"`.

### Architect verdict
SHIP — grades A/A/A−/A−/B+/A−. Should-fix items applied inline: char-counter a11y (`aria-describedby` + `aria-live`), native `maxLength={BROADCAST_MAX}`, collapsed duplicate `slug`/`handle` prop. Nice-to-haves deferred: `Ctrl/Cmd+Enter` to send; disable all delete buttons during pending; remove redundant `if (!user)` (layout already enforces); `.in("entity_id", ownedIds)` on counts query; client-component tests for branching + optimistic paths; `console.warn` on `(untitled)`/`(unnamed)` fallback to detect schema drift.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (82 files; no new tests — thin orchestrator over already-tested API)
- `npx next lint --dir src` → clean
- Supabase advisors: **86 WARN baseline unchanged** (no DB changes)

---

## 2a. Previous batch — Stage B: contributor theme tint, env+query-param override (commit `f6559ea`)

**Finished Stage B of the contributor-dashboard plan.** Most of Stage B (tonal-variant tokens + `data-contributor-ui` wiring on contributor-owned surfaces) shipped in batch 16b; this commit adds the remaining dev-only override.

### New files
- `src/lib/dashboard/theme.ts` — `isContributorThemeEnabled()` honours both `NEXT_PUBLIC_CONTRIBUTOR_THEME=off` and legacy `NEXT_PUBLIC_CONTRIBUTOR_THEME_ENABLED=false`. Default-on.
- `src/components/contributor/ContributorThemeOverride.tsx` (`"use client"`) — reads `?contributorTheme=on|off` via `useSearchParams()`, persists to `sessionStorage["cc:contributorTheme"]`, swaps `data-contributor-ui` ↔ `data-contributor-ui-target` on matching DOM elements. SSR-safe, whitelist-gated (only `"on"`/`"off"` reach DOM/storage), idempotent under Strict Mode.

### Modified files
- `src/app/c/[slug]/dashboard/layout.tsx` — inline env check replaced with `isContributorThemeEnabled()`; mounts `<ContributorThemeOverride />`.
- `src/components/contributor/ContributorPublicProfile.tsx` — same.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (no new tests; purely additive override + helper)
- `npx next lint --dir src` → clean
- Supabase advisors: **86 WARN baseline unchanged** (no DB changes)
- Architect verdict: **SHIP** — grade A across architecture, security, performance, a11y, code quality. No Should-fix.

### Nice-to-haves deferred
- Wrap `<ContributorThemeOverride />` in `<Suspense fallback={null}>` at both mount sites.
- Rename `data-contributor-ui` → `data-theme="contributor"` to match plan doc Stage B item 2.
- Drop legacy `NEXT_PUBLIC_CONTRIBUTOR_THEME_ENABLED` env flag once migrated.

---

## 2b. Previous batch — Stage A item 7: unified contributor mutation attribution (commit `0f2cedf`)

**Centralised every contributor-side mutation's audit trail through a single helper, then wired it into 8 routes (~18 mutation points).**

### New file
- `src/lib/dashboard/activity.ts` — `recordContributorMutation(supabase, opts)`. Branches on `access.isAdminWithAccess`:
  - Owner → inserts `activity_log` with `actor_role='contributor'`.
  - Admin → delegates to `logAdminOnBehalfAction` (dual write: `activity_log` actor_role='admin' + `metadata.on_behalf_of` AND `notifications` row of type `admin_on_behalf_action` with `data.url=/c/{slug}/dashboard/settings`).
  - Best-effort: errors logged, never thrown.

### Routes wired
| Route | Actions |
|---|---|
| `broadcasts` | POST `broadcast_sent` (entity_type=event\|place), DELETE `broadcast_deleted` |
| `team` | POST invite `team_member_added`, PATCH remove `team_member_removed`, PATCH role-change `team_member_role_changed` |
| `volunteers` | POST update_status → `volunteer_${pending\|approved\|declined}` |
| `drafts` | `draft_created` / `_updated` / `_deleted` |
| `keywords` | `keyword_added` / `_deleted` |
| `places/[placeId]/services` | `service_added` / `_deleted` (metadata={place_id}) |
| `planning/tasks` | `task_created` / `task_updated` (or `task_completed` when status=completed) / `task_deleted` |
| `planning/ideas` | `idea_created` / `_updated` / `_deleted` |

### Nice-to-haves bundled
- `SettingsDashboardClient` exports `AccessRequestStatus = "pending"|"approved"|"denied"|"expired"|"revoked"`; `AccessRequest.status` is now a typed enum.
- `ActiveGrantBanner` adds `setInterval(refetch, 60_000)` as a TTL-expiry safety net (postgres_changes does not fire on timestamp expiry).
- `/c/[slug]/dashboard/settings/page.tsx` adds defence-in-depth `.eq("admin_id", user.id)` when viewer is admin (RLS already enforces; pushed predicate guards against future policy regression).
- `docs/plans/contributor-dashboard.md` — Stage A item 7 documented.

### Architect Should-fix applied
- `logAdminOnBehalfAction` metadata spread order flipped: caller metadata FIRST, system `on_behalf_of: contributorId` LAST. Locks the audit-trail invariant so callers cannot forge the on-behalf-of target. Zero behaviour change for current callers (none pass `on_behalf_of`).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (741 prior + 3 new in `activity.test.ts` covering owner / admin-with-grant / error branches)
- `npx next lint --dir src` → clean
- Supabase advisors: **86 WARN baseline unchanged** (no DB changes this batch)
- Architect verdict: **SHIP** after Should-fix applied

### Deferred to backlog (Architect Nice-to-haves)
1. Reconcile volunteer status naming (`pending|approved|declined` vs prior `approved|denied|withdrawn`).
2. Pick one verb across entities (`_added` vs `_created`).
3. Broadcast `entity_type` asymmetry: POST uses `event|place`, DELETE uses `broadcast`.
4. Some DELETE/PATCH handlers don't verify a row was actually affected before logging.
5. Helper could later return `{ok, error}` for observability.
6. Audit await is inline; can become fire-and-forget if p95 matters.

---

## 2c. Previous batch — SidePanel back/dismiss split (commit `e76f449` + Should-fix in `0f2cedf`)

UX: split close into back-chevron (top-left, `router.back()` w/ fallback) + X (top-right, `router.push(fallbackHref)` — collapses entire panel stack). ESC + backdrop kept as back-one-step. Architect Should-fix (`setTimeout` bare global, `aria-labelledby` on dialog role, `aria-hidden` on both decorative SVGs) bundled into `0f2cedf`. tsc 0, vitest 744/744, lint clean. Architect verdict: SHIP.

---

## 2d. Previous batch — admin attribution (commit `5ebee50`)

**Stage A items 1–6 of contributor-dashboard plan** — admin attribution + Realtime grant banner + A48 read-only enforcement.

### Migration 104 (applied via MCP)
`supabase/migrations/104_dashboard_admin_attribution.sql`:
- `contributor_access_requests.viewing_started_at timestamptz` (nullable; stamped once via RPC)
- `activity_log.actor_role text CHECK IN ('contributor','admin','system')` + partial index `idx_activity_log_admin_actions` WHERE actor_role='admin'
- Widened `notifications_type_check` to include `admin_on_behalf_action`
- New SECURITY DEFINER RPC `mark_admin_viewing_started(p_request_id uuid)`:
  - `SET search_path = public, pg_temp`
  - Idempotent COALESCE update
  - Gated by `admin_id = auth.uid()` + status='approved' + not-revoked + not-expired
  - EXECUTE revoked from public/anon; granted to authenticated

### New files
- `src/lib/dashboard/adminAttribution.ts` — three helpers:
  - `getActiveAdminGrant(supabase, adminId, contributorId)` → `{id, expires_at, viewing_started_at} | null`
  - `markViewingStarted(supabase, requestId)` → calls the new RPC
  - `logAdminOnBehalfAction(supabase, {contributorId, contributorSlug, adminId, action, entityType, entityId, metadata?})` — writes BOTH activity_log row (actor_role='admin' + metadata.on_behalf_of) AND notifications row (type='admin_on_behalf_action' + data.url deep link). Best-effort; errors logged not thrown.
- `src/components/contributor/dashboard/ActiveGrantBanner.tsx` — Realtime client component. Subscribes to `contributor_access_requests` filtered by `contributor_id=eq.{id}`, refetches active grants on any change. Owner-only banner showing "X admin is viewing your dashboard" with absolute `Manage` link to settings (uses `contributorSlug` prop).
- `src/__tests__/api/contributor-access-requests.test.ts` — 12 new tests (auth gates, deny-reason validation, approve RPC dispatch, admin-revoke writes actor_role + admin_on_behalf_action notification with data.url).

### Modified files
- `src/app/c/[slug]/dashboard/layout.tsx` — mounts `ActiveGrantBanner` for owner with pre-fetched active grants; calls `markViewingStarted` once when admin enters dashboard.
- `src/app/c/[slug]/dashboard/settings/page.tsx` — corrected SELECT (`denial_reason / viewing_started_at / updated_at`); passes `viewerIsOwner` prop. **The columns `approved_at` and `denied_reason` NEVER EXISTED — earlier code referencing them was a bug.**
- `src/components/contributor/dashboard/SettingsDashboardClient.tsx` — `viewerIsOwner` prop, `formatTimeAgo` helper, green pulsing "viewing since Xm ago" indicator, Revoke hidden from owner (renamed "End my session" for granting admin), pending block gated to owner only (A48). `AccessRequest` interface aligned to DB.
- `src/components/notifications/NotificationPanel.tsx` — TYPE_ICONS adds `admin_elevation_request: "⚡"`, `admin_on_behalf_action: "⚙"`, `contributor_type_change_request: "⇄"`.
- `src/app/api/contributor/[handle]/access-requests/route.ts` — all notifications include `data.url` deep links; admin self-revoke writes `actor_role='admin'` + `metadata.on_behalf_of` AND inserts contributor notification. `.maybeSingle()` on admin_id reads.
- `src/app/api/admin/users/route.ts` — **bug fix:** notification insert was writing to nonexistent `link_url` + `metadata` columns. Switched to `data: { url, request_id }` so getNotificationLink resolves correctly.
- `src/types/db.ts` — `AccessRequestStatus` = `'pending'|'approved'|'denied'`; `ContributorAccessRequest` fields corrected (removed `reason`/`denied_reason`/`approved_at`; added `denial_reason`/`revoked_by`/`viewing_started_at`/`updated_at`); `ActivityLog` gains `actor_role`.

### A48 rule (now enforced both UI + server)
Contributors are **read-only** on the access list. Only the granting admin self-revokes. Server-side: PATCH `action: 'revoke'` only valid for `isAdmin && action==='revoke'` and `.eq("admin_id", user.id)`. Client-side: Revoke button + pending block gated by `viewerIsOwner=false` for admin only.

### Architect Should-fix applied inline
1. RPC search_path hardened to `(public, pg_temp)` — migration file + live DB updated via `execute_sql`.
2. `ActiveGrantBanner` Manage href now absolute via `contributorSlug` prop (was relative — would have produced `/dashboard/settings/settings`).
3. `logAdminOnBehalfAction` url uses slug not UUID (would have 404'd because route resolves slugs).
4. `.single()` → `.maybeSingle()` on admin_id reads in approve/deny branches.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **741/741 passing (81 files)**
- `npx next lint --dir src` → clean
- Supabase advisors: **86 WARN, no NEW vs baseline.** New RPC NOT in `function_search_path_mutable` list. SECURITY DEFINER advisor for `mark_admin_viewing_started` matches existing pattern (37 other identical findings); intentional — function gates by `admin_id = auth.uid()`.

---

## 3. Current platform state

- 82 test files, **744 tests**, all passing.
- 104 migrations applied. Live DB in sync with file.
- Latest commit on `origin/main`: `1098b27`.

---

## 4. Next batches queued

From `docs/plans/contributor-dashboard.md`:

- **Stage E.2 — Public broadcast banner on event/place detail pages.** Render most-recent non-deleted broadcast(s) from `broadcast_messages` above comments on `/e/[id]` and `/places/[id]`. Existing public API GET `/api/contributor/[handle]/broadcasts?entity_type=...&entity_id=...` returns non-deleted; event/place pages already have the contributor handle via `created_by → profiles.handle`. **Decision needed**: add a public-by-entity endpoint (`/api/events/[id]/broadcasts`) OR derive handle on the event/place page and reuse the existing route.
- **Stage E.3 — Push edge function `notify-broadcast`.** Mirror `notify-event-update` (uses `_shared/push.ts` + `_shared/prefs.ts`); recipient set = `rsvps.status=attending` (event) or `follows.follower_id` (place); add DB webhook on `broadcast_messages` INSERT; document in `docs/RUNBOOK.md`.
- **Stage D and beyond** — see plan doc for next items.

### Architect Nice-to-haves to address opportunistically
1. Reconcile volunteer status naming (code: `pending|approved|declined`; prior spec said `approved|denied|withdrawn`).
2. Verb consistency across entities (`_added` vs `_created`).
3. Broadcast `entity_type` asymmetry (POST `event|place` vs DELETE `broadcast`).
4. Row-affected verification before logging on DELETE/PATCH paths.
5. `recordContributorMutation` could return `{ok, error}` for observability.
6. Fire-and-forget audit option if p95 matters.

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
# Open http://localhost:3000/c/<contributor-slug>/dashboard/settings as owner → expect:
#   - No Revoke button (owner is read-only)
#   - Banner at top showing active grants if any admin holds one
#   - Pending requests block hidden
# Open same URL as the granting admin → expect:
#   - "End my session" button on their own row
#   - "viewing since Xm ago" green pulsing pill once they've entered the dashboard
```

---

## 7. Memory pointers

- `/memories/repo/coding-patterns.md` — Connect patterns.
- `/memories/repo/outstanding-items.md` — running backlog.
- `/memories/repo/batch-stage-e1-broadcasts-page-shipped.md` — this batch's summary.
- `/memories/repo/batch-stage-a-attribution-shipped.md` — Stage A.

---

## 8. Architecture quick-orient

- **Layout-level auth gating** for the dashboard lives at `src/app/c/[slug]/dashboard/layout.tsx`. It computes `isOwner` / `isAdmin` / `adminSessionActive` and decides which surfaces to render. The new banner is mounted there for owners; `markViewingStarted` is called there for admins.
- **All notification deep-links** must use `data.url` (not `link_url`/`metadata` — those columns do not exist). See decision log entry "Notification deep-links — `data.url` only".
- **Admin attribution helper** lives in `src/lib/dashboard/adminAttribution.ts`. Any mutating contributor route should call `getActiveAdminGrant` and, if non-null, `logAdminOnBehalfAction` after the mutation succeeds.
- **A48** is encoded in `viewerIsOwner` server prop + server-side route gating. Do not allow contributors to revoke grants client-side; the route rejects it server-side anyway.
