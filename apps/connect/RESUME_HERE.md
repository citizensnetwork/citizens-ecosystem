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
- ✅ notifications (`01ec87a`), map-core (`ff4d9f5`) — applied 2026-05-23
- ✅ **Polish Queue rows 1–3 shipped 2026-05-23** (`10b4816`): onboarding column drop (migration 093 file-only), event-detail metadata cache + organiser name, profile UUID guards.
- All 17 surfaces audited and clean. Next polish runs: row 4 (places-browse-and-follow, M), row 5 (notifications, M), row 6 (events-browse minus EventsView split, M). Run `/audit-polish 1` to pick the next row.
