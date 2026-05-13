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

**Batch S1 — Category Refinement v2 (taxonomy refactor only).** Code committed and **pushed to `origin/main`** as **`c9ad2e2..22973c7`**:

- `8fbd2ce` — feat: 43-file taxonomy refactor (16→17 events, 8→10 places, migration 064, fixtures, components, suggesters)
- `22973c7` — docs: RESUME_HERE.md continuity contract

GitHub auth was failing because the wrong gh account (`Impact-Radio`) was active. Resolved with `gh auth switch --hostname github.com --user citizensnetwork`. Push then succeeded cleanly.

Highlights:
- Event taxonomy: 16 slugs → **17 canonical slugs** (`worship-prayer`, `church-services`, `outreach-missions`, `markets-expos`, `sport-recreation`, `arts-culture`, `social-gatherings`, `community-upliftment`, `education-equipping`, `marriage-family`, `mens-community`, `womens-community`, `youth-students`, `kids`, `care-recovery`, `members-only`, `conferences-summits`).
- Place taxonomy: 8 slugs → **10 canonical slugs** (two-word, distinct from event slugs).
- All source maps, fallbacks, suggesters, quick-panel, personalization, easter-egg, edge-function category buckets rewritten.
- Test fixtures and 13 spec files updated.
- Migration `supabase/migrations/064_refine_categories_v2.sql` committed (idempotent old→new remap + new 27-row seed + CHECK swap).

⚠️ **Migration 064 is NOT yet applied to remote DB.** The Supabase MCP runtime returned `Cannot read properties of undefined (reading 'invoke')` for both `mcp_supabase_apply_migration` and the qualified `mcp_com_supabase__apply_migration` (with `project_id: "xyiajtrvhlxaeplsiajj"`). MCP advisor scan also failed for the same reason. **First action next session:** retry MCP, or apply manually via Supabase Studio SQL Editor (paste the contents of `supabase/migrations/064_refine_categories_v2.sql`). The migration is idempotent and safe to re-run.

✅ **Architect audit completed (A−).** No Must-fix. 5 Should-fix items queued for an S1.1 follow-up commit (see §4 below). Coverage gaps and Nice-to-haves logged.

## 3. Current platform state

- Phases 1 → 11 complete (foundation through messaging). See `.github/PROJECT_STATUS.md` phase table.
- Batches A → R shipped + S1 just shipped (code only — DB pending apply).
- Test suite: **615 passed / 2 failed** (2 are pre-existing baseline failures in `__tests__/components/events/EventDetailContent.test.tsx` — `baseEvent.date` is in the past so the "logged-in RSVP" + "log-in to RSVP" branches don't render. Confirmed pre-existing via stash test in S1 session. Unrelated to S1.).
- TS: 0 errors. Lint: clean.
- Git: `origin/main` at `22973c7`. Working tree clean apart from this RESUME_HERE refresh.

## 4. Next batches queued (in priority order)

1. **Apply migration 064 to remote DB.** Either:
   - retry `mcp_com_supabase__apply_migration project_id:"xyiajtrvhlxaeplsiajj" name:"refine_categories_v2"` with the SQL body, or
   - paste `supabase/migrations/064_refine_categories_v2.sql` into Supabase Studio SQL Editor.
   - Verify: `select count(*) from public.categories where applies_to='events'` → 17, `where applies_to='places'` → 10.
   - Then: `mcp_com_supabase__get_advisors project_id:"xyiajtrvhlxaeplsiajj" type:"security"` → no NEW warnings vs baseline.

2. **Resolve `entertainment` mapping discrepancy.** User said in chat "All in social gatherings", but `supabase/migrations/064_refine_categories_v2.sql` line ~57 maps `entertainment → arts-culture`. Confirm intent with user before applying migration; if "social-gatherings" is correct, update the migration mapping CTE before apply.

3. **Batch S1.1 — Architect Should-fix patch (small commit):**
   1. Mirror migration 064's hex values into `supabase/schema.sql` seed (~12 colour mismatches between schema seed and `src/lib/categories.ts` `CATEGORY_HEX` / `PLACE_CATEGORY_HEX`).
   2. Add explicit pre-CHECK assertion in migration 064 between step 2 and step 3 that surfaces unmapped legacy slugs by name, instead of relying on opaque CHECK violation.
   3. Add `ON DELETE SET NULL` to `events.category_id` FK in `supabase/schema.sql` (matches `places.category_id`).
   4. Add cross-reference comments between `EVENT_CATEGORY_KEYWORDS` (in `src/lib/categories.ts`) and `KEYWORDS` (in `src/lib/categorySuggest.ts`) so future edits don't drift one without the other.
   5. Add a TODO breadcrumb in `src/lib/personalization/percentages.ts` (line ~62) for the `weekends → conferences-summits` stopgap, pointing at the S3 ticket.

4. **Architect coverage-gap tests (folds into S1.1 or S2):**
   - `__tests__/lib/categories.test.ts` — `Object.keys` equality assertion across `CATEGORY_LABELS`, `CATEGORY_HEX`, `CATEGORY_LABELS_SHORT`, `CATEGORY_BADGE_CLASSES`, `EVENT_CATEGORY_KEYWORDS`, `EVENT_CATEGORY_ICON_IDS`, `CATEGORY_INTEREST_MAP` (+ place equivalents).
   - Edge function `CATEGORY_INTEREST_MAP` (in `supabase/functions/_shared/category-interests.ts`) — assert all 17 event slugs present (it's `Record<string, string[]>`, untyped, so missing slugs only fail at runtime delivery).
   - Pin `time_availability: weekends → conferences-summits` regression in `percentages.test.ts` so the S3 author must update both sides.
   - Migration count smoke test against a seeded fixture DB.

5. **Batch S2 — Lucide redraw.** Replace remaining emoji icons with Lucide-extracted inline SVGs as source-of-truth. Add 3 custom SVGs: `praying-hands`, `soccer-ball`, `lollipop`. Add one tag icon: `weekend-tag`. Lucide imports planned: Shirt (Markets & Expos), Martini (Social Gatherings), Flame (Youth & Students), Store (Christian Businesses), Heart (Safe Spaces), Church, Globe2, Palette, HeartHandshake, GraduationCap, Users, User, UserRound, HandHeart, KeyRound, Mic2, CalendarDays, Stethoscope, BookOpen, ShoppingBag, Dumbbell, Coffee, Radio. Full spec: `.github/QUEUED_BATCH_S_categories_v2.md`.

6. **Batch S3 — Weekend derived tag.** New `src/lib/weekendTag.ts` (`isWeekendEvent(event: { date: string; end_time: string | null }): boolean` returning true if any spanned day is Fri/Sat/Sun). New `<WeekendChip />` component on `EventCard`, `EventDetailContent`, calendar tooltips. Weekend toggle/chip in `EventsView` filter drawer (separate from category filter). Tests per Architect coverage gap #3.

7. **Cross-sphere project status report (owed to user).** User explicitly asked: "provide me an update on where we find ourself in this project and what we have left to do in all spheres once we're done and you've pushed". Owed sections: Product, Engineering, Database, Mobile (Capacitor), Content/Community, Outstanding roadmap, Continuity. Use `.github/PROJECT_STATUS.md` + `/memories/repo/outstanding-items.md` + `/memories/repo/pre-progression-roadmap.md` as inputs.

8. **Fix the 2 pre-existing `EventDetailContent` failures.** Either bump `baseEvent.date` further into the future, or mock `Date.now()` so RSVP-availability logic resolves to the "logged-in / not started" branch.

## 5. Open questions / deferred items

- **`entertainment` mapping** — chat said "social gatherings", spec doc says "arts-culture". Resolve before migration apply.
- **Supabase MCP** was broken this session ("invoke undefined"). May be transient — retry first thing next session. If still broken, fall back to Studio SQL Editor.
- The pre-existing `EventDetailContent` test failures should be triaged when next touching that file.

## 6. How to verify locally (Windows PowerShell)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit            # expect 0 errors
npx vitest run              # expect 615 pass / 2 pre-existing fail
npx next lint --dir src     # expect clean
```

After applying migration 064, also verify category seed counts:

```sql
select applies_to, count(*) from public.categories group by applies_to;
-- expect: events 17, places 10
select category, count(*) from public.events group by category order by 2 desc;
-- expect: only the 17 new slugs appear
```

## 7. Memory pointers

- Batch shipping notes (per batch): `/memories/repo/batch-*.md` (`batch-r-icons-media-galleries-shipped.md`, `batch-s1-categories-shipped.md`, …).
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
