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

## 2. What just shipped — Stage F: Volunteers UX (commit `e3c401d`)

**Completed Stage F of the contributor-dashboard plan**: citizen volunteer apply/withdraw flow + contributor approve/decline with reason.

### New component: `VolunteerApplyButton`
- Citizen CTA rendered on event/place detail pages when `volunteer_openings=true` and `organiserHandle` is available.
- States: none (CTA) → form (optional message, 500-char, char counter + aria-live) → submitting → status badge.
- Status badges: pending=amber, approved=green, declined=gray ("Not selected"), withdrawn=silent.
- Withdraw: POST `action=withdraw` → `status=withdrawn`; gated by `applicant_id=user.id` + status in `[pending, approved]`.
- Login gate: Link to /login when `userId=null`. Owner guard: returns null when `isOwner=true`.

### API changes (`volunteers/route.ts`)
- `withdrawn` added to `ALLOWED_STATUSES`.
- New `withdraw` action: UUID validation + ownership check (`applicant_id = user.id`) + status gate + DB update.
- `update_status`: reads + sanitizes `response_message` from body; includes it in `.update()` when present.

### EventDetailServer + EventDetailContent
- `EventDetailServer` fetches user's volunteer application (`maybeSingle`) when `volunteer_openings && user`.
- Passes `volunteerStatus`, `volunteerApplicationId`, and `organiserHandle` (contributor_slug) to `EventDetailContent`.
- `EventDetailContent` renders `VolunteerApplyButton` after LocationSharingToggle when `volunteer_openings && organiserHandle`.

### PlaceDetailServer
- Added `volunteerAppRes` to the parallel `Promise.all` queries (conditional on `user && volunteer_openings`).
- Replaced static "Volunteer" gold pill with interactive `VolunteerApplyButton`.
- `volunteerStatus` and `volunteerApplicationId` extracted from result.

### TeamDashboardClient
- `Volunteer` interface gains `response_message: string | null`.
- Controlled volunteer list (`volunteerList` state) replaces prop-direct rendering.
- Inline respond form: appears on pending rows; confirm action (approve/decline) + optional message textarea (2 rows, 500-char, `maxLength`).
- Optimistic update: `setVolunteers(prev => prev.map(...))` on success; error displayed via `role="alert"`.
- `response_message` shown on declined rows.
- `STATUS_CLASSES` map for consistent status badge styling.

### team/page.tsx
- Volunteer query changed `.in("status", ["pending", "approved", "declined"])` — includes declined for private contributor view.
- `VolunteerRow` type gains `response_message: string | null`.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (82 files)
- `npx next lint --dir src` → clean
- Architect review: security clean — UUID validation on all IDs, `applicant_id` double-gated in both SELECT and UPDATE for withdraw, `sanitize()` on all user text input.
- Advisors: **86 WARN unchanged**

---

## 2a. Previous batch — Stage D: specialised services + keyword bank (commit `04c3118`)

Migration 106: RLS on `specialised_services` + `contributor_keywords`, length 100→40, allowlist `[A-Za-z0-9 ._-]`, unique constraints. Services API: `sanitiseService()`, NFC-normalize. Keywords API: `sanitiseKeyword()`. `PlacesDashboardClient`: inline chip editor. `SettingsDashboardClient`: corrected filter. 744 tests, tsc 0, lint clean.

---

## 2b. Previous batch — Stage E.2+E.3: broadcast public banners + edge function (commit `c189620`)

`OrgBroadcastList` renders "From the Organiser" banners on event/place detail pages. `notify-broadcast` edge function v2 with correct `_shared/` bundling. `_shared/push.ts`: `broadcast_sent` type + `skipInApp` flag. Migration 105: widens `notifications_type_check`. 744 tests, tsc 0, lint clean.

---

## 3. Current platform state

- 82 test files, **744 tests**, all passing.
- 106 migrations applied. Live DB in sync with files.
- Latest commit on `origin/main`: **`e3c401d`**.

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
# Dashboard → Team → Volunteers tab: pending applications show Approve/Decline buttons
# Decline click reveals inline textarea for reason; Confirm sends POST update_status
# /e/[id] or /places/[id] when volunteer_openings=true: VolunteerApplyButton CTA appears
# Citizen can apply with optional message, see status badge, or withdraw pending/approved apps
# /places/[id]: static "Volunteer" pill replaced with interactive VolunteerApplyButton
```

---

## 7. Memory pointers

- `/memories/repo/coding-patterns.md` — Connect patterns.
- `/memories/repo/outstanding-items.md` — running backlog.

---

## 8. Architecture quick-orient

- **Layout-level auth gating** for the dashboard lives at `src/app/c/[slug]/dashboard/layout.tsx`. It computes `isOwner` / `isAdmin` / `adminSessionActive` and decides which surfaces to render.
- **All notification deep-links** must use `data.url` (not `link_url`/`metadata` — those columns do not exist). See decision log entry "Notification deep-links — `data.url` only".
- **Admin attribution helper** lives in `src/lib/dashboard/adminAttribution.ts`. Any mutating contributor route should call `getActiveAdminGrant` and, if non-null, `logAdminOnBehalfAction` after the mutation succeeds.
- **A48** is encoded in `viewerIsOwner` server prop + server-side route gating.
- **`VolunteerApplyButton`** is a client component at `src/components/volunteer/VolunteerApplyButton.tsx`. It takes `entityType/entityId/contributorHandle/userId/initialStatus/initialApplicationId/isOwner` and handles the full apply/withdraw lifecycle client-side.
- **`withdraw` in volunteers API** is gated by `applicant_id = user.id` in BOTH the SELECT ownership check and the UPDATE WHERE clause — no dashboard access needed (citizen self-action).
