# Technical Decisions

> Record of key technical choices and their rationale. Prevents future sessions from re-debating solved problems.

## MASTER_DIRECTION Batch 1 — Admin panel restructure

**Decision — `/admin/applications` is the canonical contributor review inbox; `/admin/contributors` becomes a redirect.** Per `MASTER_DIRECTION.md` FEAT-01, the admin entry surface is reorganised behind a single `/admin` dashboard with named sub-routes. The legacy `/admin/contributors` page is preserved as a `redirect("/admin/applications")` shim because the email approval/rejection deep-links sent by the contributor-application Edge Function point at `/admin/contributors/[id]` and at the parent index. The child `[id]` route still resolves directly (Next.js routes child segments past a parent redirect), so existing emails keep working.

**Why:** Renaming to `/admin/applications` makes the entry point self-describing (one of several admin tools), matches the new dashboard naming, and leaves room for `/admin/events`, `/admin/places`, etc. without re-introducing the "everything lives under /contributors" tangle.

**Decision — Approval continues to set `profiles.role = 'contributor'` (with `contributor_kind` as the sub-type), not "role to match `contributor_kind`".** The literal wording in `MASTER_DIRECTION.md` FEAT-01 reads "sets `role` to match `contributor_kind`", but the codebase has been on the simplified 3-role model (`citizen` / `contributor` / `admin`) since migration 033, with `ministry` / `organization` / `business` carried on `contributor_kind` as a sub-type column. The `approve_contributor_application` RPC and `review-contributor-application` Edge Function already implement this correctly.

**Why:** Reverting to ministry/organization/business as top-level roles would require schema rollback, regression-testing every RLS policy that references `is_admin()` / `is_contributor()`, and rewriting the contributor application flow. The 3-role + sub-type model is materially simpler and already shipped. We treat the doc wording as shorthand for "approval grants contributor privileges and preserves the requested kind".

**Decision — `/admin/reports` is retained (not renamed to `/admin/reported`).** Doc spec calls for `/admin/reported`; existing route is `/admin/reports`. Rename deferred — both work, and renaming a live admin route mid-batch invites broken email/bookmark links for negligible benefit.

**Decision — Admin guard remains inline per-page (5-line block: `getUser` → fetch `profiles.role` → `redirect("/events")`).** A `requireAdminPage()` helper in `src/lib/adminGuard.ts` was considered (currently only `requireAdmin` for route handlers exists). Deferred until at least one more admin page is added; the duplication is shallow and matches the pattern already used by `/admin/users`.

**Decision — Burger bar gets a single "Admin panel →" link, gated on `profile.role === "admin"`.** Per MASTER_DIRECTION D15 ("burger bar must not contain admin links"), but FEAT-01 also says admin users see an Admin Panel entry-point in their profile menu. The BurgerMenu component is both a filter drawer and a profile menu; the link is placed in the profile-actions section, not the filter section. Profile page also gets a duplicate admin link in the management section.

---

## Batch 3 (post-S3) — S2 + S3 nice-to-haves cleanup

**Decision — A single `DEFAULT_ICON_ID: CategoryIconId = "pin"` is the canonical fallback for every icon-helper in `src/lib/categoryIcons.ts`.** `getEventCategoryIcon`, `getPlaceCategoryIcon`, `getQuickAccessIcon`, and `getIconSvg` all terminate on it; `DEFAULT_CATEGORY_ICON` is re-derived from it.

**Why:** Eliminates the silent divergence the Architect flagged in Batch S2 (event helper fell back to `"church"`, place helper to `"pin"`, quick-access to a third literal). A single constant makes "what does this render when the slug is unknown?" answerable from one site and keeps future renames trivially safe.

**Decision — `QUICK_ACCESS_ICON_IDS` is reduced to native quick-panel pseudo-ids only.** The 6 keys are `bible-study`, `coffee`, `runs`, `churches`, `outreaches`, `care`. `getQuickAccessIcon(id)` composes the lookup top-down: `QUICK_ACCESS_ICON_IDS → EVENT_CATEGORY_ICON_IDS → PLACE_CATEGORY_ICON_IDS → DEFAULT_ICON_ID`.

**Why:** Pre-batch the map mixed three intent surfaces (quick-panel pseudo-ids, event slugs, place slugs), so renaming an event category required touching two maps and praying. Composition keeps each map single-purpose and lets the quick panel reuse event/place icons automatically when its `id` happens to be a real category slug. The terminal `?? DEFAULT_ICON_ID` guarantees the resolver always returns a valid `CategoryIconId` whose SVG is registered in `ICON_SVGS`.

**Decision — `getIconBySlug` is deleted.** Zero call sites in `src/**` (confirmed by grep before removal).

**Why:** Pure dead-code burndown. Keeping it would have invited future code to bypass the resolver chain.

**Decision — `WeekendChip` renders its icon as an inline JSX SVG component, not via `dangerouslySetInnerHTML` on `CALENDAR_DAYS_SVG`.** Path data is kept in sync with the registry constant via a JSDoc note on the inline component.

**Why:** This chip is rendered on every event card and on the calendar tooltip — three of the hottest render paths in the app. Inline JSX removes one `dangerouslySetInnerHTML` invocation from those paths (modest XSS-surface reduction even though the source string is a literal), gives React's reconciler a stable element to memoise, and avoids parsing the string at runtime on every render. The duplication is acceptable because a Lucide-bump test is the cheaper drift detector and the chip is the only consumer.

**Decision — The Weekend-only toggle in `BurgerMenu` uses `role="switch"` + `aria-checked` rather than `aria-pressed`.** Applied to the inner `<button>` element only; the outer container remains a passive `div`.

**Why:** `role="switch"` is the WAI-ARIA canonical pattern for a binary on/off filter; `aria-pressed` is intended for toggle-pressed buttons (e.g. "bold" in a rich-text toolbar) and screen readers announce it as a different affordance. The change is purely declarative — keyboard semantics (Space/Enter) carry over from `<button>`.

**Decision — `EventsView` wraps `onToggleWeekend` in `useCallback` with an empty deps array.** `setWeekendOnly((w) => !w)` uses the functional setter, so no captured state.

**Why:** Stable callback identity is a prerequisite for any future `React.memo` on `BurgerMenu` (which receives a large props bag and re-renders on every parent update today). Empty deps are safe because the only closure is `setWeekendOnly`, whose identity React guarantees stable.

## Batch 2 (post-S3) — EventDetailContent baseline-failure fix

**Decision — Fixture dates in test files that exercise temporal UI branches must be relative to `Date.now()`, not hardcoded ISO strings.** Applied to `src/__tests__/components/events/EventDetailContent.test.tsx`: `baseEvent.date` is now `new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()`. The two tests that need a past / in-session event already override `date` explicitly.

**Why:** The previous hardcoded `"2026-05-10T18:00:00Z"` quietly degraded into a past date once the wall-clock crossed it, routing every test that depends on the RSVP-availability branch into the "already started" copy. Relative-future fixtures self-correct as the calendar advances; explicit overrides handle the inverse case where a past date is the assertion under test.

**Decision — Locale assertions on rendered dates derive expected values from the same fixture instant, not from literal substrings.** The `"renders formatted date"` test now derives the expected month name via `new Date(baseEvent.date).toLocaleString("en-US", { month: "long" })` and matches against a case-insensitive RegExp.

**Why:** A literal `/may/i` check only happened to pass because the hardcoded fixture date fell in May. Deriving the expected month from the fixture itself keeps the assertion stable across relative dates, month rollovers, and any future renaming of the fixture window — and is strictly stronger than the substring check it replaces.

## Batch S3 — Weekend Derived Tag

**Decision — A weekend event is one whose UTC span overlaps Saturday (any time), Sunday (any time), or Friday from 17:00 UTC onwards.** Implemented in `src/lib/weekendTag.ts` as a UTC-deterministic per-calendar-day walk with a 366-day defensive guard.

**Why:** The Friday-evening cut-off matches how the South African (and most global) weekend social rhythm starts — typical weekend gatherings/services kick off Friday evening, not Friday morning. Picking 17:00 UTC (vs SAST 19:00 / America 12:00) keeps the rule timezone-neutral, deterministic, and trivially testable; it is also what we documented for the user-facing chip "Weekend" semantic. The 366-day guard exists only to defend against absurd input — real spans always short-circuit within 7 days.

**Decision — Weekend is a derived UI tag, not a database column.** Computed on-the-fly per event from `date` + `end_time` everywhere it is consumed (chip, calendar tooltip, filter, future API surfaces). No `is_weekend` column on `public.events`.

**Why:** Avoids a denormalised flag that drifts whenever an organiser edits `date`/`end_time` and avoids a trigger surface. The rule is cheap (≤7 iterations for any real event) and entirely declarative. If future personalisation needs server-side filtering, push the same rule into SQL using `extract(dow ...)` instead of a column.

**Decision — Weekend filter AND-combines with the category filter and is bypassed during free-text search.** Inside `EventsView.filtered`, `if (weekendOnly && !isSearching && !isWeekendEvent(e)) return false` runs after the category match check.

**Why:** AND-combine matches user mental model ("show me *only* my chosen categories *and only* weekend events"). Bypassing during search keeps free-text lookup exhaustive — users searching by name should never have results silently hidden by a passive toggle.

**Decision — Weekend chip uses an outline pill style (`border-[#D4AF37]/55`, transparent bg, text `#8B7500`), not a filled gold chip.** Decided by user before implementation.

**Why:** Sits visually alongside the filled category badge without competing for attention — the category badge is the primary classification; the weekend chip is a secondary affordance. Outline-only style also lets the chip render cleanly over coloured event cover images.

**Decision — Personalization `time_availability=weekends` contributes **no** category bump (S3 supersedes the S1 stopgap).** `src/lib/personalization/percentages.ts` returns `[]` for the `weekends` value with an explanatory comment.

**Why:** The S1 stopgap (`weekends → conferences-summits`) was an explicit hack pinned by `percentages.test.ts` precisely so its removal would be forced when S3 shipped. The chip + filter now deliver the user-visible value the stopgap was approximating, so artificially boosting an unrelated category is no longer justified. The pinned test was updated alongside the source change.

**Decision — FullCalendar's native `title` attribute is the weekend tooltip surface.** Set deterministically inside `eventDidMount` for every event (`"<title>"` or `"<title> — Weekend"`).

**Why:** FullCalendar exposes no custom tooltip primitive in the current usage, and we already avoid adding tooltip dependencies elsewhere. Setting the attr for *every* event (not only weekend events) prevents stale `— Weekend` suffixes when FullCalendar recycles event DOM across prop changes.

## Batch S2 — Lucide Icon Redraw

**Decision — `lucide-react` v0.441.0 is the canonical source of icon path data; the registry stores inline-SVG strings, not React components.** `src/lib/categoryIcons.ts` extracts path attributes verbatim from `node_modules/lucide-react/dist/esm/icons/*.js` and emits them as plain SVG strings sharing one `SVG_OPEN` envelope (24×24 viewBox, stroke=currentColor, stroke-width 2, round caps/joins).

**Why:** Map markers, badges, AI-search chips and the quick panel all render via `innerHTML`/string-template paths, not React JSX, because MapLibre marker elements are HTMLElement instances created outside React. Strings keep one canonical visual language without pulling React-only Lucide components into non-React render paths.

**Decision — 3 hand-authored custom SVGs (`praying-hands`, `soccer-ball`, `lollipop`) cover slugs Lucide does not ship cleanly.** All 24×24, currentColor strokes, structurally consistent with Lucide so temporal opacity / hover states inherit cleanly.

**Why:** Substituting nearest-neighbour Lucide glyphs (e.g. `HandsPraying` does not exist; `Smile` is wrong; `Cherry` for kids reads as fruit) would harm category recognition. Custom-authoring three glyphs is cheaper than the recognition tax. Replace with Lucide originals if/when they land.

**Decision — `SVG_OPEN` carries explicit `width="24" height="24"` + `xmlns` attribute.** Inline-SVG with only `viewBox` can fall back to the CSS2 default `300×150` intrinsic size inside a flex container in Chrome/Firefox/Safari edge cases. Explicit width/height matches what `lucide-react`'s React wrapper emits.

**Why:** Map markers and badge surfaces size their `<span>` wrapper, not the SVG itself, via inline pixel styles. Without explicit dimensions the glyph could render oversized on first paint depending on browser layout pass. Architect flagged in S2 audit; applied inline before commit.

**Decision — `weekend-tag` is an alias of `calendar-days` via a shared `CALENDAR_DAYS_SVG` constant.** Listed in the `CategoryIconId` union but no production consumer yet.

**Why:** Staged ahead of Batch S3 (weekend derived tag) so the chip can render immediately when S3 wires up the time filter. Single source of truth (the shared constant) prevents glyph drift if either ID is consumed.

## Batch S1.1 — Categories Refinement v2 Follow-ups

**Decision — `entertainment` legacy slug maps to `social-gatherings`, not `arts-culture`.** Migration 064 step 2 (text remap) and step 6 (FK remap CTE) both route the legacy `entertainment` slug to `social-gatherings`. Confirmed by user.

**Why:** The original migration draft routed `entertainment → arts-culture`, but live event content under that slug skews social (parties, mixers, gatherings) rather than artistic (concerts, performances). Routing to `social-gatherings` preserves user intent post-migration.

**Decision — Migration step 2b fail-fast unmapped-slug guard.** New `do $$ ... select string_agg(distinct category) into unmapped from public.events where category not in (whitelist); if unmapped is not null then raise exception ...` block sits between the text remap and the CHECK constraint swap.

**Why:** A future legacy slug we forgot to enumerate would otherwise silently fall through the `case` and either fail the new CHECK constraint with a generic message or get coerced to default. Explicit naming of the offending slug(s) in the exception message saves a debugging session.

**Decision — `events.category_id` FK uses `on delete set null`.** Now matches `places.category_id`. Previously had no `on delete` clause (defaulted to `no action`).

**Why:** Symmetric behaviour with places; deleting a category should not block deleting the row, and detaching is the safer default than cascade.

**Decision — Edge Function `CATEGORY_INTEREST_MAP` parity is enforced by a runtime test, not TypeScript.** `src/__tests__/lib/category-interests.test.ts` reads the Deno source file via `readFileSync(process.cwd())`, strips comments, regex-extracts top-level keys, asserts all 17 canonical slugs present + no extras + exactly 17 keys.

**Why:** `supabase/functions/` is intentionally outside the main `tsconfig.json` include (Deno runtime, separate type world). A static import would fail TS2307. The runtime parse is backstopped by the exact-count assertion, so any structural drift (renamed export, nested object shape, missing/extra key) fails loudly. False-pass paths are eliminated by comment-stripping before regex.

**Decision — S1 weekends-stopgap is pinned by a deliberately fragile test.** `percentages.test.ts` asserts `time_availability=weekends → conferences-summits > 0`. When S3 introduces the proper `weekendOnly` derived tag and removes this mapping, the test fails on purpose.

**Why:** Documents the temporary coupling between the personalization engine and the taxonomy so it cannot be silently forgotten when S3 ships.

## Batch S1 — Category Refinement v2 (Taxonomy)

**Decision — 17 event-applies + 10 place-applies categories are the canonical taxonomy.** `EventCategory` slugs: `worship-prayer`, `church-services`, `outreach-missions`, `markets-expos`, `sport-recreation`, `arts-culture`, `social-gatherings`, `community-upliftment`, `education-equipping`, `marriage-family`, `mens-community`, `womens-community`, `youth-students`, `kids`, `care-recovery`, `members-only`, `conferences-summits`. `PlaceCategory` slugs: `churches-ministries`, `hospitality-cafes`, `recreation-sport`, `media-broadcasting`, `retail-shopping`, `health-wellness`, `education-training`, `arts-creative`, `christian-businesses`, `safe-spaces`. Default fallback for missing event categories is `church-services`.

**Why:** Old 16-slug union mixed inconsistent verbs/scope (`equip`, `weekend`, `care`, `recovery`, `social-fun`). Merging `education+equip → education-equipping` and `care+recovery → care-recovery`, splitting worship from services (`worship-prayer` vs `church-services`), and renaming `weekend → conferences-summits` lets us reintroduce Weekend later as a derived tag (S3) computed from event date rather than a category. Two-word place slugs (`churches-ministries`, `hospitality-cafes`, …) align with event slugs, removing ambiguity between events and places that previously shared single-word slugs like `church`.

**Decision — Weekend stays a derived tag, not a category.** Old `weekend` event slug is dropped. S3 will introduce `isWeekendEvent()` + `<WeekendChip />` + filter toggle so weekend filtering works across every category.

**Why:** Categories should describe what an event *is*; Weekend describes *when* it happens. Mixing the two forced organisers to choose between thematic accuracy and discoverability.

**Decision — Migration 064 ships in-repo before being applied.** `supabase/migrations/064_refine_categories_v2.sql` is committed, idempotent, and contains the full old→new slug remap for `events.category`, `events.category_id`, `places.category_id`, plus the 27-row `categories` seed and `events.category` `CHECK` constraint swap. Application to remote DB happens via `mcp_supabase_apply_migration name:"refine_categories_v2"` in the next session (Supabase MCP tools were not loaded this session).

**Why:** Code and migration must travel together so a fresh checkout + `psql -f migration` reproduces the same state. Deferring application keeps the commit honest about what's been verified live without blocking the code refactor on tool availability.

**Decision — `getIconBySlug()` provides back-compat slug lookups.** Database rows can carry arbitrary slug strings (e.g. user-set `marker_icon`); a single helper falls back through event icons → place icons → quick-access icons → `church` default.

**Why:** The TypeScript `EventCategory`/`PlaceCategory` unions are tight, but DB strings aren't. Centralising the lookup avoids ad-hoc casts at every render site.

## Batch R — Category Icons + Media Gallery Architecture

**Decision — Category/search icons live in one typed registry.** `src/lib/categoryIcons.ts` is the canonical SVG source for map event markers, place markers, quick-access buttons, and AI search intent groups. The registry maps concepts, not every synonym: canonical event/place categories get direct icon IDs, quick-access items reuse those IDs, and `SEARCH_INTENT_ICON_IDS` maps every `ALL_TAGS` slug to the nearest icon intent.

**Why:** Duplicating inline SVG strings across marker builders and quick panels made icons drift and left AI search taxonomy coverage untestable. A single registry keeps visual language consistent while coverage tests catch future category/search-tag additions that forget an icon.

**Decision — Media galleries are entity-generic, with event compatibility wrappers.** Shared upload/view components live under `src/lib/mediaUpload.ts` and `src/components/media/*`. Existing event imports remain stable through thin wrappers in `src/components/events/MediaGalleryUploader.tsx` and `src/components/events/EventMediaStrip.tsx`.

**Why:** Events already had gallery behavior, while places needed the same capability. Generalising at the entity/table/bucket boundary avoids two diverging implementations and keeps future entities able to adopt the same pattern without rewriting preview, compression, lightbox, or upload code.

**Decision — Place media uses `place_media` + `place-images`; storage paths are owner-scoped.** Place covers upload to `place-images/{user.id}/covers/...`; gallery media uploads to `{user.id}/gallery/places/{placeId}/...`. `place_media` stores public object URLs and metadata. The bucket is public, but the broad `storage.objects` SELECT policy is dropped; public object URLs do not require enabling bucket listing.

**Why:** Place covers previously used the event image bucket, which blurred ownership and policy intent. Storing public URLs in `place_media` lets the app render galleries without listing storage objects, and avoiding a broad storage SELECT policy removes the public-bucket listing advisory.

**Decision — Event media writes are owner/admin scoped; legacy uploader delete is preserved.** `event_photos` INSERT/UPDATE require the event owner or admin. DELETE allows event owner/admin or `uploaded_by = auth.uid()`.

**Why:** The previous insert policy let any authenticated user attach media rows to any event by setting themselves as uploader. Owner/admin-scoped writes close that hole. Delete retains an escape hatch for legacy uploader-owned rows without granting uploaders UPDATE rights that could retarget media metadata to another event.

**Decision — Contributor gallery remains URL-array based for now.** Contributor public profile galleries still come from `profiles.gallery_urls`, but the API now validates http/https URLs, normalises, dedupes, caps at six unique entries, and renders via `MediaStrip` in `plainImages` mode.

**Why:** Contributor galleries currently point at external public images and are not storage-managed by this app. Keeping the storage model unchanged avoids scope creep while still improving validation, UX, and display consistency.

---

## Batch Q — MapLibre marker click bubbling MUST be preserved

**Decision (permanent invariant) — Never call `e.stopPropagation()` on marker DOM elements.** Batch P introduced a `swallowMapCanvasClick(el)` helper that attached a click listener to every event/place marker calling `stopPropagation`, intending to keep the canvas-click handler from collapsing a cluster the user just drilled into. This silently broke marker popups: MapLibre's `Marker._onMapClick` (in `maplibre-gl/src/ui/marker.ts`) wires the popup toggle through the canvas-click handler. Stopping propagation on the marker means the popup toggle never runs.

**Correct pattern.** Inspect the click target inside the canvas handler instead:

```ts
const SKIP_COLLAPSE_SELECTOR =
  ".cc-marker, .cc-place-marker, .cc-geo-cluster, .maplibregl-popup";
map.on("click", (e) => {
  if (expansionsRef.current.size === 0) return;
  const target = e.originalEvent?.target as Element | null;
  if (target?.closest?.(SKIP_COLLAPSE_SELECTOR)) return;
  collapseInnermostTierRef.current();
});
```

This was shipped by remote PR #31 (`21cee62`, merged as `85a8456`) which superseded Batch P's `swallowMapCanvasClick` helper. The helper has been removed from `src/lib/map/markers.ts` and Batch P invariant #4 ("Marker elements must `stopPropagation` on click") is **retracted**. Future agents: if you re-introduce stopPropagation on marker DOM, popups will silently stop working everywhere (markers, places, contributor pins, future POI types).

**Decision (refactor) — `fetchPendingApplications` shared helper.** `/admin/users` and `/admin/contributors` both query `contributor_applications` with the same FK alias (`profile:profiles!contributor_applications_user_id_fkey(...)`) and map to the same `PendingApplication` view. Drift between them caused the original bug Batch P fixed (one used `.single()`, the other `.maybeSingle()`). Helper centralises the select string + row mapping in `src/lib/contributors/pendingApplications.ts`. Returns `{message}` only — never leaks the Supabase error shape across the route boundary.

**Decision — Migration 063 reshape to `do $$ … if not exists … end $$;`.** The original `drop policy if exists … create policy …` form was correct but technically dropped/recreated the policy each migration apply on a clean DB. Reshape makes the migration a strict no-op when the policy already exists, matching how Supabase's `db push` is expected to be re-runnable.

---

## Batch P — Admin profile RLS + staged cluster collapse

**Decision 1 — Admin UPDATE RLS policy on `public.profiles`.** Admin role/contributor mutations going through `PATCH /api/admin/users` were silently no-op'ing because `public.profiles` only had a self-update policy (`auth.uid() = id`). PostgREST returns success with zero rows updated when RLS filters every row, with **no error**. Migration 063 adds an explicit `Admins can update any profile` policy gated by the existing `public.is_admin()` SECURITY DEFINER STABLE function. The PATCH endpoint also now selects the updated row id and returns HTTP 500 on zero rows as defense-in-depth, with a generic client message and a detailed `console.error` so the regression cannot recur silently.

**Why not service role?** The codebase has a hard rule: never use service-role keys on server routes when an RLS policy can express the intent. `is_admin()` already exists; adding the policy is the correct minimal fix and keeps every admin mutation auditable through Supabase's regular auth/RLS pipeline.

**Decision 2 — Staged one-tier-per-click cluster collapse + universal multi-expand.** Original behaviour: capital and town tiers were single-expand (opening one collapsed siblings); outside map-click collapsed everything. This conflicted with the new "all clusters multi-expand" spec and produced a UX bug where interacting with an event marker inside an open suburb collapsed the whole drill-down stack.

Resolution:
- Every tier (capital / town / suburb) now multi-expands. The user explicitly drilled in; the platform should not undo their work.
- Outside map-canvas click no longer calls `collapseAllExpansions`; it calls `collapseInnermostTier()` which collapses only the tier closest to the user's most recent decision (priority `suburb → town → capital`). One click per tier, mirroring the way they drilled in.
- ~~Event and place marker DOM elements `stopPropagation` on `click`, so interacting with a marker never bubbles to the canvas-click handler.~~ **Retracted in Batch Q.** See top entry — stopPropagation breaks MapLibre's popup toggle. The canvas handler now filters via `e.originalEvent.target.closest(SKIP_COLLAPSE_SELECTOR)` instead.
- Zoom-band changes only collapse on **zoom-OUT** across a tier boundary (rank comparison via `BAND_RANK` module const, hoisted in Batch Q).

This makes recoupling deterministic and reversible: the user always knows what one map-click will close.

---

## Batch O.1 — Hide individual markers below zoom 12 (hard threshold)

**Decision:** `markerOpacityAt(z) = z >= 12 ? 1 : 0` — a hard threshold with no crossfade. Below zoom 12 every individual event + place marker is `visibility: hidden` unless either (a) the point sits inside a currently-expanded suburb cell (lift bypass), or (b) filters / places-mode are active (explicit user intent). At zoom ≥ 12 markers are fully visible and bubble tiers fade to 0.

**Why:** The original smooth-crossfade model (markers fading in 11→12 while the suburb tier faded out) made individual markers read as ghosted smudges behind the totalling bubbles at city zooms, even when no expansion was open. Users reported the feature "works well, but only after activating decoupling and recoupling" — i.e. the implicit visibility was cluttering the map. A hard threshold gives the totalling bubbles unambiguous ownership of city zooms, matches the mental model of "zoom in to see individual pins", and keeps suburb-expansion as the single well-understood mechanism to reveal specific markers before the natural zoom threshold.

**Tier bands:** capital 4–7, town 8–10, suburb 11, markers 12+. Suburb collapses to a single-zoom core because the spec calls for suburbs at exactly zoom 11.

**Trade-off:** Below zoom 3 the map shows no tiers and no markers (capital fade-in begins at 3). Acceptable because the default initial zoom is 12 and restored-view / flyTo paths never land below 8. A `minZoom: 3` on the map config would make this unreachable; logged as a follow-up nice-to-have.

## Batch O — Map bubble split / recouple model (3 tiers)

**Decision:** Map clustering uses three tiers (capital 4° / town 0.4° / suburb 0.05°) bound to zoom bands (capital 0–5, town 6–8, suburb 9–11) with markers fading in 11→12. Clicking a bubble splits it into its child tier in place rather than zooming the camera. Capital/town clicks single-expand (close prior siblings of the same tier); suburb clicks multi-expand (stack). Suburb expansions do not spawn child bubbles — they "lift" the underlying event/place markers within the suburb cell to full opacity / `z-index: 20`. Recouple is triggered by outside map-click, document-level Escape, zoom-band crossing, or clicking the same expanded bubble.

**Why:** "Click bubble = camera ease in 2 zoom levels" was disorienting on dense maps and poorly matched user mental models for "what's actually inside this group?". Split-in-place keeps spatial context, lets users compare neighbouring groups without losing their place, and reads as a direct manipulation. Single-expand at capital/town avoids visual chaos when the whole map is dotted with parents; multi-expand at suburb is fine because suburbs are local. The lifted-marker path at suburb tier (rather than spawning yet another bubble layer) is cheaper and matches the "close enough to read individual pins" intent of zoom 9–11.

**Source of truth:** `expansionsRef: Map<bucketKey, ExpansionState>` in `EventMap.tsx`. Bucket keys come from `bucketKeyOf(tier, lat, lng)` in `clustering.ts` — pure grid math, stable across re-renders.

**Trade-off:** Capital/town child bubbles are computed once at expand time, so a Supabase data refresh while an expansion is open would leave them stale. Mitigated by collapsing all non-suburb expansions whenever the `events` / `places` identity changes (suburb expansions self-heal via the lifted-marker pass that re-runs over the fresh marker refs). Cheap and correct; trades a brief recouple animation against the complexity of diffing child markers against a fresh point set.

## Batch E — Force-Reauth on Role Change (migration 057)

**Decision:** A DB trigger (`on_role_change_side_effects`) stamps `profiles.force_reauth_at = now()` on every role mutation. Middleware compares this timestamp against the access-token `iat`; if the token predates the bump (or we cannot establish `iat` at all), we `auth.signOut()` and redirect to `/login?reauth=1`.

**Why:** Role claims live in the JWT. Without forcing a fresh login, a demoted admin keeps their privileged session until natural expiry. We chose DB trigger + middleware check (rather than server-side revocation) because it requires no Supabase Admin API access from the runtime and no realtime channel — every authenticated request already touches middleware. Fail-closed on parse/lookup errors is deliberate: an unverifiable state must not leak privilege.

**Trade-off:** Every authenticated request pays one `profiles` row read. Acceptable for current scale; if latency becomes a concern we will cache via JWT `app_metadata` refresh or a signed cookie invalidation scheme.

## Batch E — Contributor Bio-Setup Gate (middleware allow-list)

**Decision:** When a citizen is promoted to contributor, `bio_setup_required` is set to `true` by the same trigger. Middleware enforces a redirect to `/contributor/setup` for any path NOT in `BIO_SETUP_ALLOW`. The setup API clears the flag on success.

**Why:** We want every new contributor to have a minimum-viable public profile before they can browse or create. Enforcing at middleware (not per-page) makes it impossible to route around. Keeping the flag on `profiles` (not a separate table) avoids an extra join and lets the trigger set it atomically with the role change.

## Batch E — Last-Admin Lockout in SQL (migration 059)

**Decision:** Added a `BEFORE UPDATE OF role / BEFORE DELETE` trigger `enforce_at_least_one_admin` that raises `P0001` if the change would leave zero admins. The JS preflight in `PATCH /api/admin/users` stays as a UX-friendly preflight; the trigger is the authoritative race-proof guard.

**Why:** The JS-layer check was TOCTOU-racy under concurrent demotion. Moving the invariant to the database closes the race regardless of caller (API route, future migration, admin CLI, service-role misuse).

## Batch F — Dual-Admin Approval Enforced in SQL (migration 058)

**Decision:** Elevating any user to `role='admin'` no longer happens inline. `PATCH /api/admin/users` inserts a row into `pending_admin_elevations`; a *different* admin (or the same admin after a 24-hour cooling-off when they are the sole admin) must call `approve_admin_elevation(uuid)` to flip the role. The rule is enforced inside the RPC (not in JS). Rejection is via `reject_admin_elevation(uuid, text)`.

**Why:** Admin is the highest-privilege role. A hardcoded JS bypass ("allow if env var X is set") has been explicitly rejected — it would re-introduce exactly the class of backdoor this batch is meant to eliminate. RPCs raise `P0001` for rule violations, `P0002` for not-found, `42501` for non-admin caller, `28000` for unauthenticated. The API maps these to `400`/`404`/`403`/`401`. A unique partial index `where status='pending'` guarantees idempotent queueing (duplicate → `23505` → 409).

**Trade-off:** A solo admin must wait 24 hours to elevate a second admin. This is intentional — it gives time for an alert to be noticed if the admin account was compromised. Emergency escape hatch if needed in future: a superuser-only SQL migration, which leaves an audit trail.

## Batch G — Contributor Admin-Notification Email: Deferred to DB Webhook

**Decision:** When a user applies to become a contributor, we do NOT send an email to admins inline on the request path. The email delivery is deferred to a future Supabase DB webhook (or pg_cron job) listening on `contributor_applications` inserts.

**Why:** Inline email sending couples the contributor-apply API's success to an external SMTP dependency, increases tail latency, and requires the server to hold SMTP credentials. A webhook/cron pattern (a) keeps the user-facing API fast and reliable, (b) centralises SMTP credential scope in a single Edge Function, and (c) gives us natural batching/retry semantics. The in-app admin notification is already delivered synchronously.

**Trade-off:** Admins are notified in-app immediately but may see the email with a few minutes of delay once the webhook ships. Acceptable — this is not a user-facing latency.

## Progressive Geo-Clustering (Batch C)

### Client-side clustering v1 with fixed lat/lng grid; server RPC deferred to v2
**Decision:** `src/lib/map/clustering.ts` is a pure client module. Events + places are bucketed into fixed-degree grids per tier (`capital=4°`, `city=1°`, `town=0.2°`, `suburb=0.05°`) computed on the client from the already-fetched event/place lists. `bucketPoints` is O(n) over the current dataset.
**Why:** v1 is delivered against the current scale (dozens–hundreds of points) with zero backend work, zero new queries, and no migration. A server-side RPC (e.g., PostGIS `ST_SnapToGrid` aggregated by zoom) would add round-trip latency and require a new fetch on every zoom band change. For current data volume, the client bucketing cost is well under a frame (<1 ms in tests). When the map starts surfacing thousands of points across SA we will add a Supabase RPC variant and swap the call-site in `rebuildGeoClusters` behind a size threshold; the pure module's interface (`ClusterPoint[] → ClusterBubble[]`) is designed for that drop-in.
**Trade-off:** Fixed-origin grid means a point near a cell boundary (e.g., Johannesburg straddling a `capital` cell edge) can split across two bubbles. Acceptable for v1; the server variant will use offset grids or admin-region snapping.
**Date:** Batch C.

### Zoom thresholds 0–6 / 6–9 / 9–12 / 12–15 / 15–16 (user-selected "Stretched" option)
**Decision:** `TIER_BANDS` in `clustering.ts` uses `capital 0–5`, `city 6–8`, `town 9–11`, `suburb 12–14`, markers fade in 14 → 15.5 (full by 15.5). Each band has a 1.5-zoom smoothstep crossfade.
**Why:** User explicitly chose the "Stretched" option (vs. "Tight" or "Dense") because most organic exploration in SA happens between zoom 10–14 (town + suburb), so those bands are the widest. The crossfade width (1.5) matches the shortest band, preventing any band from being invisible even briefly.
**Date:** Batch C.

### Every bucket becomes a bubble, even singletons
**Decision:** `rebuildGeoClusters` does NOT skip `count === 1` buckets. A lone event in its own grid cell still renders a bubble.
**Why:** Initial design suppressed singletons (reads like "why is there a '1' badge on a single marker?"). Review found a severe bug: at zoom 12–14, individual markers are already faded out by `markerOpacityAt`, so a suppressed-singleton bubble left the point **invisible** — an isolated rural event literally disappeared from the map for three zoom levels. Ugly bubble > missing point. At zoom ≥14.5 both the bubble and the underlying marker are crossfading, the bubble is nearly transparent, and the effect reads fine.
**Date:** Batch C.

### Composed opacity: `temporal × markerOp`, stashed on `data-temporal-opacity`
**Decision:** At marker creation (event + place), EventMap writes `el.dataset.temporalOpacity = String(temporal.opacity)` and `el.style.transition = "opacity 160ms linear"`. `applyComposedOpacity(el, markerOp)` reads the dataset value back and writes `String(t * markerOp)` (or clears to `""` when both are 1).
**Why:** Without this, the clustering layer's marker-fade clobbered the temporal style (past events rendered at the same opacity as live ones during tier handover zoom 14 → 15.5). Stashing on a data attribute avoids a recompute on every zoom frame. Writing `transition` once at creation (rather than per RAF) kills style-churn and removes a subtle latency source where deconfliction tried to mutate opacity inside a 160 ms transition.
**Date:** Batch C.

### Clustering disabled when filters or placesMode active
**Decision:** `rebuildGeoClusters` early-returns and clears all bubbles when `placesModeRef.current` or any `activeCategoriesRef.current` / `activePlaceCategoriesRef.current` is non-empty. `updateGeoClusterOpacity` mirrors this: when filters are active it resets marker opacity to unfiltered state and returns before applying `markerOp`.
**Why:** Clustering is a **discovery** affordance — "where in the country is stuff happening?". Filters are an **intent** affordance — "show me exactly these." Composing them produces confusing UI (bubble counts that don't match filtered marker counts; hidden markers users expected to see). The bail-out in `updateGeoClusterOpacity` is the fix for the first-attempt bug where opacity fade ran regardless of whether bubbles existed, hiding all filtered markers at zoom ≤14.
**Date:** Batch C.

### Icon shrink −20% paired with clustering
**Decision:** `BASE_SIZE` 40 → 32, all place marker + icon sizes scaled to match.
**Why:** With clustering bubbles now taking over at mid-zoom (28–56 px), the old 40 px pins felt redundant and crowded. 32 px keeps individual markers readable at high zoom without competing visually with cluster bubbles at mid zoom. 20 % was the user-requested quantum.
**Date:** Batch C.

## MapTiler Style Verification & Logout Flow (Batch M)

### Dev-only `MapStyleDebugBadge` gated by `NODE_ENV === "development"`
**Decision:** `src/components/map/EventMap.tsx` renders a small bottom-left overlay with the active MapTiler source + style UUID, visible only in dev (`process.env.NODE_ENV === "development"`). Production and test environments render nothing.
**Why:** Previous attempts to swap the MapTiler Cloud style had "no visible effect" reports. Cache-busted rebuilds, `.env.local` reloads, and MapLibre style-loading order all make silent-fallback bugs hard to detect by eye. The badge reads directly from `getMapStyleInfo()` (pure function over the same ENV used by `getMapStyle()`), so if the badge says `maptiler / 019dba0f…` the runtime is unambiguously using that Cloud style. If it says `carto-raster`, MapTiler failed to load (key/network). The `=== "development"` gate (rather than `!== "production"`) is the stricter form: it excludes `"test"` and avoids polluting Vitest component snapshots. Next.js 15 DefinePlugin inlines `process.env.NODE_ENV`, so the badge + `MapStyleDebugBadge` component are dead-code-eliminated from the production client bundle.
**Date:** Batch M.

### Logout from `/events` shell pushes `/` before refreshing
**Decision:** `EventsView.handleLogout` calls `router.push("/")` **then** `router.refresh()`. Navbar's `handleLogout` already did this; the events-shell path did not.
**Why:** `router.refresh()` alone re-renders the current segment (`/events`) with a now-signed-out session; the user briefly sees an authenticated shell frame before middleware resolves, and has no visible path back to login / guest landing. Push-then-refresh navigates first (queued client-side transition) and refresh invalidates the RSC cache so the landing page renders with the new session. `window.location.assign("/")` was considered as a hammer but rejected for now — it's a full reload and only worth it if stale singleton subscriptions (e.g., NotificationBell realtime channel) are observed leaking.
**Date:** Batch M.

## Batch N — Event → Organiser Flow, Multi-venue Profiles, 6-org Seed (migrations 060, 061, 062)

### Multi-venue contributor profiles are additive, not a replacement for `profiles.physical_*`
**Decision:** `contributor_locations` (migration 060) is an additive table. The profile's own `physical_address` / `physical_latitude` / `physical_longitude` remain authoritative for the **primary** venue; `contributor_locations` holds any **additional** venues (e.g. U-Turn's Roeland Street café + Claremont charity shop). The UI ("Find us" block in `ContributorPublicProfile`) renders the primary first, then the extras by `sort_order`.
**Why:** Most contributors have a single venue; forcing a join for every profile page would regress read latency and cost an extra RLS check. Making the new table additive keeps the common case on a single row and avoids a destructive migration of `profiles.physical_*` data. `ON DELETE CASCADE` on `profile_id` means extras disappear with the profile; no orphaned venues.
**Date:** Batch N.

### Seed via direct `auth.users` insert with bcrypt'd random password
**Decision:** Migration 061 inserts six seed organisations directly into `auth.users` with `encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf'))` and `email_confirmed_at = now()`. The `handle_new_user` trigger creates matching `profiles` rows. Profile enrichment happens in a subsequent UPDATE block.
**Why:** Alternatives (Supabase Admin API from a server route, or an Edge Function) couple seed data to runtime availability of service-role keys — unsuitable for a migration that must run on every environment (dev, CI, prod). Bcrypt of a random UUID nobody retains makes the account completely inert: cannot email-login, cannot password-reset to anything usable. Email domain `citizens.local` is RFC 6761 reserved (cannot collide with real inboxes or leak magic-link attempts). `is_super_admin=false`, `raw_app_meta_data` holds no elevated claims — the only app-level privilege is `contributor`.
**Date:** Batch N.

### Seed uses `ALTER TABLE … DISABLE TRIGGER USER` to set role/contributor_status directly
**Decision:** The profile-enrichment UPDATE block in migration 061 is wrapped in `ALTER TABLE public.profiles DISABLE TRIGGER USER; … ENABLE TRIGGER USER;`. Each UPDATE then explicitly sets `role = 'contributor'`, `contributor_kind`, `contributor_status = 'approved'`, slug, bio, socials.
**Why:** Two triggers block this path: (1) `handle_new_user` hardcodes `role = 'citizen'` and ignores `raw_user_meta_data.role`, so the initial profile row is always a citizen; (2) `protect_role_column` only allows `not_applied → pending` and `rejected → pending` transitions for non-admin / non-service-role callers, which rules out `not_applied → approved`. Disabling user triggers for the seed block is the narrowest possible bypass: transactional (rolls back with the migration), scoped to this block, and works because the Supabase MCP runs as the `postgres` superuser. A `SECURITY DEFINER` helper (e.g. `admin_set_profile_role`) was considered as a more portable alternative and logged as a nice-to-have for any future non-superuser migration runner.
**Date:** Batch N.

### Organiser link routes to `/c/<slug>` for approved contributors, else `/profile/<id>`
**Decision:** The "Organised by" link under event titles (`EventDetailContent`) resolves the destination from the `EventOrganiser` view-model: if `role === 'contributor' && contributor_status === 'approved' && contributor_slug`, route to `/c/<slug>`; otherwise route to `/profile/<id>`. `full_name` falls back to the string `"Organiser"` when null.
**Why:** The public contributor hub (`/c/<slug>`) is the richer experience (bio, socials, locations, past/current/future events). Non-contributors and unapproved contributors don't have a `/c` page yet, so falling back to the generic profile page is the only correct target. Gating on `contributor_status === 'approved'` prevents leaking a `/c/<slug>` URL for a rejected or pending contributor whose slug may have been reserved but whose public page may hide information.
**Date:** Batch N.

### Rating widget hidden for upcoming events
**Decision:** `EventDetailContent` wraps `<InlineEventRating />` in `{hasStarted && (…)}`. Reviews are only solicited after the event has started.
**Why:** Rating an event before it's happened is meaningless and was confusing attendees planning to come. Keeping the gate UI-only (not in the API) means a misbehaving client cannot surface the widget early but real ratings can still be written from moderation tooling if ever needed.
**Date:** Batch N.

### Seed `image_url` left NULL
**Decision:** All 30 seed events have `image_url = NULL`.
**Why:** Seeding real images would either (a) bake URLs into the migration pointing at a specific host, requiring that host to stay alive and widening CSP `img-src`, or (b) require populating the Supabase Storage bucket at migration time, which is brittle. `EventDetailContent` already handles `image_url = null` via conditional rendering; the feed card and map popup accept nulls too. No CSP change needed.
**Date:** Batch N.

### Split `FOR ALL` policy and add coord CHECK constraints (migration 062)
**Decision:** Migration 062 replaces the owner `FOR ALL` policy on `contributor_locations` with explicit `INSERT / UPDATE / DELETE` policies (public `SELECT` is a separate policy and unchanged), and adds `CHECK` constraints on `latitude` (±90) and `longitude` (±180).
**Why:** Applied inline from the Batch N architect review. Splitting the policy makes intent explicit — future work to make some locations private only needs to narrow the SELECT policy, not reason about an overlapping FOR-ALL. Coord CHECKs prevent garbage data from poisoning the map even if a non-UI caller writes through the owner write policy.
**Date:** Batch N.

### Note: live migration name mismatch for 061
**Decision:** On the live DB, migration 061 is recorded as `061_seed_testing_contributors_v2` because the first apply attempt aborted mid-way before the trigger-disable pattern was finalised. The canonical file on disk is `061_seed_testing_contributors.sql` and is idempotent (DELETE-then-INSERT), so re-applying under either name is safe. Future environments will use the disk name.
**Date:** Batch N.



### Direct insert on `/api/contributor/apply` instead of Edge Function proxy
**Decision:** `POST /api/contributor/apply` inserts the `contributor_applications` row directly through the caller's RLS-scoped Supabase client, then flips `profiles.contributor_status` to `pending`. The `submit-contributor-application` Edge Function is no longer invoked synchronously from this route.
**Why:** Previously the route proxied the full insert through the Edge Function so it could attach an admin email. Any deploy skew, missing Resend/HMAC secret, or Edge cold-start error surfaced to users as a generic "Something went wrong" and — critically — left no DB row, so applications were silently lost. Route latency and visible success should not be coupled to an external email provider.
**Trade-off / gap:** Admin email notification is **deferred** in this batch. Pending applications are still reviewable in the `/admin/contributors` inbox (reads `contributor_applications WHERE status='pending'`). When email notification returns, it should be wired as a Supabase DB webhook on insert (or a cron sweep), not reintroduced inline on the request path.
**Date:** Batch L.

### `events/loading.tsx` = neutral backdrop, not skeleton
**Decision:** The events-segment loading boundary renders an `aria-hidden` full-bleed `bg-white` div (no shimmer, no fade-rise) instead of a fade-rise skeleton or `return null`.
**Why:** On `/events/[id]` navigation the `@panel` parallel slot intercepts with `SidePanel`, which owns its own right-edge slide-in. A fade-rise skeleton played at the same time read as "a window drawing up from the bottom mid-way before settling into a side panel" — the exact glitch flagged in the Batch L bug list. `return null` fixed the glitch on intercepted navigation but flashed white on cold deep-links (no prior map paint). A neutral backdrop hides the cold-load flash while being visually inert behind the sliding panel.
**Date:** Batch L.

### Hash-based tab persistence on `/events/manage`
**Decision:** `MyEventsTabs` mirrors the active tab to `window.location.hash` (`#created` / `#joined`) via `history.replaceState` and reads it back lazily in `useState` initialisation + on `hashchange`.
**Why:** Deep-links to "show me the events I RSVPed to" are shareable without server-side routing changes, and `replaceState` keeps the browser back-stack clean (no per-tab-click history entry). Lazy state initialiser paints the right tab on first render, avoiding a hydration flicker from `"created"` → `"joined"`.
**Keyboard a11y:** Roving `tabIndex` (active=0, inactive=-1) + `ArrowLeft`/`ArrowRight`/`Home`/`End` move focus and activate, per WAI-ARIA tab pattern.
**Date:** Batch L.

## Tags & Discovery

### 5-tag cap per event, enforced at DB trigger level
**Decision:** Each event may have at most 5 `event_tag_assignments`. Enforced by a `BEFORE INSERT` trigger raising `event_tag_cap_reached` (P0001), surfaced as HTTP 409 by `/api/events/[id]/tags`.
**Why:** UX hygiene — encourages curation over hashtag spam. Trigger-based enforcement is race-safe vs. application-level pre-count which can be defeated by parallel requests.
**Date:** Batch K (migration 056).

### Tag hide vs delete: soft-hide only
**Decision:** Admin moderation toggles `event_tags.is_hidden=true` rather than deleting rows. Hidden tags are filtered from `GET /api/tags` and from public chip rendering, but historical `event_tag_assignments` rows persist.
**Why:** Preserves attribution history and avoids cascading deletion across past events. Reversible — un-hiding restores discoverability without backfill.
**Date:** Batch K.

### Tag slug regex: `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`
**Decision:** Slugs are 1-40 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens. `slugifyTag()` performs NFKD diacritic strip → lowercase → non-alnum→`-` → trim hyphens → 40-char slice → re-trim trailing hyphen.
**Why:** Matches PostgREST URL safety, avoids accidental empty/leading-hyphen slugs from punctuation-only input, normalises diacritics so `Café` and `Cafe` collide cleanly.
**Date:** Batch K.

### Post-event review prompt window: 1-25 hours after end
**Decision:** Daily cron `prompt-post-event-reviews` selects events whose end-time (or `date + 2h` fallback for date-only events) falls in `(now - 25h, now - 1h)`. Excludes attendees who already reviewed via Set-keyed `${event_id}::${user_id}`. Honours `event_reminders` notification preference.
**Why:** Single daily window catches every event exactly once with safety margin (1h post-end avoids in-progress events; 25h cap allows the cron to slip up to an hour without missing events). Pref filter respects user opt-out.
**Date:** Batch K.

### Citizen event quota: 30-day rolling window (UX banner)
**Decision:** `/events/new` server-component performs a server-side pre-check querying events created in last 30 days for the citizen and renders a glass-panel banner with the next-allowed date + CTA to `/contributor/apply` when limit hit. DB-level enforcement was already shipped in migration 037.
**Why:** Rolling window matches user mental model better than calendar month (which would let someone post 30 Jan + 1 Feb back-to-back). Pre-check is UX-only — RLS / server validation remains the security boundary.
**Date:** Batch K.

## Legal & Indemnity

### Platform-terms acceptance: client-side gate (not server-side blocker)
**Decision:** `TermsAcceptanceGate` is a client-mounted modal in the root layout that blocks UI until `profiles.terms_accepted_at` is set. API mutation routes (`/api/rsvp`, `/api/events`, `/api/places`, `/api/conversations`, etc.) **do NOT** additionally enforce terms acceptance server-side.
**Why:** Acceptance is treated as an onboarding UX step + audit artefact, not a hard precondition for every mutation. All mutations already require auth, and the gate intercepts on first authed visit. Adding a shared `requireTermsAccepted()` wrapper would bloat every route for a theoretical attacker who bypasses JS and accepts Supabase-auth-only access — but they still produce a `platform-terms-v1` signature row audit gap, not a legal exposure, because we hold the terms agreement gate as evidence of notice on first visit.
**Revisit if:** Legal counsel requires proof of acceptance timestamp preceding every event creation / RSVP — in which case promote to server-side middleware.
**Date:** Batch J (legal acceptance wiring).

### Partial unique indexes for platform-scope indemnity signatures
**Decision:** `indemnity_signatures` uniqueness is enforced via three partial unique indexes, not a single `UNIQUE(template_id, user_id, event_id, place_id)` constraint.
**Why:** Postgres defaults to `NULLS DISTINCT`, meaning a composite UNIQUE with nullable columns permits multiple rows where the nullable columns are NULL. The platform terms signature has both `event_id` and `place_id` NULL, so the blunt UNIQUE would allow duplicate platform acceptances. Partial indexes scoped by `WHERE event_id IS NULL AND place_id IS NULL`, `WHERE event_id IS NOT NULL`, and `WHERE place_id IS NOT NULL` produce the correct semantics.
**Date:** Migration 055.

### Attendee participation waiver: `required=false`, UI-enforced per-user
**Decision:** `attendee-participation-waiver` template is seeded with `required=false` so it does not appear in the organiser's `EventFormWithIndemnity` gate (which filters `applies_to=events AND required=true`). Instead, `RSVPButton` calls `/api/indemnity/template?slug=attendee-participation-waiver` before the first RSVP and opens `AttendeeWaiverModal` if `hasSigned=false`.
**Why:** Attendees should sign once across all events, not be prompted every RSVP; organisers should not see the attendee waiver in their creation flow.
**Note:** `hasSigned` in `/api/indemnity/template` is intentionally scoped globally per (template_id, user_id) — ignoring event/place — to support this once-per-user semantics.
**Date:** Batch J.

## Architecture

### Raw Leaflet API (not react-leaflet)
**Decision:** Use `L.map()`, `L.marker()` directly in `useEffect` with `useRef`.
**Why:** react-leaflet breaks under React 18 Strict Mode — double-mounting causes "Map container is already initialized." Raw Leaflet with `map.remove()` cleanup is the only reliable pattern.
**Date:** Early development.

### Server Components + Client Components split
**Decision:** Pages are async Server Components that fetch data. Client interactivity in `src/components/` with `"use client"`.
**Why:** Next.js 15 App Router default. Keeps data fetching on the server (faster, secure), client bundles small.

### Supabase dual-client pattern
**Decision:** Two separate client factories — `server.ts` (async, cookies) and `client.ts` (sync, browser).
**Why:** Supabase SSR package requires cookie access for server-side auth. Using the wrong client causes auth failures or hydration mismatches.

### FullCalendar (not custom grid)
**Decision:** Replaced hand-built month grid with `@fullcalendar/react` in Phase 4.
**Why:** Custom grid couldn't scale to week/day views. FullCalendar provides all 3 views, proper time rendering, event overflow, drag support, and accessibility out of the box.

## UI System

### 60/30/10 white-black-gold ratio
**Decision:** White surfaces (60%), black typography (30%), gold accents (10%).
**Why:** User-specified brand direction. Gold (`#c8a24f`) is the primary accent. No blue-primary patterns.

### Monochrome + Gold mature design (emoji-free)
**Decision:** Remove all emojis from UI. Replace with inline SVGs (icons) or Unicode glyphs (notification indicators). Category colors changed from rainbow to alternating white/grey palette (`#d4d4d4`–`#f5f5f5`). Event markers: black icon (#111) in 40px circle with gold (#D4AF37) outline. Place markers: bare gold SVG icon (28px, no bubble/background) with CSS drop-shadow. Calendar events: RSVP'd = gold background (#D4AF37), un-RSVP'd = white/grey CATEGORY_COLORS. Burger menu section icons in gold.
**Why:** User feedback: emoji + rainbow colors made the app "seem very child-like." Further refined: too much black in calendar → lighter white/grey palette with gold RSVP distinction. Place markers were hiding events → made smaller with no background. Monochrome + gold is mature, premium, and brand-consistent. No icon library added — all SVGs are inline for zero bundle cost.
**Date:** 2026-04-08 (refined from 2026-04-07).

### Map viewpoint persistence
**Decision:** Store map center + zoom in `sessionStorage` (`cc-map-viewpoint` key). Restore on remount; skip autoLocate and first fitBounds when a stored view exists.
**Why:** Users expect the map to stay where they left it when navigating to event details and back. Session-scoped (not localStorage) so it resets with a fresh tab.
**Date:** 2026-04-08.

### Place follows
**Decision:** `place_follows` table (user_id, place_id, UNIQUE) with RLS. API at `/api/place-follow` (POST/DELETE). `FollowPlaceButton` component with optimistic count.
**Why:** Users want to follow favourite places for future notification integration. Mirrors the user-follow pattern from Phase 8.
**Date:** 2026-04-08.

### Map-first full-screen events
**Decision:** `/events` is a full-viewport map with no page headers. All controls float.
**Why:** Google Maps-like experience for community discovery. The map IS the page.

### Floating controls over the map
**Decision:** Search bar, title chip, filter burger, and calendar toggle float above the map with `pointer-events-none` container + `pointer-events-auto` on interactive elements.
**Why:** Maximizes map viewport while keeping navigation accessible.

## Database

### RLS-first security
**Decision:** All tables use Row Level Security. Anon key is safely exposed.
**Why:** Supabase best practice. RLS policies enforce access at the database level regardless of client.

### Idempotent migrations
**Decision:** All migrations use `IF NOT EXISTS`, `DO $$ BEGIN ... END $$` blocks.
**Why:** Safe to re-run. Prevents deployment failures if migration runs twice.

### Auto-create profile on signup
**Decision:** PostgreSQL trigger `on_auth_user_created` creates a `profiles` row from auth metadata.
**Why:** Eliminates race conditions. Profile exists immediately after signup without a second roundtrip.

## Environment

### Local Next.js binary (not global)
**Decision:** Build with `.\node_modules\.bin\next.cmd`, never `npx next build`.
**Why:** Global Next.js 16 is installed on this machine. Project uses Next.js 15. `npx` may resolve the wrong version.

### PATH prepend every session
**Decision:** Run `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH` before any Node commands.
**Why:** Windows PowerShell doesn't persist PATH additions between terminal sessions.

### Repository-local Git identity lock (Citizens Connect)
**Decision:** For this repository, enforce local commit identity as Name = Citizens Network and Email = citizensnetworkpbo@gmail.com, with `user.useConfigOnly=true`, plus local hooks that block commits/pushes if identity or origin URL drift.
**Why:** Guarantees all edits, commits, and pushes are attributed to the Citizens Network owner account for this project, independent of global Git config.
**Ops Note:** This enforcement is clone-local (`.git/config` + `.git/hooks`) and is not versioned by Git. Re-apply after cloning to a new machine/clone.
**Date:** 2026-04-13.

### Pin Node runtime to 22.x
**Decision:** Pin project runtime using `.nvmrc` (`22`) and `package.json` engines (`>=20 <23`).
**Why:** Node 24 triggered unstable Next.js build behavior in this environment; Node 22 is the safer baseline for Next.js 15 here.
**Date:** 2026-04-05.

### styled-jsx for component-scoped CSS
**Decision:** Use `<style jsx global>` in map components for marker/cluster animations.
**Why:** Next.js includes styled-jsx by default. Avoids separate CSS files for small component-specific animations (like the live event pulse).

### Supabase secrets in `.env.local` only
**Decision:** Keep Supabase connection secrets in `.env.local` and never duplicate them in `.github/` continuity files.
**Why:** Preserves security while still allowing full project continuity through non-secret docs.
**Date:** 2026-04-05.

### Continuity-first workflow assets
**Decision:** Add reusable continuity assets (`.github/AGENTS.md`, continuity prompt, continuity agent) so tasks can resume from repository files without chat history.
**Why:** User should be able to delete conversations without losing execution context, process, or project memory.
**Date:** 2026-04-05.

### MCP-first migration execution
**Decision:** Use MCP migration tooling as the default path to apply Supabase migrations from this project instead of relying on local Supabase CLI runtime.
**Why:** Local environment instability (Node/CLI/terminal issues) should not block schema progress; MCP provides direct, verifiable migration application.
**Date:** 2026-04-05.

### Dedicated Supabase reconnect workflow
**Decision:** Maintain a reconnect runbook and a reusable reconnect prompt in `.github/`.
**Why:** Fast recovery from auth/env/schema linkage issues without depending on chat history.
**Date:** 2026-04-05.

## Phase 10: Notifications

### In-app + Push notification model
**Decision:** Store all notifications as in-app rows in `notifications` table. Push delivery via FCM is optional — if `FCM_SERVICE_ACCOUNT_JSON` is not configured, notifications are still stored in-app.
**Why:** Graceful degradation. Platform works without FCM credentials. In-app notifications via Supabase Realtime provide instant UX regardless.
**Date:** Phase 10.

### FCM HTTP v1 API (not legacy)
**Decision:** Use `https://fcm.googleapis.com/v1/projects/{project}/messages:send` with OAuth2 service account credentials.
**Why:** FCM legacy API (`fcm.googleapis.com/fcm/send`) was shut down June 2024. v1 is the only supported path.
**Date:** Phase 10.

### Notification digest preferences (instant/daily/off)
**Decision:** `notification_digest` column on `profiles` with three values: `instant` (push immediately), `daily` (batch at 7 AM), `off` (in-app only, no push).
**Why:** Respects user preference for notification frequency. Reduces notification fatigue while keeping in-app discovery.

### Edge Functions for notification triggers
**Decision:** Five Supabase Edge Functions handle notification dispatch: `notify-interested-users`, `notify-event-cancelled`, `send-rsvp-reminders`, `notify-new-follower`, `send-daily-digest`.
**Why:** Server-side processing keeps notification logic out of the client. Edge Functions run on Deno with service role key (bypasses RLS). Triggered by DB webhooks or pg_cron.

### Supabase Realtime for live notifications
**Decision:** NotificationBell subscribes to `postgres_changes` on `notifications` table filtered by `user_id`.
**Why:** Instant in-app notification delivery without polling. Requires Realtime publication enabled on the `notifications` table (Supabase Dashboard → Database → Publications).

### Shared push utility pattern
**Decision:** `supabase/functions/_shared/push.ts` accepts a Supabase client parameter instead of creating its own.
**Why:** Avoids duplicate client instantiation across Edge Functions. Each function creates one client and passes it through.

## Phase 11: Direct Messaging

### DM-only conversations (no group chat)
**Decision:** Conversations are strictly 1:1 between two users. The `find_conversation()` function deduplicates — same two users always share one conversation.
**Why:** Group chat adds UI/UX complexity out of scope. 1:1 covers the primary use case: attendee→organizer communication and user-to-user networking.
**Date:** Phase 11.

### Message body limit 2000 characters
**Decision:** `messages.body CHECK (char_length(body) BETWEEN 1 AND 2000)`.
**Why:** Prevents abuse (wall-of-text spam) while being generous enough for meaningful messages.
**Date:** Phase 11.

### Cursor-based message pagination
**Decision:** Messages API uses `?before=<message_id>` cursor pagination (not offset-based).
**Why:** Cursor pagination is stable under concurrent inserts — new messages don't shift pages. Offset pagination would cause duplicate/skipped messages during active chats.
**Date:** Phase 11.

### `updated_at` trigger for conversation ordering
**Decision:** A trigger on `messages` INSERT updates `conversations.updated_at` to `now()`.
**Why:** Inbox list orders by `updated_at DESC` — most recent conversations float to top without extra queries.
**Date:** Phase 11.

## Avoided Approaches

| Approach | Why Avoided |
|----------|-------------|
| react-leaflet | Strict Mode crash (double mount) |
| tailwind.config.js | Tailwind v4 uses CSS-based config |
| Service role key in client | Security risk — always use anon key + RLS |
| `useCallback` + `loadComments` pattern | Caused setState-during-render. Use inline fetch with `cancelled` flag instead |
| Global `<img>` elements | Lint warning. Use `next/image` for remote, `<img>` with eslint-disable for blob previews only |
| Annual email verification cron | Removed — email sending cost scales with user base. Community-signal verification (still_exists checkbox + auto-flag trigger) is sufficient for now |

## Agents & Automation

### 11-agent system (9 focused + 2 support)
**Decision:** Build an agent system with Architect, Testing, Refactor, Data, Community, Notification, Product Lead as new agents alongside existing UI, Schema Architect, UI Consistency Review, and Continuity Manager. Operations agent deferred until first 100 users.
**Why:** Prevents "vibe code collapse" — each agent enforces its discipline. Two layers: interactive VS Code agents for dev-time assistance + GitHub Actions CI for automated enforcement on every push.
**Date:** 2026-04-06.

### Architect absorbs Code Quality Review + API design
**Decision:** Merged code-quality-review.agent.md into a broader Architect agent covering architecture, security, performance, accessibility, and API design review.
**Why:** Three overlapping read-only reviewers (code quality, API, architecture) would cause confusion about which to invoke. One comprehensive Architect agent with a clear scorecard is cleaner.
**Date:** 2026-04-06.

### Community absorbs Growth
**Decision:** Growth/marketing scope merged into Community agent rather than a separate Growth agent.
**Why:** At current scale, SEO/OG/content strategy is community strategy. Separate growth agent would have too thin a scope. Can split later if marketing becomes complex enough to warrant it.
**Date:** 2026-04-06.

### Operations agent deferred
**Decision:** Don't create an Operations agent until first 100 users or first moderation incident.
**Why:** Moderation, support, and partnership agents need real operational data to be useful. Premature creation adds cognitive overhead without providing value.
**Date:** 2026-04-06.

### Vitest for testing (not Jest)
**Decision:** Use Vitest + @testing-library/react for unit/integration tests, Playwright for E2E.
**Why:** Vitest has better ESM support, is faster, and has official Next.js support via `next/vitest`. Playwright is lighter than Cypress with better multi-browser support.
**Date:** 2026-04-06.

### E2E tests local-only initially
**Decision:** Playwright E2E tests run locally via Testing Agent, not in GitHub Actions CI.
**Why:** E2E tests need a running Supabase backend. Mocking Supabase in CI is fragile. CI runs unit tests + typecheck + lint + build. E2E moves to CI when a dedicated test Supabase project is configured.
**Date:** 2026-04-06.

### Free-first infrastructure scaling
**Decision:** Optimize within free tiers first (indexes, caching, pagination). Upgrade to paid services only at measured thresholds (DB > 400MB → Supabase Pro, bandwidth > 100GB → Vercel Pro).
**Why:** No revenue yet. Every optimization within free tier extends runway. Upgrade triggers are documented so the transition is planned, not reactive.
**Date:** 2026-04-06.

## Security

### Platform Vision & Ecosystem Identity
**Decision:** Citizens is the parent brand/ecosystem. Citizens Connect is the flagship channel (events/discovery). Future channels: Citizens Wear (Christian fashion marketplace), Citizens Central (entity directory + collaboration hub), Citizens Impact (corporate social impact platform). Full vision documented in `.github/VISION.md`.
**Why:** Every feature decision must be evaluated against the ecosystem mission: restoring Kingdom unity, visibility, and collaboration. Cross-channel readiness should inform architecture choices. Feature evaluation criteria: does it increase visibility, connect siloed entities, highlight entity value, enable collaboration, serve discovery, and move toward ecosystem readiness?
**Date:** 2026-04-06.

## Phase 12: Security + Featured + Live Location

### In-memory sliding-window rate limiter
**Decision:** Custom in-memory rate limiter using a `Map<string, timestamps[]>` with auto-cleanup. Pre-configured limits: mutation (30/min), message (20/min), auth (10/min), heavy (5/min). All 429 responses include `Retry-After` header.
**Why:** No external dependency needed at current scale. Redis (Upstash) swap documented for multi-instance scaling. Sliding window is more precise than fixed window.
**Date:** Phase 12.

### CSP without unsafe-eval
**Decision:** Content-Security-Policy uses `'unsafe-inline'` (required by Next.js) but NOT `'unsafe-eval'` in production.
**Why:** `unsafe-eval` permits `eval()` and `new Function()` — effectively nullifies XSS protection. Next.js production builds do not require it. Longer-term: migrate to nonce-based CSP.
**Date:** Phase 12.

### Featured listings (polymorphic)
**Decision:** `featured_listings` table with polymorphic `event_id` / `place_id` references (exactly one must be set, enforced by CHECK constraint). Admin-only write, public read. Priority ordering.
**Why:** Featured panel needs to showcase both events and places. Polymorphic pattern with CHECK constraint is simpler than separate featured_events/featured_places tables. Admin control prevents user self-promotion.
**Date:** Phase 12.

### Live location with RSVP-enforced RLS
**Decision:** `user_locations` table with RLS INSERT/UPDATE policies that verify the user has an RSVP for the target event (not just `auth.uid() = user_id`). Coordinate precision truncated to 4 decimal places (~11m).
**Why:** The API validates RSVP, but RLS must also enforce it — the Supabase anon key is client-exposed, so direct inserts would bypass API checks. Precision truncation protects exact position (centimeter accuracy is unnecessary for event attendance).
**Date:** Phase 12.

### Location sharing opt-in model
**Decision:** `location_sharing` boolean column on profiles (default `false`). Users must explicitly enable sharing. Hook enforces minimum 15s tracking interval and stops polling on error.
**Why:** Location data is sensitive. Default-off respects privacy. Minimum interval prevents DoS. Error-stop prevents infinite retry loops.
**Date:** Phase 12.

### Idempotent migration policies
**Decision:** All RLS `CREATE POLICY` statements wrapped in `DO $$ BEGIN IF NOT EXISTS ... END IF; END $$;` pattern.
**Why:** Bare `CREATE POLICY` fails on re-run. Idempotent pattern is the established project convention (per supabase-patterns instructions).
**Date:** Phase 12.

### Vercel env vars for NEXT_PUBLIC_ Supabase config
**Decision:** Always set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Vercel environment variables (production + preview). Verify after every fresh deploy that JS bundles contain real URLs, not placeholders.
**Why:** `NEXT_PUBLIC_` env vars are inlined at build time. The client code has `|| "placeholder..."` fallbacks for prerender resilience, but if Vercel's build environment lacks the vars, the placeholders get baked into production bundles permanently, causing "Failed to fetch" on all auth operations.
**Date:** 2026-04-06.

### Auth callback route for PKCE flows
**Decision:** Add `/auth/callback` route that calls `exchangeCodeForSession(code)`. Password reset, email confirmation, and magic link flows all redirect through this route.
**Why:** Supabase uses PKCE by default for email-based auth flows. Without a callback route, the auth code in the redirect URL is never exchanged for a session.
**Date:** 2026-04-06.

### Diverse content identity (churches included, not dominant)
**Decision:** Connect's hero content is the full tapestry of Kingdom activity — outreaches, creative events, social gatherings, healing retreats, markets, education, church services, prayer meetings, and more. Churches are absolutely valued and present, but are one voice among many, not the dominant content. UI, categories, onboarding, and content strategy should reflect this diversity.
**Why:** The platform's distinctive value is making ALL Kingdom activity visible and discoverable. Every initiative matters equally. The richness comes from the variety.
**Date:** 2026-04-06.

### Equal service to all users
**Decision:** The platform serves organizers and non-organizers with equal dignity. No user or entity type is "first-class" — all are equally valuable Citizens. Non-Christians are welcome to discover the Kingdom too.
**Why:** The platform is a representation of the Kingdom, which serves all its Citizens equally. Organizers create the spaces; non-organizers find where they fit. Both roles are essential — neither is elevated above the other. The Kingdom's door is open.
**Date:** 2026-04-06.

### Event creation open to all users
**Decision:** ALL logged-in users can create events, not just vendors. Vendors get an extra "Book at Place" section in EventForm that allows inline place creation during event booking.
**Why:** User requested. Community Citizens should be able to add events. Organisers have the additional ability to create persistent places via the event booking flow. Place creation is now exclusively through the vendor event form (no standalone "Add Place" button in BurgerMenu).
**Date:** 2026-04-06.

### "Community Member" renamed to "Community Citizen"
**Decision:** The user-facing label for the `client` role is "Community Citizen" (was "Community Member"). DB role value remains `client`.
**Why:** User requested. Aligns with the Citizens brand identity — all users are Citizens.
**Date:** 2026-04-06.

### Places cannot be removed within 6 months
**Decision:** Places cannot be deleted within 6 months of creation. Only admin users can delete places. This is noted in the place creation UI.
**Why:** User requested. Prevents transient/spam place listings and preserves map data integrity.
**Date:** 2026-04-06.

### Navigation: title→map, Events→calendar
**Decision:** "Citizens Connect" title in both Navbar and EventsView links to `/events` (map home). "Events" link in Navbar goes to `/events?view=calendar`. EventsView reads `?view=calendar` query param for initial view.
**Why:** User requested. Provides clear navigation from non-map pages (event creation, profile) back to the primary map/calendar views.
**Date:** 2026-04-06.

### Scale as discovery signal (expected attendance)
**Decision:** Events should expose expected attendance size as a discovery filter. Equal platform dignity means a 5-person home group and a 2,000-person conference both appear and are findable — but users should be able to see and filter by expected scale to self-select the right setting.
**Why:** A large worship night and a small discipleship circle serve different needs. Hiding scale in the name of equity would actually harm discovery. Size is informational, not hierarchical.
**Date:** 2026-04-06.

### Admin role + owner-only mutations
**Decision:** Add `admin` role to profiles. All update/delete RLS policies check `auth.uid() = created_by OR is_admin()`. Regular users can only modify their own data.
**Why:** User observed that vendors could potentially modify other vendors' events. While RLS already enforced `created_by` checks, adding explicit admin bypass future-proofs moderation. The `is_admin()` helper function keeps policies clean.
**Date:** 2026-04-05.

### Community-driven place verification (no email)
**Decision:** Place verification relies solely on community "still exists?" signals in reviews. A DB trigger auto-flags places after 3+ negative signals. No email-based annual verification.
**Why:** Email verification edge function would cost money at scale. Community signals are free and self-sustaining. Owners can manually re-verify from the place detail page.
**Date:** 2026-04-05.

### Events INSERT RLS opened to all authenticated users
**Decision:** Dropped the `"Vendors can create events"` RLS policy (which required `role in ('vendor', 'admin')`) and replaced it with `"Authenticated users can create events"` (`auth.uid() = created_by`). Migration `012_open_event_creation` applied via MCP.
**Why:** After Phase 8.5 removed the vendor gate from `/events/new` UI, non-vendor users could reach the form but RLS blocked their inserts silently. Flagged in architect audit as critical security/functionality mismatch.
**Date:** 2026-04-06.

### Atomic conversation creation via SECURITY DEFINER RPC
**Decision:** Replaced the `find_conversation` + manual INSERT flow with a single `find_or_create_conversation` RPC that atomically finds or creates conversations. The conversation_participants INSERT policy was tightened from `auth.uid() is not null` (any user could join any conversation) to admin-only (all creation goes through the SECURITY DEFINER RPC). Migration `015_conversation_security`.
**Why:** Architect audit identified two critical issues: (1) TOCTOU race — concurrent requests could create duplicate conversations; (2) overly permissive RLS — any authenticated user could add themselves to any conversation.
**Date:** 2026-04-07.

### count_friends RPC for profile page
**Decision:** Added `count_friends(target_user)` Postgres function using a self-join on follows. Profile page includes it in the main `Promise.all` batch instead of a sequential waterfall.
**Why:** Profile page had a sequential await for bidirectional follow counting that depended on data from the first batch. The RPC eliminates the waterfall.
**Date:** 2026-04-07.

### Single useFocusTrap in hooks/ directory
**Decision:** Consolidated two focus trap implementations into one at `src/hooks/useFocusTrap.ts`. Deleted duplicate at `src/components/ui/useFocusTrap.ts`.
**Why:** Two different APIs caused confusion. The hooks/ version is superior — supports `active` toggle, previous focus restoration, and returns a ref.
**Date:** 2026-04-07.

### Font CSS variable renamed from --font-geist-sans to --font-montserrat
**Decision:** The `next/font` variable for Montserrat was renamed from `--font-geist-sans` to `--font-montserrat`. The `@theme inline` block in globals.css builds the full `--font-sans` stack from it.
**Why:** The old name was a leftover from the Next.js starter template (Geist font) and was misleading.
**Date:** 2026-04-07.

## UX & Map Behavior

### Map viewport locked after initial fitBounds
**Decision:** After the first `fitBounds` call (or sessionStorage restore), `hasRestoredView.current` stays `true` permanently. Category filtering, search, and other marker updates never call `fitBounds` — only the initial load or explicit `flyTo` prop can move the camera.
**Why:** Users expect the map to stay where they positioned it when toggling filters. Auto-zooming to fit filtered results destroys spatial context. Aligns with Google Maps convention: filtering is a data operation, not a navigation operation.
**Date:** 2026-04-09.

### No scale transforms on edge-anchored UI elements
**Decision:** Buttons positioned with `absolute` and translate transforms should not use `active:scale-95`. Use `transition-colors` + `active:bg-black/5` for press feedback instead.
**Why:** `scale-95` on absolutely-positioned elements with existing transforms causes compound transform recalculation, visually shifting adjacent panels and the map. Color-only transitions are cheaper and more stable.
**Date:** 2026-04-09.

### Interactive styles belong on buttons, not wrapper divs
**Decision:** `active:scale-95`, `active:brightness-90`, etc. should only be applied to the actual `<button>` element, never to a non-interactive wrapper `<div>`.
**Why:** Wrapper divs may contain dropdown panels or other child elements. Scaling the wrapper causes the entire subtree (including open panels) to bounce, which is a visual bug.
**Date:** 2026-04-09.

## Features

### Place edit/delete (owner + admin)
**Decision:** Place owners and admins can edit places at `/places/[id]/edit`. Deletion enforces the 6-month creation rule client-side. Edit button visible on place detail page for owner/admin only.
**Why:** Completes the place CRUD cycle. Deletion rule already established in Phase 8.5 but lacked UI enforcement.
**Date:** 2026-04-09.

### Admin category management UI
**Decision:** Admin-only page at `/admin/categories` with CategoryManager component for CRUD operations on the `categories` table. Accessible via BurgerMenu link (visible to admin role only).
**Why:** Categories were previously only managed via direct DB access or migrations. Admin needs UI for adding/editing/removing categories as the platform grows.
**Date:** 2026-04-09.

## CI/CD

### GitHub Actions CI pipeline
**Decision:** `.github/workflows/ci.yml` runs typecheck + lint + test + build on every push/PR to main. Uses Node.js version from `.nvmrc`, npm cache.
**Why:** 333 tests exist but no automated enforcement. CI catches regressions before merge. E2E tests remain local-only until a dedicated test Supabase project is configured.
**Date:** 2026-04-09.

### Global iteration framework
**Decision:** Every code iteration follows: Context → Implement → SE Agent Review Chain (Architect → Security → DevOps → Responsible AI → UX → Product Manager → Tech Writer) → Enforce A-grade standards → Optimize file arrangement → Update project assets → Git push.
**Why:** User-requested quality framework. SE agents provide multi-discipline review. Standards enforced on ALL new code (not N-1). Framework saved globally for reuse across projects.
**Date:** 2026-04-09.

### Polyglot testing pipeline
**Decision:** Testing follows: Researcher → Planner → Generator → Builder → Tester → Fixer → Linter. Framework saved globally for reuse.
**Why:** Structured approach ensures comprehensive coverage with proper planning. Research phase identifies gaps, planner prioritizes by ROI, generator implements in phases.
**Date:** 2026-04-09.

### Expanded role system (migration 025)
**Decision:** Replaced 3-role system (vendor/client/admin) with 7 roles (individual/ministry/organization/business + legacy vendor/client + admin). All existing users migrated to `individual`. New signups choose from 4 roles. Legacy roles kept in DB constraint for backward compat.
**Why:** Platform identity serves organizers and non-organizers equally. Expanded roles give ministry, organization, and business entities distinct identity while preserving the "all citizens can create events" principle. Place creation restricted to organiser roles (ministry/organization/business/admin).
**Date:** 2026-06-06.

### Role self-escalation prevention
**Decision:** Two DB triggers protect roles: (1) `handle_new_user()` whitelists self-assignable roles (no admin); (2) `protect_role_column()` silently reverts non-admin role changes on profile UPDATE.
**Why:** SE Security review found users could self-assign admin via signup metadata or profile UPDATE. Both vectors now blocked at the DB level.
**Date:** 2026-06-06.

### category_id FK with text column sync trigger
**Decision:** Added `category_id uuid REFERENCES categories(id)` to events alongside existing text `category` column. A `sync_event_category_id` trigger auto-fills `category_id` from text column on INSERT/UPDATE.
**Why:** Enables proper FK joins for category queries while maintaining backward compatibility with existing code that uses the text category column. Text column to be deprecated in a future migration.
**Date:** 2026-06-06.

### is_organiser() DB function for RLS
**Decision:** Created `is_organiser()` function that checks if current user has role IN ('ministry', 'organization', 'business', 'admin'). Used in places INSERT RLS policy.
**Why:** Centralizes the organiser role check in the DB layer, similar to existing `is_admin()`. Prevents bypass via direct Supabase client calls.
**Date:** 2026-06-06.
