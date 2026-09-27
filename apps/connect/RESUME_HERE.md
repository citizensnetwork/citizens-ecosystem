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
> **Last full audit: 2026-09-27** (`main` @ `c7978e7`). Every open item below was re-checked that day against
> git, GitHub, Supabase, Vercel and the code. Tags like `(§3AP)` point to the archived section with the detail.

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

## 2. Current state snapshot (verified 2026-09-27)

- **`main` @ `c7978e7`** (PR #70). Production READY on all three apps. No open feature PRs, no open issues.
- **Database head = migration 177** (`20260927184421 / 177_profiles_column_privacy_finalize`). **Next migration # = 178.**
- **Security advisor baseline: 0 ERROR / 118 WARN / 3 INFO.** Every WARN is known and accepted: 105
  authenticated + 11 anon SECURITY DEFINER EXECUTE grants (by design, each documented in its migration), HIBP
  (needs Supabase Pro), and `pg_net` in `public`. The 3 INFO are `search_term_stats` (service_role-only by
  design) and two orphan tables (item **H6**). Compare new work against **this** baseline.
- **Performance advisor debt (not yet addressed):** 214 `auth_rls_initplan`, 319 `multiple_permissive_policies`,
  65 unindexed foreign keys (19 of them in `wear`), 6 duplicate indexes (all in `public`). See item **S6**.
- **14 cron jobs, all active:** map prominence, messaging purge, contributor analytics ×3, search-term purge,
  contributor digest, Vision MV refresh ×3, Vision daily snapshots, Vision advisory eval, live-location cleanup
  (every 15 min), impersonation expiry sweep (every 5 min).
- **Live data:** 15 profiles · 5 Contributors (**only 1 has a map pin and a category, so 4 are invisible on the
  map**) · 40 Places · 3 Events · 1 News post. Wear: 6 verified brands, 1 Wear admin. Vision: 1 organisation,
  0 linked to a Connect Contributor.
- **Tests (last full run, PR #66):** Connect 775 unit (+32 live-only, skipped in CI) · Vision 734 · Wear 115 ·
  `@citizens/db` 127 · frontend-build 55 · **Connect Playwright e2e 13/13**.
- **Env:** Connect's Vercel env has Supabase, MapTiler, Upstash (rate limiting is live), `INTAKE_WEBHOOK_SECRET`
  and the Vercel↔Supabase integration vars. Auth email goes through Resend SMTP (`no-reply@citizenscentral.co.za`,
  domain verified).
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
  baseline is empty: fix the dependency, don't baseline it).
- Never `pnpm add vercel` (it once pulled in 26 advisories, §3AA). Use `npx vercel@latest` when needed.

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
- `apps/connect/src/types/react-canary.d.ts` keeps React's `cache` typed regardless of pnpm hoisting. Keep it
  until item **S2** lands.

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
| A1 | **Phase 6 live test of the Google Form intake.** Re-run `testConnection` (expect "Connected ✓"), submit a real test response, tick Approve, check the pin, Kingdom Discovery and the email, sign in with that Google account, confirm you land on the dashboard, then delete the test user. **Verified not done:** no intake-created listing exists in prod. (§3AP) | P1 |
| A2 | **One production smoke walk on Connect** (replaces five separate "please confirm" asks): sign in with Google (never machine-verified since the supabase-js pin, §3AT) → Become a Contributor (§3AL) → dashboard edit, cancel and News → Admin Create + Claim → phone-to-desktop map resize (§3AJ) → Android Back button and cards (§3AN). | P1 |
| A3 | **Wear walk-through:** the sign-in-as (impersonation) flow as admin (only the seed and smoke sessions exist, §3AB), plus a live email test: sign-up confirmation, password reset and 6-digit code via Resend (§3S). | P2 |
| A4 | **Write the Ts&Cs, Code of Conduct and fee-schedule documents.** The Wear brand application's checkboxes refer to them by name only, and the app-store listings will need them too. | P2 |
| A5 | **Get the 4 invisible Contributors onto the map** (Josh Mkhari, Ricardo Goncalves, Sound Storage inc, Grav: no category, no location). Ask them to finish their profiles, or fill them in from Admin. | P2 |
| A6 | Custom domains (e.g. `wear.` and `vision.citizenscentral.co.za`) plus a branded storage-asset origin, so URLs stop exposing `*.vercel.app` hashes and the Supabase project id (§3U). | P3 |
| A7 | Decide what to do with the **Supabase Preview** GitHub check. It reports "skipped" on every PR (Free tier), so it's harmless: uninstall it or leave it (§3M). | P3 |
| A8 | Mobile store accounts: **F1** Firebase (Android push), **F2** Apple Developer + a Mac, **Step 6** store compliance (privacy/terms URLs, data-safety form, icons, screenshots, age rating), **Step 7** release process (§3G). | Parked |
| A9 | Supabase **Pro** upgrade decision. It unlocks HIBP leaked-password protection and DB branching (safer migrations). | Parked |

### C. Connect: the v1 discovery loop (current product focus)
| ID | Item | Pri | Size |
|---|---|---|---|
| C1 | **Bug:** a cancelled Event or Place disappears from its owner's dashboard after a reload, because `/api/v1/*` only returns published rows and there is no owner-scoped fetch. Restore only works in the session that cancelled it. (§3AO) | P1 | S–M |
| C2 | **Admin hide/unhide button** for `set_contributor_hidden`. The backend and `/api/admin/contributors/hide` have been live since mig 164. It is the moderation safety net for self-serve go-live, and it has no UI. (§3AE) | P1 | S |
| C3 | **Apply wizard: collect the Contributor kind** (incl. Individual; the data model is done in mig 173) and relax the "Organisation / ministry name" copy for solo people. (§3AP, V1_SCOPE §7) | P2 | S |
| C4 | **Admin Create parity:** add X, LinkedIn, WhatsApp, public contact email and cover photo (the intake RPC already takes them). (§3AP) | P2 | S |
| C5 | **Email + password and 6-digit-code sign-in for Connect** (and Vision). Both are Google-only today; the provider is enabled project-wide and Wear's screens are the pattern. You flagged that Google Auth "may not be available soon". (§3P, §3S) | P2 | M |
| C6 | **Lazy profiles:** stop `on_auth_user_created` from creating a `public.profiles` row for every auth user (verified still present). Add "ensure profile on first Connect sign-in" **first**, or new sign-ups break. It touches live auth, so it needs its own tested session. (§3S) | P3 | M |
| C7 | Guest mode: Consider / Follow / Connect on a real listing silently does nothing after an optimistic UI flip. Add toast-and-revert (about 10 call sites). (§3AH) | P3 | S |
| C8 | e2e coverage for the contributor portal (edit, cancel, Profile, News). (§3AG) | P3 | S |
| C9 | Small polish, founder's choice: Noir/dark landing variant (§3AJ) · step-level Back inside wizards (§3AN) · cover-photo reorder UI (§3AM) · enforce `p_status` inside `find_or_create_conversation` (§3E) · gallery images via the Form (logo and cover only today) · update the Drive field-spec doc (it still lists the 17 event categories) · label `docs/feature-clarity/*` as deferred (§3AD). | P3 | S each |

### S. Security, platform and code health
| ID | Item | Pri | Size |
|---|---|---|---|
| S1 | **Give Wear a Content-Security-Policy.** It sends none (its `next.config.js` comment claims one). Its `index.html` has no inline scripts, so a strict `script-src` looks achievable. Brief: [`docs/handoffs/WEAR_CSP_HANDOFF.md`](docs/handoffs/WEAR_CSP_HANDOFF.md). (§3AT) | P1 | S–M |
| S2 | **React-types alignment + missing git tags.** Founder-approved, validated, then reverted; not restarted. Brief: [`docs/handoffs/REACT_TYPES_ALIGNMENT_AND_TAG_HANDOFF.md`](docs/handoffs/REACT_TYPES_ALIGNMENT_AND_TAG_HANDOFF.md). Tag status: `connect-pre-mig174-profiles-privacy` (→ `dca4411`) and `pre-mig-172-entity-socials` (→ `c555d02`) **exist nowhere** and must be created; `connect-pre-mig158`, `connect-v1-pre-mig164` and `wear-pre-mig163` exist only on the founder's machine and need pushing. | P1 | S |
| S3 | **Connect: compile Tailwind statically** and drop the Tailwind Play CDN (a runtime JIT not meant for production; the `.cc-map` rule already makes the switch safe). Add **SRI to the pinned lucide tag**. (§3AN, §3AO) | P2 | M |
| S4 | Set `"incremental": false` in the `apps/vision` and `apps/wear` tsconfigs, matching Connect. (§3AQ) | P2 | S |
| S5 | **Wear account deletion can fail for brand owners:** the marketplace FKs are not DEFERRABLE (verified: 0 in `wear`), so a cascading delete can hit error 23503. Make them `DEFERRABLE INITIALLY DEFERRED`, or add a bottom-up SECDEF cleanup function. Needed before any "delete my account" flow. (§3R) | P2 | S |
| S6 | **DB performance sweep:** wrap `auth.uid()` in `(select …)` across RLS policies (214 initplan WARNs), merge duplicate permissive policies, index the 65 unindexed FKs, drop the 6 duplicate indexes. Absorbs Wear's old "`auth_rls_initplan` sweep" fast-follow. | P2 | M–L |
| S7 | Move Connect and Vision onto `@citizens/utils` rate limiting (their copies are byte-compatible on purpose; Wear already uses it). (§3N, §3R) | P3 | S |
| S8 | `packages/db` branch coverage: backfill `src/memory.ts` tests and raise the floor from 64 back to 70. (§3AR) | P3 | M |
| S9 | Vision's Playwright e2e crashes without real Supabase env and isn't in CI. Give it Connect's hermetic-mock treatment, then wire it into CI. (§3AF) | P3 | M |
| S10 | Build guard: fail the build if `index.html`'s app script list and `appFileOrder` disagree (the §3Y bug class). | P3 | S |
| S11 | Vision's and Wear's `scripts/build-frontend.js` should load `.env.local` the way Connect's does (local dev only). (§3AH) | P3 | S |

### V. Vision (live since 2026-07-18)
| ID | Item | Pri | Size |
|---|---|---|---|
| V1 | **Timeline Map with live MapLibre.** `views.jsx TimelineMap()` is still a placeholder; `/api/map/activities` and `/api/timeline` exist and the MapTiler key is set. No migration. Vision's `index.html` loads **no** MapLibre today: use the vendored 6.11.2 copy (see §3). (§3AC) | P2 | M |
| V2 | **Network graph** (§4.3 of the wiring spec): "which orgs share your audience?" Its own PR + migration (next free # is **178**; older notes say 164 or 168, both taken). Reuse `org_active_persons` + the mig-155/156 orbit pattern; it feeds `vision.org_partnerships` + `/api/metrics/cross-org`. | P3 | L |
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
| H2 | Delete the 24 merged remote branches, plus 3 squash-merged leftovers (`claude/event-location-map-ui-kib8od` = PR #60, `claude/map-icon-zoom-visibility-1yzg4a` = #61, `claude/map-icon-label-zoom-16-5` = #62) and the local `feat/connect-guest-landing-location-picker` (= PR #47). `origin/chore/phase-4-local-rewrite` (Wear, May 2026) looks obsolete: confirm, then delete. |
| H3 | Park the standalone `../citizens-connect` checkout (4 uncommitted: `.gitignore`, `RESUME_HERE.md`, decision brief, `.codeviz/`). Clear the sibling clutter (`../citizens-wear-pr8`, `../cv-temp`, `../citizens-connect.worktrees`) and the orphan `.claude/worktrees/agent-a4219a…` folder. |
| H4 | Retire stale status docs that compete with this file: `apps/connect/.github/PROJECT_STATUS.md` (last updated 2026-07-01), `apps/connect/.github/workflows/ci.yml` (nested, so GitHub never runs it), root `.github/PROJECT_STATUS.md` (Wear, May 2026), and ECOSYSTEM_DECISION_BRIEF rows 0 ("in flight"; done since §3H) and 5 (monorepo; done). |
| H5 | **Undeployed edge functions:** 9 of the 14 in `supabase/functions/` were never deployed and nothing calls them (see P8 in §5). Decide: deploy and wire them, or delete them. `review-contributor-application` is deployed but serves the pre-self-serve admin-review path. |
| H6 | **Orphans in prod (needs founder OK):** tables `public.kv_store_794cc4b9` (20 rows of demo seed data) and `public.kv_store_7f45c4c8` (empty); edge functions `make-server-794cc4b9` and `make-server-7f45c4c8` (Figma-Make prototypes from June) and `deploysmoke` (returns "ok"). None are in the repo. Drop them. |
| H7 | Two untracked drafts sit in the working tree on `main`: `apps/connect/docs/routines/daily-routine.md` and `apps/connect/config/onboarding-presets.json` (see P2 in §5). Commit or delete them. |

---

## 5. Partly finished and scattered work (where each one stopped)

| # | Project | Where it stopped | Next |
|---|---|---|---|
| P1 | Google Form → map Contributor intake (§3AP) | Built, merged and live. The live end-to-end test was never run. | A1 |
| P2 | **Connect Daily Routine** (drafted 2026-09-21) | Draft v1 of a daily "check, discover, suggest" routine that reports to a Drive folder, plus onboarding presets. Never committed, never scheduled; the presets are "not wired into the wizard". | Adopt (commit + schedule) or discard. H7 |
| P3 | React-types alignment + tag push | Approved, validated end-to-end, reverted, not restarted. | S2 |
| P4 | Wear CSP | Flagged in §3AT. The brief was only in local `%TEMP%`; now rescued to `docs/handoffs/WEAR_CSP_HANDOFF.md`. | S1 |
| P5 | Vision Timeline Map | Placeholder since 2026-07-02; unblocked since 2026-07-18; never started. | V1 |
| P6 | Vision network graph + Phase D | Scoped only. | V2, V3 |
| P7 | Impersonation Phase 2 | Phase 1 is live; Phase 2 waits on a design session. | W1 |
| P8 | **Notification edge functions** | 5 of 14 deployed (incl. notify-broadcast, notify-event-update, send-contributor-digest). Never deployed: notify-event-cancelled, notify-interested-users, notify-nearby-rsvp, notify-new-follower, prompt-post-event-reviews, send-daily-digest, send-event-reminder, send-rsvp-reminders, submit-contributor-application. Push notifications also need F1/F2. | H5, A8 |
| P9 | Mobile launch (Capacitor) | Connect's native shell, deep-link OAuth and native geolocation are code-complete (§3G) but have never run on a device. Wear has no shell. Store work not started. | A8, W3 |
| P10 | Lazy profiles | Designed (§3S), not built. | C6 |
| P11 | Email/password sign-in for Connect + Vision | The Wear pattern exists; not ported. | C5 |
| P12 | Contributor kind in the Apply wizard | Data model done (mig 173); wizard UI not. | C3 |
| P13 | Contributor moderation | Backend done (mig 164); no admin button. | C2 |
| P14 | Rate-limit consolidation | Wear is on `@citizens/utils`; Connect and Vision still use their own copies. | S7 |
| P15 | Tailwind static compile | The prerequisite (`.cc-map` rule) landed; the compile itself isn't done. | S3 |
| P16 | Vision e2e | The suite exists, crashes on boot, and isn't in CI. | S9 |
| P17 | Monetisation | PayFast schema only (mig 081); a brand fee is agreed in a form but never collected. | M1, A4 |
| P18 | Figma-Make prototypes | Leftover tables and edge functions in prod from the June experiments. | H6 |
| P19 | Address hygiene | Roadmap only: custom domains + a branded storage origin. | A6 |

---

## 6. Recent sessions (newest first; full detail in the archive or the PR)

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
- **2026-09-26 — PR #63, §3AP:** Google Form → map Contributor intake (mig 173, 12 Contributor types,
  Individual kind, `/c/<slug>` links).
- **2026-08-23 → 08-26 — §3AD–§3AO (PRs #40–#62):** Connect v1 re-scope, self-serve go-live, Kingdom
  Discovery, contributor portal, guest landing, the production-500 root cause, Bearer-auth sweep, map pins
  and labels, social parity.

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
