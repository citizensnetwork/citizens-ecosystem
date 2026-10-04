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
> **Last audit: 2026-10-03** (`main` @ `ec19099`). §2, the A, C and H items and §5's P1/P11 were re-checked that day against
> git, GitHub, Supabase and Vercel. The S, V, W and M items were last re-checked on 2026-09-27. Tags like `(§3AP)` point to the
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

## 2. Current state snapshot (verified 2026-10-03)

- **`main` @ `ec19099`** (PR #82, Wear's crown + loading splash, merged 2026-10-03 on top of #79 admin Delete + mig 178, #78/#80
  map-preview work and #81, the dated `braces` OSV exception). CI and CodeQL are green on it and the Connect production deploy
  completed (Vision and Wear "not affected"). Since then (2026-10-04): #86 (mig 179) and #88 (D-12, mig 180) landed, and the D-13 welcome-email PR (#90) follows (see §6). **#89 (C15, URL routing; another session) overlaps them in `store.jsx`, `shell.jsx`, `admin.jsx` and `index.html`: whoever merges second merges `main` in and re-bumps the `?v=` stamps.** The 14 stale Dependabot PRs remain (item **H1**).
- **Database head = migration 180** (`20261004061633 / 180_contributor_applications_need_admin_approval`, applied 2026-10-04 after PR #88's deploy; pre-apply tag `connect-pre-mig180-contributor-approval`). **Next migration # = 181.** (179, `20261003145437`, made approve reset `contributor_hidden` and repaired the admin review RPCs.)
- **Security advisor baseline: 0 ERROR / 118 WARN / 3 INFO** (re-checked 2026-10-04 after mig 180: one fewer WARN than before, because the dropped `self_approve_contributor_application` was one of the authenticated SECURITY DEFINER grants). Every WARN is known and accepted: 105
  authenticated + 11 anon SECURITY DEFINER EXECUTE grants (by design, each documented in its migration), HIBP
  (needs Supabase Pro), and `pg_net` in `public`. The 3 INFO are `search_term_stats` (service_role-only by
  design) and two orphan tables (item **H6**). Compare new work against **this** baseline.
- **Performance advisor debt (not yet addressed):** 214 `auth_rls_initplan`, 319 `multiple_permissive_policies`,
  65 unindexed foreign keys (19 of them in `wear`), 6 duplicate indexes (all in `public`). See item **S6**. (Counts from 2026-09-27, not re-measured.)
- **14 cron jobs, all active:** map prominence, messaging purge, contributor analytics ×3, search-term purge,
  contributor digest, Vision MV refresh ×3, Vision daily snapshots, Vision advisory eval, live-location cleanup
  (every 15 min), impersonation expiry sweep (every 5 min).
- **Live data (2026-10-03):** 16 profiles · 5 Contributors (**only 2 are on the map; the other 3 lack a category or a pin, or are hidden**) · 40 Places ·
  4 Events (**0 upcoming, so none is on the map or in Discovery's list**) · 1 News post. Wear: 6 verified brands, 1 Wear admin.
  Vision: 1 organisation, 0 linked to a Connect Contributor. 14 cron jobs, all active.
- **Tests (2026-10-04: Connect from the D-13 branch, the rest from the D-12 workspace run):** Connect 1035 unit (+32 live-only, skipped in CI) ·
  Vision 734 · Wear 115 · `@citizens/db` 127 · frontend-build 55 · `braces-patched` 150 · **Connect Playwright e2e 57/57**.
  (Two tests can hit their 5 s timeout when every app's suite runs in parallel on a busy machine: `frontend-build`'s
  "hashed outputs" and Connect's `profiles-column-privacy` "176 alone". Both pass alone in seconds.)
- **Env:** Connect's Vercel env has Supabase, MapTiler, Upstash (rate limiting is live), `INTAKE_WEBHOOK_SECRET`
  and the Vercel↔Supabase integration vars. Auth email goes through Resend SMTP (`no-reply@citizenscentral.co.za`,
  domain verified). **Connect has no `RESEND_API_KEY` and no `ADMIN_NOTIFY_EMAIL` in Vercel yet (founder step A11):** until
  they are added, the emails Connect sends itself (new-application notice, approve/reject verdict, owner welcome) are
  `skipped`, which is logged and never an error.
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
  change** (2026-10-02, PR #76: brace-expansion, js-yaml, undici): raise the `pnpm.overrides` floor, then
  check the lockfile against OSV.dev before pushing. **`braces` is a patched local fork**
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
- **Public repo:** never commit a real organisation's or person's contact details (emails, user ids) in tests,
  docs or handoffs. Use reserved `.example` addresses.

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
| A2 | **Finish the production smoke walk on Connect.** Done by the founder: Google sign-in as admin, map and Admin → Listings; a Contributor's dashboard, Profile tab and News post; Admin → Listings → **Delete** (2026-10-03, "works beautifully"). The cancel/restore step found bug **C1/C1b**. Still to do: **Become a Contributor** with a fresh citizen account (since D-12 it waits for an admin: walk the whole loop, see A11's live checks) · phone-to-desktop map resize (§3AJ) · Android Back button and cards (§3AN, a device is needed) · re-test C1/C1b once fixed. (Admin Create + Claim still works as a silent auto-claim until **C10** replaces it with a confirm screen.) | P1 |
| A3 | **Wear walk-through:** the sign-in-as (impersonation) flow as admin (only the seed and smoke sessions exist, §3AB), plus a live email test: sign-up confirmation, password reset and 6-digit code via Resend (§3S). | P2 |
| A4 | **Write the Ts&Cs, Code of Conduct and fee-schedule documents.** The Wear brand application's checkboxes refer to them by name only, and the app-store listings will need them too. | P2 |
| A5 | **Get the 3 invisible Contributors onto the map** (each lacks a category or a pin, or is hidden; see Admin → Listings). Ask them to finish their profiles, or fill them in from Admin. | P2 |
| A6 | Custom domains (e.g. `wear.` and `vision.citizenscentral.co.za`) plus a branded storage-asset origin, so URLs stop exposing `*.vercel.app` hashes and the Supabase project id (§3U). | P3 |
| A7 | Decide what to do with the **Supabase Preview** GitHub check. It reports "skipped" on every PR (Free tier), so it's harmless: uninstall it or leave it (§3M). | P3 |
| A8 | Mobile store accounts: **F1** Firebase (Android push), **F2** Apple Developer + a Mac, **Step 6** store compliance (privacy/terms URLs, data-safety form, icons, screenshots, age rating), **Step 7** release process (§3G). | Parked |
| A9 | Supabase **Pro** upgrade decision. It unlocks HIBP leaked-password protection and DB branching (safer migrations). | Parked |
| A10 | **Last bit of the email-code sign-in (PR #77).** The founder reported on 2026-10-03 that the live test with an Outlook-mail owner passed (code → their dashboard) and that `intake-v2.gs` is pasted into the Sheet, so the templates and the re-paste are done. The Supabase email rate limit is **60 emails/hour** (founder, 2026-10-03; the target was at least 30), so that is done too. Still open and optional: lower the email OTP expiry from 1 h to about 15 min (Authentication → Providers → Email), and re-test a never-registered address (should become a citizen) and Google for the admin, which the report did not cover. | P3 |
| A11 | **Finish the contributor-approval rollout (D-12 / D-13).** *Founder steps:* (1) add `RESEND_API_KEY` (a sending-only Resend key) and `ADMIN_NOTIFY_EMAIL` to the Vercel **Connect** project for Production and Preview, then redeploy; until then no email leaves Connect. *Live checks:* ① Become a Contributor with a fresh Gmail plus-address (e.g. `+applytest2`) → Dashboard shows the "being reviewed" banner → not on the map → the admin email arrives → Admin → Applications → Approve → the applicant gets "You're live" and the pin appears. ② Reject one → the applicant gets the reason and can apply again. ③ Admin → Create with "Email the owner" ticked → the welcome arrives (check junk) → 6-digit sign-in → Dashboard; clean up via Admin → Listings → Delete. ④ Delete a test listing, re-apply with the same account, approve → it **is** on the map (the mig 179 fix). | P1 |

### C. Connect: the v1 discovery loop (current product focus)
| ID | Item | Pri | Size |
|---|---|---|---|
| C1 | **Bugs C1 + C1b (found live on 2026-10-03):** a cancelled Event or Place (C1) vanishes from its owner's dashboard after a reload, because `/api/v1/*` returns published rows only; and (C1b) its pin stays on the map until reload. Fix: an owner-scoped read of all statuses for the Dashboard (RLS already allows it, no migration), published-only everywhere public. Full spec: PR 1 of the local, untracked brief `docs/handoffs/CONNECT_URL_ROUTING_AND_OWNER_FETCH_HANDOFF.md`. A cancelled test event is kept in prod on purpose for the re-test. (§3AO) | P1 | S–M |
| C3 | **Apply wizard: collect the Contributor kind** (incl. Individual; the data model is done in mig 173) and relax the "Organisation / ministry name" copy for solo people. (§3AP, V1_SCOPE §7) | P2 | S |
| C4 | **Admin Create parity:** add X, LinkedIn, WhatsApp, public contact email and cover photo (the intake RPC already takes them). (§3AP) | P2 | S |
| C5 | **6-digit-code sign-in for Vision.** Connect shipped it (PR #77) and Wear already has it; Vision is still Google-only. Port Connect's `EmailSignIn` panel and `CC_AUTH_HELPERS` (`auth.jsx`, `auth-client.js`). Email + password for Connect was dropped on purpose: passwordless only. (§3P, §3S) | P2 | S–M |
| C6 | **Lazy profiles:** stop `on_auth_user_created` from creating a `public.profiles` row for every auth user (verified still present). Add "ensure profile on first Connect sign-in" **first**, or new sign-ups break. It touches live auth, so it needs its own tested session. (§3S) | P3 | M |
| C7 | Guest mode: Consider / Follow / Connect on a real listing silently does nothing after an optimistic UI flip. Add toast-and-revert (about 10 call sites). (§3AH) | P3 | S |
| C8 | e2e coverage for the contributor portal (edit, cancel, Profile, News). (§3AG) | P3 | S |
| C9 | Small polish, founder's choice: Noir/dark landing variant (§3AJ) · step-level Back inside wizards (§3AN) · cover-photo reorder UI (§3AM) · enforce `p_status` inside `find_or_create_conversation` (§3E) · gallery images via the Form (logo and cover only today) · update the Drive field-spec doc (it still lists the 17 event categories) · label `docs/feature-clarity/*` as deferred (§3AD). | P3 | S each |
| C10 | **Verify-first attach for a Form approval whose owner email already has an account** (founder decided 2026-10-03; design below, nothing built). (PR #73). *Note (2026-10-04):* admin-created listings now email the owner a welcome (`ownerWelcomeEmail`, D-13); keep its "sign in to see your listing" wording true when this confirm screen lands. | P2 | M–L |
| C11 | **Events feed ceiling.** `/api/v1/events` is `order by date ASC, limit 100` and the store fetches page 1 once, so once total event rows (past included) pass 100, the *upcoming* ones fall off the page and never reach the map. Fix with the existing `from=` filter for the map/Discovery fetch plus an owner-scoped fetch for past and cancelled events (this overlaps **C1**: design them together). Today: 3 events, so not urgent. | P2 | M |
| C12 | **First-view framing.** With geolocation denied the map frames *all* data, and a few far-away places push it to a national view. It now stops at the lowest visible gate and centres on the visible pins, but a new guest would be better served by framing the densest cluster (median-based, so one outlier doesn't pull the camera away from Pretoria). | P3 | S |
| C13 | Map polish found in the map-preview PR: the preview card shows no distance on the map (the list does: `HomePage` never passes `myLoc` to `EntityCard`), the Map Key has no Contributor entry, and Impact Ideas never gate by zoom. | P3 | S |
| C15 | **A real URL for every screen** (founder request after the A2 walk). Today the bar says `/index.html` almost everywhere, so a refresh drops you on the map and nothing can be shared or bookmarked. Route table, history integration (`pushState`/`popstate`, retiring the single-entry Back trap), a safe auth return path and tests are specified in PR 2 of the same local brief as C1. Do it after C1/C1b. Afterwards confirm Supabase → Auth → URL Configuration still lists the site root. | P2 | M–L |
| C16 | **Listing Automation Phase 1** (consent-first, POPIA; founder decisions D-8 to D-11 in the local planning handoff): private consent columns on `profiles`, `listing_sources` and `listing_suggestions` tables, a scoped `POST /api/automation/suggestions`, a dashboard "Automatic updates" panel and Suggestions tab, and a daily email. It replaces the repo's `tools/google-forms/intake.gs` with the corrected `intake-v2.gs` (see **H9**). Needs a migration (ask the founder first). The founder chose it **before C10**. Phase 2 (a daily scheduled reader that posts suggestions) comes after. Brief: local, untracked `docs/handoffs/CONNECT_LISTING_AUTOMATION_PHASE1_HANDOFF.md`. | P2 | L |
| C17 | **One design reference, then a periodic check** (founder idea, 2026-10-03; not a priority). Collect the preferred look in one living reference, then audit screens against it: the rounded, blurred-backdrop modal (the admin Delete popup), font faces and colours, window patterns, the colour scheme and the one crown logo (now Wear's PNG). Today three definitions drift apart: `packages/ui/src/tokens.ts` (Wear-targeted, gold `#C9A24A`, a placeholder SVG crown, no consumer), Connect's CSS variables (`--gold-crown #D4AF37`) and Wear's PNG. First step: reconcile them into `packages/ui` tokens plus a short design reference with screenshots; the "daily check" could later become a step in P2's routine. | P3 | M |
| C18 | **Drafts for pending applicants.** D-12 asked that a pending applicant can also draft events (and places, news) that publish on approval. v1 of D-12 gives them **profile only** (founder decision 2026-10-03): `places` and `news_posts` SELECT policies are `true`, so anything they saved there would be world-readable. Doing drafts properly needs a staging model (e.g. a `status='draft'` the open SELECT policies exclude, or staging on the application row like the profile) plus approval publishing them. Do it after the first real applicants say they want it. | P3 | M–L |

**C10 design (agreed 2026-10-03; nothing built yet).**
- *Threat:* the Form is public and `owner_email` is unverified. An approval that attached a listing to an existing account on its own would let a stranger plant content on a victim's account. So nothing on an existing account changes without the verified owner's explicit yes.
- *Flow:* on approving an existing-email row the listing goes **live now under a placeholder** (it needs an alias auth email, since emails are unique; GoTrue's acceptance of the alias needs a live check, and never mail it) with `contributor_claim_email` = the real owner email. The owner gets a different welcome email, signs in (the 6-digit code proves the inbox, or Google), and sees **"Attach 'X' to your account? [Confirm] [Not me]"**. Only Confirm runs the claim.
- *Always* an explicit confirm, admin-created listings included: it replaces today's silent auto-claim (`store.jsx` `landOwnListing`). Make the claim RPC require `email_confirmed_at is not null`, and add a read-only `peek_claimable_listing()` for the confirm screen.
- *Sheet:* the **database** holds the state. The Apps Script polls `POST /api/intake/google-form/status` (HMAC, like the intake route) about every 10 minutes and writes "Awaiting owner" / "Owner confirmed ✓" into the row's Status. The Sheet never triggers anything. Re-paste `intake.gs` after changing it.
- *Founder decisions on the open questions (2026-10-03):* **"Not me"** hides the placeholder listing at once and flags it
  for the admin (the Sheet status says "Owner declined"; the admin decides whether to Delete); nothing on the existing
  account changes. **No response:** the listing stays live, the Sheet shows "Awaiting owner" with its age, and **one reminder
  email goes out at 7 days**; nothing is ever attached without the owner's yes, and no auto-expiry.
- *Order of work (founder, 2026-10-03):* **Listing Automation Phase 1 comes first**, then C10. Both need a migration (take the
  next free number at apply time, not necessarily 179) and both edit the intake route and the Apps Script. Automation replaces
  the repo's `tools/google-forms/intake.gs` with `docs/handoffs/intake-v2.gs` wholesale; **C10 must start from that**, never
  from the old number-matching copy (it misreads the consent question after the Section 7 reorder). Both designs agree: the
  database is the source of truth, consent comes first, and no Google Sheet sits in the data path.
- *Process:* needs a migration (ask the founder first, pre-apply tag, rollback-only probe, advisor diff). Read the founder's planning-session files first (untracked, local): `docs/handoffs/CONNECT_LISTING_AUTOMATION_PHASE1_HANDOFF.md`, `intake-v2.gs` and `PLANNING_SESSION_HANDOFF_2026-10-02.md` (decisions D-8 to D-11).

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
| V2 | **Network graph** (§4.3 of the wiring spec): "which orgs share your audience?" Its own PR + migration (take the next free number at apply time: head + 1, which was 179 on 2026-10-03). Reuse `org_active_persons` + the mig-155/156 orbit pattern; it feeds `vision.org_partnerships` + `/api/metrics/cross-org`. | P3 | L |
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
| H1 | **14 stale Dependabot PRs** (#9–#17, #24–#27, #39, #43; oldest 2026-06-21). Several are majors that need real review (TypeScript 7, `@types/node` 26, GitHub Actions v7). Close them and let Dependabot regenerate, or batch-review them. |
| H2 | Delete the merged remote branches: 53 remote branches besides `main` existed on 2026-10-03 (almost all merged; PRs #71-#82 added a dozen), plus about 17 stale local ones. `origin/chore/phase-4-local-rewrite` (Wear, May 2026) looks obsolete: confirm, then delete. |
| H3 | Park the standalone `../citizens-connect` checkout (4 uncommitted: `.gitignore`, `RESUME_HERE.md`, decision brief, `.codeviz/`). Clear the sibling clutter (`../citizens-wear-pr8`, `../cv-temp`, `../citizens-connect.worktrees`) and the orphan `.claude/worktrees/agent-a4219a…` folder. |
| H4 | Retire stale status docs that compete with this file: `apps/connect/.github/PROJECT_STATUS.md` (last updated 2026-07-01), `apps/connect/.github/workflows/ci.yml` (nested, so GitHub never runs it), root `.github/PROJECT_STATUS.md` (Wear, May 2026), and ECOSYSTEM_DECISION_BRIEF rows 0 ("in flight"; done since §3H) and 5 (monorepo; done). |
| H5 | **Undeployed edge functions:** 9 of the 14 in `supabase/functions/` were never deployed and nothing calls them (see P8 in §5). Decide: deploy and wire them, or delete them. `review-contributor-application` is still deployed but **nothing calls it any more** (since D-12 `/api/admin/contributors/review` calls the approve/reject RPCs directly and its email deep-link mode is gone): the founder decides whether to undeploy it. |
| H6 | **Orphans in prod (needs founder OK):** tables `public.kv_store_794cc4b9` (20 rows of demo seed data) and `public.kv_store_7f45c4c8` (empty); edge functions `make-server-794cc4b9` and `make-server-7f45c4c8` (Figma-Make prototypes from June) and `deploysmoke` (returns "ok"). None are in the repo. Drop them. |
| H7 | Two untracked drafts sit in the working tree on `main`: `apps/connect/docs/routines/daily-routine.md` and `apps/connect/config/onboarding-presets.json` (see P2 in §5). Commit or delete them. |
| H9 | **Repo/live drift on the Apps Script.** The live Sheet runs the corrected `intake-v2.gs` (founder confirmed 2026-10-03), but the repo's `apps/connect/tools/google-forms/intake.gs` is still the OLD copy that finds answers by question NUMBER, which misreads the consent question after the founder's Section 7 reorder. Anyone who re-pastes the repo copy re-introduces the bug. Until **C16** lands, sync the repo copy (a tiny PR: copy `intake-v2.gs` over it, drop its banner, README: "matched by wording"), after checking it holds no real names or emails. |
| H10 | **Check monthly for an upstream `braces` fix** (the patched fork `packages/braces-patched`, §3 Process). Run `npm view braces version` AND read GHSA-vfj7-8cjw-p6xm's affected ranges: a new version only counts if it is not listed as affected. When one ships, follow "Removing the fork" in the package's `PATCHED.md` (delete the `braces` override and the package, `pnpm install`, run the CI's OSV command). Until then the fork is the whole fix. A fix for `micromatch/braces` is drafted in the PR that introduced the fork; post it only with the founder's OK. |

---

## 5. Partly finished and scattered work (where each one stopped)

| # | Project | Where it stopped | Next |
|---|---|---|---|
| P1 | Google Form → map Contributor intake (§3AP) | Built, merged and live. The live end-to-end test **passed on 2026-10-02** (a real listing, owner on Outlook mail, welcome email, 6-digit sign-in on 2026-10-03). Existing-email approvals still refuse with a clear Note until C10. | C10, C16, H9 |
| P2 | **Connect Daily Routine** (drafted 2026-09-21; a design-consistency step could join it, C17) | Draft v1 of a daily "check, discover, suggest" routine that reports to a Drive folder, plus onboarding presets. Never committed, never scheduled; the presets are "not wired into the wizard". | Adopt (commit + schedule) or discard. H7 |
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
| P20 | Contributor approval gate (D-12) + owner welcome email (D-13) | Built and merged 2026-10-04 (PRs #86, #88, #90); mig 180 applied. Not yet walked live: the Resend env vars are missing in Vercel. | A11, C18, S12 |

---

## 6. Recent sessions (newest first; full detail in the archive or the PR)

- **2026-10-04 — Contributor approval gate (D-12) and owner welcome email (D-13): #86, #88, #90.** A re-applied Contributor stayed `contributor_hidden` (approve now resets it, mig 179; the live admin Approve RPC had also been broken since mig 164: it inserted into a `notifications.url` column that does not exist). Self-serve "Become a Contributor" now **waits for an admin**: mig 180 closes four self-approval doors (RPC dropped, `protect_role_column` tightened, `contributor_applications` made server-written only), the applicant lands on a "being reviewed" Dashboard (new `pending-application.jsx`; profile edits staged on their application, copied on approval), Admin → Applications approves/rejects through the RPCs directly (shows "Previously removed by an admin on…", waits for the server) and the admin/applicant are emailed (`src/lib/email`, Resend, fail-soft, admin-notice cap 20/h). #90: admin Create emails the owner a welcome (checkbox, default on; the stale "sign in with Google" copy is fixed). Founder decision: pending applicants get **profile only**, drafts are **C18**. Found, not fixed: **S12**. Gates: Connect 1035 unit, e2e 57/57. Open: **A11** (Resend env vars + live checks), **C18**, **S12**, **H5**, **C15 (#89) overlaps these files**. Mig 180 was applied right after #88's deploy (probe green in production; advisors 0 ERROR / 118 WARN / 3 INFO).
- **2026-10-03 — `braces` patched fork replaces the OSV exception (H8 closed, PR #87).** Instead of renewing the dated exception, `packages/braces-patched` (private, `3.0.3-citizens.1`) is the exact `braces@3.0.3` tarball (sha512 checked against the lockfile, MIT kept) plus a nesting-depth guard: `lib/parse.js` refuses more than 100 nested `{`/`(` blocks with a `SyntaxError`, and `compile`/`expand`/`stringify` count depth for caller-built ASTs; `options.maxDepth` can only lower the limit. Root `pnpm.overrides` has `"braces": "link:./packages/braces-patched"`, so `pnpm-lock.yaml` holds no npm `braces` and `osv-scanner.toml` is empty again (no `[[IgnoredVulns]]`). **Proof:** the CI's exact command (osv-scanner v2.3.8, run locally) says "No issues found" on the new lockfile and, as a control, flags only this advisory on the old one. Normal patterns behave byte-for-byte as before: a golden test of about 490 000 results against the pristine tarball, and eslint over 473 files in 7 packages gives byte-identical JSON with the pristine copy swapped in. **Gotchas:** (1) CI runs `pnpm test:coverage`, so the fork defines that script too, or turbo skips its 150 tests. Once it ran, the first CI run failed on a fixture generated on Windows: picomatch writes `[\\/]` in a regex on a Windows host and `\/` on Linux unless its `windows` option is a boolean, so the golden now pins `windows: false` (regenerated against the pristine braces). Anything generated on this machine and compared on CI must not depend on the OS. (2) Pristine braces' failing depth at the default stack is erratic (V8 JIT state); `node --stack-size=200` is the deterministic repro. (3) Two load flakes (5 s timeouts) when Vision's suite hogs the CPU: `frontend-build` "hashed outputs" and Connect's `profiles-column-privacy` "176 alone"; both pass alone, and `turbo run test:coverage --concurrency=2` helps. Open: **H10** (check monthly for an upstream fix); the upstream draft for `micromatch/braces` is in the PR description and is NOT posted (needs the founder's OK).
- **2026-10-03 — `braces` OSV exception (#81), admin Delete merged (#79), Wear's crown + loading splash (#82, merged `ec19099`).** The `braces` <= 3.0.3 advisory (GHSA-vfj7-8cjw-p6xm; no fixed version exists on npm; dev tooling only) turned CI red on
  `main` and every PR. The founder approved ONE dated exception in `osv-scanner.toml` (expires **2026-11-02**, item **H8**; merged as #81, CI proved the TOML syntax). #79 then merged (`8ebfed3`) after picking up #80/#81; migration 178 had been
  applied beforehand. **Crown + splash (was C14):** Wear's gold PNG (127 KB resized to 5 KB) replaces the line-art crown on the landing and the sidebar's gold tile; a new `authResolved` store state shows a crown + ring-spinner splash instead of the sign-in landing while a probable session (a `sb-*-auth-token` key, `?code=` or `#access_token=`) is still resolving, with an 8 s safety timeout. First-time visitors and demo mode start resolved, so they see no splash flash. 3 e2e tests, mutation-checked. The founder also reported the Outlook-owner live test green (A10 reduced). Open: **C1/C1b**, **C15**, **C16**, **C10** (decisions recorded in its design block), **C5**, **A10** (optional: OTP expiry and two re-tests; the email rate limit is 60/h), **H8**, **H9**. **Gotchas:** a PC crash zeroed two uncommitted files (commit early; git fsck stayed clean), and Python `open(p, "w")` on Windows rewrites LF as CRLF (use `newline=""`). The item ID **C11** was claimed twice by parallel sessions; the crown item was renumbered C14.
  **Evening audit:** RESUME re-checked against live state; A1 closed (passed), A2/A5/C1/P1/P11/H2/V2 corrected; new C15 (URL per
  screen), C16 (Listing Automation Phase 1), C17 (design reference) and H9 (repo `intake.gs` is the old script). Admin Delete was
  tested live by the founder and works.
- **2026-10-02 → 10-03 — Map: one preview card for every pin, whole logos, clean zoom gates, no past events,
  intake hygiene** (PR #78, merged `bba102f`). From the founder's first live walk. Every pin, Contributor
  included, opens the same small `EntityCard`; "View Full Profile" is the way in. **Founder calls:** Contributors
  hide below zoom 6 (D1, his own answer), names from zoom 15 (D2). Org logos are shown whole (contain on white;
  Individuals' photos still fill). Finished events leave the map and Discovery and sit under "Past events" on
  the profile and dashboard (no end time ⇒ up for the rest of its day). A social value with spaces is a display
  name: refused on dashboard/Apply/admin, dropped with a Note on the Form intake; local SA WhatsApp numbers
  store as `27…`. The first Form submission's three bad socials were corrected with a guarded single-row UPDATE.
  First-view framing is clamped and centred so nationally spread data can't open blank (e2e, mutation-checked).
  Connect 852 unit, e2e 30/30, no migration. New items **C11–C13**. Not yet confirmed at write-up: post-merge CI
  and the production deploys, and the founder's production re-check. **Start here:**
  [`docs/handoffs/CONNECT_MAP_PREVIEW_WRAPUP_HANDOFF.md`](docs/handoffs/CONNECT_MAP_PREVIEW_WRAPUP_HANDOFF.md).
  The original brief (`…MAP_PREVIEW_CONSISTENCY_HANDOFF.md`) stays untracked: it names a real organisation.
- **2026-10-02 — Merged #71 and #75, fixed a red `main`, shipped email-code sign-in (C5).** #71 (`9eb727e`)
  and #75 (`b85f5ae`) merged. #75's Verify failed on the OSV gate only: 20 advisories published after 09-27
  (brace-expansion, js-yaml, undici, all dev/test-time) had turned `main` red since #71's merge; fixed by
  raising the `pnpm.overrides` floors in **#76** (`cb0a049`), checked against OSV.dev. **#77:** *Continue with
  email* on Connect's landing (6-digit code, `shouldCreateUser: true`): owners without Google (e.g. on Outlook)
  can finally reach their dashboard; guests are no longer dead-ended into Google; 40 unit + 6 e2e tests
  (e2e 20/20). **#79 (2026-10-03):** admin **Delete** on every Listings row. A listing is an account, so the
  database decides from one fact (has the owner ever signed in?): never = the placeholder is hard-deleted;
  signed in = only the listing goes and the person stays a citizen (their re-application would start
  hidden). **Migration 178 applied** (one admin-only SECDEF function; probe-verified; advisors 0/119/3).
  Route `/api/admin/contributors/delete-listing` (the old `/contributors/delete` discards applications).
  Founder decisions on C10 recorded above. Open: founder steps **A10**, Vision port (**C5**), **C10**, **C14**.
  The 2026-10-02 handoff stays untracked (it names a real organisation; this repo is public).
- **2026-09-27 (overnight) — React-types alignment (S2), all missing tags, intake moderation (C2).** PRs
  #72 (`0231014`), #73 (`abd0205`) and #74 (`279a677`), all merged. wear/ui now use connect's `@types/react`,
  and `pnpm.packageExtensions` gives `next` per-app `@types` peers. Hoist-swap proof: 0 tsc errors under every
  hoist, even without `react-canary.d.ts` (the control on `main` reproduced the `cache` error). Pushed all 5
  missing tags (the remote now has 12). Intake: prod DB path re-probed after 174–177 (rollback-only, all green);
  new **Admin → Listings** (hide/unhide, owner-sign-in state); actionable 409 Notes; README updated. Found: the
  Sheet holds only 3 hand-typed sample rows (A1). New founder decision C10. No migration (next # still 178).
- **2026-09-27 — RESUME_HERE audit + slim-down** (branch `claude/resume-here-slimdown`). Moved §3A–§3AT and the
  old NEXT STEPS verbatim to `docs/archive/RESUME_HISTORY_2026H2.md` (this file: 3,849 → about 300 lines).
  Re-verified every open item against live state. Closed as already done: Upstash env set; Wear brand queue
  cleared (all 6 brands verified, incl. the Mustard Seed demo); "Dam Cool" socials re-entered; Resend DNS,
  Vision deploy gates, PAT rotation and the code-as-hero email template all done. New finds: orphan prod tables
  and functions (H6), 9 undeployed edge functions (H5), missing git tags (S2), 4 invisible Contributors (A5),
  perf-advisor debt (S6), stale status docs (H4). Rescued the Wear CSP brief from `%TEMP%`. No code or DB change.
- **2026-09-27 — PR #70** (docs): brief for React-types alignment + the tag push (S2).
- **2026-09-27 — PR #66, §3AT:** CDN tags hardened on all 3 apps (supabase-js pinned + SRI, React production
  builds, both build-enforced). Flagged Wear's missing CSP (S1).
- **2026-09-26/27 — PRs #67/#68, §3AS:** `public.profiles` PII lockdown, migs 174–177 (anon could read every
  user's email). Column allowlist + server-owned-column guard. Found the real cause of the phantom
  `react.cache` build error (pnpm hoisting).
- **2026-09-26/27 — PRs #64/#65, §3AQ–§3AR:** production build fix; 26 OSV advisories fixed; a live CVSS-10
  MapLibre XSS patched by vendoring v6.11.2.
- **Earlier (2026-08-23 → 09-26, PRs #40–#63):** Connect v1 re-scope, self-serve go-live, Kingdom Discovery,
  contributor portal, guest landing, Bearer-auth sweep, map pins and labels, social parity, and the Google
  Form → map Contributor intake (mig 173). Detail: archive §3AD–§3AP.

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
- [`docs/FUTURE_IDEAS.md`](docs/FUTURE_IDEAS.md) — deferred ideas (not the pipeline).
- [`.github/MASTER_DIRECTION.md`](.github/MASTER_DIRECTION.md) — the original locked technical direction (batch plan).
- [`CATEGORIES.md`](CATEGORIES.md) — category colours and icons.

### Verify locally (Connect)
```powershell
npx tsc --noEmit; npx vitest run; npx next lint --dir src; node scripts/build-frontend.js; npx playwright test
```
