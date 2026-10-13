# Map v2: handoff for the next phase (written 2026-10-12)

**Read this, then paste the prompt at the bottom into a new Claude Code session opened at the monorepo root.**
Source of truth for the project: `docs/MAP_UX_TRACKER.md` (item C19 in `apps/connect/RESUME_HERE.md`).

> **Update 2026-10-13 (Phase 1.5 done except R3):** Map v2 is now **the default map for everyone** (PR #106; the founder said yes to D15 in chat). `?map=v1` opts one device out, `?map=v2` brings it back, and `DEFAULT_ON = false` in `app/map-v2-lib.jsx` is the one-line rollback. **R1** (logo) was merged earlier (#99, #101); **R2, R4 and R5 are done** (evidence: tracker section 8A and 11.2); **R3 is still the founder's step** (the MapTiler usage page and an alert; see RESUME A12). Sections 1 to 4 below describe the state BEFORE this change; **start Phase 2 at its recommended order below** (P2-07, P2-08, P2-06), and skip R1 to R5 in the section 5 prompt.

---

## 1. Where Map v2 stands

- **Phase 1 is merged to `main`** (PR #96, 2026-10-12), still **behind the flag**: `?map=v2` turns it on for that device, `?map=v1` turns it off. Without the flag everyone sees the old map, unchanged.
- **What Phase 1 delivered:** logo/glyph pins (glyph below zoom 15, logo at and above it, the selected pin always shows its logo), one bottom sheet for an organisation, a place and an event (half / peek / full; a 380 px side panel at 768 px and up), Directions / Share / Website / Call only when the data exists, Events / News / Gallery tabs only when there is something to show, a loading skeleton, "Try again" for failed photos, an uncropped photo viewer, "Open · closes 17:00" only when the hours text is fully understood.
- **Look:** follows the phone's own light/dark setting, live (founder, 2026-10-12: D1 revised; the Map look button and the "map v2" badge were removed). Dark uses MapTiler's `dataviz-dark` on the existing key. The shared chrome (search row, category pills, Map Key, bottom navigation) stays light in dark mode: making it dark is app-wide (RESUME C17).
- **Founder sign-offs:** the Android Back test passed on a real phone (tap a pin, Back closes the sheet and stays on the map; same after dragging the sheet). The dark look was approved ("Great").
- **Founder decisions:** D1 to D11, D13, D14 answered (tracker §10). **D12: MapTiler stays on the Free plan for now.**
- **C20 (old card's Share copied nothing):** fixed for everyone in PR #97.

## 2. What to do next, in order

### Phase 1.5: roll Map v2 out to everyone (small, do first)

| #    | Item                                                                                                                                                                                                                                                                                                                                                        | Size | Needs                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------- |
| R1   | **DONE (2026-10-12, branch `claude/maptiler-logo`):** MapTiler's logo, linked to maptiler.com, bottom-left on every map: at the foot of the home map's bottom-left overlay column (clear of the phone's bottom navigation at every width) and as a map control on the LocationPicker, which also got back its missing © MapTiler / © OpenStreetMap credit. White lettering on a translucent near-black plate, readable on the light and dark maps. At the founder's request the Map Key was removed, and the required © MapTiler / © OpenStreetMap credit became a small dark pill in the same style (9 px; it folds to an "i" after the first pan) instead of a long white bar; it cannot be removed (MapTiler terms, all plans; the OpenStreetMap licence). Screenshots `docs/audit/img/maptiler-logo-*.png`; `e2e/map-attribution.spec.ts`. | S    | founder screenshot OK, merge |
| R2   | **Turn the flag on by default (new decision MAP:D15).** Default ON, `?map=v1` stays as the escape hatch for a release or two, then delete v1's map code paths. Re-run M7 the other way round (v1 behind the flag must still work) and the e2e suite.                                                                                                       | S–M  | founder yes on D15                        |
| R3   | **Watch the MapTiler quota.** Free = 5,000 sessions and 100,000 requests a month (about 17 requests per visit; the 5,000 sessions run out first, so roughly 5,000 map visits); over that, **the map stops loading until next month**. Before R2 ships, check the account's usage page and set an alert; if a launch push is coming, budget Flex ($30 a month) or the OpenFreeMap fallback. | S    | founder checks the MapTiler usage page    |
| R4   | **Flag-on landing blocking time (+170 ms in Lighthouse, JavaScript equal).** Likely style recalculation from `map-v2.css` plus the `data-theme` attribute landing in a script task. Once v2 is the default, inline or preload the tokens with the main stylesheet and re-measure (`docs/audit/phase1-qa.md` §4).                                          | S    | -                                         |
| R5   | **D14 follow-up:** after R2 the +13.7 KB gzipped is no longer "extra"; close D14. If v1 is deleted, the bundle shrinks again.                                                                                                                                                                                                                               | S    | -                                         |

### Phase 2 (tracker §9), recommended order

1. **P2-07 Upcoming | Recent sort** in the tabs (S, front-end only).
2. **P2-08 count buckets** ("100+", shown only at 100 or more; never below, so small ministries are not shown with low numbers) (S, SELECT-only aggregate).
3. **P2-06 QR code per contributor** for printing at venues (M, front-end; stable `/c/<slug>` links exist). No new dependency: generate the QR in-house or ask (G2).
4. **P2-01 nearby list inside the expanded sheet** (M). **Needs D2** (sheet beside or replacing the profile page; the default "beside" has stood since 2026-10-10 without an explicit answer: confirm).
5. **P2-02 clustering:** only on its trigger (M3 missed above 150 markers, or the +N badge not resolving dense areas). Pretoria has about 50 pins today: likely not yet.
6. **P2-03 "Search this area":** only on its trigger (the dataset no longer loads in one request).
7. **G1 items, each needs a migration and founder approval first:** P2-04 Follow and Save with notifications (also G6), P2-05 Moments (24-hour updates; Q4 review), P2-09 co-hosted events. Write the SQL to `docs/proposals/` and stop.
8. **P2-10 crown logo and loading screen in Connect** overlaps RESUME C17 (one design reference); coordinate rather than duplicate.

### Separate small PRs found during Phase 1 (not Map v2, but worth doing)

- **Pinch zoom is blocked app-wide** (`maximum-scale` in the viewport meta): Lighthouse accessibility 92 instead of 95+. Remove it for the website, test the Capacitor app on a phone first.
- **Restrict the MapTiler key by HTTP referrer** in the MapTiler dashboard (RESUME H11; founder action).

## 3. The base map provider: should it move to Google Maps?

Recommendation: **no, not for the base map.** Keep MapLibre with MapTiler now, and use OpenFreeMap as the free fallback if the Free-plan licence or quota becomes a problem. Reasons, briefly:

- **Cost grows with every visitor.** Google's Maps JavaScript API ("Dynamic Maps") gives 10,000 free map loads a month, then $7 per 1,000 (cheaper per 1,000 at higher volume). Example: 50,000 map loads a month = 40,000 paid = about **$280 a month**. Google for Nonprofits can add Maps credits (from $250 a month) if Citizens is a verified nonprofit there. MapTiler Flex is $30 a month for about 25,000 visits; OpenFreeMap is free with no request limit and allows commercial use.
- **It is a rewrite, not a switch.** Pins, labels, the sheet's map padding, the zoom gates and the dark look are built on MapLibre; Google needs its own map library, its own marker API and Google-hosted map styling, plus a billing account with a card and budget alerts.
- **Google's own business pins compete with ours.** Its base map shows commercial points of interest; Citizens exists to make small, unseen contributors visible (VISION, litmus test 3). They can be styled away, but that is extra work against the default.
- **Where Google already helps, for free:** the sheet's Directions button opens Google Maps itself (no API, no cost). If address entry ever needs autocomplete, Google's Places API can be added for that one form without changing the map.

Sources (accessed 2026-10-12): [Google Maps Platform pricing overview](https://developers.google.com/maps/billing/overview/), [the March 2025 free-usage change](https://mapsplatform.google.com/resources/blog/build-more-for-free-and-access-more-discounts-online-with-google-maps-platform-updates/), [Google for Nonprofits: Maps Platform credits](https://support.google.com/nonprofits/topic/16220109?hl=en-GB), MapTiler and OpenFreeMap figures from `docs/audit/map-tiles.md`.

## 4. Things a new session must know

- **Code:** `apps/connect/src/frontend/app/map-v2-*.jsx` (lib, strings, time, pins, gallery, sheet), small flagged branches in `map.jsx`, `home.jsx`, `entity-card.jsx`; tokens and components in `src/frontend/assets/map-v2.css` (loaded only with the flag on). IIFE-on-window modules; a new `.jsx` goes into BOTH `index.html` and `scripts/build-frontend.js` `appFileOrder`; bump the `?v=` on every touched file (and `CSS_HREF` in `map-v2-lib.jsx` when the CSS changes).
- **Tests:** `src/__tests__/frontend/mapV2*.test.ts`; `e2e/map-v2*.spec.ts` (hermetic, MapTiler and the API are mocked; `e2e/support/map-v2.ts`). Measurement tools: `apps/connect/scripts/map-v2/` (headless Chromium needs GPU flags or frame times are 10x too slow).
- **Performance traps already paid for:** a marker's inner nodes must not carry `class` attributes (the Tailwind CDN observer cost 31 ms p95 per pan frame on 150 pins: use `data-mv2`); the marker's outer element carries no `var()` properties.
- **Back behaviour:** one `useBackGuard` entry per overlay; history entries only inside a tap or key press. Real-phone tested 2026-10-12. Playwright cannot reproduce Android Chrome's Back: re-test on a phone after any change to the sheet or routing.
- **Previews:** every PR gets a Vercel preview (the vercel[bot] comment, "Preview"); it is behind Vercel login, and **it reads and writes the live database**. The branch alias URL always shows the newest push; add `?map=v2` once per device.
- **Process:** branch from `origin/main`, draft PR, never push to `main`, never force-push, stage explicit paths only (untracked local briefs name real organisations), CodeQL also scans local `.mjs` tools. Merging is the founder's decision.

## 5. Prompt for the next session (paste everything below the line)

---

ROLE
You are a senior product designer-engineer on Citizens Connect (Pretoria, v1) in the Citizens ecosystem monorepo, continuing Map v2 (RESUME_HERE item C19).

READ FIRST, in this order

1. `apps/connect/VISION.md`: run its alignment self-prompt on this work now and again before shipping.
2. Root `CLAUDE.md` and `apps/connect/CLAUDE.md` (offload file in `.claude/sessions/`, compaction, vibe-security, ask when unclear).
3. `apps/connect/RESUME_HERE.md` (item C19 and §3 standing rules). Verify its claims against git and the code.
4. `apps/connect/docs/handoffs/MAP_V2_NEXT_PHASE_HANDOFF.md` (this file): sections 1 to 4.
5. `docs/MAP_UX_TRACKER.md` in full (guardrails §5, gates, Decision Log §11.1, Appendix E). The tracker stays the source of truth: add the Phase 1.5 items R1 to R5 to it as a new section before Phase 2, with Accept lines, and log every decision.

RUN
PHASE = 1.5, then 2. STOP_AFTER = R5 (Phase 1.5) unless I say otherwise in chat.
Before coding, ask me (one AskUserQuestion, recommendations first): D15 (turn Map v2 on for everyone, keeping `?map=v1` as an escape hatch), the R1 logo screenshot sign-off when ready, and D2 (only when you reach P2-01).

HARD RULES (full list: tracker §5)

- Branch from the latest `origin/main` (e.g. `claude/map-v2-rollout`); draft PR; never push to `main`; never force-push; merging is my decision.
- No DB writes, migrations, RLS or auth changes without my explicit yes (write SQL to `docs/proposals/` and stop the item: Gate G1). SELECT-only, aggregate counts only, no personal data in any output.
- No new dependency (G2). No new brand colour or third-party logo without my screenshot sign-off (G3).
- Bump `?v=` on every touched frontend file; new `.jsx` into `index.html` AND `appFileOrder`; dev (Babel) and production (`build-frontend.js`) both render.
- Gates, workspace-wide: `pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm test`, then `pnpm --filter citizens-connect test:e2e` (port 3100 free first).
- Tick a box only with evidence (commit hash plus a measured number or a screenshot path); otherwise write NOT MEASURED and why.
- Stage explicit paths only; scan the diff against `main` before every push.

FINAL REPORT (plain language, for a non-engineer, one screen)
What now works and how to try it on a phone (preview link + flag), item / status / evidence table, measured vs targets, decisions I need (numbered, with your recommendation), risks and rollback, what to test on a real phone. Then update RESUME_HERE C19 once, at the end.
