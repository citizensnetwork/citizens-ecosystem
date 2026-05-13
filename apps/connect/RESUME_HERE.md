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

**Batch S2 — Lucide-aligned category icon registry redraw.** One commit on `origin/main`:

- `6798590` — `src/lib/categoryIcons.ts` rewritten. New 28-ID `CategoryIconId` union replaces the legacy 22-ID set. 23 Lucide-extracted path strings copied verbatim from `lucide-react` v0.441.0 (`Church`, `Earth` (globe-2 alias), `Store`, `Palette`, `Martini`, `HeartHandshake`, `GraduationCap`, `Users`, `User`, `UserRound`, `Flame`, `HandHeart`, `KeyRound`, `MicVocal` (mic-2 alias), `Coffee`, `Dumbbell`, `Radio`, `ShoppingBag`, `Stethoscope`, `BookOpen`, `Heart`, `CalendarDays`, `Shirt`). 3 hand-authored custom 24×24 SVGs (`praying-hands`, `soccer-ball`, `lollipop`). Legacy `pin` retained as `DEFAULT_CATEGORY_ICON`. `weekend-tag` is a `CalendarDays` alias via the shared `CALENDAR_DAYS_SVG` constant — staged for S3. EVENT/PLACE/QUICK_ACCESS/SEARCH_INTENT maps all remapped; no old IDs remain.

✅ **Architect Should-fix applied inline:** `SVG_OPEN` now carries explicit `width="24" height="24"` + `xmlns` so glyphs size correctly inside flex containers across Chrome / Firefox / Safari.

✅ **Architect audit:** initial B+ on SVG sizing finding → A after inline fix. Nice-to-haves logged (unused `getIconBySlug`, mixed-intent quick-access keys, fallback ID inconsistency) — non-blocking, queued for a future tidy-up batch.

✅ **Quality gate:** tsc 0 errors, vitest **637 passed / 2 pre-existing baseline failures** (EventDetailContent, unrelated), lint clean, advisors no NEW warnings (no DB changes in this batch).

## 3. Current platform state

- Phases 1 → 11 complete. Batches A → R + S1 + S1.1 + S2 all shipped.
- Test suite: 637 passed / 2 pre-existing baseline failures in `__tests__/components/events/EventDetailContent.test.tsx` (`baseEvent.date` is in the past so the RSVP branches don't render). Unrelated to current batches.
- TS: 0 errors. Lint: clean. Advisors: baseline unchanged.
- Git: `origin/main` at `6798590` (S2). PROJECT_STATUS + DECISIONS + RESUME_HERE doc updates pending as a follow-up docs commit after this push cycle.

## 4. Next batches queued (in priority order)

1. **Batch S3 — Weekend derived tag.** New `src/lib/weekendTag.ts` (`isWeekendEvent(event)` returning true if any spanned day is Fri/Sat/Sun). New `<WeekendChip />` component on `EventCard`, `EventDetailContent`, calendar tooltips. Weekend toggle in `EventsView` filter drawer (separate from category filter). Tests + `{ weekendOnly: true }` API. Removes the `weekends → conferences-summits` stopgap in `personalization/percentages.ts` (the pinned test in `percentages.test.ts` will fail intentionally and must be updated together).

2. **Cross-sphere project status report** (owed to user — explicitly asked in earlier session). Sections: Product, Engineering, Database, Mobile (Capacitor), Content/Community, Outstanding roadmap, Continuity. Inputs: `.github/PROJECT_STATUS.md`, `/memories/repo/outstanding-items.md`, `/memories/repo/pre-progression-roadmap.md`.

3. **Fix the 2 pre-existing `EventDetailContent` failures.** Either bump `baseEvent.date` further into the future, or mock `Date.now()` so RSVP-availability logic resolves to the "logged-in / not started" branch.

4. **S2 nice-to-haves** (logged in Architect audit, non-blocking): delete or test the unused `getIconBySlug`; split mixed-intent `QUICK_ACCESS_ICON_IDS` (currently mixes quick-access ids and event-category slugs); harmonise helper fallback IDs (some return `church`, others `pin`).

## 5. Open questions / deferred items

- None blocking S2. Entertainment mapping (resolved → social-gatherings) and MCP outage (resolved → project restored) from S1 are both closed.
- The pre-existing `EventDetailContent` test failures should be triaged when next touching that file.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 637 pass / 2 pre-existing fail
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

- Batch shipping notes: `/memories/repo/batch-*.md` (latest: `batch-s2-icons-shipped.md`).
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
