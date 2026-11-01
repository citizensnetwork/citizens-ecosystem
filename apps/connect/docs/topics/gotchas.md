# Topic: gotchas and standing rules (moved out of RESUME_HERE section 3)

> The standing rules that do not bite every session: frontend and map internals, e2e specs, sign-in, listing automation, worktrees and old process rules. Moved verbatim from [`RESUME_HERE.md`](../../RESUME_HERE.md) (section 3, plus one bullet of section 1) on 2026-11-01 by the slimming PR, so nothing was lost. The one-line index entry for each item stays in RESUME_HERE section 4 (stable ID, title, priority, size). Relative links in the moved text were re-based so they resolve from this folder; the words are unchanged. Find an item by searching this file for its ID cell, for example `| C10 |`.

> The rules that bite every session stay in RESUME_HERE section 3. Code and docs that cite "RESUME_HERE §3" for one of these rules mean this file.

## Moved from section 3

**Process**
- **Working from a sibling git worktree (parallel sessions):** `preview_start name=…` resolves
  `.claude/launch.json` from the *primary* checkout, so it serves the other session's files. Start your own
  `npx next dev -p <port>` from the worktree's `apps/connect` instead (copy the gitignored `.env.local` in, and
  delete the copy afterwards). **Never let two `next dev` servers share one `.next`** (e.g. your dev server plus
  Playwright's `webServer` on 3100): the second corrupts the first and its `/api/*` routes start returning 404.
  Stop yours before running e2e. A local dev server reads the real Supabase and the real Upstash rate-limit
  buckets, so don't hammer `/api/v1/*` from it. **Port 3100 may already belong to another session's dev server** (`netstat -ano | grep :3100`);
  Playwright's `reuseExistingServer` would then silently test THEIR files. Run e2e from your own worktree on a free port with a throwaway
  config (copy `playwright.config.ts`, change both ports, `reuseExistingServer: false`) and delete it before committing.
- **Design-ready (2026-10-19).** A UI or visual issue is not built until it has the `design-ready` label and a `## Design spec`. The Builder follows [`docs/DESIGN_SYSTEM.md`](../../../../docs/DESIGN_SYSTEM.md) plus that spec. Ask the Designer when the build deviates (a new token, a new pattern, a changed layout, or a state the spec did not cover). A UI pull request that is clearly inside the spec may merge after 2 hours if no review has arrived. Brand, category lists and policy belong to the founder.
- **Team hours (2026-10-19; roles updated 2026-10-25).** The Builder works 07:00–09:00, 12:00–14:00 and 18:00–20:00 SAST. Inside those windows the queue runs every 30 minutes. GitHub event wakes are off. The Steward is paused: the 07:00 routine stays in place and does not run. The Designer is paused. Do not start either role without the founder's yes.
- **Docs batching (2026-10-19).** No docs-only pull request between the twice-daily docs batches. Queued docs, including this file, land in the morning or evening batch.
- **The Builder never applies a migration.** A migration pull request waits for the founder's yes. Migrations 193 (PR #220) and 194 (PR #241) were merged on 2026-10-19 and applied live the same evening. 195, 196, 197, 198 and 200 are live (section 2). 196's file is in the repo. 199 is live too (PR #277, `20261101171030`). Do not apply it again. The next new migration is 201.

**Database / migrations**
- Remote migration versions are timestamps; local files are numbered. Any CLI-style "migrations not found"
  check (e.g. the Supabase Preview GitHub check) is a harmless mismatch. Don't rename files or repair rows.

**API / frontend**
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
- `store.jsx`'s `if (!realUser)` branches are load-bearing for the e2e suite; don't strip them. The e2e specs
  drive the UI by **visible button text**, so grep the specs before renaming or moving a CTA (§3AM).
- **CDN tags are build-enforced (`@citizens/frontend-build` 0.2.0):** supabase-js must pin the installed
  version with a matching SRI hash. React and ReactDOM stay on the 18.3.1 UMD (hand-verified hashes) because
  npm React is 19 and has no UMD build to compare — do not add them to `sriPackages`. A supabase-js bump goes
  red on Build until `index.html` follows: move the URL, paste the hash the error prints, and check it with
  `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
- **MapLibre is vendored** in `apps/connect/src/frontend/vendor/maplibre-gl/` (v6.15.0, the fix for a CVSS-10
  XSS). Bumping `maplibre-gl` means re-copying the four files into Connect and Vision; the build fails loudly
  otherwise. 6.15.0 ships an empty `maplibre-gl-shared.mjs` (the chunk is inlined; the npm tarball is empty
  too). Any new map (e.g. Vision's Timeline Map) must use the same vendored copy, never an unpkg 4.x build.
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
- **Map v2 (C19) is the only map** (no flag since #179): its modules are `app/map-v2-*.jsx` (registered in `index.html` AND `appFileOrder`), its
  tokens and component CSS are `assets/map-v2.css` (injected by `map-v2-lib.jsx` on every page; raw hex and px live only in the token blocks, a test
  enforces it; `report.css` declares no tokens, it reads these), all new text is in `map-v2-strings.jsx`. `EntityCard` has two layouts, `grid` (Kingdom
  Exploration) and `sheet` (inside the Map v2 sheet); Impact Ideas keep their own small `IdeaPanel` in `home.jsx`. **The sheet uses ONE `useBackGuard` entry** (Back, Escape and the close button close it at once; navigate first, then
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
- **Since #301 a pin only picks its card in the Explore row; the card opens the full sheet.** The half sheet and the
  Follow/Save action row appear only through `openPinSheet`, on the clean map. A spec that taps a pin and expects the half sheet fails.
- **On a slow CI runner the Explore row re-ranks, and web fonts resize text, after the pins first appear.** `openListing()` and
  `bareMapPoint()` call `mapSettled()` first. A bare `openMap()` followed by a tap or a gesture will flake. The Follow and Save
  specs wait with `stillBox` and can run under CPU throttling (`throttleCpu`, `E2E_CPU_THROTTLE`; #296).
- **Known pre-existing flake:** `map-v2-listing-sheet.spec.ts` "real touch: a sideways swipe switches tab" fails locally on clean `main` too.
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

## Moved from section 1 (at a glance)

- **Vercel team** `citizensecosystem-projects`, one project per app, auto-deploying on push to `main`. Since PR #226
  (`d2c21ea`, #224) each app skips a docs-only commit, and skips a commit that does not touch that app or a shared
  package it depends on. If the diff cannot be trusted, the app still builds. A skipped deploy is canceled before the
  build, which is expected. GitHub Actions still runs. Docs-only edits wait for the twice-daily docs batch.
