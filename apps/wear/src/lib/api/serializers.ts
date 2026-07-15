import type {
  ConceptWithMedia,
  FeedPage,
  Page,
  PostWithMedia,
  WearBrand,
  WearNotification,
  WearStore,
  WearUser,
} from '@citizens/db';

/**
 * DTO shaping for the `/api/*` surface. Post authors and brands are resolved
 * through the store's own `users`/`brands` repos (the `wear.*` mirror) — no
 * `connect-client` round-trip — so the HTML app gets fully-hydrated cards from
 * one call.
 */

export interface UserDto {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface BrandDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly logoUrl: string | null;
  readonly verified: boolean;
  readonly ownerUserId: string;
}

export interface PostDto {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly taggedProductIds: readonly string[];
  readonly author: UserDto | null;
  readonly brand: BrandDto | null;
  readonly media: readonly {
    readonly url: string;
    readonly kind: string;
    readonly altText: string | null;
  }[];
  /**
   * Completed-Concepts attribution (mig 157). The concept link is PERMANENT;
   * `creator` renders ONLY while the claim's `attributionPublic` is true —
   * catalogue conversion nulls the tag without touching the link.
   */
  readonly concept?: {
    readonly id: string;
    readonly title: string;
    readonly creator: UserDto | null;
  } | null;
  /** Engagement (present when the serializer is asked to include it). */
  readonly likeCount?: number;
  readonly commentCount?: number;
  readonly viewerLiked?: boolean;
  readonly viewerSaved?: boolean;
}

export const toUserDto = (u: WearUser): UserDto => ({
  id: u.id,
  handle: u.handle,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
});

export interface NotificationDto {
  readonly id: string;
  readonly type: string;
  /** Who triggered it — hydrated fresh from the identity mirror (may be null). */
  readonly actor: UserDto | null;
  readonly conceptId: string | null;
  readonly brandId: string | null;
  /** Render payload written at trigger time (conceptTitle / stage / accepted …). */
  readonly data: Readonly<Record<string, unknown>>;
  readonly read: boolean;
  readonly createdAt: string;
}

/**
 * Hydrate notifications with their actor identity, batched by unique actor id
 * (the message text itself is composed client-side from `type` + `data`).
 */
export async function hydrateNotifications(
  store: WearStore,
  items: readonly WearNotification[],
): Promise<NotificationDto[]> {
  const actorIds = [...new Set(items.map((n) => n.actorId).filter((id): id is string => !!id))];
  const actors = new Map<string, UserDto>();
  await Promise.all(
    actorIds.map(async (id) => {
      const u = await store.users.getById(id);
      if (u) actors.set(id, toUserDto(u));
    }),
  );
  return items.map((n) => ({
    id: n.id,
    type: n.type,
    actor: n.actorId ? (actors.get(n.actorId) ?? null) : null,
    conceptId: n.conceptId,
    brandId: n.brandId,
    data: n.data,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  }));
}

export const toBrandDto = (b: WearBrand): BrandDto => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  tagline: b.tagline,
  logoUrl: b.logoUrl,
  verified: b.verified,
  ownerUserId: b.ownerUserId,
});

/**
 * Completed-Concepts attribution for a post (mig 157 serializer rule): the
 * concept link is always attached; the creator tag renders ONLY when the
 * post's brand holds the concept's active claim with `attributionPublic`.
 */
async function conceptAttribution(
  store: WearStore,
  post: PostWithMedia['post'],
): Promise<PostDto['concept']> {
  if (!post.conceptId) return null;
  const [entry, claim] = await Promise.all([
    store.concepts.getById(post.conceptId),
    store.conceptClaims.getActiveForConcept(post.conceptId),
  ]);
  if (!entry) return null;
  const tagPublic = !!claim && claim.brandId === post.brandId && claim.attributionPublic;
  const creator = tagPublic ? await store.users.getById(entry.concept.creatorId) : null;
  return {
    id: entry.concept.id,
    title: entry.concept.title,
    creator: creator ? toUserDto(creator) : null,
  };
}

/** Hydrate a single post with its author + (optional) brand + concept tag. */
export async function hydratePost(store: WearStore, entry: PostWithMedia): Promise<PostDto> {
  const [author, brand, concept] = await Promise.all([
    store.users.getById(entry.post.authorId),
    entry.post.brandId ? store.brands.getById(entry.post.brandId) : Promise.resolve(null),
    conceptAttribution(store, entry.post),
  ]);
  return {
    id: entry.post.id,
    body: entry.post.body,
    createdAt: entry.post.createdAt,
    taggedProductIds: entry.post.taggedProductIds,
    author: author ? toUserDto(author) : null,
    brand: brand ? toBrandDto(brand) : null,
    media: entry.media.map((m) => ({ url: m.url, kind: m.kind, altText: m.altText })),
    concept,
  };
}

/**
 * Hydrate a whole feed page, deduping author/brand lookups across items.
 * When `viewerId` is provided (even as `null` = anonymous), each item also
 * carries engagement counts + the viewer's liked/saved flags — the shape the
 * HTML app's feed cards render. The per-post count fan-out is bounded by the
 * page size (default 20), mirroring Connect's capped-count precedent.
 */
export async function hydrateFeed(
  store: WearStore,
  page: FeedPage,
  options?: { readonly viewerId: string | null },
): Promise<{ items: PostDto[]; nextCursor: string | null }> {
  const userIds = new Set<string>();
  const brandIds = new Set<string>();
  for (const { post } of page.items) {
    userIds.add(post.authorId);
    if (post.brandId) brandIds.add(post.brandId);
  }
  const [users, brands] = await Promise.all([
    Promise.all([...userIds].map((id) => store.users.getById(id))),
    Promise.all([...brandIds].map((id) => store.brands.getById(id))),
  ]);
  const userMap = new Map(users.filter((u): u is WearUser => !!u).map((u) => [u.id, u]));
  const brandMap = new Map(brands.filter((b): b is WearBrand => !!b).map((b) => [b.id, b]));

  const engagement = options
    ? await Promise.all(
        page.items.map(async ({ post }) => {
          const [likeCount, commentCount, viewerLiked, viewerSaved] = await Promise.all([
            store.likes.postLikeCount(post.id),
            store.comments.commentsForPostCount(post.id),
            options.viewerId
              ? store.likes.isPostLiked(post.id, options.viewerId)
              : Promise.resolve(false),
            options.viewerId
              ? store.saves.isSaved(options.viewerId, post.id)
              : Promise.resolve(false),
          ]);
          return { likeCount, commentCount, viewerLiked, viewerSaved };
        }),
      )
    : null;

  // Completed-Concepts attribution — rare in a page, resolved per post.
  const concepts = await Promise.all(
    page.items.map(({ post }) => conceptAttribution(store, post)),
  );

  return {
    items: page.items.map((entry, i) => ({
      id: entry.post.id,
      body: entry.post.body,
      createdAt: entry.post.createdAt,
      taggedProductIds: entry.post.taggedProductIds,
      author: userMap.has(entry.post.authorId)
        ? toUserDto(userMap.get(entry.post.authorId)!)
        : null,
      brand:
        entry.post.brandId && brandMap.has(entry.post.brandId)
          ? toBrandDto(brandMap.get(entry.post.brandId)!)
          : null,
      media: entry.media.map((m) => ({ url: m.url, kind: m.kind, altText: m.altText })),
      concept: concepts[i] ?? null,
      ...(engagement ? engagement[i]! : {}),
    })),
    nextCursor: page.nextCursor,
  };
}

// ── Concepts marketplace DTOs ────────────────────────────────────────────────

export interface ConceptCardDto {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly creator: UserDto | null;
  readonly media: readonly {
    readonly url: string;
    readonly kind: string;
    readonly altText: string | null;
  }[];
  readonly upvotes: number;
  readonly viewerUpvoted: boolean;
  /** Public brand tags ("3 brands proposed") — never proposal details. */
  readonly proposalCount: number;
  /** The claiming brand once awarded (claims are public info). */
  readonly claimedBy: BrandDto | null;
}

/** Hydrate one concept card (browse + detail share this shape). */
export async function hydrateConcept(
  store: WearStore,
  entry: ConceptWithMedia,
  viewerId: string | null,
): Promise<ConceptCardDto> {
  const [creator, upvotes, viewerUpvoted, tags, claim] = await Promise.all([
    store.users.getById(entry.concept.creatorId),
    store.concepts.upvoteCount(entry.concept.id),
    viewerId ? store.concepts.hasUpvoted(entry.concept.id, viewerId) : Promise.resolve(false),
    store.conceptProposals.publicTags(entry.concept.id),
    store.conceptClaims.getActiveForConcept(entry.concept.id),
  ]);
  const claimedBrand = claim ? await store.brands.getById(claim.brandId) : null;
  return {
    id: entry.concept.id,
    title: entry.concept.title,
    description: entry.concept.description,
    status: entry.concept.status,
    createdAt: entry.concept.createdAt,
    creator: creator ? toUserDto(creator) : null,
    media: entry.media.map((m) => ({ url: m.url, kind: m.kind, altText: m.altText })),
    upvotes,
    viewerUpvoted,
    proposalCount: tags.length,
    claimedBy: claimedBrand ? toBrandDto(claimedBrand) : null,
  };
}

/** Hydrate a browse page of concept cards (fan-out bounded by page size). */
export async function hydrateConceptPage(
  store: WearStore,
  page: Page<ConceptWithMedia>,
  viewerId: string | null,
): Promise<{ items: ConceptCardDto[]; nextCursor: string | null }> {
  const items = await Promise.all(page.items.map((c) => hydrateConcept(store, c, viewerId)));
  return { items, nextCursor: page.nextCursor };
}
