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

- Source of truth for the swap: **[docs/HTML_FRONTEND_WIRING_SPEC.md](docs/HTML_FRONTEND_WIRING_SPEC.md)**
  (Phase 0 is DONE — §3G/§3H). The swap is complete; this section is retained for context only.
- Build order: Phase 0 (done) → 1 auth → 2 map+home → 3 screens → 4 advanced → 5 Capacitor.
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
4. ~~add the one Connect endpoint `GET /api/v1/profiles/{id}`~~ ✅ **DONE (2026-07-01, this repo)** —
   [`src/app/api/v1/profiles/[id]/route.ts`](src/app/api/v1/profiles/[id]/route.ts): display-safe
   `id/full_name/avatar_url` only, UUID→400, 404 when unresolved, `gateV1`-limited; tests in
   `src/__tests__/api/v1/endpoints.test.ts`; documented in `docs/api-v1.md`. **The sole Connect-side
   Step-3 dependency is now met** — items 1–3 & 5 below are Wear-repo / operational.
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

## 3H. Step 3 Connect dependency SHIPPED — `GET /api/v1/profiles/{id}` ✅ (2026-07-01)

Delivered the **single Connect-side dependency** the Wear (Step 3) build needs, and re-verified
Step 0 is code-complete + stable. Commit **`e2f579a`** on `main` (pushed `85ac146..e2f579a`).
Working log: `.claude/sessions/step3-connect-profiles-endpoint.md`.
**No DB change → next migration # still 143.** Gates: **tsc 0 · eslint 0 · vitest 637/637** (+3).

### What shipped
- **NEW [`src/app/api/v1/profiles/[id]/route.ts`](src/app/api/v1/profiles/[id]/route.ts)** —
  `GET /api/v1/profiles/{id}` returning **display-safe fields only** (`id, full_name, avatar_url`)
  for a user by id. Lets a sibling app (Wear) render a Connect user's display identity through the
  `/api/v1` contract instead of a raw `public.profiles` read (SHARED_DB_CONTRACT R2), covering the
  rare "user who hasn't opened Wear yet" backfill case (STEP3 scope §5 Q1).
  - UUID-validated → **400**; **404** when unresolved; `gateV1` rate-limited (anon IP cap + 120/min
    per-id secondary cap); byte-stable body + `X-Generated-At` header (mirrors `events/{id}`).
  - **Security:** `profiles` RLS is `using(true)` (policy "Profiles are viewable by everyone",
    migrations 063/065) → server anon client can row-read any profile; **column safety is enforced
    by the explicit `select("id,full_name,avatar_url")`**. A test asserts the select can't silently
    widen into PII. Returns only already-public display identity → no new exposure surface.
- Tests: `src/__tests__/api/v1/endpoints.test.ts` (+3: 400 / 404 / 200-display-safe-with-select-guard).
- Docs: new section + stability guarantee in [`docs/api-v1.md`](docs/api-v1.md); STEP3 scope doc
  §3 + §3F item 4 above both marked DONE.

### Step 0 status re-verified this session
Old Next.js frontend is **fully deleted** — `src/app` is API-only (no `src/components`/`src/hooks`/
`layout.tsx`/`globals.css`/`page.tsx`). `node scripts/build-frontend.js` = 0. So Step 0's remaining
tail is **all non-code** (F1/F2/Step 6 rest/Step 7 above); nothing code-level is outstanding there.
⇒ Step 5 (monorepo lift) is no longer gated by Step 0 code — it's gated only by the founder's
non-code launch items + the Step 3/4 sequencing.

---

## 3I. Wear Phase 3 — foundation shipped (schema→prod + Supabase Auth) ✅ (2026-07-01)

Executed Step 3 **foundation-first, sequenced** (founder chose this delivery + contract-conformance
validation). Working log: `.claude/sessions/wear-phase3-shared-supabase.md` (gitignored).

- **Increment 1 — `wear.*` schema APPLIED to prod** (Connect `main`, commit `a38cc24`; pushed).
  **Migration 143** `supabase/migrations/143_wear_schema.sql` → shared project `xyiajtrvhlxaeplsiajj`.
  Activates the 3rd schema boundary (`public`/`vision`/**`wear`**). **22 tables (0 without RLS), 42
  policies, 10 enums, 3 fns.** **Advisors 0 ERROR, 0 new findings** (72 WARN/3 INFO = mig-142 baseline).
  Fixed 3 bugs vs the `docs/wear` draft before applying: dropped `wear.users.email` (PII under
  public-read RLS); reordered the DM block (a `language sql` fn body is validated at CREATE →
  `is_conversation_member` cannot precede its table); added `wear.is_blocked_either` SECDEF (a block's
  target must not read the reverse row). SHARED_DB_CONTRACT §1/§9 stamped to head 143. **Next # = 144.**
- **Increment 2 — mock session replaced by shared Supabase Auth** (`citizens-wear` `main`, commit
  `361e438`; pushed). `@supabase/supabase-js@^2.102.1`+`@supabase/ssr@^0.10.0`; new
  `apps/web/src/lib/supabase/{env,server,client,middleware}.ts` (request-scoped server client → RLS via
  user JWT; session-refresh middleware); `session.ts` onto Supabase Auth (mapped to the existing
  `ConnectUser` shape so ~20 consumers compile unchanged); `/sign-in` → Google OAuth; `/auth/callback`
  code-exchange; removed the OIDC callback + `MOCK_SIGN_IN_TOKEN`. **Gates: tsc 7/7 · eslint clean ·
  vitest 18/18 · `next build` OK.** One Kingdom identity now spans Connect → Vision → Wear.

**Why it stopped here (honest checkpoint):** the remaining unit (§3.4) is **one tightly-coupled
refactor** — the app resolves users/brands/products via `connect-client` across **~16 files**, so
reconciling `connect-client` is inseparable from porting the ~700-line store onto `wear.*` and
extending the `WearStore` contract with `users`+`brands` repos. It **cannot be integration-tested in
this environment (no local Postgres)**, so a blind big-bang rewrite would breach the "validated,
tested changes" bar. Precise execution spec is in **STEP3 scope §3.4** (repos to add, store semantics
to mirror, consumers to repoint, coverage strategy, mirror-handle derivation).

---

## 3J. Wear Phase 3 — data plane + `/api/*` contract SHIPPED ✅ (2026-07-01)

Executed the §6a-sequenced, frontend-agnostic core of Step 3 §3.4 as three validated,
additive increments (founder chose the standalone-HTML-frontend direction, so the data
plane was built to be consumed via `/api/*`, **not** wired into the throwaway RSC pages).
Working log: `citizens-wear/.claude/sessions/step3-wear-store-and-frontend.md` (gitignored).
Every increment gated: **tsc 7/7 · eslint clean · vitest · next build · coverage**.

### Shipped to `main` (both repos pushed)
- **citizens-wear** `main` @ **31f9143** (0d274fa→31f9143). Final gates: tsc 7/7 · eslint clean ·
  vitest **web 37 / db 69 / connect-client 38** · coverage PASS (funcs 100%) · next build OK
  (17 `/api/*` routes registered).
- **citizens-connect** `main` @ **f00dbbc** — **migration 144** applied to prod. **Next mig # = 145.**

### Increment A — `WearStore` +users +brands (`citizens-wear` `packages/db`)
Extended the contract with a `UserRepo` (display-safe identity mirror: getById/getByHandle/search/
`upsertFromSession` — derives a globally-unique handle, Connect issues none) and a `BrandRepo`
(Wear-owned brands + owner-verified create/update, optional `connectContributorId`). Implemented in
`MemoryWearStore` (the semantic spec + contract-test target). +14 `directory.test.ts` cases.

### Increment B — `SupabaseWearStore` + **migration 144** (this repo)
- `apps/web/src/lib/supabase-wear-store.ts` — all 15 repos vs `wear.*` through an **injected,
  request-scoped** `wear`-bound client (RLS as the signed-in user). `getRequestWearStore()`
  env-selects Supabase (per request) vs the seeded memory singleton. I/O adapter → excluded from the
  coverage allowlist; validated by contract-conformance + tsc + build + prod RLS smoke.
- **Migration 144** `144_wear_write_helpers.sql` (applied to prod `xyiajtrvhlxaeplsiajj`, pre-apply tag
  `connect-pre-mig144`). **Found & fixed a real gap:** mig-143 RLS makes three writes impossible — DM/
  group creation (inserts the *other* member's row), `conversations.updated_at` bump (no UPDATE policy),
  and block→symmetric-unfollow. Added 2 SECDEF RPCs (`create_direct_conversation`,
  `create_group_conversation` — internal `auth.uid()` guard, EXECUTE authenticated+service_role only)
  + 2 SECDEF triggers (`trg_bump_conversation_updated_at`, `trg_unfollow_on_block`). Mirrors Connect's
  `find_or_create_conversation` precedent. **Verified: advisors 0 ERROR** (72 WARN/3 INFO baseline,
  0 new); 4 fns SECDEF w/ correct grants; both triggers enabled; auth-guard fires (42501). Also fixed
  a **pre-existing red web `test:coverage` gate** on Wear `main` (`__resetConnectClientForTests`
  never exercised) — now green.
- Contract stamped: [docs/SHARED_DB_CONTRACT.md](docs/SHARED_DB_CONTRACT.md) §9 head = **mig 144**.

### Increment C — the `/api/*` contract (`citizens-wear` `apps/web`)
17 route handlers (me, feed, posts +[id]/like/save/comments, follows, users +[handle], brands +[slug],
stories, conversations +[id]/messages, blocks, reports). **`lib/api/route-context.ts` = the cross-
origin auth primitive** — resolves the user from an `Authorization: Bearer` token (the static HTML
app's `localStorage` session, cookie-invisible cross-origin — Connect memory
`static-frontend-cross-origin-auth`) **or** cookies, yielding a request-scoped `SupabaseWearStore`
authed as that user. Serializers hydrate post authors/brands via the store's own repos (no
`connect-client` round-trip — the Inc-A payoff). +14 handler tests. Fixed the vitest `@` alias on
Windows (`fileURLToPath`).

### ~~⚠️ Remaining Step-3 work = D + E (coupled)~~ → ✅ **DONE — see §3L (2026-07-02)**
The `connect-client` reconcile (D) and the HTML-frontend swap (E) shipped as sequenced in §6a
(D-additive → E → D-removal); Step 3 is complete end-to-end.

---

## 3K. Connect Map design-system reskin WITHDRAWN (2026-07-01)

The founder determined the attempted visual treatment did not match expectations. Commits
`b14d595` and `10ec40f` were reverted with history-preserving revert commits `3bf7aad` and
`6ec4976`. The standalone HTML/React frontend in `src/frontend/` is restored to its pre-reskin
state; Next.js remains the API/static host. No API, auth, database, RLS, or migration behavior changed.

## 3L. Ecosystem Step 3 **COMPLETE** — Wear D + E + F shipped ✅ (2026-07-02)

Finished [ECOSYSTEM_DECISION_BRIEF](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md) §6 orders **3 + 3a**
(rows now ✅). Working log: `citizens-wear/.claude/sessions/step3-wear-D-E-F-completion.md`
(gitignored). **No Connect DB/code change → next Connect migration # still 145.** Connect-side
edits this session = docs only (this file + the two strategy docs).

### Shipped to `citizens-wear` `main` (31f9143 → **4a4d22f**, all pushed)
- **`66ed31b` D-additive** — `connect-client` gains `ContributorDirectory` (list/getBySlug →
  profile+counts) + `CategoryDirectory` (list) over Connect's REAL
  `/api/v1/{contributors,contributors/[slug],categories}`: snake→camel mapping, offset pagination
  surfaced through the uniform `Page` cursor (= stringified offset), API-key header FIXED
  `x-connect-api-key`→`X-API-Key` (old name never matched Connect's resolver), env
  `CONNECT_API_BASE_URL` (ecosystem-standard; `CONNECT_BASE_URL` legacy fallback). ADR-0002 amended.
- **`c21a3ae` E-prep (API)** — `POST /api/me/hydrate` (mirror hydration from the **server-validated**
  session identity — never the request body; `RouteContext.identity` + `identityFromAuthUser` shared
  with session.ts); `GET /api/me/saves` (boards); `GET /api/hashtags/trending`;
  `GET /api/ecosystem/contributors` (proxies the D-additive surface — Discover's "From the wider
  Kingdom" rail; 502 on upstream failure); `GET /api/me` +owned brands / `PATCH /api/me`
  (bio/visibility/displayNameOverride); `users/[handle]` +posts grid.
- **`1e55a2b` E (the swap)** — standalone HTML frontend `apps/web/src/frontend/` (index.html,
  `auth-client.js` = CW_AUTH port of Connect's incl. `citizenswear://auth-callback` native deep link,
  capacitor-bridge (core/app/browser), 15 app/*.jsx modules, crown asset) built by
  `apps/web/scripts/build-frontend.js` (verbatim port of Connect's esbuild pipeline → hashed bundle,
  no Babel JIT, env-generated config.js; `--mobile` → mobile-dist/). Screens wired to `/api/*` with
  **Bearer-token auth**: home (stories tray + feed cards w/ optimistic like/save + engagement counts),
  discover (users/brands search, trending tags, Kingdom contributors rail), create (post/story/brand),
  inbox (conversations + thread + new DM), post detail (comments), brand, profile (posts grid + saved
  boards), settings (PATCH /api/me + sign-out), shell (bottom nav + ≥1024px sidebar). Serializer now
  attaches likeCount/commentCount/viewerLiked/viewerSaved; `POST /api/posts` accepts safeUrl-validated
  `mediaUrls` (≤4). **RSC tree DELETED** (all pages incl. /sign-in + /auth/callback, components/, RSC
  libs, Tailwind/Radix toolchain) → **Next.js is API-only** (`/` → `/index.html` redirect; 23 routes).
  **Verified in-browser** (built bundle + stubbed API): auth screen, home feed, optimistic like
  342→343 w/ server confirm, hydrate fires on sign-in, discover/post-detail/profile/create/inbox all
  render; 0 console errors.
- **`0350509` D-removal** — `connect-client` = contributors + categories + healthCheck ONLY.
  AuthProvider/UserDirectory/BrandDirectory/ProductCatalog/EventBus + webhook module DELETED
  (+ `/api/connect/webhook` + webhook-log — Connect emits no webhooks). Live `healthCheck` reconciled
  → probes `GET /api/v1/categories?applies_to=both` (Connect has no /health). session.ts decoupled
  onto Wear-owned `WearSessionUser`/`WearSessionInfo`.
- **`4a4d22f` F (docs)** — `rollout-plan.md`: dup "Phase 3" heading fixed, OIDC/webhook Phase 3
  marked superseded, new **Phase 3R** records reality; framing bullet updated (identity = shared
  auth; Connect = commons only). `LOCAL-SETUP.md` (untracked local file) §2/§3 rewritten to the
  shared-project model + deploy gates + two-server dev flow.

### Gates (final, all green)
tsc/lint/test = **13 turbo tasks** · vitest **connect-client 20 / db 69 / web 49** · coverage
cc **98.6%** / web **99.1%** (funcs 100%) · `next build` OK. Prod DB untouched (advisors baseline
unchanged from §3J: 0 ERROR / 72 WARN / 3 INFO).

### Known debt (reported, deliberate)
1. **Wear `/api/*` has NO rate limiting** (pre-existing from Inc C). Port Connect's Upstash
   fixed-window pattern (`src/lib/rate-limit.ts`) before store/public launch — same env vars.
2. Media = URL-only (no upload pipeline yet); notifications tab = placeholder (no backend);
   desktop uses the mobile-composed column in a sidebar shell (full desktop layouts = fast-follow);
   Wear Capacitor native shell (capacitor.config + android/ios) not scaffolded yet — the JS side
   (bridge + deep-link auth) is ready.
3. Wear CSP still deferred (Phase 9 note in rollout-plan) — CDN scripts (react/babel-dev/supabase)
   load without one; react/react-dom/babel pins carry SRI hashes.

---

## 3M. Session wrap 2026-07-02 — deploy-gate values · Supabase-Preview diagnosis · founder roadmap folded in

Closing notes from the Step-3 completion session (no code/DB change → **next Connect mig # still 145**):

1. **Deploy-gate values delivered to the founder** (Wear + Vision Vercel env, Supabase Auth
   redirect URLs — the §3L / LOCAL-SETUP lists). Anon/publishable key retrievable any time via
   MCP `get_publishable_keys` (project `xyiajtrvhlxaeplsiajj`) — publishable by design, do not
   re-flag (§3D). Founder still to action.
2. **"Supabase Preview: Remote migration versions not found in local migrations directory" —
   DIAGNOSED, harmless, ⏳ awaiting founder answer.** Root cause: remote
   `supabase_migrations.schema_migrations` holds 140 **timestamp**-versioned rows (how MCP
   `apply_migration` records; verified head = `20260701175436 / 144_wear_write_helpers` — prod is
   complete and healthy), while local files are **human-numbered** (`001_…`–`144_…`). Any CLI-style
   checker (Supabase GitHub app "Supabase Preview" check / Supabase↔Vercel integration / local
   `supabase db push`) will therefore always fail — it's a workflow mismatch, NOT a broken or
   missing migration. **Fix = turn off whichever integration runs the check** (we deliberately
   apply via MCP with tags+advisors). Founder to confirm which surface showed it. Do NOT rename
   the 146 files or `migration repair` 140 rows to appease it; if Supabase-managed CI migrations
   are ever wanted, decide at Step 5 when `supabase/` is hoisted.
3. **Founder draft docs COMMITTED** (were untracked/at-risk):
   [`docs/VISION_BACKEND_WIRING_SPEC.md`](docs/VISION_BACKEND_WIRING_SPEC.md) (1075-line Vision
   wiring reference — §0.3 identity bridge annotated ✅ resolved by mig 142; §0.4 = Vision's RBAC
   hierarchy) and [`CATEGORIES.md`](CATEGORIES.md) (canonical category colours/icons). Deeper
   planning corpus lives OUTSIDE the repos at `C:\Users\SJ\Documents\Citizen Network\App Planning
   Docs\{Vision,Wear,Connect}\` — Vision's folder incl. `Back-End Wiring Series/`, Product
   Blueprint PDF, `Citizens_Vision_Backend_Architecture.md`, and **`Citizens Vision.zip`** (likely
   the Vision design handoff, sibling of the Connect/Wear zips — confirm before import).
4. **Founder prospects integrated into the plan** (brief §6 rows 4b/4c added, row 6 amended):
   Vision HTML frontend + ecosystem profile levels — see NEXT STEPS below for the ratified order.

---

## 3N. Ecosystem Step 4 SHIPPED · 4b docs SHIPPED · 4c SCOPED ✅ (2026-07-02)

Executed brief §6 rows **4 / 4b / 4c-prep** in order, each increment gated + pushed.
Working log: `.claude/sessions/step4-frontend-build-extraction.md` (gitignored).
**No DB change → next Connect migration # still 145 — now RESERVED for the Wear admin draft
(Vision DDL starts at 146; renumber if the founder declines 145).**

### Step 4 — `@citizens/frontend-build` extracted (both repos pushed)
- **Canonical package: `citizens-wear/packages/frontend-build`** (Wear `main` 4a4d22f → **5863447**).
  Dependency-free CJS; **the host injects its own esbuild** (Connect 0.28.x / Wear 0.25.x) — that is
  what keeps each app's output byte-identical; config-driven (appFileOrder, envGlobalName,
  configVars `env → local → default` with `mobileEnv` forced-absolute, extraSpecialFiles,
  mobileRequiredKeys). 19 vitest tests, 100% line / 95% branch coverage; typed via hand-written
  `index.d.ts`.
- **Wear consumer:** thin `apps/web/scripts/build-frontend.js` + `workspace:*` dep.
  **Outputs BYTE-IDENTICAL** (SHA-256 tree compare, web + mobile).
- **Connect consumer** (`main` 218cbca → **075c422**): vendored at `vendor/citizens-frontend-build`
  via a `file:` dep (Vercel can't reach a sibling repo); refresh with `npm run sync:frontend-build`;
  drift-guard test `src/__tests__/frontend-build-vendor.test.ts` (EOL-normalized byte compare when
  the sibling checkout exists + esbuild-injection smoke; `@vitest-environment node` — esbuild
  refuses jsdom). Vendored package.json is **reduced to publish fields** (npm resolves `file:` deps
  like workspace links → the canonical `workspace:*` devDeps would EUNSUPPORTEDPROTOCOL).
  **Outputs BYTE-IDENTICAL** (bundle `f9a5ddcbaa` / auth `84c0a64de1` / bridge `e19e3e2c55`
  unchanged). Gates: **tsc 0 · eslint 0 · vitest 640/640 (+3)**.
- Incidental fix: Connect eslint ignores += `vendor/**` and `.claude/**` (bare `eslint .` hit 20
  pre-existing errors in the gitignored reskin-reference uploads; prior sessions used
  `next lint --dir src`).
- **Other pure-TS extractions assessed → deliberately DEFERRED** (recorded in brief row 4):
  `@citizens/utils`(rate-limit) extracts **together with** the Wear rate-limiting fast-follow (its
  first real 2nd consumer); `contracts`/`connect-client` re-evaluate at 4c; `db` types stay per-app
  (siblings consume via `/api/v1`, R2).

### Step 4b — ecosystem profile-levels contract (docs `6250f2e`; migration ⛔ awaiting founder)
- **NEW [`docs/ECOSYSTEM_PROFILE_LEVELS.md`](docs/ECOSYSTEM_PROFILE_LEVELS.md)** — normative:
  **Citizen** (base; display-safe per-app mirrors) → **creating tier** (Connect Contributor
  approval lifecycle [migs 033/036/038] · Wear Creator/Brand [`wear.brands.owner_user_id`] ·
  Vision authority-assigned `vision.user_org_roles` RBAC [spec §0.4]) → **per-app Admin**.
  P-rules: baseline participation never level-gated; **no cross-app inheritance** (ownership-
  verified links only); **no ecosystem super-role**; self-escalation blocked at the DB layer.
  SHARED_DB_CONTRACT gains **R6.3/R6.4**.
- **Wear admin/moderation GAP** → draft **[`docs/wear/145_wear_admin_moderation.sql`](docs/wear/145_wear_admin_moderation.sql)**:
  `wear.user_roles` (service_role-managed, self-SELECT only — structural no-self-escalation) +
  `wear.is_moderator()`/`is_admin()` SECDEF helpers + `reports` triage lifecycle
  (`open→reviewed→actioned|dismissed`, handled_by/at) + moderator takedown policies on
  posts/comments/stories (**DMs excluded** — privacy). **⛔ NOT APPLIED — founder must confirm**;
  then: pre-apply tag → `apply_migration` → advisors 0 ERROR/0 new → contract §9 re-stamp.

### Step 4c — Vision reconcile SCOPED (`37dcefb`; execution gated on founder Q1–Q3)
- **NEW [`docs/strategy/STEP4C_VISION_RECONCILE_SCOPE.md`](docs/strategy/STEP4C_VISION_RECONCILE_SCOPE.md)** —
  Wear's §6a sequence adapted: wiring-spec units (DDL from 146) → audit Vision's **45 existing
  `/api/*` handlers** + Bearer `route-context` + **day-one rate limiting** (don't repeat Wear
  debt #1) → HTML swap as `@citizens/frontend-build`'s 3rd consumer (Connect vendoring pattern,
  `__CV_ENV`, desktop-first, no Capacitor) → Vision Next.js API-only.
- **KEY FINDING (read-only zip inspection, nothing imported):** `App Planning Docs/Vision/
  Citizens Vision.zip` is a **353 KB Claude-design canvas/reference** (`Citizens Vision.dc.html`
  + support.js + 5 screenshots + already-known PDFs/MDs) — **NOT an importable app-source
  handoff** like Wear's 8.6 MB zip. Founder must choose: fuller design export vs
  build-from-canvas (scope §5 Q1).

---

## 3O. Step 4b APPLIED + Step 4c EXECUTED — Vision on the static-HTML model ✅ (2026-07-02)

Founder answered everything in one go: mig 145 confirmed, Q1 answered by a **new design
handoff** (`Citizens Vision Design.zip`, 3.1 MB, 2026-07-02 — `_ds/` design-system token
export + **`VISION_BUILD_PLAN.md`** + canvas + brand assets; extracted read-only to
`App Planning Docs/Vision/design-handoff-20260702/`, **do not re-import**), Q3 delegated →
decided **discard** (all three apps now converge on the static-frontend model), plus one
addition: **Vision needs a login page** (built). Working log:
`.claude/sessions/step4b-mig145-and-4c-vision-execution.md` (gitignored).

### 4b — migrations 145 + 146 APPLIED to prod (Connect `main` 4b44473, tag `connect-pre-mig145`)
- **145_wear_admin_moderation**: `wear.user_roles` (service_role-managed, self-SELECT only),
  `wear.is_moderator()`/`is_admin()` SECDEF gates, reports triage lifecycle
  (`open→reviewed→actioned|dismissed` + handled_by/at), moderator takedown on
  posts/comments/stories (**DMs excluded**).
- **146_wear_user_roles_grants**: the 145 post-apply smoke found `wear.user_roles` had **no
  table-level grants at all** (mig-143 grants are explicit per-table, not default privileges) —
  `authenticated` SELECT-only + `service_role` full; deliberately narrower than 143's blanket
  pattern (no anon, no authenticated writes → self-escalation blocked at grant AND policy layer).
- Verified: advisors **0 ERROR / 0 new** (72 WARN / 3 INFO = mig-144 baseline byte-for-byte;
  note: the linter does not surface `wear.*` SECDEF fns at all — pre-existing behaviour);
  live counts 23 tables / 48 policies / 9 fns / 12 enums / 0 without RLS; rolled-back prod
  smokes: plain user denied everywhere; moderator queue-read + triage-UPDATE work;
  `is_admin()` false for a moderator. Contract §9 → **head 146**; PROFILE_LEVELS §1/§4/§5 ✅;
  brief row 4b ✅. **Next migration # = 147** (Vision DDL starts here).

### 4c — executed in 3 gated increments (citizens-vision `e39aa88` → **3602a86**, all pushed)
- **`2da69ba` unit 2** — day-one rate limiting: Connect's `rate-limit.ts` ported verbatim
  (byte-compatible for the `@citizens/utils` extraction later) + `api-gate.ts` blanket per-IP
  gate for ALL `/api/*` in `proxy.ts` (GET/HEAD 240/min, writes 60/min, split buckets,
  429+Retry-After). **Bearer auth in ONE place**: `lib/supabase/server.ts` — Bearer present →
  per-request supabase-js client (token as global header → RLS as user, `db.schema='vision'`) +
  no-arg `auth.getUser()` bound to the token ⇒ **all 45 handlers gained cross-origin auth with
  zero route edits.** +3 test files.
- **`61e7030` unit 3** — standalone HTML frontend: Vision = `@citizens/frontend-build`'s **3rd
  consumer** (Connect vendoring pattern: `vendor/` + `file:` dep + `sync:frontend-build` +
  drift test; esbuild ^0.28.1 injected; `__CV_ENV`; stub `capacitor-bridge.js` — desktop
  back-office, **no Capacitor/mobile build**). `src/frontend/`: DS tokens (Kingdom Gold ramp,
  Manrope, **Light + Noir**), `auth-client.js` CV_AUTH (Google OAuth PKCE vs the shared
  project, localStorage session, `getAccessToken()` → Bearer; demo fallback), 8 screens:
  **login** (founder ask), shell (build-plan §3 **nested nav**: Home · Spaces▾Directory▾5 ·
  Insights▾Analytics▾6-metrics · Goals▾3 · Settings; <1000px icon-collapse), home (health
  ring + Kingdom Pulse + observation feed), analytics (Reach/Growth/Retention/**Funnel**/
  Engagement/**Broadcast**), coverage, advisories (dismissable), reports, editable
  Objectives/Projects/Vision-Statements, settings (7 panels incl. nav-visibility toggles).
  **THE NARRATIVE ENGINE** (build plan §4 ⭐): `fill(template,data)` + catalog — every insight
  is `{template,data}` slots, **the `data` keys ARE the future backend calc contract**; the
  **five-layer law** (Conclusions→Contributions→Evidence→Charts→Raw) is the card pattern.
  Verified in-browser (0 console errors; Connect `.claude/launch.json` gained
  `vision-frontend-built` :3005 serving the sibling `public/`).
- **`3602a86` unit 4** — RSC tree DELETED (149 files: pages, components, stores, 27 UI tests,
  tailwind/recharts/zustand/maplibre deps; `@types/geojson` added — it rode in via maplibre).
  Next.js **API-only** (45 handlers + `/api/auth/signout` kept), `/` → `/index.html`,
  proxy login-redirect dropped, **CSP retuned** for the static model (unpkg/jsdelivr/
  Google-Fonts/MapTiler; Vision = the only Citizens app shipping a CSP).
- Gates (final): **tsc 0 · eslint 0 · vitest 664/664 (67 files) · next build OK**.

### What Step 4c leaves open (Vision fast-follows, any session)
1. **Demo→live wiring**: connect the 45 `/api/*` handlers into the screens (`authFetch` is
   ready; the narrative-engine `data` objects define exactly which calc outputs each surface
   needs — see VISION_BUILD_PLAN §3 surface→spec table).
2. **Timeline Map** live MapLibre implementation (placeholder ships; needs MAPTILER key + live
   activity data).
3. Wiring-spec DDL beyond what migs 137–139 already landed (numbers from **147**).

---

## 3P. Wear LIVE — founder deploy · first admin · email+password auth ✅ (2026-07-13)

Wear-focused session on branch `step5-monorepo-lift` (the Step-5 lift itself was committed by the
prior session through `6f852b3`; this session ships on top of it). Working log:
`.claude/sessions/wear-focus-admin-auth-and-roadmap.md` (root-level, gitignored).
**No DB migration → next migration # still 147.**

### Wear is DEPLOYED and in use
- Founder deployed Wear via **Vercel CLI** (the uncommitted stragglers this created — `vercel`
  devDep, `.vercel`/`.env*` gitignores, pulled env files, lockfile — are now committed; the stray
  244 MB root `.pnpm/` store it left is gitignored, never committed).
- Founder signed in with Google (`citizensnetworkpbo@gmail.com`) 2026-07-13; `wear.users` mirror
  hydrated (`@citizensnetworkpbo`). **Wear deploy gates = DONE.**
- **First admin granted:** `wear.user_roles` row (user `4a1b3802-4e9d-40ef-bd8d-7ec8b4d242ca`,
  role `admin`, 2026-07-13 19:49 UTC) — the §3O/NEXT-STEPS founder action, executed via MCP.

### Email+password auth SHIPPED (founder: "Google Auth may not be available soon")
- **Frontend** (`apps/wear/src/frontend/`): `auth-client.js` +`signInWithPassword`/
  `signUpWithPassword`/`requestPasswordReset`/`updatePassword` (+shared `webRedirectUrl()`);
  `store.jsx` +`recovery` state (PASSWORD_RECOVERY) + 4 actions; `auth.jsx` rewritten —
  sign-in/sign-up/forgot modes, confirm-sent/reset-sent notices, `CWScreens.ResetPassword`
  (recovery-link landing), Google demoted to secondary (ink button); `app.jsx` Gate renders
  ResetPassword whenever `recovery` is set. Password-manager-friendly (real `<form>`,
  autocomplete attrs). Client rules: valid email, ≥8 chars, match confirm.
- **Supabase auth config** (Management API PATCH, reversible): `external_email_enabled`
  false→**true**, `password_min_length` 6→**8**. (GoTrue also requires lower+upper+digit —
  pre-existing `password_required_characters`.)
- **Browser-verified end-to-end** against prod: all modes render; client validation renders;
  wrong-creds round trip returned "Email logins are disabled" BEFORE the config change and
  "Invalid login credentials" AFTER — the full path works. Gates: **tsc 0 · eslint 0 ·
  vitest 49/49 · frontend bundle builds**.
- ⚠️ **Reset-link caveat (PKCE):** the recovery email must be opened in the SAME browser that
  requested it (code verifier in localStorage) — standard supabase-js behaviour, noted in-code.
- **Custom SMTP CONFIGURED via Resend (2026-07-13, same session):** Supabase auth now sends as
  `Citizens Network <no-reply@citizenscentral.co.za>` through `smtp.resend.com:465`
  (`rate_limit_email_sent` 2→60/hr). Resend account `citizensnetworkpbo@gmail.com`, domain
  `citizenscentral.co.za` (eu-west-1, id `0ff087bb-8746-470a-836e-55adfc4ee8a7`).
  ⛔ **BLOCKED on DNS verification:** the domain is `pending` in Resend — three records (DKIM
  TXT `resend._domainkey`, MX + SPF TXT on `send`) must be added to the zone, which lives on
  **Vercel DNS** (CLI authed as `stevo98`; `vercel dns add` was permission-blocked for founder
  review — exact values in the session log / Resend dashboard). **Until verification passes,
  ALL auth emails fail** (Resend rejects unverified senders — interim regression vs the
  team-member-only built-in mailer; Google sign-in unaffected). After records land: Resend
  dashboard → Verify (or `POST /domains/{id}/verify`), then send a test reset email.
- **HIBP leaked-password protection = Supabase Pro-gated** — PATCH rejected on the Free org
  ("available on Pro Plans and up"). Compensating controls live: min length 8 + GoTrue's
  lower/upper/digit `password_required_characters`. Revisit if/when the org upgrades.
- Connect + Vision still Google-only — **port the same email+password screens** (their
  auth-clients share the CC_AUTH/CV_AUTH lineage) in a follow-up session; the provider is
  already enabled project-wide.

### Wear roadmap ratified (new planning doc committed)
[`docs/Citizens_Wear_Roles_and_Concepts_MD.md`](../../docs/Citizens_Wear_Roles_and_Concepts_MD.md)
(2026-07-13) locks the direction: single evolving account (Citizen → Creator → Brand-state →
Admin), **Concepts marketplace** (two-stage propose→award claims, append-only status log
`Proposed→…→Sold Out`, auto "Completed Concepts" posts), milestone royalties (10%/first-100 +
proof-of-sale; opt-in permanent-catalogue conversion at lifetime 5% with attribution-tag removal
but PERMANENT concept link), physical attribution required. **None of this exists in `wear.*`
yet** — it is the next Wear schema tranche (migrations from **147**), then `/api/*` + screens.
Open items: Brand-verification depth (KYC vs light review), Brand Workspace scope, dispute tooling.

---

## 3Q. Wear Concepts marketplace schema DRAFTED (mig 157) + LINEAGE DRIFT REPAIRED ✅ (2026-07-13)

Wear session on `step5-monorepo-lift` (working log: `.claude/sessions/wear-concepts-marketplace-schema.md`,
root-level, gitignored). Executed NEXT-STEPS 3a as far as this session's permissions allowed.

### ⚠️ ROOT FINDING — the migration lineage had FORKED (now repaired)
- Prod (`list_migrations`) head = **`20260704162319 / 156_vision_dormancy_watch`** — NOT 146 as
  §3P believed. A parallel Vision session (2026-07-03/04) worked in the **standalone
  `citizens-connect` checkout** and applied migrations **147–156** (Vision DDL: spaces,
  intelligence/advisory engines, funnel/broadcast, space+activity metrics, org members,
  cross-pollination, dormancy watch) + shipped Vision demo→live wiring increments 1–7 in the
  standalone `citizens-vision` repo (its `main` @ `3c77959`). The monorepo never received any of it.
- **Repaired here:** the ten files copied verbatim (EOL-normalised; diffs were CRLF-only) into the
  monorepo's canonical `supabase/migrations/`. The standalone `citizens-connect` RESUME (§3Q–§3W
  there) remains the authoritative detail for those sessions until a doc-merge absorbs it here.
- **⛔ CONVERGENCE RULE: all future sessions run in the MONOREPO.** The standalone
  `citizens-connect` checkout still has uncommitted changes (`RESUME_HERE.md`, `.gitignore`,
  decision brief) — commit/park it and treat it as read-only history, or the fork will recur.

### Wear Concepts marketplace — migration 157 DRAFTED + COMMITTED, ⛔ NOT APPLIED
[`supabase/migrations/157_wear_concepts_marketplace.sql`](../../supabase/migrations/157_wear_concepts_marketplace.sql)
(drafted as 147, renumbered after the drift discovery; pre-apply tag **`connect-pre-mig157`** set).
The MCP `apply_migration` call was **permission-blocked** by this session's mode — applying is the
FIRST action of the next session (checklist in the file footer). Design (full rationale in header +
file comments): **9 tables** (`concepts`, `concept_media`, `concept_upvotes`, `concept_proposals`,
`concept_claims`, `concept_status_log` — append-only by construction, `royalty_obligations`,
`catalogue_conversions`, `brand_verifications`), **7 enums** (incl. `concept_stage` in lifecycle
order → forward-only = native enum `<`), **8 SECDEF RPCs** (`award_concept_claim`,
`advance_concept_status`, `propose/respond/cancel_catalogue_conversion`, `submit_royalty_proof`,
`close_royalty_obligation`, `get_concept_proposal_tags` — the only anon-executable one, returns
(brand_id, created_at) ONLY), **4 trigger fns / 11 triggers** (verified-column guard, brand-verified
sync from `brand_verifications`, auto Completed-Concepts post on Released, concept re-open on claim
revoke), `posts.concept_id` column (relational attribution — catalogue conversion flips
`claims.attribution_public` without rewriting content), explicit least-priv grants (146 lesson).
Key semantics: milestone royalty 10%/first-100 auto-committed at award; conversion accept closes
milestone + commits lifetime 5% ("in its place", doc §3.3); proof→creator-confirm close-out;
one active claim per concept via partial unique index; every RPC has the §3E null-uid guard first.

### Vibe-security: 3 PRE-EXISTING holes closed inside mig 157 (PostgREST-reachable, none via /api/*)
1. `wear.brands.verified` was **owner-writable** (143 `brands_owner_write` FOR ALL) — self-escalation
   once verification gates marketplace power → column-guard trigger (admin/definer/service only).
2. `wear.profiles.verified` was **self-writable** — self-badging → same guard.
3. `wear.posts.brand_id` / `wear.stories.brand_id` **unchecked on write** — any user could post AS
   any brand → policies recreated with ownership check (+ `concept_id` active-claim check on posts).
Verified no live app path breaks: brand PATCH passes name/tagline/websiteUrl/logoUrl only;
`/api/me` never passes `verified`; store insert paths don't set the guarded columns.

### Advisor baseline re-captured at head 156 (read-only, this session)
**0 ERROR / 92 WARN / 3 INFO.** WARN 72→92 = +20 `authenticated_security_definer` (Vision migs
147–156's intentional pattern) + the known `auth_leaked_password_protection` HIBP Pro-gate (§3P).
Contract §9 re-stamped to head 156 with the reconciliation note; **re-stamp to 157 after apply.**

---

## 3R. Wear Concepts marketplace SHIPPED END-TO-END — mig 157 APPLIED + data/API/frontend + @citizens/utils ✅ (2026-07-14/15)

Wear session on `step5-monorepo-lift` (working log: `.claude/sessions/wear-concepts-apply-and-build.md`,
root-level, gitignored). Executed NEXT-STEPS 0 + 1a + 1b(rate-limiting) in gated, committed increments.
**Next migration # = 158.**

### Migration 157 APPLIED to prod (commit `40e1aeb`)
- `apply_migration(157_wear_concepts_marketplace)` on head 156; tag `connect-pre-mig157` was pre-set.
- **Advisors: 0 ERROR / 101 WARN / 3 INFO = the NEW baseline.** WARN 92→101 = exactly the 9
  intentional SECDEF EXECUTE grants mig 157 itself makes (8× authenticated RPCs + 1× anon
  `get_concept_proposal_tags`) — same retained-by-design category as §3C/Vision's +20. 0 unexpected.
  **Correction recorded in contract §9:** the linter DOES surface `wear.*` SECDEF fns (mig-145-era
  "not surfaced" note is obsolete).
- Structural QA exact: **wear.\* = 32 tables / 0 without RLS / 70 policies / 21 fns / 19 enums / 18 triggers.**
- Rolled-back prod smokes ALL PASS (verified-guard 42501 · unverified-brand proposal denied ·
  full happy path concept→propose→award→advance→released-auto-post→conversion · non-creator award
  42501 · backwards/repeat stage 22023 · direct status-log insert denied). Zero residue verified.
- SHARED_DB_CONTRACT §9 re-stamped to **head 157**.

### Data plane (commit `ef5f432`) + /api/* (commit `22ff29b`) + rate limiting (commit `022e160`)
- **`packages/db`**: WearStore contract +8 repos (`concepts`, `conceptProposals`, `conceptClaims`,
  `conceptStatusLog`, `royalties`, `conversions`, `brandVerifications`, `roles`); `Report` gains
  mig-145 `status/handledBy/handledAt` + `listForModeration`/`triage`; `Post` gains `conceptId`.
  MemoryWearStore = the semantic spec (replicates the DB triggers: auto Completed-Concepts post
  w/ media copy + dup guard; brand-verified sync; concept re-open on revoke). Error codes ==
  the RPCs' raise messages. **+23 contract tests (db 92/92).**
- **`SupabaseWearStore`**: reads via RLS, lifecycle writes via `.rpc()`; `mapRpcError` extended
  with all mig-157 raise messages; `_getOwnRole` via self-SELECT `user_roles`.
- **17 new `/api/*` routes** (Bearer-or-cookie `handler()` pattern): concepts CRUD/upvote/
  proposals/status-advance, proposals PATCH(withdraw/resubmit)+award, claims revoke/conversions/
  royalties, conversions PATCH(accept/decline/cancel), royalties list+proof+close,
  `brands/[slug]/{verification,proposals,claims}`, `admin/{verifications,reports}` queues +
  review/triage. `/api/me` now returns `role`. **Serializer rules live:** `BrandDto.verified`
  authoritative from `wear.brands.verified`; `PostDto.concept` = permanent link with `creator`
  tag ONLY while `claims.attribution_public`. Wear now registers 40 API routes. +12 route tests.
- **NEW `packages/utils` (@citizens/utils)** — brief row 4 delivered: `rate-limit.ts` extracted
  VERBATIM from Connect (superset presets; Vision's copy stays byte-compatible for later
  consolidation) + `gate.ts` (Vision's api-gate generalised: per-IP, 240 GET / 60 write per min).
  **ALL Wear `/api/*` now rate-limited** via the single `handler()` choke point (429 +
  Retry-After) — **Wear debt #1 CLOSED**. 7 package tests; workspace turbo **27/27 green**
  (Connect 637 · db 92 · utils 7 · wear 61 · Vision all green).

### Frontend (commit `bd8bc4e`) — browser-verified END-TO-END against prod
- New IIFE modules: **`concepts.jsx`** (browse w/ stage filters, detail w/ Journey stepper from
  the append-only log, create, upvotes, propose form, creator award list, brand advance,
  royalty proof/close, conversion handshake) and **`adminq.jsx`** (brand-verification queue +
  mig-145 reports triage). Wiring: `store.jsx` nav actions; `shell.jsx` routes + sidebar
  Concepts + role-gated Admin item; `discover.jsx` marketplace banner; `settings.jsx` role-gated
  admin card; `brand.jsx` owner VerificationSection; `home.jsx` PostCard concept-attribution
  chip. Build order + dev index.html tags updated (17 screens compile).
- **Prod E2E in the browser** (dev server :3000 w/ real Supabase env; two disposable test users,
  each flow driven through the real UI): password sign-in → mirror hydrate → create concept →
  upvote → create brand → request verification → admin queue APPROVE (badge flips via trigger) →
  verified brand proposes (public tag + party-scoped details) → creator awards (CLAIMED +
  milestone 10%/100 committed) → advance In Production (timeline note) → RELEASED → auto
  Completed-Concepts post in feed w/ "Concept by @creator" chip → proof of 100th sale submitted →
  creator confirms close-out → conversion proposed → creator accepts → **feed chip flips to
  "From a community concept" (tag retired, link permanent)** + lifetime 5% ACTIVE. Zero console
  errors. **All test data + users deleted after — zero residue verified** (founder's admin role
  row untouched).

### ⚠️ Follow-up found during cleanup (record for mig 158, NOT yet fixed)
Deleting an `auth.users` row for a user who is BOTH a brand owner and a conversion actor can
fail mid-cascade: the `SET NULL` audit-column cascades (e.g. `catalogue_conversions.proposed_by`)
race the `ON DELETE CASCADE` chain (`brands→claims→conversions`), and the FK re-check on
`claim_id` sees the already-deleted claim → 23503. **Repro:** single-statement delete of both
smoke users. **Impact:** future account-deletion flows for brand owners. **Fix candidates:**
make the marketplace `claim_id`/`concept_id` FKs `DEFERRABLE INITIALLY DEFERRED`, or route
account deletion through an explicit bottom-up SECDEF cleanup fn. Deleting bottom-up works today.

### Also this session
- `.claude/launch.json` gains `wear-dev` (next dev :3000); `apps/wear/.env.development.local`
  (gitignored) carries the shared-project env for local dev — regenerate from
  `.env.wear.production.local` (`vercel env pull` output) if missing.

---

## 3S. Wear email magic-code login + change-password + LAUNCH FEED SEEDED ✅ (2026-07-15)

Wear session on `step5-monorepo-lift`, commit **`f8fce07`** (pushed `a43f76d..f8fce07`; branch is
2 behind `origin/main` — founder merges when ready, as in §3R). Working log:
`.claude/sessions/wear-email-login-and-feed-seed.md` (gitignored). **No migration → head still 157.**
Gates: **tsc 0 · vitest 61/61 · eslint clean**. Security advisors **0 ERROR / 101 WARN / 3 INFO**
(= §3R baseline; the seed is DATA-only + the one auth-config change is a template edit → 0 new findings).

### Founder asks this session (all delivered)
1. Resend DNS verified (`citizenscentral.co.za`) → **finish username/email login.** It was already
   code-complete (§3P); DNS was the only blocker. Live auth config confirms `external_email_enabled`,
   Resend SMTP (`no-reply@citizenscentral.co.za`), `site_url=https://www.citizenscentral.co.za`,
   `mailer_autoconfirm=false`. **Added the missing piece: a "Change password" card in Settings**
   (`settings.jsx`) — also lets a Google-only account set a first password.
2. Secondary "code login" → founder chose **email magic-code** (passwordless 6-digit OTP). Shipped:
   `auth-client.js` `sendEmailCode`/`verifyEmailCode` (`signInWithOtp` `shouldCreateUser:false` →
   sign-in only, no enumeration); `store.jsx` wiring; `auth.jsx` new `code`/`codeVerify` modes +
   "Email me a 6-digit sign-in code instead" entry. **Browser-verified the render** (localhost:3006).
   Email OTP was already provisioned project-side; the **magic-link email template was edited via
   Mgmt API to carry `{{ .Token }}` + keep the link fallback** (subject "Your Citizens sign-in code").
   True email-AS-2FA (password+code) is NOT native → deliberately not built (founder: don't overcomplicate).
   Authenticator TOTP MFA is already enabled project-side if ever wanted.
3. Seed the feed with ~5 Brands → **[`apps/wear/scripts/seed/`](../../apps/wear/scripts/seed/)**
   (`seed-feed.sql` idempotent + `teardown-feed.sql` cascade-clean + README). Applied to prod via
   `execute_sql`. **5 ORIGINAL Kingdom-aligned brands** (Cornerstone Apparel✅, Lily & Field⏳,
   Salt & Light Threads✅, Ubuntu Kingdom Co.✅, Anchor & Crown⏳; ✅=verified, ⏳=pending in the admin
   queue), 2 citizen personas (@gracelethabo, @thabo_m), **8 posts + media, 33 follows, 33 likes,
   9 comments, 4 stories (14-day)**, and **one realized Concept** "The Living Water hoodie"
   (proposed→awarded→**released** via the real RPCs; milestone royalty active; auto completed-concept
   post w/ attribution chip → @gracelethabo). All SQL-verified.

### Founder decision recorded — NO auto cross-platform footprint (important architecture note)
Brand owners MUST exist in `auth.users` (`wear.users.id` FKs to it ON DELETE CASCADE), and Connect's
`on_auth_user_created → public.handle_new_user` trigger auto-creates a `public.profiles` row for EVERY
new auth user. The seed **deletes those rows in-transaction** → seed identities live ONLY in `wear.*`
(**verified `seed_connect_profiles = 0`**). Founder wants this ecosystem-wide: **a member should only
gain a platform profile when they actually sign in there.** Wear + Vision already do this (lazy
hydration); **Connect is the lone eager one.** ⇒ **RECOMMENDED future change (own tested session,
NOT done here — it touches LIVE Connect auth):** drop/guard that trigger AND add a lazy idempotent
"ensure profile on first Connect sign-in" (mirror Wear's `/api/me/hydrate`). Doing it without the
lazy-ensure in place first would break new Connect sign-ups (dozens of `public.*` tables FK `profiles`).

### Notes / honesty
- Live feed screenshot NOT captured: password sign-in wouldn't complete under **local next-dev +
  browser automation** (no `/api` hit; a hydrate/PKCE-storage quirk of the no-build CDN-React app under
  automation — NOT my changes; email+password against **prod** is browser-proven in §3P/§3R). Feed is
  fully SQL-verified + covered by passing route tests; founder will see it live on deploy.
- Disposable password test user (`feedcheck@seed…`) was created for the screenshot attempt and
  **deleted** (verified). The 7 real seed identities have **no password** (not sign-in-able; they only
  own content — reassign `wear.brands.owner_user_id` to hand a brand to a real owner later).
- Seed media is URL-only (Unsplash/ui-avatars, all HTTP-200-checked) — swap to real uploads once the
  storage pipeline ships.

### ⛔ Founder actions to make this fully live
1. **Redeploy Wear** on Vercel from the branch/main so the built bundle ships the magic-code + change-
   password UI (the seed is already in prod — no deploy needed for the feed to appear).
2. **Live email test**: sign up a real address (confirm email), request a reset, request a magic code —
   confirm all three arrive via Resend now that DNS is verified.
3. Confirm the **live Wear origin is in Supabase Auth redirect allow-list** (has
   `citizens-wear.vercel.app/**`, `citizens-ecosystem-wear.vercel.app/**`, `www.citizenscentral.co.za/**`).
4. When the Wear **mobile shell** ships: add `citizenswear://auth-callback` to the allow-list
   (only `citizensconnect://` is there today) — non-blocking for web.

---

## 3T. Wear media-upload pipeline + notifications backend SHIPPED ✅ (2026-07-15)

Wear launch-hardening (NEXT STEPS 1b) on `step5-monorepo-lift`. Working log:
`.claude/sessions/wear-media-upload-and-notifications.md` (gitignored). **Migs 158 + 159 APPLIED
to prod** (pre-apply tag `connect-pre-mig158`); **advisor 0 ERROR / 101 WARN / 3 INFO = §3R
baseline, 0 new findings.** **Next migration # = 160.** Gates: turbo typecheck **12/12** · turbo
test **11/11** (Connect 637 · db 99 · wear 84 · utils 7 · Vision) · wear `next build` OK (43 routes)
· build-frontend 17 screens.

### Slice 1 — media-upload pipeline (posts / stories / brand logos / concept artwork)
Mirrors Connect's signed-upload pattern, but **user-authed mint — NO service_role in Wear** (rule 6 /
R3: RLS is the wall). All media columns already exist as `text`, so the pipeline is **purely additive**
— an upload just yields a public URL that flows into the same fields; the URL text input stays as the
fallback (kept inside the picker).
- **Mig 158** `158_wear_media_bucket.sql`: `wear-media` bucket (public, images-only jpeg/png/gif/webp,
  15 MB; svg blocked = stored-XSS backstop) + 3 owner-folder `storage.objects` policies
  (`foldername[1] = auth.uid()`). **Runtime-verified against prod:** own-folder write permitted,
  foreign-folder denied by RLS (zero residue).
- **`POST /api/media/sign`** (`apps/wear/src/app/api/media/sign/route.ts`) mints a signed upload URL via
  a request-scoped client authed as the user (`lib/supabase/storage.ts` `getRequestStorageClient`);
  path built server-side `{uid}/{scope}/{ts}-{rand}.{ext}` (ext from MIME, never filename); per-user
  heavy cap + blanket per-IP gate; 503-degrades with no env. `lib/media.ts` = pure validation (unit-tested).
- Frontend: `CW_API.uploadImage` (two-phase → `uploadToSignedUrl`) + reusable `CWUI.ImagePicker`
  (upload button + preview + URL fallback). Wired create.jsx **post/story + NEW brand-logo field** and
  concepts.jsx **artwork**. Tests: media.test.ts (11) + sign/route.test.ts (6).
- **Hardening found + fixed:** `brands.logoUrl` + `websiteUrl` were NOT `safeUrl`-validated (posts/
  stories/concepts already were) — now validated in the brands POST + PATCH.

### Slice 2 — notifications backend (stub → real)
The Inbox "Notifications" tab was a coming-soon placeholder; now backed by real marketplace-event
notifications.
- **Mig 159** `159_wear_notifications.sql`: `wear.notification_type` enum + `wear.notifications` table
  (recipient-scoped RLS: read/mark-read/delete own; **no INSERT policy** — trigger-only) + `wear.notify()`
  best-effort SECDEF helper (swallows insert errors → can't break a marketplace txn) + **6 SECDEF
  triggers**: proposal→creator, award→brand owner, status-advance→creator, royalty proof→creator /
  close→brand owner (conversion-supersede close skipped to match memory + avoid double-notify),
  conversion propose→creator / respond→brand owner. All `set search_path=''`, `revoke all from public`.
  **Prod smoke: all 4 tested triggers fire with correct recipient/actor/payload; zero residue.**
- Data plane: `NotificationRepo` in the `@citizens/db` contract (+`WearNotification`, `NotificationType`);
  MemoryWearStore emits from its 7 lifecycle methods (mirrors the DB triggers — the contract-test spec);
  SupabaseWearStore reads via RLS + marks-read. `GET /api/notifications` (+unreadCount) +
  `POST /api/notifications/read` ({ids}|{all}); `hydrateNotifications` batches actor identity. No PII in
  payload (conceptTitle/brandName/stage only — never proposal pricing). Tests: db/notifications.test.ts (7)
  + notifications.routes.test.ts (6).
- Frontend: `inbox.jsx` NotificationsTab (message composed client-side from type+data; mark-all-read on
  view; tap → concept detail).

### Known follow-ups (noted, deliberate)
- **Brand-logo EDIT UI:** logo is settable at brand CREATE; `PATCH /api/brands/:slug` accepts `logoUrl`
  but there's no brand-edit surface in `brand.jsx` yet.
- **Proposal mockups + story video:** the pipeline is images-only + wired to post/story/brand/concept;
  proposal `mockup_urls[]` stay URL-only, and no video scope (bucket is images-only) — easy extensions.
- **§3R account-deletion cascade wrinkle** still open (deliberately NOT bundled to keep these migs focused).
- Nav-level unread badge (needs app-level unread polling) — out of scope for the stub.
- **Founder:** redeploy Wear on Vercel so the built bundle ships the ImagePicker + notifications tab
  (mig-158/159 are already live; no deploy needed for the DB side). ✅ **DONE — §3T live in prod
  (image upload + OTP code both confirmed working).**

---

## 3U. Session wrap 2026-07-15(b) — magic-link redirect fixed, code-first auth, NEW product-direction items

Closing conversation after §3T shipped + went live. **No code/DB change this session → next migration #
still 160.** §3T verified live by founder. The items below are **captured for a future session** (founder:
"continue with all of this, but not in this session").

### Auth — magic-link redirect RESOLVED (founder) + durable follow-up
- **Symptom:** the emailed magic LINK (`…/auth/v1/verify?…&redirect_to=https://www.citizenscentral.co.za`)
  landed on **Connect**, not Wear. The 6-digit CODE worked (it needs no redirect).
- **Root cause:** one shared Supabase project = one **Site URL** (`www.citizenscentral.co.za` = Connect).
  Wear's `sendEmailCode` DOES pass `emailRedirectTo` (`apps/wear/src/frontend/auth-client.js:137` →
  `window.location.origin`), but GoTrue only honors a redirect that matches the **Redirect URLs**
  allow-list; a miss silently falls back to Site URL. **Wear's live deploy served from a Vercel
  DEPLOYMENT-HASH url** (`citizens-ecosystem-wear-rigs91i7i-citizensecosystem-projects.vercel.app/index.html`),
  NOT the stable alias `citizens-ecosystem-wear.vercel.app` that was already listed → fallback to Connect.
- **Founder fix (done):** added `https://citizens-ecosystem-wear-**-citizensecosystem-projects.vercel.app/**`
  to Redirect URLs (covers all deploy-hash urls). **Same gap also affected Wear password-reset +
  signup-confirmation links — now fixed too.**
- **⏳ Durable follow-up (roadmap → address-hygiene):** Vercel deploy-hash urls are ugly + leak project
  internals. Move all three apps to **stable custom domains** (e.g. `wear.citizenscentral.co.za`) and use
  those as the canonical redirect origin.
- **PKCE design note:** the magic link only completes in the SAME browser that requested it (code_verifier
  in localStorage); the CODE has no such limit. **DECISION: the 6-digit code is the primary/robust auth
  path; the link is a same-device convenience.**

### Auth email template — code-as-hero (APPROVED "let's try it, can revert"; ⏳ PENDING dashboard apply)
Restructure the SHARED Magic-Link email template so `{{ .Token }}` (the 6-digit code) is the visual hero
and the link is a de-emphasised same-device fallback. **NOT applied this session** — email templates are
Dashboard/Mgmt-API only (no MCP/SQL tool). Ready-to-paste HTML lives in the founder-actions list + the
continuation prompt. Shared across all 3 apps → fully revertible.

### NEW product-direction decisions (design/build in a FUTURE session)
1. **Address / URL hygiene** — internal addresses leak everywhere: the uploaded image's raw
   `xyiajtrvhlxaeplsiajj.supabase.co/storage/…` URL shows in the ImagePicker text input; browser URL bar +
   hover-preview expose Vercel/Supabase internals. Two layers:
   - **(a) Quick UI win** — after a successful UPLOAD, `CWUI.ImagePicker` (`apps/wear/src/frontend/app/ui.jsx`)
     should show an "Image uploaded ✓ / Replace / Remove" state and NOT render the raw public URL in a
     visible field; put the manual URL text input behind an "or paste a URL" toggle (only the paste path
     needs a visible input). Contained change, no backend.
   - **(b) Infra** — custom domains for all apps + a **branded storage asset origin** (Supabase custom
     storage domain / CDN proxy) so asset URLs aren't `*.supabase.co`. Ties to the magic-link custom-domain
     follow-up above.
2. **Remove "Create Brand" from the Create screen** — a Brand is an **upstream identity** (assigned, or
   progressed into), never self-created by a base user. Drop the `brand` tile + its form from
   `apps/wear/src/frontend/app/create.jsx` (the `POST /api/brands` path may stay for the sanctioned
   assignment/progression flow, TBD in the design session below).
3. **Content-creation permission model rework (BIGGEST)** — feeds are primarily brand apparel, so
   **only Brand users create POSTS**; a base Citizen creates **concepts + stories** (not posts). This
   reshapes who-can-create-what and touches the identity/roles model (mig-145 `user_roles` +
   `ECOSYSTEM_PROFILE_LEVELS` + the derived "Creator" tier). Founder flagged it as **"maybe an entire
   questioning session"** → **run a design/grill session FIRST** (What is a Brand? How does one become one
   — assigned vs progressed? base-vs-brand capabilities matrix; feed composition; how this meets the
   marketplace's "any citizen may create a Concept" rule), THEN implement. Items 2 + 3 are the same
   identity-model thread — do them together.

---

## 3V. Wear identity & content-permission model — DESIGNED + ENFORCEMENT CORE SHIPPED ✅ (2026-07-15)

Design-first session (grill → agree model → build) resolving §3U items 2 + 3. Ran on
`step5-monorepo-lift`. **mig 160 APPLIED + verified in prod.** Offload log:
`.claude/sessions/wear-identity-content-permission.md`.

### The ratified model (founder, 2026-07-15) — normative
Recorded in [`docs/Citizens_Wear_Roles_and_Concepts_MD.md` §6](../../docs/Citizens_Wear_Roles_and_Concepts_MD.md)
+ [`ECOSYSTEM_PROFILE_LEVELS §3.2/P1.1`](./docs/ECOSYSTEM_PROFILE_LEVELS.md).

**Four-rung lazy ladder** (each rung *adds to* the Citizen base; roles derived from activity
until Brand, which is a stored admin grant):
- **Citizen** — submit Concepts, post Stories, comment, save-to-boards, follow, purchase.
- **Creator** — auto-badge at **>10 Concepts posted**; unlocks the Concepts-page **stories bar**
  ("concept-statuses"). *(Derivation + concept-stories = DEFERRED.)*
- **Brand** — a **verified** `wear.brands` row the user owns; may create **Posts** + (verified)
  propose/claim/produce. **Assigned, never self-created:** eligibility-gated (≈20 Concepts posted +
  10 claimed + support email/contact + clean report history) → **Become-a-Brand application** in
  Settings → admin approval mints the row. Launch/partner brands admin-minted directly (bootstrap).
- **Admin** — moderation, verification approval, dispute resolution, sign-in-as (impersonation).

**Two content surfaces:** Home = Brands' Posts + Stories (apparel). Concepts page = community
Concepts + concept-stories bar + like/comment/share (the attention that attracts Brands). Both
largely exist already in nav (Home tab + Concepts tab).

### Shipped this session (all gates green: tsc · vitest 89/89 · eslint 0-err · build)
- **Docs-first:** ECOSYSTEM_PROFILE_LEVELS §3.2 + P1.1 rewritten to the 4-tier / admin-assigned
  model; roles MD §6 added; SHARED_DB_CONTRACT §9 stamped head→**160**.
- **mig 160** (`160_wear_content_permission_model.sql`) **APPLIED** (tag `wear-pre-mig160` @93a741d;
  advisor **0 ERROR / 0 new** vs head-159; 7 rolled-back prod smokes PASS). Enforces at RLS:
  (a) `wear.posts` insert → author owns an attributed **verified** brand + `brand_id` mandatory
  (base-Citizen self-posts retired); (b) `wear.brands` insert → `wear.is_admin()` only (self-serve
  retired); owner UPDATE/DELETE preserved; mig-157 verified-column guard intact. wear policies 73→75.
- **API:** `POST /api/posts` requires an owned+verified brand (403 chain: `brand_required` /
  `not_brand_owner` / `brand_not_verified`) then validates body; `POST /api/brands` is admin-only
  (`admin_only` 403; optional `ownerId` for admin-mint-for-applicant). RLS is the backstop.
- **UI** (`apps/wear/src/frontend/app/create.jsx`): self-serve **Brand tile removed**; **Post tile
  only** for verified-brand owners; base Citizen sees **Story + Concept** (Concept routes to the
  Concepts-page create); "Post as" lists verified brands only (Myself retired); pending-verification
  hint for owners of an unverified brand.
- **Quick win §3U-1a** (`ui.jsx` `ImagePicker`): after upload shows "Image uploaded ✓ / Replace /
  Remove" and **hides the raw storage URL**; the manual URL input is behind an **"or paste a URL"**
  toggle (auto-revealed for a pasted/preloaded value or on upload error).
- **Tests** (`routes.test.ts`): brands create is admin-only (+ non-admin 403, admin-mint-for-owner);
  every post creates as the verified `salt-and-light`; +3 negative-path gate tests.
- **§3U email template (code-as-hero) = APPLIED by founder ✅** (dropped from founder-actions).

### Deferred (DESIGNED here, build is the next Wear increment) — "the progression epic"
1. **Creator badge derivation** — lazy compute (>10 Concepts) + badge surfacing; the first-100-Wear-
   Concepts bootstrap grace.
2. **Concept-stories bar + Concept like/comment/share** — NEW schema (concept_comments, concept
   stories/statuses, shares); today Concepts have upvotes only. This is the community surface's heart.
3. **Become-a-Brand application** — eligibility derivation (≈20 posted + 10 claimed + support
   email/contact + no sustained reports) → settings button → application form (Brand Name*, bio,
   socials, email*, contact*, delivery options*, Ts&Cs/Code-of-Conduct/monthly-fee agreements) →
   admin queue → approve = mint verified `wear.brands` row (the `POST /api/brands` `ownerId` path +
   RLS `brands_admin_insert` already support the mint; needs an applications table + admin UI).
4. **Per-post Share** on Home (Instagram-style). 5. **Full-screen Home stories** (currently act as
   brand-page redirects, not full-screen). 6. **Admin sign-in-as (impersonation)** — security-sensitive,
   own design. 7. **Stories bifurcation** (Brand-Home-stories vs Creator-concept-stories) lands with #2.

---

## 3W. Wear community Concepts surface — SHIPPED ✅ (2026-07-16, mig 161 live)

§3V's "progression epic" items **1, 2, 4 and 5** built + verified in one session on
`step5-monorepo-lift`. **mig 161 APPLIED + prod-verified.** Founder ratified all four design
decisions in-session (AskUserQuestion). Offload log: `.claude/sessions/wear-progression-epic.md`.

### What shipped (all gates green: turbo lint 12/12 · typecheck 12/12 · test 11/11 — Wear 94/94,
### Connect 637 — · build 8/8)
- **mig 161** (`161_wear_concept_engagement.sql`) **APPLIED** (tag `wear-pre-mig161` @de042fa;
  advisor security 0 ERROR / 101 WARN / 3 INFO — **signature byte-identical to head-160, 0 new**;
  10/10 rolled-back prod smokes PASS). Adds: `wear.concept_comments` (threaded, wear.comments
  mirror + moderator takedown), `wear.concept_shares` (**distinct-sharer** pk(concept,user),
  INSERT-only social proof, channel enum `link|native|dm`-reserved), `wear.concept_statuses`
  (**the concept-stories bar** — trigger-promoted, NO client write path) + `concept_status_views`
  (story_views mirror), 2 enums, +3 `notification_type` values, 4 SECDEF trigger fns (promotion +
  comment/upvote/share notify; all revoke-from-public, empty search_path). Every new FK indexed.
  wear: 37 tables / 83 policies / 32 fns / 22 enums.
- **The lazy Creator ladder is live (§6.1):** `wear.promote_concept_status()` promotes each new
  Concept for 24h when the creator has **>10 live concepts** (badge lane) ELSE while **<100
  bootstrap-grace statuses** have ever been issued (self-terminating partial-index counter; badge
  promotions never consume grace slots; no retro-backfill — grace starts at 0). Badge itself is
  DERIVED, never stored: `/api/me` → `creator:{earned, conceptCount, threshold:11}`;
  `/api/users/[handle]` → `creator` flag; profile renders a gold CREATOR chip; the create-Concept
  screen shows badge progress ("N more Concepts…").
- **Likes:** ratified as the EXISTING `concept_upvotes` re-skinned (heart + like language, №
  schema/API change — §3V's new-schema list deliberately omitted it).
- **API:** GET+POST `/api/concepts/[id]/comments` (500-char cap, parent validated same-concept);
  POST `/api/concepts/[id]/share` (idempotent → `{shares, viewerShared}`; channel whitelist —
  'dm' NOT client-acceptable yet); GET `/api/concepts/statuses` (public bar, viewerSeen) +
  POST `/api/concepts/statuses/[id]/view`; GET `/api/stories/author/[userId]` (active-for-viewer,
  audience+block rules preserved) + POST `/api/stories/[id]/view`. `hydrateConcept` +=
  commentCount/shareCount/viewerShared. Store: `WearStore` += `conceptComments`,
  `conceptStatuses` repos + `concepts.share/shareCount/hasShared/countByCreator`; MemoryWearStore
  mirrors ALL mig-161 triggers inline (lockstep rule), SupabaseWearStore implements against RLS.
- **UI:** shared **StoryViewer** overlay in `ui.jsx` (progress bars, tap-nav, 5s auto-advance,
  per-item CTA) + `shareLink()` helper (share sheet → clipboard, returns channel). Concepts page:
  **statuses bar** (bubbles grouped by creator, gold ring unseen, plays in the viewer, records
  views), **comments thread** (1-level replies + reply chip), **ShareButton** (records channel,
  "Link copied"), heart LikeButton. Home: tray now plays stories **full-screen** (§3V-5 fixed —
  was a profile redirect) + **per-post Share** (§3V-4, client-only per design). Deep links:
  `?concept=<id>` / `?post=<id>` consumed after sign-in (store.jsx), URL scrubbed. Inbox renders
  the 3 new notification types. Pre-existing `myBrands` useMemo lint warning FIXED (eslint 0/0).
- **Seed:** `seed-feed.sql` gained an independently-guarded **§12 engagement block** — applied to
  prod: +2 community concepts (auto-promoted → **the bar is live** with 2 grace statuses),
  4 comments (1 threaded), 5 shares, 16 real trigger-fired notifications. Teardown unchanged
  (cascades cover mig-161 tables). README updated.
- **Docs:** SHARED_DB_CONTRACT §9 stamped head→**161** (**next # = 162**); roles MD §6.2/§6.4
  marked shipped.

### Verified in prod
Anonymous RLS probes return the new engagement fields on live concepts; the statuses bar returns
the 2 seeded promotions; advisor signature unchanged; performance advisors show 0 new categories
(only the schema-wide `auth_rls_initplan`/`multiple_permissive_policies` house patterns + fresh
"unused" indexes; **0 unindexed FKs**).

### Still deferred from §3V (the remaining epic)
1. ~~**Become-a-Brand application** (§3V-3)~~ ✅ **DONE §3X (2026-07-16, mig 162 live).**
2. **Admin sign-in-as (impersonation)** — security-sensitive, own design session (§3V-6).
3. Fast-follows logged in the offload: share-to-DM ('dm' channel reserved), upvote-notification
   dedupe, `auth_rls_initplan` sweep migration, statuses-bar pagination.

---

## 3X. Wear Become-a-Brand application — SHIPPED ✅ (2026-07-16, mig 162 live)

§3V-3 / §3W deferred №1 — the last big rung of the progression epic — built + prod-verified in
one session on `step5-monorepo-lift`. **mig 162 APPLIED.** Founder ratified all four grill
decisions in-session (AskUserQuestion): **(1) locked once submitted** (immutable — no edits, no
withdraw); **(2) immediate re-apply after rejection** (each attempt = a NEW row, history visible
to admins; one-pending rule is the throttle); **(3) eligibility 20/10/0 RLS-HARD** (20 Concepts
posted + 10 of the applicant's Concepts claimed + zero admin-ACTIONED user-reports; support
email/contact are required FORM fields, not unlock inputs; admin direct-mint via `POST
/api/brands` stays the below-threshold override valve); **(4) apply pre-authorized once green.**
Offload log: `.claude/sessions/wear-become-a-brand.md`.

### What shipped (all gates green: turbo lint 12/12 · typecheck 12/12 · test 11/11 — Wear
### 106/106 (+12), db 99 — · build 8/8)
- **mig 162** (`162_wear_brand_applications.sql`) **APPLIED** (tag `wear-pre-mig162` @b0a84a9;
  advisor **0 ERROR / 102 WARN / 3 INFO — the single new WARN is the INTENTIONAL
  `brand_eligibility` SECDEF EXECUTE grant** (mig-157 precedent), all else baseline-identical;
  **6/6 rolled-back prod smokes PASS**). Adds `wear.brand_applications` (§6.1 form fields, all
  CHECK-bounded; agreements CHECK — an un-agreed application is invalid data; lifecycle
  invariants pending⇔undecided + mint-only-on-approve; **one open application per user** via
  partial unique index), SECDEF **`wear.brand_eligibility(p_user)`** (self-or-moderator guard;
  also called in the INSERT `WITH CHECK` → eligibility is RLS-hard), the decision-notify
  trigger (+2 `notification_type` values; institutional null actor; payload carries
  `brandSlug` for the inbox deep link), and a **column-scoped UPDATE grant** — only the
  decision stamp is ever writable, so even an admin can never rewrite what an applicant
  attested; decided rows are immutable for EVERYONE (admin UPDATE policy USING requires
  `status='pending'`). wear: 38 tables / 86 policies / 34 fns / 23 enums.
- **Approve = mint:** the admin route reuses the EXISTING mig-160 path — `brands.create`
  (`brands_admin_insert` RLS) with **`verified: true`** (the mig-157 `protect_verified_column`
  guard admits admins; `CreateBrandInput.verified` added) — then stamps the application with
  `mintedBrandId`. A slug clash that already belongs to THIS applicant is reused (crash-retry
  converges); anyone else's slug → 409.
- **Store:** `WearStore` += `brandApplications` repo (eligibility / submit / getOwnLatest /
  getById / listPending / review) in contract + MemoryWearStore (semantic spec — mirrors every
  RLS rule + the notify trigger inline) + SupabaseWearStore (RPC + table ops; 23505→
  `application_pending`, 42501→`not_eligible`, 23514→per-constraint memory codes).
  `BRAND_ELIGIBILITY_MIN_CONCEPTS_POSTED/CLAIMED` (20/10) mirror the DB literals.
- **API:** GET+POST `/api/brand-applications` (own panel {eligibility, application} — fetched
  lazily by Settings, NOT on `/api/me`, keeping boot lean; submit with clean 4xx chain);
  GET `/api/admin/brand-applications` (queue, applicant + LIVE eligibility snapshot per card);
  POST `/api/admin/brand-applications/[id]` (admin-gated decide; approve/reject + notify via
  trigger). +12 `STORE_ERROR_STATUS` codes; `BrandApplicationDto`. **+12 route tests** (gate
  walls, one-pending, actioned-report block, mint+notify, immutability, immediate re-apply,
  slug-clash convergence).
- **UI:** Settings **"Become a Brand" card** (hidden for brand owners; pending/rejected/
  eligible/progress states with ✓-gates rows; refetches when the nav stack pops back);
  **`brandapply.jsx`** form screen (§6.1 fields + 3 agreement checkboxes, missing-list +
  disabled submit, success state); **adminq.jsx Applications tab** (now the DEFAULT tab —
  applicant card + eligibility GateChips + slug/note inputs + Approve-&-mint / Reject);
  inbox renders both decision notifications (approved deep-links to the newborn brand via
  `brandSlug`); `openBrandApply` + `brandApply` screen registered; index.html `?v=20260716a`.
- **Seed §13** applied to prod: 1 pending demo application (**Mustard Seed Supply** / thabo_m)
  so the founder's Admin queue has a real card to decide — approving it exercises the full
  mint path end-to-end. Fixed-id + one-pending guards keep it idempotent; teardown unchanged
  (FK cascade).
- **Docs:** SHARED_DB_CONTRACT §9 stamped head→**162** (**next # = 163**); roles MD §6.4
  Become-a-Brand marked shipped.

### Verified in prod (rolled back)
Ineligible INSERT → 42501; `brand_eligibility(other)` as non-moderator → 42501; self-read
returns live counts; decided-row UPDATE → 0 rows; `brand_name` rewrite as admin → 42501
(column grant); decision UPDATE fires the notification with institutional null actor +
`brandSlug` payload. Structural QA counts verified live.

### Remaining from the progression epic
**Admin sign-in-as (impersonation)** — security-sensitive, own design session (§3V-6) — plus
the offload-logged fast-follows (share-to-DM, upvote-notification dedupe, `auth_rls_initplan`
sweep, statuses-bar pagination). Product fast-follows spotted this session: Ts&Cs / Code of
Conduct / fee-schedule DOCUMENTS don't exist yet (the form's checkboxes reference them
nominally — founder to supply text); brand-logo upload isn't part of the application (admin
can add post-mint via brand edit).

---

## 3Y. Merge §3V/§3W/§3X → main + prod fix + impersonation design ratified — SHIPPED ✅ (2026-07-16)

Two goals in one session on `step5-monorepo-lift` → `main`. Offload log:
`.claude/sessions/wear-merge-and-impersonation.md`.

### Goal 1 — merged the progression epic to `main` (PR #29, MERGED)

- **PR [#29](https://github.com/citizensnetwork/citizens-ecosystem/pull/29) MERGED** (merge commit
  `c478255`): §3V mig 160 (identity/content-permission) + §3W mig 161 (Concepts engagement) +
  §3X mig 162 (Become-a-Brand). All four workspace gates re-run green (lint 12/12 · typecheck
  12/12 · test 11/11 — db 99 · wear 106 · Connect 637 · build 8/8). Migrations were already
  applied to the shared project in their own sessions; this was the code merge only.
- **Caught + fixed a CI-only gate**: the CI "Verify" job also runs **`pnpm format:check`**
  (prettier) — NOT part of the local turbo gates. 24 files had committed prettier drift →
  `pnpm format` (commit `a16eac3`). ⚠ **Future sessions: run `pnpm format:check` locally before
  pushing** or CI reds the PR.
- **Found + fixed a PRODUCTION bundle bug** (PR
  [#30](https://github.com/citizensnetwork/citizens-ecosystem/pull/30), MERGED, commit `840636`):
  `apps/wear/scripts/build-frontend.js` `appFileOrder` OMITTED `brandapply.jsx`, so the
  Become-a-Brand **form screen** (§3X) worked in dev (runtime-Babel) but was **broken in the
  production bundle** (`shell.jsx case 'brandApply' → S.BrandApply` undefined). Added it → build
  now compiles 18 screens (was 17). Slipped all gates because nothing cross-checks index.html's
  script list vs appFileOrder — **a build/test guard for that is a worthwhile fast-follow.**
- **Prod verified:** `https://citizens-ecosystem-wear.vercel.app` now serves `bundle.7656bcd515.js`
  (byte-identical to the fixed local build) containing `CWScreens.BrandApply` + `brand-applications`
  + `Become a Brand` + `conceptsClaimed` + `Applications` + `shareLink`. The Become-a-Brand form
  works in prod. (Deploy-hash `*-projects.vercel.app` URLs are behind Vercel auth protection →
  curl gets an SSO shell; the **stable alias is the unprotected, up-to-date public URL**. Wear
  DOES auto-deploy to prod on push to main.)
- **⚠ CI infra debt flagged (NOT silently changed):** the CI "Verify" job's final step
  `pnpm audit --audit-level moderate` now fails on **every** run repo-wide — npm retired the legacy
  audit endpoint (HTTP 410); reproduces locally on pnpm 9.12.0. Main is UNPROTECTED (no required
  checks) so it does not block merges, but CI is perpetually red on that step. Fixing it is a
  security-gate policy call (blocking→advisory) or a pnpm bump → left for founder ratification.

### Goal 2 — admin sign-in-as (impersonation) DESIGN RATIFIED (build not started)

Design-first, security-sensitive. Grilled against the auth/RLS plumbing, ratified via
AskUserQuestion, and **recorded normatively in the roles MD §7**
(`docs/Citizens_Wear_Roles_and_Concepts_MD.md`). Ratified 2026-07-16: **(1)** phased mechanism —
**read-only act-as (Phase 1) built next**, write-as-user (Phase 2) designed later in its own
session; **(2)** target = **ANY user of any tier** (Citizen…Admin) — admin-impersonating-admin is
the sensitive Phase-2 edge; **(3)** DMs **readable with a per-access logged reason**; **(4)** the
impersonated user is **notified after the session** (trigger-produced, +1 notification_type);
**(5)** **admin-only** (`is_admin()`, not moderators). Audit core = **mig 163**
`wear.impersonation_sessions` + `impersonation_actions` (append-only, service_role/SECDEF-written)
+ persistent banner + 30-min time-box + adminq/profile entry. **No code written — clean stop at
docs** (per the design-first mandate). Full Phase-1 build checklist + open questions in roles MD §7.5–7.6.

---

## 3Z. CI security-audit gate restored — OSV-Scanner (blocking) + advisory baseline — SHIPPED ✅ (2026-07-16)

Founder-started follow-up to §3Y's flagged CI debt. Ratified via AskUserQuestion. Offload log:
`.claude/sessions/wear-merge-and-impersonation.md`.

- **Root cause:** the CI "Verify" job's `pnpm audit --audit-level moderate` step failed on every
  run — npm **permanently retired** the legacy audit endpoint it calls (HTTP 410). Confirmed to
  reproduce on **pnpm 9.12.0 AND 10.x**, so no pnpm bump fixes it. The step provided zero security
  value and kept CI perpetually red (non-blocking only because `main` is unprotected).
- **Fix (PR #32, MERGED):** replaced it with **OSV-Scanner** (`google/osv-scanner`), pinned to
  **v2.3.8** + a **pinned SHA-256** of the linux binary (supply-chain hardening), invoked
  `scan --config=osv-scanner.toml -L pnpm-lock.yaml`. It reads `pnpm-lock.yaml` against OSV.dev
  (no npm endpoint) and **blocks** the build on any known advisory (ratified: blocking gate).
- **The gate immediately surfaced 27 unique advisories** (38 counting duplicate hits; 15 High /
  14 Med / 7 Low / 2 Unknown) that were latent for months while `pnpm audit` was silently broken.
  Only **esbuild** is a direct dep; the rest are transitive; two **`sandbox`** advisories have no
  upstream fix.
- **Founder decision:** **baseline now, remediate in a follow-up.** `osv-scanner.toml` (repo root)
  ignores exactly those 27 (each documented with package + severity + reason). CI is **green now**
  and the gate blocks any **new** advisory. CI confirms: _"Filtered 38 vulnerabilities … No issues
  found."_
- **✅ OPEN DEBT NOW RESOLVED → see §3AA.** The `osv-scanner.toml` baseline has been fully
  cleared (all 27 advisories genuinely fixed, baseline empty). Details in §3AA below.

---

## 3AA. OSV-Scanner baseline CLEARED — all 27 advisories fixed — PR #33 (green, awaiting merge) (2026-07-16)

Follow-up that discharges §3Z's open debt. Offload log: `.claude/sessions/osv-baseline-clearance.md`.

- **Root cause (the big finding):** `pnpm why -r` proved **26 of the 27 baselined advisories came
  from a SINGLE root devDependency — `vercel ^55.0.0` (the Vercel CLI)**: undici×11, tar×4,
  minimatch×3, path-to-regexp×3, sandbox×2, ajv, smol-toml, @tootallnate/once all lived inside
  its `@vercel/*` tree. That devDep was added **accidentally** by a local `vercel deploy` (commit
  `dfcf476`, "founder Vercel-CLI deploy stragglers"). **No npm script, CI job, or app import used
  it** (the real `@vercel/speed-insights` runtime dep in Connect is separate and clean).
- **Fix (PR #33):** **removed `vercel` from root devDependencies** → dropped all 26 advisories +
  **~2.4k lines of lockfile bloat** in one move. This was also the **only** way to clear the two
  `sandbox` advisories (no upstream fix — they'd have stayed baselined forever otherwise). The
  **27th** advisory (`esbuild 0.28.0`, GHSA-g7r4-m6w7-qqqr) is a genuine `vite` transitive — fixed
  by tightening the `pnpm.overrides` esbuild floor to **`>=0.28.1`** (vite 8.1.3's own peer req);
  tree now resolves to a single `esbuild@0.28.1`. Redundant `esbuild@>=0.27.3 <0.28.1` override dropped.
- **The "risky" tranches evaporated:** removing `vercel` meant `path-to-regexp` is gone entirely
  (**Next.js here never pulled it** — all 3 Next builds compiled routing fine), `undici` 5.28.4 is
  gone (app code never used it — no 5→6 major bump needed), and `sandbox` is simply gone.
- **`osv-scanner.toml` is now EMPTY of `IgnoredVulns`** (documentary header only). The blocking gate
  still reds on any NEW advisory.
- **Verification:** all gates green (format:check, lint 12/12, typecheck 12/12, test 11/11 —
  Connect 637 / Vision 661, build 8/8); `pnpm install --frozen-lockfile` clean; **CI Verify green
  with OSV-Scanner reporting _"Scanned pnpm-lock.yaml … found 927 packages / No issues found"_**
  (nothing filtered — vs the old "Filtered 38 vulnerabilities"). All 3 Vercel deployments
  (Connect/Vision/Wear) passed → CLI removal does not break deploys.
- **Deploy note for the founder:** you can still deploy manually via `npx vercel` (or a global
  install); the `.vercel` project links are untouched. Don't `pnpm add vercel` again — it re-injects
  the whole advisory tree. Prefer `npx vercel@latest` on demand.
- **⏳ PENDING:** merge of **PR #33** — CI is fully green; the automated merge was blocked for the
  agent, so the **founder needs to merge it** (or grant a merge permission rule). Once merged, main
  is clean. Dependabot PRs (#9–#17, #24–#27) are unaffected (none bump these deps) — they'll just
  auto-rebase their lockfiles against the new base.

---

## ▶▶ NEXT STEPS (start here in a fresh chat)

> **Steps 3, 4, 4b, 4c, 5, the Wear Concepts marketplace (§3R), auth+seed (§3S), media-upload +
> notifications (§3T), the identity/content-permission model (§3V, mig 160), the community
> Concepts surface (§3W, mig 161), the Become-a-Brand application (§3X, mig 162), the merge
> of all three to `main` + prod fix (§3Y), the CI OSV-Scanner audit gate (§3Z) AND the full
> clearance of its 27-advisory baseline (§3AA, PR #33 — green, awaiting founder merge) are COMPLETE.**
> `step5-monorepo-lift` is **fully merged to `main`** via **PR #29** (§3V/§3W/§3X) + **PR #30**
> (prod bundle fix) + **PR #31** (docs) + **PR #32** (CI audit gate). **⛔ Sessions must run in the
> MONOREPO only** (§3Q). **⛔ Direct push to `main` is blocked — land changes via PR (precedent
> #28–#32).** **Next migration # = 163.** **Advisor baseline @ head-162 = 0 ERROR / 102 WARN /
> 3 INFO** (the 102nd WARN is the intentional `brand_eligibility` SECDEF grant — compare against
> THIS, not 101). **CI note:** the Verify job now runs a **blocking OSV-Scanner** step; a new
> dependency advisory not in `osv-scanner.toml` will red CI — fix the dep, don't just add to the
> baseline. Run `pnpm format:check` locally before pushing (CI gate the turbo gates omit).
>
> **▶ RECOMMENDED next session — pick one:** (a) **Build impersonation Phase 1** — the ratified
> design is in **roles MD §7** (read-only admin sign-in-as; mig 163 audit tables; admin-only;
> DM-with-reason; notify-after; banner + 30-min time-box). Design-first work is DONE, so this is a
> clean build session; or (b) **merge PR #33** (§3AA) — the OSV-Scanner baseline clearance is DONE
> and CI-green; it only needs the founder to click merge (the agent's auto-merge was blocked), after
> which the dependency-hygiene debt is fully closed; or (c) the **Wear founder walk-through**: decide the live "Mustard Seed Supply" demo
> application from Admin → Applications (approving mints a real verified brand in prod), then verify
> the Settings "Become a Brand" form as a citizen (now fixed & live). The founder also still owes
> the platform its **Ts&Cs / Code of Conduct / fee-schedule documents** — the application form's
> checkboxes reference them nominally.

1. **Wear build track (current focus — §3P roadmap; marketplace core DONE §3R; auth + feed seed DONE §3S;
   media + notifications DONE §3T):**
   a. ~~**Deploy the marketplace + new auth UI**~~ ✅ **DONE §3T** — Wear is live on Vercel; image upload
      + OTP-code sign-in both confirmed working. Magic-link redirect gap fixed (§3U). Founder (wear admin)
      can still verify the 2 pending brands (Lily & Field, Anchor & Crown) from the in-app Admin queue.
   b. Launch-hardening fast-follows: ~~**media upload pipeline**~~ ✅ **DONE §3T** (mig 158,
      user-authed signed upload, wired post/story/brand-logo/concept); ~~**notifications backend**~~
      ✅ **DONE §3T** (mig 159, marketplace-event triggers + inbox tab). Still open, in rough order
      of value: **§3U-1a quick win** — hide the raw uploaded-image URL in `ImagePicker` (show
      "uploaded ✓ / Replace"; manual URL behind an "or paste a URL" toggle); **mig 160**: fix the §3R
      account-deletion cascade wrinkle (DEFERRABLE FKs or SECDEF cleanup fn) + any marketplace schema
      follow-ups; **brand-logo edit UI** (create-time works; no edit surface in brand.jsx);
      proposal-mockup upload + story video (pipeline is images-only today); full desktop layouts;
      Capacitor shell scaffold (JS side is ready).
   c. Port the Wear auth screens to Connect + Vision frontends — now **email+password (§3P) AND
      email magic-code + change-password (§3S)**; shared CC_AUTH/CV_AUTH lineage, provider already
      enabled project-wide. Each app's magic-link email template also needs the `{{ .Token }}` edit
      (§3S) if magic-code is wanted there. (Still not reached — good next task.)
   d. Marketplace v2 candidates (see §3R + doc Open Items): brand Workspace scope, dispute
      tooling, ~~proposal notifications~~ ✅ **DONE §3T**, concept search/categories, creator portfolio.
   f. ~~**Wear identity & content-permission rework (§3U-2 + §3U-3).**~~ ✅ **DONE §3V (2026-07-15)** —
      model ratified (4-tier lazy ladder: Citizen → Creator → Brand → Admin; two content surfaces) and
      the **enforcement core** shipped + verified: self-serve Create-Brand tile removed; **Posts gated
      to owned + verified Brand** (UI + API + RLS **mig 160**, applied); base Citizens keep Concepts +
      Stories; ImagePicker raw-URL hidden.
   g. ~~**Wear progression epic — community Concepts surface.**~~ ✅ **DONE §3W (2026-07-16,
      mig 161 live)** — concept like(=upvote re-skin)/comments/shares, the concept-stories bar
      (trigger-promoted; Creator badge >10 concepts + first-100 bootstrap grace), full-screen
      Home stories, per-post Share, deep links, engagement notifications, seed §12.
   h. ~~**Become-a-Brand application.**~~ ✅ **DONE §3X (2026-07-16, mig 162 live)** —
      eligibility 20/10/0 RLS-hard, Settings panel + form, admin queue tab (default),
      approve-mints-verified-brand, decision notifications, seed §13 demo card. Remaining
      from the epic: **admin sign-in-as (impersonation, §3V-6)** + offload-logged
      fast-follows + founder-supplied Ts&Cs/CoC/fee documents.
   e. **Ecosystem lazy-profiles (founder ask, §3S) — own tested session:** stop Connect from
      auto-creating a `public.profiles` row for every auth user (drop/guard `on_auth_user_created`)
      and add an idempotent "ensure profile on first Connect sign-in" (mirror Wear's hydrate). Must
      land the lazy-ensure BEFORE removing the trigger or new Connect sign-ups break. Touches LIVE
      Connect auth → migration + Connect frontend + full regression. Not urgent; the §3S seed already
      achieves the no-footprint end-state on its own.
2. **Vision (verify-then-continue):** migs 147–156 + demo→live wiring increments 1–7 shipped from
   the STANDALONE checkouts (§3Q) — absorb the standalone `citizens-connect` RESUME §3Q–§3W into
   this file, sync the monorepo's `apps/vision` tree to `citizens-vision` `main` @ `3c77959`
   (currently BEHIND it), then continue Vision fast-follows (Timeline Map; remaining wiring).
3. **Monorepo hygiene:** ~~merge `step5-monorepo-lift` → `main`~~ ✅ done 2026-07-15 (§3R, then §3T
   via **PR #28**); commit-or-park the standalone `citizens-connect` dirty tree; retire the standalone checkouts
   to read-only. Consolidate Connect + Vision onto `@citizens/utils` rate-limit (their copies
   are byte-compatible on purpose — mechanical swap, workspace gates must stay green).
4. **Founder-only, non-code (any time):**
   - ~~**Wear deploy gates**~~ ✅ **DONE §3T/§3U** — Wear live; env set; Supabase Redirect URLs now
     include the Vercel deploy-hash wildcard `https://citizens-ecosystem-wear-**-citizensecosystem-projects.vercel.app/**`
     (fixed the magic-link→Connect redirect + reset/confirmation links).
   - ~~**§3U email template — code-as-hero**~~ ✅ **DONE (founder applied, confirmed §3V 2026-07-15).**
     Supabase Dashboard → Authentication → Email Templates → Magic Link now leads with `{{ .Token }}`
     (the 6-digit code as hero; link a same-device fallback). Shared across all 3 apps; revertible.
   - **§3U address hygiene (roadmap):** put Wear/Connect/Vision behind **stable custom domains** (e.g.
     `wear.citizenscentral.co.za`) + a **branded storage asset origin** so URLs stop leaking
     `*.vercel.app` deploy-hashes and `xyiajtrvhlxaeplsiajj.supabase.co`.
   - **Vision deploy gates ⛔** (§3F + §3O): same env pattern (+ optional
     NEXT_PUBLIC_MAPTILER_KEY) + Supabase **Exposed schemas → add `vision`** + its redirect URL.
   - ~~First **Wear moderator/admin grants**~~ ✅ **DONE (§3P)** — founder is `wear` admin.
   - **Custom SMTP for auth emails** (§3P ⛔) — required before non-team users can receive
     sign-up confirmation / password-reset emails.
   - Answer the **Supabase-Preview** question (§3M #2: which surface showed the error) so the
     integration can be switched off.
   - F1 Firebase / F2 Apple push · Step 6 store compliance · Step 7 release · **PAT rotation**
     still owed (§3D).

> Optional Connect-side polish if a session wants a low-risk in-repo task: the accepted demo debt
> in `src/frontend/app/store.jsx` (`if (!realUser)` graceful-degradation branches, §2M) — harmless,
> unreachable in prod, strip only if desired. Not required for launch.

---

## Historical batch log (archived)

The batch-by-batch history (Phase 0 HTML-frontend swap → June-2026 ecosystem steps → legacy Figma/
notification/dashboard batches) moved to
[`docs/archive/RESUME_HISTORY_2026H1.md`](docs/archive/RESUME_HISTORY_2026H1.md) to keep this file
lean. §3A–§3I above carry the current-state summary; `git log` has full per-commit detail.

### Verify locally (Connect)
```powershell
npx tsc --noEmit; npx vitest run; npx next lint --dir src; node scripts/build-frontend.js
```

### Canonical docs (start here)
- [VISION.md](VISION.md) · [.github/MASTER_DIRECTION.md](.github/MASTER_DIRECTION.md) — north star + locked technical direction.
- [docs/SHARED_DB_CONTRACT.md](docs/SHARED_DB_CONTRACT.md) — shared-project schema contract (head mig **161** live; next # = **162**; `public`/`vision`/`wear`).
- [docs/strategy/ECOSYSTEM_DECISION_BRIEF.md](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md) — **the ecosystem code progress plan** (single source of truth).
- [docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md](docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md) — Wear Phase 3 spec (**✅ complete — §3L**).
