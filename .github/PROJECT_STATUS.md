# Citizens Wear Project Status

## Current Batch: Phase 4 — Posts & Feed (Slice C, full)

Status: validated locally, ready to ship.

Implemented:

- New consumer/creator/admin surfaces:
  - [/feed](../apps/web/src/app/feed/page.tsx) — dark, image-first chronological feed (12/page).
  - [/p/[id]](../apps/web/src/app/p/[id]/page.tsx) — post detail + threaded comments.
  - [/compose](../apps/web/src/app/compose/page.tsx) — citizen + brand composer with product tagging (only owned brands selectable).
  - [/admin/moderation](../apps/web/src/app/admin/moderation/page.tsx) — moderator queue with in-page 401/403 surfaces and `noindex`.
- Shared dark-tone PostCard component at [apps/web/src/components/post-card.tsx](../apps/web/src/components/post-card.tsx).
- Profile augmentations: `/u/[handle]` Activity list of published posts; `/b/[slug]` posts list, follower count, and Follow toggle.
- 9 server actions in [apps/web/src/lib/actions.ts](../apps/web/src/lib/actions.ts): `createPost`, `togglePostLike`, `togglePostSave`, `addComment`, `addToCart`, `followBrand`, `unfollowBrand`, `reportPost`, `resolveModeration`. Authz invariants:
  - Every mutation re-authenticates via `getSession()`; cookies are never trusted for scopes.
  - `createPost` accepts a `brandId` only when `client.brands.listForOwner(session.user.id)` confirms ownership.
  - Product tags are filtered by brand membership: brand posts must tag the same brand; citizen posts may only tag products of brands the citizen owns.
  - Media URLs validated by `isSafeMediaUrl` (URL parseable, http/https only, no embedded credentials, ≤2048 chars).
  - `resolveModeration` throws `Forbidden` (does not redirect) when `isAdmin(session)` is false, so admins are not pushed through the citizen sign-in loop.
  - `addToCart` revalidates only paths matching a small allowlist (`/feed`, `/p/[id]`, `/b/[slug]`, `/u/[handle]`).
- Mock admin scope: new `FIXTURE_ADMIN_TOKEN` + `fixtureAdminSession` (scope `admin.moderation`) in [packages/connect-client/src/fixtures/index.ts](../packages/connect-client/src/fixtures/index.ts); seeded automatically by `MockConnectClient`. Sign-in `?as=admin` preset for the moderator token is gated by `process.env.NODE_ENV !== 'production'`.
- `PageShell` gained `tone: 'paper' | 'dark'` and the nav now exposes `/feed` always, `/compose` when signed in, and `/admin/moderation` when the session has the admin scope.
- `Next 15.5` async `params` contract applied to `/p/[id]`, `/u/[handle]`, `/b/[slug]` (Promise + `await`).
- Seed data: 3 posts (post_001 brand brd_001 + tag prd_001; post_002 citizen usr_002; post_003 brand brd_001 + tag prd_002), 3 media URLs, 2 likes, 1 brand follow.

## Latest Validation

Run from workspace root on Windows PowerShell.

- `pnpm typecheck`: passed (turbo, 7 successful).
- `pnpm test`: passed. `@citizens-wear/connect-client` 14 tests, `@citizens-wear/db` 27 tests, `@citizens-wear/web` 22 tests (3 files; 18 → 22 covers new authz + returnPath allowlist + citizen-tag filter).
- `npx next lint --dir src`: 0 warnings/errors. `next lint` deprecation notice only (non-blocking).
- Architect review: passed after applying SHOULD-FIX items — async `params`, production-gate on mock moderator preset, citizen-post tag ownership filter, `addToCart.returnPath` allowlist, `noindex` on draft/hidden post detail metadata.
- Supabase security advisors: this slice did not apply Supabase migrations or add new Supabase DDL; baseline of 53 warnings is unchanged by inspection.

## Review Gates

- Architecture review: passed after fixing async-params regression and admin-token production-reach surface.
- Security/vibe review: passed after tightening citizen product-tag ownership, gating mock admin token by NODE_ENV, allowlisting cart returnPath revalidation, and `noindex` on non-published post metadata.

## Known Non-Blocking Warnings

- Full-repo `pnpm format:check` is not currently a clean gate because legacy/reference files have pre-existing formatting drift. Changed files from this batch are Prettier-clean.
- Next 15 still emits the `next lint` deprecation notice.
- `<img>` is used in `PostCard` instead of `next/image` because in-memory mock URLs aren't pre-configured in `images.remotePatterns`. Mitigation: `referrerPolicy="no-referrer"`, lazy loading, async decoding.

## Previous Batch: Social-Commerce Foundation

Status: shipped.

Implemented:

- Added [docs/social-commerce-vertical-slice.md](../docs/social-commerce-vertical-slice.md) to preserve the first-slice product, role, UX, and architectural guardrails.
- Extended `@citizens-wear/db` with Wear-owned social-commerce contracts: posts, media references, Connect product tags, likes, saves, comments, cart intent, brand follows, and moderation.
- Mirrored the social-commerce model in [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma), keeping Connect ids as references and preserving brand-post invariants.
- Implemented deterministic in-memory repositories in [packages/db/src/memory.ts](../packages/db/src/memory.ts).
- Expanded DB contract coverage to 27 tests in [packages/db/test/contract.test.ts](../packages/db/test/contract.test.ts).
- Remediated the PostCSS audit finding by pinning PostCSS to `8.5.10` and refreshing [pnpm-lock.yaml](../pnpm-lock.yaml).
- Updated [apps/web/next.config.js](../apps/web/next.config.js) to use top-level `typedRoutes` for Next 15.

Supabase advisors baseline (carried forward, unchanged this batch):

- `anon_security_definer_function_executable`: 20 warnings.
- `authenticated_security_definer_function_executable`: 20 warnings.
- `function_search_path_mutable`: 6 warnings.
- `materialized_view_in_api`: 5 warnings.
- `extension_in_public`: 1 warning.
- `auth_leaked_password_protection`: 1 warning.
</content>
</invoke>