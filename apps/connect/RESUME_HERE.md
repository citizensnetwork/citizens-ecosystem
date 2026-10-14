# RESUME_HERE — Citizens Ecosystem (Connect · Vision · Wear)

> **Read this first. It is the single source of truth for "where are we?" between sessions.**
> Read [`VISION.md`](VISION.md) before it, and follow the root [`CLAUDE.md`](../../CLAUDE.md).
>
> **This file holds current state, standing rules and open work only.** History lives in the archive:
> - §3A–§3AT (June → Sept 2026) and the old NEXT STEPS block, verbatim:
>   [`docs/archive/RESUME_HISTORY_2026H2.md`](docs/archive/RESUME_HISTORY_2026H2.md). **Section numbers are
>   unchanged**, so a doc that cites "RESUME_HERE §3AS" resolves there.
> - Phase 0 → mid-June 2026 (§2x batches): [`docs/archive/RESUME_HISTORY_2026H1.md`](docs/archive/RESUME_HISTORY_2026H1.md).
>
> **Last audit: 2026-10-04** (`main` = the C16 PR #92's merge commit `30507e9`, on top of the C15 routing PR #89 `6acbdcc`). §2, the A, C and H items and §5's P1/P11 were re-checked against
> git, GitHub, Supabase and Vercel. The S, V, W and M items were last re-checked on 2026-09-27. **2026-10-10:** the founder signed off the
> C15 live checks and re-entered the Resend key (nothing else was re-audited; `main` had not moved). **Later the same day:** the Map v2
> runner prompt and tracker were reconciled against this file, `git`/GitHub and `map.jsx`, and the founder's Map v2 decisions were recorded
> (docs only; item **C19**; `main` had moved by PR #94 meanwhile). **Later the same day, Map v2 Phase 1 was built** (PR #96; see §2 and §6). **2026-10-12:** PR #96 (Map v2 Phase 1, still behind `?map=v2`) and PR #97 (C20, the card's Share) merged. **Later the same day:** PR #91 (docs: H10, H2) and PR #90 (D-13, the owner welcome email) merged, and 43 merged remote branches were deleted (H2); see §6. **2026-10-13:** the agent-team docs PR #98 merged and the branch review cleared every old branch (H2, §6). **Later the same day: Map v2 became the default map for everyone** (PR #106, C19 Phase 1.5, founder decision D15; `?map=v1` opts a device out; see §2, §6, A12). Tags like `(§3AP)` point to the
> archived section with the detail.

### How to update this file (end of every session)
1. Update §2 (state snapshot) when a number changes: migration head, advisor baseline, test counts, deploys.
2. Tick, edit or add items in §4. Keep item IDs stable so the founder can refer to them. Delete an item once
   it is done, and say so in your §6 entry.
3. Add one short entry (5–10 lines) at the top of §6. The long write-up goes in the PR description or a
   `docs/handoffs/` brief, **not** here. When §6 passes about 8 entries, move the oldest to the archive.

---

## 1. Project at a glance

| | Connect | Vision | Wear |
|---|---|---|---|
| What | Map-first discovery of Christian Contributors, Places and Events (Pretoria first) | Intelligence/impact back-office for organisations | Kingdom-aligned fashion: brands and a community Concepts marketplace |
| Code | `apps/connect` | `apps/vision` | `apps/wear` |
| Frontend | Standalone HTML/React app in `src/frontend/`, precompiled by `@citizens/frontend-build` (esbuild) | Same model, desktop-first, no Capacitor | Same model |
| Backend | Next.js 15 **API-only** (`/api/*`, public `/api/v1`) | Next.js 16 API-only (45 handlers) | Next.js 15 API-only (`/api/*`, Bearer-or-cookie `handler()`) |
| DB schema | `public` (the commons) | `vision.*` | `wear.*` |
| Production | https://www.citizenscentral.co.za | https://citizens-ecosystem-vision.vercel.app | https://citizens-ecosystem-wear.vercel.app |
| Mobile | Capacitor 8 shell (`android/`, `ios/`), never tested on a device | none (by design) | JS bridge ready, no native shell yet |

- **One Supabase project for all three apps:** `xyiajtrvhlxaeplsiajj` (Free org: no branching, no HIBP). One
  `auth.users`. **RLS is the only isolation wall.** Cross-app reads go through Connect's `/api/v1`, never a
  sibling's tables. Contract: [`docs/SHARED_DB_CONTRACT.md`](docs/SHARED_DB_CONTRACT.md).
- **Monorepo** `citizensnetwork/citizens-ecosystem` (pnpm 9 + turbo). Shared packages: `@citizens/frontend-build`,
  `@citizens/utils` (rate limit + gate), `@citizens/db`, `@citizens/connect-client`, `@citizens/ui` (no consumer yet).
- **Vercel team** `citizensecosystem-projects`, one project per app, auto-deploying on push to `main`. Docs-only
  merges skip the Vision and Wear builds; they show as CANCELED, which is expected.
- **Design:** white-black-gold (60/30/10), map-first, glass overlays. Slogan **Connecting the Kingdom** (Eph 2:19–22).
- **Connect v1 bar:** the minimal repeatable loop in [`V1_SCOPE.md`](V1_SCOPE.md): add a Contributor, Place or
  Event with essential fields, see it in Kingdom Discovery, see it on the map. Contributor / Place / Event is
  the locked three-type model. "Entity" is an informal word, not a fourth table.

---

## 2. Current state snapshot (verified 2026-10-04)

- **`main` = the merge commit of PR #107** (2026-10-14: the Builder spec, docs only), on top of PR #105 (`d9ba496`: the Reviewer docs), PR #106 (`7a58d41`, 2026-10-13 night: Map v2 is the default map), PR #104 (`b7f78ea`: the Dispatcher docs), #103 (docs), PR #98 (`af6027f`: the agent-team docs), #100 (docs), #101 and #99 (the MapTiler logo; the map credit no longer slides under the zoom hint), PR #90 (`7f2e7dd`, 2026-10-12: D-13, admin-created listings email the owner a welcome), #91 (docs: H10, H2), #97 (C20), #96 (Map v2 Phase 1), PR #93 (docs: sign-off, Map v2 plan), PR #94 (`51c2fab`, the OSV fix: Next 15.5.27 / 16.3.8,
  Capacitor 8.4.3, sharp 0.35.5, source-map-js 1.2.2), PR #92 (C16, Listing Automation Phase 1; see its §6 entry), `6acbdcc` (PR #89, C15: a real URL
  for every screen), #88 (D-12 mig 180: self-serve applications wait for an admin), #86 (mig 179), #87 (the patched `braces` fork), #85
  (the repo's `intake.gs` is the corrected script), #84 (C1/C1b owner fetch), #83 (docs) and #82 (Wear's crown + splash). The 14 stale Dependabot PRs were
  closed on 2026-10-13 (the founder's yes in chat; Dependabot will not reopen the same version, only a newer one).
- **Database head = migration 181** (`20261004103205 / 181_listing_automation_phase1`, applied 2026-10-04 with the founder's yes; 180 is
  `20261004061633`, #88; 179 is #86). Always re-run `list_migrations` and **take the next free number at apply time.** Pre-apply tag
  `connect-pre-mig181-listing-automation` (pushed). The 30-check rollback-only probe passed with no FAIL and left no rows. The recorded
  statement differs from the repo file only in its header comment (the SQL is the same); the repo file is the reference. Everything
  is dormant: every Contributor is at `off`, no key is minted.
- **Security advisor baseline: 0 ERROR / 121 WARN / 3 INFO** (re-measured 2026-10-04 right after 181: it was 118 WARN before, not 119, and
  181 added exactly the three expected functions). Every WARN is known and accepted: 108 authenticated + 11 anon SECURITY DEFINER EXECUTE
  grants (by design, each documented in its migration), HIBP (needs Supabase Pro), and `pg_net` in `public`. The 3 INFO are
  `search_term_stats` (service_role-only by design) and two orphan tables (item **H6**). Compare new work against **this** baseline.
- **Performance advisor debt (not yet addressed):** 214 `auth_rls_initplan`, 319 `multiple_permissive_policies`,
  65 unindexed foreign keys (19 of them in `wear`), 6 duplicate indexes (all in `public`). See item **S6**. (Counts from 2026-09-27, not re-measured.)
- **14 cron jobs, all active:** map prominence, messaging purge, contributor analytics ×3, search-term purge,
  contributor digest, Vision MV refresh ×3, Vision daily snapshots, Vision advisory eval, live-location cleanup
  (every 15 min), impersonation expiry sweep (every 5 min).
- **Live data (2026-10-03):** 16 profiles · 5 Contributors (**only 2 are on the map; the other 3 lack a category or a pin, or are hidden**) · 40 Places ·
  4 Events (**0 upcoming, so none is on the map or in Discovery's list**) · 1 News post. Wear: 6 verified brands, 1 Wear admin.
  Vision: 1 organisation, 0 linked to a Connect Contributor. 14 cron jobs, all active.
- **Tests (last full local run, the Map v2 rollout branch @ `735dc0a` + the PR #106 changes, 2026-10-13; format, lint, build, typecheck all green):** Connect **1330** unit
  (+36 live-only, skipped in CI) · Vision 734 · Wear 115 · `@citizens/db` 127 · frontend-build 55 · connect-client 21 · utils 7 ·
  `braces-patched` 150 · **Connect Playwright e2e 199/199** (the C15 routing suite, the 19
  listing-automation tests, Map v2, the D-13 welcome specs; 18 tests about the old pins and preview card now pin the old map with
  `useOldMap()`, and a new sheet test records `navigator.userActivation` at every `pushState`). (Two suites used to hit vitest's 5 s default when every app's tests run
  in parallel on a busy machine: `frontend-build`'s end-to-end test now has an explicit 30 s, and the migration-lineage security
  tests (`profiles-column-privacy`, `contributor-approval-migrations`) read the lineage once instead of per call.)
- **Env:** Connect's Vercel env has Supabase, MapTiler, Upstash (rate limiting is live), `INTAKE_WEBHOOK_SECRET`
  and the Vercel↔Supabase integration vars. Auth email goes through Resend SMTP (`no-reply@citizenscentral.co.za`,
  domain verified). **`RESEND_API_KEY` (Connect's own sending key, separate from Supabase's SMTP key) was stale; the founder re-entered it
  on 2026-10-10.** It only reaches code running in a NEW deployment, and Connect's last production deploy before that was `30507e9`
  (2026-10-04), so the next deploy (any merge touching `apps/connect`, or Redeploy in Vercel) picks it up. Not yet seen sending: the first
  real email (an admin notice, an applicant verdict, a welcome) is the proof; until then the app only logs "email skipped". **Check (2026-10-12):** a read of the Connect project's env var NAMES through the Vercel API listed neither `RESEND_API_KEY` nor `ADMIN_NOTIFY_EMAIL` (a team-shared variable might not show), so confirm both in the Vercel dashboard. `ADMIN_NOTIFY_EMAIL` is the admin's inbox for notices and the Reply-To of the owner welcome (A11).
- **Map v2 (C19) is the DEFAULT map for everyone since PR #106 (2026-10-13; the founder said yes to D15 in chat and, going to bed, told me to merge wherever needed).**
  `?map=v1` opts one device out (stored as `cc_map_v2` = `v1`), `?map=v2` brings it back, and **`DEFAULT_ON = false` in
  `app/map-v2-lib.jsx` is the one-line rollback for everyone**. The look follows the phone's own light/dark setting (no Map look button,
  no build badge: founder, 2026-10-12); a Contributor pin is a glyph below zoom 15 and its logo at and above it; ONE bottom sheet
  (peek / half / full, a 380 px side panel at 768 px and up) for a Contributor, a Place and an Event, with Events | News | Gallery,
  share, and an uncropped photo viewer. **An opted-out device is unchanged** (new build with `?map=v1` against the old build: 0.0000 %
  pixel difference at 360, 390 and 768 px, 24 = 24 requests); a default visitor adds one request, `map-v2.css` (6.7 KB gzipped);
  the bundle moved +24 B gzipped (the modules were already in it since #96). Landing-screen blocking time (long tasks, CPU x4, 15 cold
  loads each): default 1,621 ms, opted out 1,649 ms, old build 1,665 ms, so no gap by that method, and **Lighthouse 12.8.2 on the live site
  (2026-10-14, 5 runs each, `docs/audit/data/r4-lighthouse-live-2026-10-14.json`) agrees: blocking time 48.5 ms with Map v2 on vs 62.5 ms
  with `?map=v1`, performance 64 vs 64, accessibility 92 vs 92** (the old +170 ms is gone). **Still open: C19 R3, the MapTiler usage page
  and a usage alert (A12), the founder's step. NEXT: C22, swiping the sheet up and down from anywhere on Android (the founder's report of
  2026-10-14; nothing is built yet).** The real-phone Back test passed on 2026-10-12; the default flip changes no sheet code, but a
  quick Back check on the live site is cheap. **Next: [`docs/handoffs/MAP_V2_NEXT_PHASE_HANDOFF.md`](docs/handoffs/MAP_V2_NEXT_PHASE_HANDOFF.md)**
  (Phase 2, starting with P2-07, P2-08, P2-06; R6, deleting the old map's code, waits for a release or two without opt-outs).
  Tracker [`../../docs/MAP_UX_TRACKER.md`](../../docs/MAP_UX_TRACKER.md) (section 8A); QA
  [`../../docs/audit/phase1-qa.md`](../../docs/audit/phase1-qa.md); audit [`../../docs/audit/`](../../docs/audit/).
- **Agent team (items T4 to T6): the Watcher is LIVE (2026-10-12); the Dispatcher and the Reviewer are LIVE (2026-10-13).** A local scheduled task, `citizens-watcher-daily`, runs four times a day
  (05:00, 10:00, 15:00, 20:00 local). It checks the public API, the security advisor (baseline 0 ERROR / 121 WARN / 3 INFO), CI on `main` and the
  open PRs, writes a report and any cards into a private **Decision Inbox** artifact, and emails the founder once a day. It never writes to the
  database, GitHub or Vercel. Spec: [`docs/routines/daily-routine.md`](docs/routines/daily-routine.md). Team design, authority matrix, build order and
  paste-ready prompts: [`docs/handoffs/AGENT_TEAM_HANDOFF.md`](docs/handoffs/AGENT_TEAM_HANDOFF.md). The inbox URL and the founder's email are not in the
  repo (handoff section 9). **The Dispatcher** (`citizens-dispatcher`, 07:30 and 17:30 local) routes the founder's newly answered inbox cards: an approved
  idea becomes a public GitHub issue labelled `agent:ready` plus a queue row (the first is issue #102, the CI-every-morning idea); an answer that asks for
  nothing is recorded; anything that needs the founder in chat becomes one action card. It only ever creates issues. Spec:
  [`docs/routines/dispatcher.md`](docs/routines/dispatcher.md). **The Reviewer** (`citizens-reviewer`, 08:30, 12:30 and 16:30 local) reads open same-repo
  PRs (and any PR a `rv-pr<n>` queue row asks for, merged ones included) cold, against the repo's own rules, and posts ONE public advisory comment per PR per
  commit with file and line. It cannot approve, label, push or merge. Spec: [`docs/routines/reviewer.md`](docs/routines/reviewer.md).
  **The Builder (T4)** is specified
  ([`docs/routines/builder.md`](docs/routines/builder.md), 2026-10-14): one approved issue to one draft PR, no cron, never merges. Its scheduled task
  `citizens-builder` is **not created yet** (the night session's create call needed an approval nobody could give; the prompt is saved locally) and it
  has **never run**; the switch card `d-chain` (roles starting each other, builder.md section 9) is filed, unanswered and not wired.
- **Local-dev gap:** Wear's and Vision's `.env.local` have no Supabase vars, so local builds get a blank
  `config.js` and Vision's `next start` returns 500. Workaround: inject the two public `NEXT_PUBLIC_SUPABASE_*`
  values from Connect's `.env.local` into the local process env (never commit or print them).

---

## 3. Standing rules and gotchas (distilled from the history; do not lose these)

**Process**
- Work in the **monorepo only**. The standalone `citizens-connect`, `citizens-vision` and `citizens-wear`
  checkouts are read-only history (§3Q, §3AC).
- **Direct push to `main` is blocked**, and GitHub auto-merge is disabled: land every change through a PR and
  merge it manually once CI is green. `main` often moves mid-PR (parallel sessions), so merge `main` in and
  re-check anything numbered (migrations, §6 entries) before merging.
- Gates: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus Connect e2e
  (`pnpm --filter citizens-connect test:e2e`, also the `e2e-connect` CI job). Run `pnpm format:check` locally:
  CI runs it and the turbo gates don't. Run `turbo build` **before** `turbo typecheck`; running them together
  wipes `.next/types` mid-check. CI also runs **CodeQL** and a **blocking OSV-Scanner** (`osv-scanner.toml`'s
  baseline is empty: fix the dependency, don't baseline it). **New advisories can turn `main` red with no code
  change** (2026-10-02, PR #76: brace-expansion, js-yaml, undici; again 2026-10-10, PR #94: Next, Capacitor, sharp, source-map-js):
  raise the `pnpm.overrides` floor, then check the lockfile against OSV.dev before pushing. A bare `^` or `>=` floor can jump a
  minor (Next 16.4.0, Capacitor 8.5.x), so cap it (`>=16.3.8 <16.4.0`, `~8.4.3`); an exact-version override key (`sharp@0.34.5`)
  misses a sibling's different request (`^0.35.4`), so key on `<fixed`. With no `osv-scanner` binary installed, query
  `https://api.osv.dev/v1/querybatch` with every `name@version` of `pnpm-lock.yaml` (public metadata only); CI's scan is the proof. **`braces` is a patched local fork**
  (`packages/braces-patched`, wired in through the root `pnpm.overrides`): GHSA-vfj7-8cjw-p6xm affects
  every `braces` on npm (<= 3.0.3, no fixed release), so we ship the 3.0.3 tarball plus a nesting-depth
  guard and the lockfile holds no npm `braces` for OSV to match. There is no exception in `osv-scanner.toml`.
  Remove the fork once npm ships a fixed `braces` (item **H10**; steps in the package's `PATCHED.md`).
- Never `pnpm add vercel` (it once pulled in 26 advisories, §3AA). Use `npx vercel@latest` when needed.
- **Parallel sessions claim the same IDs.** Item IDs (C11 was claimed twice on 2026-10-03) and migration numbers: fetch `main`
  and take the next free one at merge time. A sibling session may also merge `main` into your PR branch: `git fetch` before you push.
- **Windows / scripted edits:** a heredoc script that contains `\r\n`-style escapes can have its backslashes collapsed, which writes real line
  breaks (or U+2028/2029) into a source file and breaks the parse. Build such strings with `String.fromCharCode(92)` and re-read the result.
  A script that rewrites files must not change line endings (Python: `open(p, "w", newline="")`), and a PC crash can
  leave uncommitted files full of zero bytes, so commit early. After a crash, scan with `tr -cd '\000' < file | wc -c`.
- **Working from a sibling git worktree (parallel sessions):** `preview_start name=…` resolves
  `.claude/launch.json` from the *primary* checkout, so it serves the other session's files. Start your own
  `npx next dev -p <port>` from the worktree's `apps/connect` instead (copy the gitignored `.env.local` in, and
  delete the copy afterwards). **Never let two `next dev` servers share one `.next`** (e.g. your dev server plus
  Playwright's `webServer` on 3100): the second corrupts the first and its `/api/*` routes start returning 404.
  Stop yours before running e2e. A local dev server reads the real Supabase and the real Upstash rate-limit
  buckets, so don't hammer `/api/v1/*` from it. **Port 3100 may already belong to another session's dev server** (`netstat -ano | grep :3100`);
  Playwright's `reuseExistingServer` would then silently test THEIR files. Run e2e from your own worktree on a free port with a throwaway
  config (copy `playwright.config.ts`, change both ports, `reuseExistingServer: false`) and delete it before committing.

**Database / migrations**
- `supabase/` at the repo root is the one migration lineage. Apply with MCP `apply_migration`, set a pre-apply
  git tag **and push it**, then require advisors to show 0 ERROR and 0 unexpected new findings. Commit the
  `.sql` file in the same PR (mig 167 was once applied without one).
- Remote migration versions are timestamps; local files are numbered. Any CLI-style "migrations not found"
  check (e.g. the Supabase Preview GitHub check) is a harmless mismatch. Don't rename files or repair rows.
- `CREATE OR REPLACE VIEW` silently drops `security_invoker`, and `CREATE OR REPLACE FUNCTION` drops
  `search_path=''`. Re-state both every time (migs 165/166/168).
- **`profiles` is column-allowlisted (contract R3.5):** a new column is private until you add it to the
  176-style `grant select (…)` and `profileColumns.ts`. A server-owned column goes into
  `guard_profile_server_columns()`. A column-level REVOKE does nothing while a table-level GRANT stands.
- Every SECURITY DEFINER function starts with the `auth.uid() is null or …` guard. The null arm is mandatory,
  or a missing JWT skips the check (§3E).
- `service_role` has no `auth.uid()`, so `protect_role_column()`'s admin bypass never fires for it. Route admin
  writes through the admin's own session (§3AL) or the dedicated service_role RPC (mig 173).
- Don't re-flag these: the anon JWT in mig 125 / cron job 7 is the publishable key, and the SECDEF EXECUTE
  WARNs are by design.

**API / frontend**
- Connect's frontend authenticates with `Authorization: Bearer` from localStorage. Routes must use
  `getRouteAuth()`, never the cookie-only `createClient()`, and must pass `request` to
  `checkDashboardAccess(handle, request)` (§3AL).
- A new `app/*.jsx` screen must be registered in **both** `src/frontend/index.html` and that app's
  `scripts/build-frontend.js` `appFileOrder`. Otherwise it works in dev and breaks in production (§3Y). No build
  guard checks this yet (item **S10**).
- **Routing (C15): every screen's URL lives in ONE place, `src/frontend/app/routes.jsx`** (`window.CC_ROUTES`: `pathFor`,
  `navFromPath`, `safeReturnPath`, `accessFor`, `isEntityRoute`, `titleFor`, `isSlug`; pure and unit-tested). Never write a path
  string in a screen: call `go(page, params)`. A new screen is a row in `routes.jsx`, an entry in `next.config.ts` (`APP_PAGES`, or
  a `:param` rewrite) and a test. **`next.config.ts` serves `index.html` for an explicit list of those paths and must NEVER become a
  catch-all** (`/:path*` would shadow `/api`, `/auth`, `/_next` and static files); `routeRewrites.test.ts` keeps the list equal to
  the table. `index.html` needs `<base href="/">` so nested paths (`/e/<id>`) can load its relative assets. The Google redirect is
  always the site root (`auth-client.js`); the screen travels in `sessionStorage.cc_return_to` through `safeReturnPath` (a known
  app path only, never a host). Dashboard/Admin tabs live in the URL and REPLACE history. The URL grants nothing: RLS and the
  server checks stay the wall. Unknown top-level paths keep Next's 404.
- **Back and history (Android Chrome): push a history entry ONLY inside a tap or key press.** The three places that do: `go()`
  (`writeHistory`), an overlay's guard (`registerBackGuard`, reached through `useBackGuard`, which pushes one `{guard:true}` entry
  right after the tap that opened the overlay), and the map entry put under a shared `/e`, `/p` or `/c` link at the visitor's first
  tap or key press (`arm`, in the boot effect). **Never push on page load or from `popstate`**: Chrome skips entries a page added
  without a user gesture, which is how Back used to leave Connect. The first screen is the arrival entry (`replaceState` only).
  `historyRule.test.ts` fails on a fourth `pushState`, and `routing.spec.ts` records `navigator.userActivation` at every push. A
  new overlay uses `useBackGuard`; navigate first, then close (`go(...); onClose()`) so the guard's entry is replaced, not left
  behind. Playwright cannot reproduce Chrome's intervention, so a change here needs a real-phone check.
- **`src/frontend/**` is excluded from ESLint**, so lint says nothing about unused variables or typos there. Check a touched
  file with a one-off `no-unused-vars` run before shipping (C15 found and removed a dozen dead bindings that way).
- `store.jsx`'s `if (!realUser)` branches are load-bearing for the e2e suite; don't strip them. The e2e specs
  drive the UI by **visible button text**, so grep the specs before renaming or moving a CTA (§3AM).
- **CDN tags are build-enforced (`@citizens/frontend-build` 0.2.0):** supabase-js, react and react-dom must pin
  the installed version with a matching SRI hash. Dependabot bumps of those go red on Build until `index.html`
  follows: move the URL, paste the hash the error prints, and check it with
  `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
- **MapLibre is vendored** in `apps/connect/src/frontend/vendor/maplibre-gl/` (v6.11.2, the fix for a CVSS-10
  XSS). Bumping `maplibre-gl` means re-copying the four files; the build fails loudly otherwise. Any new map
  (e.g. Vision's Timeline Map) must use the same vendored copy, never an unpkg 4.x build.
- Brand icons are `Brand…`-prefixed on purpose: lucide's close icon is literally called `X` (§3AO).
- **A new top-level folder under `apps/connect/src/frontend/`** (e.g. `assets/`) is copied to `public/<dir>/` by the build. Add
  `/public/<dir>/` to `apps/connect/.gitignore` (the generated copies are ignored one path at a time), reference files
  root-absolute with a `?v=` (the service worker is cache-first for same-origin static files) and never relative (pages load
  from `/index.html` and `/dashboard`).
- **Map rules live in one place, `map.jsx`:** `ZOOM_GATES` (each pin type hides when zoom < its gate: place 9.5,
  event 7.5, Contributor 6; Ideas never gate; the selected pin is always drawn) and `ZOOM_LABELS` (15). Every
  Contributor pin opens the same small `EntityCard` preview as events and places; the full profile is behind its
  "View Full Profile" button. `window.__ccMap` exposes the map for specs (`jumpTo({center,zoom},
  {originalEvent:{}})`; the `originalEvent` marker stops the "frame the data" effect undoing the jump).
- **Map v2 (C19) is behind `?map=v2`** (`window.isMapV2()`, localStorage `cc_map_v2`; `?map=v1` clears it): flag off must stay pixel-identical, so every
  change to `map.jsx`, `home.jsx` and `entity-card.jsx` is gated. Its modules are `app/map-v2-*.jsx` (registered in `index.html` AND `appFileOrder`), its
  tokens and component CSS are `assets/map-v2.css` (loaded only with the flag; raw hex and px live only in the token blocks, a test enforces it), all new
  text is in `map-v2-strings.jsx`. **The sheet uses ONE `useBackGuard` entry** (Back, Escape and the close button close it at once; navigate first, then
  close). **A marker's inner nodes carry `data-mv2` attributes, never `class`** (the Tailwind Play CDN re-reads the classes under every element whose style
  changes, and a marker's style changes on every pan frame), and its OUTER element carries no `var()` property. Measure frame time with GPU flags, never with
  headless software GL.
- **Past events:** `window.DATA.isPastEvent` is the one definition (end behind us; no end time → stays up for the
  rest of its calendar day). Map and Kingdom Discovery filter on it; organiser profile and dashboard keep past
  events under "Past events". Recurrence is not modelled (create.jsx defers it; the API doesn't expose it).
- **Social values** go through one classifier (`checkSocialValue` / `checkSocialField` in `src/lib/publicUrl.ts`
  and `urlFor` in `data.jsx`): a value with spaces is a display name, not a handle, and is refused (dashboard,
  Apply, admin Create) or dropped with a Note (Google Form intake, `lenientSocials`). WhatsApp is stored as
  international digits (`27…`). A logo is shown whole (`Avatar fit="contain"` / `logoFit(kind)`); an Individual's
  photo fills the frame.
- **React types: one `@types/react` per React line** (connect/wear/ui on `^18.3.28`, vision on `^19`), and root
  `pnpm.packageExtensions` gives `next` optional `@types/react(-dom)` peers, so each app's Next resolves its own
  types instead of pnpm's hoist slot (the phantom `react.cache` build error; PR #72). Keep a new app's types on
  its React line's range. `react-canary.d.ts` stays as belt-and-braces.
- Signed-in (real-mode) Connect e2e specs use `e2e/support/fake-project.ts`: a fake `.test` Supabase project
  answered by `page.route()`, with `test.use({ bypassCSP: true })`. Nothing reaches the real project.
  `signInToFakeProject` seeds a session; `installFakeProject` starts **signed out** (used by
  `email-code-signin.spec.ts`, which answers `/auth/v1/otp` and `/auth/v1/verify` itself).
- **Sign-in:** Connect has two ways in, Google and a 6-digit emailed code (`shouldCreateUser: true`, unlike
  Wear's sign-in-only). In-app "sign in" prompts call `showSignIn()` (the landing with every option), never
  the Google-only `signIn()`, or someone without Google is dead-ended. Email sign-ups arrive with no name; the
  UI shows a display-only stand-in (`displayNameFor`) that must never be written to `profiles.full_name`.
- **A pending Contributor applicant (D-12) is `role='citizen'` + `contributor_status='pending'`.** Their profile edits are STAGED on their own
  `contributor_applications` row (owner + admins can read it; **no client write privilege since mig 180**, so every write goes through a
  validated server route with the service-role client scoped to the verified `user.id`) and `approve_contributor_application` copies them to
  `profiles`. Never save them to `profiles`/`places`/`news_posts`: their SELECT policies are `true`. The `protect_role_column` trigger is
  SECURITY INVOKER and polices only requests that arrive as anon/authenticated: a user can go `not_applied`/`rejected` → `pending`, nothing else.
- **Email Connect sends itself** is `src/lib/email` (Resend over HTTP): `sendEmail` never throws and returns `sent | failed | skipped`, logs no
  address or key; wording lives in `templates.ts` and every interpolated value is escaped there. Callers must treat it as fail-soft. Tests mock
  `sendEmail` only (no real mail in CI).
- **e2e specs must not redeclare `Window.__cc` / `__ccMap`** (specs share one TypeScript program and the shapes clash). Use
  `e2e/support/app-hooks.ts` (`goTo`, `setRoleAndGo`, `mapReady`).
- **Listing automation (C16): the consent is the database's, never the client's.** `profiles.auto_update_level`
  (`off` | `suggest` | `events_auto`, default `off`) plus its consent time/source are private and written ONLY by
  `set_my_automation_level()` (or the Form intake route, last, fail-closed); a trigger blocks every other writer, and turning it
  off at once disables every source and dismisses what is pending. Nothing is ever published without the owner: a suggestion
  waits on the Suggestions tab, and the single exception is a FUTURE event at `events_auto`. **No images in Phase 1** (the CSP's
  `img-src` allows only our hosts, so a third-party image would render broken): `image_url` is dropped with a warning and logo/cover
  are not suggestible. Facebook, Instagram and TikTok sources are stored but never enabled (no scraping of Meta/TikTok). Personal
  contact details found by a reader are scrubbed, and `validateSuggestion()` in `src/lib/automation/suggestions.ts` is the one
  validator (the dashboard's `CC_AUTOMATION_HELPERS` copy is held equal by a drift test). Owner actions run client-side on the
  owner's own session (RLS + the SECDEF RPCs), not through `/api`; the two machine routes (`POST /api/automation/suggestions`,
  `POST /api/automation/digest`) take admin-minted scoped keys (`automation:suggest`, `automation:digest`) and the digest emails via
  #88's `src/lib/email/send.ts` (needs `RESEND_API_KEY` in Vercel; at most one email a day, only for new pending suggestions).
- **Public repo:** never commit a real organisation's or person's contact details (emails, user ids) in tests,
  docs or handoffs. Use reserved `.example` addresses. **Stage with explicit paths, never `git add -A` / `git add .`:** the
  working tree holds untracked local briefs that name real organisations (`docs/handoffs/*` not listed in git, `intake-v2.gs`,
  `docs/routines/`, `config/onboarding-presets.json`); a blanket add once swept ten of them into a local commit (caught before
  any push and removed from the history).

**Deploy / auth**
- `next.config`'s `outputFileTracingRoot` must be the monorepo root, or every API route crashes on Vercel
  (§3AK). Any env var a build script reads must be in `turbo.json` `globalEnv` (§3AH, §3AI).
- Preview deployments sit behind Vercel SSO. External callers (e.g. the Google Apps Script intake) can only
  reach `www.citizenscentral.co.za`.
- One Supabase project means one Site URL (Connect's). Another app's auth redirects work only if its origin is
  in the Redirect URLs allow-list (the Wear deploy-hash wildcard is there). PKCE links complete only in the
  browser that requested them, so **the 6-digit email code is the primary email sign-in path**.

---

## 4. The pipeline: open work (verified 2026-09-27, merged and prioritised)

Priority: **P1** = do next · **P2** = soon · **P3** = when convenient · **Parked** = waiting on a decision,
an account or money. Size: **S** = under a session · **M** = one session · **L** = several sessions, or a
design session first.

> **Founder triage (2026-09-27):** the founder marks each item below Work on / Re-prioritise / Discard on the
> private triage page https://claude.ai/artifact/TdWoi7nAjPFg35zrh7zWpR. Before planning work, read those
> decisions with the `ArtifactData` tool (`action: "list"`, `collection: "decisions"`; one document per item
> ID with `decision`, `priority`, `note`), apply them to this section, and then treat this section as the source
> of truth again.

### A. Founder actions (no code needed)
| ID | Item | Pri |
|---|---|---|
| A2 | **Finish the production smoke walk on Connect.** Done by the founder: Google sign-in as admin, map and Admin → Listings; a Contributor's dashboard, Profile tab and News post; Admin → Listings → **Delete** (2026-10-03, "works beautifully"). The cancel/restore step found bug **C1/C1b** (fixed in #84). **Signed off by the founder on 2026-10-10 ("everything is solid and working for now"): the whole C15 (#89) live-check list** (the Android Back walk on a real phone, which was the gate; the cancel/restore/reload re-test of C1/C1b; the private-window walk with Back/Forward and an old `?c=` link; sign-in from a deep link by Google and by the 6-digit code; Share; the Supabase redirect list). Still to do: **Become a Contributor** with a fresh citizen account (the 6-digit code makes this easy; since D-12 it waits for an admin, so walk the whole loop: see A11's live checks) · phone-to-desktop map resize (§3AJ). Untested by design: the Capacitor native shell's hardware Back (it has never run on a device, P9). (Admin Create + Claim still works as a silent auto-claim until **C10** replaces it with a confirm screen.) | P1 |
| A3 | **Wear walk-through:** the sign-in-as (impersonation) flow as admin (only the seed and smoke sessions exist, §3AB), plus a live email test: sign-up confirmation, password reset and 6-digit code via Resend (§3S). | P2 |
| A4 | **Write the Ts&Cs, Code of Conduct and fee-schedule documents.** The Wear brand application's checkboxes refer to them by name only, and the app-store listings will need them too. | P2 |
| A5 | **Get the 3 invisible Contributors onto the map** (each lacks a category or a pin, or is hidden; see Admin → Listings). Ask them to finish their profiles, or fill them in from Admin. | P2 |
| A6 | Custom domains (e.g. `wear.` and `vision.citizenscentral.co.za`) plus a branded storage-asset origin, so URLs stop exposing `*.vercel.app` hashes and the Supabase project id (§3U). | P3 |
| A7 | Decide what to do with the **Supabase Preview** GitHub check. It reports "skipped" on every PR (Free tier), so it's harmless: uninstall it or leave it (§3M). | P3 |
| A8 | Mobile store accounts: **F1** Firebase (Android push), **F2** Apple Developer + a Mac, **Step 6** store compliance (privacy/terms URLs, data-safety form, icons, screenshots, age rating), **Step 7** release process (§3G). | Parked |
| A9 | Supabase **Pro** upgrade decision. It unlocks HIBP leaked-password protection and DB branching (safer migrations). | Parked |
| A10 | **Last bit of the email-code sign-in (PR #77).** The founder reported on 2026-10-03 that the live test with an Outlook-mail owner passed (code → their dashboard) and that `intake-v2.gs` is pasted into the Sheet, so the templates and the re-paste are done. The Supabase email rate limit is **60 emails/hour** (founder, 2026-10-03; the target was at least 30), so that is done too. Still open and optional: lower the email OTP expiry from 1 h to about 15 min (Authentication → Providers → Email), and re-test a never-registered address (should become a citizen) and Google for the admin, which the report did not cover. | P3 |
| A12 | **MapTiler usage page and alert (Map v2 R3).** Open the MapTiler account's usage page, note this month's sessions (Free allows 5,000) and requests (100,000), and set a usage alert; over the limit **the map stops loading until next month**. Map v2 being the default adds no sessions and no requests for a light-mode visitor, and about 12 more requests (17 to about 29 a visit) for a dark-mode phone, so the 5,000 sessions run out first. If a launch push is coming, budget Flex ($30 a month) or the OpenFreeMap fallback (`docs/audit/map-tiles.md`). Also: a second MapTiler key for previews and local work (H11). *Watch:* the sheet's gallery call (`GET /api/v1/contributors/<slug>`) shares the anonymous limit of 60 requests a minute per IP, so many people tapping pins on one shared network in the same minute can see "Try again" in the gallery (the rest of the sheet still works). | P1 |
| A11 | **Finish the contributor-approval rollout (D-12 / D-13).** *Founder steps:* (1) make sure `RESEND_API_KEY` (a sending-only Resend key; the founder re-entered it on 2026-10-10, but a 2026-10-12 read of the variable names did not list it) and `ADMIN_NOTIFY_EMAIL` (not listed either) are in the Vercel **Connect** project for Production and Preview, then redeploy; until then no email leaves Connect. *Live checks:* ① Become a Contributor with a fresh Gmail plus-address (e.g. `+applytest2`) → Dashboard shows the "being reviewed" banner → not on the map → the admin email arrives → Admin → Applications → Approve → the applicant gets "You're live" and the pin appears. ② Reject one → the applicant gets the reason and can apply again. ③ Admin → Create with "Email the owner" ticked → the welcome arrives (check junk) → 6-digit sign-in → Dashboard; clean up via Admin → Listings → Delete. ④ Delete a test listing, re-apply with the same account, approve → it **is** on the map (the mig 179 fix). | P1 |

### C. Connect: the v1 discovery loop (current product focus)
| ID | Item | Pri | Size |
|---|---|---|---|
| C3 | **Apply wizard: collect the Contributor kind** (incl. Individual; the data model is done in mig 173) and relax the "Organisation / ministry name" copy for solo people. (§3AP, V1_SCOPE §7) | P2 | S |
| C4 | **Admin Create parity:** add X, LinkedIn, WhatsApp, public contact email and cover photo (the intake RPC already takes them). (§3AP) | P2 | S |
| C5 | **6-digit-code sign-in for Vision.** Connect shipped it (PR #77) and Wear already has it; Vision is still Google-only. Port Connect's `EmailSignIn` panel and `CC_AUTH_HELPERS` (`auth.jsx`, `auth-client.js`). Email + password for Connect was dropped on purpose: passwordless only. (§3P, §3S) | P2 | S–M |
| C6 | **Lazy profiles:** stop `on_auth_user_created` from creating a `public.profiles` row for every auth user (verified still present). Add "ensure profile on first Connect sign-in" **first**, or new sign-ups break. It touches live auth, so it needs its own tested session. (§3S) | P3 | M |
| C7 | Guest mode: Consider / Follow / Connect on a real listing silently does nothing after an optimistic UI flip. Add toast-and-revert (about 10 call sites). (§3AH) | P3 | S |
| C8 | e2e coverage for the contributor portal (edit, cancel, Profile, News). (§3AG) | P3 | S |
| C9 | Small polish, founder's choice: Noir/dark landing variant (§3AJ) · step-level Back inside wizards (§3AN) · cover-photo reorder UI (§3AM) · enforce `p_status` inside `find_or_create_conversation` (§3E) · gallery images via the Form (logo and cover only today) · update the Drive field-spec doc (it still lists the 17 event categories) · label `docs/feature-clarity/*` as deferred (§3AD). | P3 | S each |
| C10 | **Verify-first attach for a Form approval whose owner email already has an account** (founder decided 2026-10-03; design below, nothing built). (PR #73). *Note (2026-10-04):* admin-created listings now email the owner a welcome (`ownerWelcomeEmail`, D-13); keep its "sign in to see your listing" wording true when this confirm screen lands. | P2 | M–L |
| C11 | **Events feed ceiling.** `/api/v1/events` is `order by date ASC, limit 100` and the store fetches page 1 once, so once total event rows (past included) pass 100, the *upcoming* ones fall off the page and never reach the map. The owner half is done (#84: the Dashboard reads its owner's own rows, so past and cancelled events no longer depend on that page). Still open: the map/Discovery fetch should use the existing `from=` filter. Today: 3 events, so not urgent. | P2 | M |
| C12 | **First-view framing.** With geolocation denied the map frames *all* data, and a few far-away places push it to a national view. It now stops at the lowest visible gate and centres on the visible pins, but a new guest would be better served by framing the densest cluster (median-based, so one outlier doesn't pull the camera away from Pretoria). | P3 | S |
| C13 | Map polish found in the map-preview PR: the preview card shows no distance on the map (the list does: `HomePage` never passes `myLoc` to `EntityCard`), the Map Key has no Contributor entry, and Impact Ideas never gate by zoom. | P3 | S |
| C16 | **Listing Automation Phase 1: MERGED and DORMANT** (consent-first, POPIA; founder decisions D-8 to D-11 in the local planning handoff). Code and tests are in PR #92; **migration 181 is applied** (2026-10-04, probe clean, advisors +3 WARN as predicted). Every Contributor is at `off`, no key exists, nothing calls the new routes. **Still to do, each needing the founder:** **(1)** mint two keys, `automation:suggest` and `automation:digest`, with `POST /api/admin/api-keys` called with an admin token (there is no admin screen for it; the body is `name`, `owner_email` or `owner_id` of an approved Contributor or an admin, and `scopes`; the secret is shown once, so it should not pass through a chat). **Nothing uses these keys until Phase 2 or a manual test post, so mint them then, not before;** **(2)** ~~confirm `RESEND_API_KEY`~~ done 2026-10-10: it was stale and the founder re-entered it; it goes live with the next deployment and the first real email is the proof (§2); **(3)** optionally the one-off backfill for the first real organisation (a throw-away script, never committed; the alternative is that the owner switches it on from their own Dashboard); **(4)** Phase 2, the scheduled reader. Note that the Suggestions tab stays empty until something posts to `/api/automation/suggestions`, so an end-to-end walk needs the suggest key and one test post (a Contributor first flips their level on the Dashboard → Profile card, and needs an enabled source). Deviations from the brief: no images in Phase 1 (CSP), owner actions run on the owner's own session instead of new `/api` routes, the digest is a Next route using #88's mailer (not an Edge Function; `send-contributor-digest` only writes an in-app notification), no new notification type, and "Edit & publish" is inline on the card. **Phase 2** (a daily scheduled reader that calls the suggest route, then the digest route) comes after, as does a scheduler for the digest. Brief: local, untracked `docs/handoffs/CONNECT_LISTING_AUTOMATION_PHASE1_HANDOFF.md`. | P2 | M left |
| C17 | **One design reference, then a periodic check** (founder idea, 2026-10-03; not a priority). Collect the preferred look in one living reference, then audit screens against it: the rounded, blurred-backdrop modal (the admin Delete popup), font faces and colours, window patterns, the colour scheme and the one crown logo (now Wear's PNG). Today three definitions drift apart: `packages/ui/src/tokens.ts` (Wear-targeted, gold `#C9A24A`, a placeholder SVG crown, no consumer), Connect's CSS variables (`--gold-crown #D4AF37`) and Wear's PNG. First step: reconcile them into `packages/ui` tokens plus a short design reference with screenshots; the "daily check" could later become a step in P2's routine. | P3 | M |
| C18 | **Drafts for pending applicants.** D-12 asked that a pending applicant can also draft events (and places, news) that publish on approval. v1 of D-12 gives them **profile only** (founder decision 2026-10-03): `places` and `news_posts` SELECT policies are `true`, so anything they saved there would be world-readable. Doing drafts properly needs a staging model (e.g. a `status='draft'` the open SELECT policies exclude, or staging on the application row like the profile) plus approval publishing them. Do it after the first real applicants say they want it. | P3 | M–L |
| C19 | **Map v2: logo/glyph pins and a three-state bottom sheet: PHASE 1.5 DONE, it is the DEFAULT map (PR #106, 2026-10-13; Phase 1 was PR #96)** (founder-started 2026-10-05 from an Instagram map recording; the look follows the phone, 2026-10-12). Done: R1 the MapTiler logo (#99, #101), R2 default on (D15), R4 the landing-screen blocking time (no gap by the long-task method, and none in Lighthouse on the live site, 2026-10-14), R5 D14 closed. **Open: R3, the MapTiler usage page and alert (A12, founder).** **R6 (delete the old map's code and the flag) is deferred** until a release or two pass with nobody needing `?map=v1`. **Next: R7 / C22 (swipes), then Phase 2** (`docs/handoffs/MAP_V2_SWIPE_AND_PHASE2_HANDOFF.md`, which holds a paste-ready prompt; Phase 2 starts with P2-07 Upcoming | Recent, P2-08 count buckets, P2-06 QR; nearby list inside the sheet, clustering, follow and save, 24-hour updates after that). The core loop (onboarding, listing, map, events) outranks it. | P2 | L |
| C22 | **Swipe the Map v2 sheet up and down from anywhere, in every situation, on Android (tracker R7, decision D16).** The founder's report, 2026-10-14: after tapping a Contributor's marker the card opens but "cannot be swiped up, nor swiped back down after seen". **Not started; the cause is not yet known.** What is known: the sheet starts a drag from anywhere except inside its scroller at full and on screens 768 CSS px or wider (a side panel with no gestures: a phone held sideways falls here); nothing hands a swipe on the content over to the sheet (at full and scrolled to the top, a swipe down should collapse it; at half, a swipe up should expand it before the content scrolls); and the existing sheet tests send synthetic pointer events, not real touch, so they cannot see `touch-action` or the `pointercancel` Android Chrome sends. First step: reproduce with real touch (Playwright mobile emulation plus CDP `Input.dispatchTouchEvent`) and on the founder's phone, write the failing tests, then fix. Details, hypotheses, acceptance lines and the open question D16 (what a sideways phone or a tablet gets): tracker section 8A R7. | P1 | M |
| C20 | **v1 `EntityCard` Share is a stub:** its Share button only shows the toast "Share link copied" and copies nothing (`entity-card.jsx`); the real `shareLink` (`store.jsx`) is used by the profile pages and, under `?map=v2`, by the sheet. Flag off was left unchanged on purpose. **DONE: fixed for everyone in PR #97 (merged 2026-10-12): the card calls `shareLink` (share sheet on phones, the real link on the clipboard elsewhere).** (Found in C19.) | P3 | S |
| C21 | **Say "on the map" only when it is true.** A Contributor with no pin (online-only, or "no fixed location") is in Kingdom Discovery but never on the map, yet several messages promise the map: the applicant-approved email (`applicationApprovedEmail`, #88), the Approve dialog and the Create toast/intro in `admin.jsx`, and the Google Form welcome (`intake-v2.gs` `sendWelcome_`, plus the repo's `tools/google-forms/intake.gs`). The admin-created welcome (D-13, #90) already follows the rule through its required `onMap` input (a pin needs both coordinates). An online-only Contributor is exactly who the vision says we must not leave out or mislead. (Found in the #90 review.) | P3 | S |

**C10 design (agreed 2026-10-03; nothing built yet).**
- *Threat:* the Form is public and `owner_email` is unverified. An approval that attached a listing to an existing account on its own would let a stranger plant content on a victim's account. So nothing on an existing account changes without the verified owner's explicit yes.
- *Flow:* on approving an existing-email row the listing goes **live now under a placeholder** (it needs an alias auth email, since emails are unique; GoTrue's acceptance of the alias needs a live check, and never mail it) with `contributor_claim_email` = the real owner email. The owner gets a different welcome email, signs in (the 6-digit code proves the inbox, or Google), and sees **"Attach 'X' to your account? [Confirm] [Not me]"**. Only Confirm runs the claim.
- *Always* an explicit confirm, admin-created listings included: it replaces today's silent auto-claim (`store.jsx` `landOwnListing`). Make the claim RPC require `email_confirmed_at is not null`, and add a read-only `peek_claimable_listing()` for the confirm screen.
- *Sheet:* the **database** holds the state. The Apps Script polls `POST /api/intake/google-form/status` (HMAC, like the intake route) about every 10 minutes and writes "Awaiting owner" / "Owner confirmed ✓" into the row's Status. The Sheet never triggers anything. Re-paste `intake.gs` after changing it.
- *Founder decisions on the open questions (2026-10-03):* **"Not me"** hides the placeholder listing at once and flags it
  for the admin (the Sheet status says "Owner declined"; the admin decides whether to Delete); nothing on the existing
  account changes. **No response:** the listing stays live, the Sheet shows "Awaiting owner" with its age, and **one reminder
  email goes out at 7 days**; nothing is ever attached without the owner's yes, and no auto-expiry.
- *Order of work (founder, 2026-10-03):* **Listing Automation Phase 1 comes first** (now shipped, C16), then C10. C10 needs a
  migration (take the next free number at apply time; 181 is the current head) and both edit the intake route (C16 already has) and the Apps Script. The repo's
  `tools/google-forms/intake.gs` is now the corrected, wording-matched script (#85); **C10 starts from it**, never from the old
  number-matching copy (it misread the consent question after the Section 7 reorder). Both designs agree: the
  database is the source of truth, consent comes first, and no Google Sheet sits in the data path.
- *Process:* needs a migration (ask the founder first, pre-apply tag, rollback-only probe, advisor diff). Read the founder's planning-session files first (untracked, local): `docs/handoffs/CONNECT_LISTING_AUTOMATION_PHASE1_HANDOFF.md`, `intake-v2.gs` and `PLANNING_SESSION_HANDOFF_2026-10-02.md` (decisions D-8 to D-11).

**C19 status and what is next (2026-10-12).**
- *Built:* tracker items P1-01 to P1-13 (flag `cc_map_v2`, tokens in `assets/map-v2.css`, motion and reduced motion, logo/glyph pins, time labels, the sheet, header and tabs, skeleton and errors, gallery and viewer, one strings file, share, the dark look, which follows the phone's own setting). Code: `app/map-v2-*.jsx` (lib, strings, time, pins, gallery, sheet) plus small flagged changes in `map.jsx`, `home.jsx`, `entity-card.jsx`; **no database, migration, auth, RLS or API change and no new dependency.**
- *Founder decisions D1 to D10* are all implemented as recorded in the tracker (D1 revised 2026-10-12: the look follows the phone; gold fill with a near-black label; contributor-supplied images only; Back closes the sheet at once with ONE `useBackGuard` entry; glyph below zoom 15, logo at and above it; one sheet for all three pin types; a shared link still opens the profile).
- *Founder answers 2026-10-10:* **D11, D13, D14 accepted as recommended** (judge frame time and tap-to-sheet at CPU x1, and at x4 no worse than v1; accept the +13.7 KB gzipped bundle while in review, revisit with the flag-on landing blocking time before the flag defaults on). **D12 answered 2026-10-12: MapTiler stays on the Free plan for now** (the Free plan requires the MapTiler logo on the map, and pauses the map for the rest of the month past 5,000 sessions or 100,000 requests: R1 and R3 in the handoff). Moving the base map to Google Maps is not recommended (cost grows with visitors, a rewrite, Google's business pins compete with ours): handoff section 3.
- *Next step:* start a new session with the prompt in `docs/handoffs/MAP_V2_NEXT_PHASE_HANDOFF.md` section 5: Phase 1.5 (R1 MapTiler logo with the founder's screenshot sign-off, R2 the flag on for everyone = new decision MAP:D15, R3 quota watch, R4 the flag-on landing blocking time, R5 close D14), then Phase 2 (P2-07, P2-08, P2-06 first; P2-01 needs D2; the G1 items need migrations and the founder's yes).
- *Facts to keep:* production runs a custom MapTiler Dataviz-based style (not `streets-v2`); `dataviz-dark` loads with the existing key (+12 tile requests for a person who switches); live data has 0 upcoming events, 0 of 40 places with opening hours and a median stored image of 319 KB; headless Chromium needs GPU flags for frame times (software GL is about 10x slower); a marker's inner nodes must not carry `class` attributes (the Tailwind CDN observer cost 31 ms p95 per pan frame on 150 pins); measurement tools are in `apps/connect/scripts/map-v2/`. Lighthouse (2026-10-10, preview, landing screen only because guest mode is in `sessionStorage`): accessibility 92 with the flag on or off (the app-wide `maximum-scale` in the viewport meta blocks pinch zoom), flag-on blocking time about +170 ms (style work, JavaScript equal), `docs/audit/phase1-qa.md` section 4.

### T. Agent team (the Watcher, the Dispatcher and the Reviewer are live; the Builder is specified; the rest is to build)
| ID | Item | Pri | Size |
|---|---|---|---|
| T4 | **Builder**: spec written ([`docs/routines/builder.md`](docs/routines/builder.md), 2026-10-14); **task `citizens-builder` still to create** (ad hoc, no cron, from the locally saved prompt) and **first run pending**, supervised, on issue #102 (`q-ci-schedule`: a daily `schedule:` trigger in `.github/workflows/ci.yml`). Then wire the chaining (builder.md section 9) once the founder answers `d-chain`. One agent PR open at a time. | P2 | M |
| T5 | **Reader** = Listing Automation Phase 2 (C16). Needs the founder to mint the `automation:suggest` and `automation:digest` keys first. | P2 | M |
| T6 | **Cloud move** after 14 clean daily reports (needs a read-only database role and a plan for `gh` access), then the Scribe and the Strategist. | Parked | M |

Open founder cards in the Decision Inbox: Supabase Pro, the branch-delete ruleset, the API cold-start idea, and the Dispatcher's two action cards (the Dependabot one is wrong and should be dropped; the MapTiler one is real: only the founder can change that plan). Re-test triggers for the two roles' first fixes are in `docs/routines/dispatcher.md` and `docs/routines/reviewer.md` section 8/9.

### S. Security, platform and code health
| ID | Item | Pri | Size |
|---|---|---|---|
| S1 | **Give Wear a Content-Security-Policy.** It sends none (its `next.config.js` comment claims one). Its `index.html` has no inline scripts, so a strict `script-src` looks achievable. Brief: [`docs/handoffs/WEAR_CSP_HANDOFF.md`](docs/handoffs/WEAR_CSP_HANDOFF.md). (§3AT) | P1 | S–M |
| S3 | **Connect: compile Tailwind statically** and drop the Tailwind Play CDN (a runtime JIT not meant for production; the `.cc-map` rule already makes the switch safe). Add **SRI to the pinned lucide tag**. (§3AN, §3AO) | P2 | M |
| S4 | Set `"incremental": false` in the `apps/vision` and `apps/wear` tsconfigs, matching Connect. (§3AQ) | P2 | S |
| S5 | **Wear account deletion can fail for brand owners:** the marketplace FKs are not DEFERRABLE (verified: 0 in `wear`), so a cascading delete can hit error 23503. Make them `DEFERRABLE INITIALLY DEFERRED`, or add a bottom-up SECDEF cleanup function. Needed before any "delete my account" flow. (§3R) | P2 | S |
| S6 | **DB performance sweep:** wrap `auth.uid()` in `(select …)` across RLS policies (214 initplan WARNs), merge duplicate permissive policies, index the 65 unindexed FKs, drop the 6 duplicate indexes. Absorbs Wear's old "`auth_rls_initplan` sweep" fast-follow. | P2 | M–L |
| S7 | Move Connect and Vision onto `@citizens/utils` rate limiting (their copies are byte-compatible on purpose; Wear already uses it). (§3N, §3R) | P3 | S |
| S8 | `packages/db` branch coverage: backfill `src/memory.ts` tests and raise the floor from 64 back to 70. (§3AR) | P3 | M |
| S9 | Vision's Playwright e2e crashes without real Supabase env and isn't in CI. Give it Connect's hermetic-mock treatment, then wire it into CI. (§3AF) | P3 | M |
| S10 | Build guard: fail the build if `index.html`'s app script list and `appFileOrder` disagree (the §3Y bug class). | P3 | S |
| S11 | Vision's and Wear's `scripts/build-frontend.js` should load `.env.local` the way Connect's does (local dev only). (§3AH) | P3 | S |
| S12 | **Tighten the open policies found during D-12 (verified live 2026-10-04, not fixed).** `news_posts` INSERT is `auth.uid() = contributor_id` for any signed-in user (places need `is_organiser()`; news has no such check) and `news_posts` / `places` / `profiles` SELECT are `true` (`profiles` is column-allowlisted). A citizen can therefore insert a world-readable news row for themselves and write their own `profiles` columns (bio, website…) directly; none of it surfaces on a public listing (those read approved Contributors only) but it should require an approved Contributor. Also `/api/v1/contributors/<slug>/stats` has no `contributor_hidden` guard (the other two public contributor reads do). Needs a migration (ask the founder first). | P2 | S |

### V. Vision (live since 2026-07-18)
| ID | Item | Pri | Size |
|---|---|---|---|
| V1 | **Timeline Map with live MapLibre.** `views.jsx TimelineMap()` is still a placeholder; `/api/map/activities` and `/api/timeline` exist and the MapTiler key is set. No migration. Vision's `index.html` loads **no** MapLibre today: use the vendored 6.11.2 copy (see §3). (§3AC) | P2 | M |
| V2 | **Network graph** (§4.3 of the wiring spec): "which orgs share your audience?" Its own PR + migration (take the next free number at apply time: head + 1; 180 and 181 are applied, see §2). Reuse `org_active_persons` + the mig-155/156 orbit pattern; it feeds `vision.org_partnerships` + `/api/metrics/cross-org`. | P3 | L |
| V3 | Phase D: exports, partnerships, scheduled reports. | Parked | L |
| V4 | Adoption: 1 Vision organisation exists and none is linked to a Connect Contributor. Onboard a real organisation (founder). | P2 | — |
| V5 | `apps/vision/docs/ADMIN_GUIDE.md` still describes the retired Connect-sync subsystem. | P3 | S |

### W. Wear
| ID | Item | Pri | Size |
|---|---|---|---|
| W1 | **Impersonation Phase 2 (write-as-user)**: needs its own ratified design session first. The lockout on an admin impersonating another admin is the load-bearing guardrail. (§3AB, roles MD §7.1/§7.2-2) | P3 | L |
| W2 | Launch fast-follows: brand **edit** screen (logo etc.; `PATCH /api/brands/:slug` exists, no UI) · proposal-mockup upload + story video (the pipeline is images-only) · nav-level unread badge · share-to-DM (`dm` channel reserved) · upvote-notification dedupe · statuses-bar pagination · full desktop layouts. (§3T, §3W) | P3 | S–M each |
| W3 | Capacitor native shell (the JS bridge and deep-link auth are ready; no `capacitor.config`, `android` or `ios` yet). When it ships, add `citizenswear://auth-callback` to the Supabase redirect allow-list. | Parked | M |
| W4 | Marketplace v2 open questions: brand-verification depth (KYC or light review), Brand Workspace scope, dispute tooling, concept search/categories, creator portfolio. | Parked | L |

### M. Monetisation (in no recent plan; listed so it isn't forgotten)
| ID | Item | Pri |
|---|---|---|
| M1 | PayFast billing (MASTER_DIRECTION Batch 8): only the schema exists (mig 081, `billing_tier`). Wear's brand application already asks brands to agree to a monthly fee that nothing collects. | Parked |

### H. Housekeeping (low risk; one session clears most of it)
| ID | Item |
|---|---|
| H2 | **Done on the remote 2026-10-13.** 43 merged remote branches were deleted on 2026-10-12 (each: its tip already in `main`, a merged PR, not an open PR's head; the SHAs were kept, so one can be restored with `git push origin <sha>:refs/heads/<name>`). The repo ruleset "Allow Claude" (id 24081059) used to forbid deleting branches too (GH013, first hit 2026-10-04); it was edited on 2026-10-10 and now holds only `non_fast_forward`, so deletes work and force-push stays blocked (keep it that way). The repo also deletes a PR's branch when the PR merges (`delete_branch_on_merge`). **The branch review of 2026-10-13 cleared the rest:** the 14 Dependabot PRs were closed (their branches went with them); the three old map branches were deleted (earlier notes called them unmerged, but their PRs #60, #61 and #62 were squash-merged on 2026-08-26 and each tip's files were identical to what was merged; tips `9b91284`, `ad03df8`, `b213bc9`); `chore/phase-4-local-rewrite` (a May 2026 posts-and-feed prototype for the fashion app, written before the monorepo and superseded by `apps/wear`) was archived as the tag `archive/chore-phase-4-local-rewrite` (= `05d6407`) and its branch deleted; restore it with `git push origin archive/chore-phase-4-local-rewrite^{commit}:refs/heads/chore/phase-4-local-rewrite`. Only `main` is left on the remote. Still to do: about 17 stale LOCAL branches and the sibling worktrees (`../wt-*`, **H3**). |
| H3 | Park the standalone `../citizens-connect` checkout (4 uncommitted: `.gitignore`, `RESUME_HERE.md`, decision brief, `.codeviz/`). Clear the sibling clutter (`../citizens-wear-pr8`, `../cv-temp`, `../citizens-connect.worktrees`) and the orphan `.claude/worktrees/agent-a4219a…` folder. |
| H4 | Retire stale status docs that compete with this file: `apps/connect/.github/PROJECT_STATUS.md` (last updated 2026-07-01), `apps/connect/.github/workflows/ci.yml` (nested, so GitHub never runs it), root `.github/PROJECT_STATUS.md` (Wear, May 2026), and ECOSYSTEM_DECISION_BRIEF rows 0 ("in flight"; done since §3H) and 5 (monorepo; done). |
| H5 | **Undeployed edge functions:** 9 of the 14 in `supabase/functions/` were never deployed and nothing calls them (see P8 in §5). Decide: deploy and wire them, or delete them. `review-contributor-application` is still deployed but **nothing calls it any more** (since D-12 `/api/admin/contributors/review` calls the approve/reject RPCs directly and its email deep-link mode is gone): the founder decides whether to undeploy it. |
| H6 | **Orphans in prod (needs founder OK):** tables `public.kv_store_794cc4b9` (20 rows of demo seed data) and `public.kv_store_7f45c4c8` (empty); edge functions `make-server-794cc4b9` and `make-server-7f45c4c8` (Figma-Make prototypes from June) and `deploysmoke` (returns "ok"). None are in the repo. Drop them. |
| H7 | `apps/connect/config/onboarding-presets.json` is still an untracked local draft (the daily routine, `docs/routines/daily-routine.md`, was adopted by the agent-team PR on 2026-10-12). Commit or delete the presets file before Phase 3 of the routine. |
| H10 | **Check monthly for an upstream `braces` fix** (the patched fork `packages/braces-patched`, §3 Process). Run `npm view braces version` AND read GHSA-vfj7-8cjw-p6xm's affected ranges: a new version only counts if it is not listed as affected. When one ships, follow "Removing the fork" in the package's `PATCHED.md` (delete the `braces` override and the package, `pnpm install`, run the CI's OSV command). Until then the fork is the whole fix. **Last checked 2026-10-12:** npm `latest` is still 3.0.3 and the advisory still says `patched=null`; next check due **2026-11-02**. On 2026-10-04 upstream had two open fix PRs (`micromatch/braces` #72 and #75) and the founder decided NOT to post our draft (it is in the #87 description); **both are now closed, unmerged** (#72 closed by its author on 2026-10-05, #75 withdrawn by its author the same day), so no upstream fix is pending. Open question for the founder: keep that decision, or post the draft after all. When a release ships, prefer it over the fork. |
| H11 | **A MapTiler key is written in a tracked document**: `apps/connect/CITIZENS_STRATEGIC_DIRECTION_MAY2026.md` (one line, the env-var table). It is a public browser key (the app ships it in `config.js`), but a repo document should not carry it, and the key should be restricted by HTTP referrer in the MapTiler dashboard. **Value removed from the doc on `feat/map-v2` (2026-10-10, PR #96); it stays in git history, so the referrer restriction was the remaining step. **2026-10-12: the founder restricted the key's Allowed HTTP origins (`www.citizenscentral.co.za`, `www.219.co.za`). Consequence: PR previews (`*.vercel.app`) and `localhost` no longer get map tiles; Vision (`vision.citizenscentral.co.za`) also reads a MapTiler key. Recommended: a second key for previews and local work, set as the Preview-only `NEXT_PUBLIC_MAPTILER_KEY` in Vercel.** (Found in C19.) |

---

## 5. Partly finished and scattered work (where each one stopped)

| # | Project | Where it stopped | Next |
|---|---|---|---|
| P1 | Google Form → map Contributor intake (§3AP) | Built, merged and live. The live end-to-end test **passed on 2026-10-02** (a real listing, owner on Outlook mail, welcome email, 6-digit sign-in on 2026-10-03). Existing-email approvals still refuse with a clear Note until C10. | C10, C16 |
| P2 | **Connect Daily Routine** (the Watcher; a design-consistency step could join it, C17) | **Adopted 2026-10-12:** the v3 spec is committed (agent-team PR) and Phase 1, health checks only, runs four times a day as a local scheduled task, reporting to the Decision Inbox and a daily email (not Drive). Steps B to F are not enabled; the onboarding presets are still not wired into the wizard. | T4 to T6, H7 |
| P4 | Wear CSP | Flagged in §3AT. The brief was only in local `%TEMP%`; now rescued to `docs/handoffs/WEAR_CSP_HANDOFF.md`. | S1 |
| P5 | Vision Timeline Map | Placeholder since 2026-07-02; unblocked since 2026-07-18; never started. | V1 |
| P6 | Vision network graph + Phase D | Scoped only. | V2, V3 |
| P7 | Impersonation Phase 2 | Phase 1 is live; Phase 2 waits on a design session. | W1 |
| P8 | **Notification edge functions** | 5 of 14 deployed (incl. notify-broadcast, notify-event-update, send-contributor-digest). Never deployed: notify-event-cancelled, notify-interested-users, notify-nearby-rsvp, notify-new-follower, prompt-post-event-reviews, send-daily-digest, send-event-reminder, send-rsvp-reminders, submit-contributor-application. Push notifications also need F1/F2. | H5, A8 |
| P9 | Mobile launch (Capacitor) | Connect's native shell, deep-link OAuth and native geolocation are code-complete (§3G) but have never run on a device. Wear has no shell. Store work not started. | A8, W3 |
| P10 | Lazy profiles | Designed (§3S), not built. | C6 |
| P11 | 6-digit-code sign-in | Done on Connect (#77) and Wear. Vision is still Google-only. | C5 |
| P12 | Contributor kind in the Apply wizard | Data model done (mig 173); wizard UI not. | C3 |
| P14 | Rate-limit consolidation | Wear is on `@citizens/utils`; Connect and Vision still use their own copies. | S7 |
| P15 | Tailwind static compile | The prerequisite (`.cc-map` rule) landed; the compile itself isn't done. | S3 |
| P16 | Vision e2e | The suite exists, crashes on boot, and isn't in CI. | S9 |
| P17 | Monetisation | PayFast schema only (mig 081); a brand fee is agreed in a form but never collected. | M1, A4 |
| P18 | Figma-Make prototypes | Leftover tables and edge functions in prod from the June experiments. | H6 |
| P19 | Address hygiene | Roadmap only: custom domains + a branded storage origin. | A6 |
| P20 | **Listing Automation Phase 1** (C16) | Merged (#92) and migration 181 applied; dormant: every level is `off`, no `automation:*` key is minted (not needed until Phase 2), `RESEND_API_KEY` was re-entered 2026-10-10 and goes live with the next deployment. Phase 2 (the scheduled reader) is not started. | C16 |
| P21 | **Map v2** (C19) | Phase 1 merged (PR #96, 2026-10-12), behind `?map=v2`. Next: Phase 1.5 rollout, then Phase 2 (`docs/handoffs/MAP_V2_NEXT_PHASE_HANDOFF.md`). | C19 |
| P22 | Contributor approval gate (D-12) + owner welcome email (D-13) | D-12 merged 2026-10-04 (PRs #86, #88; mig 180 applied); D-13 is PR #90. Not yet walked live: the sending env vars still need confirming in Vercel (§2). | A11, C18, S12 |

---

## 6. Recent sessions (newest first; full detail in the archive or the PR)

- **2026-10-14 — Lighthouse run on the live site; the swipe request recorded; a stateless prompt written (docs only, branch
  `claude/map-v2-lighthouse-and-next-prompt`).** The founder said the default map "is working great", approved the Lighthouse download (the one
  thing I had left unmeasured) and reported on his Android phone that the sheet cannot be swiped up, nor swiped back down after seen; he wants
  swipes to work in every situation. **Lighthouse 12.8.2** (installed in a scratch directory outside the repo with scripts off; tool
  `scripts/map-v2/lighthouse-batch.mjs` for the next person) on the live landing screen, default vs `?map=v1`, 5 interleaved runs each: blocking
  time 48.5 vs 62.5 ms (runs overlap: 19 to 103 vs 42 to 97), performance 64 vs 64, accessibility 92 vs 92, layout shift 0.0005 both, LCP 5.7 vs
  6.0 s. The old +170 ms is gone. **The swipe request is C22 / tracker R7 with D16 open.** I read the gesture code (nothing changed): the sheet
  starts a drag from anywhere except inside its scroller at full and at 768 CSS px or wider; nothing hands a swipe on the content to the sheet;
  and `e2e/map-v2-sheet.spec.ts` drives it with synthetic `PointerEvent`s and `page.mouse`, which skip `touch-action` and `pointercancel`, so every
  existing test can pass while a thumb on Android fails. **Where the next session starts:** the paste-ready prompt is in
  `docs/handoffs/MAP_V2_SWIPE_AND_PHASE2_HANDOFF.md`. No app code, migration or database change.
- **2026-10-14 (night, unattended) — The Builder (T4) specified; its task not yet created (docs only, branch `claude/builder-role`).** A one-time
  scheduled session ran the founder's night prompt (`BUILDER_ROLE_HANDOFF.md` section 7.3). **Done:** the spec
  [`docs/routines/builder.md`](docs/routines/builder.md) (lifecycle, work-in-progress rule, scope, gates with the D2 shortcut, stop
  conditions, shapes, tools, and the chaining design as section 9, "designed, not yet wired"); the inbox switch card `d-chain` (decision,
  forward or off, **unanswered**); the full task prompt. **Blocked:** creating the scheduled task `citizens-builder` asks for a person's
  approval, which an unattended run cannot get; not worked around. The prompt is in the primary checkout's gitignored
  `.claude/sessions/builder-task-prompt.md`. **Not done (by design):** no task run, no task or spec of another role edited, no chaining
  wired, nothing merged. Found: queue rows `q-pr98` and `q-agent-watcher` still say `in_review` although PR #98 merged (both `by: session`,
  so the work-in-progress rule ignores them). Later that morning, at the founder's request in chat, PR #105 (the Reviewer) and then this PR #107 were merged.
  **Next (supervised):** create the task (no cron), "Run now" on #102 with the founder approving its tools, read back, fix, then wire the chaining.

- **2026-10-13 (night) — Map v2 is the default map for everyone (C19 Phase 1.5, PR #106).** From the start-up menu the founder chose C19, said
  yes to **D15** (default on, `?map=v1` as the escape hatch) and, going to bed, told me to merge wherever needed (I read that as: merge `main`
  into my own branch and merge my own PR once CI is green; nothing else, and no other session's PR). **What changed:** `app/map-v2-lib.jsx` reads the
  flag as default ON (one constant, `DEFAULT_ON`), a device stores only a non-default choice (`?map=v1` stores `v1`, `?map=v2` forgets it, a
  stored `v2` from the review period stays on). No database, API, auth, dependency or CSP change. **Tests:** the first full e2e run after the flip
  failed 22 tests, every one an assumption about the old default (no product bug): 18 about the old pins and preview card now pin the old map with
  `useOldMap()` (`e2e/support/app-hooks.ts`), the `map-v2.spec.ts` flag block was rewritten (6 tests), the Kingdom Discovery flow ends on the
  sheet, and a NEW sheet test records `navigator.userActivation` at every `pushState` (the C15 history rule on the map everyone now gets). Unit
  `mapV2Lib.test.ts` (14) includes a test that `DEFAULT_ON = false` is the whole rollback. **Proof:** M7 the other way round (new build with
  `?map=v1` against the old build) 0.0000 % on 9 shots, 24 = 24 requests; a default visitor adds only `/assets/map-v2.css` (28.5 KB, 6.7 KB
  gzipped); bundle 108,316 → 108,340 B gzipped. **R4:** landing screen, CPU x4, 15 cold loads each (`scripts/map-v2/landing-blocking.mjs`,
  `docs/audit/data/r4-landing-blocking.json`): long-task excess 1,621 / 1,649 / 1,665 ms (default / opted out / old), after first paint 6 / 3 / 6 ms,
  style recalculation +7 to +10 ms, so the pass line (≤ 50 ms) holds with no code change; **Lighthouse was not re-run** (a download, not approved), so
  its old +170 ms is neither confirmed nor refuted. **Found, not fixed:** (1) `map-v2.css` has two rules not scoped to the flag (`:root` tokens,
  `.maplibregl-ctrl-group button`), so it cannot simply become an unconditional `<link>` without changing the old map; (2) the landing screen's
  ~1.6 s of long-task excess at CPU x4 is existing cost (Tailwind's browser runtime, S3), the same with Map v2 on or off; (3) the sheet's gallery
  call shares the anonymous 60-requests-a-minute limit per IP (A12); (4) the MapTiler key is referrer-restricted (H11), so no real tiles were
  loaded in any run (hermetic fake network only). **Gotchas:** a `( cmd ) &` inside a background shell returns at once, so its "completed"
  notification is not the end of the run (wait on the log's exit marker); `sed -i` on a file the editor has read invalidates its read state;
  `prettier --check` covers the tracker's hand-written tables (run `--write` on them). **Left:** A12 / R3 (founder), R6 (delete the old map's
  code, deferred), Phase 2 (`docs/handoffs/MAP_V2_NEXT_PHASE_HANDOFF.md`), and an optional quick Back check on the live site.
- **2026-10-13 (evening) — The Reviewer built and run once; the Dispatcher's PR #104 merged (docs only, branch `claude/reviewer-role`).** The founder asked for #104
  to merge once the Reviewer had finished, and for the Reviewer next. #104 conflicted with #103 (`RESUME_HERE.md` only), `main` was merged in, CI went green, the
  Reviewer's pre-merge comment on it had no blocker, and it merged (`b7f78ea`). **Reviewer:** spec `docs/routines/reviewer.md`, task `citizens-reviewer` (08:30,
  12:30, 16:30 local), review requests are queue rows `rv-pr<n>`; it uses `add_issue_comment` only (never the review-writing tool, which can approve). **First run**
  (founder-approved targets #104 and the merged code PR #101): both comments posted, findings checked against the repo: the two #101 nits are real (line 91 of
  `e2e/map-attribution.spec.ts`; a garbled dash at line 167 of `index.html`), the #104 should-fix was weak. **Found and fixed:** no line numbers in findings, a false
  "missing" claim, and a rule that banned harmless words; the prompt now demands real line numbers and a check before any "missing" claim. **Note:** comments appear
  under the repo owner's account (the connector's identity). **Not done:** the Builder (T4), Reader (T5); the Reviewer has never seen a Builder PR; the fixes are not
  re-tested. No app code, migration or database change.
- **2026-10-13 — The Dispatcher built and run once; the 14 Dependabot PRs closed; PR #98 unblocked (docs only, branch `claude/dispatcher-role`).** The founder's
  scheduled "resume" run had finished unseen, so the state was re-checked live and the founder confirmed three things in chat. (1) Close the 14 Dependabot PRs:
  done with a comment; Dependabot also removed its 14 branches, and a closed PR is replaced only when a newer version appears, it is not reopened. (2) Resolve
  #98's conflict (`RESUME_HERE.md` only): `main` merged in and pushed; #98 was then merged by a parallel branch-review session with the founder's yes. (3) Build the Dispatcher: spec `docs/routines/dispatcher.md`,
  four `agent:*` labels created on GitHub, task `citizens-dispatcher` (07:30 and 17:30 local). **First supervised run:** issue #102 created for the approved CI
  idea, 4 answers recorded, 2 action cards filed, nothing else touched. **Found:** one misroute (it said 13 Dependabot PRs were open when all were closed: it
  trusted the Watcher's stale count; the Watcher was also 1 low, 13 vs 14). The prompt now demands a live check; the original card was corrected by hand and the
  wrong action card is left for the founder to drop. **Not done:** the Reviewer (T3), Builder (T4), Reader (T5); the inbox page was never checked on a phone or
  for the new `dispatch` run kind; the Watcher still reports already-actioned answers as unactioned (propose-only follow-up, spec section 9). No app code, migration or database change.
- **2026-10-13 — Branch and PR review (docs only).** Re-verified all 19 remote branches against GitHub, then asked the founder one group at a time.
  **Done with the founder's yes in chat:** deleted the 3 squash-merged map branches (#60, #61, #62; tips recorded in H2); archived and deleted
  `chore/phase-4-local-rewrite` (tag in H2); merged the agent-team docs PR #98 (T1, removed) once all its checks were green and its head was unchanged;
  moved the founder's old untracked `daily-routine.md` draft (v1, 2026-09-21) into the gitignored `.claude/sessions/` so a `git pull` in the main checkout
  does not collide with the tracked v3 file. A parallel session closed the 14 Dependabot PRs the same evening and brought #98 up to date with `main`
  (closed without an ignore rule, so Dependabot opens a fresh PR when a newer version ships). **Found:** H2 had the old-branch list wrong (three of the four
  were merged); `.github/DECISIONS.md` (Wear, May 2026) still names the deleted phase-4 branch as a cherry-pick source, and the archive tag keeps that trail
  valid (H4 retires the file). **Gap noted, not a regression:** Wear's `POST /api/posts` passes `taggedProductIds` through unchecked because Wear has no
  product catalog yet; add an ownership check when it gets one. **Left:** about 17 stale local branches and the sibling worktrees (H3); §6 is over its
  8-entry guide, so the oldest entries can move to the archive. No app code, migration or database change.
- **2026-10-12 (later) — PRs #90 and #91 brought up to date and merged; 43 merged branches deleted (H2).** Both had sat open since 2026-10-04, 57 commits
  behind `main` and conflicting. `main` was merged into each in a sibling worktree, then everything #91 asserted was re-checked live and two claims
  were stale: **H10** (both upstream `braces` fix PRs, `micromatch/braces` #72 and #75, are now closed unmerged, so the founder's "don't post our draft"
  call no longer rests on a pending upstream fix: flagged to revisit) and **H2** (the ruleset no longer has a `deletion` rule). #90 was reviewed (no
  blocking defect: escaping, fail-soft, sent only after the create, links valid under C15) and, on the founder's call, one wording bug was fixed in it:
  the owner welcome said "on the map" for a listing with no pin (required `onMap` input; the same claim elsewhere is **C21**). Gates on #90: format, lint,
  typecheck, 1329 unit, 189 e2e, build; GitHub CI was green on each head before its merge (#91 `eabe13d`, #90 `7f2e7dd`). **Found, not fixed:** a read of
  the Connect Vercel project's variable NAMES (never values) lists neither `RESEND_API_KEY` nor `ADMIN_NOTIFY_EMAIL`, though §2 says the key was
  re-entered on 2026-10-10: confirm both in the dashboard (A11) or every email stays `skipped`. **Gotchas:** parallel sessions fetch into the shared refs,
  so `origin/main` moves under you (re-fetch before every push); PowerShell 5.1 splits `git commit -m` at a double quote (use `-F file`); two PRs that
  each add a §6 entry at the same spot conflict again once the first merges. The three oldest §6 entries moved to the archive.
- **2026-10-12 — Agent team kick-off: the Watcher and the Decision Inbox (docs only, branch `claude/agent-watcher`).** The founder asked for agents that help
  build the Citizens network. Built and running: a **Decision Inbox** (a private artifact: cards with a recommendation and one-tap answers, a Queue with a
  one-agent-PR limit, daily Reports with a runs timeline) and the **Watcher** (a local scheduled task, four runs a day, read-only, one email a day to the
  founder). The first run succeeded and the email was confirmed. **Found:** CI runs on push only, so a red `main` from a new advisory goes unseen (the founder
  approved a scheduled run as the Builder's first task, T4); the advisor result is about 59 KB (count it by script); the first run stamped its cards 45
  minutes ahead (timestamps now come from the clock only); PRs #90 and #91 have been untouched since 4 Oct. **The founder answered:** the phone Back check on
  PR #96 passed; close the 14 Dependabot PRs (done 2026-10-13 after a yes in chat: closed with a comment; T2 and H1 removed); run CI every morning (yes). **Not done:** the Dispatcher, Reviewer, Builder
  and Reader; the inbox page was never checked on a phone; nothing merged. Handoff with the team design and paste-ready prompts:
  [`docs/handoffs/AGENT_TEAM_HANDOFF.md`](docs/handoffs/AGENT_TEAM_HANDOFF.md). No app code, migration or database change.
- **2026-10-12 — Map v2 Phase 1 finished and merged (C19, PR #96), C20 fixed (PR #97).** A continuation session validated the
  first run's handoff against git, CI and the live preview; measured Lighthouse (landing screen: accessibility 92 with the flag on or
  off because of the app-wide `maximum-scale`; flag-on blocking time +170 ms, JavaScript equal); removed the MapTiler key value from a
  tracked doc (H11; the referrer restriction is still the founder's step). The founder passed the real-phone Back test, approved the
  dark look, accepted D11, D13, D14, kept MapTiler on Free (D12) and revised D1: the look now follows the phone, and the Map look button
  and the "map v2" badge are gone. Next-phase handoff with a paste-in prompt: `docs/handoffs/MAP_V2_NEXT_PHASE_HANDOFF.md`.

---

## 7. Canonical docs

- [`VISION.md`](VISION.md) — the north star; read first, every run.
- [`V1_SCOPE.md`](V1_SCOPE.md) — Connect's v1 scope. Read it before any Connect product work.
- [`docs/SHARED_DB_CONTRACT.md`](docs/SHARED_DB_CONTRACT.md) — shared-project schema contract (§9 = live head
  and advisor history; R3.5 = profiles column privacy).
- [`docs/ECOSYSTEM_PROFILE_LEVELS.md`](docs/ECOSYSTEM_PROFILE_LEVELS.md) — Citizen → creating tier → per-app Admin.
- [`docs/strategy/ECOSYSTEM_DECISION_BRIEF.md`](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md) — ecosystem plan
  (steps 1–4c done; H4 lists its stale rows).
- [`docs/HTML_FRONTEND_WIRING_SPEC.md`](docs/HTML_FRONTEND_WIRING_SPEC.md) — Connect frontend reference.
- [`docs/VISION_BACKEND_WIRING_SPEC.md`](docs/VISION_BACKEND_WIRING_SPEC.md) — Vision wiring reference.
- [`../../docs/Citizens_Wear_Roles_and_Concepts_MD.md`](../../docs/Citizens_Wear_Roles_and_Concepts_MD.md) —
  Wear roles, the Concepts marketplace, the impersonation design (§7).
- [`docs/api-v1.md`](docs/api-v1.md) — the public `/api/v1` contract.
- [`docs/handoffs/`](docs/handoffs/) — stateless build briefs (Form intake, React types, Wear CSP).
- [`../../docs/MAP_UX_TRACKER.md`](../../docs/MAP_UX_TRACKER.md) and [`../../docs/MAP_V2_RUNNER_PROMPT.md`](../../docs/MAP_V2_RUNNER_PROMPT.md) —
  Map v2 (C19): the plan, the measures, the decisions and the paste-in prompt. The reference frames
  (`../../docs/reference/instagram-map/*.jpg`) are local only and git-ignored; its `INDEX.md` is tracked.
  Phase 1 results, the real-phone checklist and the vibe-security pass: [`../../docs/audit/phase1-qa.md`](../../docs/audit/phase1-qa.md); the measurement tools are in `scripts/map-v2/`.
- [`docs/FUTURE_IDEAS.md`](docs/FUTURE_IDEAS.md) — deferred ideas (not the pipeline).
- [`.github/MASTER_DIRECTION.md`](.github/MASTER_DIRECTION.md) — the original locked technical direction (batch plan).
- [`CATEGORIES.md`](CATEGORIES.md) — category colours and icons.

### Verify locally (Connect)
```powershell
npx tsc --noEmit; npx vitest run; npx next lint --dir src; node scripts/build-frontend.js; npx playwright test
```
