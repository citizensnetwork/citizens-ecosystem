import type {
  BlockEdge,
  BlockRepo,
  BrandRepo,
  BrandVerification,
  BrandVerificationRepo,
  CatalogueConversion,
  CatalogueConversionRepo,
  Comment,
  CommentLikeEdge,
  CommentRepo,
  Concept,
  ConceptClaim,
  ConceptClaimRepo,
  ConceptMedia,
  ConceptProposal,
  ConceptProposalRepo,
  ConceptRepo,
  ConceptStage,
  ConceptStatusLogEntry,
  ConceptStatusLogRepo,
  ConceptUpvote,
  ConceptWithMedia,
  ConnectId,
  Conversation,
  ConversationMember,
  ConversationRepo,
  ConversationRequestState,
  ConversationSummary,
  FeedPage,
  FeedPageParams,
  FollowCounts,
  FollowEdge,
  FollowRepo,
  HighlightRepo,
  LikeEdge,
  LikeRepo,
  Message,
  MessageRepo,
  Page,
  PageParams,
  Post,
  PostMedia,
  PostRepo,
  PostWithMedia,
  Profile,
  ProfileRepo,
  Report,
  ReportRepo,
  RoleRepo,
  RoyaltyObligation,
  RoyaltyRepo,
  SaveCollection,
  SaveRepo,
  SettingsRepo,
  Story,
  StoryHighlight,
  StoryReaction,
  StoryRepo,
  StoryTrayEntry,
  StoryView,
  TrendingHashtag,
  UserRepo,
  UserSettings,
  WearBrand,
  WearPlatformRole,
  WearStore,
  WearUser,
} from './contract';
import { CONCEPT_STAGES, WearStoreError } from './contract';
import { extractHashtags, normaliseHashtag } from './hashtags';

/**
 * In-memory implementation of `WearStore`.
 *
 * Used by app runtime (no DB yet) and by contract tests. Replaced in Phase 3
 * with a Prisma-backed implementation bound to the schema in
 * `prisma/schema.prisma`. Consumers must program against the interfaces in
 * `./contract`, never against this class directly.
 */
export interface MemoryWearStoreOptions {
  readonly now?: () => Date;
  readonly seedUsers?: readonly WearUser[];
  readonly seedBrands?: readonly WearBrand[];
  readonly seedProfiles?: readonly Profile[];
  readonly seedFollows?: readonly FollowEdge[];
  readonly seedSettings?: readonly UserSettings[];
  readonly seedPosts?: readonly PostWithMedia[];
  readonly seedLikes?: readonly LikeEdge[];
  readonly seedComments?: readonly Comment[];
  readonly seedStories?: readonly Story[];
  readonly seedConversations?: readonly {
    readonly conversation: Conversation;
    readonly members: readonly ConversationMember[];
    readonly messages?: readonly Message[];
  }[];
  readonly seedBlocks?: readonly BlockEdge[];
  /** Mig-145 platform roles (service_role-managed in prod; seed-only here). */
  readonly seedRoles?: readonly { readonly userId: ConnectId; readonly role: WearPlatformRole }[];
}

export class MemoryWearStore implements WearStore {
  public readonly users: UserRepo;
  public readonly brands: BrandRepo;
  public readonly profiles: ProfileRepo;
  public readonly follows: FollowRepo;
  public readonly settings: SettingsRepo;
  public readonly posts: PostRepo;
  public readonly likes: LikeRepo;
  public readonly comments: CommentRepo;
  public readonly saves: SaveRepo;
  public readonly stories: StoryRepo;
  public readonly highlights: HighlightRepo;
  public readonly conversations: ConversationRepo;
  public readonly messages: MessageRepo;
  public readonly blocks: BlockRepo;
  public readonly reports: ReportRepo;
  public readonly concepts: ConceptRepo;
  public readonly conceptProposals: ConceptProposalRepo;
  public readonly conceptClaims: ConceptClaimRepo;
  public readonly conceptStatusLog: ConceptStatusLogRepo;
  public readonly royalties: RoyaltyRepo;
  public readonly conversions: CatalogueConversionRepo;
  public readonly brandVerifications: BrandVerificationRepo;
  public readonly roles: RoleRepo;

  private readonly _now: () => Date;
  private readonly _users = new Map<ConnectId, WearUser>();
  private readonly _brands = new Map<ConnectId, WearBrand>();
  private readonly _profiles = new Map<ConnectId, Profile>();
  private readonly _settings = new Map<ConnectId, UserSettings>();
  /** Keyed by `${actorId}->${targetId}`. */
  private readonly _follows = new Map<string, FollowEdge>();
  private readonly _posts = new Map<string, Post>();
  private readonly _postMedia = new Map<string, PostMedia[]>();
  /** Keyed by `${postId}:${userId}`. */
  private readonly _likes = new Map<string, LikeEdge>();
  private readonly _comments = new Map<string, Comment>();
  /** Keyed by `${commentId}:${userId}`. */
  private readonly _commentLikes = new Map<string, CommentLikeEdge>();
  private readonly _saveCollections = new Map<string, SaveCollection>();
  /** Keyed by `${collectionId}:${postId}`. */
  private readonly _savedPosts = new Set<string>();
  // Phase 6 — stories
  private readonly _stories = new Map<string, Story>();
  /** Keyed by `${storyId}:${viewerId}`. */
  private readonly _storyViews = new Map<string, StoryView>();
  private readonly _storyReactions = new Map<string, StoryReaction>();
  private readonly _highlights = new Map<string, StoryHighlight>();
  // Phase 6 — direct messages
  private readonly _conversations = new Map<string, Conversation>();
  /** Keyed by `${conversationId}:${userId}`. */
  private readonly _convMembers = new Map<string, ConversationMember>();
  private readonly _messages = new Map<string, Message>();
  // Phase 6 — moderation
  /** Keyed by `${actorId}->${targetId}`. */
  private readonly _blocks = new Map<string, BlockEdge>();
  private readonly _reports = new Map<string, Report>();
  // Mig 145 — platform roles
  private readonly _roles = new Map<ConnectId, WearPlatformRole>();
  // Mig 157 — Concepts marketplace
  private readonly _concepts = new Map<string, Concept>();
  private readonly _conceptMedia = new Map<string, ConceptMedia[]>();
  /** Keyed by `${conceptId}:${userId}`. */
  private readonly _conceptUpvotes = new Map<string, ConceptUpvote>();
  private readonly _conceptProposals = new Map<string, ConceptProposal>();
  private readonly _conceptClaims = new Map<string, ConceptClaim>();
  private readonly _conceptStatusLog = new Map<string, ConceptStatusLogEntry>();
  private readonly _royalties = new Map<string, RoyaltyObligation>();
  private readonly _conversions = new Map<string, CatalogueConversion>();
  /** Keyed by brandId (PK — one lifecycle row per brand). */
  private readonly _brandVerifications = new Map<ConnectId, BrandVerification>();
  private _nextId = 1;

  public constructor(options: MemoryWearStoreOptions = {}) {
    this._now = options.now ?? (() => new Date());

    for (const u of options.seedUsers ?? []) {
      this._users.set(u.id, u);
    }
    for (const b of options.seedBrands ?? []) {
      this._brands.set(b.id, b);
    }
    for (const p of options.seedProfiles ?? []) {
      this._profiles.set(p.userId, p);
    }
    for (const s of options.seedSettings ?? []) {
      this._settings.set(s.userId, s);
    }
    for (const f of options.seedFollows ?? []) {
      this._follows.set(edgeKey(f.actorId, f.targetId), f);
    }
    for (const pm of options.seedPosts ?? []) {
      this._posts.set(pm.post.id, pm.post);
      this._postMedia.set(pm.post.id, [...pm.media]);
    }
    for (const l of options.seedLikes ?? []) {
      this._likes.set(`${l.postId}:${l.userId}`, l);
    }
    for (const c of options.seedComments ?? []) {
      this._comments.set(c.id, c);
    }
    for (const s of options.seedStories ?? []) {
      this._stories.set(s.id, s);
    }
    for (const cv of options.seedConversations ?? []) {
      this._conversations.set(cv.conversation.id, cv.conversation);
      for (const m of cv.members) {
        this._convMembers.set(memberKey(m.conversationId, m.userId), m);
      }
      for (const msg of cv.messages ?? []) {
        this._messages.set(msg.id, msg);
      }
    }
    for (const b of options.seedBlocks ?? []) {
      this._blocks.set(edgeKey(b.actorId, b.targetId), b);
    }
    for (const r of options.seedRoles ?? []) {
      this._roles.set(r.userId, r.role);
    }

    this.users = {
      getById: async (id) => this._users.get(id) ?? null,
      getByHandle: async (handle) => {
        const needle = handle.trim().toLowerCase();
        for (const u of this._users.values()) {
          if (u.handle.toLowerCase() === needle) return u;
        }
        return null;
      },
      search: async (query, params) => {
        const q = query.trim().toLowerCase();
        const all = [...this._users.values()].sort((a, b) => a.handle.localeCompare(b.handle));
        const matches = q
          ? all.filter(
              (u) => u.handle.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
            )
          : all;
        return paginateList(matches, params);
      },
      upsertFromSession: async (input) => {
        const ts = this._now().toISOString();
        const existing = this._users.get(input.id);
        if (existing) {
          const next: WearUser = {
            ...existing,
            displayName: input.displayName,
            avatarUrl: input.avatarUrl ?? null,
            updatedAt: ts,
          };
          this._users.set(input.id, next);
          return next;
        }
        const handle = this._uniqueHandle(input.handle, input.id);
        const created: WearUser = {
          id: input.id,
          handle,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._users.set(input.id, created);
        return created;
      },
    };

    this.brands = {
      getById: async (id) => this._brands.get(id) ?? null,
      getBySlug: async (slug) => {
        const needle = slug.trim().toLowerCase();
        for (const b of this._brands.values()) {
          if (b.slug.toLowerCase() === needle) return b;
        }
        return null;
      },
      listAll: async (params) => {
        const all = [...this._brands.values()].sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
        );
        return paginateList(all, params);
      },
      listForOwner: async (ownerId) =>
        [...this._brands.values()]
          .filter((b) => b.ownerUserId === ownerId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      search: async (query, params) => {
        const q = query.trim().toLowerCase();
        const all = [...this._brands.values()].sort((a, b) => a.name.localeCompare(b.name));
        const matches = q
          ? all.filter(
              (b) =>
                b.name.toLowerCase().includes(q) ||
                b.slug.toLowerCase().includes(q) ||
                (b.tagline ?? '').toLowerCase().includes(q),
            )
          : all;
        return paginateList(matches, params);
      },
      create: async (input) => {
        const slug = input.slug.trim().toLowerCase();
        if (!slug) {
          throw new WearStoreError('invalid_slug', 'Brand slug must not be empty.');
        }
        for (const b of this._brands.values()) {
          if (b.slug.toLowerCase() === slug) {
            throw new WearStoreError('slug_taken', `Brand slug ${slug} is already in use.`);
          }
        }
        const ts = this._now().toISOString();
        const created: WearBrand = {
          id: this._id('brd'),
          slug,
          name: input.name,
          tagline: input.tagline ?? null,
          websiteUrl: input.websiteUrl ?? null,
          logoUrl: input.logoUrl ?? null,
          verified: false,
          ownerUserId: input.ownerId,
          connectContributorId: input.connectContributorId ?? null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._brands.set(created.id, created);
        return created;
      },
      update: async (brandId, ownerId, patch) => {
        const current = this._brands.get(brandId);
        if (!current) {
          throw new WearStoreError('brand_not_found', `Unknown brand ${brandId}.`);
        }
        if (current.ownerUserId !== ownerId) {
          throw new WearStoreError('forbidden', 'Only the owner can edit this brand.');
        }
        const next: WearBrand = {
          ...current,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
          ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl } : {}),
          ...(patch.logoUrl !== undefined ? { logoUrl: patch.logoUrl } : {}),
          ...(patch.connectContributorId !== undefined
            ? { connectContributorId: patch.connectContributorId }
            : {}),
          updatedAt: this._now().toISOString(),
        };
        this._brands.set(brandId, next);
        return next;
      },
    };

    this.profiles = {
      get: async (userId) => this._profiles.get(userId) ?? null,
      getOrCreate: async (userId) => {
        const existing = this._profiles.get(userId);
        if (existing) return existing;
        const created: Profile = {
          userId,
          bio: null,
          visibility: 'public',
          verified: false,
          createdAt: this._now().toISOString(),
          updatedAt: this._now().toISOString(),
        };
        this._profiles.set(userId, created);
        return created;
      },
      update: async (userId, patch) => {
        const current = this._profiles.get(userId) ?? {
          userId,
          bio: null,
          visibility: 'public' as const,
          verified: false,
          createdAt: this._now().toISOString(),
          updatedAt: this._now().toISOString(),
        };
        const next: Profile = {
          ...current,
          ...patch,
          updatedAt: this._now().toISOString(),
        };
        this._profiles.set(userId, next);
        return next;
      },
    };

    this.follows = {
      follow: async (actorId, targetId) => {
        if (actorId === targetId) {
          throw new WearStoreError('self_follow', 'A user cannot follow themselves.');
        }
        const key = edgeKey(actorId, targetId);
        const existing = this._follows.get(key);
        if (existing) return existing;
        const edge: FollowEdge = {
          actorId,
          targetId,
          createdAt: this._now().toISOString(),
        };
        this._follows.set(key, edge);
        return edge;
      },
      unfollow: async (actorId, targetId) => {
        this._follows.delete(edgeKey(actorId, targetId));
      },
      isFollowing: async (actorId, targetId) => this._follows.has(edgeKey(actorId, targetId)),
      counts: async (userId): Promise<FollowCounts> => {
        let followers = 0;
        let following = 0;
        for (const edge of this._follows.values()) {
          if (edge.targetId === userId) followers += 1;
          if (edge.actorId === userId) following += 1;
        }
        return { followers, following };
      },
      followers: async (userId) => [...this._follows.values()].filter((e) => e.targetId === userId),
      following: async (userId) => [...this._follows.values()].filter((e) => e.actorId === userId),
    };

    this.settings = {
      get: async (userId) => {
        const existing = this._settings.get(userId);
        if (existing) return existing;
        const created: UserSettings = {
          userId,
          displayNameOverride: null,
          profileVisibility: 'public',
          createdAt: this._now().toISOString(),
          updatedAt: this._now().toISOString(),
        };
        this._settings.set(userId, created);
        return created;
      },
      update: async (userId, patch) => {
        const current = await this.settings.get(userId);
        const next: UserSettings = {
          ...current,
          ...patch,
          updatedAt: this._now().toISOString(),
        };
        this._settings.set(userId, next);
        return next;
      },
    };

    this.posts = {
      create: async (input): Promise<PostWithMedia> => {
        if (!input.body.trim()) {
          throw new WearStoreError('empty_post', 'Post body must not be empty.');
        }
        const id = this._id('pst');
        const createdAt = this._now().toISOString();
        const post: Post = {
          id,
          authorId: input.authorId,
          brandId: input.brandId ?? null,
          body: input.body,
          createdAt,
          updatedAt: createdAt,
          taggedProductIds: [...(input.taggedProductIds ?? [])],
          conceptId: null,
        };
        const media: PostMedia[] = (input.media ?? []).map((m, i) => ({
          ...m,
          id: this._id('med'),
          postId: id,
          orderIndex: m.orderIndex ?? i,
        }));
        this._posts.set(id, post);
        this._postMedia.set(id, media);
        return { post, media };
      },
      getById: async (id) => this._readPost(id),
      listByAuthor: async (authorId, params) =>
        this._paginate(
          [...this._posts.values()].filter((p) => p.authorId === authorId),
          params,
        ),
      listByBrand: async (brandId, params) =>
        this._paginate(
          [...this._posts.values()].filter((p) => p.brandId === brandId),
          params,
        ),
      feedChronological: async (viewerId, params) => {
        const following = new Set<ConnectId>([viewerId]);
        for (const edge of this._follows.values()) {
          if (edge.actorId === viewerId) following.add(edge.targetId);
        }
        const items = [...this._posts.values()].filter((p) => following.has(p.authorId));
        return this._paginate(items, params);
      },
      feedForYou: async (viewerId, params) => {
        // Feature-flagged stub: score = 2 * isFollowed + freshness.
        // Phase 5 replaces this with a ranking service.
        const following = new Set<ConnectId>([viewerId]);
        for (const edge of this._follows.values()) {
          if (edge.actorId === viewerId) following.add(edge.targetId);
        }
        const nowMs = this._now().getTime();
        const scored = [...this._posts.values()].map((p) => {
          const ageMs = nowMs - Date.parse(p.createdAt);
          const freshness = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 7));
          const followBoost = following.has(p.authorId) ? 2 : 0;
          return { post: p, score: followBoost + freshness };
        });
        scored.sort(
          (a, b) =>
            b.score - a.score || Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt),
        );
        return this._paginate(
          scored.map((s) => s.post),
          params,
          /*alreadySorted*/ true,
        );
      },
      searchByText: async (query, params) => {
        const q = query.trim().toLowerCase();
        if (!q) return this._paginate([], params);
        const matches = [...this._posts.values()].filter((p) => p.body.toLowerCase().includes(q));
        return this._paginate(matches, params);
      },
      listByHashtag: async (tag, params) => {
        const needle = normaliseHashtag(tag);
        if (!needle) return this._paginate([], params);
        const matches = [...this._posts.values()].filter((p) =>
          extractHashtags(p.body).includes(needle),
        );
        return this._paginate(matches, params);
      },
      trendingHashtags: async (options) => {
        const limit = Math.max(1, Math.min(50, options?.limit ?? 10));
        const windowMs = options?.windowMs ?? 1000 * 60 * 60 * 24 * 14;
        const nowMs = this._now().getTime();
        const counts = new Map<string, { count: number; score: number }>();
        for (const p of this._posts.values()) {
          const ageMs = nowMs - Date.parse(p.createdAt);
          const freshness = ageMs <= windowMs ? 1 - ageMs / windowMs : 0;
          for (const tag of extractHashtags(p.body)) {
            const current = counts.get(tag) ?? { count: 0, score: 0 };
            current.count += 1;
            current.score += 1 + freshness;
            counts.set(tag, current);
          }
        }
        const ranked: TrendingHashtag[] = [...counts.entries()]
          .map(([tag, v]) => ({ tag, postCount: v.count, score: v.score }))
          .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
        return ranked.slice(0, limit);
      },
    };

    this.likes = {
      likePost: async (postId, userId) => {
        if (!this._posts.has(postId)) {
          throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
        }
        const key = `${postId}:${userId}`;
        const existing = this._likes.get(key);
        if (existing) return existing;
        const edge: LikeEdge = { postId, userId, createdAt: this._now().toISOString() };
        this._likes.set(key, edge);
        return edge;
      },
      unlikePost: async (postId, userId) => {
        this._likes.delete(`${postId}:${userId}`);
      },
      isPostLiked: async (postId, userId) => this._likes.has(`${postId}:${userId}`),
      postLikeCount: async (postId) => {
        let n = 0;
        for (const l of this._likes.values()) if (l.postId === postId) n += 1;
        return n;
      },
      likeComment: async (commentId, userId) => {
        if (!this._comments.has(commentId)) {
          throw new WearStoreError('comment_not_found', `Unknown comment ${commentId}.`);
        }
        const key = `${commentId}:${userId}`;
        const existing = this._commentLikes.get(key);
        if (existing) return existing;
        const edge: CommentLikeEdge = {
          commentId,
          userId,
          createdAt: this._now().toISOString(),
        };
        this._commentLikes.set(key, edge);
        return edge;
      },
      unlikeComment: async (commentId, userId) => {
        this._commentLikes.delete(`${commentId}:${userId}`);
      },
      commentLikeCount: async (commentId) => {
        let n = 0;
        for (const l of this._commentLikes.values()) if (l.commentId === commentId) n += 1;
        return n;
      },
      postsLikedBy: async (userId) =>
        [...this._likes.values()]
          .filter((l) => l.userId === userId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    };

    this.comments = {
      create: async ({ postId, authorId, body, parentCommentId }) => {
        if (!this._posts.has(postId)) {
          throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
        }
        if (!body.trim()) {
          throw new WearStoreError('empty_comment', 'Comment body must not be empty.');
        }
        if (parentCommentId && !this._comments.has(parentCommentId)) {
          throw new WearStoreError(
            'parent_comment_not_found',
            `Unknown parent comment ${parentCommentId}.`,
          );
        }
        const comment: Comment = {
          id: this._id('cmt'),
          postId,
          authorId,
          parentCommentId: parentCommentId ?? null,
          body,
          createdAt: this._now().toISOString(),
        };
        this._comments.set(comment.id, comment);
        return comment;
      },
      listForPost: async (postId) =>
        [...this._comments.values()]
          .filter((c) => c.postId === postId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      authoredBy: async (userId) =>
        [...this._comments.values()]
          .filter((c) => c.authorId === userId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      commentsForPostCount: async (postId) => {
        let n = 0;
        for (const c of this._comments.values()) if (c.postId === postId) n += 1;
        return n;
      },
    };

    this.saves = {
      getOrCreateDefault: async (ownerId) => this._getOrCreateDefaultCollection(ownerId),
      listForOwner: async (ownerId) =>
        [...this._saveCollections.values()]
          .filter((c) => c.ownerId === ownerId)
          .map((c) => this._snapshotCollection(c)),
      savePost: async (ownerId, postId, collectionId) => {
        if (!this._posts.has(postId)) {
          throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
        }
        const collection = collectionId
          ? this._saveCollections.get(collectionId)
          : await this._getOrCreateDefaultCollection(ownerId);
        if (!collection) {
          throw new WearStoreError('collection_not_found', `Unknown collection ${collectionId}.`);
        }
        if (collection.ownerId !== ownerId) {
          throw new WearStoreError('forbidden', 'Collection does not belong to caller.');
        }
        this._savedPosts.add(`${collection.id}:${postId}`);
        return this._snapshotCollection(collection);
      },
      unsavePost: async (ownerId, postId, collectionId) => {
        if (collectionId) {
          const coll = this._saveCollections.get(collectionId);
          if (!coll || coll.ownerId !== ownerId) return;
          this._savedPosts.delete(`${collectionId}:${postId}`);
          return;
        }
        for (const c of this._saveCollections.values()) {
          if (c.ownerId === ownerId) this._savedPosts.delete(`${c.id}:${postId}`);
        }
      },
      isSaved: async (ownerId, postId) => {
        for (const c of this._saveCollections.values()) {
          if (c.ownerId === ownerId && this._savedPosts.has(`${c.id}:${postId}`)) return true;
        }
        return false;
      },
    };

    // ─────────────────────────────────────────────────────────────────────
    // Phase 6 — stories
    // ─────────────────────────────────────────────────────────────────────
    const DEFAULT_STORY_TTL_MS = 1000 * 60 * 60 * 24;

    this.stories = {
      create: async (input) => {
        const createdAt = this._now();
        const ttl = Math.max(1000, input.ttlMs ?? DEFAULT_STORY_TTL_MS);
        const expiresAt = new Date(createdAt.getTime() + ttl);
        const story: Story = {
          id: this._id('sty'),
          authorId: input.authorId,
          brandId: input.brandId ?? null,
          mediaUrl: input.mediaUrl ?? null,
          mediaKind: input.mediaKind ?? 'image',
          caption: (input.caption ?? '').trim() || null,
          audience: input.audience ?? 'public',
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        };
        if (story.mediaKind === 'text' && !story.caption) {
          throw new WearStoreError('empty_story', 'Text stories must have a caption.');
        }
        if (story.mediaKind !== 'text' && !story.mediaUrl) {
          throw new WearStoreError('empty_story', 'Image/video stories must have a media url.');
        }
        this._stories.set(story.id, story);
        return story;
      },
      getById: async (id) => this._stories.get(id) ?? null,
      listByAuthor: async (authorId) =>
        [...this._stories.values()]
          .filter((s) => s.authorId === authorId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      listActiveForViewer: async (viewerId) => {
        const nowMs = this._now().getTime();
        const followingTargets = new Set<ConnectId>();
        for (const edge of this._follows.values()) {
          if (edge.actorId === viewerId) followingTargets.add(edge.targetId);
        }
        return [...this._stories.values()]
          .filter((s) => Date.parse(s.expiresAt) > nowMs)
          .filter((s) => !this._isBlockedEither(viewerId, s.authorId))
          .filter((s) => {
            if (s.authorId === viewerId) return true;
            if (s.audience === 'public') return true;
            return followingTargets.has(s.authorId);
          })
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      },
      trayForViewer: async (viewerId) => {
        const active = await this.stories.listActiveForViewer(viewerId);
        const grouped = new Map<ConnectId, Story[]>();
        for (const s of active) {
          const list = grouped.get(s.authorId) ?? [];
          list.push(s);
          grouped.set(s.authorId, list);
        }
        const entries: StoryTrayEntry[] = [];
        for (const [authorId, list] of grouped.entries()) {
          // Already sorted newest-first by listActiveForViewer.
          const latest = list[0]!;
          const hasUnseen = list.some(
            (s) => !this._storyViews.has(`${s.id}:${viewerId}`) && s.authorId !== viewerId,
          );
          entries.push({
            authorId,
            latestStoryId: latest.id,
            latestCreatedAt: latest.createdAt,
            storyCount: list.length,
            hasUnseen,
          });
        }
        // Viewer's own tray entry first, then unseen, then the rest by recency.
        return entries.sort((a, b) => {
          if (a.authorId === viewerId) return -1;
          if (b.authorId === viewerId) return 1;
          if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
          return Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt);
        });
      },
      recordView: async (storyId, viewerId) => {
        const story = this._stories.get(storyId);
        if (!story) {
          throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        }
        if (story.authorId === viewerId) {
          // Authors don't show up in their own viewer list, but we still
          // return a synthetic view so callers don't have to special-case.
          return { storyId, viewerId, viewedAt: this._now().toISOString() };
        }
        const key = `${storyId}:${viewerId}`;
        const existing = this._storyViews.get(key);
        if (existing) return existing;
        const view: StoryView = {
          storyId,
          viewerId,
          viewedAt: this._now().toISOString(),
        };
        this._storyViews.set(key, view);
        return view;
      },
      listViewers: async (storyId, callerId) => {
        const story = this._stories.get(storyId);
        if (!story) return [];
        if (story.authorId !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can see story viewers.');
        }
        return [...this._storyViews.values()]
          .filter((v) => v.storyId === storyId)
          .sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt));
      },
      addReaction: async ({ storyId, userId, kind }) => {
        const story = this._stories.get(storyId);
        if (!story) {
          throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        }
        if (this._isBlockedEither(userId, story.authorId)) {
          throw new WearStoreError('forbidden', 'Cannot react to this story.');
        }
        const reaction: StoryReaction = {
          id: this._id('rxn'),
          storyId,
          userId,
          kind,
          createdAt: this._now().toISOString(),
        };
        this._storyReactions.set(reaction.id, reaction);
        return reaction;
      },
      listReactions: async (storyId) =>
        [...this._storyReactions.values()]
          .filter((r) => r.storyId === storyId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      delete: async (storyId, authorId) => {
        const s = this._stories.get(storyId);
        if (!s) return;
        if (s.authorId !== authorId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this story.');
        }
        this._stories.delete(storyId);
        for (const key of [...this._storyViews.keys()]) {
          if (key.startsWith(`${storyId}:`)) this._storyViews.delete(key);
        }
        for (const [id, r] of [...this._storyReactions.entries()]) {
          if (r.storyId === storyId) this._storyReactions.delete(id);
        }
        for (const [id, h] of [...this._highlights.entries()]) {
          if (h.storyIds.includes(storyId)) {
            this._highlights.set(id, {
              ...h,
              storyIds: h.storyIds.filter((sid) => sid !== storyId),
            });
          }
        }
      },
    };

    this.highlights = {
      create: async ({ ownerId, name, coverUrl }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new WearStoreError('empty_highlight', 'Highlight name must not be empty.');
        }
        const created: StoryHighlight = {
          id: this._id('hlt'),
          ownerId,
          name: trimmed.slice(0, 80),
          coverUrl: coverUrl ?? null,
          createdAt: this._now().toISOString(),
          storyIds: [],
        };
        this._highlights.set(created.id, created);
        return created;
      },
      listForOwner: async (ownerId) =>
        [...this._highlights.values()]
          .filter((h) => h.ownerId === ownerId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      getById: async (id) => this._highlights.get(id) ?? null,
      addStory: async (highlightId, storyId, ownerId) => {
        const highlight = this._requireOwnedHighlight(highlightId, ownerId);
        const story = this._stories.get(storyId);
        if (!story) {
          throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        }
        if (story.authorId !== ownerId) {
          throw new WearStoreError(
            'forbidden',
            'Highlights may only contain the owner’s own stories.',
          );
        }
        if (highlight.storyIds.includes(storyId)) return highlight;
        const next: StoryHighlight = {
          ...highlight,
          storyIds: [...highlight.storyIds, storyId],
        };
        this._highlights.set(highlightId, next);
        return next;
      },
      removeStory: async (highlightId, storyId, ownerId) => {
        const highlight = this._requireOwnedHighlight(highlightId, ownerId);
        const next: StoryHighlight = {
          ...highlight,
          storyIds: highlight.storyIds.filter((s) => s !== storyId),
        };
        this._highlights.set(highlightId, next);
        return next;
      },
      delete: async (highlightId, ownerId) => {
        this._requireOwnedHighlight(highlightId, ownerId);
        this._highlights.delete(highlightId);
      },
    };

    // ─────────────────────────────────────────────────────────────────────
    // Phase 6 — direct messages
    // ─────────────────────────────────────────────────────────────────────
    this.conversations = {
      getOrCreateDirect: async (actorId, otherId) => {
        if (actorId === otherId) {
          throw new WearStoreError('self_dm', 'Cannot start a DM with yourself.');
        }
        if (this._isBlockedEither(actorId, otherId)) {
          throw new WearStoreError('forbidden', 'Cannot start a DM with this user.');
        }
        const wantPair = [actorId, otherId].sort();
        for (const conv of this._conversations.values()) {
          if (conv.kind !== 'direct') continue;
          const members = [...this._convMembers.values()].filter(
            (m) => m.conversationId === conv.id,
          );
          if (members.length !== 2) continue;
          const ids = members.map((m) => m.userId).sort();
          if (ids[0] === wantPair[0] && ids[1] === wantPair[1]) {
            return conv;
          }
        }
        const followsOtherToActor = this._follows.has(edgeKey(otherId, actorId));
        // The initiator is always accepted on their own side. The recipient
        // is auto-accepted only if they already follow the sender — otherwise
        // the conversation lands in their requests inbox.
        const recipientRequestState: ConversationRequestState = followsOtherToActor
          ? 'accepted'
          : 'requested';
        const ts = this._now().toISOString();
        const conv: Conversation = {
          id: this._id('cnv'),
          kind: 'direct',
          name: null,
          createdById: actorId,
          createdAt: ts,
          updatedAt: ts,
        };
        this._conversations.set(conv.id, conv);
        this._convMembers.set(memberKey(conv.id, actorId), {
          conversationId: conv.id,
          userId: actorId,
          joinedAt: ts,
          lastReadAt: ts,
          mutedUntil: null,
          requestState: 'accepted',
          role: 'owner',
        });
        this._convMembers.set(memberKey(conv.id, otherId), {
          conversationId: conv.id,
          userId: otherId,
          joinedAt: ts,
          lastReadAt: null,
          mutedUntil: null,
          requestState: recipientRequestState,
          role: 'member',
        });
        return conv;
      },
      createGroup: async ({ createdById, name, memberIds }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new WearStoreError('empty_group_name', 'Group name must not be empty.');
        }
        const unique = Array.from(new Set([createdById, ...memberIds])).filter(
          (id) => !this._isBlockedEither(createdById, id),
        );
        if (unique.length < 2) {
          throw new WearStoreError('group_too_small', 'A group needs at least two members.');
        }
        const ts = this._now().toISOString();
        const conv: Conversation = {
          id: this._id('cnv'),
          kind: 'group',
          name: trimmed.slice(0, 80),
          createdById,
          createdAt: ts,
          updatedAt: ts,
        };
        this._conversations.set(conv.id, conv);
        for (const userId of unique) {
          this._convMembers.set(memberKey(conv.id, userId), {
            conversationId: conv.id,
            userId,
            joinedAt: ts,
            lastReadAt: userId === createdById ? ts : null,
            mutedUntil: null,
            requestState: 'accepted',
            role: userId === createdById ? 'owner' : 'member',
          });
        }
        return conv;
      },
      getById: async (id, callerId) => {
        const conv = this._conversations.get(id);
        if (!conv) return null;
        if (!this._convMembers.has(memberKey(id, callerId))) return null;
        return conv;
      },
      membership: async (conversationId, userId) =>
        this._convMembers.get(memberKey(conversationId, userId)) ?? null,
      listMembers: async (conversationId) =>
        [...this._convMembers.values()].filter((m) => m.conversationId === conversationId),
      listForUser: async (userId, options) => {
        const wantState = options?.requestState;
        const summaries: ConversationSummary[] = [];
        for (const conv of this._conversations.values()) {
          const me = this._convMembers.get(memberKey(conv.id, userId));
          if (!me) continue;
          if (wantState && me.requestState !== wantState) continue;
          const members = [...this._convMembers.values()].filter(
            (m) => m.conversationId === conv.id,
          );
          const messages = [...this._messages.values()]
            .filter((m) => m.conversationId === conv.id)
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          const lastMessage = messages.length ? messages[messages.length - 1]! : null;
          const lastReadMs = me.lastReadAt ? Date.parse(me.lastReadAt) : 0;
          const unreadCount = messages.filter(
            (m) => m.authorId !== userId && !m.deletedAt && Date.parse(m.createdAt) > lastReadMs,
          ).length;
          summaries.push({ conversation: conv, members, lastMessage, unreadCount });
        }
        return summaries.sort((a, b) => {
          const aTs = a.lastMessage?.createdAt ?? a.conversation.updatedAt;
          const bTs = b.lastMessage?.createdAt ?? b.conversation.updatedAt;
          return Date.parse(bTs) - Date.parse(aTs);
        });
      },
      markRead: async (conversationId, userId) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) return;
        this._convMembers.set(key, { ...member, lastReadAt: this._now().toISOString() });
      },
      acceptRequest: async (conversationId, userId) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) {
          throw new WearStoreError('not_a_member', 'No membership found.');
        }
        const next: ConversationMember = { ...member, requestState: 'accepted' };
        this._convMembers.set(key, next);
        return next;
      },
      declineRequest: async (conversationId, userId) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) return;
        // Decline = leave the conversation.
        this._convMembers.delete(key);
      },
      setMuted: async (conversationId, userId, mutedUntil) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) {
          throw new WearStoreError('not_a_member', 'No membership found.');
        }
        const next: ConversationMember = { ...member, mutedUntil };
        this._convMembers.set(key, next);
        return next;
      },
      leave: async (conversationId, userId) => {
        this._convMembers.delete(memberKey(conversationId, userId));
      },
    };

    this.messages = {
      send: async ({ conversationId, authorId, body }) => {
        const conv = this._conversations.get(conversationId);
        if (!conv) {
          throw new WearStoreError('conversation_not_found', `Unknown ${conversationId}.`);
        }
        const me = this._convMembers.get(memberKey(conversationId, authorId));
        if (!me) {
          throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        }
        if (me.requestState !== 'accepted' && conv.createdById !== authorId) {
          throw new WearStoreError('request_pending', 'Accept the request before replying.');
        }
        const trimmed = body.trim();
        if (!trimmed) {
          throw new WearStoreError('empty_message', 'Message body must not be empty.');
        }
        // Sanity-check blocks against every other member (1:1 or group).
        for (const m of this._convMembers.values()) {
          if (m.conversationId !== conversationId || m.userId === authorId) continue;
          if (this._isBlockedEither(authorId, m.userId)) {
            throw new WearStoreError('forbidden', 'Cannot message a user you have blocked.');
          }
        }
        const ts = this._now().toISOString();
        const message: Message = {
          id: this._id('msg'),
          conversationId,
          authorId,
          body: trimmed.slice(0, 4000),
          createdAt: ts,
          deletedAt: null,
        };
        this._messages.set(message.id, message);
        this._conversations.set(conversationId, { ...conv, updatedAt: ts });
        return message;
      },
      list: async (conversationId, callerId, params) => {
        const member = this._convMembers.get(memberKey(conversationId, callerId));
        if (!member) {
          throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        }
        const all = [...this._messages.values()]
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        const limit = Math.max(1, Math.min(100, params?.limit ?? 50));
        const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
        if (Number.isNaN(start) || start < 0) {
          throw new WearStoreError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
        }
        const slice = all.slice(start, start + limit);
        const nextIndex = start + slice.length;
        return {
          items: slice,
          nextCursor: nextIndex < all.length ? String(nextIndex) : null,
        };
      },
      deleteOwn: async (messageId, callerId) => {
        const m = this._messages.get(messageId);
        if (!m) return;
        if (m.authorId !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this message.');
        }
        this._messages.set(messageId, { ...m, deletedAt: this._now().toISOString(), body: '' });
      },
    };

    this.blocks = {
      block: async (actorId, targetId) => {
        if (actorId === targetId) {
          throw new WearStoreError('self_block', 'A user cannot block themselves.');
        }
        const key = edgeKey(actorId, targetId);
        const existing = this._blocks.get(key);
        if (existing) return existing;
        const edge: BlockEdge = {
          actorId,
          targetId,
          createdAt: this._now().toISOString(),
        };
        this._blocks.set(key, edge);
        // Blocking implies unfollowing in both directions.
        this._follows.delete(edgeKey(actorId, targetId));
        this._follows.delete(edgeKey(targetId, actorId));
        return edge;
      },
      unblock: async (actorId, targetId) => {
        this._blocks.delete(edgeKey(actorId, targetId));
      },
      isBlockedEither: async (a, b) => this._isBlockedEither(a, b),
      listBlocked: async (actorId) =>
        [...this._blocks.values()].filter((b) => b.actorId === actorId),
    };

    this.reports = {
      create: async ({ reporterId, subjectKind, subjectId, reason, note }) => {
        const report: Report = {
          id: this._id('rep'),
          reporterId,
          subjectKind,
          subjectId,
          reason,
          note: (note ?? '').trim() ? note!.trim().slice(0, 2000) : null,
          status: 'open',
          handledBy: null,
          handledAt: null,
          createdAt: this._now().toISOString(),
        };
        this._reports.set(report.id, report);
        return report;
      },
      listForSubject: async (subjectKind, subjectId) =>
        [...this._reports.values()]
          .filter((r) => r.subjectKind === subjectKind && r.subjectId === subjectId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      listByReporter: async (reporterId) =>
        [...this._reports.values()]
          .filter((r) => r.reporterId === reporterId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      listForModeration: async (callerId, filter) => {
        if (!this._isModerator(callerId)) {
          throw new WearStoreError('forbidden', 'Moderators only.');
        }
        return [...this._reports.values()]
          .filter((r) => !filter?.status || r.status === filter.status)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      },
      triage: async (reportId, callerId, status) => {
        if (!this._isModerator(callerId)) {
          throw new WearStoreError('forbidden', 'Moderators only.');
        }
        const report = this._reports.get(reportId);
        if (!report) {
          throw new WearStoreError('report_not_found', `Unknown report ${reportId}.`);
        }
        const next: Report = {
          ...report,
          status,
          handledBy: callerId,
          handledAt: this._now().toISOString(),
        };
        this._reports.set(reportId, next);
        return next;
      },
    };

    this.roles = {
      getOwn: async (userId) => this._roles.get(userId) ?? null,
    };

    // ─────────────────────────────────────────────────────────────────────
    // Mig 157 — Concepts marketplace. The rules below ARE the semantic spec
    // for `SupabaseWearStore`: they mirror the RLS policies + SECDEF RPCs of
    // migration 157, and error codes equal the RPCs' raise messages.
    // ─────────────────────────────────────────────────────────────────────
    this.concepts = {
      create: async (input) => {
        const title = input.title.trim();
        if (!title) {
          throw new WearStoreError('empty_concept', 'Concept title must not be empty.');
        }
        const ts = this._now().toISOString();
        const concept: Concept = {
          id: this._id('cpt'),
          creatorId: input.creatorId,
          title,
          description: (input.description ?? '').trim() || null,
          status: 'proposed',
          createdAt: ts,
          updatedAt: ts,
        };
        this._concepts.set(concept.id, concept);
        this._conceptMedia.set(
          concept.id,
          (input.media ?? []).map((m, i) => ({
            ...m,
            id: this._id('cme'),
            conceptId: concept.id,
            orderIndex: m.orderIndex ?? i,
          })),
        );
        return this._readConcept(concept.id)!;
      },
      getById: async (id) => this._readConcept(id),
      list: async (filter) => {
        const items = [...this._concepts.values()]
          .filter((c) => !filter?.status || c.status === filter.status)
          .filter((c) => !filter?.creatorId || c.creatorId === filter.creatorId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map((c) => this._readConcept(c.id)!);
        return paginateList(items, filter);
      },
      update: async (conceptId, callerId, patch) => {
        const concept = this._concepts.get(conceptId);
        if (!concept) {
          throw new WearStoreError('concept_not_found', `Unknown concept ${conceptId}.`);
        }
        if (concept.creatorId !== callerId) {
          throw new WearStoreError('forbidden', 'Only the creator can edit this concept.');
        }
        if (concept.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept is frozen once claimed.');
        }
        const title = patch.title !== undefined ? patch.title.trim() : concept.title;
        if (!title) {
          throw new WearStoreError('empty_concept', 'Concept title must not be empty.');
        }
        const next: Concept = {
          ...concept,
          title,
          ...(patch.description !== undefined
            ? { description: (patch.description ?? '').trim() || null }
            : {}),
          updatedAt: this._now().toISOString(),
        };
        this._concepts.set(conceptId, next);
        if (patch.media !== undefined) {
          this._conceptMedia.set(
            conceptId,
            patch.media.map((m, i) => ({
              ...m,
              id: this._id('cme'),
              conceptId,
              orderIndex: m.orderIndex ?? i,
            })),
          );
        }
        return this._readConcept(conceptId)!;
      },
      delete: async (conceptId, callerId) => {
        const concept = this._concepts.get(conceptId);
        if (!concept) return;
        if (!this._isModerator(callerId)) {
          if (concept.creatorId !== callerId) {
            throw new WearStoreError('forbidden', 'Only the creator can delete this concept.');
          }
          if (concept.status !== 'proposed') {
            throw new WearStoreError('concept_not_open', 'Concept is frozen once claimed.');
          }
        }
        // FK cascade (mig 157): media, upvotes, proposals, claims, log rows.
        this._concepts.delete(conceptId);
        this._conceptMedia.delete(conceptId);
        for (const key of [...this._conceptUpvotes.keys()]) {
          if (key.startsWith(`${conceptId}:`)) this._conceptUpvotes.delete(key);
        }
        const claimIds = new Set<string>();
        for (const [id, cl] of [...this._conceptClaims.entries()]) {
          if (cl.conceptId === conceptId) {
            claimIds.add(id);
            this._conceptClaims.delete(id);
          }
        }
        for (const [id, p] of [...this._conceptProposals.entries()]) {
          if (p.conceptId === conceptId) this._conceptProposals.delete(id);
        }
        for (const [id, entry] of [...this._conceptStatusLog.entries()]) {
          if (entry.conceptId === conceptId) this._conceptStatusLog.delete(id);
        }
        for (const [id, ob] of [...this._royalties.entries()]) {
          if (claimIds.has(ob.claimId)) this._royalties.delete(id);
        }
        for (const [id, conv] of [...this._conversions.entries()]) {
          if (claimIds.has(conv.claimId)) this._conversions.delete(id);
        }
      },
      upvote: async (conceptId, userId) => {
        if (!this._concepts.has(conceptId)) {
          throw new WearStoreError('concept_not_found', `Unknown concept ${conceptId}.`);
        }
        const key = `${conceptId}:${userId}`;
        const existing = this._conceptUpvotes.get(key);
        if (existing) return existing;
        const vote: ConceptUpvote = { conceptId, userId, createdAt: this._now().toISOString() };
        this._conceptUpvotes.set(key, vote);
        return vote;
      },
      removeUpvote: async (conceptId, userId) => {
        this._conceptUpvotes.delete(`${conceptId}:${userId}`);
      },
      upvoteCount: async (conceptId) => {
        let n = 0;
        for (const v of this._conceptUpvotes.values()) if (v.conceptId === conceptId) n += 1;
        return n;
      },
      hasUpvoted: async (conceptId, userId) => this._conceptUpvotes.has(`${conceptId}:${userId}`),
    };

    this.conceptProposals = {
      create: async (callerId, input) => {
        const brand = this._brands.get(input.brandId);
        if (!brand) {
          throw new WearStoreError('brand_not_found', `Unknown brand ${input.brandId}.`);
        }
        if (brand.ownerUserId !== callerId) {
          throw new WearStoreError('forbidden', 'Only the brand owner can propose.');
        }
        if (!brand.verified) {
          throw new WearStoreError('brand_not_verified', 'Only verified brands may propose.');
        }
        const concept = this._concepts.get(input.conceptId);
        if (!concept) {
          throw new WearStoreError('concept_not_found', `Unknown concept ${input.conceptId}.`);
        }
        if (concept.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept is no longer open for proposals.');
        }
        if (this._isBlockedEither(callerId, concept.creatorId)) {
          throw new WearStoreError('forbidden', 'Cannot propose across a block.');
        }
        for (const p of this._conceptProposals.values()) {
          if (p.conceptId === input.conceptId && p.brandId === input.brandId) {
            throw new WearStoreError('proposal_exists', 'This brand already proposed.');
          }
        }
        const ts = this._now().toISOString();
        const proposal: ConceptProposal = {
          id: this._id('cpp'),
          conceptId: input.conceptId,
          brandId: input.brandId,
          status: 'submitted',
          mockupUrls: [...(input.mockupUrls ?? [])],
          materials: (input.materials ?? '').trim() || null,
          estUnitPrice: input.estUnitPrice ?? null,
          moq: input.moq ?? null,
          estTurnaroundDays: input.estTurnaroundDays ?? null,
          note: (input.note ?? '').trim() || null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._conceptProposals.set(proposal.id, proposal);
        return proposal;
      },
      getById: async (id, callerId) => {
        const p = this._conceptProposals.get(id);
        if (!p || !this._canSeeProposal(p, callerId)) return null;
        return p;
      },
      listForConcept: async (conceptId, callerId) =>
        [...this._conceptProposals.values()]
          .filter((p) => p.conceptId === conceptId && this._canSeeProposal(p, callerId))
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      listForBrand: async (brandId, callerId) =>
        [...this._conceptProposals.values()]
          .filter((p) => p.brandId === brandId && this._canSeeProposal(p, callerId))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      update: async (proposalId, callerId, patch) => {
        const proposal = this._requireOwnedProposal(proposalId, callerId);
        if (proposal.status !== 'submitted') {
          throw new WearStoreError('proposal_not_open', 'Only a submitted proposal can be edited.');
        }
        const brand = this._brands.get(proposal.brandId);
        if (!brand?.verified) {
          throw new WearStoreError('brand_not_verified', 'Brand verification lapsed.');
        }
        const concept = this._concepts.get(proposal.conceptId);
        if (!concept || concept.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept is no longer open.');
        }
        const next: ConceptProposal = {
          ...proposal,
          ...(patch.mockupUrls !== undefined ? { mockupUrls: [...patch.mockupUrls] } : {}),
          ...(patch.materials !== undefined
            ? { materials: (patch.materials ?? '').trim() || null }
            : {}),
          ...(patch.estUnitPrice !== undefined ? { estUnitPrice: patch.estUnitPrice } : {}),
          ...(patch.moq !== undefined ? { moq: patch.moq } : {}),
          ...(patch.estTurnaroundDays !== undefined
            ? { estTurnaroundDays: patch.estTurnaroundDays }
            : {}),
          ...(patch.note !== undefined ? { note: (patch.note ?? '').trim() || null } : {}),
          updatedAt: this._now().toISOString(),
        };
        this._conceptProposals.set(proposalId, next);
        return next;
      },
      withdraw: async (proposalId, callerId) => {
        const proposal = this._requireOwnedProposal(proposalId, callerId);
        if (proposal.status === 'awarded') {
          throw new WearStoreError('forbidden', 'An awarded proposal cannot be withdrawn.');
        }
        if (proposal.status === 'withdrawn') return proposal;
        const next: ConceptProposal = {
          ...proposal,
          status: 'withdrawn',
          updatedAt: this._now().toISOString(),
        };
        this._conceptProposals.set(proposalId, next);
        return next;
      },
      resubmit: async (proposalId, callerId) => {
        const proposal = this._requireOwnedProposal(proposalId, callerId);
        if (proposal.status !== 'withdrawn' && proposal.status !== 'declined') {
          throw new WearStoreError('proposal_not_open', 'Only withdrawn/declined can re-enter.');
        }
        const brand = this._brands.get(proposal.brandId);
        if (!brand?.verified) {
          throw new WearStoreError('brand_not_verified', 'Only verified brands may propose.');
        }
        const concept = this._concepts.get(proposal.conceptId);
        if (!concept || concept.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept is no longer open.');
        }
        const next: ConceptProposal = {
          ...proposal,
          status: 'submitted',
          updatedAt: this._now().toISOString(),
        };
        this._conceptProposals.set(proposalId, next);
        return next;
      },
      publicTags: async (conceptId) =>
        [...this._conceptProposals.values()]
          .filter((p) => p.conceptId === conceptId && p.status !== 'withdrawn')
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
          .map((p) => ({ brandId: p.brandId, proposedAt: p.createdAt })),
    };

    this.conceptClaims = {
      award: async (proposalId, callerId) => {
        // Mirrors wear.award_concept_claim guard-for-guard, in order.
        const proposal = this._conceptProposals.get(proposalId);
        if (!proposal) {
          throw new WearStoreError('proposal_not_found', `Unknown proposal ${proposalId}.`);
        }
        const concept = this._concepts.get(proposal.conceptId);
        if (!concept) {
          throw new WearStoreError('concept_not_found', `Unknown concept ${proposal.conceptId}.`);
        }
        if (concept.creatorId !== callerId) {
          throw new WearStoreError('unauthorized', 'Only the creator can award their concept.');
        }
        if (concept.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept already claimed.');
        }
        if (proposal.status !== 'submitted') {
          throw new WearStoreError('proposal_not_open', 'Proposal is not open.');
        }
        const brand = this._brands.get(proposal.brandId);
        if (!brand || !brand.verified) {
          throw new WearStoreError('brand_not_verified', 'Brand is not verified.');
        }
        if (this._isBlockedEither(callerId, brand.ownerUserId)) {
          throw new WearStoreError('forbidden', 'Cannot award across a block.');
        }
        const ts = this._now().toISOString();
        const claim: ConceptClaim = {
          id: this._id('clm'),
          conceptId: concept.id,
          brandId: proposal.brandId,
          proposalId: proposal.id,
          status: 'active',
          awardedBy: callerId,
          awardedAt: ts,
          attributionPublic: true,
          attributionNote: null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._conceptClaims.set(claim.id, claim);
        this._conceptProposals.set(proposal.id, { ...proposal, status: 'awarded', updatedAt: ts });
        for (const [id, p] of this._conceptProposals.entries()) {
          if (p.conceptId === concept.id && p.id !== proposal.id && p.status === 'submitted') {
            this._conceptProposals.set(id, { ...p, status: 'declined', updatedAt: ts });
          }
        }
        this._concepts.set(concept.id, { ...concept, status: 'claimed', updatedAt: ts });
        const entry: ConceptStatusLogEntry = {
          id: this._id('csl'),
          conceptId: concept.id,
          claimId: claim.id,
          status: 'claimed',
          note: null,
          createdBy: callerId,
          createdAt: ts,
        };
        this._conceptStatusLog.set(entry.id, entry);
        // Doc §3.1: 10% on the first 100 units, committed at the point of claim.
        const royalty: RoyaltyObligation = {
          id: this._id('roy'),
          claimId: claim.id,
          kind: 'milestone',
          pct: 10,
          thresholdUnits: 100,
          status: 'active',
          proofUrl: null,
          proofNote: null,
          proofSubmittedAt: null,
          closedAt: null,
          closedBy: null,
          closedNote: null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._royalties.set(royalty.id, royalty);
        return claim;
      },
      getById: async (claimId) => this._conceptClaims.get(claimId) ?? null,
      getActiveForConcept: async (conceptId) => {
        for (const cl of this._conceptClaims.values()) {
          if (cl.conceptId === conceptId && cl.status === 'active') return cl;
        }
        return null;
      },
      listForBrand: async (brandId) =>
        [...this._conceptClaims.values()]
          .filter((cl) => cl.brandId === brandId)
          .sort((a, b) => Date.parse(b.awardedAt) - Date.parse(a.awardedAt)),
      revoke: async (claimId, callerId) => {
        const claim = this._conceptClaims.get(claimId);
        if (!claim) {
          throw new WearStoreError('claim_not_found', `Unknown claim ${claimId}.`);
        }
        if (!this._isAdmin(callerId)) {
          throw new WearStoreError('forbidden', 'Only an admin can revoke a claim.');
        }
        if (claim.status === 'revoked') return claim;
        const ts = this._now().toISOString();
        const next: ConceptClaim = { ...claim, status: 'revoked', updatedAt: ts };
        this._conceptClaims.set(claimId, next);
        // Mirrors trg_reopen_concept_on_claim_revoke.
        const concept = this._concepts.get(claim.conceptId);
        if (concept) {
          this._concepts.set(concept.id, { ...concept, status: 'proposed', updatedAt: ts });
        }
        return next;
      },
    };

    this.conceptStatusLog = {
      listForConcept: async (conceptId) =>
        [...this._conceptStatusLog.values()]
          .filter((e) => e.conceptId === conceptId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)),
      advance: async (conceptId, callerId, status, note) => {
        // Mirrors wear.advance_concept_status guard-for-guard, in order.
        const concept = this._concepts.get(conceptId);
        if (!concept) {
          throw new WearStoreError('concept_not_found', `Unknown concept ${conceptId}.`);
        }
        const claim = await this.conceptClaims.getActiveForConcept(conceptId);
        if (!claim) {
          throw new WearStoreError('no_active_claim', 'Concept has no active claim.');
        }
        const brand = this._brands.get(claim.brandId);
        if (!brand || brand.ownerUserId !== callerId) {
          throw new WearStoreError('unauthorized', 'Only the claiming brand can advance.');
        }
        if (stageIndex(status) <= stageIndex('claimed')) {
          throw new WearStoreError('invalid_stage', 'Brands own the log after claimed.');
        }
        if (stageIndex(status) <= stageIndex(concept.status)) {
          throw new WearStoreError('stage_not_forward', 'Stage transitions are forward-only.');
        }
        const ts = this._now().toISOString();
        const entry: ConceptStatusLogEntry = {
          id: this._id('csl'),
          conceptId,
          claimId: claim.id,
          status,
          note: (note ?? '').trim().slice(0, 500) || null,
          createdBy: callerId,
          createdAt: ts,
        };
        this._conceptStatusLog.set(entry.id, entry);
        this._concepts.set(conceptId, { ...concept, status, updatedAt: ts });
        if (status === 'released') {
          this._createCompletedConceptPost(claim);
        }
        return entry;
      },
    };

    this.royalties = {
      listForClaim: async (claimId, callerId) =>
        [...this._royalties.values()]
          .filter((ob) => ob.claimId === claimId && this._canSeeObligation(ob, callerId))
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      listForUser: async (callerId) =>
        [...this._royalties.values()]
          .filter((ob) => this._canSeeObligation(ob, callerId))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      submitProof: async (obligationId, callerId, proofUrl, note) => {
        // Mirrors wear.submit_royalty_proof guard-for-guard.
        const ob = this._royalties.get(obligationId);
        if (!ob) {
          throw new WearStoreError('obligation_not_found', `Unknown obligation ${obligationId}.`);
        }
        if (ob.kind !== 'milestone') {
          throw new WearStoreError('not_milestone', 'Proof applies to the milestone royalty.');
        }
        if (ob.status === 'closed') {
          throw new WearStoreError('already_closed', 'Obligation already closed.');
        }
        const claim = this._conceptClaims.get(ob.claimId);
        const brand = claim ? this._brands.get(claim.brandId) : undefined;
        if (!brand || brand.ownerUserId !== callerId) {
          throw new WearStoreError('unauthorized', 'Only the claiming brand submits proof.');
        }
        const url = proofUrl.trim();
        if (!url) {
          throw new WearStoreError('proof_url_required', 'Provide a proof url.');
        }
        const ts = this._now().toISOString();
        const next: RoyaltyObligation = {
          ...ob,
          status: 'proof_submitted',
          proofUrl: url,
          proofNote: (note ?? '').trim().slice(0, 500) || null,
          proofSubmittedAt: ts,
          updatedAt: ts,
        };
        this._royalties.set(obligationId, next);
        return next;
      },
      close: async (obligationId, callerId) => {
        // Mirrors wear.close_royalty_obligation guard-for-guard.
        const ob = this._royalties.get(obligationId);
        if (!ob) {
          throw new WearStoreError('obligation_not_found', `Unknown obligation ${obligationId}.`);
        }
        if (ob.status === 'closed') {
          throw new WearStoreError('already_closed', 'Obligation already closed.');
        }
        if (!this._isAdmin(callerId)) {
          const claim = this._conceptClaims.get(ob.claimId);
          const concept = claim ? this._concepts.get(claim.conceptId) : undefined;
          if (ob.status !== 'proof_submitted' || !concept || concept.creatorId !== callerId) {
            throw new WearStoreError('unauthorized', 'Creator confirms a submitted proof.');
          }
        }
        const ts = this._now().toISOString();
        const next: RoyaltyObligation = {
          ...ob,
          status: 'closed',
          closedAt: ts,
          closedBy: callerId,
          updatedAt: ts,
        };
        this._royalties.set(obligationId, next);
        return next;
      },
    };

    this.conversions = {
      propose: async (claimId, callerId) => {
        // Mirrors wear.propose_catalogue_conversion guard-for-guard.
        const claim = this._conceptClaims.get(claimId);
        if (!claim || claim.status !== 'active') {
          throw new WearStoreError('claim_not_active', 'Claim is not active.');
        }
        const brand = this._brands.get(claim.brandId);
        if (!brand || brand.ownerUserId !== callerId) {
          throw new WearStoreError('unauthorized', 'Only the claiming brand can propose.');
        }
        const concept = this._concepts.get(claim.conceptId);
        if (!concept || stageIndex(concept.status) < stageIndex('released')) {
          throw new WearStoreError('not_released', 'Conversion requires a released concept.');
        }
        for (const conv of this._conversions.values()) {
          if (conv.claimId === claimId && (conv.status === 'proposed' || conv.status === 'accepted')) {
            throw new WearStoreError('conversion_already_open', 'A handshake is already open.');
          }
        }
        const ts = this._now().toISOString();
        const conversion: CatalogueConversion = {
          id: this._id('ccv'),
          claimId,
          status: 'proposed',
          proposedBy: callerId,
          proposedAt: ts,
          respondedBy: null,
          respondedAt: null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._conversions.set(conversion.id, conversion);
        return conversion;
      },
      respond: async (conversionId, callerId, accept) => {
        // Mirrors wear.respond_catalogue_conversion guard-for-guard.
        const conv = this._conversions.get(conversionId);
        if (!conv || conv.status !== 'proposed') {
          throw new WearStoreError('conversion_not_open', 'Conversion is not open.');
        }
        const claim = this._conceptClaims.get(conv.claimId);
        if (!claim || claim.status !== 'active') {
          throw new WearStoreError('claim_not_active', 'Claim is not active.');
        }
        const concept = this._concepts.get(claim.conceptId);
        if (!concept || concept.creatorId !== callerId) {
          throw new WearStoreError('unauthorized', 'Only the creator can respond.');
        }
        const ts = this._now().toISOString();
        if (!accept) {
          const declined: CatalogueConversion = {
            ...conv,
            status: 'declined',
            respondedBy: callerId,
            respondedAt: ts,
            updatedAt: ts,
          };
          this._conversions.set(conversionId, declined);
          return declined;
        }
        const accepted: CatalogueConversion = {
          ...conv,
          status: 'accepted',
          respondedBy: callerId,
          respondedAt: ts,
          updatedAt: ts,
        };
        this._conversions.set(conversionId, accepted);
        // Public tag dropped; the claim row (concept↔item link) persists.
        this._conceptClaims.set(claim.id, { ...claim, attributionPublic: false, updatedAt: ts });
        // Milestone closed as superseded; lifetime 5% committed "in its place".
        for (const [id, ob] of this._royalties.entries()) {
          if (ob.claimId === claim.id && ob.kind === 'milestone' && ob.status !== 'closed') {
            this._royalties.set(id, {
              ...ob,
              status: 'closed',
              closedAt: ts,
              closedBy: callerId,
              closedNote: 'superseded by catalogue conversion (lifetime 5%)',
              updatedAt: ts,
            });
          }
        }
        const hasLifetime = [...this._royalties.values()].some(
          (ob) => ob.claimId === claim.id && ob.kind === 'lifetime',
        );
        if (!hasLifetime) {
          const lifetimeId = this._id('roy');
          this._royalties.set(lifetimeId, {
            id: lifetimeId,
            claimId: claim.id,
            kind: 'lifetime',
            pct: 5,
            thresholdUnits: null,
            status: 'active',
            proofUrl: null,
            proofNote: null,
            proofSubmittedAt: null,
            closedAt: null,
            closedBy: null,
            closedNote: null,
            createdAt: ts,
            updatedAt: ts,
          });
        }
        return accepted;
      },
      cancel: async (conversionId, callerId) => {
        // Mirrors wear.cancel_catalogue_conversion guard-for-guard.
        const conv = this._conversions.get(conversionId);
        if (!conv || conv.status !== 'proposed') {
          throw new WearStoreError('conversion_not_open', 'Conversion is not open.');
        }
        const claim = this._conceptClaims.get(conv.claimId);
        const brand = claim ? this._brands.get(claim.brandId) : undefined;
        if (!brand || brand.ownerUserId !== callerId) {
          throw new WearStoreError('unauthorized', 'Only the proposing brand can cancel.');
        }
        const ts = this._now().toISOString();
        const cancelled: CatalogueConversion = { ...conv, status: 'cancelled', updatedAt: ts };
        this._conversions.set(conversionId, cancelled);
        return cancelled;
      },
      listForClaim: async (claimId, callerId) =>
        [...this._conversions.values()]
          .filter((conv) => conv.claimId === claimId && this._canSeeConversion(conv, callerId))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    };

    this.brandVerifications = {
      request: async (brandId, callerId, note) => {
        const brand = this._brands.get(brandId);
        if (!brand) {
          throw new WearStoreError('brand_not_found', `Unknown brand ${brandId}.`);
        }
        if (brand.ownerUserId !== callerId) {
          throw new WearStoreError('forbidden', 'Only the brand owner can request verification.');
        }
        const ts = this._now().toISOString();
        const existing = this._brandVerifications.get(brandId);
        if (existing && existing.status !== 'rejected') {
          throw new WearStoreError('verification_exists', 'A verification request already exists.');
        }
        const next: BrandVerification = existing
          ? {
              ...existing,
              status: 'pending',
              note: (note ?? '').trim().slice(0, 2000) || null,
              requestedBy: callerId,
              requestedAt: ts,
              updatedAt: ts,
            }
          : {
              brandId,
              status: 'pending',
              note: (note ?? '').trim().slice(0, 2000) || null,
              requestedBy: callerId,
              requestedAt: ts,
              reviewedBy: null,
              reviewedAt: null,
              reviewNote: null,
              createdAt: ts,
              updatedAt: ts,
            };
        this._brandVerifications.set(brandId, next);
        this._syncBrandVerified(brandId, next.status);
        return next;
      },
      getForBrand: async (brandId, callerId) => {
        const row = this._brandVerifications.get(brandId);
        if (!row) return null;
        const brand = this._brands.get(brandId);
        const isOwner = !!brand && brand.ownerUserId === callerId;
        if (!isOwner && !this._isModerator(callerId)) return null;
        return row;
      },
      listPending: async (callerId) => {
        const moderator = this._isModerator(callerId);
        return [...this._brandVerifications.values()]
          .filter((v) => v.status === 'pending')
          .filter((v) => {
            if (moderator) return true;
            const brand = this._brands.get(v.brandId);
            return !!brand && brand.ownerUserId === callerId;
          })
          .sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
      },
      review: async (brandId, callerId, decision, reviewNote) => {
        if (!this._isAdmin(callerId)) {
          throw new WearStoreError('forbidden', 'Only an admin can review verification.');
        }
        const row = this._brandVerifications.get(brandId);
        if (!row) {
          throw new WearStoreError('verification_not_found', `No request for brand ${brandId}.`);
        }
        const ts = this._now().toISOString();
        const next: BrandVerification = {
          ...row,
          status: decision,
          reviewedBy: callerId,
          reviewedAt: ts,
          reviewNote: (reviewNote ?? '').trim().slice(0, 2000) || null,
          updatedAt: ts,
        };
        this._brandVerifications.set(brandId, next);
        this._syncBrandVerified(brandId, decision);
        return next;
      },
    };
  }

  private _isBlockedEither(a: ConnectId, b: ConnectId): boolean {
    return this._blocks.has(edgeKey(a, b)) || this._blocks.has(edgeKey(b, a));
  }

  // ── Mig 145/157 helpers ─────────────────────────────────────────────────
  /** `wear.is_moderator()`: any platform-role row (admin included). */
  private _isModerator(userId: ConnectId): boolean {
    return this._roles.has(userId);
  }

  /** `wear.is_admin()`: role = 'admin'. */
  private _isAdmin(userId: ConnectId): boolean {
    return this._roles.get(userId) === 'admin';
  }

  private _readConcept(id: string): ConceptWithMedia | null {
    const concept = this._concepts.get(id);
    if (!concept) return null;
    const media = [...(this._conceptMedia.get(id) ?? [])].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    return { concept, media };
  }

  /** The mig-157 proposal party predicate: brand owner, creator, moderator. */
  private _canSeeProposal(p: ConceptProposal, callerId: ConnectId): boolean {
    if (this._isModerator(callerId)) return true;
    const brand = this._brands.get(p.brandId);
    if (brand && brand.ownerUserId === callerId) return true;
    const concept = this._concepts.get(p.conceptId);
    return !!concept && concept.creatorId === callerId;
  }

  private _claimParties(claimId: string): { ownerId: ConnectId | null; creatorId: ConnectId | null } {
    const claim = this._conceptClaims.get(claimId);
    if (!claim) return { ownerId: null, creatorId: null };
    const brand = this._brands.get(claim.brandId);
    const concept = this._concepts.get(claim.conceptId);
    return { ownerId: brand?.ownerUserId ?? null, creatorId: concept?.creatorId ?? null };
  }

  private _canSeeObligation(ob: RoyaltyObligation, callerId: ConnectId): boolean {
    if (this._isModerator(callerId)) return true;
    const { ownerId, creatorId } = this._claimParties(ob.claimId);
    return callerId === ownerId || callerId === creatorId;
  }

  private _canSeeConversion(conv: CatalogueConversion, callerId: ConnectId): boolean {
    if (this._isModerator(callerId)) return true;
    const { ownerId, creatorId } = this._claimParties(conv.claimId);
    return callerId === ownerId || callerId === creatorId;
  }

  private _requireOwnedProposal(proposalId: string, callerId: ConnectId): ConceptProposal {
    const proposal = this._conceptProposals.get(proposalId);
    if (!proposal) {
      throw new WearStoreError('proposal_not_found', `Unknown proposal ${proposalId}.`);
    }
    const brand = this._brands.get(proposal.brandId);
    if (!brand || brand.ownerUserId !== callerId) {
      throw new WearStoreError('forbidden', 'Only the proposing brand can do this.');
    }
    return proposal;
  }

  /**
   * Mirrors `trg_completed_concept_post` (mig 157 §14): on 'released', create
   * the "Completed Concepts" post as the brand owner, copy the concept
   * artwork, duplicate-guarded per (concept, brand). The body carries NO
   * usernames — attribution renders relationally via `post.conceptId`.
   */
  private _createCompletedConceptPost(claim: ConceptClaim): void {
    if (claim.status !== 'active') return;
    const brand = this._brands.get(claim.brandId);
    if (!brand) return;
    for (const p of this._posts.values()) {
      if (p.conceptId === claim.conceptId && p.brandId === brand.id) return;
    }
    const concept = this._concepts.get(claim.conceptId);
    const ts = this._now().toISOString();
    const post: Post = {
      id: this._id('pst'),
      authorId: brand.ownerUserId,
      brandId: brand.id,
      body: `Completed Concept — "${concept?.title ?? 'Untitled'}"`,
      createdAt: ts,
      updatedAt: ts,
      taggedProductIds: [],
      conceptId: claim.conceptId,
    };
    this._posts.set(post.id, post);
    this._postMedia.set(
      post.id,
      [...(this._conceptMedia.get(claim.conceptId) ?? [])].map((m) => ({
        id: this._id('med'),
        postId: post.id,
        url: m.url,
        kind: m.kind,
        altText: m.altText,
        orderIndex: m.orderIndex,
      })),
    );
  }

  /** Mirrors `trg_sync_brand_verified`: cache the outcome onto the brand. */
  private _syncBrandVerified(brandId: ConnectId, status: BrandVerification['status']): void {
    const brand = this._brands.get(brandId);
    if (!brand) return;
    this._brands.set(brandId, {
      ...brand,
      verified: status === 'approved',
      updatedAt: this._now().toISOString(),
    });
  }

  /**
   * Resolve a globally-unique handle for a new mirror row. Starts from the
   * caller's preferred handle (already sanitised upstream) and suffixes
   * `-2`, `-3`, … until free. Empty input falls back to `user_<id-prefix>`.
   * Mirrors the retry-on-unique-violation behaviour of `SupabaseWearStore`.
   */
  private _uniqueHandle(preferred: string, id: ConnectId): string {
    const base = preferred.trim().toLowerCase() || `user_${id.slice(0, 8)}`;
    const taken = new Set<string>();
    for (const u of this._users.values()) taken.add(u.handle.toLowerCase());
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private _requireOwnedHighlight(highlightId: string, ownerId: ConnectId): StoryHighlight {
    const highlight = this._highlights.get(highlightId);
    if (!highlight) {
      throw new WearStoreError('highlight_not_found', `Unknown highlight ${highlightId}.`);
    }
    if (highlight.ownerId !== ownerId) {
      throw new WearStoreError('forbidden', 'Only the owner can modify this highlight.');
    }
    return highlight;
  }

  private _id(prefix: string): string {
    const n = this._nextId++;
    return `${prefix}_${String(n).padStart(6, '0')}`;
  }

  private _readPost(id: string): PostWithMedia | null {
    const post = this._posts.get(id);
    if (!post) return null;
    const media = [...(this._postMedia.get(id) ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    return { post, media };
  }

  private _paginate(
    posts: readonly Post[],
    params: FeedPageParams | undefined,
    alreadySorted = false,
  ): FeedPage {
    const limit = Math.max(1, Math.min(50, params?.limit ?? 20));
    const sorted = alreadySorted
      ? [...posts]
      : [...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
    if (Number.isNaN(start) || start < 0) {
      throw new WearStoreError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
    }
    const slice = sorted.slice(start, start + limit);
    const nextIndex = start + slice.length;
    return {
      items: slice.map((p) => ({
        post: p,
        media: [...(this._postMedia.get(p.id) ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
      })),
      nextCursor: nextIndex < sorted.length ? String(nextIndex) : null,
    };
  }

  private async _getOrCreateDefaultCollection(ownerId: ConnectId): Promise<SaveCollection> {
    for (const c of this._saveCollections.values()) {
      if (c.ownerId === ownerId && c.name === 'default') {
        return this._snapshotCollection(c);
      }
    }
    const created: SaveCollection = {
      id: this._id('col'),
      ownerId,
      name: 'default',
      createdAt: this._now().toISOString(),
      postIds: [],
    };
    this._saveCollections.set(created.id, created);
    return this._snapshotCollection(created);
  }

  private _snapshotCollection(c: SaveCollection): SaveCollection {
    const postIds: string[] = [];
    for (const key of this._savedPosts) {
      const [collId, postId] = key.split(':', 2);
      if (collId === c.id && postId) postIds.push(postId);
    }
    return { ...c, postIds };
  }
}

/**
 * Cursor pagination for the directory repos (users/brands). The cursor is the
 * numeric offset, matching the feed `_paginate` and the connect-client mock so
 * callers see one consistent pagination contract.
 */
function paginateList<T>(items: readonly T[], params?: PageParams): Page<T> {
  const limit = Math.max(1, Math.min(100, params?.limit ?? 20));
  const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
  if (Number.isNaN(start) || start < 0) {
    throw new WearStoreError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
  }
  const slice = items.slice(start, start + limit);
  const nextIndex = start + slice.length;
  return {
    items: slice,
    nextCursor: nextIndex < items.length ? String(nextIndex) : null,
  };
}

function edgeKey(actorId: ConnectId, targetId: ConnectId): string {
  return `${actorId}->${targetId}`;
}

/** Lifecycle position — enum order IS lifecycle order (mig 157 §1). */
function stageIndex(stage: ConceptStage): number {
  return CONCEPT_STAGES.indexOf(stage);
}

function memberKey(conversationId: string, userId: ConnectId): string {
  return `${conversationId}:${userId}`;
}
