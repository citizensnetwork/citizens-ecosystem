/**
 * Citizens Wear data model — TypeScript contract.
 *
 * These are the types the application programs against; the concrete
 * implementations are `MemoryWearStore` (dev/tests, the semantic spec) and
 * `SupabaseWearStore` (prod, `wear.*` on the shared Citizens project).
 *
 * Wear owns ALL of this data (ADR-0007 / ADR-0002 amendment): `wear.users` is
 * a display-safe mirror of the shared Supabase Auth identity, and brands/
 * posts/social graph are Wear-native. Connect provides only the public
 * ecosystem commons (contributors, categories) via `connect-client`.
 */
import type { ConnectId, IsoDateTime } from '@citizens/connect-client';

export type { ConnectId, IsoDateTime };

/** Cursor-paginated result shape, shared by the directory repos. */
export interface PageParams {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export type ProfileVisibility = 'public' | 'private';

/** Kind of a profile page — user vs brand. Brand profiles are rendered from
 * `Brand` + `User` (the owner); user profiles from `User` + `Profile`.
 */
export type ProfileKind = 'user' | 'brand';

export interface Profile {
  readonly userId: ConnectId;
  readonly bio: string | null;
  readonly visibility: ProfileVisibility;
  /** Wear-side verified flag (distinct from `Brand.verified`). */
  readonly verified: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface UserSettings {
  readonly userId: ConnectId;
  readonly displayNameOverride: string | null;
  readonly profileVisibility: ProfileVisibility;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface FollowEdge {
  readonly actorId: ConnectId;
  readonly targetId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface FollowCounts {
  readonly followers: number;
  readonly following: number;
}

/** Repository for Wear-owned profile state. */
export interface ProfileRepo {
  get(userId: ConnectId): Promise<Profile | null>;
  /** Return the profile, creating a default `PUBLIC` one if missing. */
  getOrCreate(userId: ConnectId): Promise<Profile>;
  update(
    userId: ConnectId,
    patch: Partial<Pick<Profile, 'bio' | 'visibility' | 'verified'>>,
  ): Promise<Profile>;
}

/** Repository for the follow graph. */
export interface FollowRepo {
  follow(actorId: ConnectId, targetId: ConnectId): Promise<FollowEdge>;
  unfollow(actorId: ConnectId, targetId: ConnectId): Promise<void>;
  isFollowing(actorId: ConnectId, targetId: ConnectId): Promise<boolean>;
  counts(userId: ConnectId): Promise<FollowCounts>;
  followers(userId: ConnectId): Promise<readonly FollowEdge[]>;
  following(userId: ConnectId): Promise<readonly FollowEdge[]>;
}

/** Repository for per-user settings. */
export interface SettingsRepo {
  get(userId: ConnectId): Promise<UserSettings>;
  update(
    userId: ConnectId,
    patch: Partial<Pick<UserSettings, 'displayNameOverride' | 'profileVisibility'>>,
  ): Promise<UserSettings>;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 — posts, media, likes, comments, saves.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A post authored by either a citizen or a brand. `authorId` is always a
 * `User` id; `brandId` is set iff the post is published *as* a brand (the
 * brand composer). This keeps the follow graph and the post table in the
 * same id-space.
 */
export interface Post {
  readonly id: string;
  readonly authorId: ConnectId;
  readonly brandId: ConnectId | null;
  readonly body: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** Product ids tagged on the post. Read-only snapshots from Connect. */
  readonly taggedProductIds: readonly ConnectId[];
  /**
   * Relational attribution for auto "Completed Concepts" posts (mig 157):
   * the link to the source concept persists PERMANENTLY, while the PUBLIC
   * creator tag renders only when the claim's `attributionPublic` is true.
   */
  readonly conceptId: string | null;
}

export type PostMediaKind = 'image' | 'video';

export interface PostMedia {
  readonly id: string;
  readonly postId: string;
  readonly url: string;
  readonly kind: PostMediaKind;
  readonly altText: string | null;
  readonly orderIndex: number;
}

export interface LikeEdge {
  readonly postId: string;
  readonly userId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface Comment {
  readonly id: string;
  readonly postId: string;
  readonly authorId: ConnectId;
  readonly parentCommentId: string | null;
  readonly body: string;
  readonly createdAt: IsoDateTime;
}

export interface CommentLikeEdge {
  readonly commentId: string;
  readonly userId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface SaveCollection {
  readonly id: string;
  readonly ownerId: ConnectId;
  readonly name: string;
  readonly createdAt: IsoDateTime;
  readonly postIds: readonly string[];
}

export interface CreatePostInput {
  readonly authorId: ConnectId;
  readonly brandId?: ConnectId | null;
  readonly body: string;
  readonly media?: readonly Omit<PostMedia, 'id' | 'postId'>[];
  readonly taggedProductIds?: readonly ConnectId[];
}

export interface PostWithMedia {
  readonly post: Post;
  readonly media: readonly PostMedia[];
}

export interface FeedPageParams {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface FeedPage {
  readonly items: readonly PostWithMedia[];
  readonly nextCursor: string | null;
}

/** Repository for posts, their media, and the feed view. */
export interface PostRepo {
  create(input: CreatePostInput, now?: () => Date): Promise<PostWithMedia>;
  getById(id: string): Promise<PostWithMedia | null>;
  listByAuthor(authorId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
  listByBrand(brandId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
  /** Chronological feed of posts by users `viewerId` follows (plus self). */
  feedChronological(viewerId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
  /**
   * Recency-weighted ranker stub used when the `CW_FOR_YOU_RANKER` feature
   * flag is on. Public posts from followed authors score higher than
   * second-degree, and newer posts outrank older ones. Phase 5 replaces
   * this with a real ranking service.
   */
  feedForYou(viewerId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
  // Phase 5 — discovery surface.
  /**
   * Full-text search across post bodies (case-insensitive substring).
   * Phase 5 ships an in-memory implementation; Phase 8+ swaps in Postgres
   * full-text or an external search index without touching callers.
   */
  searchByText(query: string, params?: FeedPageParams): Promise<FeedPage>;
  /**
   * All posts that mention `tag` (case-insensitive, with or without a
   * leading `#`). Newest first.
   */
  listByHashtag(tag: string, params?: FeedPageParams): Promise<FeedPage>;
  /**
   * Trending hashtags, scored by post count with a freshness boost over
   * the last `windowMs` (default 14 days). Returns at most `limit` tags.
   */
  trendingHashtags(options?: {
    readonly limit?: number;
    readonly windowMs?: number;
  }): Promise<readonly TrendingHashtag[]>;
}

export interface TrendingHashtag {
  readonly tag: string;
  readonly postCount: number;
  readonly score: number;
}

/** Repository for post and comment likes. */
export interface LikeRepo {
  likePost(postId: string, userId: ConnectId): Promise<LikeEdge>;
  unlikePost(postId: string, userId: ConnectId): Promise<void>;
  isPostLiked(postId: string, userId: ConnectId): Promise<boolean>;
  postLikeCount(postId: string): Promise<number>;
  likeComment(commentId: string, userId: ConnectId): Promise<CommentLikeEdge>;
  unlikeComment(commentId: string, userId: ConnectId): Promise<void>;
  commentLikeCount(commentId: string): Promise<number>;
  /** Posts the user has liked, newest-first (for the activity tab). */
  postsLikedBy(userId: ConnectId): Promise<readonly LikeEdge[]>;
}

/** Repository for threaded post comments. */
export interface CommentRepo {
  create(input: {
    readonly postId: string;
    readonly authorId: ConnectId;
    readonly body: string;
    readonly parentCommentId?: string | null;
  }): Promise<Comment>;
  listForPost(postId: string): Promise<readonly Comment[]>;
  /** Comments authored by `userId`, newest-first (for the activity tab). */
  authoredBy(userId: ConnectId): Promise<readonly Comment[]>;
  commentsForPostCount(postId: string): Promise<number>;
}

/** Repository for user-owned save collections. */
export interface SaveRepo {
  getOrCreateDefault(ownerId: ConnectId): Promise<SaveCollection>;
  listForOwner(ownerId: ConnectId): Promise<readonly SaveCollection[]>;
  savePost(ownerId: ConnectId, postId: string, collectionId?: string): Promise<SaveCollection>;
  unsavePost(ownerId: ConnectId, postId: string, collectionId?: string): Promise<void>;
  isSaved(ownerId: ConnectId, postId: string): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 6 — stories, direct messages, blocks, reports.
// ─────────────────────────────────────────────────────────────────────────

export type StoryMediaKind = 'image' | 'video' | 'text';
export type StoryAudience = 'public' | 'followers';

/**
 * 24-hour ephemeral story. `expiresAt` is set at creation time
 * (createdAt + 24h by default); the repo never returns expired stories
 * to non-author viewers. Stories may also be promoted into a long-lived
 * `StoryHighlight` by their author.
 */
export interface Story {
  readonly id: string;
  readonly authorId: ConnectId;
  readonly brandId: ConnectId | null;
  readonly mediaUrl: string | null;
  readonly mediaKind: StoryMediaKind;
  readonly caption: string | null;
  readonly audience: StoryAudience;
  readonly createdAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
}

export interface StoryView {
  readonly storyId: string;
  readonly viewerId: ConnectId;
  readonly viewedAt: IsoDateTime;
}

/** Curated "best of" collection of stories surfaced on a profile. */
export interface StoryHighlight {
  readonly id: string;
  readonly ownerId: ConnectId;
  readonly name: string;
  readonly coverUrl: string | null;
  readonly createdAt: IsoDateTime;
  readonly storyIds: readonly string[];
}

/** Story reactions are restricted to a small, non-numeric set. */
export type StoryReactionKind = 'amen' | 'love' | 'fire' | 'pray' | 'crown';

export interface StoryReaction {
  readonly id: string;
  readonly storyId: string;
  readonly userId: ConnectId;
  readonly kind: StoryReactionKind;
  readonly createdAt: IsoDateTime;
}

export interface CreateStoryInput {
  readonly authorId: ConnectId;
  readonly brandId?: ConnectId | null;
  readonly mediaUrl?: string | null;
  readonly mediaKind?: StoryMediaKind;
  readonly caption?: string | null;
  readonly audience?: StoryAudience;
  /** Optional override; defaults to 24 hours from `now()`. */
  readonly ttlMs?: number;
}

export interface StoryRepo {
  create(input: CreateStoryInput, now?: () => Date): Promise<Story>;
  getById(id: string): Promise<Story | null>;
  /** Author's stories, including expired ones (for highlight curation). */
  listByAuthor(authorId: ConnectId): Promise<readonly Story[]>;
  /** Active (non-expired) stories the viewer can see, newest first. */
  listActiveForViewer(viewerId: ConnectId): Promise<readonly Story[]>;
  /** Active stories grouped by author for the feed "tray" strip. */
  trayForViewer(viewerId: ConnectId): Promise<readonly StoryTrayEntry[]>;
  recordView(storyId: string, viewerId: ConnectId): Promise<StoryView>;
  listViewers(storyId: string, callerId: ConnectId): Promise<readonly StoryView[]>;
  addReaction(input: {
    readonly storyId: string;
    readonly userId: ConnectId;
    readonly kind: StoryReactionKind;
  }): Promise<StoryReaction>;
  listReactions(storyId: string): Promise<readonly StoryReaction[]>;
  /** Author-driven deletion before expiry. */
  delete(storyId: string, authorId: ConnectId): Promise<void>;
}

export interface StoryTrayEntry {
  readonly authorId: ConnectId;
  readonly latestStoryId: string;
  readonly latestCreatedAt: IsoDateTime;
  readonly storyCount: number;
  readonly hasUnseen: boolean;
}

export interface HighlightRepo {
  create(input: {
    readonly ownerId: ConnectId;
    readonly name: string;
    readonly coverUrl?: string | null;
  }): Promise<StoryHighlight>;
  listForOwner(ownerId: ConnectId): Promise<readonly StoryHighlight[]>;
  getById(id: string): Promise<StoryHighlight | null>;
  addStory(highlightId: string, storyId: string, ownerId: ConnectId): Promise<StoryHighlight>;
  removeStory(highlightId: string, storyId: string, ownerId: ConnectId): Promise<StoryHighlight>;
  delete(highlightId: string, ownerId: ConnectId): Promise<void>;
}

export type ConversationKind = 'direct' | 'group';
export type ConversationRequestState = 'requested' | 'accepted';

export interface Conversation {
  readonly id: string;
  readonly kind: ConversationKind;
  readonly name: string | null;
  readonly createdById: ConnectId;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ConversationMember {
  readonly conversationId: string;
  readonly userId: ConnectId;
  readonly joinedAt: IsoDateTime;
  readonly lastReadAt: IsoDateTime | null;
  readonly mutedUntil: IsoDateTime | null;
  readonly requestState: ConversationRequestState;
  readonly role: 'owner' | 'member';
}

export interface Message {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: ConnectId;
  readonly body: string;
  readonly createdAt: IsoDateTime;
  readonly deletedAt: IsoDateTime | null;
}

export interface ConversationSummary {
  readonly conversation: Conversation;
  readonly members: readonly ConversationMember[];
  readonly lastMessage: Message | null;
  /** Unread message count for the caller. */
  readonly unreadCount: number;
}

export interface ConversationRepo {
  /**
   * Get-or-create the canonical 1:1 conversation between `actorId` and
   * `otherId`. Idempotent. Self-DMs are rejected.
   */
  getOrCreateDirect(actorId: ConnectId, otherId: ConnectId): Promise<Conversation>;
  createGroup(input: {
    readonly createdById: ConnectId;
    readonly name: string;
    readonly memberIds: readonly ConnectId[];
  }): Promise<Conversation>;
  getById(id: string, callerId: ConnectId): Promise<Conversation | null>;
  /** Membership row for `userId` in `conversationId`, or `null`. */
  membership(conversationId: string, userId: ConnectId): Promise<ConversationMember | null>;
  listMembers(conversationId: string): Promise<readonly ConversationMember[]>;
  /** Conversations the caller is in, newest activity first. */
  listForUser(
    userId: ConnectId,
    options?: { readonly requestState?: ConversationRequestState },
  ): Promise<readonly ConversationSummary[]>;
  /** Mark all messages up to `now()` as read for `userId`. */
  markRead(conversationId: string, userId: ConnectId): Promise<void>;
  acceptRequest(conversationId: string, userId: ConnectId): Promise<ConversationMember>;
  declineRequest(conversationId: string, userId: ConnectId): Promise<void>;
  setMuted(
    conversationId: string,
    userId: ConnectId,
    mutedUntil: IsoDateTime | null,
  ): Promise<ConversationMember>;
  leave(conversationId: string, userId: ConnectId): Promise<void>;
}

export interface MessageRepo {
  send(input: {
    readonly conversationId: string;
    readonly authorId: ConnectId;
    readonly body: string;
  }): Promise<Message>;
  list(
    conversationId: string,
    callerId: ConnectId,
    params?: { readonly limit?: number; readonly cursor?: string },
  ): Promise<{ readonly items: readonly Message[]; readonly nextCursor: string | null }>;
  /** Soft-delete a message authored by `callerId`. */
  deleteOwn(messageId: string, callerId: ConnectId): Promise<void>;
}

export interface BlockEdge {
  readonly actorId: ConnectId;
  readonly targetId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface BlockRepo {
  block(actorId: ConnectId, targetId: ConnectId): Promise<BlockEdge>;
  unblock(actorId: ConnectId, targetId: ConnectId): Promise<void>;
  /** True if `actorId` has blocked `targetId` OR vice versa. */
  isBlockedEither(a: ConnectId, b: ConnectId): Promise<boolean>;
  listBlocked(actorId: ConnectId): Promise<readonly BlockEdge[]>;
}

export type ReportSubjectKind = 'post' | 'comment' | 'message' | 'story' | 'user';
export type ReportReason = 'spam' | 'abuse' | 'sexual' | 'self_harm' | 'illegal' | 'other';

/** Mig-145 triage lifecycle: `open → reviewed → actioned | dismissed`. */
export type ReportStatus = 'open' | 'reviewed' | 'actioned' | 'dismissed';

export interface Report {
  readonly id: string;
  readonly reporterId: ConnectId;
  readonly subjectKind: ReportSubjectKind;
  readonly subjectId: string;
  readonly reason: ReportReason;
  readonly note: string | null;
  readonly status: ReportStatus;
  readonly handledBy: ConnectId | null;
  readonly handledAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
}

export interface ReportRepo {
  create(input: {
    readonly reporterId: ConnectId;
    readonly subjectKind: ReportSubjectKind;
    readonly subjectId: string;
    readonly reason: ReportReason;
    readonly note?: string | null;
  }): Promise<Report>;
  listForSubject(subjectKind: ReportSubjectKind, subjectId: string): Promise<readonly Report[]>;
  listByReporter(reporterId: ConnectId): Promise<readonly Report[]>;
  /**
   * Moderation queue (mig 145). Caller must hold a platform role — under RLS
   * a non-moderator simply sees no rows; `MemoryWearStore` throws `forbidden`
   * to make the misuse loud in tests. Newest first, optionally filtered.
   */
  listForModeration(
    callerId: ConnectId,
    filter?: { readonly status?: ReportStatus },
  ): Promise<readonly Report[]>;
  /** Moderator triage: `open → reviewed → actioned | dismissed`. */
  triage(
    reportId: string,
    callerId: ConnectId,
    status: Exclude<ReportStatus, 'open'>,
  ): Promise<Report>;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 — identity mirror + Wear-owned brands.
//
// These two repos are what `wear.*` owns that used to be resolved through
// `connect-client` (users/brands/products). Identity is the shared Supabase
// Auth `auth.users`; `wear.users` is a DISPLAY-SAFE mirror (no email/PII),
// hydrated from each user's own session on first Wear sign-in. Brands are
// Wear-owned, with an OPTIONAL ownership-verified link to a Connect
// contributor (`connectContributorId`, value-ref to `public.profiles.id`).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Display-safe mirror of a shared-auth citizen (`wear.users`). Deliberately
 * carries no email or other PII — the row is public-SELECT under RLS and
 * exists only so Wear can render post authors, followers, and brand owners
 * without a cross-app read of `public.profiles` (SHARED_DB_CONTRACT R2).
 */
export interface WearUser {
  readonly id: ConnectId;
  readonly handle: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

/**
 * Upsert payload for the identity mirror. `handle` is a *preferred* handle
 * (Connect issues none); the store guarantees global uniqueness, suffixing on
 * collision. Only the user themselves may write their own mirror row (RLS
 * `auth.uid() = id`).
 */
export interface UpsertUserInput {
  readonly id: ConnectId;
  readonly handle: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

/** Read-through directory of Wear participants (the identity mirror). */
export interface UserRepo {
  getById(id: ConnectId): Promise<WearUser | null>;
  getByHandle(handle: string): Promise<WearUser | null>;
  search(query: string, params?: PageParams): Promise<Page<WearUser>>;
  /**
   * Hydrate or refresh the caller's own mirror row from their session. On
   * first insert the store assigns a unique handle derived from `handle`
   * (suffixing `-2`, `-3`, … on collision). An existing row keeps its handle
   * and refreshes `displayName`/`avatarUrl`. Self-write only (RLS).
   */
  upsertFromSession(input: UpsertUserInput): Promise<WearUser>;
}

/**
 * A Wear-owned Christian clothing brand (`wear.brands`). `connectContributorId`
 * is a nullable value-ref to a Connect contributor (`public.profiles.id`), set
 * only via an ownership-verified link flow — never a hard cross-schema FK.
 */
export interface WearBrand {
  readonly id: ConnectId;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly websiteUrl: string | null;
  readonly logoUrl: string | null;
  readonly verified: boolean;
  readonly ownerUserId: ConnectId;
  readonly connectContributorId: ConnectId | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CreateBrandInput {
  readonly ownerId: ConnectId;
  readonly slug: string;
  readonly name: string;
  readonly tagline?: string | null;
  readonly websiteUrl?: string | null;
  readonly logoUrl?: string | null;
  readonly connectContributorId?: ConnectId | null;
}

export interface UpdateBrandInput {
  readonly name?: string;
  readonly tagline?: string | null;
  readonly websiteUrl?: string | null;
  readonly logoUrl?: string | null;
  readonly connectContributorId?: ConnectId | null;
}

/** Repository for Wear-owned brands. */
export interface BrandRepo {
  getById(id: ConnectId): Promise<WearBrand | null>;
  getBySlug(slug: string): Promise<WearBrand | null>;
  listAll(params?: PageParams): Promise<Page<WearBrand>>;
  listForOwner(ownerId: ConnectId): Promise<readonly WearBrand[]>;
  search(query: string, params?: PageParams): Promise<Page<WearBrand>>;
  /** Create a brand owned by `input.ownerId`. Slug must be unique. */
  create(input: CreateBrandInput): Promise<WearBrand>;
  /**
   * Owner-scoped update. `ownerId` must match the brand's owner or the store
   * throws `forbidden` — the app never lets one user edit another's brand.
   */
  update(brandId: ConnectId, ownerId: ConnectId, patch: UpdateBrandInput): Promise<WearBrand>;
}

// ─────────────────────────────────────────────────────────────────────────
// Concepts marketplace (mig 157) — the ratified Wear roadmap's first tranche
// (docs/Citizens_Wear_Roles_and_Concepts_MD.md): public upvotable Concepts,
// private brand Proposals with public brand tags, exclusive creator-awarded
// Claims, an append-only status log (forward-only lifecycle), milestone/
// lifetime Royalties, the two-party catalogue-conversion handshake, and the
// brand-verification lifecycle that now gates marketplace power.
//
// `MemoryWearStore` is the semantic spec: every rule below mirrors the RLS
// policies + SECURITY DEFINER RPCs of migration 157 exactly, and the error
// `code`s equal the RPCs' `raise exception` messages so callers are
// storage-agnostic.
// ─────────────────────────────────────────────────────────────────────────

/** Lifecycle order IS the enum order (forward-only transitions, mig 157 §1). */
export const CONCEPT_STAGES = [
  'proposed',
  'claimed',
  'in_production',
  'sample_review',
  'released',
  'sold_out',
] as const;
export type ConceptStage = (typeof CONCEPT_STAGES)[number];

export type ConceptProposalStatus = 'submitted' | 'withdrawn' | 'awarded' | 'declined';
export type ConceptClaimStatus = 'active' | 'revoked';
export type RoyaltyKind = 'milestone' | 'lifetime';
export type RoyaltyStatus = 'active' | 'proof_submitted' | 'closed';
export type CatalogueConversionStatus = 'proposed' | 'accepted' | 'declined' | 'cancelled';
export type BrandVerificationStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
/** Mig-145 platform roles. `admin` implies moderator capability. */
export type WearPlatformRole = 'moderator' | 'admin';

export interface Concept {
  readonly id: string;
  readonly creatorId: ConnectId;
  readonly title: string;
  readonly description: string | null;
  /** Cached stage; the append-only status log is the truth post-claim. */
  readonly status: ConceptStage;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ConceptMedia {
  readonly id: string;
  readonly conceptId: string;
  readonly url: string;
  readonly kind: PostMediaKind;
  readonly altText: string | null;
  readonly orderIndex: number;
}

export interface ConceptWithMedia {
  readonly concept: Concept;
  readonly media: readonly ConceptMedia[];
}

export interface ConceptUpvote {
  readonly conceptId: string;
  readonly userId: ConnectId;
  readonly createdAt: IsoDateTime;
}

/** The PUBLIC proposal surface: brand tags only, details stay private. */
export interface ConceptProposalTag {
  readonly brandId: ConnectId;
  readonly proposedAt: IsoDateTime;
}

export interface ConceptProposal {
  readonly id: string;
  readonly conceptId: string;
  readonly brandId: ConnectId;
  readonly status: ConceptProposalStatus;
  readonly mockupUrls: readonly string[];
  readonly materials: string | null;
  readonly estUnitPrice: number | null;
  readonly moq: number | null;
  readonly estTurnaroundDays: number | null;
  readonly note: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ConceptClaim {
  readonly id: string;
  readonly conceptId: string;
  readonly brandId: ConnectId;
  readonly proposalId: string | null;
  readonly status: ConceptClaimStatus;
  readonly awardedBy: ConnectId | null;
  readonly awardedAt: IsoDateTime;
  /** Flipped false ONLY by catalogue conversion; the claim row persists. */
  readonly attributionPublic: boolean;
  readonly attributionNote: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ConceptStatusLogEntry {
  readonly id: string;
  readonly conceptId: string;
  readonly claimId: string;
  readonly status: ConceptStage;
  readonly note: string | null;
  readonly createdBy: ConnectId | null;
  readonly createdAt: IsoDateTime;
}

export interface RoyaltyObligation {
  readonly id: string;
  readonly claimId: string;
  readonly kind: RoyaltyKind;
  readonly pct: number;
  readonly thresholdUnits: number | null;
  readonly status: RoyaltyStatus;
  readonly proofUrl: string | null;
  readonly proofNote: string | null;
  readonly proofSubmittedAt: IsoDateTime | null;
  readonly closedAt: IsoDateTime | null;
  readonly closedBy: ConnectId | null;
  readonly closedNote: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CatalogueConversion {
  readonly id: string;
  readonly claimId: string;
  readonly status: CatalogueConversionStatus;
  readonly proposedBy: ConnectId | null;
  readonly proposedAt: IsoDateTime;
  readonly respondedBy: ConnectId | null;
  readonly respondedAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface BrandVerification {
  readonly brandId: ConnectId;
  readonly status: BrandVerificationStatus;
  readonly note: string | null;
  readonly requestedBy: ConnectId | null;
  readonly requestedAt: IsoDateTime;
  readonly reviewedBy: ConnectId | null;
  readonly reviewedAt: IsoDateTime | null;
  readonly reviewNote: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CreateConceptInput {
  readonly creatorId: ConnectId;
  readonly title: string;
  readonly description?: string | null;
  readonly media?: readonly Omit<ConceptMedia, 'id' | 'conceptId'>[];
}

export interface UpdateConceptInput {
  readonly title?: string;
  readonly description?: string | null;
  /** Replace-all media set (artwork is frozen once claimed). */
  readonly media?: readonly Omit<ConceptMedia, 'id' | 'conceptId'>[];
}

export interface ConceptListFilter extends PageParams {
  readonly status?: ConceptStage;
  readonly creatorId?: ConnectId;
}

/**
 * Concepts + their media + upvotes. Creator may edit/delete ONLY while the
 * concept is 'proposed' (post-award the design is production input); a
 * moderator may delete at any stage (mig-145 takedown). Reads are public.
 */
export interface ConceptRepo {
  create(input: CreateConceptInput): Promise<ConceptWithMedia>;
  getById(id: string): Promise<ConceptWithMedia | null>;
  /** Live concepts by `creatorId` — the Creator-badge derivation input (§6.1). */
  countByCreator(creatorId: ConnectId): Promise<number>;
  /** Public browse, newest first, optional stage/creator filter. */
  list(filter?: ConceptListFilter): Promise<Page<ConceptWithMedia>>;
  update(conceptId: string, callerId: ConnectId, patch: UpdateConceptInput): Promise<ConceptWithMedia>;
  delete(conceptId: string, callerId: ConnectId): Promise<void>;
  upvote(conceptId: string, userId: ConnectId): Promise<ConceptUpvote>;
  removeUpvote(conceptId: string, userId: ConnectId): Promise<void>;
  upvoteCount(conceptId: string): Promise<number>;
  hasUpvoted(conceptId: string, userId: ConnectId): Promise<boolean>;
  /**
   * Record a share (mig 161). DISTINCT-SHARER semantics: one row per
   * (concept, user) — repeat shares return the existing row (the count is
   * non-gameable social proof, §6.2). Shares are never retracted.
   */
  share(conceptId: string, userId: ConnectId, channel?: ConceptShareChannel): Promise<ConceptShare>;
  shareCount(conceptId: string): Promise<number>;
  hasShared(conceptId: string, userId: ConnectId): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────
// Mig 161 — the community Concepts surface (ratified §6.2): comments, shares,
// and the concept-stories bar ("concept-statuses"). A status is a PROMOTION
// OF A CONCEPT — system-issued by the DB trigger (or its in-memory mirror)
// when the creator holds the derived Creator badge (>10 concepts posted) or
// while the first-100 bootstrap grace is open. There is no client write path.
// ─────────────────────────────────────────────────────────────────────────

/** Creator badge (§6.1, derived — never stored): auto at >10 Concepts posted. */
export const CREATOR_BADGE_MIN_CONCEPTS = 11;
/** Bootstrap grace (§6.1): the first 100 Wear Concepts are all promoted. */
export const BOOTSTRAP_GRACE_STATUSES = 100;
/** Concept-statuses live 24h (materialised expiry, stories precedent). */
export const CONCEPT_STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export interface ConceptComment {
  readonly id: string;
  readonly conceptId: string;
  readonly authorId: ConnectId;
  readonly parentCommentId: string | null;
  readonly body: string;
  readonly createdAt: IsoDateTime;
}

export type ConceptShareChannel = 'link' | 'native' | 'dm';

export interface ConceptShare {
  readonly conceptId: string;
  readonly userId: ConnectId;
  readonly channel: ConceptShareChannel;
  readonly createdAt: IsoDateTime;
}

export type ConceptStatusReason = 'creator_badge' | 'bootstrap_grace';

export interface ConceptStatus {
  readonly id: string;
  readonly conceptId: string;
  readonly creatorId: ConnectId;
  readonly reason: ConceptStatusReason;
  readonly createdAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
}

/** A bar entry: the status plus the viewer's seen-state (gold-ring styling). */
export interface ConceptStatusEntry {
  readonly status: ConceptStatus;
  readonly viewerSeen: boolean;
}

/** Threaded comments on a Concept (wear.concept_comments — comments mirror). */
export interface ConceptCommentRepo {
  create(input: {
    readonly conceptId: string;
    readonly authorId: ConnectId;
    readonly body: string;
    readonly parentCommentId?: string | null;
  }): Promise<ConceptComment>;
  listForConcept(conceptId: string): Promise<readonly ConceptComment[]>;
  countForConcept(conceptId: string): Promise<number>;
}

/**
 * The concept-stories bar. Rows are trigger-created (promotion) — this repo
 * only reads active statuses and records seen-state.
 */
export interface ConceptStatusRepo {
  /** Active (non-expired) statuses, newest first, with the viewer's seen-state. */
  listActive(viewerId: ConnectId | null): Promise<readonly ConceptStatusEntry[]>;
  recordView(statusId: string, viewerId: ConnectId): Promise<void>;
}

export interface CreateProposalInput {
  readonly conceptId: string;
  readonly brandId: ConnectId;
  readonly mockupUrls?: readonly string[];
  readonly materials?: string | null;
  readonly estUnitPrice?: number | null;
  readonly moq?: number | null;
  readonly estTurnaroundDays?: number | null;
  readonly note?: string | null;
}

export interface UpdateProposalInput {
  readonly mockupUrls?: readonly string[];
  readonly materials?: string | null;
  readonly estUnitPrice?: number | null;
  readonly moq?: number | null;
  readonly estTurnaroundDays?: number | null;
  readonly note?: string | null;
}

/**
 * Brand proposals. Details are PRIVATE to the concept's creator, the
 * proposing brand's owner, and moderators; the public sees only
 * `publicTags`. Only VERIFIED brands may pitch, only while the concept is
 * open, never across a block. One proposal per (concept, brand).
 */
export interface ConceptProposalRepo {
  create(callerId: ConnectId, input: CreateProposalInput): Promise<ConceptProposal>;
  /** Party-scoped read — returns null for everyone else (RLS semantics). */
  getById(id: string, callerId: ConnectId): Promise<ConceptProposal | null>;
  /** Proposals on a concept visible to `callerId` under the party predicate. */
  listForConcept(conceptId: string, callerId: ConnectId): Promise<readonly ConceptProposal[]>;
  /** A brand's pipeline (owner or moderator view). */
  listForBrand(brandId: ConnectId, callerId: ConnectId): Promise<readonly ConceptProposal[]>;
  /** Edit while 'submitted' (brand must still be verified, concept open). */
  update(proposalId: string, callerId: ConnectId, patch: UpdateProposalInput): Promise<ConceptProposal>;
  /** Withdraw while bidding (allowed even if verification lapsed mid-bid). */
  withdraw(proposalId: string, callerId: ConnectId): Promise<ConceptProposal>;
  /** Re-enter a withdrawn/declined proposal once the concept is open again. */
  resubmit(proposalId: string, callerId: ConnectId): Promise<ConceptProposal>;
  /** PUBLIC brand tags (anon-safe; mirrors wear.get_concept_proposal_tags). */
  publicTags(conceptId: string): Promise<readonly ConceptProposalTag[]>;
}

/**
 * Exclusive claims. `award` mirrors `wear.award_concept_claim`: creator-only,
 * winning proposal → 'awarded', all other submitted proposals → 'declined',
 * concept → 'claimed', a 'claimed' log entry, and the milestone royalty
 * (10% / first 100 units) committed atomically. Claims are public reads;
 * `revoke` is the admin dispute lever (re-opens the concept).
 */
export interface ConceptClaimRepo {
  award(proposalId: string, callerId: ConnectId): Promise<ConceptClaim>;
  getById(claimId: string): Promise<ConceptClaim | null>;
  getActiveForConcept(conceptId: string): Promise<ConceptClaim | null>;
  listForBrand(brandId: ConnectId): Promise<readonly ConceptClaim[]>;
  revoke(claimId: string, callerId: ConnectId): Promise<ConceptClaim>;
}

/**
 * The append-only public timeline. `advance` mirrors
 * `wear.advance_concept_status`: active-claim brand owner only, forward-only
 * (enum order IS lifecycle order, skips allowed), never back to/below
 * 'claimed'. Advancing to 'released' auto-creates the "Completed Concepts"
 * post (artwork copied, attribution relational via `posts.conceptId`).
 */
export interface ConceptStatusLogRepo {
  listForConcept(conceptId: string): Promise<readonly ConceptStatusLogEntry[]>;
  advance(
    conceptId: string,
    callerId: ConnectId,
    status: ConceptStage,
    note?: string | null,
  ): Promise<ConceptStatusLogEntry>;
}

/**
 * Royalty obligations. Party-scoped reads (proof docs may carry sales data).
 * `submitProof` is brand-side (milestone only, re-submission allowed while
 * open); `close` is creator-side confirmation of a submitted proof — or an
 * admin from any open state (dispute lever).
 */
export interface RoyaltyRepo {
  listForClaim(claimId: string, callerId: ConnectId): Promise<readonly RoyaltyObligation[]>;
  /** Every obligation where the caller is the brand owner or the creator. */
  listForUser(callerId: ConnectId): Promise<readonly RoyaltyObligation[]>;
  submitProof(
    obligationId: string,
    callerId: ConnectId,
    proofUrl: string,
    note?: string | null,
  ): Promise<RoyaltyObligation>;
  close(obligationId: string, callerId: ConnectId): Promise<RoyaltyObligation>;
}

/**
 * Catalogue-conversion handshake (two-party). Brand proposes once released;
 * creator accepts (public tag dropped, milestone royalty closed as
 * superseded, lifetime 5% committed "in its place") or declines; brand may
 * cancel a pending handshake. One open-or-accepted handshake per claim.
 */
export interface CatalogueConversionRepo {
  propose(claimId: string, callerId: ConnectId): Promise<CatalogueConversion>;
  respond(conversionId: string, callerId: ConnectId, accept: boolean): Promise<CatalogueConversion>;
  cancel(conversionId: string, callerId: ConnectId): Promise<CatalogueConversion>;
  listForClaim(claimId: string, callerId: ConnectId): Promise<readonly CatalogueConversion[]>;
}

/**
 * Brand-verification lifecycle. Owner requests ('pending'); owner may
 * RE-request only after 'rejected'; review (approve/reject/revoke) is
 * ADMIN-only. The outcome syncs `WearBrand.verified` (the authoritative
 * badge + marketplace gate).
 */
export interface BrandVerificationRepo {
  request(brandId: ConnectId, callerId: ConnectId, note?: string | null): Promise<BrandVerification>;
  /** Owner/moderator read — null for everyone else (RLS semantics). */
  getForBrand(brandId: ConnectId, callerId: ConnectId): Promise<BrandVerification | null>;
  /** Moderation queue: all pending requests (moderator); own rows otherwise. */
  listPending(callerId: ConnectId): Promise<readonly BrandVerification[]>;
  review(
    brandId: ConnectId,
    callerId: ConnectId,
    decision: Extract<BrandVerificationStatus, 'approved' | 'rejected' | 'revoked'>,
    reviewNote?: string | null,
  ): Promise<BrandVerification>;
}

/**
 * Platform roles (mig 145). Under RLS a user can only read their OWN row
 * (`user_roles` is service_role-managed, self-SELECT only), so the repo
 * exposes exactly that.
 */
export interface RoleRepo {
  getOwn(userId: ConnectId): Promise<WearPlatformRole | null>;
}

/**
 * Notification kinds (mig 159). Each maps to a Concepts-marketplace lifecycle
 * event; the recipient is the party who cares (creator or brand owner).
 */
export type NotificationType =
  | 'concept_proposal' // a brand proposed on your concept        → creator
  | 'concept_awarded' // your proposal was awarded                 → brand owner
  | 'concept_advanced' // the concept advanced a stage             → creator
  | 'royalty_proof' // proof of the milestone sale submitted       → creator
  | 'royalty_closed' // a royalty obligation was closed            → brand owner
  | 'conversion_proposed' // catalogue conversion proposed         → creator
  | 'conversion_responded' // conversion accepted/declined         → brand owner
  // Mig 161 — community engagement on Concepts (§6.2):
  | 'concept_comment' // someone commented on your concept (or replied to you)
  | 'concept_upvote' // someone liked your concept                 → creator
  | 'concept_share'; // someone shared your concept                → creator

export interface WearNotification {
  readonly id: string;
  readonly recipientId: ConnectId;
  readonly type: NotificationType;
  /** Who caused it (null if that user was later deleted). */
  readonly actorId: ConnectId | null;
  readonly conceptId: string | null;
  readonly brandId: ConnectId | null;
  /** Render payload (conceptTitle / brandName / stage / accepted …). */
  readonly data: Readonly<Record<string, unknown>>;
  readonly readAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
}

/**
 * A recipient's own notifications. Rows are produced only by DB triggers
 * (mig 159) — there is no create path here; the app reads and marks-read.
 * Under RLS a caller sees ONLY their own rows (recipient-scoped policies).
 */
export interface NotificationRepo {
  /** The caller's notifications, newest first. */
  list(userId: ConnectId, params?: PageParams): Promise<Page<WearNotification>>;
  /** How many of the caller's notifications are unread. */
  unreadCount(userId: ConnectId): Promise<number>;
  /** Mark specific notifications (own only) read; returns how many changed. */
  markRead(userId: ConnectId, ids: readonly string[]): Promise<number>;
  /** Mark every unread notification of the caller read; returns how many changed. */
  markAllRead(userId: ConnectId): Promise<number>;
}

/** The full Wear data surface. */
export interface WearStore {
  readonly users: UserRepo;
  readonly brands: BrandRepo;
  readonly profiles: ProfileRepo;
  readonly follows: FollowRepo;
  readonly settings: SettingsRepo;
  readonly posts: PostRepo;
  readonly likes: LikeRepo;
  readonly comments: CommentRepo;
  readonly saves: SaveRepo;
  readonly stories: StoryRepo;
  readonly highlights: HighlightRepo;
  readonly conversations: ConversationRepo;
  readonly messages: MessageRepo;
  readonly blocks: BlockRepo;
  readonly reports: ReportRepo;
  readonly concepts: ConceptRepo;
  readonly conceptComments: ConceptCommentRepo;
  readonly conceptStatuses: ConceptStatusRepo;
  readonly conceptProposals: ConceptProposalRepo;
  readonly conceptClaims: ConceptClaimRepo;
  readonly conceptStatusLog: ConceptStatusLogRepo;
  readonly royalties: RoyaltyRepo;
  readonly conversions: CatalogueConversionRepo;
  readonly brandVerifications: BrandVerificationRepo;
  readonly roles: RoleRepo;
  readonly notifications: NotificationRepo;
}

/** Errors thrown by a `WearStore`. */
export class WearStoreError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'WearStoreError';
    this.code = code;
  }
}
