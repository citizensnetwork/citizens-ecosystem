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

## 2. What just shipped

### Batch 16 — Contributor Dashboard Foundation — `f2d7889`

12 new tables, full dashboard UI, global suggestion button.

**Schema (migrations 100 + 100b):**
- New tables: `contributor_access_requests`, `activity_log` (append-only, no DELETE policy), `broadcast_messages` (soft-delete only), `contributor_drafts`, `team_memberships`, `volunteer_applications`, `contributor_keywords`, `specialised_services`, `planning_tasks`, `planning_ideas`, `contributor_analytics`, `suggestions`.
- Profile additions: `cover_photo_urls jsonb` (max 5), `handle_changed_at timestamptz` (one-per-month rule).
- SECURITY DEFINER fns: `check_max_dashboard_sessions` (max 2 concurrent admin sessions), `approve_dashboard_access` (3-day expiry + audit log), `deny_dashboard_access` (reason 3–500 chars + audit), `purge_old_activity_logs` (90-day), `purge_old_analytics` (1-year), `increment_contributor_metric`.
- 100b hardening: `suggestions_insert` tightened to `user_id IS NULL OR user_id = auth.uid()`; `REVOKE EXECUTE` on purge/internal fns from `anon, authenticated, public`.
- Postgres note: function-expression UNIQUE (e.g. `lower(keyword)`) must be a separate `CREATE UNIQUE INDEX` — fixed during apply.

**UI (`/c/[slug]/dashboard/*`):**
- Overview, planning (tasks + ideas with status cycling + rollback), team (active/removed with rollback), settings (access requests with inline deny form + revoke), broadcasts, volunteers, analytics (with `generateMetadata`), drafts, history, search, profile.
- ARIA tablists, dialog/modal labels, Escape handler, `useFocusTrap`, named handlers, `role="alert"` on errors.
- Global floating `SuggestionButton` via `dynamic({ ssr: false })` in `layout.tsx`; inline footer entry in BurgerMenu.

**Security:**
- `page_url` validated `^https?://` (blocks `javascript:`/`data:` XSS).
- `useOptimistic` misuse removed → `setX(prev)` rollback on `!res.ok`.

**Quality gate:** tsc 0 · vitest **714 / 714** · lint clean · Architect 12 Should-fix + Nice-to-haves (1,2,4,7,9) applied · advisors 85 WARN (+1 same-family SD-fn warning, `rls_policy_always_true` cleared).

### Batch 15a — Profile/login improvements — `f908e01`

Four improvements to profile and login flows:

1. **Avatar upload fix (server-side API)** — `POST /api/avatar` route handles all avatar uploads. Uses `createAdminClient()` for the storage write to avoid stale-JWT RLS failures on the browser client. Validates file type (`validateImageFile`) + 15 MB cap, rate-limited. `ProfileEditor` now POSTs FormData to `/api/avatar` instead of uploading directly.

2. **Contributor type-change application** — Direct kind-switch removed from `ProfileEditor`. New `ContributorTypeChangeRequest` form lets approved contributors submit a type-change request (ministry/organization/business). API route `POST /api/contributor/type-change` gates on `role === 'contributor' AND contributor_status === 'approved'`, upserts to `contributor_type_change_requests` table, notifies all admins. Migration 099 creates the table, RLS, and widens `notifications_type_check` to include `'contributor_type_change_request'`.

3. **Remove phone 2FA** — `LoginForm` phone/2FA tab removed. Email-only login.

4. **Open Dashboard button** — Profile header shows "Open Dashboard" link → `/profile/contributor/dashboard` for contributors (shown when `role === 'contributor'`). `ContributorTypeChangeRequest` section similarly gated on `role === 'contributor'` (not `isVendor` which includes admins).

**Architect fixes applied:** a11y `htmlFor`/`id` on form controls, `role="alert"` on feedback paragraphs, `isVendor → role === "contributor"` for type-change section.

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · Architect all Should-fix applied · advisors 0 new warnings

### Event form fix + enhanced fields — 2026-05-28 — `7229353`

**Root bug fixed — "Page not Found" when opening Create Event from burger bar:**
- `@panel/(.)events/new/page.tsx` created as a static interceptor segment. Next.js resolves static paths before `[id]`, so "new" no longer matches the dynamic `EventDetailServer` path. The new page renders `EventFormWithIndemnity` in the side-panel drawer with full auth + role + quota checks.

**Event form enhanced — 10+ new fields across create + edit:**
- Migration 098: `instagram_url`, `facebook_url`, `tiktok_url`, `youtube_url`, `volunteer_openings boolean NOT NULL DEFAULT false`, `is_recurring boolean NOT NULL DEFAULT false`, `recurring_pattern jsonb`
- `Event` type in `db.ts` updated with all 7 new optional fields
- `EventForm` + `EditEventForm`: Social Media section (branded SVG icons per platform), Volunteer Openings toggle (`role="switch"`), Recurring Event toggle + pattern picker (frequency, days-of-week pills, end-date, count)
- `sanitizeSocialUrl()` added to `src/lib/validation.ts` — protocol denylist (`javascript:`, `data:`, `vbscript:`, `blob:`) prevents stored XSS before any DB write
- `aria-label` added to all `role="switch"` elements; NaN guard on `parseInt(recurringCount)`

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · Architect MUST-FIX (XSS) + SHOULD-FIX (a11y, NaN) all applied

### Bug Batch 2 — Broadcast isolation + event-images RLS — 2026-05-27 — `1462d2b`

Two production bugs fixed:

**Broadcast isolation (event edits showed as broadcasts):**
- Migration 096 adds `is_system boolean NOT NULL DEFAULT false` to `event_updates`
- Updated `notify_event_field_changes()` trigger (from migration 050) to set `is_system = TRUE` on auto-generated field-change rows
- API GET `/api/events/[id]/updates` filters `.eq("is_system", false)` + includes `is_system` in select projection
- `EventUpdate` type updated with `is_system: boolean`
- `EventUpdatesList`: realtime INSERT handler guards `if (row.is_system) return;`; added `isOwner` prop + inline Broadcast composer (textarea + Broadcast button) for event owners/admins; BROADCAST_MAX at module scope; ARIA roles added
- `EventDetailContent` passes `isOwner={!!(user && (user.id === event.created_by || isAdmin))}` to `EventUpdatesList`

**Event-images storage RLS (cover + gallery upload failed with RLS violation):**
- Migration 096 re-creates the three missing `storage.objects` policies for the `event-images` bucket: INSERT/UPDATE/DELETE scoped to `(storage.foldername(name))[1] = auth.uid()::text`

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · Architect review applied (all 6 items)

### Capabilities sweep — Dynamic-surfaces compliance — 2026-05-24 — `563a67d`

Two new lib files created as single source of truth for all role/status/state checks:
- **`src/lib/profiles/capabilities.ts`** — `isAdmin`, `isContributor`, `isCitizen`, `canCreateEvents`, `isApprovedContributor`, `isPendingContributor`, `isRejectedContributor`
- **`src/lib/events/capabilities.ts`** — `isCancelledEvent`, `isDraftEvent`, `isPublishedEvent`, `isPrivateEvent`, `isCommunityEvent`, `canEditEvent`

All 30+ inline string comparisons (`profile?.role === "admin"`, `event.status === "cancelled"`, etc.) replaced across 24 source files + 1 test file. Edge Runtime compatibility confirmed (capabilities only imports TS types, no Node APIs). One failing test fixed: `api/contributor/apply/route.ts` now selects `role` alongside `contributor_status` so `isApprovedContributor` has the field it needs; test mock updated.

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · Architect review applied (comments added clarifying MinProfile widening, isPending/isRejected state-machine intent, canCreateEvents role-only guard).

### Bug Batch 1 — 7 UI bugs + feature clarity system — `6b0f9f9`


All 7 user-reported bugs fixed:

1. **RSVP toggle (map popup "Connect" button)** — `handleQuickAction` "join" now reads `rsvpEventIdsRef.current` (ref mirror of state for stale-closure safety) and sends `DELETE` when already joined, `POST` when not. State set removes/adds correctly.

2. **Contributor profile opens full-width in SidePanel** — Removed `min-h-screen` from `ContributorPublicProfile` wrapper div. Component now renders correctly in both full-page (`/c/[slug]`) and SidePanel panel/drawer contexts.

3. **Social media links now have brand icons + colours** — `SocialLinksRow` replaced: globe icon (Website), camera (Instagram, pink/purple), "f" (Facebook, blue), music note (TikTok, black), play (YouTube, red). All pills now have brand-appropriate colour.

4. **MessageButton deferred** — Removed from contributor profiles pending design clarity. 15-question grill document at `docs/feature-clarity/messaging.md`.

5. **"Community organised" chip removed from contributor-owned events** — Guard added on all 3 render surfaces: EventsView preview overlay, EventDetailContent, EventMap popup. Check: `event.community_contributor && event.creator?.role !== "contributor"`.

6. **Reporting system fully documented** — System is live. Gaps (admin notification on new report, reporter notification on resolution, auto-hide threshold) documented in `docs/feature-clarity/reporting.md`.

7. **Contributor type label clickable** — `ContributorKindLink` replaces static `<p>`. Uses `CONTRIBUTOR_KIND_LABELS` short label ("Ministry" not "Contributor - Ministry"). Routes to `/events?q=Ministry`. EventsView now reads `searchParams.get("q")` on mount to pre-populate search.

**Security fix (Architect should-fix):** URL protocol validation (`normalisePublicUrl`) now applied to `website_url`, `facebook_url`, `youtube_url` in contributor profile PATCH API — prevents stored XSS via `javascript:` / `data:` URIs.

**Feature clarity MDs created** (`docs/feature-clarity/`):
- `messaging.md` — 15 design questions
- `friends.md` — 16 design questions
- `reporting.md` — existing system gap map + 10 questions
- `search-and-discovery.md` — 12 questions for burger-menu Contributors tab + search overhaul

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · Architect review → all should-fix applied · advisors unchanged (no DB change).



- **LocationPicker** now accepts an optional `address` prop. When the
  parent's address input changes, it debounces (400ms) and queries
  Nominatim `/search`, rendering up to 5 suggestions inside the map
  container. Clicking a suggestion moves the marker, flies to zoom 15,
  and notifies the parent (`onSelect` + `onAddress`). A `lastSetAddressRef`
  prevents the reverse/forward loop. AbortControllers clean up on
  unmount. Wired into `PlaceForm`, `EditPlaceForm`, `EventForm`,
  `EditEventForm`.
- **PlaceDetailServer** now fetches up to 10 upcoming + 10 past active
  events for the place owner (`created_by = place.created_by`) in
  parallel with existing reads. Renders two compact sections under the
  edit row. **"+ Create Event" CTA** appears next to "Edit Place" for
  owners.

Existing contributor dashboard at `/profile/contributor/dashboard`
already provides lifecycle grouping via
`<ManageEventsView isVendor groupByLifecycle />` — no rebuild this batch.

✅ tsc 0 · vitest **714 / 714** · lint clean · advisors unchanged (no DB change).

### Edit-flow bugfixes (stages 1–4) — `ab6cd47` / `8d35898` / `66a433a`

- Migration `095_reviews_event_id_repair.sql` applied — fixes
  "Could not find the 'event_id' column" schema-cache error.
- Event detail: admin gate plumbed (`isAdmin` server → client) so admins
  can edit any event.
- New intercepted route `@panel/(.)events/[id]/edit/page.tsx` so event
  edit opens in the same side panel (kills dual-window UX).
- `EditPlaceForm` upload errors now surface the underlying Supabase
  message instead of "Media Upload failed".
- `.gitignore` updated; accidentally tracked `vitest-out.txt` removed.

### Place panel + image upload RLS + cover-image remove — 2026-05-23 — `aba287a`

Three user-reported bugs fixed:

1. **Place detail opens in side panel** (was full-screen): Created `PlaceDetailServer.tsx` (shared RSC with `React.cache()` dedup mirroring `EventDetailServer` pattern). Created `src/app/@panel/(.)places/[id]/page.tsx` (intercepted route wrapping in `SidePanel`). Updated `places/[id]/page.tsx` as thin wrapper — page + panel share the same content component.

2. **Image upload no longer fails with RLS error**: Two migrations — `fix_place_images_rls_and_admin_update` (replaced restrictive folder-path INSERT policy; added `is_admin()` to places UPDATE/DELETE policies) and `tighten_place_images_insert_policy` (restored folder-level scoping with `is_admin()` bypass for uploads to any path). Upload path in `EditPlaceForm` is already `${user.id}/covers/...` so regular users are unblocked.

3. **Can now remove cover image**: Added `removeImage` state, X overlay button on preview, and `handleSubmit` respects `removeImage ? null : place.image_url`.

4. **Label rename**: "Photo" → "Organisation Icon".

5. **Architect Should-fix applied**: Raw error messages replaced with user-friendly strings; `role="alert"` on error div; `reviews!` non-null assertion fixed.

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · Architect A/B → all Should-fix applied · advisors no new warnings.

---

### Polish batch 2 — `/audit-polish 2` (deferred items) — 2026-05-23 — `86303b2`

Polish Queue rows 4–5 from `.audit/QUEUE.md` (places-browse-and-follow + notifications):

- **places-browse-and-follow row 4(d) — SQL aggregate** — new migration `094_get_user_places_with_stats.sql` introduces `public.get_user_places_with_stats()` (`language sql stable security invoker set search_path = public, pg_temp`, `where p.created_by = auth.uid()`, `left join lateral` for follow + review aggregates, `revoke … from public, anon`, `grant execute … to authenticated`). `src/app/api/manage/places/route.ts` replaces the previous fetch-places → parallel-fetch-follows/reviews → JS-filter/reduce pipeline with a single `supabase.rpc("get_user_places_with_stats")` call. `supabase/schema.sql` mirrored. **File-only — awaits normal Supabase cadence to apply to remote.** Row 4 fully closed (items a/b/c/e already shipped in polish batch 1).
- **notifications row 5(a) — re-deferred** — review-prompt flow dedup (`PendingReviews` inline block vs `review_prompt` notification overlap) is a UX consolidation decision requiring design input. Reviewed and promoted to **findings-ready** for a dedicated `/audit notifications` re-run; not a mechanical polish. Items b/c already shipped in polish batch 1.

Audit state: `.audit/QUEUE.md` rows 4–5 struck through; surface checkpoints `places-browse-and-follow.md` and `notifications.md` updated with polish run 2 notes.

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · Architect SE: A across the board (no Should-fix, 2 cosmetic Nice-to-haves logged). Advisors **83 → 83** (code-only — migration 094 is file-only until applied).

### Polish batch 1 — `/audit-polish 3` — 2026-05-23 — `10b4816`

Polish Queue rows 1–3 from `.audit/QUEUE.md` (onboarding + event-detail + profile-and-interests):

- **onboarding** — migration `093_drop_profiles_onboarding_completed.sql` (idempotent `do $$ … drop column if exists … end $$`). **File-only — awaits normal Supabase cadence to apply to remote.** All code reads removed (`schema.sql`, `src/types/db.ts`, `src/app/profile/page.tsx`, test fixtures) plus 6 dead `UPDATE` lines in `supabase/migrations/061_seed_testing_contributors.sql` (architect Should-fix — prevents replay failure when 061 reruns on a post-093 schema).
- **event-detail** — `MessageButton recipientName` now `organiser?.full_name || "Organiser"` (was hard-coded `"Organizer"`). `src/app/events/[id]/page.tsx` `generateMetadata` reuses `getEventById` from `EventDetailServer` (React `cache()`) → metadata + body share one Supabase round-trip per request.
- **profile-and-interests** — `/profile/[id]/[mode]` uses `isValidUUID` from `@/lib/validation` (regex dedup). `/profile/[id]` adds early `isValidUUID` guard in both `generateMetadata` and page body (calls `notFound()`) before any Postgres call.

Audit state: `.audit/QUEUE.md` rows 1–3 marked shipped (struck through); surface checkpoints `onboarding.md`, `event-detail.md`, `profile-and-interests.md` each append a `## Polish run 2026-05-23` section.

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · advisors **83 → 83** (code-only — migration is file-only). Architect SE: A across the board; 2 Should-fixes applied inline (061 dead-line cleanup + QUEUE state).

⚠ **Deferred Supabase apply:** migration 093 is on disk; apply via normal Supabase cadence (dashboard SQL editor or `supabase db push`). Idempotent — safe to run.

---

### Audit fix batch — P1 (notifications) + P2 (map-core) — 2026-05-23

- **map-core** — `ff4d9f5`. LocationPicker reverse-geocode AbortController (latest click wins; previous Nominatim fetch cancelled on click + on unmount); privacy disclosure line under the picker tells the user pinned coordinates are sent to nominatim.openstreetmap.org.
- **notifications** — `01ec87a`. NotificationBell optimistic revert on fetch error (mark-read / mark-all-read / delete now restore previous state on network / 429 / 500); realtime channel name scoped per user (`notifications:`+userId) so logout/login of a different user in the same tab cannot reuse a stale subscription.

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · advisors 83 → 83 (code-only). Patches archived under `.audit/patches/applied/`.

---

### Pre-launch prep + restructuring — 2026-05-23 — uncommitted (local only)

#### Migration 092 — Refresh seeded event dates

File: `supabase/migrations/092_refresh_seeded_event_dates.sql`

- All 6 seeded contributor orgs (CRC, EN Mooikloof, Lynnwood Market, Ellel, POPUP, U-Turn) had stale event dates (seeded via `now()` at migration 061 apply time — all in the past).
- Migration 092 re-dates them: the event with the smallest current date per org becomes a recent past event (`now() - 45 days`); remaining events spread 7 days apart starting `now() + 5 days`.
- **Must be applied manually:** Supabase dashboard → SQL editor → paste + run the file above.
- Verify: `SELECT title, date FROM events WHERE creator_id = '11111111-1111-4111-8111-000000000005' ORDER BY date;`

#### `.claude/` structure created (new files only — no existing files changed)

- `CLAUDE.md` — lean root brain replacing the context-bloating role of `copilot-instructions.md`
- `.claude/agents/`: `architect.md`, `security.md`, `map-specialist.md`, `database-specialist.md`, `mobile-specialist.md`
- `.claude/skills/`: `supabase-migration/SKILL.md`, `rls-patterns/SKILL.md`, `maplibre-patterns/SKILL.md`, `ui-system/SKILL.md`, `quality-gate/SKILL.md`, `api-route/SKILL.md`
- Subdirectory CLAUDE.md files: `supabase/CLAUDE.md`, `src/CLAUDE.md`, `src/components/map/CLAUDE.md`, `src/app/api/CLAUDE.md`
- Both systems (`.github/copilot-instructions.md` + `.claude/`) run in parallel during transition.

---

### Batch QP1 — Quick-search panel — `origin/main` @ `11372b9`

Tab-gated tiles + city chips (PTA/JHB/CT/etc. via `src/lib/cityLabel.ts`) + proximity sort on quick and category panels + carousel page reset on filter change. +11 tests.

✅ Quality gate: tsc 0 · vitest **714 / 714** · lint clean · advisors baseline unchanged.

---

### Earlier batches (summarised — full notes in git log)

| Batch | Commit | What |
| --- | --- | --- |
| 14f + 14g | `94dc675` | Audit P1+P2: places length CHECKs + 6-month delete trigger; messaging `.maybeSingle()` parity + rate-limit + NaN guard |
| 14e | `71c9085` | Audit P2: EventForm boundary validation + EditEventForm delete error surfacing |
| 14d | `7fba70d` | Audit P1: push fan-out restricted to `status='attending'`; `event_reminders` pref honoured |
| 14c | `e38fca5` | Audit P1: PostgREST filter injection on `/api/indemnity` closed; LoginForm `?redirect=` open-redirect fixed |
| 14b | `bc83f3c` | Audit P1: SVG XSS closed; ProfileEditor avatar RLS path fixed |
| 14a | `fa1ac6b` | CRITICAL: `safe_rsvp` IDOR closed (migration 086); `comments.body` length CHECK (087); RSVPButton error surfacing |
| 13 | `f3b7e48` | Map perf: basemap pruner + DOM marker culling + MapTiler Lite checklist |
| 11 | — | Admin contributor approval flow fixed (migration 084; edge function v3; NotificationPanel `data.url`) |
| 1–10 | — | FEAT-01–06, Batches 1–10: Admin panel, calendar, org profiles, Consider/Convince, broadcast updates, billing foundation, admin audit log |

---

## 3. Current platform state

- Test suite: **714 / 714** · TS: 0 errors · Lint: clean
- Supabase advisors: 0 ERROR / 83 WARN (baseline maintained — no new warnings)
- Latest commit: `ff4d9f5` (audit: apply map-core fixes)
- Uncommitted local changes: migration 092 file + `.claude/` structure (ready to commit)
- **Demo readiness (June 9 WCI):**
  - Map custom style: ❌ missing on Vercel (T4 — owner action, 10 min fix)
  - Seeded event dates: ❌ stale (migration 092 ready, needs applying)
  - POPUP profile images: ❌ none seeded (needs manual upload via contributor dashboard)
  - Core journeys: ✅ all working

---

## 4. Next queued (priority order)

### URGENT — before June 9 WCI presentation

- **[DEV] Apply migration 092** — Supabase SQL editor → paste `supabase/migrations/092_refresh_seeded_event_dates.sql` → run
- **[STEPHEN] Upload images** — log into deployed site as POPUP contributor → upload logo + cover image via contributor dashboard
- **[STEPHEN] Verify demo flow** — walk map → POPUP event → org profile → admin approval flow

✅ RSVP sent (May 23)
✅ Vercel env vars added + redeployed (May 23)
✅ Landing page taglines rewritten for dual audience (May 23)

### Normal batch cadence (post-June 9)

- Next audit surface from `.audit/QUEUE.md` (queue empty — run `/audit` to pick the next pending row)
- PayFast wire-up (D11 / T5) — needs PayFast credentials from Stephen
- Push notifications (FCM/APNs) — needs Firebase + Apple credentials
- Monorepo migration — before Citizens Wear begins

---

## 5. Open questions / deferred items

- **T4** — MapTiler env vars missing from Vercel (see Section 4 #2 above)
- **T5** — PayFast merchant registration in progress; billing stub live, wire when credentials ready
- **Monorepo** — execute after June 9; plan at `docs/MONOREPO_PLAN.md`
- **Citizens Vision** — needs dedicated planning session before development resumes

---

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 714 pass / 0 fail
npx next lint --dir src     # expect clean
```

Demo smoke test:

1. `npm run dev` → open <http://localhost:3000/events> → map loads with markers
2. Click a POPUP event marker → quick-action popup → View → event detail panel
3. Click organiser name → POPUP profile at `/c/popup-skills`
4. Organisations tab in search bar → type "pop" → POPUP appears in results
5. `/admin` as admin → applications inbox → approve a test application → applicant notified

---

## 7. Memory pointers

- Locked direction: `.github/MASTER_DIRECTION.md`
- Strategic vision + WCI opportunity: `CITIZENS_STRATEGIC_DIRECTION_MAY2026.md` (planning session May 23 2026)
- Restructuring strategy: `CITIZENS_CONNECT_RESTRUCTURING_STRATEGY.md`
- Deferred features: `docs/FUTURE_IDEAS.md`
- Operations runbook: `docs/RUNBOOK.md`
- Coding conventions: `.claude/skills/` + subdirectory CLAUDE.md files
- Audit queue: `.audit/QUEUE.md`

---

## 8. Architecture quick-orient

- Full directory map + data flow: `.github/instructions/project-architecture.instructions.md`
- UI rules (60/30/10, floating controls): `.github/instructions/connect-ui-system.instructions.md`
- MapLibre + MapTiler patterns: `.github/instructions/maplibre-maps.instructions.md`
- Supabase dual-client + RLS + storage: `.github/instructions/supabase-patterns.instructions.md`
- Root brain (new): `CLAUDE.md` + `.claude/agents/` + `.claude/skills/`
- Project ID: `xyiajtrvhlxaeplsiajj` · Default map centre: Pretoria `[-25.7479, 28.2293]`
- Roles: `citizen` / `contributor` (with `contributor_kind`: ministry | organization | business) / `admin`

---

## Audit queue summary

Full queue: `.audit/QUEUE.md`. Status:

- ✅ middleware-and-session, api-surface, auth-and-signup, admin, rsvp-and-comments, events-browse, event-detail, onboarding, profile-and-interests, places-browse-and-follow, storage-and-media-uploads
- ✅ edge-functions (14d), event-create-edit (14e), place-create-edit-media (14f), messaging-dm (14g)
- ✅ map-core (`ff4d9f5`) — applied 2026-05-23
- 🟡 **notifications** — re-audited 2026-05-24. Fix-clean applied (uncommitted working tree): `PostEventPrompt.tsx` deleted + stale mock removed. Fix-staged: `notifications--pending-reviews-dedup.diff` removes PendingReviews inline block (duplicate of notification-driven review flow). Run `/audit-fix notifications` to apply.
- ✅ **Polish Queue rows 1–3 shipped 2026-05-23** (`10b4816`): onboarding column drop (migration 093 file-only), event-detail metadata cache + organiser name, profile UUID guards.
- ✅ **Polish Queue row 6 (events-browse) shipped 2026-05-24** (`3eaabcb`): inline detail panel extracted to `EventPreviewPanel.tsx`; 4 imports cleaned from EventsView.
- Polish Queue rows 7–10 pending. Run `/audit-polish 1` for next row (event-detail row 7 — attendee fanout design decision needed).
