# Citizens Ecosystem — Decision Brief (Single Source of Truth)

> **Status: DECIDED & CURRENT.** Created 2026-06-16.
> **Supersedes** the conflicting guidance in:
> - [`docs/MONOREPO_PLAN.md`](../MONOREPO_PLAN.md) — assumed a single shared Supabase project *and* "Wear starts fresh inside the monorepo." Both assumptions are now overtaken by reality (see §1).
> - [`docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md`](./ECOSYSTEM_AND_MONOREPO_STRATEGY.md) — a *questions* doc; its §5 leaned toward autonomous DBs + sync. Decision below goes the other way.
> - The monorepo section of [`.github/MASTER_DIRECTION.md`](../../.github/MASTER_DIRECTION.md) Part 7 ("monorepo **before** building Wear").
>
> Where any of those disagree with this brief, **this brief wins.** They remain for history; banners added to the top of each.
>
> **Companion:** [`docs/strategy/CAPACITOR_REACT_AUDIT.md`](./CAPACITOR_REACT_AUDIT.md) — the dependency audit that was owed; it underpins §5.
>
> **Output of step 1 (2026-06-17):** [`docs/SHARED_DB_CONTRACT.md`](../SHARED_DB_CONTRACT.md) — the
> normative, LOCKED contract that implements §3 below. It is the artifact Vision + Wear build against.

---

## 1. Where we actually are (verified on disk, 2026-06-16)

Three **separate** repos already exist under `C:\Users\SJ\Documents\Citizen Network\`, with divergent stacks and two separate Supabase projects:

| App | Repo | Stack (verified) | Supabase project | State |
|---|---|---|---|---|
| **Connect** | `citizens-connect` | Next **15.5** **API-only** (0 page/component `.tsx`, 86 `route.ts`). Live UI = standalone HTML app in `src/frontend/` loading **React 18.3.1 via CDN** + Babel. Capacitor 8 (`webDir: mobile-dist`). | `Citizens-Connect` (eu-central) — **active** | Live / near-launch; frontend swap in flight |
| **Vision** | `citizens-vision` | Next **16.2** / React **19.2**, SSR/RSC, no Capacitor. ~388 files, phases 0–21b. | `Citizens-Vision` (eu-west) — **paused** | Substantially built; data layer being re-platformed into Connect's DB |
| **Wear** | `citizens-wear` | **Already a Turborepo**: `turbo.json`, `pnpm-workspace.yaml`, `apps/web` (Next 15.5 / React 18.3.1), `packages/{ui, db, config, connect-client}`. | — (no prod data) | Skeleton + early build |

**Two facts that invert the old plans:**

1. **Wear is already the monorepo** — it has the exact turbo + shared-package skeleton the old plan said we'd build later, *including* `connect-client` (consumes Connect's API) and `db`. MASTER_DIRECTION Part 7 said "monorepo before Wear, Wear starts fresh inside it." Reality did the opposite: **Wear was built standalone first and is the natural monorepo seed.**
2. **Connect's Next app has no React UI** — it's API-only. So "Connect is pinned to React 18 by Capacitor" is a non-issue (see [audit](./CAPACITOR_REACT_AUDIT.md)). The React-18 anchor is a CDN `<script>` pin in the HTML frontend, trivially changed.

---

## 2. Decisions locked (founder, 2026-06-16)

| # | Decision | Detail |
|---|---|---|
| D1 | **Single shared Supabase project + schema-per-app + one `auth.users`** | One identity across the ecosystem; per-app Postgres schemas (`public`/commons, `vision`, future `wear`), not separate projects. Matches [`PHASE_4_5_ADDENDUM.md`](../PHASE_4_5_ADDENDUM.md) §A3 and what Connect is already building (`vision.*`, migrations 133–134). |
| D2 | **Vision is back-office only** | Audience = contributors + organisations (for Wear: clothing brands). **Not** citizens. Per-eco-app Vision UIs possible later; out of scope now. |
| D3 | **Grow Wear into the monorepo** | Promote `citizens-wear` → `citizens`; lift Connect + Vision into `apps/` via `git filter-repo --to-subdirectory-filter` (history preserved). Do **not** create a fresh empty `citizens` repo. |
| D4 | **Sequence: DB contract first → finish Vision → monorepo as a later plumbing pass** | The data contract is the real dependency for Vision + Wear. The monorepo is a tidiness refactor — do it **after** Connect's frontend swap stabilises, never during it. |
| D5 | **Share pure-TS packages first; defer shared React UI** | `db` types, `contracts`, validators, `connect-client` share cleanly today. A shared React component lib is deferred — and is the *wrong* boundary across Connect (CDN/client React) vs Vision (SSR/RSC React 19). See [audit](./CAPACITOR_REACT_AUDIT.md). |

---

## 3. Data architecture (D1) — and the migration reality

**Model:** one Supabase project. One `auth.users`. Per-app schemas. **The cross-app contract is `/api/v1/*`, not raw tables** — sibling apps call the versioned, rate-limited, API-key-capable API (`v1Gate`/`api_keys`); only user-scoped/realtime needs share the DB directly under RLS. Keep [`docs/api-v1.md`](../api-v1.md) current as the official contract.

**Guard-rails (build these in from the start):**
- **Schema boundaries day one** — `public`/commons (profiles, contributors, events, places — the shared Kingdom data every app surfaces), `vision.*` (already started), future `wear.*`. This is what makes a later *split* possible if one app outgrows the shared project.
- **RLS is now the only isolation wall.** With separate DBs isolation was physical; in one shared DB a single RLS mistake = cross-app exposure. PII/writes stay behind tight RLS + `service_role`-only (the pattern already used for `vision.vision_period_snapshots`). Public reads of the commons can be open.
- **Don't run Vision's analytical queries against Connect's live OLTP tables.** Vision reads its own `vision.*` aggregates/snapshots; consider a read replica before scale.
- **`app_id`/source attribution** on analytics events once the 2nd app writes (addendum §A3).
- **Blast radius / scale:** one project = one outage + one quota ceiling. Fine at 3 apps pre-scale; revisit before ~6 apps with real traffic. Schema boundaries keep the exit cheap.

**The data-migration reality (this is bounded, not a mammoth):**
- "Migrate data from one repo to the next" conflates two things. **Code** lives in git (the repo move, §4) and touches **zero rows**. **Data** lives in Supabase projects and only moves when consolidating *projects*.
- **Connect** is already the shared project → **no data migration.**
- **Wear** has no production data → **trivial.**
- **Vision** is the **only** real data migration (its paused eu-west project → shared eu-central project). And the shared-DB design **obsoletes most of it**: Vision's old `cc_*_mirror` sync tables get rebuilt from the `vision.*` schema, not migrated row-by-row. Only Vision-*owned* config (org settings, goals, alignment config, saved findings) actually moves. Medium effort, one-time.

---

## 4. Monorepo (D3) — approach & difficulty

**Approach:** rename `citizens-wear` → `citizens`; move its app to `apps/wear`; lift the other two in with history preserved:
```
git filter-repo --to-subdirectory-filter apps/connect   # run inside a clone of citizens-connect
git filter-repo --to-subdirectory-filter apps/vision     # run inside a clone of citizens-vision
# then add both as remotes/subtrees into citizens, hoist a single top-level supabase/
```
Wear already supplies `turbo.json`, `pnpm-workspace.yaml`, and `packages/{ui, db, config, connect-client}` — we adopt a working skeleton instead of building one.

**Difficulty:** **medium**, ~1–2 focused days. Real friction points:
- Connect's Capacitor `android/`/`ios/` live at repo root → move under `apps/connect/native/`, update `capacitor.config` paths + `webDir`.
- One top-level `supabase/` shared by all apps; each app references it by relative path for the CLI.
- Vercel per-app build filters (Turbo "affected" + Ignored Build Step) so a Connect PR doesn't rebuild Vision.
- **Snapshot/rollback anchor:** tag `connect-pre-monorepo` before lifting.

**Decoupling note:** D1 (shared DB) and D3 (monorepo) are **independent**. We can ship the shared DB with the repos still separate; the monorepo is pure source-organisation convenience.

---

## 5. Shared packages (D5) — what the audit changed

The old docs gated shared UI on "upgrade Connect to React 19, risky because Capacitor pins React 18." **The audit found that premise false** (see [`CAPACITOR_REACT_AUDIT.md`](./CAPACITOR_REACT_AUDIT.md)): Capacitor is framework-agnostic, and Connect's Next app has no React UI at all. The genuine split is **rendering model**, not version:

- **Connect** (CDN/client React 18 + Babel/Vite in `src/frontend/`) and **Wear** (`apps/web`, Next 15 / React 18, already peers React 18 in `@citizens-wear/ui`) → can share a React UI lib cleanly. **This is the natural first shared-UI pair**, later.
- **Vision** (Next 16 / React 19, SSR/RSC) → different rendering model. A shared React *component* lib across it and Connect is a category mismatch even at the same version.

**Therefore — pure-TS sharing is the correct boundary, not a fallback.** Extract first, all React-free, immediate payoff:
1. `@citizens/db` — generated Supabase types + zod schemas (Wear already has `@citizens-wear/db`).
2. `@citizens/contracts` — the `/api/v1` + cross-app analytics/snapshot schemas.
3. `@citizens/connect-client` — typed client for Connect's API (Wear already has it).
4. `@citizens/utils` — validators, rate-limit, UUID, sanitise, `cn`.

**Action now even before consolidation:** align Wear's existing `@citizens-wear/*` package names/boundaries toward the eventual `@citizens/*` so the later merge is a rename, not a refactor.

---

## 6. Ordered work plan (reconciled with the plan MDs)

MASTER_DIRECTION Part 10 planned: …Batch 6 (profile schema + `content_labels` + monorepo *prep*) → Batch 7 (Wear, *after* monorepo migration) → Batch 8 (billing). **Reality diverged:** monorepo-prep happened (`monorepo-prep/` folder), the migration did **not**, and Wear was built standalone (Batch 7 ran without the migration). The plan below replaces "monorepo-before-Wear" with the actual sequence:

| Order | Work | Source / status |
|---|---|---|
| **0 (in flight)** | Finish Connect's frontend swap + launch blockers | RESUME_HERE §2M; do **not** start repo surgery during this |
| **1 ✅ LOCKED (2026-06-17)** | **Shared-DB contract locked** in [`docs/SHARED_DB_CONTRACT.md`](../SHARED_DB_CONTRACT.md). Verified live (project `xyiajtrvhlxaeplsiajj`, head mig 134): schema boundaries (`public`+`vision`; `wear` future), one `auth.users`, RLS-only-wall, `/api/v1` confirmed + `docs/api-v1.md` brought current (added `places`, `contributors/{slug}/stats`). Unified Profile cols + `content_labels` + auto-label trigger were **already landed in Batch 6** (mig 072–077). `app_id` column **deferred per §3** until the 2nd app writes analytics (rule R4 locked now; no sibling writes yet). | D1 · MASTER_DIRECTION Part 7 + Batch 6 · addendum §A3 |
| **2 — DB half ✅ (2026-06-18)** | **Vision data-plane consolidated into `vision.*`** on the shared project (migrations **137–139**): 22 owned tables + 2 enums + 5 MVs + 28 fns + RLS/triggers ported; claim→promote re-modelled as `vision.cc_event_claims`/`cc_place_claims` (no cross-schema FK); `avg_rating` resolved as Connect-published `vision.ratings_per_event`/`ratings_per_place` views (route b). `cc_*_mirror`/sync **not ported** (obsoleted by `/api/v1` + `vision.*`). Seed-only ⇒ **0 rows migrated**, no eu-west restore. Advisors **0 ERROR**. **Remaining (app half):** repoint the `citizens-vision` app → shared project + `db.schema='vision'`, expose `vision` in PostgREST, swap `/api/connect/*`→`/api/v1`+`vision.*`, delete `sync-from-connect`, wire the claim UI to the new claim tables. | D1/D2 · §3 |
| **3 — in progress (2026-07-01)** | **Point Wear at the shared project.** NOT a trivial repoint (see [`STEP3_WEAR_INTEGRATION_SCOPE.md`](STEP3_WEAR_INTEGRATION_SCOPE.md)). **Done:** `wear.*` schema→prod (mig 143, 22 tables/0-without-RLS/advisors 0 ERROR); Supabase Auth cutover (Google OAuth, one `auth.users`); `wear` PostgREST-exposed. **Remaining:** the coupled `SupabaseWearStore` port + `connect-client` reconcile + repoint ~16 consumers (scope §3.4). | D1 · §5 · STEP3 |
| **3a — RECOMMENDED (see §6a)** | **Import a standalone HTML frontend for Wear** (mirror Connect's `src/frontend/` + esbuild precompile + Capacitor), making Wear's Next.js **API-only**. Fold into step 3 so the store is consumed via `/api/*` **once**, not wired as RSC then discarded. | founder request 2026-07-01 · §6a |
| **4** | **Extract pure-TS shared packages**; align Wear's `@citizens-wear/*` → `@citizens/*`. | D5 · §5 |
| **5** | **Monorepo consolidation** — grow `citizens-wear` → `citizens`, lift Connect + Vision via `git filter-repo`, hoist `supabase/`, Vercel per-app filters. *(After step 0 stabilises.)* | D3 · §4 |
| **6** | **Shared React UI** (Connect HTML + Wear) — only if/when it pays for itself; Vision stays separate-rendering. | D5 · audit |
| **parallel** | PayFast billing (Batch 8) can run independently. | MASTER_DIRECTION Batch 8 |

---

## 6a. Wear HTML frontend — recommendation (2026-07-01)

**Ask:** import a standalone HTML/React frontend for Wear, as Connect has (`src/frontend/`), instead
of Wear's current full Next.js App-Router **RSC** app (server components + server actions).

**The key insight — sequence it *into* step 3, don't bolt it on after.** The remaining step-3 unit
(scope §3.4) currently repoints ~16 **RSC server-component** consumers onto the new `SupabaseWearStore`.
If Wear then pivots to a static HTML frontend that talks to **HTTP APIs**, those RSC pages are thrown
away — the UI wiring is done twice. So the frontend model must be chosen **before** executing §3.4's
consumer-repoint. The **data-plane** parts of §3.4 (the `SupabaseWearStore`, the `WearStore` contract
extension, the `connect-client` reconciliation) are frontend-agnostic and proceed regardless.

**Recommended sequence:**
1. **Data plane first (frontend-agnostic):** `SupabaseWearStore` + `WearStore` `users`/`brands` repos +
   `connect-client` → `contributors`/`categories` over `/api/v1` (scope §3.4). No UI wiring yet.
2. **Expose Wear's operations as `apps/web/src/app/api/*` route handlers** — the contract the HTML app
   consumes (mirrors Connect's `/api/v1`). Build this consumption surface **once**; a thin interim RSC
   page and the future HTML app both call it. Confirm the **cross-origin Bearer-token auth** pattern
   Connect learned the hard way (static frontend + `localStorage` session ⇒ authenticated mutations
   need an `Authorization: Bearer` header because cookie middleware sees nothing cross-origin —
   Connect memory `static-frontend-cross-origin-auth`).
3. **Import the HTML/React design** into Wear, reusing Connect's proven Phase-0 machinery **verbatim**:
   `scripts/build-frontend.js` (esbuild JSX precompile, kills CDN+Babel JIT), the Capacitor bridge
   (native Google-OAuth deep link + geolocation), safe-area insets, `?v=` cache-bust removal. Wire each
   screen to the `/api/*` surface; make Next.js **API-only** (delete/retire the RSC page tree).
4. **Ship mobile via Capacitor** (reuse Connect's config) if Wear targets phones.

**Most effective way — reuse, don't reinvent.** Connect already solved every hard part of this exact
pivot (Step 0, RESUME §3G): esbuild precompile, native OAuth, cross-origin Bearer auth, safe-area,
Upstash rate-limiting on `/api/*`. Building Wear's frontend on the **same toolchain** (a) avoids
re-learning those lessons, (b) makes the **step-5 monorepo merge trivial** (both apps share one static-
frontend build pipeline — a natural **step-4 `@citizens/*` package**: `@citizens/frontend-build`), and
(c) lets the two static frontends share design tokens/components later (**step 6**, "shared React UI",
which is *this* — Connect HTML + Wear — now with a concrete first mover).

**Decision flag (founder):** this **discards most of Wear's Next.js RSC UI** (its Phase 1–6 server
components) — the same trade Connect made and does not regret. The data plane (store/auth/`/api/*`) is
valuable under *either* model, so it proceeds now; the **RSC→HTML swap itself is the reversible-later
call**. Recommend confirming the RSC-discard before step 3, but exposing `/api/*` immediately since it
serves both models. If the HTML design isn't ready yet, do steps 1–2 now and 3–4 when the design lands.

---

## 7. Superseded-docs map

| Doc | Status | What's still useful |
|---|---|---|
| `docs/MONOREPO_PLAN.md` | **Superseded by this brief** | Mechanics of `git filter-repo` lift, risks/mitigations, cutover checklist — still valid for step 5. |
| `docs/strategy/ECOSYSTEM_AND_MONOREPO_STRATEGY.md` | **Superseded** (was a questions doc) | The trade-off table (§3) and the data-architecture options (§5) remain good background. Its open questions are now answered here. |
| `.github/MASTER_DIRECTION.md` Part 7 | **Amended** by this brief | "monorepo before Wear" is reversed; Unified Profile + `content_labels` + batch order otherwise stand. |
| `monorepo-prep/` | **Deleted (2026-07-01)** | Placeholder READMEs for the superseded *Connect-seeded* monorepo; reality is Wear-is-the-seed. `@citizens/*` package shape is defined at step 4 against Wear's `@citizens-wear/*`. |

---

## 8. Open items / owner actions
- **Vision audience UIs (D2):** per-eco-app Vision surfaces — deferred, revisit post-launch.
- **Region:** Vision moves eu-west → eu-central (the shared project) during step 2; confirm no data-residency constraint.
- **Naming:** confirm the GitHub org + final monorepo name (`citizens-network/citizens`?) before step 5.
- **B0 Vite precompile** (addendum) for `src/frontend/` — replaces CDN+Babel, and is where the HTML frontend's React version is pinned cleanly (relevant if step 6 ever targets React 19).

---

*Author: Claude (Opus 4.8) per founder strategy session, 2026-06-16. Reflects verified on-disk state, not prior assumptions.*
