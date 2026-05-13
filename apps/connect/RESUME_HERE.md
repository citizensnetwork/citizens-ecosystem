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

**Batch S1.1 — Categories Refinement v2 follow-ups.** Two commits on `origin/main`:

- `fbb418c` — Architect Should-fix patch (5 items): entertainment→social-gatherings remapped in migration 064 (steps 2 + 6), fail-fast unmapped-slug guard added (step 2b), schema.sql seed mirrored to migration, `events.category_id` FK `on delete set null`, cross-reference docblocks added to category keyword maps, S3 TODO breadcrumb on weekends stopgap.
- `449dfe4` — Coverage-gap regression tests (3 files): `categories.test.ts` parity it.each + hex regex, `percentages.test.ts` weekends stopgap pin, `category-interests.test.ts` (new) runtime regression guard for the Edge Function `CATEGORY_INTEREST_MAP`.

✅ **Migration 064 applied to remote DB** (project `xyiajtrvhlxaeplsiajj` restored from INACTIVE → ACTIVE_HEALTHY via `mcp_com_supabase__restore_project`). Verified: 17 event categories, 10 place categories, all `events.category` values within the new whitelist.

✅ **Architect audits:** A+ on both commits. No Should-fix outstanding.

✅ **Quality gate:** tsc 0 errors, vitest **637 passed / 2 pre-existing baseline failures** (EventDetailContent, unrelated), lint clean, advisors no NEW warnings.

## 3. Current platform state

- Phases 1 → 11 complete. Batches A → R + S1 + S1.1 all shipped.
- Test suite: 637 passed / 2 pre-existing baseline failures in `__tests__/components/events/EventDetailContent.test.tsx` (`baseEvent.date` is in the past so the RSVP branches don't render). Unrelated to current batches.
- TS: 0 errors. Lint: clean. Advisors: baseline unchanged.
- Git: `origin/main` at `449dfe4`. Working tree clean apart from this RESUME_HERE refresh + PROJECT_STATUS + DECISIONS doc updates (will be folded into the S2 push or a small docs commit).

## 4. Next batches queued (in priority order)

1. **Batch S2 — Lucide redraw.** Replace remaining emoji icons in `src/lib/categoryIcons.ts` `ICON_SVGS` with inline Lucide-extracted SVGs. Lucide imports planned: Shirt (Markets & Expos), Martini (Social Gatherings), Flame (Youth & Students), Store (Christian Businesses), Heart (Safe Spaces), Church, Globe2, Palette, HeartHandshake, GraduationCap, Users, User, UserRound, HandHeart, KeyRound, Mic2, CalendarDays, Stethoscope, BookOpen, ShoppingBag, Dumbbell, Coffee, Radio. Plus 4 custom SVGs: `praying-hands`, `soccer-ball`, `lollipop`, `weekend-tag`. Full spec: `.github/QUEUED_BATCH_S_categories_v2.md`. User confirmed "proceed exactly as specced".

2. **Batch S3 — Weekend derived tag.** New `src/lib/weekendTag.ts` (`isWeekendEvent(event)` returning true if any spanned day is Fri/Sat/Sun). New `<WeekendChip />` component on `EventCard`, `EventDetailContent`, calendar tooltips. Weekend toggle in `EventsView` filter drawer (separate from category filter). Tests + `{ weekendOnly: true }` API. Removes the `weekends → conferences-summits` stopgap in `personalization/percentages.ts` (the pinned test in `percentages.test.ts` will fail intentionally and must be updated together).

3. **Cross-sphere project status report** (owed to user — explicitly asked in earlier session). Sections: Product, Engineering, Database, Mobile (Capacitor), Content/Community, Outstanding roadmap, Continuity. Inputs: `.github/PROJECT_STATUS.md`, `/memories/repo/outstanding-items.md`, `/memories/repo/pre-progression-roadmap.md`.

4. **Fix the 2 pre-existing `EventDetailContent` failures.** Either bump `baseEvent.date` further into the future, or mock `Date.now()` so RSVP-availability logic resolves to the "logged-in / not started" branch.

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

- Batch shipping notes: `/memories/repo/batch-*.md` (latest: `batch-s1-1-shipped.md`).
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
