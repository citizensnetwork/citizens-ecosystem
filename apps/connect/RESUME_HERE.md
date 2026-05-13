# RESUME_HERE — Citizens Connect

> **Read this first. It is the single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch by the Continuity Manager.

---

## 1. Project at a glance

- **Citizens Connect** — flagship channel of the Citizens ecosystem. Map-first community discovery (events, places, organisers) for the Christian community and anyone curious.
- Stack: Next.js 15 App Router (RSC) + Supabase + MapLibre GL JS + Tailwind CSS v4 + Capacitor (iOS/Android wrapper).
- Design: white-black-gold (60/30/10), full-screen map / calendar dual-view, floating controls, Kingdom-quality polish.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- Vision + ecosystem context: `.github/VISION.md`, `/memories/repo/citizens-ecosystem-vision.md`.

## 2. What just shipped

**Three batches in this session, all on `origin/main`:**

- `3a5ed28` — **Batch 3: S2 + S3 nice-to-haves cleanup.** `src/lib/categoryIcons.ts` consolidated: new `DEFAULT_ICON_ID = "pin"` is the single canonical fallback for all four icon helpers (`getEventCategoryIcon`, `getPlaceCategoryIcon`, `getQuickAccessIcon`, `getIconSvg`); deleted unused `getIconBySlug` (zero call sites); reduced `QUICK_ACCESS_ICON_IDS` to the 6 native quick-panel pseudo-ids (`bible-study`, `coffee`, `runs`, `churches`, `outreaches`, `care`) and `getQuickAccessIcon` now composes top-down through event-category → place-category → DEFAULT. `WeekendChip` inlines its CalendarDays icon as JSX SVG (drops the last `dangerouslySetInnerHTML` on hot card/detail/calendar render paths). `BurgerMenu` weekend toggle migrated from `aria-pressed` to `role="switch"` + `aria-checked`. `EventsView` wraps `onToggleWeekend` in `useCallback`. Quick-access invariant test rewritten to assert the resolver contract; second test pins the 6 native pseudo-ids.

- `36e43ec` — **Batch 2: EventDetailContent baseline test fix.** `baseEvent.date` switched to a `Date.now() + 30d` relative-future fixture; "renders formatted date" assertion now derives the expected month name from the fixture itself (case-insensitive RegExp). Closes the two pre-existing baseline failures flagged in the prior RESUME_HERE.

- `8093b81` — **Batch 1: Cross-sphere status report.** `docs/STATUS_REPORT_2026-05.md` added — Product / Engineering / Database / Mobile / Content / Outstanding / Continuity sections. Docs-only.

✅ **Architect audit (Batch 3):** Grade A across architecture, API design, security, performance, accessibility, code quality. No Must- or Should-fix. Three nice-to-haves logged for a future session (Lucide-bump drift test for `WeekendChip` ↔ `CALENDAR_DAYS_SVG`; literal-union typing for `QUICK_ACCESS_ICON_IDS`; cosmetic Record cast in resolver) — none warranting hold.

✅ **Quality gate (Batch 3):** tsc 0 errors, vitest **656 passed / 0 failures** (+1 vs Batch 2: new "native quick-access mapping" test), lint clean, Supabase security advisor baseline unchanged (no DB changes).

## 3. Current platform state

- Phases 1 → 11 complete. Batches A → R + S1 + S1.1 + S2 + S3 + (post-S3) 1 + 2 + 3 all shipped.
- Test suite: **656 passed / 0 failures.** (Was 653/2 pre-Batch-2; +2 from EventDetailContent fix, +1 from new quick-access mapping test.)
- TS: 0 errors. Lint: clean. Advisors: baseline unchanged (ERROR 2 / WARN 77 — same shape as pre-S3).
- Git: `origin/main` at `3a5ed28`. PROJECT_STATUS + DECISIONS + RESUME_HERE refreshed alongside this commit (docs are part of the same push window per standing workflow).

## 4. Next batches queued (in priority order)

1. **Phase 18 — Content seeding & community onboarding pass.** Biggest gap per `docs/STATUS_REPORT_2026-05.md`. Seed real ministry/place data, dial in the onboarding wizard copy, write the public landing-page narrative. Likely needs the Community agent.

2. **Phase 22 — Push delivery via FCM/APNs.** Tokens + in-app fan-out shipped in Phase 10; actual native push delivery via Firebase Cloud Messaging (Android) and Apple Push Notification service (iOS) still pending. Edge function `notify-event-update` already exists; need credentials wiring + Capacitor plugin registration + token-refresh path.

3. **Optional polish from Batch 3 Architect nice-to-haves** (defer until Lucide bumps): drift test asserting `WeekendChip` JSX path data is a subset of `CALENDAR_DAYS_SVG`; tighten `QUICK_ACCESS_ICON_IDS` to a string-literal union `QuickIntentId`.

## 5. Open questions / deferred items

- All baseline test failures resolved. No carried-over blockers.
- FCM/APNs credentials: need confirmation from user on whether to register the Firebase project and Apple developer push key under the Citizens Network account before wiring tokens.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 656 pass / 0 fail
npx next lint --dir src     # expect clean
```

Live DB sanity check after S1.1:

```sql
select applies_to, count(*) from public.categories group by applies_to;
-- events 17, places 10
select category, count(*) from public.events group by category order by 2 desc;
-- only the 17 new slugs appear (top: social-gatherings, education-equipping, care-recovery, church-services)
```

## 7. Memory pointers

- Batch shipping notes: `/memories/repo/batch-*.md` (latest: `batch-3-s2-s3-nicetohaves-shipped.md`).
- Standing user workflow: `/memories/quality-pipeline.md` (user-scope).
- Ecosystem vision + slogan: `/memories/repo/citizens-ecosystem-vision.md`, `/memories/repo/citizens-slogan.md`.
- Coding conventions: `/memories/repo/coding-patterns.md`.
- Outstanding & roadmap: `/memories/repo/outstanding-items.md`, `/memories/repo/pre-progression-roadmap.md`, `/memories/repo/ecosystem-expansion-plan.md`.
- Locked S2/S3 spec: `.github/QUEUED_BATCH_S_categories_v2.md`.

## 8. Architecture quick-orient

- Full directory map + data flow + key relationships: `.github/instructions/project-architecture.instructions.md`.
- UI rules (60/30/10, floating controls): `.github/instructions/connect-ui-system.instructions.md`.
- MapLibre patterns: `.github/instructions/leaflet-maps.instructions.md`.
- Supabase dual-client + RLS + storage: `.github/instructions/supabase-patterns.instructions.md`.
- Always-on continuity contract + agent registry: `.github/AGENTS.md`.
- Default session workflow (quality gate procedure): `.github/copilot-instructions.md` → "Default session workflow".
- Project ID: `xyiajtrvhlxaeplsiajj`. Default map centre: Pretoria, South Africa `[-25.7479, 28.2293]`.
