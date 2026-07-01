# ADR-0002 — Citizens Connect integration contract

- **Status:** Accepted (Phase 1) · **Amended 2026-07-02** (Phase 3 reconciliation — see below)
- **Date:** 2026-04-18
- **Deciders:** Citizens Network / Citizens Wear maintainers

## Context

Citizens Wear does not own identity, brands, or product catalog — Citizens Connect does. Wear must:

1. let citizens sign in on either side and land with the same identity on the other,
2. reflect brand profile and stock updates from Connect in near real time,
3. be buildable and testable **before** the Connect HTTP surface is stable.

At the time of Phase 1, the `citizensnetwork/citizens-connect` repository is not accessible from Wear's build environment. Blocking on Connect to begin Wear is not acceptable.

## Decision

We define a **TypeScript contract** (`@citizens-wear/connect-client`) that declares the capability surface Wear expects from Connect:

- `AuthProvider` — `verifyToken(token)`, `getCurrentUser(session)`.
- `UserDirectory` — `getById`, `getByHandle`, `search`.
- `BrandDirectory` — `getById`, `getBySlug`, `listAll`, `listForOwner`.
- `ProductCatalog` — `getById`, `listForBrand`.
- `EventBus` — `subscribe`, `publish` (webhook-fed in Phase 3).

Wear ships a `MockConnectClient` that satisfies the contract using in-memory fixtures. All application code depends on the interface, never on the mock directly. Contract tests in `packages/connect-client/test/` are written against the interface and must also pass against the real HTTP client when it lands.

### Invariants

- All IDs are opaque strings issued by Connect; Wear never invents them.
- All results are read-only, paginated snapshots.
- All errors are `ConnectError` with a stable `code` and optional HTTP `status`.
- All methods are async.

### Modes

- **`mode: "mock"`** — Phase 1 and local dev. Used by `MockConnectClient`.
- **`mode: "live"`** — Phase 3+. HTTP/OIDC client against a real Connect deployment.

`/api/connect/status` surfaces the active mode for debugging.

## Consequences

**Positive**

- Wear can be built, tested, and demoed without any Connect dependency.
- Phase 3 is a drop-in replacement: everything above the contract is unaffected.
- Contract tests catch drift between mock and live implementations.

**Negative**

- We could diverge from Connect's real shape if we don't sync early and often.
  → Mitigation: review the contract jointly with the Connect team at ARCH-GATE 1 and 2.

## Out of scope for Phase 1

- Real OIDC flow, token refresh, revocation.
- Webhook receiver, signature verification, replay protection (Phase 3).
- Write endpoints (Wear mutating Connect data) — not anticipated; if needed, a separate ADR.

---

## Amendment — 2026-07-02 (Step 3 reconciliation to Connect's real `/api/v1`)

The negative consequence above ("we could diverge from Connect's real shape") **happened**: the
Phase-1 contract assumed Connect was an identity + clothing-catalog service (`/v1/users`,
`/v1/brands`, `/v1/products`, OIDC token verify). Connect's real, stable surface is
`GET /api/v1/{events, places, contributors, contributors/[slug], categories, profiles/[id],
analytics}` — a map-discovery commons with **no** users/brands/products/OIDC (see
`citizens-connect/docs/api-v1.md` and ADR-0007). Per founder Direction A (ADR-0007):

1. **Identity** comes from the shared Supabase project (one `auth.users`), not `connect-client.auth`.
2. **Users, brands, and products are Wear-owned** — `wear.users` (display-safe mirror),
   `wear.brands`, and a deferred products model, served by `@citizens-wear/db` (`WearStore`),
   not by Connect.
3. **`connect-client` keeps only genuine Connect commons.** This amendment ADDS
   `ContributorDirectory` (`list`/`getBySlug`) and `CategoryDirectory` (`list`) over the real
   `GET /api/v1/contributors`, `/api/v1/contributors/{slug}`, and `/api/v1/categories`:
   - Offset pagination on the wire (`limit`/`offset`, `{ data, meta: { count, limit, offset } }`),
     surfaced through the contract's uniform `Page`/`PageParams` (a cursor is the stringified next
     offset — the mock paginator's long-standing convention).
   - Wire mapping snake→camel: `full_name→name`, `contributor_slug→slug`,
     `contributor_kind→kind`, `logo_url→logoUrl`, etc.
   - Endpoints are public and IP-rate-limited (`gateV1`); an optional service API key is sent as
     `X-API-Key` (the old `x-connect-api-key` header never matched Connect's key resolver).
   - Base URL env: `CONNECT_API_BASE_URL` (ecosystem-standard, same as Vision;
     `CONNECT_BASE_URL` accepted as legacy fallback).
4. **The legacy `auth`/`users`/`brands`/`products` surface is retired with the RSC frontend**
   (Step 3 D-removal + E): it targets endpoints that have never existed, and its consumers (the
   RSC pages) are replaced by the standalone HTML frontend talking to Wear's own `/api/*`. Until
   that lands, the legacy surface remains so the RSC pages keep compiling against the mock.

Contract tests continue to run against the interface; the mock mirrors the live endpoints'
semantics (name-ascending ordering, kind/q filters, `applies_to` widening to `both`).
