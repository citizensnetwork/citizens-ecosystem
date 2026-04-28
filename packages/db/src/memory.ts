import type {
  BrandFollow,
  BrandFollowCounts,
  BrandFollowRepo,
  CartItem,
  CartRepo,
  CommentRepo,
  CreateCommentInput,
  ConnectId,
  FeedParams,
  FollowCounts,
  FollowEdge,
  FollowRepo,
  ModerationItem,
  ModerationRepo,
  OpenModerationItemInput,
  Post,
  PostComment,
  PostEngagementRepo,
  PostLike,
  PostListParams,
  PostMedia,
  PostProductTag,
  PostRepo,
  PostStatus,
  Profile,
  ProfileRepo,
  SaveRepo,
  SavedPost,
  BlockEdge,
  BlockRepo,
  Comment,
  CommentLikeEdge,
  CommentRepo,
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
  Post,
  PostMedia,
  PostRepo,
  PostWithMedia,
  Profile,
  ProfileRepo,
  Report,
  ReportRepo,
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
  UserSettings,
  WearPage,
  WearPageParams,
  WearStore,
} from './contract';
import { hasTrustedPostListAccess, WearStoreError } from './contract';
import { WearStoreError } from './contract';
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
  readonly seedProfiles?: readonly Profile[];
  readonly seedFollows?: readonly FollowEdge[];
  readonly seedSettings?: readonly UserSettings[];
  readonly seedPosts?: readonly Post[];
  readonly seedPostMedia?: readonly PostMedia[];
  readonly seedPostProductTags?: readonly PostProductTag[];
  readonly seedPostLikes?: readonly PostLike[];
  readonly seedComments?: readonly PostComment[];
  readonly seedSavedPosts?: readonly SavedPost[];
  readonly seedCartItems?: readonly CartItem[];
  readonly seedBrandFollows?: readonly BrandFollow[];
  readonly seedModerationItems?: readonly ModerationItem[];
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
}

export class MemoryWearStore implements WearStore {
  public readonly profiles: ProfileRepo;
  public readonly follows: FollowRepo;
  public readonly settings: SettingsRepo;
  public readonly posts: PostRepo;
  public readonly postEngagement: PostEngagementRepo;
  public readonly comments: CommentRepo;
  public readonly saves: SaveRepo;
  public readonly cart: CartRepo;
  public readonly brandFollows: BrandFollowRepo;
  public readonly moderation: ModerationRepo;
  public readonly likes: LikeRepo;
  public readonly comments: CommentRepo;
  public readonly saves: SaveRepo;
  public readonly stories: StoryRepo;
  public readonly highlights: HighlightRepo;
  public readonly conversations: ConversationRepo;
  public readonly messages: MessageRepo;
  public readonly blocks: BlockRepo;
  public readonly reports: ReportRepo;

  private readonly _now: () => Date;
  private readonly _profiles = new Map<ConnectId, Profile>();
  private readonly _settings = new Map<ConnectId, UserSettings>();
  /** Keyed by `${actorId}->${targetId}`. */
  private readonly _follows = new Map<string, FollowEdge>();
  private readonly _posts = new Map<string, Post>();
  private readonly _postMedia = new Map<string, PostMedia>();
  private readonly _postProductTags = new Map<string, PostProductTag>();
  private readonly _postLikes = new Map<string, PostLike>();
  private readonly _comments = new Map<string, PostComment>();
  private readonly _savedPosts = new Map<string, SavedPost>();
  private readonly _cartItems = new Map<string, CartItem>();
  private readonly _brandFollows = new Map<string, BrandFollow>();
  private readonly _moderationItems = new Map<string, ModerationItem>();

  private _postSequence = 1;
  private _mediaSequence = 1;
  private _commentSequence = 1;
  private _cartSequence = 1;
  private _moderationSequence = 1;
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
  private _nextId = 1;

  public constructor(options: MemoryWearStoreOptions = {}) {
    this._now = options.now ?? (() => new Date());

    for (const p of options.seedProfiles ?? []) {
      this._profiles.set(p.userId, p);
    }
    for (const s of options.seedSettings ?? []) {
      this._settings.set(s.userId, s);
    }
    for (const f of options.seedFollows ?? []) {
      this._follows.set(edgeKey(f.actorId, f.targetId), f);
    }
    for (const post of options.seedPosts ?? []) {
      this._posts.set(post.id, post);
    }
    for (const media of options.seedPostMedia ?? []) {
      this._postMedia.set(media.id, media);
    }
    for (const tag of options.seedPostProductTags ?? []) {
      this._postProductTags.set(productTagKey(tag.postId, tag.productId), tag);
    }
    for (const like of options.seedPostLikes ?? []) {
      this._postLikes.set(postLikeKey(like.actorUserId, like.postId), like);
    }
    for (const comment of options.seedComments ?? []) {
      this._comments.set(comment.id, comment);
    }
    for (const savedPost of options.seedSavedPosts ?? []) {
      this._savedPosts.set(savedPostKey(savedPost.userId, savedPost.postId), savedPost);
    }
    for (const item of options.seedCartItems ?? []) {
      this._cartItems.set(item.id, item);
    }
    for (const follow of options.seedBrandFollows ?? []) {
      this._brandFollows.set(brandFollowKey(follow.userId, follow.brandId), follow);
    }
    for (const item of options.seedModerationItems ?? []) {
      this._moderationItems.set(item.id, item);
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
      create: async (input) => {
        const caption = input.caption.trim();
        if (caption.length === 0) {
          throw new WearStoreError('invalid_post', 'Post caption cannot be empty.');
        }

        const now = this.nowIso();
        const status = input.status ?? 'published';
        const publishedAt =
          input.publishedAt !== undefined ? input.publishedAt : status === 'published' ? now : null;
        const brandId = input.brandId ?? null;
        const authorKind = brandId ? 'brand' : 'citizen';
        const requestedAuthorKind = (input as { readonly authorKind?: Post['authorKind'] })
          .authorKind;
        if (requestedAuthorKind !== undefined && requestedAuthorKind !== authorKind) {
          throw new WearStoreError(
            'invalid_post_author',
            'Brand posts must include a brand id and citizen posts must not include one.',
          );
        }
        const post: Post = {
          id: this.nextPostId(),
          authorUserId: input.authorUserId,
          authorKind,
          brandId,
          caption,
          status,
          visibility: input.visibility ?? 'public',
          createdAt: now,
          updatedAt: now,
          publishedAt,
        };
        this._posts.set(post.id, post);

        for (const [index, media] of (input.media ?? []).entries()) {
          const created: PostMedia = {
            id: this.nextMediaId(),
            postId: post.id,
            url: media.url,
            altText: media.altText,
            sortOrder: media.sortOrder ?? index,
          };
          this._postMedia.set(created.id, created);
        }

        for (const [index, tag] of (input.productTags ?? []).entries()) {
          const created: PostProductTag = {
            postId: post.id,
            productId: tag.productId,
            sortOrder: tag.sortOrder ?? index,
          };
          this._postProductTags.set(productTagKey(created.postId, created.productId), created);
        }

        return post;
      },
      get: async (postId) => this._posts.get(postId) ?? null,
      update: async (postId, patch) => {
        const current = this.requirePost(postId);
        const nextStatus = patch.status ?? current.status;
        const nextPublishedAt =
          patch.publishedAt !== undefined
            ? patch.publishedAt
            : nextStatus === 'published' && current.publishedAt === null
              ? this.nowIso()
              : current.publishedAt;
        const next: Post = {
          ...current,
          ...patch,
          status: nextStatus,
          publishedAt: nextPublishedAt,
          updatedAt: this.nowIso(),
        };
        this._posts.set(postId, next);
        return next;
      },
      listFeed: async (params) => pagePosts(this.filteredFeedPosts(params), params),
      listForAuthor: async (authorUserId, params) =>
        pagePosts(
          this.filteredPosts(params).filter((post) => post.authorUserId === authorUserId),
          params,
        ),
      listForBrand: async (brandId, params) =>
        pagePosts(
          this.filteredPosts(params).filter((post) => post.brandId === brandId),
          params,
        ),
      listMedia: async (postId) =>
        [...this._postMedia.values()]
          .filter((media) => media.postId === postId)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      listProductTags: async (postId) =>
        [...this._postProductTags.values()]
          .filter((tag) => tag.postId === postId)
          .sort((left, right) => left.sortOrder - right.sortOrder),
    };

    this.postEngagement = {
      like: async (actorUserId, postId) => {
        this.requireEngageablePost(postId, actorUserId);
        const key = postLikeKey(actorUserId, postId);
        const existing = this._postLikes.get(key);
        if (existing) return existing;
        const like: PostLike = {
          actorUserId,
          postId,
          createdAt: this.nowIso(),
        };
        this._postLikes.set(key, like);
        return like;
      },
      unlike: async (actorUserId, postId) => {
        this._postLikes.delete(postLikeKey(actorUserId, postId));
      },
      isLiked: async (actorUserId, postId) => this._postLikes.has(postLikeKey(actorUserId, postId)),
      likeCount: async (postId) =>
        [...this._postLikes.values()].filter((like) => like.postId === postId).length,
    };

    this.comments = {
      create: async (input) => this.createComment(input),
      get: async (commentId) => this._comments.get(commentId) ?? null,
      listForPost: async (postId, params) =>
        pageItems(
          [...this._comments.values()]
            .filter((comment) => comment.postId === postId && comment.status === 'visible')
            .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
          params,
        ),
      hide: async (commentId) => {
        const current = this._comments.get(commentId);
        if (!current) {
          throw new WearStoreError('not_found', `Comment ${commentId} does not exist.`);
        }
        const next: PostComment = {
          ...current,
          status: 'hidden',
          updatedAt: this.nowIso(),
        };
        this._comments.set(commentId, next);
        return next;
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
      save: async (userId, postId) => {
        this.requireEngageablePost(postId, userId);
        const key = savedPostKey(userId, postId);
        const existing = this._savedPosts.get(key);
        if (existing) return existing;
        const savedPost: SavedPost = {
          userId,
          postId,
          createdAt: this.nowIso(),
        };
        this._savedPosts.set(key, savedPost);
        return savedPost;
      },
      unsave: async (userId, postId) => {
        this._savedPosts.delete(savedPostKey(userId, postId));
      },
      isSaved: async (userId, postId) => this._savedPosts.has(savedPostKey(userId, postId)),
      listForUser: async (userId, params) =>
        pageItems(
          [...this._savedPosts.values()]
            .filter((savedPost) => savedPost.userId === userId)
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
          params,
        ),
    };

    this.cart = {
      addItem: async (userId, productId, quantity = 1) => {
        assertPositiveQuantity(quantity);
        const existing = this.findCartItem(userId, productId);
        if (existing) {
          const next: CartItem = {
            ...existing,
            quantity: existing.quantity + quantity,
            updatedAt: this.nowIso(),
          };
          this._cartItems.set(existing.id, next);
          return next;
        }

        const now = this.nowIso();
        const item: CartItem = {
          id: this.nextCartId(),
          userId,
          productId,
          quantity,
          createdAt: now,
          updatedAt: now,
        };
        this._cartItems.set(item.id, item);
        return item;
      },
      updateQuantity: async (userId, cartItemId, quantity) => {
        assertPositiveQuantity(quantity);
        const current = this.requireCartItem(userId, cartItemId);
        const next: CartItem = {
          ...current,
          quantity,
          updatedAt: this.nowIso(),
        };
        this._cartItems.set(cartItemId, next);
        return next;
      },
      removeItem: async (userId, cartItemId) => {
        this.requireCartItem(userId, cartItemId);
        this._cartItems.delete(cartItemId);
      },
      listForUser: async (userId) =>
        [...this._cartItems.values()]
          .filter((item) => item.userId === userId)
          .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
      countForUser: async (userId) =>
        [...this._cartItems.values()]
          .filter((item) => item.userId === userId)
          .reduce((total, item) => total + item.quantity, 0),
      clear: async (userId) => {
        for (const item of this._cartItems.values()) {
          if (item.userId === userId) {
            this._cartItems.delete(item.id);
          }
        }
      },
    };

    this.brandFollows = {
      follow: async (userId, brandId) => {
        const key = brandFollowKey(userId, brandId);
        const existing = this._brandFollows.get(key);
        if (existing) return existing;
        const follow: BrandFollow = {
          userId,
          brandId,
          createdAt: this.nowIso(),
        };
        this._brandFollows.set(key, follow);
        return follow;
      },
      unfollow: async (userId, brandId) => {
        this._brandFollows.delete(brandFollowKey(userId, brandId));
      },
      isFollowing: async (userId, brandId) =>
        this._brandFollows.has(brandFollowKey(userId, brandId)),
      counts: async (brandId): Promise<BrandFollowCounts> => ({
        followers: [...this._brandFollows.values()].filter((follow) => follow.brandId === brandId)
          .length,
      }),
      followers: async (brandId) =>
        [...this._brandFollows.values()].filter((follow) => follow.brandId === brandId),
      following: async (userId) =>
        [...this._brandFollows.values()].filter((follow) => follow.userId === userId),
    };

    this.moderation = {
      open: async (input) => this.openModerationItem(input),
      get: async (itemId) => this._moderationItems.get(itemId) ?? null,
      listQueue: async (params) =>
        pageItems(
          [...this._moderationItems.values()]
            .filter((item) => item.status === 'open')
            .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
          params,
        ),
      resolve: async (itemId, reviewerUserId, status, note = null) => {
        const current = this._moderationItems.get(itemId);
        if (!current) {
          throw new WearStoreError('not_found', `Moderation item ${itemId} does not exist.`);
        }
        if (current.status !== 'open') {
          throw new WearStoreError(
            'moderation_resolved',
            `Moderation item ${itemId} is already resolved.`,
          );
        }

        if (current.targetType === 'post') {
          await this.applyPostModeration(current.targetId, status);
        }
        if (current.targetType === 'comment') {
          await this.applyCommentModeration(current.targetId, status);
        }

        const next: ModerationItem = {
          ...current,
          status,
          note,
          reviewerUserId,
          updatedAt: this.nowIso(),
          resolvedAt: this.nowIso(),
        };
        this._moderationItems.set(itemId, next);
        return next;
      },
    };
  }

  private nowIso(): string {
    return this._now().toISOString();
  }

  private requirePost(postId: string): Post {
    const post = this._posts.get(postId);
    if (!post) {
      throw new WearStoreError('not_found', `Post ${postId} does not exist.`);
    }
    return post;
  }

  private requireEngageablePost(postId: string, actorUserId: ConnectId): Post {
    const post = this.requirePost(postId);
    if (post.status !== 'published' || !this.canReadPost(post, { viewerUserId: actorUserId })) {
      throw new WearStoreError(
        'forbidden',
        `Post ${postId} is not visible to user ${actorUserId}.`,
      );
    }
    return post;
  }

  private requireComment(commentId: string): PostComment {
    const comment = this._comments.get(commentId);
    if (!comment) {
      throw new WearStoreError('not_found', `Comment ${commentId} does not exist.`);
    }
    return comment;
  }

  private sortedPosts(): readonly Post[] {
    return [...this._posts.values()].sort((left, right) => {
      const rightTime = Date.parse(right.publishedAt ?? right.createdAt);
      const leftTime = Date.parse(left.publishedAt ?? left.createdAt);
      return rightTime - leftTime;
    });
  }

  private filteredFeedPosts(params?: FeedParams): readonly Post[] {
    return this.filteredPosts(params).filter((post) => {
      if (params?.authorUserId && post.authorUserId !== params.authorUserId) return false;
      if (params?.brandId && post.brandId !== params.brandId) return false;
      return true;
    });
  }

  private filteredPosts(params?: PostListParams): readonly Post[] {
    const status = params?.status ?? 'published';
    return this.sortedPosts().filter(
      (post) => post.status === status && this.canReadPost(post, params),
    );
  }

  private canReadPost(post: Post, params?: PostListParams): boolean {
    if (hasTrustedPostListAccess(params?.trustedAccess)) return true;
    const viewerUserId = params?.viewerUserId;

    if (post.status !== 'published') {
      return viewerUserId === post.authorUserId;
    }

    if (post.visibility === 'public') return true;
    if (!viewerUserId) return false;
    if (viewerUserId === post.authorUserId) return true;
    if (post.authorKind === 'brand' && post.brandId) {
      return this._brandFollows.has(brandFollowKey(viewerUserId, post.brandId));
    }
    return this._follows.has(edgeKey(viewerUserId, post.authorUserId));
  }

  private createComment(input: CreateCommentInput): PostComment {
    this.requireEngageablePost(input.postId, input.authorUserId);
    const body = input.body.trim();
    if (body.length === 0) {
      throw new WearStoreError('invalid_comment', 'Comment body cannot be empty.');
    }
    const now = this.nowIso();
    const comment: PostComment = {
      id: this.nextCommentId(),
      postId: input.postId,
      authorUserId: input.authorUserId,
      body,
      status: 'visible',
      createdAt: now,
      updatedAt: now,
    };
    this._comments.set(comment.id, comment);
    return comment;
  }

  private findCartItem(userId: ConnectId, productId: ConnectId): CartItem | null {
    return (
      [...this._cartItems.values()].find(
        (item) => item.userId === userId && item.productId === productId,
      ) ?? null
    );
  }

  private requireCartItem(userId: ConnectId, cartItemId: string): CartItem {
    const item = this._cartItems.get(cartItemId);
    if (!item) {
      throw new WearStoreError('not_found', `Cart item ${cartItemId} does not exist.`);
    }
    if (item.userId !== userId) {
      throw new WearStoreError(
        'forbidden',
        `Cart item ${cartItemId} does not belong to user ${userId}.`,
      );
    }
    return item;
  }

  private openModerationItem(input: OpenModerationItemInput): ModerationItem {
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new WearStoreError('invalid_moderation_item', 'Moderation reason cannot be empty.');
    }
    if (input.targetType === 'post') {
      this.requirePost(input.targetId);
    }
    if (input.targetType === 'comment') {
      this.requireComment(input.targetId);
    }

    const now = this.nowIso();
    const item: ModerationItem = {
      id: this.nextModerationId(),
      targetType: input.targetType,
      targetId: input.targetId,
      reporterUserId: input.reporterUserId ?? null,
      status: 'open',
      reason,
      note: null,
      reviewerUserId: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    this._moderationItems.set(item.id, item);
    return item;
  }

  private async applyPostModeration(
    postId: string,
    status: Exclude<ModerationItem['status'], 'open'>,
  ): Promise<void> {
    const postStatusByDecision: Record<Exclude<ModerationItem['status'], 'open'>, PostStatus> = {
      approved: 'published',
      hidden: 'hidden',
      rejected: 'rejected',
    };
    await this.posts.update(postId, { status: postStatusByDecision[status] });
  }

  private async applyCommentModeration(
    commentId: string,
    status: Exclude<ModerationItem['status'], 'open'>,
  ): Promise<void> {
    if (status === 'hidden' || status === 'rejected') {
      await this.comments.hide(commentId);
    }
  }

  private nextPostId(): string {
    let id = formatId('post', this._postSequence);
    while (this._posts.has(id)) {
      this._postSequence += 1;
      id = formatId('post', this._postSequence);
    }
    this._postSequence += 1;
    return id;
  }

  private nextMediaId(): string {
    let id = formatId('media', this._mediaSequence);
    while (this._postMedia.has(id)) {
      this._mediaSequence += 1;
      id = formatId('media', this._mediaSequence);
    }
    this._mediaSequence += 1;
    return id;
  }

  private nextCommentId(): string {
    let id = formatId('comment', this._commentSequence);
    while (this._comments.has(id)) {
      this._commentSequence += 1;
      id = formatId('comment', this._commentSequence);
    }
    this._commentSequence += 1;
    return id;
  }

  private nextCartId(): string {
    let id = formatId('cart', this._cartSequence);
    while (this._cartItems.has(id)) {
      this._cartSequence += 1;
      id = formatId('cart', this._cartSequence);
    }
    this._cartSequence += 1;
    return id;
  }

  private nextModerationId(): string {
    let id = formatId('mod', this._moderationSequence);
    while (this._moderationItems.has(id)) {
      this._moderationSequence += 1;
      id = formatId('mod', this._moderationSequence);
    }
    this._moderationSequence += 1;
    return id;
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
    };
  }

  private _isBlockedEither(a: ConnectId, b: ConnectId): boolean {
    return this._blocks.has(edgeKey(a, b)) || this._blocks.has(edgeKey(b, a));
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

function edgeKey(actorId: ConnectId, targetId: ConnectId): string {
  return `${actorId}->${targetId}`;
}

function productTagKey(postId: string, productId: ConnectId): string {
  return `${postId}->${productId}`;
}

function postLikeKey(actorUserId: ConnectId, postId: string): string {
  return `${actorUserId}->${postId}`;
}

function savedPostKey(userId: ConnectId, postId: string): string {
  return `${userId}->${postId}`;
}

function brandFollowKey(userId: ConnectId, brandId: ConnectId): string {
  return `${userId}->${brandId}`;
}

function formatId(prefix: string, sequence: number): string {
  return `${prefix}_${String(sequence).padStart(3, '0')}`;
}

function assertPositiveQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new WearStoreError('invalid_quantity', 'Quantity must be a positive integer.');
  }
}

function pagePosts(items: readonly Post[], params?: WearPageParams): WearPage<Post> {
  return pageItems(items, params);
}

function pageItems<T>(items: readonly T[], params?: WearPageParams): WearPage<T> {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
  const startIndex = parseCursor(params?.cursor);
  const page = items.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < items.length ? String(startIndex + limit) : null;
  return { items: page, nextCursor };
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new WearStoreError('invalid_cursor', 'Cursor must be a non-negative integer.');
  }
  return parsed;
function memberKey(conversationId: string, userId: ConnectId): string {
  return `${conversationId}:${userId}`;
}
