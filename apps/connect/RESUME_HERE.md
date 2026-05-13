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

**Batch S1 — Category Refinement v2 (taxonomy refactor only).** Code shipped on `main`. See `.github/PROJECT_STATUS.md` for the full validation block and `.github/DECISIONS.md` (Batch S1 entry) for the rationale.

Highlights:
- Event taxonomy: 16 slugs → **17 canonical slugs** (`worship-prayer`, `church-services`, `outreach-missions`, `markets-expos`, `sport-recreation`, `arts-culture`, `social-gatherings`, `community-upliftment`, `education-equipping`, `marriage-family`, `mens-community`, `womens-community`, `youth-students`, `kids`, `care-recovery`, `members-only`, `conferences-summits`).
- Place taxonomy: 8 slugs → **10 canonical slugs** (two-word, distinct from event slugs).
- All source maps, fallbacks, suggesters, quick-panel, personalization, easter-egg, edge-function category buckets rewritten.
- Test fixtures and 13 spec files updated.
- Migration `supabase/migrations/064_refine_categories_v2.sql` committed (idempotent old→new remap + new 27-row seed + CHECK swap).

⚠️ **Migration 064 is NOT yet applied to remote DB.** First action next session:

```text
mcp_supabase_apply_migration  name:"refine_categories_v2"
```

(Apply the SQL from `supabase/migrations/064_refine_categories_v2.sql`. The migration is idempotent and safe to re-run.)

## 3. Current platform state

- Phases 1 → 11 complete (foundation through messaging). See `.github/PROJECT_STATUS.md` phase table.
- Batches A → R shipped + S1 just shipped (code only — DB pending apply).
- Test suite: 615 passed / 2 failed (2 are pre-existing on baseline `main`, unrelated to S1: `EventDetailContent` "shows RSVP button for logged-in user" + "shows 'Log in to RSVP' link for unauthenticated user" — both fail because `baseEvent.date` is treated as already-started; should be moved further into the future or have the date logic mocked).

## 4. Next batches queued (in order)

1. **Apply migration 064** — `mcp_supabase_apply_migration name:"refine_categories_v2"`. Run `mcp_supabase_get_advisors type:"security"` immediately after; compare to baseline (no NEW warnings).
2. **Architect audit on Batch S1 diff** — invoke Architect subagent with the diff covering `src/types/db.ts`, `src/lib/categories.ts`, `src/lib/categoryIcons.ts`, `src/lib/categorySuggest.ts`, `src/lib/quickPanelOptions.ts`, `src/lib/personalization/percentages.ts`, `src/lib/easterEggs/*`, `src/lib/map/markers.ts`, `supabase/functions/_shared/category-interests.ts`, `supabase/migrations/064_refine_categories_v2.sql`, `supabase/schema.sql`, all 4 affected components, and the 13 updated tests. Apply Should-fix findings inline; note Nice-to-haves.
3. **Batch S2 — Lucide redraw.** Replace remaining emoji icons with Lucide-extracted inline SVGs as source-of-truth. Add 3 custom SVGs: `praying-hands`, `soccer-ball`, `lollipop`. Add one tag icon: `weekend-tag`. Spec section in `.github/QUEUED_BATCH_S_categories_v2.md`.
4. **Batch S3 — Weekend derived tag.** New `src/lib/weekendTag.ts` (`isWeekendEvent(event)`), `<WeekendChip />` component, Weekend toggle in `EventsView` filter drawer, `weekendTag` unit tests. Note: `src/lib/personalization/percentages.ts` currently routes `time_availability=weekends` → `conferences-summits` with a TODO comment — flip back to a derived signal when S3 lands.
5. **Fix the 2 pre-existing `EventDetailContent` failures.** Either bump `baseEvent.date` further into the future, or mock `Date.now()` so RSVP-availability logic resolves to the "logged-in / not started" branch.

## 5. Open questions / deferred items

- **Architect subagent** was not loaded in the S1 session — review of the S1 diff is owed before the next code change in this area.
- **Supabase MCP** was not loaded in the S1 session — migration application + advisor scan are owed before any feature work that touches `events.category` or `places.category_id` semantically.
- The pre-existing `EventDetailContent` test failures should be triaged when next touching that file.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 615 pass / 2 pre-existing fail
npx next lint --dir src     # expect clean
```

After applying migration 064, also run any S1-impacted seed/maintenance scripts (none currently).

## 7. Memory pointers

- Batch shipping notes (per batch): `/memories/repo/batch-*.md` (`batch-r-icons-media-galleries-shipped.md`, `batch-s1-categories-shipped.md`, …).
- Standing user workflow: `/memories/quality-pipeline.md` (user-scope).
- Ecosystem vision + slogan: `/memories/repo/citizens-ecosystem-vision.md`, `/memories/repo/citizens-slogan.md`.
- Coding conventions: `/memories/repo/coding-patterns.md`.
- Outstanding & roadmap: `/memories/repo/outstanding-items.md`, `/memories/repo/pre-progression-roadmap.md`, `/memories/repo/ecosystem-expansion-plan.md`.

## 8. Architecture quick-orient

- Full directory map + data flow + key relationships: `.github/instructions/project-architecture.instructions.md`.
- UI rules (60/30/10, floating controls): `.github/instructions/connect-ui-system.instructions.md`.
- MapLibre patterns: `.github/instructions/leaflet-maps.instructions.md`.
- Supabase dual-client + RLS + storage: `.github/instructions/supabase-patterns.instructions.md`.
- Always-on continuity contract + agent registry: `.github/AGENTS.md`.
- Default session workflow (quality gate procedure): `.github/copilot-instructions.md` → "Default session workflow".
