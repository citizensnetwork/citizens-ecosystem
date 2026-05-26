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

## 2. What just shipped — Batch Stage A (commit `5ebee50`)

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

- 81 test files, **741 tests**, all passing.
- 104 migrations applied. Live DB in sync with file.
- Latest commit on `origin/main`: `5ebee50`.

---

## 4. Next batches queued

From `docs/plans/contributor-dashboard.md`:

- **Stage A item 4 (broader wiring)** — `logAdminOnBehalfAction` is currently only wired into the access-requests revoke path. Wire it into ALL other mutating contributor routes (events, places, broadcasts, keywords, drafts, team_memberships, suggestions) when `getActiveAdminGrant` returns a row. The helper signature now takes `contributorSlug` so callers must pass both id + slug.
- **Stage B+** — see plan doc for next items in the contributor-dashboard plan.

### Nice-to-haves logged (not applied this batch)
1. Strengthen `AccessRequest.status` in `SettingsDashboardClient.tsx` to the `AccessRequestStatus` union.
2. Banner won't auto-clear when a grant expires by time alone (no postgres_changes event). Optional `setInterval(refetch, 60_000)` or compute `expires_at > now()` on render.
3. Defence-in-depth: add `.eq("admin_id", user.id)` server-side in `settings/page.tsx` when viewer is admin.
4. Mark `logAdminOnBehalfAction` + `getActiveAdminGrant` as Stage A item 7 in the plan doc so they don't bit-rot.
5. DB-level test for `notifications_type_check` accepting `admin_on_behalf_action`.

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
- `/memories/repo/batch-stage-a-attribution-shipped.md` — this batch's summary.

---

## 8. Architecture quick-orient

- **Layout-level auth gating** for the dashboard lives at `src/app/c/[slug]/dashboard/layout.tsx`. It computes `isOwner` / `isAdmin` / `adminSessionActive` and decides which surfaces to render. The new banner is mounted there for owners; `markViewingStarted` is called there for admins.
- **All notification deep-links** must use `data.url` (not `link_url`/`metadata` — those columns do not exist). See decision log entry "Notification deep-links — `data.url` only".
- **Admin attribution helper** lives in `src/lib/dashboard/adminAttribution.ts`. Any mutating contributor route should call `getActiveAdminGrant` and, if non-null, `logAdminOnBehalfAction` after the mutation succeeds.
- **A48** is encoded in `viewerIsOwner` server prop + server-side route gating. Do not allow contributors to revoke grants client-side; the route rejects it server-side anyway.
