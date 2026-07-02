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

## ▶▶ NEXT STEPS (start here in a fresh chat)

> **Ecosystem Step 3 is COMPLETE (§3L).** Wear runs the full shared-project model end-to-end:
> shared auth → `wear.*` → `/api/*` → standalone HTML frontend, with `connect-client` reconciled
> to Connect's real `/api/v1`. Next code step = Step 4.

1. **Step 4 — extract pure-TS `@citizens/*` packages** (align Wear's `@citizens-wear/*`). First
   mover per §6a: `@citizens/frontend-build` (Connect `scripts/build-frontend.js` + Wear
   `apps/web/scripts/build-frontend.js` are now near-identical ports — hoist once). No prod risk.
2. **Step 5 — the monorepo lift** (grow Wear → `citizens`, `git filter-repo` Connect + Vision in,
   hoist `supabase/`). Gated behind Step 4 only.
3. **Wear launch-hardening fast-follows (code, any session):** `/api/*` rate limiting (port
   Connect's Upstash pattern — §3L debt #1); media upload pipeline (R2/Supabase storage);
   notifications backend; full desktop layouts; Wear Capacitor shell scaffold (`cap init` + the
   store-build flow — JS side already done).
4. **Founder-only, non-code (any time):**
   - **Wear deploy gates ⛔:** Vercel env `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     (shared project `xyiajtrvhlxaeplsiajj`), `CONNECT_MODE=live` + `CONNECT_API_BASE_URL`
     (+ optional `CONNECT_API_KEY`); Supabase Auth → Redirect URLs → add Wear's prod origin.
     (The `wear` PostgREST Exposed-schemas gate is ✅ done.)
   - Vision deploy gates (§3F ⛔) · F1 Firebase / F2 Apple push · Step 6 store compliance ·
     Step 7 release · Supabase Mgmt **PAT rotation** still owed (§3D).

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
- [docs/SHARED_DB_CONTRACT.md](docs/SHARED_DB_CONTRACT.md) — shared-project schema contract (head mig **144**, `public`/`vision`/`wear`).
- [docs/strategy/ECOSYSTEM_DECISION_BRIEF.md](docs/strategy/ECOSYSTEM_DECISION_BRIEF.md) — **the ecosystem code progress plan** (single source of truth).
- [docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md](docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md) — Wear Phase 3 spec (**✅ complete — §3L**).
