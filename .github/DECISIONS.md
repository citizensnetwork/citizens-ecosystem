# Citizens Wear Decisions

## Phase 4 — Posts & Feed Batch

- Mock admin scope is wired via a second seeded Connect token (`FIXTURE_ADMIN_TOKEN` → `fixtureAdminSession` with `scopes: ['admin.moderation']`) rather than a runtime cookie flag. Production reach is hard-blocked: the sign-in page only exposes the moderator preset when `process.env.NODE_ENV !== 'production'`. Phase 3's real Connect OIDC client supersedes the mock without requiring code changes upstream.
- `isAdmin(session)` is the single authorisation oracle for moderator surfaces; cookies are never consulted for scopes.
- `resolveModeration` throws `Forbidden` instead of redirecting on missing scope. Redirecting would push admins through the citizen sign-in loop and conflate "no session" with "wrong scope". The admin route renders its own 403 surface.
- `createPost` verifies brand ownership server-side via `client.brands.listForOwner(session.user.id)` before accepting any `brandId`. Brand spoofing is therefore impossible at the action layer.
- Product tags on a post are filtered to brand membership: brand posts must tag products of the same brand; citizen posts may only tag products of brands the citizen owns. This prevents a signed-in user from attaching an "Add to cart" CTA to any brand's product without that brand opting in.
- Media URLs accepted by `createPost` are validated by `isSafeMediaUrl` (URL parseable, http/https only, no embedded credentials, ≤2048 chars). `javascript:` and similar schemes are dropped silently.
- `addToCart.returnPath` is restricted to a small allowlist (`/feed`, `/p/[id]`, `/b/[slug]`, `/u/[handle]`) to prevent attacker-controlled `revalidatePath` calls from busting unrelated caches.
- `<img>` (with `referrerPolicy="no-referrer"`, lazy loading, async decoding) is used in `PostCard` instead of `next/image` because in-memory mock URLs aren't pre-configured in `images.remotePatterns`. We will revisit when media moves to a controlled object store in Phase 4 follow-ups.
- Dynamic pages (`/p/[id]`, `/u/[handle]`, `/b/[slug]`) use the Next 15.5 async `params` contract (`Promise<{...}>` + `await`). The previous sync usage was a latent regression.
- Post detail metadata sets `robots: { index: false, follow: false }` for posts whose `status !== 'published'` so author-visible drafts/hidden/rejected content cannot be indexed.
- `PageShell` ships a `tone: 'paper' | 'dark'` variant. Paper is the trust surface (account, settings, profile, drops) and dark is the social-commerce surface (feed, post detail, compose, moderation).
- Server-action files (`'use server'`) export only async functions. Type re-exports (e.g. `PostStatus`) live next to the contract, not next to actions.

## Social-Commerce Foundation Batch

- Citizens Wear owns social state: posts, media references, product tags, comments, likes, saves, cart intent, brand follows, profile settings, and moderation state.
- Citizens Connect remains the source of truth for users, brands, products, stock state, and catalog ids. Wear stores Connect ids only and does not invent catalog records.
- The first durable UX direction is hybrid: paper/light surfaces for trust, account, profile, and settings; dark image-first surfaces for feed, shop, saved, cart, and discovery.
- `CreatePostInput` does not accept `authorKind`. The store derives author kind from `brandId` and rejects contradictory runtime input.
- Prisma `Post.authorKind` has no default, and `Post.brand` uses `onDelete: Restrict` so brand posts cannot silently lose their brand id.
- Public post listing defaults to published readable posts. Draft, hidden, rejected, and other restricted listing paths require author visibility or branded trusted access.
- Trusted restricted listing uses `TrustedPostListAccess`; there is no public `includeRestricted` boolean in the shared contract.
- Likes, saves, and comments require the actor to be able to read a published post.
- Cart item updates and removals require both `userId` and `cartItemId`, and the store enforces ownership.
- Moderation items validate post/comment targets on open and cannot be resolved twice.
- PostCSS is pinned to `8.5.10` to remediate the audit finding for `GHSA-qx2v-qp2m-jg93`.
