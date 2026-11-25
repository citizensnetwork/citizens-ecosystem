# Citizens Connect QA 2026-11-25 — fix plan

Source: the QA report "Does Citizens Connect help people take part?" (CC-QA-2026-11-25, 6 pages, run against `7bd49e5`, PR #391).
Written 2026-11-25 for an implementation session (Opus). This is a plan, not a status: nothing here is built.

**Verdict of the run:** 2 scenarios passed, 4 failed, 2 blocked. The failures are about trust (a wrong Directions pin), access (keyboard) and local relevance (city scope, empty searches, dates). The blocks are infrastructure (no staging, no Android link verification).

**How I checked this plan.** Every root cause below was traced in the source on this branch. Items marked _(unverified)_ rest only on the report's evidence. This container could not reach the live site (agent proxy 403) and the database tool was denied, so nothing was measured live. The first PR starts with a read-only data audit for that reason.

---

## 0. Ground rules for the implementing session

Read `apps/connect/VISION.md`, then `apps/connect/RESUME_HERE.md`, then the journal entries newer than its cursor. The cursor (2026-11-01) is 24 days old and 63 entries are unfolded: ask the founder for "fold now" before starting.

- One PR per workstream below, one push per PR (each push starts 3 deployments; the free cap is 100 a day).
- Gates: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`, run `build` before `typecheck`. Connect frontend work also runs `pnpm --filter citizens-connect test:e2e`, and `test:e2e:base-path` when routing, links or `config.js` change.
- `src/frontend/**` is excluded from ESLint: run a one-off `no-unused-vars` check on every touched file.
- A new `app/*.jsx` file must be registered in **both** `src/frontend/index.html` and `scripts/build-frontend.js` `appFileOrder`, or it works in dev and breaks in production.
- Touch/gesture code on the map panels uses non-passive **touch** events, not pointer events (see the 2026-11-25 journal traps).
- A migration is applied only after the founder says yes in chat; take the number from a fresh `list_migrations` (201 and 202 are reserved by #324 and #317). Every migration gets a probe and the security advisor (0 ERROR, no new finding).
- Public repo: no real organisation names, emails or user ids in tests, docs or fixtures. Use `.example` addresses and neutral names. Stage with explicit paths, never `git add -A`.
- Compact after each workstream; keep an offload file in `.claude/sessions/`; post one journal entry per PR.

---

## 1. Findings at a glance

| ID        | Sev     | What the QA saw                                                                                                    | Root cause (verified in source)                                                                                                                                                                                                                                                                  | PR          |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| CCQA-0009 | High    | Event shows a Pretoria venue; Directions point about 510 km away                                                   | Events have no venue link. Their pin is the **first** MapTiler hit for free text (`store.jsx` ~1272 create, ~1331 update): `limit=1&country=za`, no proximity bias, no relevance check, no pin confirmation. Directions then trust that pin (`map-v2-sheet.jsx:97`, `connect-previews.jsx:354`). | A           |
| CCQA-0004 | High    | 22 Tabs hit 6 offscreen and 3 covered pins (desktop); 14 and 1 at 390 px                                           | Every pin is `tabindex=0` by design (`map-v2-pins.jsx:11,291`); markers are never removed offscreen and nothing marks pins under a panel as inert (`map.jsx:545-556`).                                                                                                                           | B           |
| CCQA-0002 | Med     | Explore "Pretoria" returned 27 results, 15 in another city                                                         | The Explore city `<select>` only fires `cc-set-area`; the `matched` filter (`connect-explore.jsx` ~17) tests category and query, never location. The map search bar's city `<select>` is a **no-op** (`connect-chrome.jsx:352`, `onChange: () => {}`).                                           | C           |
| CCQA-0003 | Med     | Nonsense search left the map and Explore with no explanation                                                       | No zero state for the Explore tile grid or the map query. Only panel rows have empty strings.                                                                                                                                                                                                    | C           |
| CCQA-0005 | Med     | No public date filter; Me holds a personal calendar                                                                | `listingsFrom` carries only a pre-formatted `when` string; `map-v2-time.jsx` has SAST helpers but no filter UI.                                                                                                                                                                                  | D           |
| CCQA-0008 | Low     | Kingdom Projects header truncates at 390 px; Where to cards need 3 activations; Explore hero eats the first screen | Header text truncates (`pages.jsx` `Header` ~15). The 3-tap flow is a **founder decision of 2026-11-25** (journal, round 3-4). The hero is the new pack design (#389).                                                                                                                           | E           |
| CCQA-0001 | Open    | Guest button appeared after 12-27 s in the runner; 0.1-0.4 s after                                                 | The first-time boot waits on synchronous third-party scripts in `index.html` (Tailwind Play CDN, lucide, React, supabase-js, 3 Google font families) before React can render the guest gate (`shell.jsx:471`). Real-network cost _(unverified)_.                                                 | F           |
| CCQA-0007 | Med     | CSP allows inline scripts broadly                                                                                  | `next.config.ts:188` `script-src 'self' 'unsafe-inline' <CDNs>`; `index.html` has inline scripts and a runtime Tailwind config.                                                                                                                                                                  | F           |
| CC-08     | Blocked | `/.well-known/assetlinks.json` 404; Capacitor version mismatch; no device run                                      | No `assetlinks.json` exists in any app; the manifest only claims `219.co.za` (not cut over); `@capacitor/android ~8.4.3` vs `core/cli/ios ~8.5.3` (`package.json:30-36`); `appUrlOpen` handles only the sign-in callback.                                                                        | G           |
| CC-07     | Blocked | No isolated staging backend or QA roles                                                                            | One Supabase project, Free org, no branching; Preview check red (A7).                                                                                                                                                                                                                            | H           |
| Obs.      | —       | Kingdom Projects not verifiable as a guest                                                                         | `store.jsx:2109` says the ideas RPC is anon-callable, `:2122` says authenticated-only; migration 200 locked anon execute. Guests may be seeing an empty board.                                                                                                                                   | C or own PR |
| Obs.      | —       | Client loads the first 100 places and contributors                                                                 | Scale ceiling for discovery. _(loader not located yet)_                                                                                                                                                                                                                                          | F           |

---

## 2. Workstreams (recommended order)

Order is by harm: wrong information first, then access, then relevance, then release gates, then speed. If the PR F measurement shows the guest button later than 5 s on throttled 4G, promote F ahead of B.

### PR A — Event location truth (CCQA-0009, High) · M

**Why first.** A visitor who follows Directions to a pin 510 km from the venue is lost and stops trusting the map. Vision test 5 (excellence as stewardship) and test 3 (a small organiser's event must not be mislocated).

**Step 0 — read-only audit (needs a session with DB access).** List events, places and contributors whose pin is far from the area their own address text names, or has no pin. Haversine against the six `CITIES` centres plus a South Africa bounding box (lat -35 to -22, lng 16 to 33). Output a table for the founder to confirm with owners. Fix wrong rows through the owner's or an admin's own session, never `service_role`.

**Step 1 — one geocoder, used by every writer.** Add `resolveLocation(query, { near })` in one frontend module (register it in `index.html` and `appFileOrder`). It calls MapTiler with `proximity` (the person's area centre), `limit=5`, `country=za`, and returns candidates with relevance, type and context. It auto-accepts only a hit with relevance of at least 0.8 within N km of the typed or selected city; otherwise it returns `needsConfirm`. Replace the bare `geocodeAddress` in `store.jsx` create and update paths. Check the same pattern in `lib/intake/googleForm.ts`, `app/api/intake/google-form/route.ts`, `app/api/automation/suggestions/route.ts`, `lib/aiSearch.ts` and admin create.

**Step 2 — confirm the pin.** Event and place forms show the resolved address and a draggable pin ("Is this the right spot?"). The event create path currently **ignores** `form.lat/lng` (places and contributors honour them): bring events to parity and reuse the existing location-picker map and `reverseGeocode`.

**Step 3 — Directions that fail safe.** One pure `directionsFor(item)` used by both call sites. If the pin is more than 150 km from the city named in the item's own address, or was never confirmed, send the address text (`destination=<address>`) so the provider's own geocoder decides. Never present a wildly distant pin as the destination.

**Step 4 — admin "Pins to check" list** (client-side rule, no migration): surfaces the same outliers on an ongoing basis.

**Optional, needs founder yes (migration):** `location_confirmed_at` on events, so Directions can say "pin not yet confirmed". Do not start with this.

**Tests.** Vitest: `resolveLocation` with ambiguous-name fixtures; `directionsFor` cases (near, far, no pin). E2E: a mocked geocoder returns a far hit, so the form must block on the confirm step and Directions must use the address.
**Done when:** the QA acceptance holds: the owner confirms the venue and address, pin and Directions agree.

### PR B — Keyboard and screen-reader access to the map (CCQA-0004, High) · M

1. **Only visible pins are Tab stops.** On `moveend`, `zoomend` and panel open/close, compute which pins are inside the viewport and not under the Explore panel, sheet or nav. Give at most 12 (nearest to the centre, reading order) `tabindex=0`; every other pin gets `tabindex=-1` and `aria-hidden=true`. Throttle with `requestAnimationFrame`. Never rebuild markers for this.
2. **Open sheets and panels make the map `inert`**, and closing one returns focus to the pin that opened it (use a `useLayoutEffect` clean-up, per the journal trap for carousels).
3. **Skip link and list view.** A first Tab stop "Skip map, jump to list", and a **List view toggle** that is a full equal alternative to the map (also helps screen-reader users and slow phones). This is the innovation of this PR: the map is not the only way in.
4. **Announce the map.** A polite `role=status` line ("12 places in view") updated on `moveend`, debounced.
5. Optional: arrow-key movement between neighbouring pins.

**Tests.** New e2e `keyboard-focus.spec.ts` at 1440x900 and 390x844: press Tab N times; every focused element must be inside the viewport and `elementFromPoint` at its centre must be itself. Fail on any offscreen or covered stop. Consider `@axe-core/playwright` on the three main screens (new dependency: pin exactly and check OSV before pushing). Extend `docs/audit/a11y-baseline.md` with the new measurements.

### PR C — Local scope and honest zero states (CCQA-0002/0003, Medium) · M

1. **A real city scope.** One pure `cityScope(item, city, radiusKm)` (default 35 km, haversine on the item's pin). Use it in Explore rows and in map search. Make the search-bar city `<select>` work through the same `useArea` setter, or remove it.
2. **Never hide the small.** Items with no pin (online, no venue) are included when their serving areas (migration 195, `serving-areas-lib.jsx`) cover the city; otherwise they sit in an explicit "Online and serving across South Africa" group instead of vanishing. Vision tests 3 and 6.
3. **Say the scope.** "Showing Pretoria: 12 near you · Widen to all South Africa".
4. **Better matching.** Include location and suburb text, ignore case and diacritics, multi-word AND.
5. **A `NoResults` component** (`role=status`, `aria-live=polite`) for Explore and the map: "Nothing for "xyz" in Pretoria yet." with actions: Clear · Widen the area · Suggest a listing (reuse the existing suggestion flow). Clearing restores the previous view and focus.
6. **Innovation: turn empty searches into a recruiting signal.** Log the zero-result term and city (aggregate only, no user id) to the existing `search_term_stats` (service_role-only, see how `/api/search` writes it). It tells the founder which needs and cities have no listings: a target list for roadmap item C54 (Contributors ready before recruiting).
7. **Kingdom Projects as a guest.** Read the grants (`has_function_privilege`, read-only) on `get_community_ideas`. If guests are blocked, show a teaser ("Sign in to see and back community projects") rather than a blank board. Making the board publicly readable is a migration and needs the founder's yes.

**Founder decisions:** default radius; whether Pretoria includes Centurion and Midrand (both fall inside 35 km).
**Tests.** Vitest `cityScope` boundary fixtures (Pretoria vs Johannesburg, about 55 km). E2E: pick a city, every visible tile is inside the radius; a nonsense term shows the status line and a way out.

### PR D — Dated discovery: "what is on this weekend?" (CCQA-0005, Medium) · M

1. Carry the raw ISO `startsAt` and `endsAt` into `listingsFrom` rows (today it keeps only the display string).
2. Add `WhenChips`: **Today · This weekend · Next 7 days · Pick a date** to Explore and the Where to... strip. Bucket maths goes into `map-v2-time.jsx` (SAST is a fixed UTC+2, so no DST): `weekendRange(now)`, covering Friday 17:00 to Sunday midnight; multi-day events count on overlap; past events stay excluded.
3. Every event card ends with a clear next step: Directions · Connect · Add to calendar (ICS) · Share, and a date line ("Sat 28 Nov · 18:00 · Pretoria East"). Keep the personal calendar in Me, labelled "My calendar".
4. **Innovation:** a "This weekend in {city}" shelf at the top of Explore. When it is empty, offer "Start a Let's gathering" (the existing Let's feature, C43/C44) so an empty weekend becomes a call to serve rather than a dead end.
   **Tests.** Unit: weekend boundaries around midnight and the UTC+2 offset. E2E: choose This weekend, see only matching events, and open one.

### PR E — Mobile hierarchy (CCQA-0008, Low) · S

- **Header:** let the Kingdom Projects title wrap to two lines and put its action on its own row at 400 px and below. Check 360, 390 and 412 px with screenshots (the QA only measured 390).
- **Where to cards:** do **not** revert the three-step flow. The founder chose it on 2026-11-25 so every option can be seen from a distance. Instead add a visible "Details" button on the chosen card (one tap to the preview) and keep the gestures. Founder yes needed.
- **Explore hero on a phone:** compact it (about 96-120 px) or move it below the first row so results appear above the fold. This changes the pack design of #389: present it as a variant for the founder to approve.

### PR F — Cold entry, Tailwind and the CSP (CCQA-0001, CCQA-0007) · L, split in three

Cold entry is the front door for every first-time visitor, so it counts even though the runner's 12-27 s may be partly the runner.

**F0 — measure first (gate for the rest).** Run Lighthouse or WebPageTest on production at mobile 4G, cold and warm; add a `performance.mark('cc-guest-visible')` and an e2e that records it under CDP throttling. Set a budget (target: guest button visible within 3 s on throttled 4G).

**F1 — remove the render blockers.**

- Drop the Tailwind Play CDN (existing item S3): compile at build into a hashed CSS file and move the inline `tailwind.config` into `tailwind.config.js`. The `.cc-map` rule already makes the switch safe.
- Drop the Google font links if the 2026-11-09 decision (system sans) already retired those families; verify in the CSS first.
- Add `preload` and `defer` hints and a lightweight pre-React skeleton in `index.html` ("Connecting the Kingdom", loading state) so the first paint never waits on a script.

**F2 — vendor the libraries** (React production, supabase-js, lucide) into the hashed build, same origin, immutable cache. This removes three third-party origins from the critical path and from the CSP, and helps the native shell launch offline (a QA native-matrix row).

**F3 — tighten the CSP (CCQA-0007).** The frontend is static HTML, so per-request nonces are impossible; use external scripts or build-time sha256 hashes.

1. Ship `Content-Security-Policy-Report-Only` with the strict policy first (rate-limited report endpoint via `@citizens/utils`), watch for violations, then enforce.
2. Target `script-src 'self'` with no CDN hosts and no `'unsafe-inline'`. Use `style-src-elem 'self'` plus `style-src-attr 'unsafe-inline'` as the pragmatic first step for React inline styles.
3. Follow the hub's stricter CSP as the in-repo precedent.
4. Add a test (next to `basePath.test.ts`) that fails if `'unsafe-inline'` returns to `script-src`.

**Scale (observation).** Locate the "first 100 places and contributors" loaders and move them to a viewport or cursor query through `/api/v1`; add a synthetic 5,000-item catalogue test. Do not let this block F1.

**Deployment note:** F1 changes every page; run the full e2e in both modes and do a phone check before merging.

### PR G — Android release gates (CC-08) · M, partly founder

1. **Serve the file, on the host that is actually live.** `https://www.citizenscentral.co.za` is production today; the manifest only claims `219.co.za`. Add `apps/connect/public/.well-known/assetlinks.json` for the live host plus a second `autoVerify` intent filter for it; the hub serves the `219.co.za` copy at cutover. **Founder action:** the release-signing SHA-256 (Play Console, App signing, or `keytool -list -v`). Do not commit a placeholder fingerprint; a file that cannot verify is worse than none.
2. **The middleware matcher does not exclude `.well-known`** (`src/middleware.ts:91-95`): it runs the Supabase `getUser()` on that path. Exclude it. Add a test: JSON, `application/json`, 200, no redirect, valid package id, fingerprint pattern.
3. **Route the app link** (code gap already written up in `docs/MOBILE_LAUNCH_RUNBOOK.md`): handle `appUrlOpen` for https links and `App.getLaunchUrl()` on cold start; strip `PUBLIC_BASE_PATH`, then `CC_ROUTES.navFromPath`. One pure, unit-tested `routeFromAppLink(url)`. This is the "share into the same listing, sign-in return" acceptance row.
4. **Align Capacitor.** `@capacitor/android ~8.4.3` was capped back during the OSV hygiene work (PR #94). Check OSV for 8.5.x, bump to `~8.5.3`, run `cap sync android`, commit the generated files, and add a test that core, cli, android and ios share a minor.
5. **Device evidence.** This container has no Android SDK, emulator or device. Add a CI `assembleDebug` job (unsigned) and give the founder a one-page evidence template matching the QA's three rows (build and devices, everyday navigation, participate and return); run the matrix on a physical phone per the runbook.

### PR H — A real staging, then authenticated QA (CC-07) · M, mostly founder and infra

**Recommended:** a second Supabase project (`citizens-staging`, Free tier; verify the org still has a free slot) with the migration lineage replayed by the CLI, Vercel Preview env vars pointing at it, Resend in a delivery sink, and a seed script for three test accounts (citizen, contributor, admin; `.example` addresses; cleanup script). **Trap:** founder item A7 says live migration versions are timestamps while the repo files are numbered; do not rename files or repair rows, so the replay must map them. **Alternative:** Supabase Pro branching (A9, parked, costs money; hosting upgrades were declined for cost on 2026-11-01).
Then add an `e2e-staging` Playwright project (scheduled, not per-PR, because it needs secrets) covering the QA's Phase 3 list: citizen join, refresh, calendar appears, cancel; contributor draft stays private until published, can be edited and removed. The staging service-role key never enters the repo.

### PR I — Keep the evidence usable (Phase 5) · S

- `docs/qa/`: a findings register (CCQA-0001 to 0009, CC-07, CC-08 with status), the weekly runbook, and a run log for 2026-11-25. Register the new pipeline rows in the journal entry; the daily fold assigns IDs.
- **Small-contributor journey fixture and test.** A synthetic contributor with no venue and an event-less profile must be findable by need or category, by city (through serving areas), and by event, and each path must end in a credible next step (follow, message or website). This turns Vision test 3 into a regression test.
- **Weekly QA schedule:** propose a Monday SAST scheduled run after PRs A to D land; do not create it without the founder's yes.
- Post-deploy smoke script: `assetlinks.json` is 200, headers are present, the guest button mark is under budget.

---

## 3. New ideas beyond the report

| Idea                                                                  | Why                                                                                | Where |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----- |
| Fail-safe Directions (address when the pin is doubtful)               | One bad pin can no longer send anyone 500 km away                                  | A     |
| Admin "Pins to check" list                                            | Keeps location quality honest as listings grow                                     | A     |
| List view as an equal alternative to the map                          | Keyboard, screen reader, low-end phones                                            | B     |
| Zero-result searches as a recruiting signal (aggregate only)          | Shows where Contributors are missing; feeds C54                                    | C     |
| "This weekend in {city}" shelf, empty state invites a Let's gathering | A first-time visitor sees what to do, and an empty weekend becomes a call to serve | D     |
| Performance budget in CI (guest-visible mark under throttling)        | Stops the front door regressing silently                                           | F     |
| CSP in report-only before enforcing                                   | Tightens security without breaking the app                                         | F     |
| Small-contributor reach test                                          | Keeps "the small are honoured" a measured fact                                     | I     |

## 4. Founder decisions needed (my recommended default first)

1. City radius: 35 km; Pretoria includes Centurion and Midrand. Yes?
2. Where to cards: keep the three-step flow and add a "Details" button?
3. Compact the Explore hero on phones (variant of the #389 design)?
4. Staging: a second free Supabase project (recommended) or Pro branching?
5. Release signing SHA-256 for `assetlinks.json`, and add a verified link for the live domain until the `219.co.za` cutover?
6. Make Kingdom Projects publicly readable (migration) or show guests a sign-in teaser?
7. Confirm the MapTiler key is restricted by referrer in the MapTiler dashboard (more geocoding calls are coming; item H11 notes a key in a tracked document).
8. Optional migration: `location_confirmed_at` on events?
9. Ask for "fold now" before work starts (63 unfolded journal entries).

## 5. Sequence, size and cost

`Step 0 audit and fold` → **A** → **B** → **C** → **D** → **E** → **F0** (measure; promote if slow) → **F1 → F2 → F3** → **G** (parallel with the founder's signing action) → **H** (parallel, infra) → **I**.
Nine PRs means about nine pushes and 27 deployments: spread them over several days given the 100-a-day cap. A, B, F and G cut across the map, build and native layers and suit a long, careful Opus session; E and I are small.

## 6. Vibe-security checklist for the implementing session

- No new `service_role` usage; admin fixes go through the admin's own session.
- Zero-result logging stores no user id and no free-text beyond the term; confirm it cannot be used to read other users' searches.
- The staging seed, report endpoint and `assetlinks.json` carry no secrets; staging keys stay in the host's env, never in the repo.
- Any new endpoint (CSP report) is rate limited and size capped.
- Any migration: RLS on, SECURITY DEFINER functions start with the `auth.uid() is null or …` guard, `search_path=''`, probe plus advisor.
- Re-read `VISION.md` before shipping each PR and run its alignment self-prompt.

## 7. Not verified here

- The live 404, headers and timings (no network to production from this container).
- The size and shape of the wrong-pin problem in live data (database tool denied): PR A Step 0 answers it.
- Whether `get_community_ideas` is open to guests (Observation, PR C item 7).
- Where the "first 100" catalogue loaders live.
- Real-network cold-start time (PR F0).
