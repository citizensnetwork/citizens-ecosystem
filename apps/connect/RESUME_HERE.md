# RESUME_HERE — Citizens Connect

> **Read this first. Single source of truth for "where are we?" between sessions.**
> Updated at the end of every batch.
> **Also read [CLAUDE.md](CLAUDE.md) — auto-loaded standing instructions for every session.**

---

## 1. Project at a glance

- **Citizens Connect** — map-first Christian community discovery (events, places, Contributors).
- Stack: Next.js 15 App Router (RSC) + TypeScript + Supabase + MapLibre GL JS + MapTiler Cloud + Tailwind CSS v4 + Capacitor (iOS/Android).
- Design: white-black-gold (60/30/10), full-screen map-first, glass-overlay floating controls.
- Slogan: **Connecting the Kingdom** (Eph 2:19–22).
- **Locked direction: `.github/MASTER_DIRECTION.md`.**

---

## ⚠️ STRATEGIC PIVOT (2026-06-07) — read before trusting older sections

The **in-place Figma reskin of the Next.js components (Phases 1–5 below) is ABANDONED.**
Founder decision: it wasn't landing as wanted; the app was redesigned in Claude design
(the `Citizens Connect Map` zip). We are now **replacing the Next.js frontend entirely**
with the standalone HTML/React app in `src/frontend/`, keeping Next.js as **API-only**.

- New source of truth: **[docs/HTML_FRONTEND_WIRING_SPEC.md](docs/HTML_FRONTEND_WIRING_SPEC.md)**
  (+ ARCHITECTURE_AND_MIGRATION_STRATEGY.md, HTML_FRONTEND_MIGRATION_PLAN.md, memory/CC_SESSION_MEMORY.md).
- Build order: Phase 0 (done — see below) → 1 auth → 2 map+home → 3 screens → 4 advanced → 5 Capacitor.
- Everything in **§2-prev and older describes the OLD frontend** that Phase 1 will delete
  (`src/app/(pages)`, `layout.tsx`, `globals.css`, `src/components/`, `src/hooks/`). The backend
  history (migrations, API routes, edge functions, RLS) all **still applies** and stays untouched.

---

## 3A. Ecosystem Step 1 — shared-DB contract LOCKED ✅ (2026-06-17)

First item of the reconciled ecosystem work plan
([docs/strategy/ECOSYSTEM_DECISION_BRIEF.md](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md) §6, order 1).
The thing **Vision + Wear both depend on**. Working log: `.claude/sessions/step1-shared-db-contract-lock.md`.
**Docs-only — no DB/migration change → next migration # still 135.** Security advisors: **0 ERROR**
(119 WARN / 3 INFO = baseline; the 3 `rls_enabled_no_policy` WARNs are the intended service_role-only
pattern). Committed on branch `step1-shared-db-contract-lock` — **push to main pending founder auth.**

### Root finding — most of the brief's "Land …" items were already shipped
Verified live (project `xyiajtrvhlxaeplsiajj`, head mig 134): the Unified Profile columns,
`content_labels` + auto-label trigger + lifecycle + RLS, and the `vision.*` schema all **already
exist** (Batch 6 mig 072–077 + Vision groundwork 133–134). So Step 1's real remaining work was the
**contract lock itself**, not new migrations.

### What shipped
- **NEW [docs/SHARED_DB_CONTRACT.md](docs/SHARED_DB_CONTRACT.md)** — the normative, LOCKED contract
  (the keystone artifact). Rules: schema boundaries (`public`/commons, `vision.*`, future `wear.*`);
  one `auth.users`; **RLS is the only isolation wall**; **`/api/v1` is the cross-app contract, not
  raw tables**; `app_id` attribution **rule R4** locked now / **column deferred** until the 2nd app
  writes analytics; Unified Profile + `content_labels` as the two sanctioned cross-app bridges;
  migration discipline; exit ramp. §9 carries the live verification snapshot.
- **[docs/api-v1.md](docs/api-v1.md) brought current** — was stale; added the live `GET /api/v1/places`
  and `GET /api/v1/contributors/{slug}/stats` endpoints + a contract-pointer banner.
- **[docs/strategy/ECOSYSTEM_DECISION_BRIEF.md](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md)** — Step 1
  row marked ✅ LOCKED; contract doc registered as the step's output.

### Decision recorded (no prod migration)
The brief's own guard-rail (§3) defers the `app_id` *column* to "once the 2nd app writes." Connect is
the only analytics writer today (Vision reads only; Wear has no prod data). So the **rule** is locked
in the contract (R4); the **column** lands with the first sibling writer — YAGNI + brief-aligned.

### Next in the plan (Step 2)
Finish **Vision** against `vision.*`; migrate Vision-owned config from the paused eu-west project
(`ijdmcudcrncmaprmzgfk`, INACTIVE) into the shared eu-central project; drop obsolete `cc_*_mirror`
sync tables. (Step 0 frontend swap remains in flight — this doc work did not disturb it.)

---

## 3B. Ecosystem Step 2 — Vision DB consolidation APPLIED ✅ (2026-06-18)

Second item of the ecosystem plan ([brief](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md) §6 order 2).
Working log: `.claude/sessions/step2-vision-consolidation-EXEC.md` (+ `...-scope.md`).
**Founder decisions:** seed-only data ⇒ **0 rows migrated, no eu-west restore**; full consolidation now;
migrations consolidate into `citizens-connect` lineage, `citizens-vision` goes app-only.

### What shipped (migrations 137–139, applied DIRECTLY to prod `xyiajtrvhlxaeplsiajj`)
Branching needs Supabase Pro (org is Free) → founder approved direct apply; `apply_migration` is atomic.
Pre-apply git tag: **`vision-pre-consolidation`** @ 721c5dd.
- **137_vision_schema_port.sql** — ports Citizens Vision's 21 standalone `public.*` migrations into the
  shared project's **`vision.*`** as one consolidated end-state: **22 owned tables** (incl. the 3 the scope
  had under-counted: `export_logs`, `scheduled_reports`, `activity_daily_aggregates`), 2 enums, 5 MVs,
  ~28 functions, full RLS, triggers, advisory seed, **non-fatal** platform-admin bootstrap. Heavily
  schema-qualified; per-function hardened `search_path`; trigram opclass via `extensions.gin_trgm_ops`;
  cron bodies qualified `vision.*`. **No `cc_*_mirror`/sync** (obsoleted). **Broken dev seed NOT ported.**
- **138_vision_cc_claims.sql** — claim→promote re-model: `vision.cc_event_claims` (keyed by `cc_event_id`,
  cols `cv_org_id/cv_project_id/cv_activity_id`) + `vision.cc_place_claims`. **No cross-schema FK** (value
  refs to `public.events`/`places`) — preserves the exit-ramp. org-scoped RLS.
- **139_vision_ratings_views.sql** — the `avg_rating` owed item (scope §8) resolved as **route (b)**:
  Connect-published `vision.ratings_per_event` + `vision.ratings_per_place` (service_role-only, mirrors the
  existing `reach_/engagement_per_event` pattern). No `/api/v1` change ⇒ `api-v1.md` untouched.

### Security model refinement (contract updated)
Vision's **operational** tables = `authenticated` + RLS (org admins/members, per-org); **MVs = service_role-only**
(bypass RLS → read via SECURITY DEFINER reader fns); **Connect-published aggregates = service_role-only**.
Contract §1 + §9 re-stamped to head 139. The `vision` schema is **not** PostgREST-exposed yet (app-repoint toggle).

### Verification
Security advisors **0 ERROR** (R7.3 met). 106 WARN + 3 INFO — **all 104 SECURITY-DEFINER WARNs are pre-existing
`public.*` Connect fns; the vision port added 0 new findings.** Structural QA: 26 vision base tables / 0 without
RLS / 5 MVs / 6 views / 96 policies / 28 fns / 20 triggers / 0 leftover mirrors. Founder = vision platform_admin;
2 `vision_*` cron jobs live.

### Next (Step 2 app half) — ✅ DONE (2026-06-21), shipped to `main`. Full detail in **§3F** below.

---

## 3C. SECURITY DEFINER EXECUTE-grant hardening ✅ APPLIED (2026-06-18)

Pre-existing Connect tech-debt (surfaced by the security advisors during the Vision consolidation in
§3B, but **NOT caused by it**). **Migration 140 applied live → next migration # = 141.**
Working log: `.claude/sessions/secdef-execute-grant-hardening.md`. Gates: **tsc 0** (no app code changed) ·
advisors **still 0 ERROR**.

### The finding
`public` had 45 `anon_security_definer_function_executable` + 59 `authenticated_security_definer_function_executable`
advisor WARNs — SECURITY DEFINER functions whose EXECUTE was granted to low-priv roles (mostly the default
PUBLIC grant left in at CREATE time). A SECURITY DEFINER fn runs as its owner and bypasses RLS, so each
over-grant is an escalation surface.

### Method (tooling note)
Supabase MCP tools were **not loaded** at the start of the Claude Code session (only `.vscode/mcp.json`, a VS Code
config). Used the **Management API directly** with that token: `GET /advisors/security`, `POST /database/query`,
`POST /database/migrations`. (curl needs a browser User-Agent or Cloudflare 403s; no jq → Python, force UTF-8.)
Classified every fn against live `pg_proc` (bodies/ACLs/grants) + `pg_policies` (which roles each predicate
serves) + `src/` callers — not guesswork.

### Migration 140 (`140_revoke_overgranted_secdef_execute.sql`) — tighten only, never loosen
- **15 trigger fns + `cleanup_stale_locations`** → `revoke ... from public, anon, authenticated; grant service_role`
  (triggers fire as table owner — never need a role grant; cleanup has no app caller, not even a cron job).
- **19 privileged/authed RPCs** (admin approvals, api-key admin, dashboard analytics, safe_rsvp/toggle_consider,
  find_or_create_conversation, is_organiser/is_approved_contributor/is_blocked/get_mutual_followers) →
  `revoke from public, anon; grant authenticated` (internal `auth.uid()`/`is_admin()` guard protects; admins are
  `authenticated`). Must revoke `public` too, else anon keeps access via the PUBLIC grant.
- **10 intentionally LEFT anon-executable** (documented in the migration footer): get_active_map_bubbles,
  get_community_ideas, get_contributor_public_stats, get_public_contributor_analytics, get_public_team,
  get_search_autocomplete, trending_events, `is_admin`/`is_conversation_participant` (load-bearing for roles=public
  RLS policies), `resolve_api_key` (resolved server-side via the **anon** client for API-key auth). Their WARNs
  remain by design.

### Verified live (post-apply)
Advisors: **0 ERROR**; `anon_security_definer` **45 → 10**, `authenticated_security_definer` **59 → 43**
(total WARN 106 → 55). Grant spot-check: safe_rsvp a=✗/u=✓, handle_new_user a=✗/u=✗, cleanup_stale_locations
a=✗/u=✗, is_organiser a=✗/u=✓; kept fns is_admin/get_active_map_bubbles/resolve_api_key a=✓/u=✓. Recorded as
`20260618174052 / 140_revoke_overgranted_secdef_execute`. No app code touched → no legitimate RPC path changed.

### Owed / reported (NOT fixed here — out of scope of grant-hardening)
1. ~~**Secret leak**: a Supabase Management PAT + anon JWT committed in-repo.~~ **✅ TRIAGED + HARDENED (2026-06-18,
   commit after 140).** Threat model corrected after investigation — see **§3D** below. TL;DR: the PAT was
   **never committed** (`.vscode/mcp.json` is gitignored — `.gitignore:96`, absent from all history); de-hardcoded
   to `${env:SUPABASE_ACCESS_TOKEN}`. **⏳ One user action remains: rotate the PAT in the Supabase dashboard**
   (account-level token — only the founder can do it). The "anon JWT" (cron jobid 7 / mig 125) decodes to
   `role:anon` = the **publishable** key → intentionally retained (public-by-design, RLS-first). **Do not re-flag.**
2. ~~**Caller-trust IDOR surface**: `is_blocked`, `find_or_create_conversation`, `safe_rsvp`, `toggle_consider`,
   `get_mutual_followers` accept caller-passed user ids with no internal `auth.uid()` self-check.~~ **✅ FIXED in
   §3E (migration 141).** Investigation found `safe_rsvp`/`toggle_consider` ALREADY enforced it; the other three
   now do too. **Do not re-flag.**
3. ~~`cleanup_stale_locations` is defined but scheduled by **no** cron job — live-location cleanup isn't running.~~
   **✅ FIXED in §3E (migration 141)** — cron jobid 10 `live-location-cleanup`, every 15 min.

---

## 3D. Secret-leak triage + PAT hardening ✅ (2026-06-18)

Acted on §3C follow-up #1. Working log: `.claude/sessions/secret-leak-hardening.md`. **No migration, no app code →
next migration # still 141.** Investigation corrected the assumed threat model:

| Item | Assumed (§3C / founder note) | **Verified actual** | Action |
|---|---|---|---|
| Supabase Mgmt **PAT** (`.vscode/mcp.json`) | "committed in-repo" | **Never committed** — gitignored (`.gitignore:96`), absent from full git history & every tracked file. Local plaintext only. Grants full project control. | De-hardcoded to `${env:SUPABASE_ACCESS_TOKEN}`. **⏳ Rotation = pending founder action** (dashboard → Account → Access Tokens: revoke the old `sbp_…` token, generate new, set as `SUPABASE_ACCESS_TOKEN` system env var so VS Code inherits it). |
| **anon JWT** (cron jobid 7, mig 125 line 44) | "leak — move to env" | Committed, but decodes to `role:anon` = the **publishable** key (already in every frontend bundle). Public-by-design under RLS-first. "env" path was already tried & **denied** (mig 125 comment: GUC `ALTER DATABASE` blocked for mgmt role). | **Left as-is** (founder-approved). Not a secret. Vault would be churn for zero gain. **Do not re-flag in future audits.** |
| service_role key | — | **None committed** anywhere (verified). | — |
| `.claude/sessions/*.json` advisor dumps | — | Gitignored, local-only, contain no PAT/service_role. | — |

**Net:** the only genuinely sensitive secret (PAT) was *not* publicly exposed via the repo; it is now out of the
config file and awaiting the founder's rotation. Anon-key "leak" was a false positive (publishable by design).

---

## 3E. IDOR self-check guards + live-location cleanup cron ✅ APPLIED (2026-06-18)

Closed the last two §3C follow-ups (#2 IDOR + #3 unscheduled cleanup). **Migration 141 applied live →
next migration # = 142.** Working log: `.claude/sessions/idor-guards-and-location-cron.md`.
Gates: **advisors 0 ERROR** (55 WARN / 3 INFO = byte-for-byte the §3C post-140 baseline — 0 new findings) ·
no `src/` (TypeScript) touched → tsc/vitest unchanged from `be6784d`.

### A. Caller-trust IDOR guards — migration 141 part A
Three `public` SECURITY DEFINER RPCs accepted caller-passed user ids without enforcing the caller IS that
user (a SECURITY DEFINER fn runs as owner + bypasses RLS, so a forged id = act/read as someone else).
Added the proven `safe_rsvp` guard to each:
```
if auth.uid() is null or (auth.uid() <> A and auth.uid() <> B) then
  raise exception 'unauthorized' using errcode = '42501';
end if;
```
- `is_blocked(uuid,uuid)` — converted sql→plpgsql + guard.
- `find_or_create_conversation(uuid,uuid,text)` — guard added (guard fires BEFORE the INSERT → no junk rows).
- `get_mutual_followers(uuid,uuid,integer)` — converted sql→plpgsql + guard.
- **`safe_rsvp` / `toggle_consider` were ALREADY guarded** (live `pg_proc` confirmed; mig 086/028) — the §3C
  note over-listed them. **Left untouched.**

**Key gotcha (recorded):** the `auth.uid() is null` arm is mandatory — a NULL uid makes `NULL <> A` evaluate
to NULL, so `if NULL` would SKIP the raise (silent bypass). Verified: with no JWT, all three now raise 42501.

**Why it's safe for live callers:** `is_blocked` + `find_or_create_conversation` are only called from
`src/app/api/conversations/route.ts`, which passes the authed `user.id` through `getRouteAuth` = a
**user-scoped** client (anon key + Bearer/cookie → `auth.uid()` resolves inside the SECDEF body, exactly how
`safe_rsvp` already works in prod). `get_mutual_followers` has no live caller yet (friends surface pending).
Grants unchanged (CREATE OR REPLACE preserves ACL): `authenticated` + `service_role`, **no anon/public**.

### B. Live-location cleanup cron — migration 141 part B
`cleanup_stale_locations()` (defined mig 019) was scheduled by **no** cron → post-event live-location rows
(the most privacy-sensitive data the platform holds) were never purged. Registered **cron jobid 10
`live-location-cleanup`, `*/15 * * * *`** (the fn keeps a 30-min post-event grace, so stale rows are gone
≤45 min after an event ends; the delete is tiny + indexed → negligible cost). Runs as `postgres` (cron owner)
so the mig-140 service_role-only grant on the fn doesn't block it — same as job #1's `recompute_map_prominence`.

### Residual (noted, out of scope of the self-check item)
`find_or_create_conversation` still trusts the caller-passed `p_status` (the route computes the
contributor→citizen pending/active gate and passes it). That's a status-policy concern, not the `auth.uid()`
self-check that §3C asked for — left as the route's responsibility. Flag if we want the RPC to enforce it too.

---

## 3F. Ecosystem Step 2 **app-half** SHIPPED ✅ + Step 3 (Wear) NEXT (2026-06-21)

Finishes [ECOSYSTEM_DECISION_BRIEF](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md) §6 order 2 (app half)
and sets up order 3 (Wear). Working log: `.claude/sessions/ecosystem-step2-vision-app-half.md`.

### Shipped to `main` (both repos pushed)
- **citizens-vision** `main` @ **e39aa88** — Vision app cut onto shared `vision.*` + live `/api/v1`.
- **citizens-connect** `main` @ **b8eea2e** — **migration 142** `vision.organisations.connect_contributor_id`
  (applied to prod `xyiajtrvhlxaeplsiajj`; advisors **0 ERROR** / 72 WARN / 3 INFO). **Next migration # = 143.**
- Gates green: **tsc 0 · vitest 849 pass / 90 files · eslint clean**.

### The model now (citizens-vision)
- Supabase clients → `db: { schema: 'vision' }` (cast back to bare `SupabaseClient` so the whole app's
  schema-agnostic helpers keep compiling; queries are untyped `any` either way).
- **Sync subsystem DELETED**: `sync-from-connect` edge fn, `/api/connect/sync`, `SyncStatusPanel`,
  `cc_*_mirror` reads. Old `citizens-vision/supabase/migrations/` archived (README marker; the real
  lineage lives here in citizens-connect).
- Connect data read live via **`/api/v1`** (`src/lib/connect/api.ts` + `feed.ts`), scoped to the org's
  linked contributor (`/api/v1/events?created_by={id}`).
- Claims: `vision.cc_event_claims` (PK `cc_event_id`, **exclusive** — one org per event) /
  `vision.cc_place_claims` (PK `cc_place_id`). Promote builds `vision.activities` from `/api/v1/events/{id}`.
- **Identity link RESOLVED (founder decision A):** org ↔ Connect via
  `vision.organisations.connect_contributor_id` (= `public.profiles.id` = the auth uid). Set via
  `POST /api/connect/link` (slug→id), **ownership-verified** (`profile.id === auth.uid`) so an org can't
  hijack another contributor's events/attribution.

### ⛔ DEPLOY GATES — founder must do these before Vision is functional
(Vision prod was already down — its old project is paused — so this push regresses nothing.)
1. citizens-vision Vercel env → `NEXT_PUBLIC_SUPABASE_URL` = shared **`xyiajtrvhlxaeplsiajj`** + its
   **anon/publishable** key.
2. Supabase Dashboard → API → **Exposed schemas → add `vision`** (else PostgREST won't serve `vision.*`).
3. Set **`CONNECT_API_BASE_URL`** (prod Connect origin) + optional `CONNECT_API_KEY` (`cck_live_…`).
Then org admins link their Connect account on the Vision `/[orgSlug]/connect` page.

### Optional doc polish (low priority)
`citizens-vision/docs/API.md` + `docs/ADMIN_GUIDE.md` still describe the old sync — light edit when convenient.

### ▶ STEP 3 — point **Wear** at the shared project → **SCOPED · DIRECTION RATIFIED · `wear.*` DDL DRAFTED (2026-07-01); app build NOT started**
Full scope: **[docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md](docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md)**.
Drafted `wear.*` DDL (NOT applied): **[docs/wear/143_wear_schema.sql](docs/wear/143_wear_schema.sql)**.
Working log: `.claude/sessions/step3-wear-shared-project-scope.md`. No Connect/Wear *functional* code changed.

**The resume's Step-3 premise was WRONG — corrected by scoping `citizens-wear` on disk:**
- `packages/db` has **no** Supabase client — it's an **in-memory** store + an *unwired* Prisma schema.
  `grep -ri supabase` across the whole Wear repo = **0 hits**; **no `@supabase/*` dependency** at all.
- `connect-client`'s `HttpConnectClient` targets a Connect API that **does not exist**:
  `{base}/v1/auth/verify · /v1/users · /v1/brands · /v1/products · /v1/health`. Connect's REAL surface is
  `/api/v1/{events, places, contributors, categories, analytics}` — **disjoint** (diff prefix + diff domain;
  no brands/products/OIDC). Wear's `ADR-0002` built the contract before Connect's shape stabilised and drifted.
- ⇒ "point Wear at the shared project" = **Wear's entire (unstarted) Phase 3**, gated on a direction decision —
  NOT a one-env repoint. (Still zero data migration — Wear has no prod data; the cost is *build*.)

**Founder decision (2026-06-21) — Direction A:** Wear authenticates against the **shared Supabase project**
(`xyiajtrvhlxaeplsiajj`, one `auth.users`, Google OAuth — same as Vision); Wear owns its commerce/social data
in a new **`wear.*`** schema (activates the 3rd schema boundary); `connect-client` is reconciled to Connect's
real `/api/v1` (drop users/brands/products/OIDC). Recorded as **Wear `ADR-0007`** →
[citizens-wear PR #22](https://github.com/citizensnetwork/citizens-wear/pull/22) (**MERGED to `main`** 2026-07-01).
**Data-access: stay on Supabase (`supabase-js`), NOT Prisma** — RLS is the only isolation wall (R3) and
`supabase-js` enforces it with the user JWT; Prisma bypasses RLS + can't co-own the SQL migration lineage.
`schema.prisma` kept as a design reference only.

**Wear `main` reconciliation (done):** `main` was a strict ancestor of canonical `chore/phase-2-se-poly-hardening`
(7 behind, 0 diverged). Merged existing **PR #8** (clean ff, merge `9e8833b`) → `main` now carries Phases 2.5–6 +
social-commerce foundation. **`main` is the correct base for the Step 3 build branch.** Canonical branch +
`chore/phase-4-local-rewrite` (cherry-pick reserve) left untouched.

**Q1–Q4 RATIFIED (2026-07-01)** — scope doc §5: Q1 `wear.users` mirror hydrated from session + a tiny additive
`GET /api/v1/profiles/{id}`; Q2 `supabase-js db.schema='wear'` (RLS, like Vision); Q3 mirror Vision's deploy
gates + OAuth allow-list; Q4 `wear.brands` Wear-owned + OPTIONAL ownership-verified `connect_contributor_id`.
**Net new Connect-side work = one additive endpoint** (`/api/v1/profiles/{id}`).

**The app build remaining (a future session, branch off Wear `main`)** — see scope doc §3:
1. add `@supabase/supabase-js`+`ssr` (env = shared project, NOT a new Wear project);
2. replace mock-token session (`apps/web/src/lib/session.ts`) with Supabase Auth;
3. **apply** the drafted `wear.*` DDL — move [docs/wear/143_wear_schema.sql](docs/wear/143_wear_schema.sql)
   → `supabase/migrations/143_wear_schema.sql` (renumber if Connect shipped a later migration first) + `apply_migration`;
4. add the one Connect endpoint `GET /api/v1/profiles/{id}` (+ document in `docs/api-v1.md`, R2.3);
5. reconcile `connect-client`; wire `packages/db` off `MemoryWearStore`; keep coverage gates green.

- After Step 3: **Step 4** = extract pure-TS `@citizens/*` packages (align Wear's `@citizens-wear/*`);
  **Step 5** = the actual monorepo lift (grow Wear → `citizens`, `git filter-repo` Connect + Vision in),
  gated behind the Connect frontend swap (Step 0) stabilising.

---

## 3G. Step 0 launch-hardening — B0/A2/Step3/Step4/Step6 SHIPPED ✅ (2026-07-01)

Closes the code-only items from `docs/MOBILE_LAUNCH_RUNBOOK.md`'s remaining tail (founder
approved building "as far as you effectively can"; F1/F2/store-compliance/release-process
deliberately left for later — need Firebase/Apple accounts + legal/asset decisions, not code).
Infra choice for A2 = **Upstash Redis free tier**. Working log:
`.claude/sessions/step0-launch-hardening.md`. No DB migration. Gates: **tsc 0 · eslint 0 ·
vitest 634/634** (all green both before and after — the async rate-limit refactor changed 67
route files but every call site was already inside an `async` handler, confirmed by a clean
`tsc --noEmit`).

### B0 — Vite/esbuild precompile of the frontend (addendum §B0)
The 19 `app/*.jsx` screens were shipping as raw Babel-standalone, JIT-compiled in the browser on
every load — the actual "not shippable to mid-range phones" problem, plus the `?v=` cache-bust
ritual. **[scripts/build-frontend.js](scripts/build-frontend.js)** now precompiles them:
- Each screen is still its own IIFE that only talks via `window.*` (no import/export was ever
  used) — esbuild strips JSX per file (`React.createElement` classic pragma, matching the old
  Babel config) and concatenates the results in load order, so the cross-file `window.X` wiring
  is untouched. The whole concatenation is minified as one pass → one content-hashed
  `app/bundle.<hash>.js`. `auth-client.js` gets the same hash-and-minify treatment.
- **React/ReactDOM/supabase-js/maplibre-gl/lucide stay on CDN UMD `<script>` tags** (deliberate
  scope cut, documented in the runbook — true full-vendor bundling for offline-first boot is a
  fast-follow, not required to fix the actual JIT-compile perf problem or kill `?v=`).
- `index.html` is rewritten at build time: drops the Babel-standalone CDN script + all 19
  `type="text/babel"` tags, inserts the compiled bundle + a new Capacitor bridge script (below).
  `viewport-fit=cover` added to the **source** `src/frontend/index.html` meta tag directly (so
  local dev at `:3001` gets it too, not just built output).
- Old hashed outputs are deleted before each build (`cleanHashedOutputs()`) so stale bundles
  don't accumulate in `public/`/`mobile-dist/`.
- Local dev (`python -m http.server 3001 --directory src/frontend`, raw Babel-standalone) is
  **unaffected** — only the shipped `public/`/`mobile-dist/` builds changed. New launch config
  `frontend-built` (`.claude/launch.json`, port 3002, serves `public/`) added to preview the
  actual compiled output. Verified in-browser: renders, 0 console errors, click → `useState`
  re-render confirmed working (screenshot before/after "A Contributor" toggle).
- `eslint.config.mjs` + `.gitignore` updated — `public/**`/`mobile-dist/**` are generated
  output (same category as `android/**`/`ios/**`), never linted; new hashed filenames
  (`auth-client.*.js`, `capacitor-bridge.*.js`) added to `.gitignore` (only the old fixed
  `auth-client.js` name was covered before). Incidentally also gitignored `public/supabase-auth.js`
  (a plain copy of the Phase-1 reference file — was untracked/uncovered before, harmless gap).

### A2 — Upstash Redis rate limiter (addendum §A2, "must land before store launch")
Found **prior, undocumented work**: `src/lib/rate-limit-async.ts` + `src/lib/v1Gate.ts` already
had an Upstash-backed limiter (raw `fetch` to the Upstash REST API, no SDK — fixed-window
INCR+EXPIRE), but scoped ONLY to the public `/api/v1/*` surface (ecosystem Phase C work, commit
`11e4660`, never logged in this file). Everything else (~90 authenticated routes) still called
the single-instance in-memory `checkRateLimit` from `src/lib/rate-limit.ts` — the actual gap the
runbook flagged.
- **Merged the two**: `checkRateLimit` in `src/lib/rate-limit.ts` is now itself the Upstash-or-
  fallback async function (same algorithm as the old `rate-limit-async.ts`, which is now
  deleted). Same exported name/shape everywhere — no call site needed an import change, only
  `await`. `v1Gate.ts` now imports `checkRateLimit` from `./rate-limit` directly.
- Activates when **both** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set;
  otherwise (dev, tests, or an Upstash outage) transparently falls back to the original
  in-memory sliding-window limiter — same behaviour as before for anyone without the env vars.
  Documented in `.env.example`.
- Mechanically added `await` to **96 call sites across 67 `route.ts` files** (scripted, not
  hand-edited — every site matched the uniform `const x = checkRateLimit(...)` shape). `tsc
  --noEmit` came back clean, confirming every one was already inside an `async` handler.
  Existing `vi.mock` test doubles (`api-keys.test.ts`, `categories.test.ts`, `admin/reports/
  route.test.ts`, `admin/users.test.ts`) needed **no changes** — `await` on a plain mocked
  object just resolves to that object.
- **Founder action (only if Upstash is wanted live):** create a free-tier DB at
  console.upstash.com → REST API section → set `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` in Vercel. Without them the app runs exactly as it did before this
  session (in-memory, single-instance) — nothing breaks either way.

### Step 3 — OAuth-on-device deep link (addendum §B1) + Step 4 — native geolocation (addendum §B4)
Built together since both needed the same new Capacitor plugin bridge. **Discovered the native
platform config (Android `AndroidManifest.xml` intent-filter, iOS `Info.plist`
`CFBundleURLTypes`/`CFBundleURLSchemes`, both location usage strings) was ALREADY wired for
`citizensconnect://` and location permissions** — likely from the initial Capacitor scaffold,
never logged here. Only the JS-side plugin wiring was missing.
- **New [src/frontend/capacitor-bridge.js](src/frontend/capacitor-bridge.js)** — the one frontend
  file that's real ESM (imports `@capacitor/core` + the newly-added `@capacitor/app` +
  `@capacitor/browser`, plus the already-installed `@capacitor/geolocation`). It's the only file
  needing a true `bundle:true` esbuild pass (not just a JSX strip); exposes `window.CapCore` /
  `CapApp` / `CapBrowser` / `CapGeolocation`. Loaded in both web and mobile builds (Capacitor's
  web-shim implementations no-op harmlessly outside the native shell; verified `isNativePlatform()
  === false` in a plain browser via `preview_eval`).
- **`auth-client.js`**: `signInWithGoogle` now branches on `isNativeShell()`. Native →
  `skipBrowserRedirect: true` + `redirectTo: "citizensconnect://auth-callback"` +
  `CapBrowser.open()` (system browser, since the webview's own origin isn't a redirectable https
  URL for Google). New `listenForNativeAuthCallback()` catches the `appUrlOpen` deep link, closes
  the browser tab, extracts `?code=`, calls `client.auth.exchangeCodeForSession(code)` — the
  existing `onAuthChange` subscription in `store.jsx` picks up the resulting `SIGNED_IN` event
  with **no changes needed there**. Web path (non-native) is byte-for-byte unchanged.
- **`map.jsx`**: the existing "user location first, national fallback" init effect now checks
  `isNativeMap` and calls `CapGeolocation.getCurrentPosition()` instead of raw
  `navigator.geolocation` when running natively (raw browser geolocation is unreliable in a
  WKWebView/Android WebView without the plugin — no proper native permission prompt). Still only
  fires when the map screen mounts (first map view), never at app boot — matches the runbook's
  explicit requirement.
- **NOT auto-verifiable** (needs a real device/simulator build): the actual
  `cap:sync` → Android Studio/Xcode → sign-in-via-system-browser-and-return round trip. Code
  paths were verified for correctness and the non-native fallback was verified in-browser; the
  native round trip needs `npm run cap:sync` + a device, which this session's tools can't drive.

### Step 6 (partial) — viewport-fit=cover + safe-area insets (addendum §B5)
- `viewport-fit=cover` added to `src/frontend/index.html`'s meta tag (source-level, covers dev
  + both builds).
- Bottom nav (`shell.jsx` `BottomNav`) already had `pb-[env(safe-area-inset-bottom)]` from an
  earlier, undocumented pass. Added the missing counterpart: the map screen's floating top
  overlay (search bar/filter/avatar, `home.jsx`, `position:absolute; top:0`) now gets
  `paddingTop: max(0.75rem, env(safe-area-inset-top))` so it clears a notch/status-bar cutout.
  Other screens don't need explicit top insets — `capacitor.config.ts`'s existing
  `ios: { contentInset: "automatic" }` already insets normal (non-fixed) scrolling content below
  the safe area; only viewport-edge-pinned elements bypass that and need manual handling.
- Rest of Step 6 (public privacy/terms URLs, data-safety forms, icons/screenshots/feature
  graphic, age rating, store-nav surfacing of the already-built account-deletion/report/block
  APIs) is legal/content work, **left for later per founder instruction**.

### What's still open (founder accounts/decisions — not code, deliberately deferred)
1. **F1** Android push — needs a Firebase project.
2. **F2** iOS push + build — needs Apple Developer Program enrollment + a macOS/Xcode machine.
3. **Step 6 rest** — store compliance content/legal/assets.
4. **Step 7** — release process/cadence.

---

## 2O. Messaging Polish + Search-Path Fix ✅ (2026-06-17)

Commit **`0187a11`** on origin/main. **Migration 136 applied live** → next migration # = **137**.
Working log: `.claude/sessions/messaging-realtime-and-polish.md`.
Gates: **tsc 0** · 0 new security findings.

### What shipped

**Realtime (inbox-level) — `store.jsx`:**
- `messages` table was already in the `supabase_realtime` publication and the thread-level subscription was already wired (open conversation updates)
- Added `cc-inbox` channel subscription: any message INSERT for the user's conversations updates the inbox last-message preview + unread badge without a manual refresh. Uses a `navRef` so the single subscription survives navigation changes without re-subscribing.

**Search — `messages.jsx`:**
- `searchQuery` state filters the conversations list by participant name or last-message body
- Empty-state message when no conversations match the query

**Mute / Unmute — `store.jsx` + `messages.jsx`:**
- `adaptConversation` now includes the `muted: boolean` field from the API
- `muteConversation(convId)` / `unmuteConversation(convId)` — optimistic update + PATCH `/api/conversations/[id]`, rollback on failure
- Thread header MoreVertical button opens a dropdown with mute toggle; muted conversations show a `BellOff` icon in the inbox list

**Block — `store.jsx` + `messages.jsx`:**
- `blockUser(blockedId, convId)` — confirm dialog → POST `/api/blocks` → removes conversation + navigates back
- Block option in the same Thread header dropdown

**Migration 136 (`fix_function_search_paths`) — applied live:**
- Added `SET search_path = public` to all 12 user-owned `public`-schema functions that were missing it: `cleanup_stale_locations`, `count_friends`, `find_conversation`, `generate_contributor_slug`, `handle_new_user`, `is_admin`, `is_approved_contributor`, `is_organiser`, `protect_role_column`, `sync_event_category_id`, `trending_events`, `update_conversation_timestamp`
- 0 user-owned functions missing search_path now (confirmed via `pg_proc` query)
- Remaining advisor WARN entries are from extension/system functions (not modifiable by us)

---

## 2N. Messaging System Audit & Fix ✅ (2026-06-17)

Commit **`1ca9d8e`** on origin/main. **Migration 135 applied live** → next migration # = **136**.
Working log: `.claude/sessions/messaging-audit-and-fix.md`.
Gates: **tsc 0** · security advisors **0 new findings** (3 INFO + 118 WARN = pre-existing baseline).

### Root cause
`conversation_participants` SELECT RLS policy had a self-referential `EXISTS` subquery → PostgreSQL recursive RLS → HTTP 500 on every participant lookup. Message sends returned false 403 (swallowed error), optimistic UI immediately rolled back.

### What shipped

**Migration 135 (`fix_messaging_recursive_rls`) — applied live:**
- `is_conversation_participant(conv_id, uid)` SECURITY DEFINER STABLE function breaks the recursion
- Rewrote 4 RLS policies (conversation_participants SELECT, conversations SELECT+INSERT, messages SELECT) to call the helper
- Dropped stale 2-arg `find_or_create_conversation` overload

**API fixes:**
- `conversations/[id]/messages` (GET+POST) — properly surface 500 vs 403 on participant DB errors
- `conversations/[id]` (PATCH) — same fix
- `contributor/[handle]/dashboard` — fix wrong column (`conversations.participant_id` → `conversation_participants.user_id`)
- `contributor/profile` — add length caps for bio/handle/address (security hardening)

**Frontend:**
- `messages.jsx` Thread: amber pending banner → Accept/Decline buttons (recipient), "awaiting response" note (initiator), reply input disabled until accepted. List: amber "Request" badge on pending conversations.
- `store.jsx`: `acceptRequest()` and `rejectRequest()` actions added to context

### Security audit result — no critical/high issues
All security patterns are solid: service_role server-only, CORS allowlist, JWT validated server-side via `getUser()`, mass assignment protected, strong headers.

---

## 2M. Empty-map + fake-"Lydia"-login fixes + Vision snapshots table ✅ (2026-06-15)

Two founder-reported LIVE launch blockers fixed, plus the last shared-DB Vision data point.
Commits **`af6261d`** (bug fixes) + **`b3bd47d`** (migration 134) on origin/main.
Migration **134 applied live → next migration # = 135**. Cache-bust now **`?v=20260615b`**.
Working log: `.claude/sessions/fix-empty-map-and-lydia-login.md`.
Gates: **tsc 0** (backend untouched) · preview boot verified (app renders, 0 syntax errors,
starts on sign-in screen) · same-origin `/api/v1/events` returns the 191 real events ·
advisors **0 ERROR** (migration 134 adds no new findings).

### Bug 1 — no data on the map (ROOT CAUSE + fix)
`store.jsx` live-data effect wrapped every fetch in `if (base)`. The standard production
topology sets `API_BASE_URL=''` (same-origin), so `base` was falsy → events/places/contributors
were **never fetched**; once §2L emptied `data.jsx`, the map went blank.
**Fix:** removed the `if (base)` guards — `fetch('/api/v1/events')` is a valid same-origin
request (proven: same-origin API returns the 191 events at real coords). Works for both
topologies (same-origin `base=''` and cross-origin `base=<url>`).

### Bug 2 — Google login routed everyone to fictitious "Lydia Mensah" (ROOT CAUSE + fix)
When the deployed `config.js` lacks real Supabase values (or keeps the `REPLACE_WITH`
placeholder), `auth-client.js` sets `CC_AUTH=null` and `signIn()` **silently demo-logged-in**
as the hardcoded `CITIZEN_BASE = "Lydia Mensah"`. **Fixes (store.jsx + dashboard.jsx):**
- `signIn()` with no `CC_AUTH` now **fails honestly** (error toast) — never fakes a session.
- `CITIZEN_BASE`/`ADMIN_BASE` neutralised (no persona, no stranger Unsplash photos).
- Dead `signInDemo` removed; `submitApplication` refs repointed to `realUser`.
- `dashboard.jsx`: demo "Lydia" activity rows + fabricated "+24%" / fake weekly numbers
  replaced with honest empty/zeroed states.

### ~~⚠️ FOUNDER ACTION REQUIRED to actually log real users in~~ ✅ DONE (confirmed 2026-07-01)
~~The code now fails honestly instead of faking Lydia — but real Google login still needs the
**Vercel env vars** set on the deployment that serves the app, then a redeploy:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`,
`NEXT_PUBLIC_MAPTILER_STYLE`, and `NEXT_PUBLIC_API_BASE_URL=''` (same-origin) — matches memory
`supabase-placeholder-fallback-masks-missing-env`. Without them: map still loads (public REST,
same-origin) but Google sign-in shows "Sign-in is temporarily unavailable."~~
**Founder confirms (2026-07-01): the Vercel env vars are set and Google sign-in has been verified
working in prod.** A billing-lapse warning was raised and briefly noted here, but founder confirmed
(2026-07-01) there is no billing issue on the free tier, and both Supabase projects were independently
verified `ACTIVE_HEALTHY` via the Management API in the same session. Google OAuth is confirmed valid
through 2026-07-15. No blocker here.

### Vision data points — status (Citizens_Vision_Backend_Architecture.md)
**Migration 133 already implemented EVERY Connect/Database-layer data point** (verified live:
`event_impressions`+RPC, `impression_count`/`cancellation_count`, cancellation trigger,
`broadcast_messages.audience_size_at_post`, `profiles.timezone`, `vision.category_space_map`,
`vision.reach_per_event`, `vision.engagement_per_event`).
**Migration 134 (this session)** adds the one missing shared-DB item:
**`vision.vision_period_snapshots`** — per-org (optional per-Space) period table feeding Growth
(#4) + Retention (#5). Stores reach/engagement numerators as COUNTS (display #8), distinct-person
reach, and `active_events` denominator. RLS-on, `vps_own_read` (own-org/admin reads), writes only
via `service_role` (Vision backend; bypasses RLS) — invisible to anon/authenticated.
**OUT OF SCOPE for Connect (Vision app layer):** the daily snapshot job (resolved in
`profiles.timezone`), growth/retention math, Org/Space aggregation, Priority-weighting, Pulse —
architecture-doc open questions #1–#3. Connect never writes the snapshot table.

### Accepted debt (not silently built)
- `store.jsx` still has `if (!realUser)` local-demo branches in createEvent/createPlace/submitIdea
  etc. They're unreachable in production now (no fake auth) but kept as harmless graceful
  degradation; strip with the B0 Vite precompile pass if wanted.
- `vision.spaces` table still owed (category_space_map.space_id + snapshot.space_id need a referent).

---

## 2L. Vision Backend + Demo Removal + Impression Tracking ✅ (2026-06-15)

Commit **`9a94885`** on origin/main. Migration **133 applied live → next migration # = 134**.
Working log: `.claude/sessions/launch-prep-vision-backend.md`.
Gates: **tsc 0 · vitest 634/634 · lint clean**. Cache-bust token now **`?v=20260615a`**.

### What shipped

**Migration 133 — Vision Backend Groundwork:**
- `event_impressions` table (PK user_id, event_id) + RLS + `record_event_impression(uuid, uuid)` SECDEF RPC (dedup + atomic counter)
- `events.impression_count integer default 0` + `events.cancellation_count integer default 0`
- `trg_cancellation_count` → fires on `rsvp_cancellations` INSERT (Connect deletes rsvp rows rather than status→'cancelled')
- `broadcast_messages.audience_size_at_post integer` + BEFORE INSERT trigger counts `follows.followee_id = contributor_id`
- `profiles.timezone text default 'Africa/Johannesburg'` (Vision's org timezone; "organisations" = contributor profiles in Connect)
- `vision` Postgres schema created
- `vision.category_space_map` table (org_id → profiles, category_id → categories, space_id uuid; prerequisite for Vision Spaces)
- `vision.reach_per_event` view: MAX(impression_count, attending+considering+cancellations)
- `vision.engagement_per_event` view: 6-component weighted score 35/20/15/10/10/10 (attending/considering/org_followers/reviews/broadcasts/event_updates)

**Frontend launch prep:**
- `auth.jsx`: Removed SHOW_DEMO block + demo role picker (Citizen/Contributor/Admin shortcut buttons) — only real Google OAuth remains
- `data.jsx`: Cleared all fictional entity arrays (Grace City Church, Lydia Mensah, etc.) — only category/tier reference constants remain; real data comes from Supabase
- `store.jsx`: Removed `signInDemo` from context; added `trackImpression(eventId)` (fire-and-forget RPC)
- `home.jsx`: Calls `trackImpression` on map marker select (event type)
- `profiles.jsx`: Calls `trackImpression` on EventProfilePage mount

### Key architectural facts (durable, for Vision)
- `broadcasts` in Vision docs = `broadcast_messages` in Connect DB
- `organisations` in Vision docs = `profiles` where `contributor_status='approved'` in Connect DB
- DB counts: 191 events, 40 places, 10 contributors, 21 profiles, 27 categories
- Vision schema lives in the same Supabase project as Connect (`xyiajtrvhlxaeplsiajj`)
- Citizens-Vision Supabase project (`ijdmcudcrncmaprmzgfk`) is INACTIVE — Vision reads from Connect DB

### What the app shows without demo mode
- **Map**: 191 real events + 40 real places at real national coords ✅
- **Contributors**: 10 approved ✅
- **Messages / Notifications**: empty states (0 real msgs; normal for a fresh launch)
- **Kingdom Projects**: live ideas board from Supabase; `suggestions` has 1 row

### Remaining roadmap (in order)
1. **B0: Vite precompile** — kills Babel-standalone + `?v=` ritual (first task next session)
2. **A2: Rate-limit store** — Redis/Upstash (infra decision; pre-launch MUST)
3. **F1/F2: Firebase FCM + Apple APNs** — mobile push notifications
4. **Friends surface** — convince UI still needs a permanent home (BurgerMenu debt)
5. **Vision application layer** — Vision app connecting to `vision` schema views (separate project)
6. **vision.spaces table** — category_space_map.space_id needs a referent once Vision Spaces are designed
7. **Store compliance** — app store submission checklist

### NOT auto-verifiable (founder — needs real Google OAuth)
Sign in → confirm no demo role picker appears → map shows 191 events → click marker → event preview
→ open full event profile → check Supabase that `event_impressions` row was inserted.
Also: sign in as contributor, send a broadcast → check `broadcast_messages.audience_size_at_post` is set.

---

## 2k. PHASES 3 + 4 + 5-GROUNDWORK COMPLETE ✅ (2026-06-10 → 2026-06-12, one continuous session)

**The HTML-frontend rollout from docs/HTML_FRONTEND_WIRING_SPEC.md is done.** Six gated,
pushed commits on origin/main; migrations **131 + 132 applied live → next migration # = 133**.
Working log: `.claude/sessions/phase3-5-full-rollout.md` (full per-batch detail).
Final gates: **tsc 0 · vitest 634/634 · lint FULLY clean · advisors 0 ERROR** (114 WARN / 3 INFO =
baseline + 3 accepted secdef RPCs). Cache-bust token now **`?v=20260610f`**.

### Founder decisions applied (locked this session)
1. **Pushes pre-authorized** per milestone (six commits pushed).
2. **Idea→event = "lead schedules it"**: goal hit ⇒ in_process + voters notified instantly;
   the EVENT only exists when the lead picks a real future date. No placeholder dates.
3. **Phase 5 scope = build/sync + docs** (no Firebase F1 / no Apple F2 yet).

### The commits
- `ed9a132` Messages + Notifications wired (Bearer-enabled routes; realtime open-thread channel;
  deep-linking notification rows).
- `9bed0de` Kingdom Projects voting (migration 131: get_community_ideas RPC + idea columns;
  tier composer w/ per-tier vote-goal slider; vote toggle via vote_on_idea; fixed pre-existing
  anon-suggestion RLS 500).
- `6460d84` Contributor surface (real identity/slug; dashboard stats/activity/7-day chart;
  createEvent/createPlace → RLS inserts with MapTiler geocoding — places REQUIRE geocode;
  onboarding persists via setup+profile routes; broadcasts real w/ rollback; FIXED create-flow
  crash from deleted MapBackdrop; mobile-route feature retired).
- `2f1290d` Admin + Settings (NEW GET /api/admin/reports w/ target-name resolution; admin
  effect feeds applications/reports/member-count; resolveReport write-through; Settings: real
  notification_prefs keys, discoverable, name/bio persist; real bio everywhere — never the
  demo persona's).
- `cfd464b` Phase 4 (migration 132: safe_rsvp province snapshot; vote_on_idea auto-transition +
  admin crossing alerts; schedule_kingdom_project — voter auto-RSVP + notify; NEW funder-report
  PDF route (pdf-lib); volunteers wired end-to-end; broadcast reactions 🙏❤️🎉🙌🔥 on event
  profiles; city-reach bars + funder download in AnalyticsPanel; convince API Bearer-enabled —
  its UI awaits the friends-surface rehome, addendum A5).
- `4df3057` Phase 5 groundwork (capacitor webDir=mobile-dist BUNDLED — server.url wrapper gone;
  `npm run build:mobile`/`cap:sync` verified Android+iOS; multi-origin CORS moved to
  middleware.ts — capacitor://localhost etc., OPTIONS 204, +4 tests;
  **docs/MOBILE_LAUNCH_RUNBOOK.md** = the full launch path).
- (also `3ccebd0` docs: founder's PHASE_4_5_ADDENDUM + spec pointers.)

### NOT auto-verifiable — founder manual pass (needs real Google OAuth)
Sign in and run: real DMs (list/send/realtime) · notifications list + deep-links · submit idea →
vote → threshold → in_process → (as lead) schedule kickoff → event + auto-RSVP'd voters ·
create event/place (geocoded pin) · contributor dashboard real stats · volunteer apply/review ·
broadcast + reactions · admin panel (applications/reports/overview) · settings save · funder PDF.

### Remaining roadmap (in order — see docs/MOBILE_LAUNCH_RUNBOOK.md)
1. **Vite precompile of the frontend (B0)** — first task of the next session; kills Babel-standalone
   AND the `?v=` ritual. 2. Shared rate-limit store (A2 — needs infra choice; pre-launch MUST).
3. F1 Firebase/FCM + F2 Apple/APNs + OAuth deep links. 4. Store compliance + strip demo mode (A5).
5. Deferred product decisions: event↔place FK; friends surface (convince UI + BurgerMenu debt);
   gallery/contributor-media persistence (§2j); schema.sql drift reconcile (§2g).

---

## 2j. Photos — real upload + honest display ✅ (2026-06-09)

Founder: "allow photos to show… wire those up — photos aren't showing for mock data either" → **All of the above.**
Working log: `.claude/sessions/photos-upload-and-display.md`. **tsc 0 · next lint 0 · vitest 628/628.**
No DB/migration change → **next migration # still 131.** Cache-bust `?v=20260609e → 20260610a`.

### Root cause
Rendering/CSP were fine (mock Unsplash loads; prod CSP allows unsplash + supabase storage; storage public, real img = 200).
The real problems: **live DB has almost no photos** (2/191 events, 0/40 places, 1/21 profiles) so everything fell
back to ONE generic stock image; and there was **no real upload** (MediaPicker was a stock-image stand-in).

### Backend (2 routes, Bearer-enabled — pattern = §2f)
- **[src/app/api/avatar/route.ts](src/app/api/avatar/route.ts)** + **[src/app/api/media/upload/route.ts](src/app/api/media/upload/route.ts)**
  now use `getRouteAuth(request)` (Bearer-or-cookie) so the cross-origin static frontend can upload. avatar persists
  `profiles.avatar_url`; media/upload mints a signed upload URL (server-built, user-scoped path). Rate-limited, MIME/size validated.

### Frontend
- **[store.jsx](src/frontend/app/store.jsx)** — `window.uploadImage(file,{scope})`: `avatar`→multipart `/api/avatar`
  (NB no forced Content-Type); `event-cover`/`place-cover`→`/api/media/upload` then `CC_AUTH.supabase.storage.uploadToSignedUrl`.
  New `updateAvatar(url)` action (in-session overlay). Adapters now emit `coverPhoto:''`/`profilePhoto:''` (no stock
  FALLBACK; consts removed); real-user overlay profilePhoto `''` when no avatar → initials.
- **[ui.jsx](src/frontend/app/ui.jsx)** — `MediaPicker` gains **"Upload from device"** (file input accept=image/*) + spinner +
  error, plus a `scope` prop. `Avatar` graceful fallback (empty/onError → initials-on-gold via `name`, else User icon).
  New **`SmartImage`** (empty/onError → category-tinted placeholder w/ icon+label, never a fake stock photo).
- All cover `<img>` → `SmartImage`; avatars given `name` across home/shell/profiles/dashboard/insights/admin/messages.
  MediaPicker scopes wired: Settings photo=`avatar` (persists) + cover=`event-cover`; create event/place-cover; apply cover+logo=`event-cover`.

### Verified (preview + live API :3000, real data) — 0 console errors
Real event w/ no image → category placeholder tile (aria-label=title), 0 broken. Real contributor w/ no logo → "CR"
initials avatar + placeholders, 0 broken. "Upload from device" + file input present; `window.uploadImage` live.

### NOT auto-verifiable (founder — needs real Google OAuth)
Sign in → Settings → Photo → Upload from device → avatar uploads/persists/header updates/survives reload. Same for a Create-Event cover.

### Deferred (NOT silently built — flag when wanted)
- **Create→DB persistence** for events/places is still session-local mock, so an uploaded cover lives in Storage but the
  listing vanishes on reload until that lands (Phase 3). **Gallery upload** (needs persisted entityId UUID) +
  **dedicated contributor logo/cover persistence** (currently apply/onboarding logos upload to the event-images bucket and
  aren't saved to a contributor row) belong to that same phase.

---

## 2. What just shipped — Phase 0: HTML frontend wiring kickoff ✅ (2026-06-07)

Two commits on `main` (local — **push to origin still pending founder approval**):
`fd00214` (docs) + `35faf3f` (Phase 0). Working log: `.claude/sessions/phase0-html-frontend-wiring.md`.
Gates: **tsc 0 · lint exit 0** (only pre-existing no-img warns) · **security advisors 0 ERROR**.

### Migration 130 — Kingdom Projects / Impact Ideas voting foundation (APPLIED LIVE)
`supabase/migrations/130_kingdom_projects_voting.sql` (live name `kingdom_projects_voting_foundation`).
Next migration # is now **131**.
- `suggestions` += `tier`, `tier_label`, `vote_threshold`, `idea_status`, `project_lead_id`,
  `associated_event_id`. New `idea_votes` table (RLS: own insert/delete, public select).
  `rsvps.location_snapshot`. `vote_on_idea(uuid)` SECURITY DEFINER toggle RPC.
- **Deliberate deviations from the spec's literal SQL (verified vs live schema):**
  (a) used **`idea_status`** not `status` — `suggestions.status` already exists
  (open/in_review/actioned) and powers the existing suggestions + Phase-5 community feature;
  (b) only added the `rsvps.location_snapshot` column — `profiles.location` does NOT exist
  (profile has connect_home_province + lat/long + physical_address); the snapshot SOURCE is a
  Phase-4 decision; (c) **auto-transition DEFERRED to Phase 4** — `events.date` is NOT NULL with
  no default and an idea carries no date, so event synthesis needs a product decision.
  `vote_on_idea` returns `auto_eligible` so Phase 4 wires `transition_idea_to_in_process()`
  with no API change. Advisor delta: +1 WARN (the secdef RPC — accepted pattern).

### Frontend dropped in + API CORS
- `src/frontend/` — the standalone app: `Citizens Connect.html` + 19 `app/*.jsx` (browser
  React 18 + Babel-standalone + Tailwind, all via CDN; **all screens still MOCK data**) +
  `supabase-auth.js` (Phase-1 wiring reference). Heavy zip reference (screenshots/, uploads/
  figma_src, figma tokens) left in the zip to keep the dir lean. Excluded from tsc + eslint.
- `next.config.ts` — CORS on `/api/(.*)` (`ALLOWED_FRONTEND_ORIGIN` env → set in Vercel for F3;
  localhost:3001 dev fallback; credentials true; specific origin, not wildcard; `Vary: Origin`).

---

## 2b. Phase 1 — auth wiring ✅ (real Google OAuth wired; verified booting) (2026-06-07)

Commit `ac85e2d` on `origin/main`. Founder decisions applied: config.js env approach;
F4 covenant **removed for now**; F3 not blocking dev (localhost fallback).

- `src/frontend/auth-client.js` — browser adaptation of `supabase-auth.js` (the reference is
  Vite/`import.meta`, unusable in the no-build app). `window.CC_AUTH` = signInWithGoogle /
  loadSession / signOut / onAuthChange (+ client). PKCE + detectSessionInUrl. Role from
  `profiles.role`; routing uses `contributor_status` (**live profiles has no `wants_contributor`** —
  the reference file was wrong). Unconfigured → `CC_AUTH=null` + demo fallback so the app still runs.
- `config.example.js` (committed) + `config.js` (gitignored: `/src/frontend/config.js`) → `window.__CC_ENV`.
- **`index.html`** — RENAMED from `Citizens Connect.html` (static hosting / Capacitor webDir / clean
  OAuth redirect, no `%20`). Loads supabase-js UMD + config + auth-client before the Babel app.
- `store.jsx` — signIn → real OAuth redirect (demo fallback); signOut → supabase signOut; session
  bootstrap (loadSession on mount + onAuthChange + routeToApply); overlays real user name/avatar for
  citizen/admin (contributor still mock org data until a later phase).
- `auth.jsx` — Google button → real redirect (no fake delay); covenant `<p>` → `null`.
- **Verified** (python http.server :3001 + preview): boots, **0 console errors**, auth screen renders,
  CC_AUTH initialises. NOT yet testable: the real Google round-trip (needs the steps below).

### Phase 1 status: Google OAuth **VERIFIED WORKING** ✅ (founder, localhost 2026-06-07)
Supabase fix that unblocked it: Site URL + Redirect URLs must be full `https://` (scheme-less value
made Supabase treat the redirect as a path → `{"error":"requested path is invalid"}`). Allow-list now
has `http://localhost:3001/**` + `https://www.citizenscentral.co.za/**`.

**Resolved decisions:** F3 frontend origin = `https://www.citizenscentral.co.za`. F4 covenant = removed.
Topology = frontend on www, API on `https://citizens-connect.vercel.app` (baked into config.example.js).

---

## 2c. Phase 1 COMPLETE — old Next.js frontend stripped; app is now API-only ✅ (2026-06-08)

Commit **`470166d`** (LOCAL — **push to origin was BLOCKED by the auto-mode classifier**:
direct push to `main` needs explicit founder authorization. The commit is safe locally;
push it or authorize the push next.). Working log: `.claude/sessions/phase1-strip-old-frontend.md`.

### What shipped
- **Moved** `PendingApplication` view-model type → [src/types/contributors.ts](src/types/contributors.ts);
  repointed the one keeper import ([pendingApplications.ts:15](src/lib/contributors/pendingApplications.ts)).
- **Salvaged** `useLocationTracking` (Phase 2 map geo) + `usePushNotifications` (Phase 5 Capacitor)
  → `docs/salvage/*.ts.ref` (named `.ts.ref` so they stay out of tsc/build).
- **Deleted** the old frontend: 16 App-Router page dirs, root `page/layout/default/error/loading/globals.css`,
  all of `src/components/`, all of `src/hooks/`, and the 25 now-dead `src/__tests__/components/` tests.
- **`src/app/` now = `api/` + `auth/` + `favicon.ico` only.** Backend (lib, types, middleware, supabase) untouched.
- **Gates:** `tsc 0` · `next lint 0` · **`next build` EXIT 0** (proved the App-Router project builds with only
  route handlers, no pages/layout — had to clear stale `.next/types`) · `vitest 624/624` (71 files; the dropped
  ~193 were the deleted component tests). Vibe-security: attack surface reduced, `config.js` gitignored, no new secrets.

### Deferred (non-blocking, "before launch"): strip `SHOW_DEMO` (auth.jsx) + `signInDemo` (store.jsx).
Kept for now — the demo fallback lets the HTML app boot during Phase 2 dev without full Supabase config.

---

## 2d. Phase 2a SHIPPED — real MapLibre + MapTiler map, wired to live `/api/v1/events` ✅ (2026-06-08)

The decorative SVG prototype map is replaced with a **real geographic MapLibre GL + MapTiler map**,
driven by the live public events API + active map-bubbles RPC. Verified end-to-end in preview.

- **[index.html](src/frontend/index.html)** — maplibre-gl CDN (CSS + UMD JS) + `.cc-pin-pulse` keyframe.
- **[app/map.jsx](src/frontend/app/map.jsx)** — full rewrite. Keeps the `window.StylizedMap` interface
  (markers/routes/filterCategory/selectedId/onSelect) so the home screen barely changed. Native maplibre
  markers built as DOM pins mirroring the teardrop/dot/glass styles + live pulse + broadcast bubble +
  selected label. Geo bridge: real lat/lng when present, else legacy mapX/mapY projected into a greater-
  Pretoria bbox (mock places/ideas during the mock→real migration). Auto-frames all markers until the
  user pans/zooms. NavigationControl + GeolocateControl. `MapFloatersLayer` → no-op (bubbles ride markers).
- **[app/store.jsx](src/frontend/app/store.jsx)** — `adaptEvent` (API row → app event shape: latitude→lat,
  longitude→lng, image_url→coverPhoto, date→time, isLive computed; honest 0 counts / blank organiser).
  One effect: fetch `${API_BASE}/api/v1/events?limit=100` and `setEvents` immediately; separately attach
  active bubbles via the anon `get_active_map_bubbles` RPC. Fails open → keeps demo data offline.
- **[app/home.jsx](src/frontend/app/home.jsx)** — passes `lat`/`lng` on the marker objects.
- **config.example.js** — `MAPTILER_KEY` + `MAPTILER_STYLE` placeholders. Real values live ONLY in the
  gitignored `config.js` (key never committed). `.claude/launch.json` has a local `frontend`+`api` config.
- **Verified** (preview, frontend :3001 + `next dev` :3000): real basemap, 103 markers at real coords
  (national spread, Gauteng-dense = real test data), category colours correct, marker click → real-data
  preview panel, **0 console errors**.

### Phase 2b — next increment (refine the live map)
1. ✅ **Organiser identity — SHIPPED (2026-06-08, see §2e).** Real contributors fetched + merged;
   organiser row resolves on the event profile; this also fixed a hard crash.
2. ✅ **Real places — SHIPPED (2026-06-09, see §2g).** New public `/api/v1/places` + `adaptPlace`;
   mock bbox projection gone. (Impact Ideas on the map still deferred to Phase 4/6 voting backend.)
3. ✅ **Marker clustering — SHIPPED (2026-06-09, see §2g).** Grid deconfliction below zoom 12.
4. ✅ **Polish — SHIPPED (2026-06-09, see §2g).** AM/PM time, Route legend dropped, crash-safe
   organiser row on the map preview card.
5. ✅ **Authenticated mutations — SHIPPED (2026-06-08, see §2f).**

### Cross-origin auth (still relevant for mutations, NOT the read path)
- Map READ path needs NO Bearer auth: `/api/v1/events` is public (gateV1 = rate-limit only); bubbles via
  anon RPC; CORS for `/api/(.*)` set in next.config.ts.
- Authenticated MUTATIONS need `Authorization: Bearer <supabase access token>`: `createClient()` +
  `middleware.ts` are cookie-based and see no cookie from the localStorage-session static frontend. Also
  prune middleware's PROTECTED_ROUTES / bio-setup redirects (they point at deleted page routes; harmless
  for `/api/*` but should become API-appropriate 401 JSON when auth is wired).

---

## 2e. Phase 2b (part 1) SHIPPED — marker-anchor fix + organiser identity (+ crash fix) ✅ (2026-06-08)

Founder-flagged bug + Phase 2b #1, verified end-to-end in a fresh preview (0 console errors).
**Commit: LOCAL on branch `phase2b-map-anchor-organiser-identity` (NOT pushed — main push needs founder
auth, per the Phase-1 classifier block).** Working log: `.claude/sessions/phase2b-map-refine.md`.
Frontend-only changes (`src/frontend/` is excluded from tsc/eslint/vitest, so those gates are unchanged;
**tsc 0 · next lint 0** re-run to prove the backend was untouched).

### 1. Map markers floated/drifted on zoom — FIXED (the founder-reported bug)
- **Root cause:** `buildPin()` set the MapLibre marker element to inline `position:relative`, which
  overrode maplibre 4.7.1's `.maplibregl-marker { position:absolute }` rule. With the element in normal
  flow, maplibre's `transform: translate(x,y)` offset from the wrong origin → pins drifted instead of
  anchoring to their lng/lat.
- **Fix** ([map.jsx](src/frontend/app/map.jsx)): the outer element handed to maplibre now carries NO
  `position` (absolute rule wins); all decorations (pulse ring, broadcast bubble, selected label) moved
  onto an inner `position:relative` wrapper. Also: recreate the marker when `pinStyle` flips the required
  `anchor` (teardrop=bottom ↔ center), since anchor is fixed at construction.
- **Verified:** `position:absolute` restored, no `relative` inline; on a programmatic zoom all sampled
  markers reposition (glued to coordinates), not floating in screen space.

### 2. Organiser identity (Phase 2b #1) — and it fixed a hard crash
- **Crash found while verifying:** `EventProfilePage`/`PlaceProfilePage` dereferenced `org.*` with no
  guard. Real events' `organizerId` is a `created_by` UUID that matches no mock contributor → `org`
  undefined → **tapping any real event crashed the whole app** (no error boundary → blank screen).
- **Fix** ([store.jsx](src/frontend/app/store.jsx) + [profiles.jsx](src/frontend/app/profiles.jsx)):
  - `adaptContributor` + merge-fetch `GET /api/v1/contributors?limit=100` into the `contributors`
    state (merge, not replace — mock places still resolve their mock orgs during the migration; real row
    wins on id collision). Real org name + logo now resolve.
  - `adaptEvent.organizerName` falls back to `community_contributor` (name for community-posted events).
  - Event/Place organiser blocks: clickable row when the org is a real directory profile; non-clickable
    name-only row when we only have a name; omitted entirely when there's no organiser — never crash.
  - `ContributorProfilePage`: honest "not found" Empty instead of silently showing `contributors[0]`
    (the wrong org) — VISION integrity (don't misrepresent identity).
- **Verified:** matched-org event → clickable "POPUP Skills Development Centre · 0 followers" → taps
  through to the **correct** contributor profile; no-organiser event → row omitted, no crash; mock place
  unchanged. Test DB: 100 events / 10 approved contributors (13 events match a contributor).

### Phase 2b remaining (after §2f below — next increments)
Real places + Impact Ideas (drop mock bbox projection) · marker clustering at national zoom · polish
(AM/PM time, drop Route legend, default framing) + the map-preview/`EventPreviewCard` organiser row
(data now available). **Authenticated mutations: SHIPPED — see §2f.**

---

## 2f. Phase 2b (part 2) SHIPPED — authenticated cross-origin mutations (Bearer) + real-state seeding ✅ (2026-06-08)

All five authenticated mutations now work end-to-end from the cross-origin static frontend:
**Connect/RSVP, Consider, Follow (org), Follow (place), Dismiss bubble.** The static app keeps its
Supabase session in localStorage (no cookie), so the cookie-based API routes returned 401; they now
accept a Bearer token. **Commit `4c75143` — LOCAL on branch `phase2b-map-anchor-organiser-identity`
(NOT pushed; main push needs founder auth).** Working log: `.claude/sessions/phase2b-authenticated-mutations.md`.

### Backend
- **NEW [src/lib/supabase/route.ts](src/lib/supabase/route.ts)** — `getRouteAuth(request)`: reads
  `Authorization: Bearer <jwt>` → user-scoped client (token on every PostgREST/RPC call so RLS runs
  as that user), validated via `getUser(jwt)` (server-side check, not a local decode); **falls back
  to the cookie path** (`createClient()`) when no Bearer. Single place that knows how a request proves
  identity — so routes stay uniform.
- **5 routes refactored** to `const { supabase, user } = await getRouteAuth(request)`: rsvp (POST+DELETE),
  consider (POST+PUT), follow (POST+DELETE), place-follow (POST+DELETE), map/bubbles/[id]/dismiss (POST).
  No other logic changed.
- **[middleware.ts](src/middleware.ts)** — early-returns for `/api/*` (routes self-authenticate; stops a
  wasted cookie `getUser()` on every public read + the dead redirect-to-deleted-page risk). Removed the
  `PROTECTED_ROUTES` block (those pages were deleted in Phase 1). force_reauth/bio-setup gates kept.

### Frontend
- **auth-client.js** — `getAccessToken()` on `window.CC_AUTH`.
- **store.jsx** — `authedFetch` (API base + Bearer + JSON); `followedOrgs`/`followedPlaces` Sets; a
  **seeding effect** (keyed on realUser) reads the user's own rsvps(split by status)/follows/place_follows
  via the authed client (RLS) and replaces the mock seeds so buttons reflect reality. `toggleConnect`/
  `toggleConsider` are now **mutually-exclusive optimistic write-throughs with rollback** (Connect &
  Consider are one rsvps row; transitions clear the other side first — clearing 'considering' via the
  consider endpoint, NOT rsvp DELETE, so no false `rsvp_cancellations` log). New `toggleFollow` /
  `togglePlaceFollow` / `dismissBubble`. **Guard: only real UUID ids write through** — mock entities stay
  local (places are still mock; real places = the deferred increment). Bubble `id` now carried on `broadcast`.
- **home.jsx / profiles.jsx** — wired the previously toast-only Follow buttons (home preview place +
  place & contributor profiles) and a new **dismiss × on the map bubble** (map.jsx threads `onDismissBubble`).

### Backend facts (for the next session)
- Connect=`rsvps.status='attending'`, Consider=`='considering'` — ONE row. `safe_rsvp` 409s if any row
  exists (no upgrade); `toggle_consider` adds/removes considering, noops on attending. `get_active_map_bubbles`
  returns `id,event_id,body,created_at`. `/api/v1/contributors` returns `id`=profiles.id (Follow-org FK ok).
- **No public `/api/v1/places`** yet — the deferred "real places" increment must add it first.

### index.html cache-busting (founder's flagged gotcha — DONE)
Local scripts now carry `?v=20260608b`. The static host sends no cache headers, so browsers served
stale copies after edits (this bit verification this session). **Bump the `?v=` token whenever you edit
auth-client.js or any app/*.jsx** so the preview/deployed clients load fresh code.

### Gates / verification
- **tsc 0 · next lint 0 · vitest FULL suite exit 0** (middleware.test.ts updated: an `/api`-skip test
  replaces the old deleted-page redirect test) · **0 console errors on a fresh preview load** ·
  served auth-client.js confirmed current · `getAccessToken` live after cache-bust. No DB changes →
  Supabase advisors unchanged. Vibe-security: token validated server-side, RLS-scoped, no service-role
  in client, Bearer only sent to the CORS-restricted API, all ids UUID-validated + rate-limited.
- **NOT auto-verifiable (founder manual step):** the live Google OAuth round-trip. On localhost
  (fresh browser / hard refresh): sign in → Connect/Consider an event → reload (state persists) →
  Follow a real contributor → dismiss a live bubble. Network tab: each mutation = 2xx carrying
  `Authorization: Bearer …`; preflight OPTIONS = 204.

---

## 2g. Phase 2b COMPLETE — real places + marker clustering + polish ✅ (2026-06-09)

The whole map phase (Phase 2) is now done: the last mock map layer is gone, dense areas cluster,
and the polish items are shipped. **MERGED TO MAIN + pushed (origin/main @ `0552f62`, founder-
authorized 2026-06-09).** The feature branch `phase2b-map-anchor-organiser-identity` fast-forwarded
main by 5 commits (the two earlier Phase 2b parts that were never on main + real-places + cache-bust).
Working log: `.claude/sessions/phase2b-real-places.md`. Backend gated; `src/frontend/` excluded
from tsc/eslint/vitest as always.

### Map verified working locally this session (re: the founder-reported "404 / couldn't see anything")
- Booted frontend (:3001) + API (:3000) in preview. **No 404 reproducible locally** — landing/auth
  page renders; API `/api/v1/{events,places,contributors}` all 200; MapTiler custom style 200.
- Entered as demo Citizen → map renders **140 markers** (100 events + 40 places): 8 pins + 41 clusters
  at z11, collapsing to 6 clusters at national zoom — clustering works. 0 console errors, 0 failed reqs.
- **Root cause of the blank/404-look = STALE BROWSER CACHE** (the documented no-cache-headers gotcha):
  a cached `map.jsx?v=…` served old code → 0 markers, until the `?v=` token was bumped. Fixed by
  bumping to **`?v=20260609b`** (commit `0552f62`). Lesson reinforced: ALWAYS bump `?v=` on frontend
  edits AND hard-refresh when verifying. (`styleLoaded:false` in headless preview is just the WebGL
  basemap not painting without a GPU — DOM markers render fine; a real browser shows the basemap.)
- **A deployed 404 (if seen on a hosted URL) is topology, not a code bug:** the app is the static
  frontend (→ `https://www.citizenscentral.co.za`); the Vercel project is **API-only** and 404s at its
  root by design. For e2e, open the static frontend URL (or localhost:3001), not the API origin.

### Real places (increment #1) — drop the mock bbox projection
- **NEW [src/app/api/v1/places/route.ts](src/app/api/v1/places/route.ts)** — public, read-only places
  directory (mirrors events/contributors): gateV1 rate-limit, anon/RLS client, `{data, meta}` envelope,
  60s s-maxage cache. Embeds `categories(slug,emoji,color)` and **flattens** it onto each row
  (`category` slug + `category_emoji`/`category_color`). Params: `created_by` (UUID-validated),
  `q` (allowlist-escaped ilike on name/description), `limit` (1..100/50), `offset`.
- **⚠️ LIVE SCHEMA DRIFT caught & handled:** `places.verification_flagged` is in `schema.sql` but
  **does NOT exist on the live DB** — filtering on it would have 500'd production. Removed it; live
  places are public via the existing RLS SELECT policy. The live table also HAS `volunteer_openings`
  (now mapped → `volunteeringEnabled`) and `prominence_base` (unused). **`schema.sql` is ahead of
  live for `places` — trust the live DB, not schema.sql, here.**
- **[store.jsx](src/frontend/app/store.jsx)** — `adaptPlace(r)` (real lat/lng, category slug, honest
  0 followerCount, organizerId=created_by → resolves via merged contributors, empty associatedEventIds
  since there's NO event↔place FK yet). Places fetch block in the live-data effect (replace mock only
  when real rows arrive; fail open). `togglePlaceFollow` was already `isRealId`-guarded → **place-follow
  now writes through for real place UUIDs** (the increment it was waiting on).
- **Verified live** (`next dev` + `curl /api/v1/places`): 40 real places at real national coords
  (JHB/PTA/Gqeberha), category embed flattens, no-category rows fall back to `custom_category`.

### Marker clustering (increment #2) — [map.jsx](src/frontend/app/map.jsx)
- Grid deconfliction below zoom 12 (`CLUSTER_CELL=56px`, `CLUSTER_MAX_ZOOM=12`). Gold count badge
  (`buildCluster`); clicking a cluster `fitBounds` to its members (zoom in/split). Re-clusters on
  `moveend` via a `renderRef`. **Never clusters live events, active broadcasts, or the selected pin**
  (VISION: don't bury what's happening now). Preserves the §2e anchor-fix invariant (cluster wrap sets
  no `position`; anchor `center`). Individual pins reused/removed by seen-set exactly as before.

### Polish (increment #3)
- **AM/PM time** (store.jsx `fmtTime` → `en-US` `hour12`). **Dropped the "Route" legend row** + ALL
  dead route code (`routes` const + prop, `isMobile`/`route` marker fields, the ROUTE cover badge) —
  real events have no routes. **Default framing = USER LOCATION FIRST, national data as fallback**
  (2026-06-09 founder decision): on load the map tries `navigator.geolocation` → centres on the
  citizen's own area at city zoom (individual pins, local belonging); on denial / no support / timeout
  it falls back to the national fit-to-data. Both a real gesture and a geo success set `userMovedRef`,
  so the view is never yanked once settled. (Headless preview has geolocation disabled → it always
  exercises the national fallback; the geo path needs a real browser + permission grant to verify.)
- **Preview-panel organiser row made crash-safe** (home.jsx `PreviewPanel`): real directory contributor
  → tappable to its profile (+ verified tick); only-a-name (community-posted, no directory match) →
  non-tappable name row; no organiser → row omitted. Mirrors the §2e profile-page fix — real events/
  places no longer risk an empty/broken nav. (This is the carried-over "organiser row on the preview".)

### Gates / verification
- **tsc 0 · next lint 0 · vitest 628/628** (71 files; +4 new `/api/v1/places` route tests incl. the
  category-flatten path). Live `curl` verified the route end-to-end against the real DB.
- **Security advisors: 0 ERROR** (111 WARN / 2 INFO — unchanged baseline; no `places` findings). No DB
  changes / no migration → **next migration # still 131**. Vibe-security: read-only, rate-limited,
  anon/RLS-scoped, `q` allowlisted, `created_by` UUID-validated, no secrets, no new writes.
- index.html cache-bust bumped `?v=20260608b` → **`?v=20260609a`** (20 refs).

### Deferred / next (post-Phase-2)
- **Impact Ideas on the map** = the remaining "real" layer; deferred until Phase 4/6 voting backend
  lands (ideas are still mock `window.DATA.impactIdeas`). Real places = DONE; ideas were always the
  Phase-4/6 half of old increment #2.
- **Event↔place association**: no FK exists (events carry free-text `location` + `created_by`, not a
  `place_id`), so place profiles can't yet list "events here" and `associatedEventIds` is honestly
  empty. Needs a product+schema decision if wanted.
- **`schema.sql` drift**: reconcile `schema.sql`'s `places` block with live (it has a phantom
  `verification_flagged`; lacks `volunteer_openings`/`prominence_base`). Housekeeping, non-blocking.
- **Manual (founder, can't be scripted — live Google OAuth):** hard-refresh localhost → real places at
  real coords; zoom out → gold clusters over Gauteng, click one to zoom/split; live & selected pins
  never hide; sign in → Follow a real place → reload (persists). Then **merge the branch to main**.

---

## 2i. Map regression fixes — markers not showing + floating pins + broadcast bubbles ✅ (2026-06-09)

Three founder-reported map bugs, all traced to the marker render loop in
[map.jsx](src/frontend/app/map.jsx) and the §2h date-layering. Verified end-to-end in preview
(mock + real data, incl. a zoom anchor test). Working log: `.claude/sessions/map-markers-broadcast-fix.md`.
Frontend-only (`src/frontend/` excluded from tsc/eslint/vitest); **tsc 0** re-confirmed (backend untouched).
**Commit pending push (held for founder auth, per repo convention).**

### Root causes
- **Marker reuse broke positioning + wiped pins.** The reuse path did
  `existing.getElement().replaceWith(el); existing._element = el;`. The fresh `el` did NOT carry
  MapLibre's `maplibregl-marker` class (added once at construction → `position:absolute`), so the
  pin fell to `position:static` + a transform → **floated** on zoom/pan. Verified live:
  `.maplibregl-marker` count was 0 and no pin wraps were attached to the canvas container.
- **Date-based zoom-gate hid events.** §2h's `assignLayerZooms` only showed an item when
  `currentZoom >= its minZoom (9–13)`. At national fit-zoom (<9) **every** non-live/non-broadcast
  marker was hidden → "not all events showing". (Confirmed: real data = 140 markers, all hidden at
  national zoom until fixed.) A render where the filter emptied also tripped the remove-pass → all pins gone.
- **Broadcast bubble CSS.** `white-space:nowrap` on the row + a flex text child with default
  `min-width:auto` meant `text-overflow:ellipsis` never engaged → long messages clipped/stretched
  ("very long"); the floating made them look detached/contentless.

### Fix ([map.jsx](src/frontend/app/map.jsx))
1. **Removed date-layering entirely** (`assignLayerZooms`, `LAYER_*`, `layerZoomMap`) + the zoom-gate
   filter + the `moveend` re-render + `renderRef`. **All items with coords now render**; MapLibre
   repositions DOM markers itself on zoom/pan, so the set only re-renders on data/filter/selection/style change.
   (Both clustering — §2g/§2h — and layering are now gone; we show everything. VISION: make the unseen seen.)
2. **Split `buildPin` → `buildPinInner`** (returns only the inner decoration node). The OUTER element
   MapLibre owns is created once and **never replaced**; on reuse we swap only its children
   (`wrap.replaceChildren(inner)`) + update opacity + `setLngLat`, so the `maplibregl-marker` class +
   absolute positioning survive → **pins stay anchored**. (Anchor still rebuilds on a teardrop↔center pinStyle flip.)
3. **Broadcast bubble**: `max-width:188px` + `width:max-content`; text child gets `min-width:0` +
   one-line ellipsis → short updates stay small, long ones truncate cleanly. Selected label also capped + ellipsised.
4. **Clear `markerObjs` on map cleanup** (insurance against stale marker objects).

### Verification (preview)
- Mock data: 10/10 markers, all `position:absolute`; 3 bubbles show content, cap at 188px, ellipsis-truncate.
- Zoom in/out: transforms change (glued to coords), all markers stay absolute + keep the class, count stable — **no floating**.
- Real data (localhost:3000): **140/140 markers render + anchored**, 0 console errors.
- index.html cache-bust bumped `?v=20260609d` → **`?v=20260609e`** (20 refs).

### Note for the next session
- §2h's date-layering is GONE. If marker density ever needs managing again, do it WITHOUT hiding
  events by zoom (that was the regression) — e.g. collision-aware label hiding, or a non-destructive overlay.
- `config.js` API_BASE_URL is local-only (gitignored); it was momentarily pointed at a dead port to
  force the mock-data path during bubble verification, then restored to `http://localhost:3000`.

---

## 2h. Post-Phase-2 Multi-Issue Fixes ✅ (2026-06-09)

Six bugs fixed in one batch. Working log: `.claude/sessions/bugfix-all-issues.md`.
`src/frontend/` excluded from tsc/eslint/vitest; **tsc 0** re-confirmed after new API route.

### A. Vercel 404 at www.citizenscentral.co.za — FIXED
- **Root cause:** Next.js project is API-only (no root `page.tsx`); `public/` had no HTML frontend.
- **Fix:**
  - **[scripts/build-frontend.js](scripts/build-frontend.js)** (NEW) — pre-build script copies `src/frontend/*` → `public/` and generates `public/config.js` from env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_MAPTILER_STYLE`, `NEXT_PUBLIC_API_BASE_URL`). `config.js` skipped in the copy (generated fresh).
  - **[package.json](package.json)** — `"build"` now: `node scripts/build-frontend.js && next build`.
  - **[next.config.ts](next.config.ts)** — `async redirects()` adds `{ source: '/', destination: '/index.html', permanent: false }`. CSP expanded: `script-src` ← `unpkg.com cdn.tailwindcss.com cdn.jsdelivr.net`; `style-src` ← `unpkg.com fonts.googleapis.com`; `img-src` ← `images.unsplash.com`.
  - **[.gitignore](.gitignore)** — generated `public/index.html`, `public/auth-client.js`, `public/config*.js`, `public/app/` are now gitignored (build artifacts, not committed).
  - **Vercel env vars needed:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_MAPTILER_STYLE`. Set `NEXT_PUBLIC_API_BASE_URL=''` (empty → same-origin). CORS `ALLOWED_FRONTEND_ORIGIN` can stay pointing at localhost for dev; same-origin production requests bypass CORS anyway.

### B. Map clustering removed → date-based zoom layering — FIXED
- **Root cause:** Grid clustering (CLUSTER_CELL/CLUSTER_MAX_ZOOM) was slow and obscured density.
- **Fix** ([map.jsx](src/frontend/app/map.jsx)):
  - Removed: `CLUSTER_CELL`, `CLUSTER_MAX_ZOOM`, `buildCluster()`, `clusterObjs` ref, all cluster logic.
  - Added: `assignLayerZooms(items)` — sorts items by date proximity (future-closest first, then recent past; undated last), divides into 5 groups, assigns `minZoom` 9–13. `LAYER_MIN=9`, `LAYER_MAX=13`, `LAYER_COUNT=5`.
  - `renderMarkers()` now filters: shows an item if `currentZoom >= item.minZoom` OR the item is always-visible (live / active broadcast / selected). `moveend` still re-renders (zoom-dependent layering). Layer zoom map recomputed when `markers` prop changes.

### C. Citizen profile → "Contributor doesn't exist" — FIXED
- **Root cause:** `go('profile')` passed no `id`; `ContributorProfilePage(id=undefined)` → not found.
- **Fix:** Added `CitizenProfilePage` to [profiles.jsx](src/frontend/app/profiles.jsx) — shows the signed-in user's photo, name, bio, attending events, and considering events. Updated [shell.jsx](src/frontend/app/shell.jsx) `case 'profile'` router: `nav.params.id` present → `ContributorProfilePage`; absent → `CitizenProfilePage`.

### D. Apply form → route to map on completion — FIXED
- **Root cause:** `submitApplication` in [store.jsx](src/frontend/app/store.jsx) didn't call `go()`.
- **Fix:** Added `go('home')` after the toast. Also wired a background API call to `POST /api/contributor/apply` for real signed-in users (no-op in demo mode, fires-and-forgets on failure). `realUser` added to the `useCallback` deps.
- Shell sidebar already showed "Application under review" when `myApplication.status === 'pending'` — no change needed there.

### E. Message title shows "Contributor" — FIXED
- **Root cause:** `adaptContributor` in [store.jsx](src/frontend/app/store.jsx) fell back to the literal string `'Contributor'` when `full_name` is `null`; this string was then stored as the conversation's `participantName`.
- **Fix:** Fallback is now `contributor_slug` converted to Title Case (e.g. `grace-city-church` → `Grace City Church`), or `'Unnamed Ministry'` if slug is also null.

### F. Admin contributor applications not wired — FIXED
- **Root cause:** `applications` in the store was local-only mock state; no DB fetch wired.
- **Fix:**
  - **NEW [src/app/api/admin/contributor-applications/route.ts](src/app/api/admin/contributor-applications/route.ts)** — `GET /api/admin/contributor-applications`. Admin-only (`requireAdmin` guard). Returns all applications (all statuses, newest first) shaped for `AppCard`: `{ id, name, photo, bio, category, website, location, reason, socials, status, submittedAt }`.
  - **[admin.jsx](src/frontend/app/admin.jsx)** — local `apiApps` state; `React.useEffect` fetches from the new endpoint when `isAdmin && realUser`. Falls back to demo `applications` when API is unavailable. `handleReview` updates `apiApps` optimistically + calls `reviewApplication` (store) + POSTs to `/api/admin/contributors/review` for real UUID apps.
  - **[store.jsx](src/frontend/app/store.jsx)** — `realUser` exposed in the context value; `window.authedFetch` exposed globally so admin.jsx can reach it.

### cache-bust
- `?v=` token bumped: `20260609c` → **`20260609d`** (index.html, all 20 script refs).

### Gates
- **tsc 0** · no lint warnings in changed TS files · frontend excluded from tsc/vitest. New API route follows exact same pattern as existing admin routes (`requireAdmin`, `createClient`, `NextResponse.json`). Vibe-security: read-only route, admin-guarded, no secrets, no new writes. **No DB changes → next migration # still 131.**

### Deferred / manual verification needed
- Vercel: add `NEXT_PUBLIC_*` env vars, redeploy, confirm `www.citizenscentral.co.za` serves the app.
- Local: hard-refresh, sign in as citizen → "View Profile" → should show citizen profile page.
- Local: sign in as citizen → apply flow → submit → should land on map, sidebar should show "under review".
- Local: sign in as admin → Admin Panel → applications tab → should show real DB applications (not just demo data when real user is signed in).

---

## (archived) Phase 2 kickoff plan — superseded by 2d above

**Recon done this session — the path is clearer than the old note implied:**

- **Map READ path needs NO Bearer auth.** `/api/v1/events` is **public read-only** (gated by `gateV1` =
  rate-limit only; API key optional). Map bubbles are read via the anon-allowed Supabase RPC
  `get_active_map_bubbles` directly from the client. CORS for `/api/(.*)` is already set (next.config.ts, Phase 0).
- **The cross-origin `Authorization: Bearer <access_token>` question only bites for authenticated MUTATIONS**
  (dismiss bubble, RSVP, follow…) — `createClient()` + `middleware.ts` are cookie-based and see no cookie from the
  localStorage-session static frontend. Solve that when wiring interactions (Phase 2b/3), NOT for the read path.
  (Also note: middleware still redirects PROTECTED_ROUTES / bio-setup to deleted page routes — harmless for `/api/*`
  but should be pruned to API-appropriate 401 JSON when we touch auth.)

**Current frontend map is a DECORATIVE SVG PROTOTYPE** ([src/frontend/app/map.jsx](src/frontend/app/map.jsx), 158
lines): markers placed by mock `mapX`/`mapY` % from `window.DATA`; pin/bubble styles already themeable. Phase 2 =
swap it for a real geographic MapLibre GL + MapTiler map driven by real `latitude`/`longitude`.

**Build steps (proposed):**
1. **Add `MAPTILER_KEY` to `config.example.js`** (+ founder adds the value to gitignored `config.js`). ⛔ BLOCKER:
   need the MapTiler key — it was in the deleted Next.js `.env`/Vercel (`NEXT_PUBLIC_MAPTILER_KEY`).
2. Load MapLibre GL JS via CDN in `index.html` (no-build, like supabase-js).
3. New real-map module: init MapLibre centred on Pretoria, MapTiler style; render native markers from data.
4. **Data layer:** fetch `GET {API_BASE_URL}/api/v1/events` → map rows → markers; bubbles via `get_active_map_bubbles`
   RPC. Reuse the existing category colours / pin+bubble style tweaks.
5. Keep the prominence/tiering idea (logic was in the deleted `src/lib/map/prominence.ts` — recover from git if wanted).
6. **Verify** with preview (real map renders, markers at real coords, 0 console errors); screenshot for the founder.

**Then → Phase 3** (screens), **Phase 4** (advanced incl. idea→event auto-transition deferred from migration 130),
**Phase 5** (Capacitor).

---

## 2-prev. What just shipped — Legacy map-chrome cleanup (pre-Phase-6) ✅ (2026-06-06)

Commit **`131e03f`** (pushed to main). No DB migrations — next migration # still **130**.
Suite **817/817** (96 files) · tsc 0 · lint clean · vibe-security CLEAN.
Working log: `.claude/sessions/phase6prep-bugfix-legacy-cleanup.md`.

### Founder-reported issues
1. **No events/places on desktop** + 2. **Google login broken** → ONE root cause, NOT code:
   prod build lacked `NEXT_PUBLIC_SUPABASE_URL` (+ anon key) so the client fell back to
   `https://placeholder.supabase.co` (see `src/lib/supabase/{client,server}.ts`,
   `src/middleware.ts`). Placeholder host = no data loads + OAuth authorize hits placeholder.
   **Founder fixed the Vercel env vars + redeployed.** No code change needed.
3. **Legacy map artifacts discarded** (matched to latest Figma `Christiancommunitymapapp@b708e35`):
   - **Floating legacy search bar** = `GlassMapHeader`. Stripped to the current Figma row
     **`[search] [filter] [avatar]`** — removed the burger, Sparkles brand + tagline, calendar
     toggle, notifications bell, rainbow personalise "?". (Those all live in `AppShell` now.)
   - **"Organizations / Members / Active Projects" pill** = `MapStatsFooter` → **DELETED**.
   - **"Impact Glow / Activity Pulse / Connections"** = map layers → **DELETED** (`mapLayers.ts`,
     the `MapFiltersPanel` block, the `globals.css` rules, the `data-layer-*` attrs).

### Also done
- **`BurgerMenu` DELETED** (founder choice). `useBurgerMenuData` KEPT (still powers the map
  preview/quick panels + header avatar/personalisation; only the burger-only destructures dropped).
- **Calendar relocated** → `AppShell` sidebar entry (`/events?view=calendar`, desktopOnly).
  EventsView added an effect to open the overlay on the `view` param via soft-nav; the
  in-calendar "Map" button now uses `closeCalendar` (strips the param so refresh won't reopen).
- **Personalise** deep-dive sheet relocated → Settings ("Personalise my feed" button).
- Cleaned orphans (`togglePlaceCategory`, `considerVersion`, `handleBrandClick`, `handleLogout`,
  `filtersOpen`, `burgerTab`, `placesMode` prop, `memberCount` fetch, dead `cc-map-glass` class).
- `OLD_UI_ARTIFACTS.md` updated (search bar / logo / burger marked resolved).
- Tests reworked (`EventsView.test.tsx`): burger/brand/header-calendar-toggle tests replaced
  with param-driven calendar tests + a new Figma-header test.

### ⚠️ Debt created (rehome in a later phase)
- **BurgerMenu social features dropped:** trending events, favourite orgs, friends-considering +
  **convince-from-map**. (Convince still exists in Notifications.) These are VISION-relevant
  (cit↔cit connection) — need a Figma-faithful home. `useBurgerMenuData` still returns the data.
- **Calendar is desktop-sidebar only** (no mobile bottom-nav slot — the 5 slots are full). If
  mobile calendar access is wanted, decide where it goes.

### NEXT → Phase 6 (Impact-Ideas voting backend) — still deferred, separate founder approval
Schema (ideas table with votes + thresholds + status machine), RLS, SECURITY-DEFINER RPCs,
map "Ideas" layer wiring.

---

## 2-prev. What just shipped — Figma UI Phase 5 (Kingdom Projects / Community) ✅ (2026-06-04)

Commit **`5001925`**. No DB migrations — next migration # still **130**. Suite **821/821** · tsc 0 · lint clean · vibe-security CLEAN.
Working log: `.claude/sessions/phase5-community.md`.

### Community page (`/community`)
- [CommunityPageClient.tsx](src/components/community/CommunityPageClient.tsx) — full Figma-faithful client:
  - **Glass header**: Lightbulb icon, "Kingdom Projects" (Playfair), subtitle "Impact Ideas · Community Collaboration"
  - **3 stats cards**: Voting (blue) / In Process (amber) / Confirmed (green) — real counts from DB
  - **3 in-page tabs**: Voting / Projects / + Submit Idea
- **Voting tab**: Phase 6 info banner + "Ideas on the Board" section. Idea cards: category badge (parsed from body prefix), title, description, submitter + timeAgo. Vote + Collab buttons disabled (`title="Voting opens in Phase 6"`). Honest empty state → "Submit an Idea" CTA.
- **Projects tab**: In Process section (amber border) + Confirmed Projects section (green tint). Empty state → "View Ideas" CTA.
- **Submit tab**: "What is an Impact Idea?" gold explainer card. Form: title, description (char counter), all 17 category chips. Submit → `POST /api/suggestions` with body encoded as `[cat:slug]\n\nDescription` and `page_url = origin + "/community"`. Success state with "View Ideas Board" CTA.
- [page.tsx](src/app/community/page.tsx) — server component: admin-client read of `suggestions` where `page_url ILIKE '%/community'` and `status IN (open, in_review, actioned)`. FK join on `profiles!suggestions_user_id_fkey` for author name/avatar.
- [parseIdea.ts](src/lib/community/parseIdea.ts) — extracts `[cat:category-id]` prefix from body for display; 5 unit tests.
- **Drive-by fix**: escaped apostrophe in `DashboardHomeClient.tsx:320` (pre-existing lint ERROR, now clean).

### NEXT → Phase 6 (Impact-Ideas voting backend) — separate founder approval required
Schema (ideas table with votes + thresholds + status machine), RLS, SECURITY-DEFINER RPCs, map "Ideas" layer wiring.

---

## 2-prev. What just shipped — Figma UI Phase 4 (Contributor Dashboard) ✅ (2026-06-04)

Commit **`14451cc`**. No DB migrations — next migration # still **130**. Suite **816/816** · tsc 0 · lint clean · vibe-security CLEAN.
Working log: `.claude/sessions/phase4-contributor-dashboard.md`.

### Dashboard home reskin (`/c/[slug]/dashboard`)
- [DashboardHomeClient.tsx](src/components/contributor/dashboard/DashboardHomeClient.tsx) — complete Figma rewrite:
  - **Glass header**: contributor avatar + name + computed **involvement badge** (Seed/Shepherd/Pillar/Beacon from real signals) + settings icon link
  - **4-stat cards**: Connected (RSVPs), Considering, Events, Places — coloured values (gold / purple / green / blue)
  - **4 in-page tabs** (client state, not routing): Overview / Events / Messages / Tools
- **Overview tab**: recharts `BarChart` (7-day connects + views from `contributor_analytics`, auto-labelled Mon–Sun) + colour legend; recent activity feed (coloured icon rows with timeAgo); "View Public Profile" gold CTA; full analytics link tile
- **Events tab**: Create event CTA; event cover-photo cards (category badge overlay, RSVP/consider stats, View/Edit/Broadcast action row); places mini-list; "Broadcast" button pre-fills the entity in the Tools tab
- **Messages tab**: lazy-fetches top-3 conversations from `/api/conversations` on tab open (org ✦ badge, unread dot, timeAgo); "View All Messages" link to `/messages`
- **Tools tab**: broadcast composer (entity dropdown → events + places; char counter; wired to existing `/api/contributor/[handle]/broadcasts`; success state + "Send Another"); 6 tool tiles linking to sub-pages (Create Event / Add Place / Volunteer Manager / Analytics / Team / Planning)

### Dashboard nav reskin
- [DashboardNav.tsx](src/components/contributor/dashboard/DashboardNav.tsx) — glass backdrop, Playfair heading, gold active-tab underline, compact admin pill

### Data fetching expanded
- [page.tsx](src/app/c/[slug]/dashboard/page.tsx) — now fetches: `avatar_url`, full events list (with rsvp + consider counts), places list, 7-day weekly analytics (rsvps + views), involvement signals; computes involvement level server-side

### Dependency added
- `recharts ^3.8.1` for the weekly bar chart

---

## 2-prev. What just shipped — Figma UI Phase 3 (Personal surfaces) ✅ (2026-06-04)

Commit **`afc18ee`**. No DB migrations — next migration # still **130**. Suite **816/816** · tsc 0 · lint clean · vibe-security CLEAN.
Working log: `.claude/sessions/phase3-personal-surfaces.md`.

### Messages reskin
- [MessagesPageClient.tsx](src/components/messaging/MessagesPageClient.tsx) — Figma split-panel: desktop shows conversation list (search, org ✦ badge, unread count) + inline ChatView; mobile shows list only (clicking navigates to `/messages/[id]`).
- [ChatView.tsx](src/components/messaging/ChatView.tsx) — glass bubbles reskin: dark `bg-foreground text-background rounded-br-sm` for sent, `glass border border-white/60 rounded-bl-sm` for received; active dot in header; `showBack/onBack` props.
- `messages/page.tsx` / `messages/[id]/page.tsx` — no more `PageHeader` chrome. `[id]` route kept for mobile threads and deep links.
- Org ✦ badge in conversation list wired to real `is_contributor` flag (conversations API now joins `contributor_status`).

### Notifications
- [NotificationsPageClient.tsx](src/components/notifications/NotificationsPageClient.tsx) — replaced `ComingSoon`. Bell header + unread count, filter chips (All / Broadcasts / Messages / Friends / Convince / Events), typed icon rows with photo/badge overlay, mark-all-read, deep-link routing via `data.url` (relative paths only), realtime subscription filtered to `user_id`.

### Settings
- [SettingsPageClient.tsx](src/components/settings/SettingsPageClient.tsx) — replaced `ComingSoon`. Avatar upload (`/api/avatar`), name/bio (save button), discoverable toggle (immediate), notification prefs (auto-save per toggle via `/api/notifications/preferences`), interests chips (17 event categories), quick-filters ≤5 (saves to `profiles.preferences.quick_panel_ids` + syncs localStorage so map updates instantly), weekly contribution card (citizens only), profile sharing copy.

### Types updated
- `NotificationType` union: 10 new types from Phase 3+ migrations (`dm_received`, `team_invite`, `suggestion_response`, etc.)
- `ConversationPreview.other_user.is_contributor` — org badge flag
- `Preferences.quick_panel_ids`, `Preferences.interests` — explicit typed fields
- `Profile.handle`, `Profile.discoverable` — fields added to type (existed in DB since migration 107)

---

## 2-prev. What just shipped — Removed old SidePanel drawer; detail views go full-page (Figma) ✅ (2026-06-04)

Commit `9b9a092`. **No DB migrations — next migration # still 130.** Suite **816/816** · tsc 0 · lint clean.

- **Removed:** `src/app/@panel/**` (all 12 intercept routes), `SidePanel.tsx`, `lib/map/panelBus.ts`,
  and the parallel `panel` slot in `layout.tsx`. `EventsView` dropped the dead `panelBus`
  subscription (kept `closeDetail` for the inline Figma preview cards). Stale `@panel`/drawer
  comments scrubbed (EventMap, events/loading, detail servers, resolveSlug).
- **Full-page wrappers:** `events/[id]`, `places/[id]` (also dropped a redundant double glass-panel +
  Suspense), `c/[slug]`, `profile/[id]` no longer render the old `PageHeader` chrome. New
  [BackButton.tsx](src/components/ui/BackButton.tsx) (Figma's `ArrowLeft` glass circle) added to the
  Event/Place/Contributor detail heroes + a light variant atop the citizen profile body.
- **Old-UI cleanup catalogue:** [docs/OLD_UI_ARTIFACTS.md](docs/OLD_UI_ARTIFACTS.md) created — tracks
  the remaining old artifacts to **delete at the END of the transformation** (PageHeader — still used by
  admin/forms/messages; old search bar; old "Citizen Central" logo; old burger; MessagesPanel bus
  slide-over). Per founder: replace-then-delete, never ad-hoc mid-phase.
- Test fix: `EventDetailContent.test.tsx` now mocks `next/navigation` (BackButton uses `useRouter`).

---

## 2-prev2. What just shipped — Sticky sidebar + Figma UI Phase 2 (Detail surfaces) ✅ COMPLETE (2026-06-04)

This session shipped a nav refinement **and all of Phase 2**. Four commits on main, each
fully gated (tsc 0 · lint clean · vibe-security clean) and pushed. Final suite: **816/816**
(95 files, +5 from the new involvement-proxy test). **No DB migrations — next migration # still 130.**
Working log (gitignored): `.claude/sessions/sticky-sidenav-and-phase2.md`.

### Batch A — Sticky icon-rail sidebar — commit `ace0906`
- Founder changed the locked Phase-0 nav decision: the desktop sidebar no longer folds away to
  a crown button on collapse — it now collapses to a **sticky 72px icon-only rail** (`w-64` ↔
  `w-[4.5rem]`) with a bottom chevron toggle, hover tooltips, and corner badge dots. Pulled
  straight from the adjusted Figma `Root.tsx` (sibling repo `Christiancommunitymapapp` @ `193fd45`,
  which I pulled this session). [AppShell.tsx](src/components/ui/AppShell.tsx) rewritten; crown-reopen
  removed; `--cc-sidebar-w` content offset = 72px when collapsed. Mobile bottom nav + category pills untouched.
- **Role surfaces noted for FUTURE phases** (not built) in [FIGMA_FULL_UI_PLAN.md](docs/FIGMA_FULL_UI_PLAN.md):
  `UserContext`, `ProfilePanel` ("profile button in nav and map"), `AdminDashboard`, role-gated nav —
  each mapped to its phase, with a VISION note that real roles come from Supabase, never a client toggle.

### Phase 2a — EventProfile reskin — commit `dc673bd`
- [EventDetailContent.tsx](src/components/events/EventDetailContent.tsx) (shared by full `/events/[id]`
  **and** the `@panel` drawer) restructured into the Figma layout: cover hero + scrim + HAPPENING-NOW
  badge + category-hex/Volunteer badges + title/organiser overlay → RSVP action block → Date/Time/Location
  cards → **About / Gallery / Updates tabs**. ALL wired features preserved + re-dressed. Omitted Figma's
  considering/upcoming-dates stats (no real data for single events — VISION honesty).

### Phase 2b — PlaceProfile reskin — commit `310c28d`
- Split into [PlaceDetailServer.tsx](src/components/places/PlaceDetailServer.tsx) (fetch) → new client
  [PlaceDetailContent.tsx](src/components/places/PlaceDetailContent.tsx) (Figma layout, About/Events/Gallery
  tabs), mirroring the Event pattern. Omitted Figma "Hours" (no field) → real Followers + Rating stats.
  Category badge uses real `categories.color`/`emoji`. Events tab = organiser's upcoming + past events.

### Phase 2c — ContributorProfile reskin + involvement proxy — commit `e6e9019`
- [ContributorPublicProfile.tsx](src/components/contributor/ContributorPublicProfile.tsx) (the
  `/c/[slug]` + `/profile/[id]` contributor surface) restructured to Figma: cover hero, overlapping
  header card (logo + name + **involvement badge** + Contributor chip + kind), Followers/Events/Places
  stats, action row, **About / Events / Places / Team tabs**. Every real section kept + re-dressed.
- New [involvement.ts](src/lib/contributors/involvement.ts) — documented **computed proxy** (Seed/Shepherd/
  Pillar/Beacon) from real public signals (followers + events + places + team; events/places weighted 5×),
  unit-tested ([involvement.test.ts](src/__tests__/lib/involvement.test.ts)). Never stored/fabricated; the
  smallest contributor still gets an honest Seed. Added a real Places fetch (by `created_by`) in
  [ProfileDetailServer.tsx](src/components/profile/ProfileDetailServer.tsx). Figma "Friends" tab → About
  (no collab data). Citizen `/profile/[id]` body left as-is — Figma defines no citizen profile; not invented.

### NEXT → Phase 3 (Personal surfaces) — see [docs/FIGMA_FULL_UI_PLAN.md](docs/FIGMA_FULL_UI_PLAN.md):
- **Messages** (glass bubbles, convo list, thread, empty state) on our messaging backend — Figma `pages/Messages.tsx`.
- **Notifications** (filter chips, rows, mark-all-read, deep-links) on our notifications — Figma `pages/Notifications.tsx`.
- **Settings** (profile, privacy, notif prefs, interests, quick-filters ≤5, sharing) — Figma `pages/Settings.tsx`.
- Carry-over (deferred): organiser row (avatar + name → profile) on the map `EventPreviewCard` — needs
  creator data plumbed through `EventsView`.

### ⚠️ Uncommitted (not ours, pre-existing): `package.json` + `package-lock.json` (`@vercel/speed-insights`).
Left unstaged across all four commits this session, as noted since the Phase 1 incident.

---

## 2-prev. Previously shipped — Figma UI re-design: Phase 1 (Map) ✅ COMPLETE (2026-06-04)

Phase 1 of the Figma full-UI re-design is **merged to main**. The whole map surface
(`/events` → `EventsView.tsx` + `EventMap.tsx` + `lib/map/markers.ts` + `components/map/glass/`)
now wears the Figma "Glassmorphism Community Map" look; every control was adapted or removed
(founder **OVERRIDING DIRECTIVE** — nothing left in the old visual style). Durable plan:
[`docs/FIGMA_FULL_UI_PLAN.md`](docs/FIGMA_FULL_UI_PLAN.md) (7 phases, 0–6). Working log (gitignored):
`.claude/sessions/figma-full-ui-adaptation.md`. **No DB migrations in Phase 1 — next migration # still 130.**

### What shipped
- **Quick-filter pill row** (horizontal, under the header): reuses `visibleQuickItems` +
  `toggleQuickAccess` (full event+place filtering + the bottom card panel are preserved; only the
  old *vertical* quick-access column was retired). Active pill = category-colour fill + scale-up.
- **"For me" pill** — a thin **rainbow-outlined** pill at the head of the pill row
  (padding-box/border-box gradient), toggles the personalisation hard-filter; replaced the old
  floating mid-screen pill.
- **Pin selection** — `EventMap` tracks `selectedEventId`/`selectedPlaceId` → `.cc-marker-selected`
  (scale + category-gradient fill + white ring for events; scale + tinted glow for places) plus a
  glass `.cc-marker-label` tooltip (set via `textContent` — no markup injection). Refined live
  pulse (double ring) + red `.cc-marker-live-badge` (markers.ts `appendLiveBadge`) matching the
  legend's "Live now".
- **Header** (`GlassMapHeader`) — Figma top bar: search row is `[search] [Filters tile] [avatar]`.
  Avatar → `/profile` (or `/login`); Filters tile opens the bottom-sheet + shows a `filterCount`
  badge. Brand + tagline + bell + personalise + calendar KEPT in the header. Old Filters/Layers
  pill row removed.
- **Filters bottom-sheet** (`MapFiltersPanel` rewritten) — slide-up over a dimmed backdrop:
  category GRID with live per-category counts, Weekends-only chip, and the map **layers folded in**
  (Impact Glow / Activity Pulse / Connections). Fixes categories being hidden behind the pills.
  `MapLayersPanel.tsx` DELETED.
- **FABs** — locate/compass re-dressed to the `cc-glass` token (no +/- zoom).
- **Legacy bottom search REMOVED** — −400 lines of disabled dead code + its autocomplete machinery.
  Orgs still discoverable via the header search (AI ranker + `GlassSearchResults`). `OrgSearchPanel`
  (pg_trgm fuzzy org search) KEPT in-tree with its test for a future header search mode.
- **Preview cards** (`EventPreviewCard`/`PlacePreviewCard`) — Figma cover treatment: title over the
  photo behind a gradient scrim, solid category badge, LIVE badge on live events, verified check on
  the place title overlay. Kept the wired 5-action row + real-data body.
- **Map Key legend** (earlier in Phase 1) — bottom-left glass card (Live / Event / Place).

### Commits (now on main): `88fcf29`, `457c81b`, `3aa226e`, `df076f1`, `e251ec6` (+ docs).
### Quality: tsc 0 · full suite **811/811** (94 files) · lint clean · vibe-security clean.

### ⚠️ Incident this phase (resolved): a parallel session destructively rewrote the header — stripped
the brand, crammed calendar/burger/layers into the avatar drawer, floated the pills mid-screen. It
was reverted to the last good commit; the shipped Phase 1 above is the correct, founder-approved state.
Two unrelated working-tree changes were left uncommitted (not Phase 1, not mine): the
`@vercel/speed-insights` dependency in `package.json`/lock.

### NEXT → Phase 2 (Detail surfaces) — see [`docs/FIGMA_FULL_UI_PLAN.md`](docs/FIGMA_FULL_UI_PLAN.md):
- EventProfile + PlaceProfile reskin (full page + `@panel` drawer variants), real data.
- ContributorProfile reskin + involvement-level badge as a **computed proxy** (no fabricated numbers).
- Carry-over from Phase 1: add Figma's **organiser row** (avatar + name → profile) to
  `EventPreviewCard` — needs creator name/avatar passed into the card (trivial once Phase 2 has
  contributor data in hand).

---

## 2-prev. What just shipped — Notification matrix Batches 1–4 ✅ COMPLETE (2026-06-02)

All 4 remaining notification-matrix features shipped, one batch each through the full
quality gate + push. **Price field skipped entirely** (events have no price column).
The notification matrix is now fully implemented. Next migration number: **130**.

### Batch 4 — Map update bubbles — commit `9ac16c5` (latest, FINAL matrix item)
- **Migration 129** (applied live): `map_bubbles(event_id, body≤160,
  source∈{event_update,broadcast}, created_at, expires_at default now()+24h)` +
  `bubble_dismissals(bubble_id, user_id)` PK. RLS: bubbles public-readable only while
  `expires_at > now()` (no client writes); dismissals own-row only. AFTER-INSERT SECURITY
  DEFINER triggers `tg_bubble_from_event_update` / `tg_bubble_from_broadcast` (event-only)
  auto-create a snippet bubble on every event update / event broadcast — both trigger fns
  have EXECUTE **revoked** from public/anon/authenticated (REST-RPC hardening). SECURITY
  DEFINER `get_active_map_bubbles()` (anon+authenticated) returns live, non-dismissed
  bubbles (anon callers get all live); `dismiss_map_bubble(uuid)` (authenticated) records a
  per-user dismissal idempotently.
- POST `/api/map/bubbles/[id]/dismiss` (auth + UUID + rate-limit → RPC). `createBubbleEl` +
  `BUBBLE_MIN_ZOOM=12` in `markers.ts` (escapeHtml-sanitised speech bubble + dismiss ×).
  `.cc-bubble` CSS in globals.css. EventsView fetches via `rpc("get_active_map_bubbles")`,
  keeps one bubble per event, passes `bubbles` + `onDismissBubble` to EventMap, which renders
  an **isolated** bubble marker layer (separate ref + own zoom listener, not entangled with
  marker deconfliction), anchored above each event, revealed z12+. 4-case dismiss route test;
  EventsView test mock gained `rpc`.
- Gates: tsc 0, vitest **813/813** (94 files), lint clean. Advisors 110 WARN / 53 auth-secdef
  (+3 vs baseline 107 — the 3 intentional SECURITY DEFINER RPCs; the 4 would-be trigger-fn
  exposures were hardened away).

### Batch 3 — Anonymous broadcast reactions — commit `a307bad`
- **Migration 128** (applied live): aggregate-only `broadcast_reactions(broadcast_id,
  emoji, count)` — PK `(broadcast_id, emoji)`, **no user id column** (identity-free by
  construction), five-emoji check constraint, RLS SELECT-public + no write policy.
  SECURITY DEFINER `increment_broadcast_reaction(p_broadcast_id, p_emoji)` validates
  auth + emoji whitelist + live broadcast, atomic `on conflict … count+1`.
- New `src/lib/broadcasts.ts` is the single source for the five emoji (🙏❤️🎉🙌🔥),
  shared by table/RPC/route/UI. POST `/api/broadcasts/[id]/react` (auth + UUID +
  rate-limit + emoji guard → RPC; 404 on missing broadcast). New `BroadcastReactions`
  client component (optimistic, rollback) wired into `OrgBroadcastList` behind a
  `showReactions` prop — event views only (`EventDetailContent` + `/e/[id]`, both server
  fetchers attach per-broadcast counts). 7-case route test.
- Gates: tsc 0, vitest **809/809** (93 files), lint clean. Advisors 107 WARN / 51
  auth-secdef (+1 = the new RPC, accepted SECURITY DEFINER pattern).

### Batch 2 — Material-change push filtering — commit `f35535a`
- **Migration 127** (applied live): `event_updates.is_material boolean default false`;
  `notify_event_field_changes()` now also watches `volunteer_openings` and stamps every
  synthetic field-change row `is_material = true`; trigger recreated to fire on
  `volunteer_openings` too. Mirrored into `supabase/schema.sql`.
- **`_shared/push.ts`**: new `skipPush` flag → inserts in-app rows then returns before FCM.
- **`notify-event-update` (redeployed v2, `verify_jwt=false`)**: reads `record.is_material`,
  splits attending vs considering RSVPs, delivers **in-app** to all pref-allowed recipients
  (attending+considering minus per-event opt-outs), delivers **push** to all only when
  material, otherwise attending only. Two `sendNotifications` calls (skipPush, then skipInApp).
- Cancellations untouched (separate `notify-event-cancelled`). Gates: tsc 0, vitest 802/802,
  lint clean. Advisors 106 WARN / 50 auth-secdef = identical to baseline (no new findings).

### Batch 1 — Per-event opt-out for RSVP'd/considering users — commit `6b0775b`
- **Migration 126** (applied live): `rsvps.notify_updates boolean default true` + partial
  muted index + SECURITY DEFINER RPC `set_rsvp_notify_updates(p_event_id, p_notify)`
  (column-scoped to caller's own row; no broad UPDATE policy).
- `PATCH /api/events/[id]/notify-preference` (auth + UUID + rate-limit + boolean → RPC; 409
  when no RSVP). `EventNotifyToggle` switch under RSVPButton. `EventDetailServer` selects
  `notify_updates`. Edge fns `notify-event-update` (deployed **v1 — never deployed before!**)
  and `notify-broadcast` (v4) exclude `notify_updates=false` rows. 6-case route test.

### Next batches (queued, not started)
- **Notification matrix is COMPLETE** — all 4 items shipped (Batches 1–4). No queued
  notification-matrix work remains.

> **Verify webhook wiring (carried over, still unverified):** confirm the `event_updates`
> INSERT DB webhook actually targets the `notify-event-update` function (it was deployed for
> the first time in Batch 1). Also note: Batch 4 now adds a DB trigger on the same
> `event_updates` INSERT (bubble creation) — independent of the webhook, so it works
> regardless, but the push webhook itself remains unverified.

---

## 2b. Earlier — Notification batch DEPLOYED end-to-end (2026-06-02)

**The notification batch is now live in Supabase, not just in code.** The prior session
left the migrations/cron/edge functions undeployed; this session applied and verified them.

### Deployment completion (this session)
- **Migrations applied to live:** `122` (storage bucket size/MIME limits), `123`
  (weekly digest schedule + `muted_source_ids` comment), `124` (enable `pg_net`),
  `125` (register the weekly `contributor-digest` cron with **inline** function URL +
  anon key — `123`'s GUC-based path always short-circuits because `ALTER DATABASE` is
  denied to the management role on this project).
- **`pg_net` enabled** so Postgres cron can issue the outbound HTTP POST.
- **`send-contributor-digest` edge function deployed** (v1, ACTIVE, `verify_jwt=true`).
- **Weekly digest cron is registered and active:** `contributor-digest`, schedule
  `0 6 * * 1` (Mon 06:00 UTC / 08:00 SAST), `active=true`. **Smoke-tested end-to-end** via
  `net.http_post` → gateway accepted the anon JWT → function returned `200 {"digests":0}`
  (correctly found no reportable 7-day activity).
- **`notify-broadcast` redeployed** (v3, ACTIVE, `verify_jwt=false`) — the previously
  deployed v2 was stale: it lacked source-mute filtering and only notified `attending`
  (not `considering`). The live version now matches the repo source.
- **Security advisors re-run:** the only NEW advisory is `extension_in_public` (WARN) for
  `pg_net`, which is **unfixable** (pg_net does not support `SET SCHEMA`) and is a known,
  accepted low-severity exception common to all Supabase projects using pg_net. No new
  ERROR-level findings.

> **Note on the inline anon key (migration 125):** the anon/publishable key is committed
> inline in the cron command. This is safe under the platform's RLS-first model — RLS, not
> key secrecy, enforces access. The key only lets the Supabase gateway accept the scheduled
> invocation; the edge function runs with its own service-role key from its environment.

---

### Feature work (prior session) — Notification clarity, weekly contributor digest, and source mutes (2026-06-01)

**Notification decisions from the feature-clarity session are now encoded in docs and backend fan-out rules.**
Feature commit: **`05f9c97`** (`feat(notifications): apply weekly digest and mute rules`).

### Product decisions captured
- `docs/feature-clarity/notifications.md` is now the notification source of truth:
  contributor/admin digests only, weekly analytics cadence, material-event push rules,
  per-user map-bubble dismissal, contributor/event mute direction, admin push for
  moderation/security items, and anonymous broadcast reactions.
- `docs/feature-clarity/messaging.md` no longer promises 5-times-daily contributor/admin
  digests; it now references weekly analytics summaries.

### Implementation
- `send-contributor-digest` now uses a 7-day window and writes titled/body notifications
  summarising connects, considers, RSVP cancellations, followers, place follows,
  volunteer applications, DMs, and comments.
- Migration `123_weekly_contributor_digest_schedule.sql` unschedules any legacy
  `contributor-digest` cron and re-registers it weekly (`0 6 * * 1`) only when
  `pg_cron`, `pg_net`, and the Supabase function URL/anon-key GUCs are available.
- `muted_source_ids` is now validated through `/api/notifications/preferences` and typed
  in `src/types/db.ts`.
- Broadcast notification fan-out respects source mutes:
  event broadcasts check event mutes only; place broadcasts check place and org mutes.
- Broadcast-flood admin alerts now go through `sendNotifications`, so admins with instant
  push enabled can receive push as well as in-app rows.

### Verification
- `npx.cmd tsc --noEmit` -> 0 errors.
- `npx.cmd vitest run` -> **794/794 tests** across 91 files.
- `npx.cmd next lint --dir src` -> clean.
- Focused rerun after final edge-function count cleanup:
  `npx.cmd vitest run src/__tests__/api/notifications/preferences/route.test.ts src/__tests__/lib/notifications/sourceMutes.test.ts src/__tests__/api/contributor-broadcasts.test.ts`
  -> 22/22 tests.
- Supabase advisors were **not runnable** in the prior session; this session ran them via
  the Supabase MCP — see "Deployment completion" above (only the known `pg_net`
  `extension_in_public` WARN is new).

### Security notes
- New preference writes are authenticated, rate-limited, UUID-validated, bounded to 100
  source mutes, and update only the caller's own `profiles` row through the existing
  RLS-scoped server client.
- Broadcast fan-out reads mute state through the server/service path and fails open on
  lookup errors so notification delivery does not silently disappear during DB issues.
- No service-role key was introduced into client code.

### Follow-ups
- The weekly contributor digest cron is now registered and active (see "Deployment
  completion"); it fires Mondays 06:00 UTC. `pg_net` + the inline cron (migration 125)
  replace the GUC requirement.
- Consider-to-connect conversions are documented as a desired digest metric, but there is
  no direct conversion timestamp in the current RSVP model. The current digest reports
  connects and considers separately.
- UI controls for event/contributor/place mutes can now be built on top of
  `muted_source_ids`.

---

## 2-prev. Previously shipped - Map prominence tiering (zoom + prominence layers) (2026-06-01)

**Markers now reveal in tiers (dot → mid → full → photo) driven by `zoom + a prominence
score`, the way Google Maps layers POIs — not zoom alone.** `tsc 0`, lint clean,
**782/782 tests** (88 files, +20 prominence unit tests). Migration 119 applied to live;
feature committed (see git note below).

### The model (hybrid, founder-chosen)
- **Server (heavy, precomputed):** `events.prominence_base` + `places.prominence_base`
  ∈ [0,1] — a saturating-log popularity score (`raw = Σ wᵢ·ln(1+countᵢ)`, `base =
  raw/(raw+K)`; row-independent so one viral item can't bury the rest). Events:
  rsvps/comments/views(90d). Places: follows/reviews. Migration 119
  ([119_map_prominence.sql](supabase/migrations/119_map_prominence.sql)):
  `recompute_map_prominence()` SECURITY-DEFINER, service-only, + a guarded daily
  pg_cron schedule + one-time backfill. Flows to the client free via the existing
  `events`/`places` `select("*")` in [events/page.tsx](src/app/events/page.tsx).
- **Client (live):** [src/lib/map/prominence.ts](src/lib/map/prominence.ts) folds in
  **time-proximity** (dominant, W_TIME 0.6) + **newcomer boost** (decays over 7d) on top
  of the base (W_POP 0.4). `computeProminence` + `markerTier(zoom, prominence)`, pure +
  unit-tested ([prominence.test.ts](src/__tests__/lib/map/prominence.test.ts), 20 tests).
- **Fairness floor (VISION "don't bury the small"):** prominence only sets *tier* and
  *collision/photo priority* — it NEVER hides. Every item is always ≥ a dot; a
  prominence-0 marker still reaches full at MID_MODE_ZOOM. Newcomer boost + time-dominant
  weighting lift fresh/small items.

### Wiring ([EventMap.tsx](src/components/map/EventMap.tsx))
- `DOT_MODE_ZOOM`/`MID_MODE_ZOOM` moved into prominence.ts (single source of truth); tier
  is now per-marker (`markerTier`) — high-prominence markers reveal a couple zoom levels
  earlier (Google-style promotion).
- **Photo tier** — top-`PHOTO_TIER_CAP` (4) most-prominent *full-tier* markers in the
  viewport get a larger thumbnail overlay (`.cc-marker-photo` + `.cc-marker-photo-img`,
  56px), events AND places, recomputed on settle (zoomend/moveend). Reversible overlay
  (doesn't fight per-zoom inline sizing); falls back to the pin + remembers failure if the
  image 404s. CSS in [globals.css](src/app/globals.css).
- **Collision by prominence** — `runDeconfliction` weights the force-push by
  `0.5 + prominence` so the heavier (more prominent) marker yields less. Equal-prominence
  behaviour is mathematically identical to before (no regression).

### pg_cron ENABLED — refresh now automated (migration 120)
Founder approved "the cron". Migration 120
([120_enable_pg_cron.sql](supabase/migrations/120_enable_pg_cron.sql)) ran
`CREATE EXTENSION pg_cron` (was not installed) and registered
**`map-prominence-recompute`** (daily 02:45 UTC, verified `active=true`). The refresh is
DB-internal — **zero app/map-runtime cost** (the lightest path). Backfill values sane:
22/191 events scored, 2/40 places, max event base 0.36.
- **Gotcha fixed:** `cron.unschedule(name)` RAISES if the job is absent, so it must be
  guarded by `IF EXISTS (SELECT 1 FROM cron.job WHERE jobname=…)` — NOT the `WHERE TRUE`
  the prior migrations used (those only worked because their outer pg_extension guard meant
  the unschedule never ran while cron was off).
- **Dormant crons revived — migration 121**
  ([121_register_dormant_crons.sql](supabase/migrations/121_register_dormant_crons.sql)).
  All 5 DB-internal jobs from 107/110/116/117 are now registered + `active=true`:
  `messaging-purge-60d` (daily 03:00), `contributor-analytics-daily` (02:15),
  `contributor-analytics-purge` (Sun 03:00), `contributor-analytics-vision-snapshot`
  (1 Jan 03:30), `search-term-stats-purge` (Sun 03:30). Verified the aggregator runs
  clean (manual `aggregate_contributor_analytics_daily()` → 3 rows, no error). cron.job
  now lists 6 active jobs total (incl. map-prominence-recompute).
- **STILL EXCLUDED — `contributor-digest` (108):** uses `net.http_post` but **pg_net is
  NOT installed**, and its two GUCs (`app.supabase_functions_url`/`app.supabase_anon_key`)
  are **unset**; it also has user-facing side effects (digests 5×/day). Reviving needs:
  (1) enable `pg_net`, (2) `ALTER DATABASE … SET app.supabase_functions_url/anon_key`,
  (3) a product decision. Left for an explicitly-approved follow-up.

### Phase 5 — DONE, reframed as a performance pass (founder priority: speed/lightweight)
The original cosmetic Phase 5 was dropped on purpose: dot **desaturation contradicts the
documented founder preference for crisp/"illuminous" markers** (dimming was already removed
once for looking dull — see `markers.ts` + the mid-tier `opacity:1` revert), and a
fractional-zoom fade needs a per-frame zoom listener that risks the pan smoothness. Instead
Phase 5 hardened the real hot path:
- **Deconfliction now skips off-screen markers.** `runDeconfliction` filtered `n` to only
  on-screen markers (`display:none`/`visibility:hidden` excluded) before the O(n²) force
  loop + projection. Off-screen markers can't visually overlap, so this is a pure win that
  **grows with zoom and dataset size** — the scaling lever as events/places multiply.
- **Early-out** when <2 on-screen markers (resets the lone offset, skips the loop).
- Equal-prominence collision behaviour remains mathematically identical (no visual regression).

### git — all committed + pushed
**origin/main @ `8845eb7`** (working tree clean). This session's commits:
- `9267510` — tiering + photo tier wiring (bulk also swept into founder commit `3fba76e`).
- `a5c3bf9` — Phase 5 deconfliction perf + migration 120 (enable pg_cron).
- `8845eb7` — migration 121 (re-register dormant crons).

Migrations applied to live: **119** (prominence base), **120** (enable pg_cron),
**121** (register dormant jobs). Final gate: `tsc 0` · **782/782 tests** · lint clean ·
vibe-security CLEAN.

> ⚠️ **Repo git-identity hook:** commits are rejected unless
> `git config --local user.name "Citizens Network"` and
> `user.email "citizensnetworkpbo@gmail.com"` are set. Set them once per clone.

---

## 2-prev. Previously shipped — Image-upload RLS fix + marker fill + panel-nav (2026-06-01)

**Fixed the long-standing "new row violates row-level security policy" on event/place image
uploads, the square-in-circle map marker, and the "X reopens the panel / surfaces get confused"
navigation bug.** `tsc 0`, lint clean, **762/762 tests** (87 files). Build-green; founder to
browser-test then it's ready (committed this session).

### Root cause (durable — see `memory/storage-uploads-must-be-server-side.md`)
The **browser** Supabase client (`@supabase/ssr`) has an unreliable JWT **at the Storage endpoint** —
uploads arrive as `anon` → bucket RLS denies them. PostgREST/DB writes from the same client are fine;
only Storage fails. Avatars already dodged this via the server route `/api/avatar`. Event/place
covers + galleries still uploaded client-side → failed. Live storage INSERT policy verified correct
via MCP (`foldername[1] = auth.uid() OR is_admin()`); impersonation test returned `path_ok = true`.

### The fix — all binary uploads now go server-side
- **New `POST /api/media/upload`** ([route.ts](src/app/api/media/upload/route.ts)) — auth + per-user
  `RATE_LIMITS.heavy` + `validateMediaFile` (image/video) + **service-role admin-client upload**.
  Path is server-built and always `${user.id}`-prefixed; `scope` enum picks the bucket
  (`event-images`/`place-images`) so callers can't write to arbitrary buckets or escape their folder.
- **Client helper** [uploadMedia.ts](src/lib/uploadMedia.ts) (`uploadMediaFile`) — posts FormData,
  returns `{ url, kind } | { error }`.
- Rewired the 4 cover sites (`EventForm`, `EditEventForm`, `PlaceForm`, `EditPlaceForm`) + the shared
  gallery lib [mediaUpload.ts](src/lib/mediaUpload.ts) to the route. Metadata rows
  (`event_photos`/`place_media`) still insert client-side under the user's RLS session (ownership
  enforced there — no regression). Updated `placeMedia.test.ts` to the server-route path.

### Marker square-in-circle — FIXED
[markers.ts](src/lib/map/markers.ts) logo variant img `80%/contain` → **`100%/cover`** so the image
fills the gold ring (flat sides touch the border). Profile variant already filled.

### Panel-nav "X reopens the panel / surfaces confused" — FIXED + mapped
- Cause: the **View** action (`handleQuickAction` case `"view"`, `EventsView.tsx`) pushed the
  `/events/[id]` SidePanel route but left `selectedEvent` set, so the inline glass card (z-1200)
  stayed mounted under the SidePanel (z-1700); closing one revealed the other. **Fix:** `"view"` now
  clears `selectedEvent`/`selectedPlace` before `router.push`.
- Wrote **[docs/NAVIGATION_SURFACES.md](docs/NAVIGATION_SURFACES.md)** (the founder-requested map of
  every overlay over the map: state-driven glass cards vs URL-driven `@panel` SidePanel, z-index,
  open/close triggers, collisions).
- **Nav hardening — APPLIED** (commit `c41d4d8`): new singleton `src/lib/map/panelBus.ts` — SidePanel
  **X** publishes `publishPanelClosed()`, `EventsView` subscribes → `closeDetail()` (surfaces can't
  desync on deep-linked/nested panels). SidePanel `animateThen` now hands off on the drawer's real
  `transform` `transitionend` (guarded 400ms fallback) instead of a fixed 300ms timer — no more
  navigating mid-animation / "stuck" feel.

### Not a bug (confirmed)
"All my events adopted my new profile photo" — expected: profile/logo markers pull the creator's
avatar. Working as designed.

---

## 2-prev. Previously shipped — Figma glassmorphism map UX migration (Batches A–C)

**Reskinned the main map (`/events`, `EventsView.tsx`) into the Figma "Glassmorphism
Community Map" design, wired to real Supabase data, over 3 batches.** Kept the existing
MapLibre map underneath. Build verified by the founder locally (`tsc 0`, lint clean,
`next build` clean). ⚠️ NOT verifiable inside the Cowork sandbox — see "git" note below.

### New glass component layer — `src/components/map/glass/`
- `GlassMapHeader.tsx` — frosted brand header (hex logo + "Citizens Connect / Connecting
  the Kingdom"), integrated search wired to the live `search` filter, Filters/Layers pills.
- `MapFiltersPanel.tsx` — "Filter the Map" glass panel: real `CATEGORY_LABELS` multi-select
  (→ `toggleCategory`) + Weekends-only toggle.
- `MapLayersPanel.tsx` + `mapLayers.ts` — Impact Glow / Activity Pulse / Connections toggles;
  drive marker visuals via `data-layer-*` on the map wrapper (CSS only, no EventMap rewrite).
- `MapStatsFooter.tsx` — bottom pill: Organizations (contributors) / Members (live `profiles`
  count) / Active Projects (events).
- `PlacePreviewCard.tsx` + `EventPreviewCard.tsx` — Figma glass side panels. Event card has the
  5 actions (View/Join/Share/Consider/Visit) wired to `handleQuickAction`.
- `GlassSearchResults.tsx` — glass dropdown under the header search (events/places/orgs), fed by
  the existing AI ranking (`filtered`, `filteredPlaces`, `topContributorMatches`).

### Batch A (safe fixes)
- Quick-select now shows BOTH events + places (panel + map); `placesMode` no longer hides events
  when a quick tool is active.
- Pill relocated above the stats bar, leads with "For me in this area".
- Burger-menu category sections gated off (`showCategorySections=false`) — category filtering now
  lives only in the glass Filters panel.

### Batch B (event panel + inline previews)
- Marker clicks now open the inline glass panels (new `onSelectEvent` prop on `EventMap`; place
  clicks set `selectedPlace` instead of `router.push`) → **removed the redirect-flash** from the
  intercepted `@panel` route. Legacy MapLibre event popup is bypassed when `onSelectEvent` is set.
- `EventPreviewPanel` import removed from `EventsView` (events → `EventPreviewCard`).

### Batch C (markers + navigation + load screen)
- **Navigation/"stuck map" fix** — `SidePanel.tsx` hardened the `inert` logic so a leaked `inert`
  can never freeze the map (root cause of "icons don't appear / events won't open / feels stuck").
  Tags frozen nodes `data-cc-inert-by-panel` + sweeps strays on next open.
- **Markers recoloured** — `lib/map/markers.ts`: events GOLD-ringed, places BLACK; each marker sets
  `--cc-pulse-color` = category hex; `globals.css` Glow/Pulse layers tint via `color-mix` (gold
  fallback, degrades safely).
- **Load screen identified** — it's the intentional `LandingPage` (`/`) `LandingBackdrop` shown for
  ~300ms during the hand-off to `/events`. Not an error.

### VISION
- `VISION.md` (root) created — north star + the Alignment Self-Prompt; wired into `CLAUDE.md` as
  mandatory step 0 (read every run). Founder has since expanded it (scripture, ecosystem, culture).

### Batch C-2 — DONE (2026-05-31): clustering removal + dead-code excision + gold markers
The previously-deferred Batch C items are now shipped (founder asked for "everything remaining"),
build-verified in-sandbox (`tsc --noEmit` → **0 errors**; ESLint clean on all changed files).
- **Clustering/bubbles removed → zoom-reveal.** Deleted `src/lib/map/clustering.ts` and its test
  `src/__tests__/lib/map/clustering.test.ts`. Gutted the entire bubble engine from `EventMap.tsx`
  (geo-cluster refs, expansion/lift state, `updateGeoClusterOpacity`, `expandBubble`/collapse/
  `rebuildGeoClusters`, band tracker, map-click-collapse + Esc recouple + zoom-crossfade handlers,
  `BAND_RANK`). Density now comes only from the kept primitives: **dot-mode (<z7) → mid (z7–10) →
  full (z10+)** + force-deconfliction + viewport culling. `updatePlaceVisibility` simplified to a
  plain zoom-reveal gate (events show at all zooms unless a place-cat filter is active; places
  reveal at `z>=PLACE_ZOOM_MIN`). Removed dead bubble helpers + `createClusterEl` from `markers.ts`
  and `.cc-geo-cluster*` from `globals.css`.
- **Legacy popup + viewport-scope deleted.** Removed the MapLibre event popup entirely (marker
  click now always → `onSelectEvent`/`EventPreviewCard`). Removed the "Search this area" subsystem
  from `EventsView.tsx` (`viewportScoped`/`mapBounds`/`showSearchAreaPill` state, the pan handlers,
  the bbox filters in both memos, the `onMoveEnd`/`onBoundsChange` props); the top pill is now just
  the single **"For me in this area"** variant.
- **Custom event markers gold-themed.** `createCustomMarkerEl` profile/logo/icon variants now use a
  GOLD ring + category/custom `--cc-pulse-color` (matches `createCategoryMarkerEl`).
- **LandingPage hand-off** shortened 300ms → 150ms.
- Residual (non-blocking): `EventMap` still *declares* `onQuickAction`/`rsvpEventIds`/
  `considerEventIds` props (EventsView still passes them) — now unused inside EventMap (were
  popup-only); harmless optional API, candidate for a later tidy.

### Deferred → next session (queued)
- Build the other surfaces from Figma — ready-to-paste prompt at `docs/FIGMA_SURFACES_PROMPT.md`
  (org dashboard, contributor profile, event/place detail, citizen dashboard, messages, auth).
- Working log for this whole effort: `.claude/sessions/figma-map-ux-migration.md` (gitignored).

### ⚠️ git note (important — still applies after Batch C-2)
The Cowork Linux sandbox still reports a **whole-repo CRLF diff** (~660 files show as modified from
line-ending churn alone), so a sandbox commit would be destructive. **Commit/push from the founder's
machine.** New this session: editing certain files through the sandbox intermittently left **trailing
NUL-byte padding** (EventsView.tsx) or a **mid-file truncation** (LandingPage.tsx, restored from git);
both were detected and repaired, and the final `tsc`/ESLint passes confirm the on-disk files are
intact. After pulling these edits, re-run the local quality gate before committing (commands below).

---

## 2-prev. Previously shipped — Optional hardening: `log_search_term` lockdown + real XLSX exports

**Picked up the two non-blocking hardening items from the old §4 backlog** (search-term
poisoning vector + CSV-with-xlsx-MIME fallback). `tsc 0`, lint clean, **790/790 tests**
(88 files, +10 vs Stage L).

### Search-term hardening — Migration 118 ([118_lock_log_search_term_to_service_role.sql](supabase/migrations/118_lock_log_search_term_to_service_role.sql))
- `log_search_term(text)` is now **REVOKEd from anon + authenticated** and **GRANTed to
  `service_role` only**. This removes the documented direct-RPC autocomplete/top-10 poisoning
  vector (anyone with an anon key could previously call it in a loop).
- [ai-search/route.ts](src/app/api/ai-search/route.ts) now invokes it through the
  **service-role admin client** (`createAdminClient`) inside a try/catch fire-and-forget block.
  Because `POST /api/ai-search` is already rate-limited **per-IP and per-user**, that endpoint is
  now the single throttled write path into `search_term_stats`. Search never breaks if the
  service key is absent (logs + continues). Anonymous-search logging behaviour is preserved.
- Read side unchanged: `get_search_autocomplete` stays anon+auth (escaped, read-only),
  `get_top_search_terms` stays authenticated.

### Real XLSX exports — [xlsx.ts](src/lib/analytics/xlsx.ts) (new, zero-dep OOXML writer)
- New `buildXlsx(sheetName, header, rows)` produces a **genuine `.xlsx`** (Content_Types + rels +
  workbook + one worksheet) that Excel/Numbers/Sheets open natively. Replaces the old
  CSV-body-with-xlsx-MIME fallback in **both** export endpoints
  ([analytics export](src/app/api/contributor/[handle]/analytics/export/route.ts) +
  [suggestions export](src/app/api/admin/suggestions/export/route.ts)).
- **Why hand-rolled, not SheetJS:** we only *write*, never parse, so SheetJS's parse-path CVEs
  (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS) don't apply — and the fixed SheetJS
  builds aren't on npm anyway. exceljs would drag a large dep tree for a tiny job. Matches the
  existing zero-dep `csv.ts` philosophy. **(Open to swapping to SheetJS/exceljs if a customer
  needs richer workbooks — flagged for the user.)**
- Implementation: STORED (uncompressed) ZIP + CRC-32 + **inline strings**. Inline strings are
  never evaluated as formulas, so the CSV formula-injection neutraliser is deliberately NOT
  applied on the xlsx path (it would corrupt data); the CSV path keeps `neutraliseFormula`.
  Numbers written as numeric cells via `Number.isFinite` guard.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **790/790 passed** (88 files; +10: 10 xlsx unit tests + 1 ai-search
  admin-log-path test; −1 net from reworking the suggestions xlsx test to assert a real workbook)
- `npx next lint --dir src` → clean
- Sec audit (self): **CLEAN.** Service-role key stays server-side (never shipped to browser);
  xlsx is write-only (no parse-path CVE surface) + XML-escaped + strips illegal control chars;
  export access control/rate-limit/`no-store` unchanged; `workbook.buffer` is full-width
  (`Uint8Array.from`) so no adjacent-memory leak.

### Operator action
None new. (The Stage-L/H backfill below is still the only pending operator step.)

---

## 2-prev. Previously shipped — Stage H follow-ups + Stage L (search term analytics)

**Completed the final two queued items of the contributor-dashboard plan.** This closes out every stage (A–L) plus the deferred Stage H follow-ups. `tsc 0`, lint clean, **780/780 tests** (87 files, +11 vs Stage K).

### Stage H follow-ups — Migration 116 ([116_analytics_sources_and_vision_snapshot.sql](supabase/migrations/116_analytics_sources_and_vision_snapshot.sql))
- **`rsvp_cancellations`** + **`shares`** source-of-truth tables (RLS, indexes). Both populated at the **app layer** (no triggers — a `BEFORE DELETE` trigger on `rsvps` can't tell a user un-RSVP from event-teardown CASCADE).
- **Aggregator v2**: `aggregate_contributor_analytics_daily` now also writes `cancellations` (per event) and `shares` (per event / place / contributor), REPLACE-not-increment like the existing metrics.
- **Vision snapshot wired**: the migration-110 NOTICE stub is rewritten into a real materialiser that builds nested per-contributor rollups (`totals` + `places[]` + `events[]`, A17) into a new **`contributor_analytics_snapshots`** table (A21 — Vision pulls from it; no external HTTP). Yearly cron (Jan 1 03:30 UTC). Param gained `p_year` default; old zero-arg dropped.
- `purge_old_analytics()` extended to trim raw cancellation/share logs at 90 days.

### Stage H wiring (app)
- **`DELETE /api/rsvp`** ([rsvp/route.ts](src/app/api/rsvp/route.ts)) logs `rsvp_cancellations` on a genuine un-RSVP (`.select("id")` guard — never on a no-op delete).
- **`POST /api/shares`** ([shares/route.ts](src/app/api/shares/route.ts)) — best-effort, anon-allowed, rate-limited by user/IP, entity_type allowlist + UUID validation.
- **`logShare`** helper ([logShare.ts](src/lib/analytics/logShare.ts)) wired into `ShareButton` (place), `SocialShareButtons` (event), `ConsiderBadge` (event — native/WhatsApp/copy paths). `EventDetailContent` + `PlaceDetailServer` pass entity props.

### Stage L — Search term analytics — Migration 117 ([117_search_term_analytics.sql](supabase/migrations/117_search_term_analytics.sql))
- **`search_term_stats`** — anonymised `(term, day)` rolling aggregate, **no `user_id`** (A65). **No RLS policies** — access is RPC-only.
- **`log_search_term(text)`** SECURITY DEFINER sanitises server-side; `POST /api/ai-search` fires it best-effort for every search (incl. anonymous).
- **`get_top_search_terms`** (authenticated) → dashboard "Top searches this month" panel (A64) in [AnalyticsDashboardClient.tsx](src/components/contributor/dashboard/AnalyticsDashboardClient.tsx).
- **`get_search_autocomplete`** (anon+auth, A66) merges contributor keywords (ranked first) + popular recent terms, LIKE-metachar-escaped prefix.
- **`GET /api/search/autocomplete`** ([autocomplete/route.ts](src/app/api/search/autocomplete/route.ts)) + a debounced combobox dropdown in the global search bar ([EventsView.tsx](src/components/events/EventsView.tsx)).
- 180-day retention via `purge_old_search_terms()` (weekly cron).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **780/780 passed** (87 files, +11: shares, autocomplete, rsvp-cancellation)
- `npx next lint --dir src` → clean
- Sec audit (self): shares anon-allowed but RLS blocks user-id forgery + polymorphic entity_id only aggregates real owned entities; cancellation log gated by `.select("id")` + `user_id=auth.uid()`; all new RPCs SECURITY DEFINER with clamped inputs + LIKE-escaping; snapshot table read-only RLS, function service-only; search-term inputs sanitised in Postgres (non-XSS). **Accepted residual**: anon `log_search_term` direct-RPC poisoning of autocomplete/top-10 (low-severity, sanitised, curated keywords outrank) — hardening path documented in the plan DECISIONS log.

### Operator action (post-deploy)
After applying migrations **116 + 117**: run from psql with service_role to hydrate the last 90 days (now incl. cancellations/shares for already-logged rows):
```sql
SELECT * FROM public.backfill_contributor_analytics(90);
```

---

## 2-prev. Previously shipped — Stage K: Handle change rule (1/30d + admin override)

**Completed Stage K of the contributor-dashboard plan**: contributor `handle` (slug) is now editable from the Settings dashboard with a server-enforced 30-day cooldown, an admin-only override that bypasses the cooldown via SECURITY DEFINER RPC, and warning copy + a two-click confirm gate on the UI.

### Migration 115 ([115_contributor_slug_change.sql](supabase/migrations/115_contributor_slug_change.sql))
- `admin_change_contributor_slug(p_contributor_id uuid, p_new_slug text, p_reason text)` SECURITY DEFINER RPC. Server-side admin role re-check (defence-in-depth — SECURITY DEFINER alone is not enough), server-side regex format guard (`^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$`), uniqueness via existing `profiles_contributor_slug_key` partial index translated to a clean `slug_taken` (23505) exception. Writes `admin_actions` (canonical admin trail) AND `activity_log` (admin-on-behalf attribution) atomically with the UPDATE. REVOKE from anon/public; GRANT to authenticated only.

### Backend ([slug/route.ts](src/app/api/contributor/[handle]/slug/route.ts))
- PATCH `/api/contributor/[handle]/slug` with `{ new_slug, reason? }`.
- Owner path: API enforces 30-day cooldown from `profiles.handle_changed_at`; on success, atomically writes new slug + updates timestamp + records activity via `recordContributorMutation`.
- Admin path: requires non-empty `reason`, delegates to the RPC; Postgres exception codes mapped 23505→409, 42501→403, 22023→400.
- Rate-limited via `RATE_LIMITS.mutation`. UUID/format guard at the API matches the regex inside the RPC so a compromised admin session cannot inject arbitrary strings.
- Per A62: no legacy-handle redirect — old handles stop resolving the instant the write commits. Client hard-navigates to `/c/{new}/dashboard/settings`.

### UI ([SettingsDashboardClient.tsx](src/components/contributor/dashboard/SettingsDashboardClient.tsx) + [settings/page.tsx](src/app/c/[slug]/dashboard/settings/page.tsx))
- New **Public handle** section at the top of Settings (owners and admin-with-grant viewers only).
- Server-computed `handleCooldownDaysRemaining` so the disabled state and the cooldown banner are correct on first paint (no client flash).
- Constrained input (`[a-z0-9-]` only, 40-char cap) with `/c/` prefix decoration. Two-click confirm flow with the exact A61 copy: *"This will break any existing links to your profile. Are you sure?"*
- Admin-with-grant viewers see a reason textarea (required); button label switches to "Override handle".

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **769/769 passed** (84 files, +10 tests vs Stage J)
- `npx next lint --dir src` → clean
- Sec audit (self):
  - RPC SECURITY DEFINER but re-checks admin role inside Postgres; format regex enforced both in RPC and API; UNIQUE INDEX still authoritative for collisions.
  - Owner path can never trigger admin behaviour (`isAdminWithAccess && !isOwner` gate).
  - API rate-limited; reason field control-char stripped and length-capped (500).
  - UI confirm gate; input character allowlist defends against client-side experimentation; redirect uses `encodeURIComponent` even though slug is already constrained.
  - `recordContributorMutation` handles admin-on-behalf attribution automatically when the admin (rather than owner) drives the change.

---

## 2-prev. Previously shipped — Stage J: Suggestion polish + admin inbox + CSV-injection hardening

**Completed Stage J of the contributor-dashboard plan**: admin suggestion inbox UI, dedicated `suggestion_response` notification type, CSV/XLSX export, glass-panel composer polish, and a security-driven fix to CSV formula injection (covers both Stage J's new export and the pre-existing Stage H analytics export).

### Migration 114 ([114_suggestion_response_notification.sql](supabase/migrations/114_suggestion_response_notification.sql))
- Extends `notifications_type_check` to include `suggestion_response`. Replaces the prior hack where the PATCH route reused `contributor_approved` to notify submitters.

### Backend ([suggestions/[id]/route.ts](src/app/api/suggestions/[id]/route.ts))
- Notification insert now uses `type: "suggestion_response"` with `data: { suggestion_id, status }`. No `data.url` field — there is no meaningful destination page for the submitter, and the body conveys the outcome.

### Admin inbox UI ([admin/suggestions/page.tsx](src/app/admin/suggestions/page.tsx) + [SuggestionsManager.tsx](src/components/admin/SuggestionsManager.tsx))
- Mirrors `/admin/reported` UX: status tab nav (Open / In review / Actioned / Declined), server-fetched list capped at 100 rows, client manager component for status updates and inline written response.
- **Origin-safe page-URL rendering** — `page_url` is parsed via `new URL(rawUrl, window.location.origin)`; only same-origin URLs render as Next `<Link>` (pathname + search + hash only). External URLs collapse to plain `(external)` text. Raw URL appears only in the `title` attribute. Eliminates phishing risk of clicking an attacker-supplied href on an admin surface. The check runs in a post-mount `useEffect` to avoid SSR/CSR hydration mismatch.
- **CSV / XLSX export buttons** in the tab nav linking to the new export endpoint.

### Export endpoint ([admin/suggestions/export/route.ts](src/app/api/admin/suggestions/export/route.ts))
- GET `/api/admin/suggestions/export?format=csv|xlsx&status=open|in_review|actioned|declined|all`
- Admin-only (role check via `profiles`), rate-limited via `RATE_LIMITS.heavy`, `Cache-Control: no-store`.
- Stage H precedent: CSV body served with xlsx MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) for the `xlsx` format. Zero new deps.
- Hard cap 5000 rows.
- Filename sanitised via `sanitiseExportFilename`.

### CSV formula injection hardening ([admin/suggestions/export/route.ts](src/app/api/admin/suggestions/export/route.ts) + [analytics/csv.ts](src/lib/analytics/csv.ts))
- **Self-audit finding**: a malicious submitter could put `=cmd|'/c calc'!A0` (or `@SUM(...)`, `+...`, `-...`) in a suggestion title; when an admin opens the CSV in Excel/Sheets, the formula would execute.
- Added `neutraliseFormula()` that prefixes values starting with `=`, `+`, `-`, `@`, TAB, or CR with a single quote so spreadsheet apps render the literal text.
- Applied to **both** the new suggestions export (Stage J) **and** the pre-existing analytics export (Stage H, shipped without this protection) — per CLAUDE.md item 3, no broken code left unaddressed.

### Admin home wiring ([admin/page.tsx](src/app/admin/page.tsx))
- New "Open suggestions" stat card with emphasis when count > 0.
- New tools-grid tile linking to `/admin/suggestions`.
- Grid layout bumped `lg:grid-cols-5` → `lg:grid-cols-6` to accommodate the 6th stat card.

### Composer polish ([SuggestionButton.tsx](src/components/ui/SuggestionButton.tsx))
- Glass-panel treatment: `bg-white/90 backdrop-blur-md` + gold inset ring + existing 2xl rounded card.
- **Trigger-context preview**: post-mount effect reads `window.location.pathname + search` and renders a small italic "Submitted from <path>" line above the submit button. Builds submitter trust by confirming the platform knows which page their feedback is about (satisfies A57 "capture surface / URL / page / event / place").

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **759/759 passed** (83 files, +1 file +14 tests vs prior)
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- Sec audit (self):
  - PATCH notification uses dedicated type, no `data.url` injection vector.
  - Admin export role-gated, rate-limited, filename sanitised, formula-injection neutralised.
  - Admin inbox renders submitter-supplied URLs through origin allowlist; external URLs never rendered as `href`.
  - `safeInternalPath` returns null on SSR + before-mount to avoid hydration mismatch.
  - Suggestion POST input still: 10/day rate limit, control-char strip, `^https?://` page_url validation, 3+/10+ length minima.
  - Anonymous submissions still allowed (`user_id IS NULL OR user_id = auth.uid()` RLS from migration 100b).

### Operator action
None required — migration 114 is a pure enum extension; deploy + apply.

---

## 2-prev. Previously shipped — Stage G.2 + Stage H optional + Stage I (commit `847f3b8`)

**Completed three Stages in one batch**: full atomic owner transfer (G.2 follow-up), historic analytics backfill RPC (H optional), and expandable Planning cards with structured fields (I).

### Migration 111 ([111_team_owner_transfer_atomic.sql](supabase/migrations/111_team_owner_transfer_atomic.sql)) — Stage G.2
- `team_owner_transfers` table — proposal record with status (`pending|accepted|declined|cancelled`), one pending per contributor enforced by partial unique index. RLS read-only to contributor/transferee/proposer/admins; **all writes flow through SECURITY DEFINER RPCs**.
- **Backfill**: every approved contributor profile gets a self-owner `team_memberships` row (`member_id=contributor_id, role='owner', status='active'`) via idempotent INSERT … ON CONFLICT DO UPDATE.
- **Trigger** `ensure_contributor_self_owner` on `profiles` — fires when `contributor_status` transitions to `'approved'`. SECURITY DEFINER so admin approval RLS doesn't block. **Guarded against re-promotion** if another active owner already exists (prevents two-owners-after-re-approval edge case).
- `propose_team_owner_transfer(p_contributor_id, p_proposed_owner_id)` RPC — validates `auth.uid()` is the active owner per `team_memberships`; validates transferee is an active non-owner member; cancels any prior pending proposal before insert. Notifies the transferee + writes activity_log.
- `respond_team_owner_transfer(p_transfer_id, p_action)` RPC — `auth.uid()` must equal `proposed_owner_id` and status must be `pending` (FOR UPDATE locks the row). On accept: **atomic demote of prior owner to 'editor' + promotion of acceptor to 'owner'** in a single function body. Notifies both parties + activity_log. Defensive `no_current_owner` raise if no owner row found.
- All RPCs REVOKE from anon/public; GRANT to authenticated only.

### `checkDashboardAccess` refactor ([access.ts](src/lib/dashboard/access.ts))
- `isOwner` now sourced from `team_memberships.role='owner' AND status='active' AND member_id=auth.uid()`.
- Self-id check (`user.id === contributor.id`) retained as a defensive fallback only — should be unreachable in steady state because the trigger covers all future approvals.
- Same refactor applied in [team/page.tsx](src/app/c/[slug]/dashboard/team/page.tsx) and [settings/page.tsx](src/app/c/[slug]/dashboard/settings/page.tsx) for their independent `viewerIsOwner` computations.

### Backend wiring ([team/route.ts](src/app/api/contributor/[handle]/team/route.ts))
- `propose_owner_transfer` action now delegates to the `propose_team_owner_transfer` RPC. Postgres exception codes mapped to 403/400/500. Dead helper `sendOwnerTransferNotification` removed.
- [`team-invites/route.ts`](src/app/api/team-invites/route.ts) — GET returns `{ invites, owner_transfers }`. POST accepts `kind: "invite" | "owner_transfer"` to route to the correct RPC.

### UI ([TeamInvitesClient.tsx](src/components/team/TeamInvitesClient.tsx) + [team-invites/page.tsx](src/app/account/team-invites/page.tsx))
- Renders a dedicated "Ownership transfers" section (gold-tinted border + "Owner transfer" pill) above the regular team invites. Accept/decline buttons POST to `/api/team-invites` with `kind: "owner_transfer"`.
- Empty state copy widened to mention transfers.

### Migration 112 ([112_backfill_contributor_analytics.sql](supabase/migrations/112_backfill_contributor_analytics.sql)) — Stage H optional
- `backfill_contributor_analytics(p_days_back integer DEFAULT 90)` SECURITY DEFINER function — loops `aggregate_contributor_analytics_daily` over the last N days (clamped 1..365). Returns `(target_date, rows_written)` rows so operators see per-date progress when invoked interactively.
- Idempotent: underlying aggregator uses REPLACE-not-increment, so re-runs self-correct.
- REVOKE from anon/authenticated/public. **Invoke via psql with service_role**:
  ```sql
  SELECT * FROM public.backfill_contributor_analytics(90);
  ```
- Skips "today's yesterday" (handled by the existing 02:15 UTC daily cron).

### Migration 113 ([113_planning_card_fields.sql](supabase/migrations/113_planning_card_fields.sql)) — Stage I
- `planning_tasks` AND `planning_ideas` each gain: `checklist jsonb`, `links jsonb`, `assigned_place_ids uuid[]`.
- CHECK constraints cap collection sizes (50 checklist · 20 links · 10 places) + enforce `jsonb_typeof = 'array'` so payloads can't sneak in malformed shapes. All columns default to empty so existing rows + existing inserts continue to work.

### Backend wiring ([cardFields.ts](src/lib/planning/cardFields.ts) + tasks/ideas routes)
- New shared validator module `src/lib/planning/cardFields.ts`:
  - `sanitiseChecklist` — strips control chars, length caps text (200), dedupes by id, mints fresh UUID if client supplies a non-UUID id (blocks injected external refs), caps at 50 items.
  - `sanitiseLinks` — enforces `^https?:\/\/` (blocks `javascript:` / `data:` schemes), length caps url (500) + label (120), dedupes, caps at 20.
  - `sanitiseAssignedPlaceIds` — UUID-validates, dedupes, caps at 10.
  - `filterContributorPlaceIds(supabase, contributorId, ids)` — server filters down to places this contributor owns, blocking cross-contributor assignment.
- `tasks/route.ts` + `ideas/route.ts` accept the new fields in both POST and PATCH. PATCH supports partial updates so a single checkbox toggle ships only `{id, checklist}`.

### UI ([PlanningDashboardClient.tsx](src/components/contributor/dashboard/PlanningDashboardClient.tsx))
- **Replaced the 3-column kanban with a responsive 2-column expandable card grid**. Same tab switcher (Tasks · Ideas) up top, with counts.
- Each card collapsed shows: title + status pill (tasks) or tag chips (ideas) + visible_to_team chip + assigned-places count. Click expands.
- **Top-right control**:
  - Tasks → binary completion checkbox (circle, green when complete). Toggle flips status pending ↔ completed. Legacy `in_progress` renders as "incomplete" but stays valid server-side.
  - Ideas → delete X.
- **Public toggle** (visible_to_team) sits below the top-right control as a small slide switch.
- Expanded body: description textarea (onBlur save), inline checklist editor (add via Enter, toggle, remove), links editor (url + optional label, validates `^https?:\/\/`), multi-place picker (chips, capped at 10), tag editor (ideas only), due-date row (tasks only), delete button (tasks).
- Server-fetched `places` (contributor-owned only) passed once from the page for the picker.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **745/745 passed** (82 files)
- `npx next lint --dir src` → clean (Next 16 lint deprecation banner only)
- Sec audit (self):
  - **G.2** — All ownership writes go through SECURITY DEFINER RPCs; `auth.uid()` checked server-side; FOR UPDATE locks the transfer row before mutating; partial unique index collapses concurrent proposals to 23505; trigger guarded against double-owner edge case; notification text passes through React default escaping.
  - **H** — Backfill RPC REVOKEd from non-service roles; window clamped to [1,365]; idempotent.
  - **I** — JSONB CHECK constraints cap collection size + enforce array shape at the DB; URL regex blocks non-http schemes; `filterContributorPlaceIds` blocks cross-contributor place assignment; checklist client-supplied ids are UUID-validated and minted fresh otherwise; links rendered with `rel="noreferrer noopener"`.

---

## 2-prev. Previously shipped — Stage H: Analytics depth + export (commit `1e74b92`)

**Completed Stage H of the contributor-dashboard plan**: daily aggregation pg_cron job, public-safe RPC per A19, server-side CSV/XLSX export, public-profile Activity (30d) chips, Vision-export stub.

### Migration 110 ([110_analytics_aggregation_public.sql](supabase/migrations/110_analytics_aggregation_public.sql))
- `aggregate_contributor_analytics_daily(p_target_date date)` SECURITY DEFINER — idempotent rebuild of `contributor_analytics` for one calendar date. Pulls counters from `events`, `rsvps` (attending), `consider_joins`, `comments`, `convinces`, `event_views`, `reports`, `broadcast_messages`, `follows`, `place_follows`, `places`. ON CONFLICT REPLACE (not increment) so re-runs self-correct. REVOKE from anon/authenticated/public — service_role / pg_cron only.
- `get_public_contributor_analytics(p_contributor_id uuid, p_days integer)` SECURITY DEFINER — returns aggregated `(metric, total)` rows for the public-safe metric allowlist (`follows`, `joins`) only. `p_days` clamped to [1, 365]. Returns rollups across all `entity_type`s so callers can't enumerate per-event/per-place activity. GRANT EXECUTE to anon + authenticated.
- `snapshot_contributor_analytics_for_vision()` — Stage H plan item 5 stub. RAISE NOTICE only; Vision endpoint wired in a follow-up. REVOKE EXECUTE from non-service roles.
- pg_cron schedules: `contributor-analytics-daily` (`15 2 * * *` UTC = 04:15 SAST), `contributor-analytics-purge` (`0 3 * * 0` UTC — calls existing `purge_old_analytics()` for 1-year retention).
- Metrics omitted from daily aggregator (no source table): `cancellations` (rsvps cancel via DELETE not status), `shares` (no shares table). Counters stay at whatever `increment_contributor_metric` writes from app code.

### Backend ([export/route.ts](src/app/api/contributor/[handle]/analytics/export/route.ts))
- GET `/api/contributor/[handle]/analytics/export?format=csv|xlsx&period=…&entity_type=…&entity_id=…`
- Auth via `checkDashboardAccess` (owner OR admin-with-grant). 401 if no user; 403 if no access.
- Whitelists `format`, `period` (7/14/30/60/90/180/365), `entity_type` (`contributor`/`event`/`place`). `entity_id` validated through `isValidUUID`.
- Rate-limited via `RATE_LIMITS.heavy` (5/min) per user — export is heavier than the standard read endpoint.
- CSV body built via `buildAnalyticsCsv` in [csv.ts](src/lib/analytics/csv.ts) — RFC-4180 escaping (comma/quote/CR/LF wrapped, embedded quotes doubled, CRLF row separator). Filename hardened by `sanitiseExportFilename` (strips path separators, control chars, length-capped 80).
- `xlsx` format reuses the CSV body with the spreadsheet MIME so Excel/Numbers open it natively. Zero new deps — plan doc Stage H item 4 explicitly allows this fallback ("…else CSV with `.xlsx` MIME left as TODO").
- `Cache-Control: no-store` prevents intermediary caching of contributor data.

### Backend ([public/route.ts](src/app/api/contributor/[handle]/analytics/public/route.ts))
- GET `/api/contributor/[handle]/analytics/public?period=…` — anon-readable. Resolves slug → contributor id via existing `resolveContributorSlug` helper, calls `get_public_contributor_analytics`. Folds the RPC's `[{metric,total}]` shape into `{ period, totals: {follows, joins} }`. Rate-limited per `user.id ?? handle` (read bucket = 120/min).

### UI ([AnalyticsDashboardClient.tsx](src/components/contributor/dashboard/AnalyticsDashboardClient.tsx))
- Replaced client-built CSV with two `<a>` buttons pointing at `/api/contributor/[handle]/analytics/export` — one for CSV, one for XLSX. Disabled (`opacity-40 pointer-events-none`) when there's no data. Query string built with `URLSearchParams` so encoding is safe.

### UI ([ContributorPublicProfile.tsx](src/components/contributor/ContributorPublicProfile.tsx) + [ProfileDetailServer.tsx](src/components/profile/ProfileDetailServer.tsx))
- New `publicAnalytics` prop on `ContributorPublicProfileProps`. `ProfileDetailServer` fetches 30-day totals via `get_public_contributor_analytics` and passes them down.
- Renders an "Activity (30d)" section between Team and Past events when either follows or joins are non-zero. Two glass-pill chips with the formatted totals.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **745/745 passed** (82 files)
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- Sec audit (self): aggregator + Vision stub revoked from non-service roles; public RPC server-enforces metric allowlist + clamps window + aggregates across entities; export endpoint enforces dashboard access + validates entity_id + RFC-4180 escapes CSV + sanitises filename + sets `Cache-Control: no-store` + heavy rate-limit; public endpoint goes through SECURITY DEFINER RPC, no raw query; numeric values rendered via React-escaped `toLocaleString()`.

---

## 2-prev. Previously shipped — Stage G: Team Management UX (commit `028ba7a`)

**Completed Stage G of the contributor-dashboard plan**: 3-search-bar add-member popup, invite flow with accept/decline notification round-trip, owner-transfer proposal (notification-only — full atomic swap deferred), public team list on contributor profile. Also fixed a latent volunteer-notification bug while in the area.

### Migration 109 ([109_team_invite_owner_transfer.sql](supabase/migrations/109_team_invite_owner_transfer.sql))
- `team_memberships.status` CHECK widened: `pending | active | declined | removed` (was `active | removed`).
- `team_memberships.role` CHECK widened: `owner | editor | viewer` (was `editor | viewer`). Only the propose-transfer flow ever creates 'owner' rows; invites are role-restricted to editor/viewer.
- `team_memberships.responded_at timestamptz` (NULL while status='pending').
- `notifications.type` CHECK extended: `+team_invite, +team_invite_response, +team_owner_transfer, +volunteer_application, +volunteer_application_response`. (Volunteer types added to fix latent 'system' typo — see below.)
- `respond_team_invite(p_membership_id uuid, p_action text)` SECURITY DEFINER RPC — member-side accept/decline. Validates `auth.uid()=member_id` + `status='pending'`, writes notification back to contributor, appends activity_log row. REVOKE/GRANT to authenticated only.
- `get_public_team(p_contributor_id uuid)` SECURITY DEFINER RPC — returns `member_id, full_name, avatar_url, role` for active rows only. Granted to anon+authenticated. Keeps email/invited_by/created_at private while exposing the safe display columns for the public profile.

### Backend ([team/route.ts](src/app/api/contributor/[handle]/team/route.ts))
- **POST `action: "search"`** — accepts `name`, `email`, `user_id` independently (any combination). Each field fires a scoped ILIKE/eq query in parallel; results merged via Map dedupe, capped at 20. `sanitiseLike()` strips `%_\` wildcards + control chars to neutralise LIKE injection. UUID-validated. 3+ char minimum on partial email search.
- **POST `action: "invite"`** — creates `team_memberships` row with `status='pending'`. Pre-flight existence check returns 409 for active/pending; allows re-invite over declined/removed rows via upsert on `(contributor_id, member_id)`. Service-role notification insert (notifications RLS insert is admin-only) with `type='team_invite'` and `data.url='/account/team-invites'`. Best-effort: notification failure logged but doesn't fail invite. `recordContributorMutation` writes activity_log.
- **POST `action: "propose_owner_transfer"`** — gated on `access.isOwner` (excludes admin-with-grant impersonation). Proposed transferee must be an active team member. Notification-only this batch: `type='team_owner_transfer'` to the proposed owner with deep link to `/account/team-invites`. No schema swap — accepting just dismisses the notification. Full atomic ownership swap deferred until a follow-up reworks the `user.id === contributor.id` access model.

### Backend ([team-invites/route.ts](src/app/api/team-invites/route.ts))
- **GET** — lists `auth.uid()`'s pending team_memberships joined to contributor profile.
- **POST** — `{membership_id, action: "accept" | "decline"}` → delegates to `respond_team_invite` RPC. Maps Postgres exceptions to 404/403/400.

### UI ([AddTeamMemberPopup.tsx](src/components/contributor/dashboard/AddTeamMemberPopup.tsx))
- New glass-overlay popup with 3 labelled search fields (name, email, user_id). Auto-focuses name. Escape closes. Results render with avatar + name + email + Invite-as-Editor / Viewer buttons. Inline error band, optimistic add to parent.

### UI ([TeamDashboardClient.tsx](src/components/contributor/dashboard/TeamDashboardClient.tsx))
- Single search input replaced with "+ Add team member" button → popup.
- Members split into **Pending invites** (cancel button) and **Active members** sections.
- "Make owner" button on active member rows, visible only when `viewerIsOwner` (server-computed from `user.id === contributor.id`).
- New `viewerIsOwner` prop wired from [team/page.tsx](src/app/c/[slug]/dashboard/team/page.tsx).

### UI ([account/team-invites/page.tsx](src/app/account/team-invites/page.tsx) + [TeamInvitesClient.tsx](src/components/team/TeamInvitesClient.tsx))
- New `/account/team-invites` route — invitee-side acceptance pane listing pending invites with Accept/Decline. Notifications `type='team_invite'` deep-link here via `data.url`.

### UI ([ContributorPublicProfile.tsx](src/components/contributor/ContributorPublicProfile.tsx) + [ProfileDetailServer.tsx](src/components/profile/ProfileDetailServer.tsx))
- New **Team** section on the public contributor profile. Server-fetched via `get_public_team` RPC, rendered as avatar+name chips. Owner chip prefixed with a gold "OWNER" tag.

### Drive-by fix — volunteer notifications
- `volunteers/route.ts` was inserting `type:"system"` (not in CHECK) and `link:null` (column doesn't exist). Silent failures. Migrated both inserts to use the new `volunteer_application` / `volunteer_application_response` types (added in 109) with `data.url` deep-links. Routed through `createAdminClient()` (notifications RLS insert is admin-only).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx next lint --dir src` → clean (Next 16 lint deprecation notice only)
- `npx vitest run` → **745/745 passed** (82 files)
- Sec audit (self): LIKE-injection neutralised; role enum restricts owner via invite; propose_owner_transfer gated on real owner only; RPCs validate `auth.uid()` server-side; public RPC exposes only safe columns; notification body uses React-escaped text (no XSS); concurrent invite race collapsed by `(contributor_id, member_id)` UNIQUE.

---

## 2-prev2. Previously shipped — Full Messaging System + Vibe-Security Audit

**Completed all 12 steps of the messaging product plan + ran a full vibe-security audit, fixing 2 HIGH and 2 MEDIUM findings.** Multi-session effort. `tsc 0`, lint clean, **745/745 tests**.

### Step 1 — DB Schema ([107_messaging_permission_model.sql](supabase/migrations/107_messaging_permission_model.sql))
- `conversations.status` enum (`pending | active | rejected`, default `active`)
- `user_blocks` table with RLS (own blocks only) + `is_blocked()` SECURITY DEFINER bilateral check
- `conversation_participants.muted_at` (timestamptz, suppresses push)
- `messages.deleted_at` (soft-delete display window for retention purge)
- `profiles.handle` (`^[a-z0-9_]+$`, 3-30 chars, partial unique index)
- `profiles.discoverable` (boolean default false, opt-in attendee visibility)
- `profiles.muted_source_ids` (jsonb array — broadcast source mutes)
- `profiles.deleted_at` (soft-delete; 30-day message retention thereafter)
- Extended `reports.target_type` to include `'conversation'`
- Extended `notifications` type CHECK to include `spam_flag, broadcast_flood, dm_received, dm_response`
- Updated `find_or_create_conversation(user_a, user_b, p_status DEFAULT 'active')` SECURITY DEFINER
- pg_cron `messaging-purge-60d` (03:00 daily): 60d active, 30d soft-deleted account purge

### Step 2 — Permission Rules ([src/app/api/conversations/route.ts](src/app/api/conversations/route.ts))
- Citizen↔Citizen: always `active`
- Citizen→Contributor: always `active`
- Contributor→Citizen with prior RSVP/follow/place_follow: `pending` (request)
- Contributor→Citizen with NO prior interaction: 403 blocked
- Either party blocked: 400 (via `is_blocked` RPC)
- All gating via Promise.all for parallelism

### Step 3 — Request UX ([MessageRequestCard.tsx](src/components/messaging/MessageRequestCard.tsx))
Pending-state card with Allow/Deny → PATCH `/api/conversations/[id]` with `action: 'accept' | 'reject'`. Per-button loading state.

### Step 4 — Floating panel ([MessagesPanel.tsx](src/components/messaging/MessagesPanel.tsx))
- Anchored `top-14 right-4 z-[9999]`, w-360px, max-h 50vh
- `bg-white/90 backdrop-blur-sm` + gold inset shadow tint
- Sort: pending first, then by `updated_at`
- Inline ChatView when row selected (back arrow returns to list)
- Hover-revealed ConversationCardActions on each row
- Realtime: subscribes to messages INSERT + conversations UPDATE
- Backdrop click closes panel

### Step 5 — Navbar badge ([Navbar.tsx](src/components/ui/Navbar.tsx))
Wraps message icon with unread count badge (same pattern as NotificationBell). Click toggles MessagesPanel.

### Step 6 — MessageButton placements (small `variant="icon"`)
- [EventDetailContent](src/components/events/EventDetailContent.tsx) — near organiser card
- [PlaceDetailServer](src/components/places/PlaceDetailServer.tsx) — owner block
- [ContributorPublicProfile](src/components/contributor/ContributorPublicProfile.tsx) — restored

### Step 7 — [ConversationCardActions](src/components/messaging/ConversationCardActions.tsx)
Mute/unmute · Delete (confirm) · Report (reason picker) · Block (confirm + auto-delete). Browser `confirm()` for destructive (acceptable MVP).

### Step 8 — Spam detection ([api/conversations/[id]/messages/route.ts](src/app/api/conversations/[id]/messages/route.ts))
On message POST: count sender's messages in last 60s; if ≥5, **allow send** but fire-and-forget upsert into `reports` with `onConflict: 'reporter_id,target_type,target_id', ignoreDuplicates: true`. Never blocks legit traffic.

### Step 9 — Broadcast flood detection ([notify-broadcast/index.ts](supabase/functions/notify-broadcast/index.ts))
On each broadcast: count broadcasts from source in last 7d; if >15, insert admin `broadcast_flood` notification. Uses service client (correct for fan-out).

### Step 10 — Contributor digest ([send-contributor-digest/](supabase/functions/send-contributor-digest/index.ts) + [108_contributor_digest_cron.sql](supabase/migrations/108_contributor_digest_cron.sql))
- Counts new RSVPs, followers, place_follows, volunteer_applications, DMs in last 3 hours per approved contributor
- pg_cron schedule `0 7,10,13,16,19 * * *` UTC = 09/12/15/18/21 SAST
- Skip if no activity. Reuses `event_update` notification type (`data.digest=true`) to avoid CHECK constraint expansion.
- Bearer auth guard at function entry.

### Step 11 — Citizen discovery
- @handle opt-in in [ProfileDiscoverySettings](src/components/profile/ProfileDiscoverySettings.tsx). Resolves `/profile/[handle]` or fallback to UUID.
- "Copy profile link" on profile pages.
- "People attending" chips on event detail (only `discoverable=true` RSVPers; only visible to fellow RSVPers).

### Step 12 — Deleted-account display
`profiles.deleted_at IS NOT NULL` → sender name rendered as ~~strikethrough~~ in [ChatView](src/components/messaging/ChatView.tsx) + MessagesPanel. Message body retained 30 days per pg_cron retention.

### Vibe-Security Audit — 4 findings, all fixed
1. **HIGH** — PATCH `accept`/`reject` had no recipient verification: contributor could auto-approve their own pending request via direct API call.
   **Fix** ([conversations/[id]/route.ts](src/app/api/conversations/[id]/route.ts)): Two parallel counts (total messages, user's own messages). If user has sent any message in this conversation OR there are 0 messages total → 403. Works because in pending state only the initiator sends. No schema change.

2. **HIGH** — `send-contributor-digest` used nested `.in("conversation_id", supabase.from(...).select(...))` — Supabase JS doesn't support nested subqueries; silently returned 0 DM counts.
   **Fix**: Pre-fetch `convIds` as array BEFORE Promise.all, then `.in("conversation_id", convIds)` properly.

3. **MEDIUM** — Digest missing `.is("deleted_at", null)` on contributors query.
   **Fix**: Added the filter so soft-deleted accounts don't get digests.

4. **MEDIUM** — Digest had no auth guard.
   **Fix**: `Authorization: Bearer ...` required at function entry. pg_cron path (migration 108 passes anon key) keeps working.

### Standing instructions persisted
[CLAUDE.md](CLAUDE.md) created at project root — auto-loaded every session. Contains the 7-point operating ruleset (start with RESUME_HERE, compact often, no broken code left alone, ask questions, A+ quality, vibe-security check, push+update+report).

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx next lint --dir src` → **clean** (only the Next 16 deprecation notice for the lint command itself)
- `npx vitest run` → **745/745 passed** (82 files)

---

## 2a. Previous batch — Quality Gate Fixes (commit `d116ea5`)

**Committed + pushed 2026-05-28.** Resolved TS build errors introduced by stage-f.

Files changed:

- `src/lib/quickPanelOptions.ts` — added `specialFilter?: "volunteer"` to `QuickAccessItem` type (was missing from HEAD; `EventsView.tsx` referenced it)
- `src/lib/quickPanelPrefs.ts` — default quick-panel IDs updated; count 4→5; replaced `"outreaches"` with `"where-to-serve"`
- `src/lib/categoryIcons.ts` — added `"where-to-serve": "heart-handshake"` to `QUICK_ACCESS_ICON_IDS`

**Quality gate on `d116ea5`:**

- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **82 files, 745 tests, all passing**
- `npx next lint --dir src` → **Exit 0, clean**

---

## 2b. Previous batch — Stage F: Volunteers UX (commit `e3c401d`)

**Completed Stage F of the contributor-dashboard plan**: citizen volunteer apply/withdraw flow + contributor approve/decline with reason.

### New component: `VolunteerApplyButton`
- Citizen CTA rendered on event/place detail pages when `volunteer_openings=true` and `organiserHandle` is available.
- States: none (CTA) → form (optional message, 500-char, char counter + aria-live) → submitting → status badge.
- Status badges: pending=amber, approved=green, declined=gray ("Not selected"), withdrawn=silent.
- Withdraw: POST `action=withdraw` → `status=withdrawn`; gated by `applicant_id=user.id` + status in `[pending, approved]`.
- Login gate: Link to /login when `userId=null`. Owner guard: returns null when `isOwner=true`.

### API changes (`volunteers/route.ts`)
- `withdrawn` added to `ALLOWED_STATUSES`.
- New `withdraw` action: UUID validation + ownership check (`applicant_id = user.id`) + status gate + DB update.
- `update_status`: reads + sanitizes `response_message` from body; includes it in `.update()` when present.

### EventDetailServer + EventDetailContent
- `EventDetailServer` fetches user's volunteer application (`maybeSingle`) when `volunteer_openings && user`.
- Passes `volunteerStatus`, `volunteerApplicationId`, and `organiserHandle` (contributor_slug) to `EventDetailContent`.
- `EventDetailContent` renders `VolunteerApplyButton` after LocationSharingToggle when `volunteer_openings && organiserHandle`.

### PlaceDetailServer
- Added `volunteerAppRes` to the parallel `Promise.all` queries (conditional on `user && volunteer_openings`).
- Replaced static "Volunteer" gold pill with interactive `VolunteerApplyButton`.
- `volunteerStatus` and `volunteerApplicationId` extracted from result.

### TeamDashboardClient
- `Volunteer` interface gains `response_message: string | null`.
- Controlled volunteer list (`volunteerList` state) replaces prop-direct rendering.
- Inline respond form: appears on pending rows; confirm action (approve/decline) + optional message textarea (2 rows, 500-char, `maxLength`).
- Optimistic update: `setVolunteers(prev => prev.map(...))` on success; error displayed via `role="alert"`.
- `response_message` shown on declined rows.
- `STATUS_CLASSES` map for consistent status badge styling.

### team/page.tsx
- Volunteer query changed `.in("status", ["pending", "approved", "declined"])` — includes declined for private contributor view.
- `VolunteerRow` type gains `response_message: string | null`.

### Validation
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **744/744** (82 files)
- `npx next lint --dir src` → clean
- Architect review: security clean — UUID validation on all IDs, `applicant_id` double-gated in both SELECT and UPDATE for withdraw, `sanitize()` on all user text input.
- Advisors: **86 WARN unchanged**

---

## 2c. Previous batch — Stage D: specialised services + keyword bank (commit `04c3118`)

Migration 106: RLS on `specialised_services` + `contributor_keywords`, length 100→40, allowlist `[A-Za-z0-9 ._-]`, unique constraints. Services API: `sanitiseService()`, NFC-normalize. Keywords API: `sanitiseKeyword()`. `PlacesDashboardClient`: inline chip editor. `SettingsDashboardClient`: corrected filter. 744 tests, tsc 0, lint clean.

---

## 2d. Previous batch — Stage E.2+E.3: broadcast public banners + edge function (commit `c189620`)

`OrgBroadcastList` renders "From the Organiser" banners on event/place detail pages. `notify-broadcast` edge function v2 with correct `_shared/` bundling. `_shared/push.ts`: `broadcast_sent` type + `skipInApp` flag. Migration 105: widens `notifications_type_check`. 744 tests, tsc 0, lint clean.

---

## 3. Current platform state

- 87 test files, **762 tests**, all passing. (Count dropped from 790: the Figma Batch C-2 removed
  the clustering engine + its test file.)
- 119 migrations — **all now APPLIED to the live `Citizens-Connect` Supabase project**
  (`xyiajtrvhlxaeplsiajj`). Note: the live DB was silently stuck at 106; a prior session applied
  the **107→118** gap. **Migration 119 (`map_prominence`) applied 2026-06-01** — adds
  `events/places.prominence_base` + `recompute_map_prominence()` + backfill (22 events / 2 places
  scored; rest at fairness-floor 0). ⚠️ **pg_cron is NOT installed on this project**, so the daily
  `map-prominence-recompute` (and the older analytics cron schedules) never registered — prominence
  must be refreshed by calling `select public.recompute_map_prominence();` manually (or install
  pg_cron). 119 was authored in a prior session but left untracked; committed 2026-06-01.
- Analytics **backfill executed** (`backfill_contributor_analytics(90)`, 2026-02-28→05-28).
- Security advisor: **0 errors** (105 informational/by-design lints).
- The Figma glassmorphism map UX migration (Batches A–C + C-2) **is now committed on `main`**
  (`e74346a`, `4934c5b`) — the old "not yet pushed" warning is resolved.
- Latest commit on `main`: the 2026-06-01 image-upload RLS fix + marker fill + panel-nav (§2 above).
  Committed from the founder's Windows machine (no CRLF-churn artifact here — only real changes diff).
  **Founder to-do:** browser-test a real event/place cover + gallery upload to confirm end-to-end,
  then `git push` if not already pushed.

---

## 4. Next batches queued

### Map UX (Figma migration) — Batch C-2 DONE; remaining follow-ups
Batch C-2 (clustering removal, dead-code excision, gold custom markers, landing hand-off) shipped
this session — see §2 "Batch C-2 — DONE" above (tsc 0 / ESLint clean). Items 1–3 + the optional
hand-off are complete. Still queued:
1. ~~Remove clustering/bubbles~~ ✅ DONE — replaced with dot→mid→full zoom-reveal + deconfliction.
2. ~~Delete dead legacy popup + viewport-scope~~ ✅ DONE.
3. ~~Gold-theme custom event markers~~ ✅ DONE.
4. **Build the other surfaces from Figma** — paste `docs/FIGMA_SURFACES_PROMPT.md` into the Figma
   Make file, generate one surface at a time, then wire to real data. Highest-value first:
   the **Organisation Dashboard** (the "Hearts United Foundation" preview). NOTE: its
   Impact Score / Lives Impacted metrics don't exist in the schema — decide real columns vs proxies
   before building (VISION: honour real data).
5. Optional polish: ~~shorten the LandingPage→/events hand-off~~ ✅ (300→150ms); still open — wire
   Next 15 View Transitions + per-route glass `loading.tsx` skeletons for snappier navigation.
6. Optional tidy: drop the now-unused `onQuickAction`/`rsvpEventIds`/`considerEventIds` props from
   `EventMap` (popup-only; EventsView still passes them harmlessly).
- Full working log: `.claude/sessions/figma-map-ux-migration.md` (gitignored).

### Contributor dashboard
**The entire contributor-dashboard plan (Stages A–L + Stage H follow-ups) is now complete.** No further stages are queued from `docs/plans/contributor-dashboard.md`.

~~Outstanding operator action (backfill)~~ — **DONE this session.** All migrations 107→118 are
applied to the live Citizens-Connect DB and `backfill_contributor_analytics(90)` has been run.
No operator DB actions are pending.

> **DB migration discovery (this session):** the live DB's migration tracker was at `106` while
> the repo had files through `118`. Object-level probing showed **107→118 were ALL unapplied**
> (not just 116–118). Applied them in order via Supabase MCP, one at a time, halting-on-error.
> Found + fixed a real bug: migration **108** nested `$$` inside `DO $$` (invalid dollar-quoting)
> — corrected to `$cron$` in the DB and the file. Also hardened file **111**'s policy create with
> a `pg_policies` guard. All verified present; 118 grants confirmed (anon/authenticated can't
> execute `log_search_term`, service_role can).

**Optional hardening — two of three now DONE** (`log_search_term` lockdown ✅, real XLSX ✅). Remaining:

### Citizens Vision + ecosystem (active strategy — NEXT SESSION)
The founder reframed the goal (2026-05-29): an **ecosystem of apps sharing data**, with **Vision as
the back-office analytics/intelligence app** for contributors + organisations to glean analytics,
map activity across **all** ecosystem apps (source-selectable), and receive recommendations/trends.
Connect must stay lightweight + scale (phones via Capacitor + browser). Monorepo (Turborepo) is
the founder's lean but to be confirmed.

**Inspected this session:** Vision (`../citizens-vision`) is **largely feature-complete** — Next 16 /
React 19, Phases **0–21b** done (incl. Connect integration + incremental sync, advisory, federation),
separate Supabase project `Citizens-Vision` (`ijdmcudcrncmaprmzgfk`, currently INACTIVE). Its
`README.md` is boilerplate; real docs are `ARCHITECTURE.md`, `.github/VISION.md`, `PROJECT_STATUS.md`.

**→ Full context + open questions captured in
[docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md](docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md).**
That doc is the agenda for the dedicated strategy session: ecosystem intent, data architecture
(linchpin), Vision scope, audiences, monorepo vs polyrepo, React/Next version reconciliation
(founder Q2 — needs a Capacitor compatibility audit I still owe), and first-deliverable sequencing.
**No monorepo/integration code until those decisions are made.**

### Other non-blocking
- `docs/design/FIGMA_PROMPT.md` remains **untracked** in the Connect repo per founder instruction
  (leave uncommitted).

---

## 5. Open questions

None blocking.

---

## 6. How to verify locally

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx tsc --noEmit
npx vitest run
npx next lint --dir src
npm run dev
```

**Messaging system verification** (12 steps):

1. **Permission gate**: as contributor, try messaging a citizen who has not RSVP'd → API returns 403.
2. **Request flow**: contributor messages a citizen who has RSVP'd → conversation created `status='pending'`; citizen sees MessageRequestCard in MessagesPanel with Allow/Deny.
3. **Recipient-only gate (HIGH fix)**: as contributor, PATCH `/api/conversations/[id]` with `action:accept` on your own pending request → 403 "Only the recipient can respond to a message request".
4. **Floating panel**: click message icon in Navbar → glassmorphism panel opens top-right; click conversation row → inline ChatView; back arrow returns to list.
5. **Badge**: send message to test account → badge appears on Navbar message icon.
6. **MessageButton placements**: visible on event detail, place detail, contributor profile.
7. **Block flow**: block a user → existing conversation hidden, future POST returns 400.
8. **Spam flag**: send 6 messages in 60s → row appears in `reports` table with `reason='spam'`.
9. **Broadcast flood**: create 16 broadcasts from one source in 7d → admin notification with `type='broadcast_flood'`.
10. **Deleted-account display**: soft-delete a profile (`UPDATE profiles SET deleted_at = now() WHERE id = ...`) → their name renders ~~strikethrough~~ in ChatView header + MessagesPanel row.
11. **Discoverable opt-in**: enable in profile settings → name+avatar chip appears on event detail "People attending" for fellow RSVPers.
12. **Digest dry-run**: `curl -H "Authorization: Bearer <ANON_KEY>" https://<project>.functions.supabase.co/send-contributor-digest` → returns `{digests: N}`. Without header → 401.

**Volunteers (Stage F)**:

- Dashboard → Team → Volunteers tab: pending applications show Approve/Decline buttons.
- Decline click reveals inline textarea for reason; Confirm sends POST `update_status`.
- `/e/[id]` or `/places/[id]` when `volunteer_openings=true`: VolunteerApplyButton CTA appears.
- Citizen can apply with optional message, see status badge, or withdraw pending/approved apps.

---

## 7. Memory pointers

- `/memories/repo/coding-patterns.md` — Connect patterns.
- `/memories/repo/outstanding-items.md` — running backlog.

---

## 8. Architecture quick-orient

- **Layout-level auth gating** for the dashboard lives at `src/app/c/[slug]/dashboard/layout.tsx`. It computes `isOwner` / `isAdmin` / `adminSessionActive` and decides which surfaces to render.
- **All notification deep-links** must use `data.url` (not `link_url`/`metadata` — those columns do not exist). See decision log entry "Notification deep-links — `data.url` only".
- **Admin attribution helper** lives in `src/lib/dashboard/adminAttribution.ts`. Any mutating contributor route should call `getActiveAdminGrant` and, if non-null, `logAdminOnBehalfAction` after the mutation succeeds.
- **A48** is encoded in `viewerIsOwner` server prop + server-side route gating.
- **`VolunteerApplyButton`** is a client component at `src/components/volunteer/VolunteerApplyButton.tsx`. It takes `entityType/entityId/contributorHandle/userId/initialStatus/initialApplicationId/isOwner` and handles the full apply/withdraw lifecycle client-side.
- **`withdraw` in volunteers API** is gated by `applicant_id = user.id` in BOTH the SELECT ownership check and the UPDATE WHERE clause — no dashboard access needed (citizen self-action).
- **Messaging recipient identification** (no `created_by` column): in `pending` state only the initiator has sent messages, so PATCH accept/reject blocks any user with `messages.sender_id = user.id` count > 0 OR conversations with 0 messages total. See [conversations/[id]/route.ts](src/app/api/conversations/[id]/route.ts).
- **Conversation creation** goes through `find_or_create_conversation(user_a, user_b, p_status)` SECURITY DEFINER — `user_a` is the initiator. The RPC validates `p_status IN ('pending', 'active')`; `rejected` cannot be created, only set via PATCH (currently the PATCH deletes the conversation instead of setting `rejected`).
- **Supabase JS `.in()` limitation**: nested subqueries (`.in("col", supabase.from(...).select(...))`) silently return 0 results. ALWAYS pre-fetch the array first. Caught in vibe-security audit on `send-contributor-digest`.
- **Edge function auth pattern**: cron-triggered functions should reject requests without `Authorization: Bearer ...` header. pg_cron (migration 108) passes `Bearer ${anon_key}`.
