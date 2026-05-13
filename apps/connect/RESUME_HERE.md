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

**Batch S3 — Weekend derived tag, chip, and filter.** One commit on `origin/main`:

- `07bb294` — new `src/lib/weekendTag.ts` exposing `isWeekendEvent({date, end_time})`. UTC-deterministic walk: returns true if any spanned day is Sat (any time), Sun (any time), or Fri ≥17:00 UTC. 366-day defensive guard; invalid dates return false. New `<WeekendChip />` outline pill (gold border `#D4AF37/55`, text `#8B7500`, Lucide `CalendarDays` icon) rendered alongside the category badge on `EventCard` and `EventDetailContent`. FullCalendar events get a deterministic native `title` attr via `eventDidMount` (`"<title>"` or `"<title> — Weekend"`). New "Weekend only" toggle inside the BurgerMenu events-tab Categories accordion (checkbox-style, gold-active state, `aria-pressed`). Filter is AND-combined with category selection inside `EventsView.filtered` and bypassed during free-text search. `personalization/percentages.ts` weekends→`conferences-summits` stopgap removed (now a no-op); pinned test updated to assert `{}`. 16 unit tests for `isWeekendEvent` covering Sat/Sun, the Fri 17:00 boundary, multi-day spans, invalid input, and the >1-year guard.

✅ **Architect Should-fixes applied inline:** (1) calendar `title` attr now set deterministically for every event (not only weekend ones) so FullCalendar DOM recycling can't leave stale `— Weekend` suffixes; (2) misleading "guard cap" test comment corrected.

✅ **Architect audit:** Grade A across architecture, API design, security, performance, accessibility, code quality. No must-fix. Remaining nice-to-haves logged (optional `role="switch"` upgrade, optional `useCallback`, optional inline JSX SVG to drop one `dangerouslySetInnerHTML`).

✅ **Quality gate:** tsc 0 errors, vitest **653 passed / 2 pre-existing baseline failures** (EventDetailContent — unrelated, same as before), lint clean, Supabase security advisors unchanged from baseline (no DB changes in this batch).

## 3. Current platform state

- Phases 1 → 11 complete. Batches A → R + S1 + S1.1 + S2 + S3 all shipped.
- Test suite: **653 passed / 2 pre-existing baseline failures** in `__tests__/components/events/EventDetailContent.test.tsx` (`baseEvent.date` is in the past so the RSVP branches don't render). Unrelated to current batches.
- TS: 0 errors. Lint: clean. Advisors: baseline unchanged (ERROR 2 / WARN 77 — same shape as pre-S3).
- Git: `origin/main` at `07bb294` (S3). PROJECT_STATUS + DECISIONS doc updates committed alongside this RESUME_HERE refresh.

## 4. Next batches queued (in priority order)

1. **Cross-sphere project status report** (owed to user — explicitly asked in earlier session). Sections: Product, Engineering, Database, Mobile (Capacitor), Content/Community, Outstanding roadmap, Continuity. Inputs: `.github/PROJECT_STATUS.md`, `/memories/repo/outstanding-items.md`, `/memories/repo/pre-progression-roadmap.md`. Docs-only commit.

2. **Fix the 2 pre-existing `EventDetailContent` failures.** Either bump `baseEvent.date` further into the future, or mock `Date.now()` so RSVP-availability logic resolves to the "logged-in / not started" branch.

3. **S2 nice-to-haves** (logged in Architect audit, non-blocking): delete or test the unused `getIconBySlug`; split mixed-intent `QUICK_ACCESS_ICON_IDS` (currently mixes quick-access ids and event-category slugs); harmonise helper fallback IDs (some return `church`, others `pin`).

4. **S3 nice-to-haves** (optional polish): consider `role="switch"` + `aria-checked` on the Weekend toggle; wrap `onToggleWeekend` in `useCallback` if `BurgerMenu` ever gets `React.memo`d; inline the Weekend chip icon as JSX SVG to drop one `dangerouslySetInnerHTML`.

## 5. Open questions / deferred items

- None blocking S2. Entertainment mapping (resolved → social-gatherings) and MCP outage (resolved → project restored) from S1 are both closed.
- The pre-existing `EventDetailContent` test failures should be triaged when next touching that file.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 653 pass / 2 pre-existing fail
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

- Batch shipping notes: `/memories/repo/batch-*.md` (latest: `batch-s3-weekend-tag-shipped.md`).
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
