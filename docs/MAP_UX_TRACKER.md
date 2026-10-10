# Citizens Connect — Map & Sheet UI Tracker

|                  |                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status           | Phase 0 not started. Reconciled with `RESUME_HERE.md` and the live code on 2026-10-10 (§13). **Map look: LIGHT** (founder, 2026-10-10; D1 answered). No `feat/map-v2` branch, no `docs/audit/`, no `docs/proposals/` exist yet. |
| Last updated     | 2026-10-10                                                                                                                                                                                                                      |
| Owner            | Stephen                                                                                                                                                                                                                         |
| Executor         | Claude Code, started by pasting `docs/MAP_V2_RUNNER_PROMPT.md`                                                                                                                                                                  |
| Scope            | Citizens Connect, Pretoria v1. Wear, Vision and the shared Supabase contract are out of scope.                                                                                                                                  |
| Reference        | `docs/reference/instagram-map/` (frames + `INDEX.md`; the `.jpg` files are git-ignored)                                                                                                                                         |
| RESUME_HERE item | **C19** (`apps/connect/RESUME_HERE.md` §4, with its decision block)                                                                                                                                                             |

**Rule:** this file is the source of truth. Tick a box only with evidence: a commit hash plus a screenshot path or a measured number (§11.2). If something was not measured, write `NOT MEASURED` and say why.

**IDs in this file are a separate namespace from `RESUME_HERE.md`.** Both use H1–H10, M1–M9, D-numbers and P-numbers for different things (here `H2` is "bump `?v=`"; there `H2` is "delete merged branches"). Outside this file, write `MAP:H2`, `MAP:M3`, `MAP:D1`, `MAP:P1-04`. Inside this file, a bare id means this file.

**Contents:** 1 Goal · 2 Vision & values · 3 Instagram reference · 4 Discernment & creative latitude · 5 Guardrails · 6 Size key · 7 Phase 0 · 8 Phase 1 · 9 Phase 2 · 10 Open decisions · 11 Logs · 12 Definition of done · 13 Reconciliation with RESUME_HERE · App A Observations · App B Token roles · App C Measuring · App D Parking lot · App E Tunable design parameters

---

## 1. Goal and success measures

**Goal.** Replace the current basic pin and preview card with photo pins and a three-state bottom sheet (peek / half / full) that follow the interaction patterns of Instagram's map (recorded 3 Oct 2026), adapted to Citizens' identity, values and v1 scope.

All measures use the baseline profile from Appendix C (Chrome, 390 × 844 viewport, CPU 4× slowdown, named "Fast 4G" network preset) unless stated. If a target cannot be met, record the measured value and the options. Do not change a target silently.

| #   | Measure                                                              | Target                                                      | Phase |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ----- |
| M1  | Pin tap → header (avatar, name, category) visible                    | ≤ 100 ms                                                    | 1     |
| M2  | Pin tap → skeleton visible / first content tile visible              | ≤ 100 ms / ≤ 1,000 ms (record with ≤ 12 images)             | 1     |
| M3  | Map pan with 150 markers, frame time p95                             | ≤ 20 ms                                                     | 1     |
| M4  | Layout shift when the sheet opens and content loads (CLS)            | 0                                                           | 1     |
| M5  | Contrast                                                             | text ≥ 4.5:1; icons, rings, pin borders ≥ 3:1               | 1     |
| M6  | Tap targets                                                          | ≥ 44 × 44 CSS px                                            | 1     |
| M7  | Flag off: pixel difference vs baseline at 360×800, 390×844, 768×1024 | ≤ 0.1 %                                                     | 1     |
| M8  | New runtime dependencies                                             | 0 (exceptions: Gate G2)                                     | 1     |
| M9  | Visual consistency checklist (§12.3)                                 | all items pass + Stephen signs off side-by-side screenshots | 1     |

"Modern look and appeal" has no numeric test. The proxy is M9: the §12.3 checklist plus Stephen's sign-off on side-by-side screenshots (flag off vs on).

---

## 2. Vision, values and design principles (owner-edited)

Drafted by Claude on 2026-10-05 from the project's stated direction. **Stephen: edit this section directly.** The executor must not rewrite it. A conflict with it triggers Gate G5.

### 2.1 Vision (draft)

- **219** (Ephesians 2:19) is the mission layer: belonging as citizens and members of one household. Connect helps people in Pretoria find and gather with real faith communities, events and places.
- Contributors (ministries, community groups) are approved before they appear. Community members can post their own events, public or private by invitation.
- v1 scope: simple listings with contact details and links, a list view and a map with category colours, Pretoria only. `V1_SCOPE.md` wins on any conflict.

### 2.2 Values (draft) — the seven questions in §4 come from these

1. **Belonging** — features lead people toward gathering with a real community, not toward browsing for its own sake.
2. **Truthfulness** — every label, count and status comes from real data. Unknown shows nothing; it is never guessed.
3. **Dignity and safety** — no feature exposes a person's location, a private event or a minor. Defaults are private or off.
4. **Attention** — no streaks, endless feeds, manufactured urgency or follower-count rankings. Notifications are opt-in.
5. **Stewardship** — the smallest change that meets the Accept line. No new runtime dependency or recurring cost without approval.
6. **Originality** — Citizens' own look. Patterns are borrowed; assets are not.
7. **Reach** — works one-handed on a mid-range Android phone over mobile data.

### 2.3 Design principles (starting set; propose changes through the Decision Log)

1. Legible at arm's length: body text ≥ 14 px; labels ≥ 11 px with a text halo.
2. Thumb zone: primary actions sit in the lower 40 % of the screen.
3. Calm motion: 120–320 ms, transform and opacity only; the only looping animation is the skeleton shimmer.
4. Real people, real places: contributor photos only, no stock faces; flyers open uncropped.
5. One accent colour, three status colours (open, closed, error), the existing category colours. Nothing else.
6. Sentence-case copy in South African English ("colour"), plain words, ≤ 12 words per label.

---

## 3. Instagram reference (patterns, not pixels)

### 3.1 What the recording shows

**Light-map note (2026-10-10).** The recording is in Instagram's dark mode; Citizens' Map v2 is **light**. Copy the interaction patterns (pin, sheet, snap points, header, grid, timing). Do not copy the dark palette. Where a pattern depends on the dark base (a white pin border that pops on a dark map), App E says how it is adapted. No numbers in this file are Instagram's own analytics: they are read from the 309 s recording (App A9) and are proportions, not specifications.

Stephen's Android screen recording (dark mode, 5 min 9 s) shows two surfaces:

- **A. Place map (0:00–3:06):** photo pins by place, "Search this area", a persistent bottom sheet, place pages, feeds, stories.
- **B. Friends / stories layer (3:09–5:09):** story tiles on the map, a hero pin with a location pill, a cluster fan-out.

The recording does not show how the user moves from A to B.

### 3.2 Finding the real thing

Reported at launch (6 Aug 2025): the friends map opens from the Messages (DM) inbox; sharing your own location is opt-in and off by default; shared location updates when the app is opened, not continuously; location-tagged stories and Reels from people you follow appear on the map for 24 hours. Sources checked 2026-10-05: techcrunch.com/2025/08/07/how-to-use-instagram-map-and-set-your-location-sharing-preferences and inquirer.com/news/nation-world/turn-off-instagram-location-map-20250811. Behaviour may have changed since. The entry point to surface A was not captured; check it in the app.

### 3.3 Using the pack

1. Open `docs/reference/instagram-map/INDEX.md`, then open the frames (R01–R19). Frame ids in this file (R04 etc.) match the file prefixes.
2. If the folder is missing, work from Appendix A and say so in the Run log. Do not guess at details that Appendix A does not state.
3. If the full recording is available, extract more frames with `ffmpeg -ss <time> -i <video> -frames:v 1 out.jpg`. Keep them in the same git-ignored folder.

### 3.4 Rules

- Use patterns and behaviour. Do not copy Instagram logos, icon artwork, the pink-orange-yellow ring colourway, strings or fonts.
- Do not log in to, scrape or automate Instagram (its terms restrict automated access). Public help pages may be read to confirm behaviour.
- A behaviour that is not in the frames, Appendix A or a public page is marked `UNVERIFIED`.
- Frames contain third-party photos and handles. Keep them out of the production build and out of git (`docs/reference/instagram-map/*.jpg` in `.gitignore`).

### 3.5 Deliberately not copied

- Live or last-known location sharing between people (see X1, §9).
- Unvetted open feeds of other people's posts under a place (moderation load; the recording shows an unrelated news clip in a place grid at 2:42).
- Follower and like counts as the main social proof.
- The gradient story ring as Citizens' identity.

---

## 4. Discernment filter and creative latitude

For each pattern you build, answer the seven questions below, then record ADOPT, ADAPT, DEFER or REJECT with one line in the Decision Log (§11.1).

| #                     | Question                                                                | Reject or defer if                                           |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Q1 Belonging          | Does it help someone find or join a real gathering?                     | It only adds browsing time.                                  |
| Q2 Truthfulness       | Does every shown value come from real data?                             | It needs a placeholder, guess or inflated count.             |
| Q3 Dignity and safety | Could it expose a person, a private event, a minor or a small ministry? | Yes, and the default cannot be private or off.               |
| Q4 Attention          | Does it respect people's time?                                          | It relies on streaks, urgency, endless scroll or rankings.   |
| Q5 Stewardship        | Is it the smallest change that meets the Accept line?                   | A simpler option meets the same line.                        |
| Q6 Originality        | Is the result recognisably Citizens?                                    | It reproduces Instagram assets or layouts pixel for pixel.   |
| Q7 Reach              | Does it meet M1–M6 on the baseline profile?                             | It misses a target and the simplest fix does not recover it. |

**Outcomes.** ADOPT: build as seen. ADAPT: build with a stated change. DEFER: not now; give the trigger to revisit. REJECT: will not build; give the reason.

**Creative latitude.** The reference is a starting point, not a spec. Where you find a solution that meets the same Accept criteria with fewer parts or a lower measured cost, use it, then log it: what, why, alternatives considered, evidence. Deviations are expected. Silent deviations are not allowed.

Deviations already invited:

- Pin image is the contributor logo, not the latest-post photo (P1-04).
- Side panel at ≥ 768 px (P1-06).
- Label-collision rule that favours pins with an upcoming event (P1-04).
- Flyer-safe crop test before choosing the tile aspect ratio (P1-09).
- Category shown by colour and glyph, not colour alone (P1-04).

Not open to deviation: §2 (values) and §5 (guardrails).

---

## 5. Guardrails

### 5.1 Hard rules

- **H1** Never push to `main` (the repo blocks it; GitHub auto-merge is off, so the founder merges). Work on `feat/map-v2` (or the repo's branch convention) and open a draft PR. If `gh` is unavailable (its login expired on this PC on 2026-10-10; `gh auth login -h github.com` fixes it), use the GitHub MCP connector, which worked; failing both, write the PR text to `docs/audit/PR_DESCRIPTION.md`. A repo ruleset ("Allow Claude") forbids deleting branches and force-pushing: never force-push, fix forward with a new commit. Stage explicit paths only, never `git add -A` (untracked local briefs name real organisations).
- **H2** Bump the `?v=` cache-bust string on every file you modify. It lives on each `<script>` tag in `apps/connect/src/frontend/index.html` (e.g. `app/map.jsx?v=20261002b`); the service worker is cache-first for same-origin static files, so a missed bump serves stale code. Verify that both dev (Babel-standalone `@babel/standalone@7.29.0`, `type="text/babel"` tags) and production (`apps/connect/scripts/build-frontend.js`, esbuild via `@citizens/frontend-build`) load and render. **A new `.jsx` file must be added to BOTH `index.html` and `build-frontend.js` `appFileOrder`**, or it works in dev and breaks in production (no build guard yet, RESUME S10).
- **H3** Keep the existing module pattern (IIFE-registered React modules on `window`). No new bundler, framework, JSX build step or ES-module migration. `src/frontend/**` is excluded from ESLint: check touched files with a one-off `no-unused-vars` run.
- **H4** No database writes, no migrations applied, no RLS or auth changes. SELECT-only, aggregate counts only, no personal data in any output. A needed schema change becomes a SQL file in `docs/proposals/` (Gate G1; the live migration head is 181, so a proposal would take the next free number at apply time). The database is one shared production project and MCP SQL runs as an owner that bypasses RLS: write only `select count(*)`-style queries. A local dev server also reads the real Supabase and the real rate-limit buckets: do not hammer `/api/v1/*`.
- **H5** The shared Supabase contract is locked across apps: no change to shared tables, columns or functions.
- **H6** Everything new ships behind the flag `?map=v2`, default OFF. Flag off = unchanged behaviour.
- **H7** No new runtime dependency (Gate G2). A request must state name, version, licence, gzipped size and the alternative of not adding it.
- **H8** No secrets, keys, tokens or user data in logs, screenshots or commits.
- **H9** Reference images stay out of git and out of the production build.
- **H10** No Instagram brand assets: logos, icon artwork, ring colourway, strings. Draw original icons and ring treatment.
- **H11** Scope is Pretoria only and the Contributor / Place / Event model. No fourth database concept ("entity" is informal wording).
- **H12** Core loop outranks polish. If an item would delay contributor onboarding → listing → map → event visibility, defer it and say so in the Run log.
- **H13** Do not mark an item done without evidence. Report failures and unverified claims plainly.
- **H14** Small, reversible commits. Message format: `map-v2(P1-04): short description`.
- **H15** Documentation uses numbers, file paths and commit hashes. A comparative word ("faster", "cleaner") needs a measurement next to it.

### 5.2 Gates — stop that item, write the question in §10, continue unrelated items

| Gate | Trigger                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| G1   | A database or schema change is needed.                                           |
| G2   | A new runtime dependency is needed.                                              |
| G3   | A new brand colour or a logo change is needed.                                   |
| G4   | A target (M1–M9) is missed after one honest, simple fix attempt.                 |
| G5   | Conflict with §2, `V1_SCOPE.md` or `CLAUDE.md`.                                  |
| G6   | The change touches auth, payments, notifications, user location or minors' data. |

---

## 6. Size key

Sizes describe scope, not time.

| Size | Scope                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| S    | 1–2 files, ≤ 150 changed lines, no new module.                                                                                   |
| M    | 3–6 files, ≤ 500 changed lines, or one new module.                                                                               |
| L    | New module with interaction logic (gestures, state), or > 500 changed lines, or cross-cutting. Needs its own tests and evidence. |

| Phase                     | Items               | S   | M   | L   |
| ------------------------- | ------------------- | --- | --- | --- |
| 0 Audit                   | 6                   | 5   | 1   | 0   |
| 1 Foundations, pin, sheet | 13 (P1-12 deferred) | 7   | 5   | 1   |
| 2 Needs data or approval  | 11 (P2-11 added)    | 2   | 7   | 2   |

---

## 7. Phase 0 — Audit (read-only; outputs in `docs/audit/`)

Milestone **M0**. No application code changes.

- [ ] **P0-01 · S · Current-state inventory** → `docs/audit/map-current-state.md`
  - Record: map library and version; tile provider and style URL; marker rendering method; clustering (yes/no); preview-card component and files; Map↔List toggle; where category colours come from; zoom rules; module registration pattern; every place the `?v=` cache-bust lives; how dev and production builds differ; test tooling present.
  - **Already known from RESUME_HERE and a read of the code on 2026-10-10 (verify each, do not just copy):** MapLibre GL **v6.11.2, vendored** in `apps/connect/src/frontend/vendor/maplibre-gl/` (never an unpkg build); tiles **MapTiler**, default style `streets-v2` (`NEXT_PUBLIC_MAPTILER_STYLE`, `map.jsx:87-92`, `build-frontend.js:117-118`); markers are **native MapLibre DOM markers**, one SVG badge per item, shape = entity type (circle Place, rounded rectangle Event, ringed circle Contributor), plus live pulse and broadcast bubble (`map.jsx:148-265`); **no clustering**, gating is CSS `display` (`map.jsx:22`); zoom rules in one place: `ZOOM_GATES = {place: 9.5, event: 7.5, contributor: 6}` (`map.jsx:45`), `ZOOM_LABELS = 15` (`map.jsx:73`), selected pin always drawn, exposed as `window.MAP_ZOOM`; preview card = `window.EntityCard` (`entity-card.jsx`, used by `home.jsx`); Map↔List = Kingdom Discovery (`kingdom-discovery.jsx`); `window.__ccMap` is the test hook; `--map-bg:#EDE5D4` (`index.html:71`); the zoom rules have a unit test, `src/__tests__/frontend/socialsAndZoom.test.ts`.
  - Baseline screenshots (flag off) at 360×800, 390×844, 768×1024 → `docs/audit/img/`.
  - Accept: file paths with line references; screenshots saved.
- [ ] **P0-02 · S · Tile provider and style options** → `docs/audit/map-tiles.md`
  - **Light map decided (D1, 2026-10-10), so the dark-style question is no longer on the critical path.** Record instead: the current provider is MapTiler (key already in the Vercel env); its current free-tier and paid limits and attribution rules; what the light style `streets-v2` draws that competes with our pins (its own coloured POI icons: can they be hidden client-side with `setLayoutProperty`, with no new style?); and a dark style only as a one-line note for the deferred P1-12. Plus two alternative providers with the same facts. Read from each provider's current documentation, with URL and access date. Do not answer from memory.
  - Accept: a recommendation with a monthly cost range and its assumptions. No accounts created, no API keys created.
- [ ] **P0-03 · M · Data readiness** → `docs/audit/data-readiness.md`
  - For Contributor, Place, Event and news posts, record whether each exists and how it is stored: logo/avatar, cover image, gallery images, category, opening hours (format), next event datetime, last-activity timestamp, links, stable id or slug.
  - Method: SELECT-only, aggregate counts (`n with field / n total`). No row-level or personal data in the file.
  - **Last known live counts (RESUME_HERE §2, 2026-10-03; re-count, do not copy):** 16 profiles, 5 Contributors (only 2 on the map: the other 3 lack a category or a pin, or are hidden), 40 Places, 4 Events (**0 upcoming**, so none is on the map), 1 News post. So the Events and News tabs (P1-07) and the "Starts in…" label (P1-05) will be empty on live data today: P1-10 empty states carry the real experience, and M3's 150-marker test needs a **synthetic fixture** (say so in the evidence). Events API ceiling: `/api/v1/events` returns at most 100 rows ordered by date ascending (RESUME C11).
  - Images: RESUME_HERE says the Google Form intake supplies a logo and cover only (C9), and mentions cover photos and event/place galleries elsewhere: P0-03 must confirm which image fields really hold data per type (a Contributor "gallery" may not exist). The CSP `img-src` allows only our own hosts, so an image from a third-party site or social would render broken (RESUME §3, C16).
  - Accept: every gap names the Phase 1 item it affects. Schema proposals, if any, go to `docs/proposals/` and are not applied (G1).
- [ ] **P0-04 · S · Baseline measurements** → table in `docs/audit/map-current-state.md`
  - Measure M1–M6 on the current implementation using Appendix C. Add JavaScript bundle size (gzipped) and the weight of one sample contributor's images.
  - Accept: a value, or `NOT MEASURED` plus the reason, for every row. Throttle values recorded.
- [ ] **P0-05 · S · Deep link and share check** → section in `docs/audit/map-current-state.md`
  - For Contributor, Place and Event: is there a stable URL, as a route or a query parameter?
  - **Expected answer, to confirm: yes for all three.** C15 (PR #89, merged) gave every screen a real URL: `/c/<slug>`, `/p/<id>`, `/e/<id>`, with the old `?c=` link still working. The single source is `apps/connect/src/frontend/app/routes.jsx` (`window.CC_ROUTES`: `pathFor`, `navFromPath`, `safeReturnPath`); `next.config.ts` rewrites an explicit list and must never become a catch-all.
  - Accept: yes/no per type with an example URL that contains no private data.
- [ ] **P0-06 · S · Accessibility baseline** → `docs/audit/a11y-baseline.md`
  - Record: contrast ratios of the existing category colours against the map base and against white; tap-target sizes of markers and buttons; `:focus-visible` present; `prefers-reduced-motion` handled; marker labels exposed to screen readers.
  - Accept: a table of measured values.

---

## 8. Phase 1 — Foundations, pin, sheet (front-end only, behind `?map=v2`)

Prerequisite: every P0 box ticked, or the unticked ones recorded in the Run log with a reason.

| Milestone            | Items                                         | Stop-check before continuing          |
| -------------------- | --------------------------------------------- | ------------------------------------- |
| M1 Foundations       | P1-01, P1-02, P1-03                           | M7: flag-off pixel difference ≤ 0.1 % |
| M2 Pin               | P1-04                                         | M3, M4, M6 measured for pins          |
| M3 Sheet and content | P1-05 – P1-11                                 | M1, M2, M4, M6 measured for the sheet |
| M4 Finish            | P1-13, P1-14 (P1-12 deferred, light map only) | All of M1–M9 reported                 |

Item format: **Do** (what to build), **Accept** (testable), **Ref** (frame ids), **Latitude** (where judgement is expected).

### M1 — Foundations

- [ ] **P1-01 · S · Flag and scaffolding**
  - Do: `?map=v2` stores the flag in `localStorage` (the app's existing key style is `cc_…`, e.g. `cc_pending_intent`, so prefer `cc_map_v2` over `citizens.mapV2` and log the choice); `?map=v1` clears it; default OFF. One helper, `isMapV2()`, on `window`. A small dev-only corner badge "map v2" when on. Read the query string at boot **before** C15's routing runs its arrival-entry `replaceState` (`store.jsx` around lines 29 and 2732), so the flag is not lost; the stored value then survives the URL being rewritten.
  - Accept: flag off → M7 holds; no extra network requests with the flag off (compare request counts); the flag survives a reload; the C15 routing e2e suite (`e2e/routing.spec.ts`) and `historyRule.test.ts` stay green.
  - Depends on: P0-01.
- [ ] **P1-02 · M · Design tokens**
  - Do: one tokens file of CSS custom properties covering the roles in Appendix B. **Light set only** (= the current look; D1, 2026-10-10). The dark set moves to P2-11. New components read tokens only. Reuse existing brand and category colours first.
  - Where it lives: the app has no stylesheet file today. Its CSS is one inline `<style>` in `index.html` (`:root` at line 70 holds `--gold:#C9A84C`, `--gold-dark:#8B6914`, `--map-bg:#EDE5D4`, `--gold-crown:#D4AF37`) plus the Tailwind Play CDN (runtime JIT, RESUME S3). Either extend that `:root` block or add one CSS file under the existing `src/frontend/assets/` folder (the build copies a top-level folder to `public/<dir>/`; reference it root-absolute with a `?v=`). Log the choice.
  - Reconcile, do not add a fourth definition: gold already exists three ways (`packages/ui/src/tokens.ts` with no consumer, Connect's CSS variables, Wear's PNG; RESUME C17). Start from Connect's `:root` values, and note any difference from `packages/ui` in `docs/audit/contrast.md` for C17.
  - Accept: zero raw hex or px values in new component CSS outside the tokens file (allow `0` and `1px` borders); `docs/audit/contrast.md` lists computed ratios and every pair meets M5 in the light set.
  - Latitude: choose the accent from existing brand colours. A new brand colour is Gate G3. **Computed 2026-10-10 (WCAG formula, not yet measured on rendered pixels; recompute here):** `--gold #C9A84C` on white is 2.29:1 and on `--map-bg` 1.82:1, so it fails M5 as text, ring or icon on the light base; `--gold-dark #8B6914` is 5.09:1 on white (passes) and 4.06:1 on `--map-bg`; near-black `#0A0908` on `#C9A84C` is 8.71:1. So on light: gold as a **fill** with a near-black label, and dark gold for gold text, rings and icons.
- [ ] **P1-03 · S · Motion tokens and reduced motion**
  - Do: duration tokens 120 / 200 / 320 ms; enter easing `cubic-bezier(0.2, 0.8, 0.2, 1)`; exit easing `cubic-bezier(0.4, 0, 1, 1)`; one `prefersReducedMotion()` helper.
  - Accept: with `prefers-reduced-motion: reduce` emulated, no transform or opacity transition runs longer than one frame; animations never block pointer input.
  - Known: v1 pins use `transition: all .15s` (`map.jsx:239`), which animates layout properties too. Under the flag, new pins use transform and opacity only.

### M2 — Pin

- [ ] **P1-04 · M · Avatar pin**
  - **Read first (found 2026-10-10):** (a) v1 pins are native MapLibre DOM markers whose **shape says the entity type**: circle = Place (30 px, 38 selected), rounded rectangle with a nub = Event (40×32, 48×38 selected), ringed circle = Contributor (38 px, 46 selected), each with the category glyph in the category colour, a 2.5 px white stroke and `drop-shadow(0 3px 5px rgba(0,0,0,.32))` (`map.jsx:184-245`); live pulse and broadcast bubble ride on top. This item restyles the **Contributor** pin only; Place and Event pins keep their shapes, so a person can still tell a venue from a gathering from an organisation (Q2, Q5). Log it as ADAPT. (b) `apps/connect/docs/feature-clarity/map-layering.md` is the founder's own reveal model: **no pictures at mid zoom (category SVG instead); logo/photo only at close zoom; photos for selected/top items from about zoom 15; places are small dots at zoom 10; per-viewport-cell caps**. It is a deferred planning document (RESUME C9; V1_SCOPE says none of it blocks v1), but it conflicts with a 48 px photo pin at zoom 12. Do not pick silently: see **D8**. (c) The pin's 30–38 px bodies are under the 44 px target (M6): pad the **hit area** to 44 px with transparent space rather than enlarging the drawing.
  - Do (under the flag):
    - Image = contributor logo/avatar, **at the zoom where D8 allows photos**; below it, the category glyph (the fallback below). Do not use the latest post or a flyer: text is unreadable at 48 px.
    - 48 px circle, 3 px white border, 8 px tail. Ring and tail take the category colour. A 14 px category glyph badge gives a non-colour cue (WCAG 1.4.1). **On the light map a white border alone does not separate the pin from a light base**: keep v1's drop shadow and add a 1 px low-opacity dark hairline; pass/fail is the M5 pixel sample, not the design intent.
    - Selected: scale to 1.6× (tune within 1.5–2×) over 200 ms; the map re-centres so the pin clears the sheet.
    - "+N" badge only when ≥ 2 pins overlap at the current zoom, computed when the map goes idle, not per frame.
    - Name label from zoom 15 (`ZOOM_LABELS`), ≥ 11 px weight 600 with a halo. Hide colliding labels; priority to the pin with an upcoming event, then the most recent activity. The existing gates stay: Contributor 6, Event 7.5, Place 9.5, the selected pin always drawn (`ZOOM_GATES`, one place, `map.jsx:45`; keep `window.MAP_ZOOM` and its unit test green). Note the "+N" badge below changes the file's "there is no clustering" rule: update that comment.
    - Fallback with no image: category glyph on the category colour. Pin images are 96 × 96 thumbnails, ≤ 12 KB each, loaded only for pins inside the viewport + 20 %.
  - Accept: M3 with 150 pins (a **synthetic fixture**: live data has about 45 pins, say so in the evidence); M6; `aria-label="{name}, {category}"`; visible keyboard focus ring; CLS 0; screenshots at zoom 12, 15 and 17 on three viewports; the full Connect Playwright suite (127 tests on 2026-10-04) and `src/__tests__/frontend/socialsAndZoom.test.ts` still pass (`data-cc-pin` is the test hook for "every entity type rendered").
  - Ref: R01, R02, R03, R04.
  - Latitude: label priority, glyph set, badge position. If M3 is missed: viewport culling first, then a canvas or symbol layer (Gate G4 if still missed).
  - Conditional: a 10 px freshness dot ("Updated today") only if P0-03 shows a last-activity timestamp is derivable without a schema change.

### M3 — Sheet and content

- [ ] **P1-05 · S · Time and freshness labels**
  - Do: pure functions in one file: `openState(hours, now)`, `eventStartsIn(start, now)`, `postedAgo(time, now)`. Timezone `Africa/Johannesburg`, 24-hour time, locale `en-ZA`. `now` is injected.
  - Accept: tests (or a Node script if no test runner exists) cover: closed day, open 24 hours, midnight crossing, opens later today, unknown hours. Unknown hours return `unknown` and the UI hides the label. No code path prints "Open" without hours data.
  - Values: Q2 Truthfulness.
- [ ] **P1-06 · L · Bottom sheet**
  - Do: one reusable sheet with three snap states.
    - **Scope (D9):** v1 shows the same small `EntityCard` for a Contributor, Place and Event pin (the founder's consistency call, PR #78). Build the sheet as one container for all three types; Phase 1 fills it fully for a Contributor, and a Place or Event opens it with its existing `EntityCard` body. Do not make Contributors the only pin with a sheet unless D9 says so.
    - peek = the existing small preview card (height measured in P0-01); half = 46 % of viewport height (`dvh`); full = 90 % (`dvh`) minus the top safe area.
    - Drag handle 36 × 4 px with a 44 px-tall hit area; top radius 20 px.
    - Drag follows the pointer 1:1. On release: snap by velocity (≥ 0.5 px/ms), otherwise to the nearest state.
    - Content scrolls only at full. `overscroll-behavior: contain`. `touch-action` set so map gestures and sheet drag do not conflict. Bottom safe-area inset respected.
    - Escape and Android back: see D6. **Back is the most fragile part of Connect** (C15 took a real-phone walk to get right; RESUME §3 "Back and history"): push a history entry **only inside a tap or key press**; an overlay uses `useBackGuard` (one `{guard:true}` entry right after the tap that opened it), navigate first then close (`go(...); onClose()`); never push on page load or from `popstate`; `historyRule.test.ts` fails on a fourth `pushState`; `routing.spec.ts` records `navigator.userActivation` at every push. "Collapse one state, then close" needs one guard entry per expansion tap (never a new `pushState` call site) and cannot be proved by Playwright: it needs a real-phone check. Focus moves into the sheet at half and full and returns to the pin on close.
    - At ≥ 768 px wide: 380 px side panel.
    - The full-screen profile page stays reachable through "View Full Profile" (the v1 label, `entity-card.jsx`; the tracker's "More info" is Instagram's wording) (D2). Use `go(page, params)` and `CC_ROUTES`, never a path string.
  - Accept: during drag only `transform` is animated (no layout properties); no scroll chaining into the map; works at 360×800 and with emulated iOS safe areas; the first back press never leaves the map (emulated, plus **NEEDS A REAL PHONE**); screen readers get a labelled dialog and the state change is announced.
  - Ref: R04, R05, R09, R11.
  - Latitude: snap values (within ±4 points), spring or ease, handle styling.
- [ ] **P1-07 · M · Sheet header and actions**
  - Do:
    - peek: 40 px avatar, name, category · open state, chevron.
    - half: 56 px avatar, name (2 lines max), category · open state, action row: Directions (existing route link), Share (P1-11), Website and Call when present.
    - tabs: Events | News | Gallery; tabs with no data are hidden.
    - full: header collapses to avatar + name + close on scroll.
  - Accept: M1 (header comes from marker data already in memory, no network); names up to 28 characters fit on 2 lines at 390 px; no action is shown without its data; M6.
  - Ref: R04, R06, R08, R12.
- [ ] **P1-08 · S · Skeleton and loading states**
  - Do: skeleton blocks that match the final layout; no spinner longer than 300 ms; shimmer 1.2 s linear (off under reduced motion); error state with a "Try again" button.
  - Accept: M2; CLS 0 when content replaces the skeleton.
  - Ref: R04, R17.
- [ ] **P1-09 · M · Gallery grid**
  - Do: 3 columns, 2 px gaps, `object-fit: cover`. Choose tile aspect ratio (1:1 or 4:5) from the median ratio of existing images and log it. Optional 2-row featured tile for the newest item. `loading="lazy"`, `decoding="async"`. Tap opens the image uncropped in a viewer (swipe, Escape and back close it).
  - Accept: CLS 0; median image weight ≤ 60 KB at tile size (use storage transforms or `srcset` if available; if not, log the actual median); ≤ 12 tiles requested before the first scroll.
  - Values: Q3 (check D5 on image sources and rights), Q7.
  - Ref: R05, R06.
- [ ] **P1-10 · S · Empty and error states**
  - Do: every tab gets a plain message and one action (Directions, Website or Contact). All new user-visible text lives in one strings file in South African English.
  - Accept: every empty state has at least one enabled control; the strings file contains all new text.
  - Ref: R13 (what to avoid).
- [ ] **P1-11 · S · Share** (deep links already exist: C15, PR #89; no handler to build)
  - Do: Web Share API with a clipboard fallback and a toast "Link copied". The link is `CC_ROUTES.pathFor(...)` (`/c/<slug>`, `/p/<id>`, `/e/<id>`); v1 Share already copies the real link, so reuse that call. What the link opens under the flag is **D10**: v1 opens the full profile page; the tracker's intent was the map centred with the sheet at peek.
  - Accept: the link works in a fresh browser session; the share payload is the name and the link only; works with the clipboard on desktop and the share sheet on mobile.
  - Ref: R09.

### M4 — Finish

- [ ] ~~**P1-12 · M · Dark map style**~~ **DEFERRED to P2-11 (2026-10-10).** The founder chose the light map (D1), and the smallest change that meets the goal (Q5) is no dark token set and no second tile style. Trigger to revisit: the founder asks for dark, or P0-02 shows a dark style costs nothing. Skip this box; M4 is then P1-13 and P1-14.
- [ ] **P1-13 · M · QA matrix and evidence** → `docs/audit/phase1-qa.md`
  - Do: emulated runs at 360×800, 390×844, 412×915, 768×1024, 1280×800; the baseline throttle profile; keyboard-only pass; touch emulation; console clean. The repo gates, workspace-wide: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (run `format:check` locally, CI runs it and the turbo gates do not; run `build` before `typecheck`), then Connect's Playwright e2e (`pnpm --filter citizens-connect test:e2e`; stop any `next dev` on the same checkout first, two servers must never share one `.next`). List "Needs a real phone" checks for Stephen (mid-range Android Chrome, iOS Safari); the Back behaviour of the sheet is the first one.
  - Run a vibe-security pass on the diff (the flag and any stored value; no new `innerHTML` with unescaped data: `map.jsx` already builds SVG with an `esc()` helper).
  - Accept: every Accept line in Phase 1 listed with PASS, FAIL or NOT MEASURED plus an evidence path; zero console errors; Lighthouse accessibility ≥ 95 on the map page if Lighthouse can run.
- [ ] **P1-14 · S · PR handover**
  - Do: update the draft PR with summary, flag-off and flag-on screenshots, the results table, decisions needed and rollback steps. Update Status at the top of this file. Add or refresh a "Map v2" section in `RESUME_HERE.md` (where we are, next step).
  - Accept: PR body contains all five parts; ticked boxes match §11.2 evidence; no box is ticked without evidence.

---

## 9. Phase 2 — Needs data or approval (not started)

Each item needs a Phase 1 sign-off first (D1, D2). Items marked G1 or G6 stop at the gate.

- [ ] **P2-01 · M · Nearby list inside the expanded sheet**, replacing the Map↔List toggle. Needs D2.
- [ ] **P2-02 · M · Marker clustering.** Trigger: M3 missed above 150 markers, or the overlap badge (P1-04) does not resolve dense areas.
- [ ] **P2-03 · M · "Search this area" re-query.** Trigger: the dataset no longer loads in one request. Pretoria-only v1 may never need it.
- [ ] **P2-04 · L · Follow and Save with notifications.** G1 and G6.
- [ ] **P2-05 · L · Moments:** 24-hour contributor updates with a seen/unseen ring and the cluster fan-out (R17), built on the news feed. G1; Q4 review first.
- [ ] **P2-06 · M · QR code per contributor**, for printing at venues. Needs stable deep links (P0-05).
- [ ] **P2-07 · S · Upcoming | Recent sort** in the tabs.
- [ ] **P2-08 · S · Count buckets** ("100+", "1,000+") shown only at 100 or more; never below, so small ministries are not shown with low numbers (Q3).
- [ ] **P2-09 · M · Co-hosted events** (two contributors on one event). G1.
- [ ] **P2-10 · M · Crown logo and Wear loading screen in Connect** (existing plan). Use the P1-02 tokens. Wear's crown PNG and splash shipped in #82; Connect's own are what remains. Overlaps RESUME C17 (one design reference).
- [ ] **P2-11 · M · Dark map style and dark token set** (was P1-12). Deferred by the founder's light-map choice (D1, 2026-10-10). Trigger: the founder asks, or P0-02 shows a dark style is free.

### Rejected or deferred

| Id  | Pattern                                                           | Decision      | Reason                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X1  | Live or last-known location sharing between people ("Share back") | REJECT for v1 | Q3. At launch (Aug 2025) it drew public criticism and a letter from US state attorneys general (wtoc.com/2025/08/20/asked-answered-is-new-instagram-friend-map-sharing-your-location-how-turn-it-off). Revisit only through Gate G6. |
| X2  | Open location feeds of other people's posts                       | REJECT        | Moderation load; the recording shows an unrelated news clip at 2:42.                                                                                                                                                                 |
| X3  | Weather chip in the peek bar                                      | DEFER         | No link to gathering (Q1). Revisit if event days show a need.                                                                                                                                                                        |
| X4  | Price tiers                                                       | REJECT        | No data; Q2.                                                                                                                                                                                                                         |
| X5  | Gradient story ring and Instagram layouts pixel for pixel         | REJECT        | Q6, H10.                                                                                                                                                                                                                             |

---

## 10. Open decisions for Stephen

| Id  | Decision                                                                                                                                                                                                                                                                                        | Default if unanswered                                                                                                                                                                                                                                                                                                  | Needed by      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| D1  | Map default: light or dark?                                                                                                                                                                                                                                                                     | **ANSWERED 2026-10-10 (Stephen): LIGHT.** Phase 1 ships light only; dark is P2-11.                                                                                                                                                                                                                                     | —              |
| D2  | Does the full sheet replace the full-screen profile page, or sit beside it?                                                                                                                                                                                                                     | Sit beside it; profile page stays                                                                                                                                                                                                                                                                                      | Before Phase 2 |
| D3  | Accent colour source                                                                                                                                                                                                                                                                            | An existing brand colour. Recommendation (computed, P1-02 to confirm): gold as a fill with a near-black label; `--gold-dark #8B6914` for gold text, rings and icons (gold `#C9A84C` alone is 2.29:1 on white)                                                                                                          | P1-02          |
| D4  | If the tile provider has no dark style: change provider or stay light?                                                                                                                                                                                                                          | **MOOT** (light chosen). Stay on MapTiler `streets-v2`.                                                                                                                                                                                                                                                                | —              |
| D5  | Gallery image sources and rights: contributor uploads only, or also imports from contributors' own sites and socials? What does the consent wording cover?                                                                                                                                      | Show only images the contributor supplied or consented to. **Recommendation: contributor-supplied only**: this matches RESUME C16 (no third-party images in Phase 1: the CSP allows only our hosts; Facebook, Instagram and TikTok sources are never enabled)                                                          | P1-09          |
| D6  | Android back: collapse one state then close, or close at once?                                                                                                                                                                                                                                  | Collapse one state, then close. **Recommendation: close at once (one `useBackGuard` entry)** for Phase 1: "collapse one state" needs several guard entries in the part of Connect that took a real-phone walk to get right (C15). Add collapse-by-state later if the real-phone test is clean. **Founder to confirm.** | P1-06          |
| D7  | UI language in Phase 1: English only, with strings file ready for translation?                                                                                                                                                                                                                  | English only                                                                                                                                                                                                                                                                                                           | P1-10          |
| D8  | **Pin picture by zoom.** Tracker P1-04 puts a 48 px logo photo on every Contributor pin (as Instagram does). The founder's `docs/feature-clarity/map-layering.md` says no pictures at mid zoom (category SVG), logo/photo only at close zoom, photos for selected/top items from about zoom 15. | **Follow the founder's document:** category glyph pin below a photo zoom (start 15, tune 13–15), logo photo at and above it, selected pin always with its logo. It is also the cheaper option for M3 and mobile data (Q5, Q7).                                                                                         | P1-04          |
| D9  | **Sheet scope.** One sheet for Contributor, Place and Event pins, or Contributor only? (v1's one-preview-card-for-every-pin was the founder's call, PR #78.)                                                                                                                                    | One container for all three; Contributor gets tabs and gallery in Phase 1; Place and Event reuse their `EntityCard` body inside it.                                                                                                                                                                                    | P1-06, P1-07   |
| D10 | **What a shared link opens under the flag.** v1: `/c/<slug>` opens the full profile page. The tracker wanted: the map centred with the sheet at peek.                                                                                                                                           | Keep v1 behaviour in Phase 1 (no change to the signed-off routing); revisit after the sheet exists.                                                                                                                                                                                                                    | P1-11          |

Executor: add new questions here with an id, the question, your recommendation and the item that is paused.

---

## 11. Logs (append-only)

### 11.1 Decision Log

| Date | Item | Pattern | Outcome (ADOPT / ADAPT / DEFER / REJECT) | Reason (Q1–Q7) | Alternatives considered | Evidence |
| ---- | ---- | ------- | ---------------------------------------- | -------------- | ----------------------- | -------- |

### 11.2 Evidence log

| Item | Commit | Screenshot or measurement path | Value vs target |
| ---- | ------ | ------------------------------ | --------------- |

### 11.3 Run log

| Date | Run | Start commit | Milestone reached | Notes (gates hit, items paused, tools unavailable) |
| ---- | --- | ------------ | ----------------- | -------------------------------------------------- |

---

## 12. Definition of done

### 12.1 Item

- Every Accept line met, or recorded as FAIL / NOT MEASURED with the reason.
- Evidence row in §11.2; box ticked.
- `?v=` bumped on each modified file; dev and production both render.
- M7 re-checked (flag off, ≤ 0.1 %); console clean.
- Every deviation from the reference logged in §11.1.

### 12.2 Phase

- Every item ticked, or DEFERRED with a trigger.
- Draft PR updated; final report written for a non-engineer; open decisions listed in §10.

### 12.3 Visual consistency checklist (M9)

- [ ] Spacing values come only from the 4-pt scale (grep confirms).
- [ ] ≤ 3 type sizes and 2 weights (400, 600) inside the sheet.
- [ ] Radii only from {8, 12, 20, 999}.
- [ ] One icon family, one stroke weight (1.75–2 px on a 24 px grid).
- [ ] One accent colour in use.
- [ ] Every interactive element has hover (pointer devices), `:focus-visible` and pressed states.
- [ ] Every list and grid has loading, empty and error states.
- [ ] Light screenshots, flag off vs on, at 3 viewports attached (dark is P2-11).
- [ ] Stephen's sign-off recorded in §11.1.

---

## 13. Reconciliation with RESUME_HERE and the code (2026-10-10)

Method: the runner prompt, this file and the reference pack were compared with `apps/connect/RESUME_HERE.md` (state, standing rules, open work), `VISION.md`, `V1_SCOPE.md`, the root and app `CLAUDE.md`, `git`/GitHub (origin/main `30507e9`, PR #93 open, #90 and #91 open) and the map code. Items verified correct and left alone: Phase 0 not started (no `feat/map-v2`, `docs/audit/`, `docs/proposals/`); dev uses Babel-standalone and production uses `build-frontend.js`; IIFE modules on `window`; Pretoria only with the locked Contributor / Place / Event model; never push to `main`; Playwright e2e exists and is a merge gate; MapLibre is the map library; "Contributor pins hidden below zoom 6" and "names from zoom 15" are true (but incomplete, see row 6).

### 13.1 Decisions recorded

- **D1 = light** (Stephen, 2026-10-10). Phase 1 ships the light map only. P1-12 (dark style) moves to P2-11; D4 is moot; P1-02 builds the light token set only; §12.3 and Appendix B follow.

### 13.2 Corrections

| #   | The prompt or tracker said                                                          | What RESUME_HERE or the code says                                                                                                                                                                                                                                | Fixed in                                                 |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | READ FIRST: `V1_SCOPE.md`, `RESUME_HERE.md` (bare names); no mention of `VISION.md` | Paths are `apps/connect/V1_SCOPE.md`, `apps/connect/RESUME_HERE.md`, root `CLAUDE.md` and `apps/connect/CLAUDE.md`. Root `CLAUDE.md` rule 0: read `apps/connect/VISION.md` **first, every run**, run its alignment self-prompt, re-read before shipping.         | Runner prompt                                            |
| 2   | No offload file, compaction, vibe-security or "ask" rules                           | Root `CLAUDE.md`: offload file in `.claude/sessions/` (gitignored) updated after each task and `/compact`; compact at least every 10 minutes; do not write RESUME_HERE mid-session; vibe-security check; report and address broken code found; ask when unclear. | Runner prompt                                            |
| 3   | "Use your judgement, then log it"                                                   | Root `CLAUDE.md` rule 4: do not make assumptions, ask. Reconciled: judgement is for design choices that still meet an Accept line (logged in §11.1); unclear product intent goes to §10 and that item pauses.                                                    | Runner prompt                                            |
| 4   | Gates: "build + tests"                                                              | Workspace gates: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus Connect e2e. `src/frontend/**` is not linted.                                                                                                               | P1-13, runner prompt                                     |
| 5   | Ids `H1–H15`, `M1–M9`, `D1–D7`, `P0-xx / P1-xx`                                     | RESUME_HERE uses `H1–H10`, `M1`, `D-8…D-13`, `P1–P21` for other things. C18 is already claimed by PR #90's branch.                                                                                                                                               | Header note; RESUME item is **C19**, project row **P21** |
| 6   | Zoom rules: contributor 6, labels 15                                                | `ZOOM_GATES = {place 9.5, event 7.5, contributor 6}`, `ZOOM_LABELS = 15`, selected pin always drawn, `window.MAP_ZOOM`, unit-tested (`map.jsx:45,73,728`)                                                                                                        | P0-01, P1-04                                             |
| 7   | An "avatar pin" for contributors only                                               | v1 pins are DOM markers whose shape encodes the entity type, with a live pulse and a broadcast bubble                                                                                                                                                            | P1-04                                                    |
| 8   | P0-05 asks if a stable URL exists; P1-11 may build a `?c=` handler                  | C15 (#89) shipped `/c/<slug>`, `/p/<id>`, `/e/<id>` via `CC_ROUTES`; Share already copies the real link                                                                                                                                                          | P0-05, P1-11, D10                                        |
| 9   | P1-06: Back collapses one state then closes                                         | RESUME §3: history may be pushed only inside a tap; overlays use `useBackGuard`; `historyRule.test.ts` caps `pushState` sites; Playwright cannot reproduce Chrome's Back intervention                                                                            | P1-06, D6                                                |
| 10  | "Bump the `?v=`"                                                                    | `?v=` is per `<script>` tag in `index.html`; a new file must also be in `build-frontend.js` `appFileOrder` (§3Y bug class, RESUME S10)                                                                                                                           | H2                                                       |
| 11  | "One tokens file of CSS custom properties"                                          | There is no stylesheet; CSS is one inline `<style>` plus the Tailwind Play CDN; gold is already defined three ways (RESUME C17)                                                                                                                                  | P1-02                                                    |
| 12  | Dark token set and dark map in Phase 1                                              | Founder chose light (D1)                                                                                                                                                                                                                                         | §13.1                                                    |
| 13  | 48 px photo pins on every Contributor                                               | Founder's `feature-clarity/map-layering.md`: no pictures at mid zoom                                                                                                                                                                                             | D8                                                       |
| 14  | A sheet for the "contributor"                                                       | PR #78 made one preview card for every pin type                                                                                                                                                                                                                  | D9                                                       |
| 15  | Events and News tabs, "Starts in 2 h"                                               | Live data (2026-10-03): 4 Events, 0 upcoming; 1 News post; 5 Contributors, 2 on the map; Events API caps at 100 (C11)                                                                                                                                            | P0-03, P1-10, M3 fixture                                 |
| 16  | M7 via committed `toHaveScreenshot` baselines                                       | None exist; Windows-made baselines fail on the Linux CI runner                                                                                                                                                                                                   | Appendix C                                               |
| 17  | "If `gh` is unavailable, write `PR_DESCRIPTION.md`"                                 | `gh` login expired 2026-10-10 but the GitHub MCP connector worked; a ruleset forbids branch deletion and force-push                                                                                                                                              | H1                                                       |
| 18  | "Use npx Playwright in a temp dir"                                                  | Connect already has Playwright (127 tests): use it, no new dependency                                                                                                                                                                                            | Runner prompt                                            |
| 19  | `localStorage['citizens.mapV2']`                                                    | The app's key style is `cc_…` (e.g. `cc_pending_intent`)                                                                                                                                                                                                         | P1-01                                                    |
| 20  | `docs/reference/instagram-map/*.jpg` "add to `.gitignore`"                          | Not ignored on 2026-10-10 and the folder was untracked: a `git add docs/` would have committed third-party photos. Rule added to the root `.gitignore`.                                                                                                          | `.gitignore`                                             |
| 21  | Reads "README / CLAUDE.md"                                                          | `apps/connect/README.md` was recorded as stale (V1_SCOPE §1: describes an unrelated "member data platform"): do not rely on it                                                                                                                                   | Runner prompt                                            |
| 22  | D5 may allow images imported from contributors' sites and socials                   | CSP `img-src` allows only our hosts; Meta and TikTok sources are never enabled (C16)                                                                                                                                                                             | D5                                                       |

§2.1 is owner-edited and was not changed. One claim for Stephen to confirm: it says community members can post private events by invitation. Migration `027_event_visibility.sql` exists, but whether v1 exposes private events was not checked; if it does not, §2.1 overstates v1 (V1_SCOPE wins on any conflict, G5).

---

## Appendix A — Reference observations (from the 3 Oct 2026 recording)

Frame ids refer to `docs/reference/instagram-map/`. Numbers are approximate, read from 392 px-wide frames.

**A1 Base map.** Dark slate base (≈ #41535E in the frames); thin low-contrast roads; dark-green parks; dark-blue water. Points of interest are the only saturated elements (orange venues, purple transit, pink health, green parks). Label hierarchy by zoom: city (bold white) → suburb → place → building footprints. Region zoom adds a green land tint. No tilt, 3D or hillshade.

**A2 Pins (R01–R04).** Circle ≈ 52 px (≈ 13 % of width), white border ≈ 3 px, tail, name and "+N more" beneath. Selected pin ≈ 2× (≈ 108 px); the map re-centres so it clears the sheet. Ring: gradient = unseen story, white = none. At region zoom all pins collapse into one with a count (R03). During zoom, pin photos disappear for ≈ 0.2–0.4 s and return re-clustered. Labels of ≈ 8–9 px overlap in dense areas.

**A3 Controls and peek bar.** Round back and locate buttons ≈ 48 px; centred "Search this area" pill. After a tap the pill reads "Loading" and new pins arrive ≈ 3 s later. Peek bar: avatar, area name, weather, search. The name re-resolves with zoom (Wits University → Braamfontein → Parktown → Johannesburg).

**A4 Sheet.** One persistent sheet with three snap points at ≈ 10 %, 46 % and 90 % of screen height; top radius ≈ 20 px; handle ≈ 36 × 4 px. A pin tap opens half with the header filled and a spinner for content; content arrives 3 s to more than 6 s later (R04 → R05) and the sheet expands to full. The header collapses to avatar, name, ⋮ and ✕ on scroll.

**A5 Content.** Grid of 3 columns, ≈ 2 px gaps, square tiles with one 2-row featured tile (video), badges for multi-image and video. A tile opens a full-screen "Top posts" feed (R07); back returns to the same sheet state. A video opens a vertical viewer with a right-hand action rail. A single post opens as a bottom-up modal (R16).

**A6 Header data.** Category; Open / Closed (green / red) with hours ("Open • 24 Hours"); Directions and More info as links; share and save icons; Follow (filled) and Message (grey) on business accounts (R08). Count buckets: "Fewer than 100", "1000+", "5000+", "105K" (R14).

**A7 Secondary surfaces.** ⋮ opens a second sheet over the first (address, Report, Open in Maps, Copy, Show QR code, Share to) with the map dimmed; tapping the map dismisses it (R09). The peek bar can be pulled up into a nearby list: avatar, name, category, count, 3-photo strip (R11). Stories: full-screen, segmented progress bar, age stamp, reply bar (R10, R18).

**A8 Friends layer (R15, R17, R19).** 3:4 rounded tiles with a ring; a hero circle with a location badge and a dark pill "Name · See more ›"; banner "Device location off"; "Search for friends…" bottom bar. Cluster tap: map blurs, title pill with the place name, back arrow becomes ✕, tiles scattered and labelled with first name and age ("23h"); skeleton tiles show for ≤ 0.5 s before images.

**A9 Timing (from frame timestamps: 14,675 frames over 309 s).** Pan and zoom: median ≈ 43 changing frames per second inside a 60 fps capture. 85 stalls longer than 100 ms in ≈ 230 s of motion; 14 longer than 500 ms; worst ≈ 1.2 s (opening a post at 4:12). Screen recording adds overhead, so treat these as upper bounds.

**A10 Weak spots (do not copy).** Spinner-only grid for 3 s or more; "This story is unavailable." three times (2:30, 2:51, 2:57) with the ring still shown and no action offered; ≈ 8–9 px labels overlapping; no category colour or filter on pins; unvetted feeds.

**A11 Social mechanics and the Citizens translation**
| Instagram mechanism | Citizens translation |
|---|---|
| A location tag is the entry ticket to the map | Contributor approval and event creation are the entry ticket; no open tagging |
| Freshness stamps ("9h") | "Starts in 2 h", "Posted 3 h ago", "Open now" (P1-05) |
| Count buckets as social proof | P2-08, only at 100 or more |
| Follow, Message, Share, Save in the header | Directions and Share first; Follow and Save in P2-04 |
| "Share back" reciprocity | Rejected (X1) |
| Top / Recent tabs | Upcoming / Recent (P2-07) |

Colour samples from the frames, for reference only, not for reuse: surface ≈ #0C1013, primary button ≈ #4F53E7, secondary button ≈ #35383F, map base ≈ #41535E.

---

## Appendix B — Token roles

Values below are placeholders. Replace with brand-derived values (G3 if a new brand colour is needed).

| Role                            | Used for                           | Constraint                                                                                                           |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--surface-0`                   | App and map chrome background      | —                                                                                                                    |
| `--surface-1`                   | Sheet background                   | ≥ 4.5:1 with `--text-1` and `--text-2`                                                                               |
| `--surface-2`                   | Raised elements, tile placeholders | —                                                                                                                    |
| `--text-1`, `--text-2`          | Primary and secondary text         | ≥ 4.5:1 on surfaces                                                                                                  |
| `--accent`, `--accent-contrast` | Primary action and its label       | ≥ 4.5:1 label on accent                                                                                              |
| `--ok`, `--closed`, `--error`   | Open, closed, error                | Always paired with text; never colour alone                                                                          |
| `--cat-*`                       | Category colours (existing)        | ≥ 3:1 against white border and map base                                                                              |
| `--pin-border`                  | Pin border                         | White, 3 px, **plus** a 1 px dark hairline and the v1 shadow on the light map; ≥ 3:1 against sampled map-base pixels |
| `--scrim`                       | Dimming behind a stacked menu      | Near-black at about 40 % on the light map (tune; text over it ≥ 4.5:1)                                               |

Scales: spacing 4, 8, 12, 16, 20, 24, 32, 48 px · radii 8, 12, 20, 999 px · type 12/16, 14/20, 18/24 with weights 400 and 600 · elevation 2 levels · z-index map 0, pins 10, controls 20, sheet 30, menu 40, toast 50 · motion per P1-03.

---

## Appendix C — How to measure

Record the exact throttle values used. If a browser cannot be run, write `NOT MEASURED`. Never estimate.

| Measure                     | Method                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline profile            | Chrome DevTools Protocol: `Emulation.setCPUThrottlingRate` rate 4; `Network.emulateNetworkConditions` using the "Fast 4G" preset values; viewport 390 × 844, device scale factor 3.                                                                                                                                                                                                                                                                                                                                                                                                              |
| M1 tap → header             | `performance.mark('tap')` on `pointerup`; `performance.mark('header')` after a double `requestAnimationFrame` once the header is in the DOM; measure the difference. 10 runs, report median and worst.                                                                                                                                                                                                                                                                                                                                                                                           |
| M2 tap → skeleton / content | Same marks for the first skeleton node and the first loaded content tile. 10 runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| M3 pan frame time           | Scripted 10 s pan (programmatic pan on every frame) with 150 markers; record `requestAnimationFrame` deltas; report p95 and the count above 32 ms.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| M4 layout shift             | `PerformanceObserver` for `layout-shift` entries (`!hadRecentInput`) from tap until content is loaded; report the sum.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| M5 contrast                 | Script using the WCAG relative-luminance formula on token values; for pins, sample rendered pixels against the map base.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| M6 tap targets              | `getBoundingClientRect()` on every interactive element in the sheet and on pins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M7 flag-off diff            | Connect already has Playwright (127 e2e tests; no new dependency) but **no `toHaveScreenshot` baselines exist**. Do **not** commit baseline images made on Windows: fonts and rendering differ on the Linux CI runner (the same trap as the `braces` golden fixture, RESUME §6, 2026-10-03). Instead take the "before" and "after" screenshots in **one run on one machine** (flag never set vs flag set to `v1`), same data fixture, animations disabled, 3 viewports, and pixel-diff them; require `maxDiffPixelRatio ≤ 0.001`. Keep it a local check unless CI can produce its own baselines. |
| Requests and bytes          | HAR export; compare flag off vs on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## Appendix D — Parking lot (ideas, unvalidated, not scheduled)

Add an idea only with the need it serves and what it would take.

- **Service-times chip** on the sheet header ("Sun 09:00"). Needs: structured service times in the data.
- **Newcomer tags** (children's ministry, wheelchair access, language of service, parking). Needs: tag fields (G1) and contributor input.
- **Category filter chips** above the map. The reference has no filter on pins (A10); the v1 map already has category colours. Needs: categories loaded client-side. Size: S–M.
- **"Open now" and "Starts today" chips.** Needs: hours and events data (P0-03).
- **Travel time from the visitor's location**, opt-in only. Needs: Gate G6.
- **Additional languages** for strings (the P1-10 strings file is the starting point).

---

## Appendix E — Tunable design parameters (light map)

The map design values that can be adjusted, with Instagram's observed value beside Citizens' value today. **Source of the Instagram column:** only the 3 Oct 2026 recording (19 frames, plus the 309 s timing analysis in A9). It is read from 392 px-wide frames, so it gives proportions, not specifications; nothing here is Instagram's own analytics. If you meant a different dataset, say so.

How to adjust: change the **start value** here, then add a Decision Log row (§11.1) naming the measure that justified it (M1–M9, Appendix C). A change outside the range needs a reason; a change that touches §2, a brand colour (G3) or the data model (G1) is a gate. "v1" values were read from the code on 2026-10-10 and are re-verified by P0-01.

### Pin

| #   | Parameter                                | Citizens v1 today                                                                                      | Instagram (frame)                                                                 | Map v2 start value                                                                                                                            | Range / decided by                                                              | Item  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| E1  | Contributor pin size                     | 38 px, 46 selected (`map.jsx:215`)                                                                     | ≈ 52 px, 13 % of width (R01)                                                      | 48 px                                                                                                                                         | 40–52 px; M3, M6, label clutter at zoom 15                                      | P1-04 |
| E2  | Place and Event pins                     | Place 30 px circle, Event 40×32 rounded rectangle (`map.jsx:190-215`)                                  | one pin type: a place photo                                                       | keep v1 shapes (a venue, a gathering and an organisation stay distinguishable); pad each hit area to 44 px                                    | M6                                                                              | P1-04 |
| E3  | Border and separation on a **light** map | white 2.5 px stroke + `drop-shadow(0 3px 5px rgba(0,0,0,.32))` (`map.jsx:206,224,239`)                 | white ≈ 3 px, tuned for a dark map (R01)                                          | white 3 px + 1 px dark hairline + the v1 shadow                                                                                               | border 2.5–3 px; shadow and hairline by the M5 pixel sample (≥ 3:1 vs map base) | P1-04 |
| E4  | Selected-pin scale                       | ≈ 1.2× (30→38, 38→46, 40→48)                                                                           | ≈ 2×: 52 → 108 px (R04)                                                           | 1.6× over 200 ms                                                                                                                              | 1.5–2×; it must clear neighbours and the sheet                                  | P1-04 |
| E5  | Selected pin position                    | not specified (P0-01 to record)                                                                        | re-centres so the pin clears the sheet (R04)                                      | pin centre at the middle of the visible map above the sheet (about 27 % from the top with the sheet at 46 %)                                  | measure at 360×800 and 390×844                                                  | P1-04 |
| E6  | Picture on the pin, by zoom              | category glyph in the category colour (`map.jsx:240-243`); P0-01 confirms whether any logo path exists | a photo at every zoom; at region zoom all pins collapse into one "+37 more" (R03) | glyph below a photo zoom, logo at and above it, selected pin always shows its logo (**D8**)                                                   | photo zoom 13–15 (start 15); M3 and mobile data                                 | P1-04 |
| E7  | "+N" overlap badge                       | none ("no clustering", `map.jsx:22`)                                                                   | "+N more" under the name (R01, R03)                                               | only when ≥ 2 pins overlap, computed when the map goes idle                                                                                   | 2–3 pins; if M3 is missed, P2-02 clustering                                     | P1-04 |
| E8  | Name label                               | from zoom 15, selected always (`ZOOM_LABELS`)                                                          | ≈ 8–9 px and overlapping: a weak spot (R02)                                       | ≥ 11 px, weight 600, text halo, hide colliding labels; priority: upcoming event, then recent activity                                         | 11–12 px                                                                        | P1-04 |
| E9  | Pin pop-in during zoom                   | no churn: gating is CSS `display` on markers MapLibre owns                                             | photos vanish 0.2–0.4 s and return re-clustered (A2)                              | keep CSS gating; if an image swaps in, fade ≤ 120 ms; no blink                                                                                | —                                                                               | P1-04 |
| E10 | The base map's own icons                 | the MapTiler style draws its own coloured POI icons (not yet verified)                                 | the base is muted, POIs are the only saturated elements (A1)                      | test hiding or muting the style's POI layers at runtime so our pins are the only saturated marks; adopt only if no new style or key is needed | P0-02 and a screenshot pair                                                     | P1-04 |

### Sheet

| #   | Parameter                                                                     | Citizens v1 today                                                                                 | Instagram (frame)                                                                                                      | Map v2 start value                                                                                                                 | Range / decided by                                                                    | Item         |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------ |
| E11 | Snap points                                                                   | none: one small `EntityCard` preview                                                              | ≈ 10 %, 46 %, 90 % of height (A4)                                                                                      | peek = the card's height, 46 %, 90 % (`dvh`)                                                                                       | ±4 points                                                                             | P1-06        |
| E12 | Sheet surface on a **light** map                                              | `.glass` rgba(255,255,255,.72) + blur 20 px; `.glass-strong` .9 + blur 24 px (`index.html:88-98`) | opaque                                                                                                                 | solid `--surface-1`                                                                                                                | glass only if M3 holds with it; blur over a moving map is costly on a mid-range phone | P1-06        |
| E13 | Handle and corners                                                            | —                                                                                                 | handle ≈ 36×4 px, top radius ≈ 20 px                                                                                   | same, with a 44 px hit area                                                                                                        | radii from {8, 12, 20, 999}                                                           | P1-06        |
| E14 | Header content                                                                | the `EntityCard` preview (P0-01 records exactly what it shows)                                    | category, Open/Closed (green/red) with hours, Directions, More info, share, save, Follow, Message (R04, R06, R08, R12) | Directions and Share first, then Website and Call when present; an open state **only** from real hours (Q2)                        | Follow and Save wait for P2-04                                                        | P1-07        |
| E15 | Content arrival                                                               | no sheet content yet                                                                              | spinner for 3 s to more than 6 s (R04 → R05): a weak spot                                                              | skeleton at once; first content tile ≤ 1,000 ms; no spinner over 300 ms                                                            | fixed target (M2)                                                                     | P1-08        |
| E16 | Content grid                                                                  | —                                                                                                 | 3 columns, ≈ 2 px gaps, one 2-row featured tile (R05)                                                                  | same, without a featured tile unless one item is clearly newest                                                                    | tile ratio 1:1 or 4:5 from the median image plus the flyer-safe crop test             | P1-09        |
| E17 | Tabs                                                                          | —                                                                                                 | Top / Recent (R05)                                                                                                     | Events / News / Gallery; hide a tab with no data (live data: 0 upcoming events, 1 news post, so most tabs will be hidden or empty) | Upcoming / Recent sort is P2-07                                                       | P1-07, P1-10 |
| E18 | Header on scroll                                                              | —                                                                                                 | collapses to avatar, name, ⋮, ✕ at full height (R05)                                                                   | same                                                                                                                               | —                                                                                     | P1-07        |
| E19 | Second stacked sheet (address, Report, Open in Maps, Copy, QR, Share to; R09) | not built                                                                                         | a second sheet over the first, map dimmed (R09)                                                                        | DEFER: Directions and Share sit in the action row                                                                                  | trigger: contributors ask for QR (P2-06) or a report flow exists                      | —            |

### Colour, controls and timing (light map)

| #   | Parameter                         | Citizens v1 today                                            | Instagram (frame)                                                                                                                               | Map v2 start value                                                                                   | Range / decided by                                    | Item     |
| --- | --------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| E20 | Base map                          | MapTiler `streets-v2`, `--map-bg:#EDE5D4`                    | dark slate ≈ #41535E: reference only, do not reuse                                                                                              | **light, unchanged** (D1)                                                                            | dark is P2-11                                         | —        |
| E21 | Accent on light                   | gold `#C9A84C` (2.29:1 on white, calculated)                 | blue primary: do not copy                                                                                                                       | gold fill with a near-black label (8.71:1); dark gold `#8B6914` for gold text, rings, icons (5.09:1) | recompute on rendered pixels; a new colour is G3      | P1-02    |
| E22 | Category colour and glyph on pins | present: 17 event and 10 place categories, hex + Lucide icon | none; "no category colour or filter on pins" is a weak spot (A10)                                                                               | keep: a Citizens advantage                                                                           | —                                                     | P1-04    |
| E23 | Round map buttons                 | P0-01 to record                                              | back and locate ≈ 48 px (R01)                                                                                                                   | ≥ 44 px                                                                                              | M6                                                    | P1-04    |
| E24 | Motion                            | pins use `transition: all .15s` (`map.jsx:239`)              | sheet drag follows the finger 1:1                                                                                                               | transform and opacity only, 120 / 200 / 320 ms                                                       | M3, reduced motion (P1-03)                            | P1-03    |
| E25 | Pan smoothness                    | not measured (P0-04)                                         | ≈ 43 changing frames/s median in a 60 fps capture; 85 stalls over 100 ms in ≈ 230 s of motion (A9, an upper bound: the recording adds overhead) | M3: frame time p95 ≤ 20 ms with 150 markers                                                          | a target stricter than Instagram's observed behaviour | P1-04    |
| E26 | Scrim behind a stacked menu       | —                                                            | map dimmed; tapping the map dismisses (R09)                                                                                                     | near-black ≈ 40 % on the light map                                                                   | text over it ≥ 4.5:1                                  | with E19 |
