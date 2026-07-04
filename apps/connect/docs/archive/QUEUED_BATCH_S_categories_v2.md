# Session Plan — Batch S: Category Refinement v2 (Connect)

**Status:** ⏳ NOT STARTED — fully scoped, ready to execute end-to-end in a fresh session.
**Reason for deferral:** Locked batch requires rewriting ~700-line `categories.ts` + ~190-line `categoryIcons.ts` + ~10 dependent source files + all category test fixtures + a destructive DB migration + a new EventsView filter UI + the full quality pipeline (tsc/vitest/lint/Architect/advisors) + commit/push + RESUME_HERE.md + continuity-contract updates. Single-session capacity insufficient for full A-grade execution. Codebase is currently GREEN — types/db.ts in-flight change was reverted.

## Locked Decisions (do NOT re-ask)

### Event taxonomy: 17 canonical slugs

| New slug | Label | Replaces (old) |
|---|---|---|
| `worship-prayer` | Worship & Prayer | (new — split from `church`) |
| `church-services` | Church Services | `church` |
| `outreach-missions` | Outreach & Missions | `missional` |
| `markets-expos` | Markets & Expos | (new) |
| `sport-recreation` | Sport & Recreation | `sport-fun` |
| `arts-culture` | Arts & Culture | `entertainment` |
| `social-gatherings` | Social Gatherings | `social-fun` |
| `community-upliftment` | Community Upliftment | (kept slug) |
| `education-equipping` | Education & Equipping | `education` + `equip` (merged) |
| `marriage-family` | Marriage & Family | `marriage-and-couples` |
| `mens-community` | Men's Community | `mens` |
| `womens-community` | Women's Community | `womens` |
| `youth-students` | Youth & Students | (new — split from `kids`) |
| `kids` | Kids | (kept slug) |
| `care-recovery` | Care & Recovery | `care` + `recovery` (merged) |
| `members-only` | Members Only | (kept slug) |
| `conferences-summits` | Conferences & Summits | `weekend` (repurposed; weekend now derived) |

### Place taxonomy: 10 canonical slugs

| New slug | Label | Replaces (old) |
|---|---|---|
| `churches-ministries` | Churches & Ministries | `church` |
| `hospitality-cafes` | Hospitality & Cafés | `relax` |
| `recreation-sport` | Recreation & Sport | `exercise` |
| `media-broadcasting` | Media & Broadcasting | `media` |
| `retail-shopping` | Retail & Shopping | `shopping` |
| `health-wellness` | Health & Wellness | `health` |
| `education-training` | Education & Training | `education` |
| `arts-creative` | Arts & Creative | `arts` |
| `christian-businesses` | Christian Businesses | (new) |
| `safe-spaces` | Safe Spaces | (new) |

### Weekend = derived tag, NOT category
- Helper: `src/lib/weekendTag.ts` → `export function isWeekendEvent(event: { date: string; end_time: string | null }): boolean`
- Rule (locked): returns true if event date span touches Friday, Saturday, or Sunday (broad interpretation for visibility).
- UI: `<WeekendChip />` shown alongside category badge on `EventCard`, `EventDetailContent`, calendar tooltips.
- Filter: a "Weekend only" toggle chip in EventsView filter drawer (separate state from `activeCategories`).

### Icons: Lucide-extracted inline SVGs (canonical) + 4 custom
- Source-of-truth = SVG path data extracted from `node_modules/lucide-react/dist/esm/icons/<name>.js`.
- Standard SVG attrs: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- Lucide names per slug (extract `<path>`/`<circle>` strings):
  - `worship-prayer` → custom `praying-hands` (author hand-crafted SVG)
  - `church-services` → `Church`
  - `outreach-missions` → `Globe2`
  - `markets-expos` → `Store`
  - `sport-recreation` → custom `soccer-ball` (author hand-crafted SVG)
  - `arts-culture` → `Palette`
  - `social-gatherings` → `Martini`
  - `community-upliftment` → `HeartHandshake`
  - `education-equipping` → `GraduationCap`
  - `marriage-family` → `Users`
  - `mens-community` → `User`
  - `womens-community` → `UserRound`
  - `youth-students` → `Flame`
  - `kids` → custom `lollipop` (author hand-crafted SVG)
  - `care-recovery` → `HandHeart`
  - `members-only` → `KeyRound`
  - `conferences-summits` → `Mic2`
  - `weekend-tag` (derived chip icon) → `CalendarDays`
- Place icons:
  - `churches-ministries` → `Church`
  - `hospitality-cafes` → `Coffee`
  - `recreation-sport` → `Dumbbell`
  - `media-broadcasting` → `Radio`
  - `retail-shopping` → `ShoppingBag`
  - `health-wellness` → `Stethoscope`
  - `education-training` → `BookOpen`
  - `arts-creative` → `Palette`
  - `christian-businesses` → `Store`
  - `safe-spaces` → `Heart`

### Hex colors (suggested — refine in implementation)
Keep brand gold `#D4AF37` for `church-services`. Choose distinct hues for the rest, mindful of contrast on white. Reuse old hexes where slugs map 1:1 (e.g. `community-upliftment` → `#9B59B6`, `kids` → `#00BCD4`, `members-only` → `#212121`).

## Execution Plan (Phases — sequential)

### Phase A — Migration `supabase/migrations/064_refine_categories_v2.sql`
Idempotent. Steps:
1. Drop existing CHECK constraint on `events.category` (look up real name via `pg_constraint` or DO block).
2. `UPDATE events SET category = CASE category WHEN 'entertainment' THEN 'arts-culture' WHEN 'sport-fun' THEN 'sport-recreation' WHEN 'social-fun' THEN 'social-gatherings' WHEN 'education' THEN 'education-equipping' WHEN 'church' THEN 'church-services' WHEN 'missional' THEN 'outreach-missions' WHEN 'marriage-and-couples' THEN 'marriage-family' WHEN 'mens' THEN 'mens-community' WHEN 'womens' THEN 'womens-community' WHEN 'recovery' THEN 'care-recovery' WHEN 'equip' THEN 'education-equipping' WHEN 'weekend' THEN 'conferences-summits' WHEN 'care' THEN 'care-recovery' ELSE category END;`
3. `ALTER TABLE events ALTER COLUMN category SET DEFAULT 'church-services';`
4. Re-add CHECK constraint with the 17 new slugs.
5. Build temp `old_id → new_id` mapping for `public.categories`. Insert 17 event rows + 10 place rows with `slug, name, color, applies_to, sort_order, icon_id` (icon_ids match `categoryIcons.ts` registry).
6. `UPDATE events SET category_id = ...` and `UPDATE places SET category_id = ...` via the mapping.
7. `DELETE FROM categories WHERE slug NOT IN (<27 new slugs>);`
8. Verify: event count unchanged, no NULL `category` or `category_id`.
9. Apply via `mcp_supabase_apply_migration name:"064_refine_categories_v2"`.
10. Update `supabase/schema.sql` CHECK constraint and seed list to match (do NOT re-run; schema.sql is canonical reference only).

### Phase B — Types & constants
- `src/types/db.ts`: replace `EventCategory` + `PlaceCategory` unions (already drafted in this plan; see decision table).
- `src/lib/categories.ts`: full rewrite of `CATEGORY_LABELS`, `CATEGORY_LABELS_SHORT`, `CATEGORY_HEX`, `CATEGORY_BADGE_CLASSES`, `CATEGORY_COLORS`, `EVENT_CATEGORIES`, `CATEGORY_FILTERS`, `EVENT_CATEGORY_KEYWORDS`, plus `PLACE_CATEGORY_LABELS`, `PLACE_CATEGORY_DESCRIPTIONS`, `PLACE_CATEGORY_HEX`, `PLACE_CATEGORIES`, `PLACE_CATEGORY_KEYWORDS`. Each keyword bucket ≥50 entries. Reuse old keywords where slugs map cleanly; merge keyword sets where slugs collapse (education+equip → education-equipping; care+recovery → care-recovery); author fresh ≥50-keyword sets for new slugs (`worship-prayer`, `markets-expos`, `youth-students`, `christian-businesses`, `safe-spaces`).

### Phase C — Icons `src/lib/categoryIcons.ts`
- Keep `CategoryIconId` union pattern + `ICON_SVGS` registry of inline SVG strings.
- Extract Lucide path data per the icon map above. For each Lucide icon name, run e.g. `Get-Content node_modules\lucide-react\dist\esm\icons\church.js` and copy the path strings.
- Author 3 custom SVGs (`praying-hands`, `soccer-ball`, `lollipop`) using the same 24×24 viewBox + currentColor stroke style.
- Add `weekend-tag` icon (CalendarDays).
- Update `EVENT_CATEGORY_ICON_IDS`, `PLACE_CATEGORY_ICON_IDS`, helper functions.

### Phase D — Weekend derived tag
- New file `src/lib/weekendTag.ts` with `isWeekendEvent({ date, end_time })`. Treat date span: walk dates from start through end (or single date if no end_time) and return true if any day is Fri/Sat/Sun (UTC-aware OK; events store ISO date).
- New `<WeekendChip />` component (small, gold pill, calendar icon).
- Render alongside category badge in `EventCard`, `EventDetailContent`, calendar tooltip cell.
- Add `[weekendOnly, setWeekendOnly] = useState(false)` to `EventsView`; toggle chip in filter drawer; combine into `filteredEvents` predicate.

### Phase E — Dependents
Update slug references in:
- `src/lib/categorySuggest.ts` — rebucket all keyword arrays to new 17 slugs.
- `src/lib/quickPanelOptions.ts` — every `eventCategories: [...]` and `placeCategories: [...]` array.
- `src/lib/personalization/percentages.ts` — `TAG_CATEGORY_MAP` and demographic bumps (line 51-113). Mapping: `marriage-and-couples` → `marriage-family`; `community-upliftment` → unchanged; `social-fun` → `social-gatherings`; `equip`+`education` → `education-equipping`; `care` → `care-recovery`; `church` → `church-services`; `weekend` → REMOVE (now derived).
- `src/lib/easterEggs/wyr.ts` — every `categories: [...]` in WYR_POOL options. ~25 pairs.
- `src/lib/easterEggs/registry.ts` line 98: `"marriage-and-couples"` → `"marriage-family"`.
- `src/lib/map/markers.ts` lines 62, 74, 126, 289-294: default `category ?? "church"` → `"church-services"`.
- `supabase/functions/_shared/category-interests.ts` — rekey `CATEGORY_INTEREST_MAP` to new 17 slugs (interest values stay the same).
- `supabase/schema.sql` lines 85-92 (events.category CHECK + default) and seed lines 248-258 (categories table).

### Phase F — Tests & fixtures
- `src/__tests__/lib/categories.test.ts` — update `ALL_CATEGORIES` (16→17), `ALL_PLACE_CATEGORIES` (8→10), expectations: `EVENT_CATEGORIES.toHaveLength(17)`, `CATEGORY_FILTERS.toHaveLength(18)`, remove `PLACE_CATEGORY_LABELS.shopping === "Stores"` assertion (replace with `retail-shopping`).
- `src/__tests__/lib/categoryIcons.test.ts` — update icon-id assertions.
- `src/__tests__/lib/categorySuggest.test.ts` — `"church"` → `"church-services"`, `"marriage-and-couples"` → `"marriage-family"`, `"sport-fun"` → `"sport-recreation"`, etc.
- `src/__tests__/lib/personalization/percentages.test.ts` — same slug renames; remove `weekend` references.
- `src/__tests__/lib/easterEggs/registry.test.ts` lines 80, 92 — `"marriage-and-couples"` → `"marriage-family"`.
- `src/__tests__/helpers/fixtures.ts` line 45 + 93-94 — slug renames.
- `src/__tests__/components/events/EventCard.test.tsx` line 35 — `"entertainment"` → `"arts-culture"` and label `"Arts & Culture"`.
- `src/__tests__/components/events/EventDetailContent.test.tsx` — `"church"` → `"church-services"`, `"social-fun"` → `"social-gatherings"`.
- `src/__tests__/components/events/EditEventForm.test.tsx`, `EventsView.test.tsx` — slug renames.
- `src/__tests__/components/places/PlaceForm.test.tsx` — no change needed (Category DB rows use arbitrary `slug` strings).
- New `src/__tests__/lib/weekendTag.test.ts` — assert: Mon-only false; Fri-only true; Fri→Sat true; Sat single true; Sun single true; Tue→Wed false; Thu→Sat true (touches weekend); Mon→Tue false.

### Phase G — Quality pipeline (gates)
1. `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx tsc --noEmit` → 0 errors.
2. `npx vitest run` → all passing.
3. `npx next lint --dir src` → clean (deprecation warning OK).
4. Spawn `Architect` subagent with diff summary → apply Should-fixes inline → re-run tsc + vitest.
5. `mcp_supabase_get_advisors type:"security"` → no NEW warnings vs. baseline.

### Phase H — Docs + memory + push
1. Update `.github/PROJECT_STATUS.md` — new "Batch S — Category Refinement v2" section with checklist + validation block.
2. Update `.github/DECISIONS.md` — three decisions:
   - 17-event/10-place taxonomy is canonical (with mapping table).
   - Weekend is a derived tag, never a slug; rule: any day in span touches Fri/Sat/Sun.
   - Lucide-extracted inline SVGs are the icon source-of-truth; 3 custom SVGs documented.
3. Create `/memories/repo/batch-s-categories-v2-shipped.md` — invariants, mappings, follow-ups.
4. Update `/memories/session/plan.md` — mark batch S `✅ SHIPPED <sha>`.
5. Create `RESUME_HERE.md` at repo root — 8 sections: Project at a glance, What just shipped, Current platform state, Next batch queued, Open questions, How to verify, Memory pointers, Architecture quick-orient.
6. Update `.github/agents/continuity-manager.agent.md` — add requirement to refresh RESUME_HERE.md every batch.
7. Update `.github/AGENTS.md` startup protocol — read RESUME_HERE.md first.
8. Update `.github/copilot-instructions.md` "Default session workflow" — add "Refresh RESUME_HERE.md" step.
9. Commit message in `.git/COMMIT_MSG.txt`:
   ```
   feat(categories): refine event taxonomy to 17 categories + 10 place categories with Lucide icons and weekend derived tag

   - Replace EventCategory union with 17 canonical slugs; add worship-prayer, markets-expos, youth-students; merge education+equip and care+recovery
   - Replace PlaceCategory union with 10 canonical slugs; add christian-businesses, safe-spaces
   - Migrate events + places via 064_refine_categories_v2.sql with idempotent old→new slug mapping
   - Replace emoji icons with Lucide-extracted inline SVGs (3 custom: praying-hands, soccer-ball, lollipop)
   - Introduce isWeekendEvent() derived tag + WeekendChip + Weekend filter toggle in EventsView
   - Refresh keyword buckets (≥50 per slug); rebucket WYR + percentage engine + quick panel + edge functions
   - Update all test fixtures + add weekend tag unit tests
   - Add RESUME_HERE.md and update continuity-manager contract for zero-context-loss handoffs
   ```
10. `git add -A; git -c user.name="Citizens Network" -c user.email="citizensnetworkpbo@gmail.com" commit -F .git/COMMIT_MSG.txt; git push origin main`.

## Reference Files (already mapped)

- `src/types/db.ts` lines 3-29 — old unions to replace.
- `src/lib/categories.ts` ~700 lines — all maps documented above.
- `src/lib/categoryIcons.ts` ~190 lines — current 22 custom SVGs → replace with Lucide.
- `src/lib/categorySuggest.ts` 1-130 — KEYWORDS map keyed by EventCategory.
- `src/lib/quickPanelOptions.ts` 1-170 — 20 QuickAccessItem entries.
- `src/lib/personalization/percentages.ts` 51-113 — TAG_CATEGORY_MAP + demographic bumps.
- `src/lib/easterEggs/wyr.ts` 1-200 — WYR_POOL (~25 pairs).
- `src/lib/easterEggs/registry.ts` line 98.
- `src/lib/map/markers.ts` lines 62, 74, 126, 289-294.
- `src/components/events/EventsView.tsx` — `[filtersOpen, setFiltersOpen]` line 85; `[activeCategories]` line 88; filter drawer renders below.
- `supabase/functions/_shared/category-interests.ts` — full file.
- `supabase/schema.sql` lines 85-92 + 248-258.
- `supabase/migrations/052_categories_consolidation.sql` — current DB seed reference.

## Windows shell reminders
- Prepend `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` to every command.
- Use `;` not `&&`.
- `create_file` fails on existing paths → `Remove-Item -Force` first.
