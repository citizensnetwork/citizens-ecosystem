# Step 3 — Citizens Wear Integration Scope (Wear ↔ shared backend)

> **Status: SCOPED & DIRECTION LOCKED (2026-06-21). Build NOT started.**
> Implements [`ECOSYSTEM_DECISION_BRIEF.md`](./ECOSYSTEM_DECISION_BRIEF.md) §6 order **3**
> ("Point Wear at the shared Supabase project"). Governed by
> [`../SHARED_DB_CONTRACT.md`](../SHARED_DB_CONTRACT.md) and [`../api-v1.md`](../api-v1.md).
> Founder decisions captured here are recorded as a Wear ADR (`citizens-wear`
> `docs/architecture/decisions/ADR-0007-*`).

---

## 0. Why this doc exists

The decision brief and `RESUME_HERE.md` §3F framed Step 3 as a **"trivial repoint, zero data
migration — Wear already has `db` + `connect-client`."** Scoping the actual `citizens-wear`
repo on disk (2026-06-21) showed that framing rests on **two false premises**. This doc records
the verified reality, the founder's chosen direction, and the real (bounded) build that Step 3
turns out to be — so a cold session does not re-discover this from scratch or build the wrong thing.

---

## 1. Verified reality of `citizens-wear` (on disk, 2026-06-21)

A Turborepo: `apps/web` (Next 15.5 / React 18.3) + `packages/{db, connect-client, ui, config}`.
Its own roadmap (`docs/rollout-plan.md`, `LOCAL-SETUP.md`) is built in numbered phases; it has
shipped **through its Phase 6** (stories/DMs/blocks/reports). Quality bar is high: ≥70–90%
coverage gates, CodeQL, Dependabot, security headers, contract tests.

**Premise 1 — "`packages/db` builds a Supabase client." → FALSE.**
`packages/db` exports an **in-memory** store (`MemoryWearStore`), an in-memory realtime bus,
hashtag utils, and a TS contract. There is a `prisma/schema.prisma` but it is **explicitly not
wired to a runtime** ("lands with Phase 3"). `grep -ri supabase` across the entire repo returns
**zero hits**; there is **no `@supabase/*` dependency** anywhere. Wear has never connected to any
Supabase project.

**Premise 2 — "`connect-client` reads Connect commons via `/api/v1`." → FALSE.**
Wear's `HttpConnectClient` targets a contract that **does not exist on Connect**:

| Wear's `connect-client` expects | Connect actually serves (`src/app/api/v1/*`) |
|---|---|
| `{base}/v1/auth/verify`, `/v1/auth/me` (OIDC-ish) | *(none — auth is Supabase Google OAuth)* |
| `/v1/users/*`, `/v1/users/by-handle/*` | *(none)* |
| `/v1/brands/*`, `/v1/users/{id}/brands` | *(none)* |
| `/v1/products/*`, `/v1/brands/{id}/products` | *(none)* |
| `/v1/health` | *(none)* |
| — | `/api/v1/events`, `/events/[id]`, `/places`, `/contributors`, `/contributors/[slug]`, `/contributors/[slug]/stats`, `/categories`, `/analytics/community` |

They are **disjoint** — different path prefix (`/v1` vs `/api/v1`) *and* different domain (Wear
assumes an identity + clothing-catalog service: users/brands/products/OIDC; Connect is a
map-discovery service: events/places/contributors). Connect has **no brands, no products, no
OIDC, no token-verify endpoint.**

**Root cause (not a failure):** Wear's `ADR-0002` (Phase 1, April 2026) defined this contract
*before* Connect's surface stabilised, and explicitly warned: *"We could diverge from Connect's
real shape if we don't sync early and often."* The two apps were built in parallel and diverged.
Wear's `LOCAL-SETUP.md` (April 2026) even assumes a **separate per-Wear Supabase project** and a
Connect **OIDC** issuer — both predate and contradict the 2026-06-16 decision **D1** (single
shared Supabase project, one `auth.users`).

**Therefore:** "point Wear at the shared project" = **Wear's entire (unstarted) Phase 3**, gated
on architectural decisions — not a one-env repoint. Wear has **no prod data**, so there is still
**zero data migration**; the cost is *build*, not *migration*.

---

## 2. Decision (founder, 2026-06-21) — Direction A

> **Shared Supabase Auth + Wear owns its commerce data in a `wear.*` schema.**

| # | Decision | Detail |
|---|---|---|
| W1 | **Wear authenticates against the shared Supabase project directly** | Same project `xyiajtrvhlxaeplsiajj`, same `auth.users`, Google OAuth — exactly the model Vision was just cut onto (§3F). One Kingdom identity across Connect → Vision → Wear. Replaces Wear's mock-token cookie session + the never-built Connect-OIDC bridge. |
| W2 | **Wear owns its commerce/social data in a new `wear.*` Postgres schema** | `brands`, `products`, `posts`, `follows`, `stories`, `conversations`, etc. (the `prisma/schema.prisma` shape) become `wear.*` tables in the shared project, RLS-walled. This is the third schema boundary the contract anticipated (`public`/commons, `vision.*`, **`wear.*`**). |
| W3 | **`connect-client` is reconciled to what Connect *actually* owns** | Wear stops expecting users/brands/products/OIDC from Connect. It reads only genuine Connect commons over the real `/api/v1` (e.g. contributors, categories) where Wear wants to surface the wider Kingdom footprint. Identity comes from Supabase Auth, not `connect-client.auth`. The mock stays for tests. |
| W4 | **This session = scope + ADR only** | No functional Wear code. Build is a later, multi-step unit on a branch off the now-current `main`. |

**Why A (vision-aligned):** it unblocks Wear *now* without waiting on Connect to grow a
commerce/OIDC API it has no domain for; it honours **D1** (one `auth.users`, schema-per-app) and
**SHARED_DB_CONTRACT** (RLS is the only wall; `wear.*` keeps a later split cheap); and one shared
identity is the literal "Connecting the Kingdom" payoff — a Citizen known in Connect is the same
Citizen in Wear, "making the unseen seen" across channels.

---

## 3. What Step 3 actually requires (the bounded build — for a future session)

Ordered, each independently shippable behind Wear's existing launch gate:

1. **Add Supabase to Wear** — `@supabase/supabase-js` (+ `@supabase/ssr`); env points at the
   **shared** project (`NEXT_PUBLIC_SUPABASE_URL`/anon key = `xyiajtrvhlxaeplsiajj`), **not** a new
   Wear project. Update `LOCAL-SETUP.md` §2/§3 + `.env.local` blueprint to match D1.
2. **Replace the mock session with Supabase Auth** — rewrite `apps/web/src/lib/session.ts`
   (`getSession`/`writeSessionCookie`) onto `@supabase/ssr`; Google OAuth callback; `getCurrentUser`
   resolves the Supabase user + shared `public.profiles`. Retire `MOCK_SIGN_IN_TOKEN` and the
   `connect-client.auth` path. Keep `MockConnectClient` for tests only.
3. **Land the `wear.*` schema** — the DDL is **already drafted**:
   [`../wear/143_wear_schema.sql`](../wear/143_wear_schema.sql) (tables, enums, RLS, grants, the
   `wear.users` mirror, the optional `brands.connect_contributor_id`, and a recursion-safe
   `is_conversation_member` helper). Move it to `supabase/migrations/143_wear_schema.sql` (renumber if
   Connect shipped a later migration meanwhile) and apply via `apply_migration`. Reads use
   `supabase-js` `db:{schema:'wear'}` (settled — see the data-access decision in §5). Wire
   `packages/db` off `MemoryWearStore` onto the real client.
4. **Reconcile `connect-client`** — drop/repoint the brands/products/users/OIDC surface; keep only
   real Connect reads Wear needs (contributors/categories over `/api/v1`). Update `ADR-0002` lineage.
5. **Tests/gates** — keep coverage gates green; contract tests updated to the reconciled surface.

**Connect-side work this implies:** exactly **one small additive endpoint** —
`GET /api/v1/profiles/{id}` (display-safe fields only), per the §5 Q1 recommendation — authored in
this repo's lineage and documented in `api-v1.md`. Everything else is Wear-side or operational;
Q4's contributor link reuses the existing `/api/v1/contributors/{slug}`.

---

## 4. SHARED_DB_CONTRACT implications

- **New schema boundary `wear.*`** — was named as "future" in the contract; this activates it.
  Add to the contract's schema list + the live-verification snapshot when the migration lands.
- **R4 `app_id` attribution** — Wear will be the **first sibling that writes analytics-relevant
  data**. The contract deferred the `app_id` *column* until "the 2nd app writes." Wear's arrival is
  the trigger to revisit whether shared analytics events need `app_id` (still deferrable if Wear's
  writes stay inside `wear.*`).
- **R2 (cross-app reads via `/api/v1`, not raw tables)** — Wear's *Connect* reads must go through
  `/api/v1`. Wear's *own* `wear.*` reads are first-party (direct client under RLS) — not a cross-app
  read, so R2 does not force them through an API.

## 5. Answers to the open questions — **RATIFIED (founder, 2026-07-01)**

All four ratified as recommended. Grounded in [`../SHARED_DB_CONTRACT.md`](../SHARED_DB_CONTRACT.md)
+ live code.

> **Data-access decision (founder Q, 2026-07-01): stay on Supabase (`supabase-js`), NOT Prisma.**
> Supabase is the *platform* (Postgres + Auth + RLS); Prisma would only be an alternative *client*.
> In this shared-DB, schema-per-app, **RLS-is-the-only-wall** model (R3), `supabase-js` connects
> with the user JWT so RLS is enforced automatically; **Prisma bypasses RLS** (privileged role) and
> would need a hand-built least-privilege `wear_app` role + all isolation in app code. Supabase Auth
> also *requires* `supabase-js` regardless, `prisma migrate` can't co-own a DB whose migrations live
> in Connect's SQL lineage, and Connect + Vision already use `supabase-js`. Prisma only makes sense
> if an app later gets its **own** dedicated project (the exit ramp). `schema.prisma` stays as a
> design reference only. This settles Q2 below.

> **Drafted DDL:** [`../wear/143_wear_schema.sql`](../wear/143_wear_schema.sql) — the full `wear.*`
> schema (tables, enums, RLS, grants) implementing these answers. **DRAFT — not yet applied**
> (deliberately outside `supabase/migrations/` so it can't auto-apply); apply during the build.

### Q1 — Citizen identity read path → **mirror in `wear.users`, hydrated from session + a small additive `/api/v1/profiles/{id}`**
The contract (R1.2/R2) says siblings read the commons **only via `/api/v1`**, never `public.*`
raw tables — *except* user-scoped data under RLS (R3.4). `public.profiles` is public-SELECT, but a
direct cross-app read of it from Wear would violate R2, and Connect today exposes only
*contributors* (approved orgs), not citizen profiles.
- **Current user** → Wear's own **Supabase Auth session** (id, email, OAuth metadata) — the
  sanctioned R3.4 user-scoped path. This also keys the user's own `wear.*` rows.
- **Other users' display identity** (post authors, followers, brand owners) → Wear keeps a
  **`wear.users` mirror** (handle/display_name/avatar) — exactly what its Prisma `User` model
  already intends ("Connect owns it; Wear stores it denormalised, reconciles via the event bus").
  The mirror is hydrated from each user's **own session on first Wear sign-in** — which covers
  essentially everyone Wear renders, because Wear only displays Wear participants.
- **Backfill gap** → add a **minimal, additive** Connect endpoint **`GET /api/v1/profiles/{id}`**
  returning *display-safe* fields only (id, handle/full_name, avatar_url), documented in
  `api-v1.md` (R2.2/R2.3). This keeps the rare "render a user who hasn't opened Wear" case inside
  the `/api/v1` contract instead of a raw-table read.
- *Why not read `public.profiles` directly:* violates R2 and welds Wear to Connect's table shape
  (hurts the exit ramp). *Why not Auth-claims-only:* claims give you only the current user.

### Q2 — Wear's `wear.*` reads → **supabase-js with `db: { schema: 'wear' }` (PostgREST, RLS-enforced) — mirror Vision**
- **Recommended:** the same client shape Vision just shipped (`db:{schema:'wear'}`, cast back to
  bare `SupabaseClient`). RLS enforces every read/write (satisfies R3 "RLS is the only wall"),
  it's ecosystem-consistent, needs no custom DB-role management, and Wear has **no Prisma runtime
  to preserve** (its store is in-memory; migrations are authored as SQL in *this* repo's lineage,
  not via `prisma migrate`). Keep `schema.prisma` only as the **design reference** for writing the
  `wear.*` DDL; do not wire Prisma at runtime. Implement the existing repo interfaces against
  supabase-js.
- *Trade-off:* if Wear later wants Prisma ergonomics, connect it via a dedicated least-privilege
  **`wear_app` role** scoped to `wear.*` (so bypassing RLS still can't touch `vision.*`/`public.*`
  writes) — extra ops; defer until there's a reason.

### Q3 — Deploy gates → **mirror Vision's three + the OAuth allow-list lesson**
1. Wear Vercel env: `NEXT_PUBLIC_SUPABASE_URL` = shared **`xyiajtrvhlxaeplsiajj`** + its
   **anon/publishable** key.
2. Supabase Dashboard → API → **Exposed schemas → add `wear`** (required for the `db.schema='wear'`
   PostgREST path; `wear` is not exposed today).
3. Set **`CONNECT_API_BASE_URL`** (prod Connect origin) + optional `CONNECT_API_KEY` (`cck_live_…`)
   for `/api/v1` reads.
4. Supabase Auth → URL config: add Wear's production origin (full `https://…`) to **Site URL /
   Redirect URLs** allow-list (the Connect §2b lesson — a scheme-less or missing entry breaks
   Google OAuth).

### Q4 — Brands ↔ Connect contributors → **Wear-owned, with an OPTIONAL ownership-verified link (mirror Vision exactly)**
`wear.brands` are **Wear-owned**. Add a **nullable** `connect_contributor_id` (value-ref to
`public.profiles.id`, **no cross-schema FK** — preserves R1.3/the exit ramp), set via an
**ownership-verified** link flow that mirrors Vision's `POST /api/connect/link`: resolve
`/api/v1/contributors/{slug}` → contributor id, verify `profile.id === auth.uid()` (no attribution
hijack), then store. Linked ⇒ the brand surfaces its Connect footprint ("make the unseen seen");
null ⇒ a pure Wear brand (the common case for small brands). This shrinks `connect-client`'s
residual surface to "read a contributor by slug/id over `/api/v1`" and **drops** the
brands/products/users *catalog* contract entirely (Wear owns those). Reuses Vision's proven,
security-hardened precedent verbatim.

### Net Connect-side work implied by these answers
Just **one** small additive endpoint — `GET /api/v1/profiles/{id}` (Q1) — authored in this repo's
lineage and documented in `api-v1.md`. Everything else is Wear-side or operational. (Q4's
contributor read uses the existing `/api/v1/contributors/{slug}`.)

## 6. Branch reconciliation (done this session)

Wear's `main` was a strict ancestor of the canonical trunk `chore/phase-2-se-poly-hardening`
(7 commits behind, **0 diverged**). Merged the existing **PR #8** (clean fast-forward; merge commit
`9e8833b`) so `main` now carries Phases 2.5–6 + the social-commerce foundation. `main` is the
correct base for the Step 3 build branch. The canonical branch and `chore/phase-4-local-rewrite`
(preserved for cherry-picks) were left untouched.

---

## 7. Cross-references
- [`ECOSYSTEM_DECISION_BRIEF.md`](./ECOSYSTEM_DECISION_BRIEF.md) — D1/D2/D5, §6 plan.
- [`../SHARED_DB_CONTRACT.md`](../SHARED_DB_CONTRACT.md) — schema boundaries, RLS-wall, R2/R4.
- [`../api-v1.md`](../api-v1.md) — the real cross-app contract surface.
- `citizens-wear` `docs/architecture/decisions/ADR-0002-connect-contract.md` (the contract that
  diverged) and `ADR-0007` (this decision, recorded in Wear's log).

*Author: Claude (Opus 4.8) per founder strategy session, 2026-06-21. Reflects verified on-disk state.*
