import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  BRAND_ELIGIBILITY_MIN_CONCEPTS_CLAIMED,
  BRAND_ELIGIBILITY_MIN_CONCEPTS_POSTED,
  WearStoreError,
  extractHashtags,
  normaliseHashtag,
  type BlockEdge,
  type BlockRepo,
  type BrandApplication,
  type BrandApplicationRepo,
  type BrandApplicationStatus,
  type BrandEligibility,
  type BrandRepo,
  type BrandVerification,
  type BrandVerificationRepo,
  type BrandVerificationStatus,
  type CatalogueConversion,
  type CatalogueConversionRepo,
  type CatalogueConversionStatus,
  type Comment,
  type CommentRepo,
  type Concept,
  type ConceptClaim,
  type ConceptClaimRepo,
  type ConceptClaimStatus,
  type ConceptComment,
  type ConceptCommentRepo,
  type ConceptMedia,
  type ConceptProposal,
  type ConceptProposalRepo,
  type ConceptProposalStatus,
  type ConceptRepo,
  type ConceptShare,
  type ConceptStage,
  type ConceptStatus,
  type ConceptStatusLogEntry,
  type ConceptStatusLogRepo,
  type ConceptStatusRepo,
  type ConceptUpvote,
  type ConceptWithMedia,
  type ConnectId,
  type Conversation,
  type ConversationMember,
  type ConversationRepo,
  type ConversationRequestState,
  type ConversationSummary,
  type CreateBrandInput,
  type CreatePostInput,
  type CreateStoryInput,
  type FeedPage,
  type FeedPageParams,
  type FollowCounts,
  type FollowEdge,
  type FollowRepo,
  type HighlightRepo,
  type LikeEdge,
  type LikeRepo,
  type Message,
  type MessageRepo,
  type NotificationRepo,
  type NotificationType,
  type Page,
  type PageParams,
  type Post,
  type PostMedia,
  type PostRepo,
  type PostWithMedia,
  type Profile,
  type ProfileRepo,
  type Report,
  type ReportRepo,
  type RoleRepo,
  type RoyaltyObligation,
  type RoyaltyRepo,
  type SaveCollection,
  type SaveRepo,
  type SettingsRepo,
  type Story,
  type StoryHighlight,
  type StoryReaction,
  type StoryRepo,
  type StoryReactionKind,
  type StoryTrayEntry,
  type StoryView,
  type TrendingHashtag,
  type UpdateBrandInput,
  type UpsertUserInput,
  type UserRepo,
  type UserSettings,
  type WearBrand,
  type WearNotification,
  type WearPlatformRole,
  type WearStore,
  type WearUser,
} from '@citizens/db';

/**
 * Production `WearStore` backed by the shared Supabase project's `wear.*`
 * schema (ADR-0007, STEP3 §5 Q2). Every query runs through an **injected,
 * request-scoped** client bound to `db:{schema:'wear'}` and carrying the
 * caller's auth cookies, so **RLS enforces isolation as the signed-in user**
 * (SHARED_DB_CONTRACT R3 — RLS is the only wall). Never share one instance
 * across requests.
 *
 * This is an I/O adapter: it is not unit-testable without Postgres, so it is
 * excluded from the coverage allowlist and validated by (a) mirroring the
 * `MemoryWearStore` contract (the semantic spec), (b) `tsc` + `next build`,
 * and (c) a production RLS smoke test via the Supabase MCP. Where mig-143 RLS
 * cannot express a write, it delegates to the SECURITY DEFINER helpers added
 * in mig 144 (`create_direct_conversation`, `create_group_conversation`) and
 * relies on the two triggers there (conversation `updated_at` bump on message;
 * symmetric unfollow on block).
 */
export class SupabaseWearStore implements WearStore {
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
  public readonly conceptComments: ConceptCommentRepo;
  public readonly conceptStatuses: ConceptStatusRepo;
  public readonly conceptProposals: ConceptProposalRepo;
  public readonly conceptClaims: ConceptClaimRepo;
  public readonly conceptStatusLog: ConceptStatusLogRepo;
  public readonly royalties: RoyaltyRepo;
  public readonly conversions: CatalogueConversionRepo;
  public readonly brandVerifications: BrandVerificationRepo;
  public readonly brandApplications: BrandApplicationRepo;
  public readonly roles: RoleRepo;
  public readonly notifications: NotificationRepo;

  private readonly db: SupabaseClient;
  private readonly now: () => Date;

  public constructor(client: SupabaseClient, options: { readonly now?: () => Date } = {}) {
    this.db = client;
    this.now = options.now ?? (() => new Date());

    this.users = this._users();
    this.brands = this._brands();
    this.profiles = this._profiles();
    this.follows = this._follows();
    this.settings = this._settings();
    this.posts = this._posts();
    this.likes = this._likes();
    this.comments = this._comments();
    this.saves = this._saves();
    this.stories = this._stories();
    this.highlights = this._highlights();
    this.conversations = this._conversations();
    this.messages = this._messages();
    this.blocks = this._blocks();
    this.reports = this._reports();
    this.concepts = this._concepts();
    this.conceptComments = this._conceptComments();
    this.conceptStatuses = this._conceptStatuses();
    this.conceptProposals = this._conceptProposals();
    this.conceptClaims = this._conceptClaims();
    this.conceptStatusLog = this._conceptStatusLog();
    this.royalties = this._royalties();
    this.conversions = this._conversions();
    this.brandVerifications = this._brandVerifications();
    this.brandApplications = this._brandApplications();
    this.roles = this._roles();
    this.notifications = this._notifications();
  }

  // ── Identity mirror ───────────────────────────────────────────────────────
  private _users(): UserRepo {
    return {
      getById: async (id) => {
        const row = await this._maybeSingle(this.db.from('users').select(USER_COLS).eq('id', id));
        return row ? mapUser(row) : null;
      },
      getByHandle: async (handle) => {
        const row = await this._maybeSingle(
          this.db.from('users').select(USER_COLS).ilike('handle', handle.trim()),
        );
        return row ? mapUser(row) : null;
      },
      search: async (query, params) => {
        const q = query.trim();
        let builder = this.db.from('users').select(USER_COLS).order('handle', { ascending: true });
        if (q)
          builder = builder.or(
            `handle.ilike.%${escapeLike(q)}%,display_name.ilike.%${escapeLike(q)}%`,
          );
        return this._pageFrom(builder, params, mapUser);
      },
      upsertFromSession: async (input: UpsertUserInput) => {
        const existing = await this._maybeSingle(
          this.db.from('users').select(USER_COLS).eq('id', input.id),
        );
        if (existing) {
          const updated = await this._single(
            this.db
              .from('users')
              .update({ display_name: input.displayName, avatar_url: input.avatarUrl ?? null })
              .eq('id', input.id)
              .select(USER_COLS),
          );
          return mapUser(updated);
        }
        // First sign-in: insert with a unique handle, retrying on collision.
        const base = (input.handle.trim().toLowerCase() || `user_${input.id.slice(0, 8)}`).slice(
          0,
          32,
        );
        for (let attempt = 0; attempt < 25; attempt += 1) {
          const handle = attempt === 0 ? base : `${base}-${attempt + 1}`;
          const { data, error } = await this.db
            .from('users')
            .insert({
              id: input.id,
              handle,
              display_name: input.displayName,
              avatar_url: input.avatarUrl ?? null,
            })
            .select(USER_COLS)
            .single();
          if (!error && data) return mapUser(data as UserRow);
          if (error && error.code === '23505' && /handle/i.test(error.message)) continue; // handle taken
          if (error && error.code === '23505') {
            // id collided → a row already exists (race); read it back.
            const row = await this._single(
              this.db.from('users').select(USER_COLS).eq('id', input.id),
            );
            return mapUser(row);
          }
          if (error) throw wrap(error);
        }
        throw new WearStoreError('handle_exhausted', 'Could not allocate a unique handle.');
      },
    };
  }

  // ── Brands ────────────────────────────────────────────────────────────────
  private _brands(): BrandRepo {
    return {
      getById: async (id) => {
        const row = await this._maybeSingle(this.db.from('brands').select(BRAND_COLS).eq('id', id));
        return row ? mapBrand(row) : null;
      },
      getBySlug: async (slug) => {
        const row = await this._maybeSingle(
          this.db.from('brands').select(BRAND_COLS).ilike('slug', slug.trim()),
        );
        return row ? mapBrand(row) : null;
      },
      listAll: async (params) =>
        this._pageFrom(
          this.db.from('brands').select(BRAND_COLS).order('created_at', { ascending: true }),
          params,
          mapBrand,
        ),
      listForOwner: async (ownerId) => {
        const rows = await this._many(
          this.db
            .from('brands')
            .select(BRAND_COLS)
            .eq('owner_user_id', ownerId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapBrand);
      },
      search: async (query, params) => {
        const q = query.trim();
        let builder = this.db.from('brands').select(BRAND_COLS).order('name', { ascending: true });
        if (q)
          builder = builder.or(
            `name.ilike.%${escapeLike(q)}%,slug.ilike.%${escapeLike(q)}%,tagline.ilike.%${escapeLike(q)}%`,
          );
        return this._pageFrom(builder, params, mapBrand);
      },
      create: async (input: CreateBrandInput) => {
        const slug = input.slug.trim().toLowerCase();
        if (!slug) throw new WearStoreError('invalid_slug', 'Brand slug must not be empty.');
        const { data, error } = await this.db
          .from('brands')
          .insert({
            slug,
            name: input.name,
            tagline: input.tagline ?? null,
            website_url: input.websiteUrl ?? null,
            logo_url: input.logoUrl ?? null,
            owner_user_id: input.ownerId,
            connect_contributor_id: input.connectContributorId ?? null,
            // Mig 162 admin mint: sent ONLY when requested — the mig-157
            // protect_verified_column guard admits admins and 42501s others.
            ...(input.verified ? { verified: true } : {}),
          })
          .select(BRAND_COLS)
          .single();
        if (error) {
          if (error.code === '23505') {
            throw new WearStoreError('slug_taken', `Brand slug ${slug} is already in use.`);
          }
          throw wrap(error);
        }
        return mapBrand(data as BrandRow);
      },
      update: async (brandId, ownerId, patch: UpdateBrandInput) => {
        // Ownership is also enforced by RLS; we check first for a clean error.
        const current = await this._maybeSingle(
          this.db.from('brands').select(BRAND_COLS).eq('id', brandId),
        );
        if (!current) throw new WearStoreError('brand_not_found', `Unknown brand ${brandId}.`);
        if (current.owner_user_id !== ownerId) {
          throw new WearStoreError('forbidden', 'Only the owner can edit this brand.');
        }
        const patchRow: Record<string, unknown> = {};
        if (patch.name !== undefined) patchRow.name = patch.name;
        if (patch.tagline !== undefined) patchRow.tagline = patch.tagline;
        if (patch.websiteUrl !== undefined) patchRow.website_url = patch.websiteUrl;
        if (patch.logoUrl !== undefined) patchRow.logo_url = patch.logoUrl;
        if (patch.connectContributorId !== undefined)
          patchRow.connect_contributor_id = patch.connectContributorId;
        if (Object.keys(patchRow).length === 0) return mapBrand(current);
        const updated = await this._single(
          this.db.from('brands').update(patchRow).eq('id', brandId).select(BRAND_COLS),
        );
        return mapBrand(updated);
      },
    };
  }

  // ── Wear-owned profile state ──────────────────────────────────────────────
  private _profiles(): ProfileRepo {
    return {
      get: async (userId) => {
        const row = await this._maybeSingle(
          this.db.from('profiles').select(PROFILE_COLS).eq('user_id', userId),
        );
        return row ? mapProfile(row) : null;
      },
      getOrCreate: async (userId) => {
        const existing = await this._maybeSingle(
          this.db.from('profiles').select(PROFILE_COLS).eq('user_id', userId),
        );
        if (existing) return mapProfile(existing);
        const created = await this._single(
          this.db.from('profiles').insert({ user_id: userId }).select(PROFILE_COLS),
        );
        return mapProfile(created);
      },
      update: async (userId, patch) => {
        const row: Record<string, unknown> = { user_id: userId };
        if (patch.bio !== undefined) row.bio = patch.bio;
        if (patch.visibility !== undefined) row.visibility = patch.visibility;
        if (patch.verified !== undefined) row.verified = patch.verified;
        const updated = await this._single(
          this.db.from('profiles').upsert(row, { onConflict: 'user_id' }).select(PROFILE_COLS),
        );
        return mapProfile(updated);
      },
    };
  }

  // ── Follow graph ──────────────────────────────────────────────────────────
  private _follows(): FollowRepo {
    return {
      follow: async (actorId, targetId) => {
        if (actorId === targetId) {
          throw new WearStoreError('self_follow', 'A user cannot follow themselves.');
        }
        const existing = await this._maybeSingle(
          this.db
            .from('follows')
            .select('actor_id,target_id,created_at')
            .eq('actor_id', actorId)
            .eq('target_id', targetId),
        );
        if (existing) return mapFollow(existing);
        const created = await this._single(
          this.db
            .from('follows')
            .insert({ actor_id: actorId, target_id: targetId })
            .select('actor_id,target_id,created_at'),
        );
        return mapFollow(created);
      },
      unfollow: async (actorId, targetId) => {
        await this._run(
          this.db.from('follows').delete().eq('actor_id', actorId).eq('target_id', targetId),
        );
      },
      isFollowing: async (actorId, targetId) => {
        const row = await this._maybeSingle(
          this.db
            .from('follows')
            .select('actor_id')
            .eq('actor_id', actorId)
            .eq('target_id', targetId),
        );
        return row !== null;
      },
      counts: async (userId): Promise<FollowCounts> => {
        const followers = await this._count(
          this.db
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('target_id', userId),
        );
        const following = await this._count(
          this.db
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('actor_id', userId),
        );
        return { followers, following };
      },
      followers: async (userId) => {
        const rows = await this._many(
          this.db.from('follows').select('actor_id,target_id,created_at').eq('target_id', userId),
        );
        return rows.map(mapFollow);
      },
      following: async (userId) => {
        const rows = await this._many(
          this.db.from('follows').select('actor_id,target_id,created_at').eq('actor_id', userId),
        );
        return rows.map(mapFollow);
      },
    };
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  private _settings(): SettingsRepo {
    return {
      get: async (userId) => {
        const existing = await this._maybeSingle(
          this.db.from('user_settings').select(SETTINGS_COLS).eq('user_id', userId),
        );
        if (existing) return mapSettings(existing);
        const created = await this._single(
          this.db.from('user_settings').insert({ user_id: userId }).select(SETTINGS_COLS),
        );
        return mapSettings(created);
      },
      update: async (userId, patch) => {
        const row: Record<string, unknown> = { user_id: userId };
        if (patch.displayNameOverride !== undefined)
          row.display_name_override = patch.displayNameOverride;
        if (patch.profileVisibility !== undefined) row.profile_visibility = patch.profileVisibility;
        const updated = await this._single(
          this.db
            .from('user_settings')
            .upsert(row, { onConflict: 'user_id' })
            .select(SETTINGS_COLS),
        );
        return mapSettings(updated);
      },
    };
  }

  // ── Posts + feed ──────────────────────────────────────────────────────────
  private _posts(): PostRepo {
    const readPage = async (rows: PostRow[], params?: FeedPageParams): Promise<FeedPage> => {
      const start = parseCursor(params?.cursor);
      const limit = clamp(params?.limit ?? 20, 1, 50);
      const slice = rows.slice(start, start + limit);
      const withMedia = await this._attachMedia(slice);
      return {
        items: withMedia,
        nextCursor: start + slice.length < rows.length ? String(start + slice.length) : null,
      };
    };
    return {
      create: async (input: CreatePostInput) => {
        if (!input.body.trim())
          throw new WearStoreError('empty_post', 'Post body must not be empty.');
        const post = await this._single(
          this.db
            .from('posts')
            .insert({
              author_id: input.authorId,
              brand_id: input.brandId ?? null,
              body: input.body,
              tagged_product_ids: [...(input.taggedProductIds ?? [])],
            })
            .select(POST_COLS),
        );
        const media: PostMedia[] = [];
        const inMedia = input.media ?? [];
        if (inMedia.length) {
          const inserted = await this._many(
            this.db
              .from('post_media')
              .insert(
                inMedia.map((m, i) => ({
                  post_id: (post as PostRow).id,
                  url: m.url,
                  kind: m.kind,
                  alt_text: m.altText,
                  order_index: m.orderIndex ?? i,
                })),
              )
              .select(MEDIA_COLS),
          );
          for (const row of inserted.sort((a, b) => a.order_index - b.order_index)) {
            media.push(mapMedia(row));
          }
        }
        return { post: mapPost(post), media };
      },
      getById: async (id) => {
        const row = await this._maybeSingle(this.db.from('posts').select(POST_COLS).eq('id', id));
        if (!row) return null;
        const [withMedia] = await this._attachMedia([row]);
        return withMedia ?? null;
      },
      listByAuthor: async (authorId, params) => {
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .eq('author_id', authorId)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      listByBrand: async (brandId, params) => {
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .eq('brand_id', brandId)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      feedChronological: async (viewerId, params) => {
        const authorIds = await this._followedPlusSelf(viewerId);
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .in('author_id', authorIds)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      feedForYou: async (viewerId, params) => {
        // Recency-weighted ranker mirroring MemoryWearStore: score =
        // 2*isFollowed + freshness (7-day linear decay), newest as tiebreak.
        // Ranks over a bounded recent window (adapter cap; memory ranks the
        // whole in-memory set — a documented, scale-safe divergence).
        const followed = new Set(await this._followedPlusSelf(viewerId));
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .order('created_at', { ascending: false })
            .limit(FOR_YOU_CANDIDATES),
        );
        const nowMs = this.now().getTime();
        const scored = rows.map((p) => {
          const ageMs = nowMs - Date.parse(p.created_at);
          const freshness = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 7));
          return { p, score: (followed.has(p.author_id) ? 2 : 0) + freshness };
        });
        scored.sort(
          (a, b) => b.score - a.score || Date.parse(b.p.created_at) - Date.parse(a.p.created_at),
        );
        return readPage(
          scored.map((s) => s.p),
          params,
        );
      },
      searchByText: async (query, params) => {
        const q = query.trim();
        if (!q) return readPage([], params);
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .ilike('body', `%${escapeLike(q)}%`)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      listByHashtag: async (tag, params) => {
        const needle = normaliseHashtag(tag);
        if (!needle) return readPage([], params);
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .ilike('body', `%#${escapeLike(needle)}%`)
            .order('created_at', { ascending: false }),
        );
        // Exact word-boundary match to mirror memory's extractHashtags.
        const matches = rows.filter((p) => extractHashtags(p.body).includes(needle));
        return readPage(matches, params);
      },
      trendingHashtags: async (options) => {
        const limit = clamp(options?.limit ?? 10, 1, 50);
        const windowMs = options?.windowMs ?? 1000 * 60 * 60 * 24 * 14;
        const nowMs = this.now().getTime();
        const sinceIso = new Date(nowMs - windowMs).toISOString();
        // Only posts inside the freshness window contribute a boost; older
        // posts score 0 in memory, so the window bound is loss-free here.
        const rows = await this._many(
          this.db
            .from('posts')
            .select('body,created_at')
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: false })
            .limit(TRENDING_CANDIDATES),
        );
        const counts = new Map<string, { count: number; score: number }>();
        for (const p of rows) {
          const ageMs = nowMs - Date.parse(p.created_at);
          const freshness = ageMs <= windowMs ? 1 - ageMs / windowMs : 0;
          for (const t of extractHashtags(p.body)) {
            const cur = counts.get(t) ?? { count: 0, score: 0 };
            cur.count += 1;
            cur.score += 1 + freshness;
            counts.set(t, cur);
          }
        }
        const ranked: TrendingHashtag[] = [...counts.entries()]
          .map(([tag, v]) => ({ tag, postCount: v.count, score: v.score }))
          .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
        return ranked.slice(0, limit);
      },
    };
  }

  // ── Likes ─────────────────────────────────────────────────────────────────
  private _likes(): LikeRepo {
    return {
      likePost: async (postId, userId) => {
        const existing = await this._maybeSingle(
          this.db
            .from('likes')
            .select('post_id,user_id,created_at')
            .eq('post_id', postId)
            .eq('user_id', userId),
        );
        if (existing) return mapLike(existing);
        const { data, error } = await this.db
          .from('likes')
          .insert({ post_id: postId, user_id: userId })
          .select('post_id,user_id,created_at')
          .single();
        if (error) {
          if (error.code === '23503')
            throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
          throw wrap(error);
        }
        return mapLike(data as LikeRow);
      },
      unlikePost: async (postId, userId) => {
        await this._run(this.db.from('likes').delete().eq('post_id', postId).eq('user_id', userId));
      },
      isPostLiked: async (postId, userId) => {
        const row = await this._maybeSingle(
          this.db.from('likes').select('post_id').eq('post_id', postId).eq('user_id', userId),
        );
        return row !== null;
      },
      postLikeCount: async (postId) =>
        this._count(
          this.db.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId),
        ),
      likeComment: async (commentId, userId) => {
        const existing = await this._maybeSingle(
          this.db
            .from('comment_likes')
            .select('comment_id,user_id,created_at')
            .eq('comment_id', commentId)
            .eq('user_id', userId),
        );
        if (existing) return mapCommentLike(existing);
        const { data, error } = await this.db
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: userId })
          .select('comment_id,user_id,created_at')
          .single();
        if (error) {
          if (error.code === '23503')
            throw new WearStoreError('comment_not_found', `Unknown comment ${commentId}.`);
          throw wrap(error);
        }
        return mapCommentLike(data as CommentLikeRow);
      },
      unlikeComment: async (commentId, userId) => {
        await this._run(
          this.db.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId),
        );
      },
      commentLikeCount: async (commentId) =>
        this._count(
          this.db
            .from('comment_likes')
            .select('*', { count: 'exact', head: true })
            .eq('comment_id', commentId),
        ),
      postsLikedBy: async (userId) => {
        const rows = await this._many(
          this.db
            .from('likes')
            .select('post_id,user_id,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapLike);
      },
    };
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  private _comments(): CommentRepo {
    return {
      create: async ({ postId, authorId, body, parentCommentId }) => {
        if (!body.trim())
          throw new WearStoreError('empty_comment', 'Comment body must not be empty.');
        const { data, error } = await this.db
          .from('comments')
          .insert({
            post_id: postId,
            author_id: authorId,
            parent_comment_id: parentCommentId ?? null,
            body,
          })
          .select(COMMENT_COLS)
          .single();
        if (error) {
          if (error.code === '23503') {
            // FK on either post_id or parent_comment_id.
            throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
          }
          throw wrap(error);
        }
        return mapComment(data as CommentRow);
      },
      listForPost: async (postId) => {
        const rows = await this._many(
          this.db
            .from('comments')
            .select(COMMENT_COLS)
            .eq('post_id', postId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapComment);
      },
      authoredBy: async (userId) => {
        const rows = await this._many(
          this.db
            .from('comments')
            .select(COMMENT_COLS)
            .eq('author_id', userId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapComment);
      },
      commentsForPostCount: async (postId) =>
        this._count(
          this.db
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId),
        ),
    };
  }

  // ── Saves ─────────────────────────────────────────────────────────────────
  private _saves(): SaveRepo {
    const defaultCollection = async (ownerId: ConnectId): Promise<SaveCollectionRow> => {
      const existing = await this._maybeSingle(
        this.db
          .from('save_collections')
          .select(SAVE_COLLECTION_COLS)
          .eq('owner_id', ownerId)
          .eq('name', 'default'),
      );
      if (existing) return existing;
      // Upsert to tolerate the (owner_id, name) unique race.
      return this._single(
        this.db
          .from('save_collections')
          .upsert({ owner_id: ownerId, name: 'default' }, { onConflict: 'owner_id,name' })
          .select(SAVE_COLLECTION_COLS),
      );
    };
    const snapshot = async (row: SaveCollectionRow): Promise<SaveCollection> => {
      const posts = await this._many(
        this.db.from('saved_posts').select('post_id').eq('collection_id', row.id),
      );
      return mapSaveCollection(
        row,
        posts.map((p) => p.post_id),
      );
    };
    return {
      getOrCreateDefault: async (ownerId) => snapshot(await defaultCollection(ownerId)),
      listForOwner: async (ownerId) => {
        const rows = await this._many(
          this.db.from('save_collections').select(SAVE_COLLECTION_COLS).eq('owner_id', ownerId),
        );
        return Promise.all(rows.map(snapshot));
      },
      savePost: async (ownerId, postId, collectionId) => {
        const collection = collectionId
          ? await this._maybeSingle(
              this.db.from('save_collections').select(SAVE_COLLECTION_COLS).eq('id', collectionId),
            )
          : await defaultCollection(ownerId);
        if (!collection) {
          throw new WearStoreError('collection_not_found', `Unknown collection ${collectionId}.`);
        }
        if (collection.owner_id !== ownerId) {
          throw new WearStoreError('forbidden', 'Collection does not belong to caller.');
        }
        const { error } = await this.db
          .from('saved_posts')
          .upsert(
            { collection_id: collection.id, post_id: postId },
            { onConflict: 'collection_id,post_id', ignoreDuplicates: true },
          );
        if (error) {
          if (error.code === '23503')
            throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
          throw wrap(error);
        }
        return snapshot(collection);
      },
      unsavePost: async (ownerId, postId, collectionId) => {
        if (collectionId) {
          const coll = await this._maybeSingle(
            this.db.from('save_collections').select('id,owner_id').eq('id', collectionId),
          );
          if (!coll || coll.owner_id !== ownerId) return;
          await this._run(
            this.db
              .from('saved_posts')
              .delete()
              .eq('collection_id', collectionId)
              .eq('post_id', postId),
          );
          return;
        }
        const owned = await this._many(
          this.db.from('save_collections').select('id').eq('owner_id', ownerId),
        );
        for (const c of owned) {
          await this._run(
            this.db.from('saved_posts').delete().eq('collection_id', c.id).eq('post_id', postId),
          );
        }
      },
      isSaved: async (ownerId, postId) => {
        const owned = await this._many(
          this.db.from('save_collections').select('id').eq('owner_id', ownerId),
        );
        if (!owned.length) return false;
        const row = await this._maybeSingle(
          this.db
            .from('saved_posts')
            .select('post_id')
            .eq('post_id', postId)
            .in(
              'collection_id',
              owned.map((c) => c.id),
            ),
        );
        return row !== null;
      },
    };
  }

  // ── Stories ───────────────────────────────────────────────────────────────
  private _stories(): StoryRepo {
    const DEFAULT_TTL = 1000 * 60 * 60 * 24;
    return {
      create: async (input: CreateStoryInput) => {
        const createdAt = this.now();
        const ttl = Math.max(1000, input.ttlMs ?? DEFAULT_TTL);
        const mediaKind = input.mediaKind ?? 'image';
        const caption = (input.caption ?? '').trim() || null;
        if (mediaKind === 'text' && !caption) {
          throw new WearStoreError('empty_story', 'Text stories must have a caption.');
        }
        if (mediaKind !== 'text' && !input.mediaUrl) {
          throw new WearStoreError('empty_story', 'Image/video stories must have a media url.');
        }
        const row = await this._single(
          this.db
            .from('stories')
            .insert({
              author_id: input.authorId,
              brand_id: input.brandId ?? null,
              media_url: input.mediaUrl ?? null,
              media_kind: mediaKind,
              caption,
              audience: input.audience ?? 'public',
              created_at: createdAt.toISOString(),
              expires_at: new Date(createdAt.getTime() + ttl).toISOString(),
            })
            .select(STORY_COLS),
        );
        return mapStory(row);
      },
      getById: async (id) => {
        const row = await this._maybeSingle(
          this.db.from('stories').select(STORY_COLS).eq('id', id),
        );
        return row ? mapStory(row) : null;
      },
      listByAuthor: async (authorId) => {
        const rows = await this._many(
          this.db
            .from('stories')
            .select(STORY_COLS)
            .eq('author_id', authorId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapStory);
      },
      listActiveForViewer: async (viewerId) => {
        // RLS `stories_read` already enforces audience (author/public/followers)
        // AND block invisibility is handled by our tray/reaction paths; here we
        // additionally drop stories from users in a mutual block (mirrors memory)
        // and expired rows.
        const nowIso = this.now().toISOString();
        const rows = await this._many(
          this.db
            .from('stories')
            .select(STORY_COLS)
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: false }),
        );
        const visible: Story[] = [];
        for (const r of rows) {
          if (r.author_id !== viewerId && (await this._isBlockedEither(viewerId, r.author_id)))
            continue;
          visible.push(mapStory(r));
        }
        return visible;
      },
      trayForViewer: async (viewerId) => {
        const active = await this.stories.listActiveForViewer(viewerId);
        const grouped = new Map<ConnectId, Story[]>();
        for (const s of active) {
          const list = grouped.get(s.authorId) ?? [];
          list.push(s);
          grouped.set(s.authorId, list);
        }
        const seen = await this._seenStoryIds(viewerId);
        const entries: StoryTrayEntry[] = [];
        for (const [authorId, list] of grouped.entries()) {
          const latest = list[0]!;
          const hasUnseen = list.some((s) => !seen.has(s.id) && s.authorId !== viewerId);
          entries.push({
            authorId,
            latestStoryId: latest.id,
            latestCreatedAt: latest.createdAt,
            storyCount: list.length,
            hasUnseen,
          });
        }
        return entries.sort((a, b) => {
          if (a.authorId === viewerId) return -1;
          if (b.authorId === viewerId) return 1;
          if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
          return Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt);
        });
      },
      recordView: async (storyId, viewerId) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        const nowIso = this.now().toISOString();
        if (story.author_id === viewerId) {
          return { storyId, viewerId, viewedAt: nowIso };
        }
        const existing = await this._maybeSingle(
          this.db
            .from('story_views')
            .select('story_id,viewer_id,viewed_at')
            .eq('story_id', storyId)
            .eq('viewer_id', viewerId),
        );
        if (existing) return mapStoryView(existing);
        const created = await this._single(
          this.db
            .from('story_views')
            .insert({ story_id: storyId, viewer_id: viewerId })
            .select('story_id,viewer_id,viewed_at'),
        );
        return mapStoryView(created);
      },
      listViewers: async (storyId, callerId) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) return [];
        if (story.author_id !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can see story viewers.');
        }
        const rows = await this._many(
          this.db
            .from('story_views')
            .select('story_id,viewer_id,viewed_at')
            .eq('story_id', storyId)
            .order('viewed_at', { ascending: false }),
        );
        return rows.map(mapStoryView);
      },
      addReaction: async ({ storyId, userId, kind }) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        if (await this._isBlockedEither(userId, story.author_id)) {
          throw new WearStoreError('forbidden', 'Cannot react to this story.');
        }
        const row = await this._single(
          this.db
            .from('story_reactions')
            .insert({ story_id: storyId, user_id: userId, kind })
            .select(STORY_REACTION_COLS),
        );
        return mapStoryReaction(row);
      },
      listReactions: async (storyId) => {
        const rows = await this._many(
          this.db
            .from('story_reactions')
            .select(STORY_REACTION_COLS)
            .eq('story_id', storyId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapStoryReaction);
      },
      delete: async (storyId, authorId) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) return;
        if (story.author_id !== authorId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this story.');
        }
        await this._run(this.db.from('stories').delete().eq('id', storyId));
      },
    };
  }

  // ── Highlights ────────────────────────────────────────────────────────────
  private _highlights(): HighlightRepo {
    const load = async (id: string): Promise<StoryHighlight | null> => {
      const row = await this._maybeSingle(
        this.db.from('story_highlights').select(HIGHLIGHT_COLS).eq('id', id),
      );
      if (!row) return null;
      const items = await this._many(
        this.db
          .from('story_highlight_items')
          .select('story_id,order_index')
          .eq('highlight_id', id)
          .order('order_index', { ascending: true }),
      );
      return mapHighlight(
        row,
        items.map((i) => i.story_id),
      );
    };
    const requireOwned = async (id: string, ownerId: ConnectId): Promise<StoryHighlight> => {
      const h = await load(id);
      if (!h) throw new WearStoreError('highlight_not_found', `Unknown highlight ${id}.`);
      if (h.ownerId !== ownerId) {
        throw new WearStoreError('forbidden', 'Only the owner can modify this highlight.');
      }
      return h;
    };
    return {
      create: async ({ ownerId, name, coverUrl }) => {
        const trimmed = name.trim();
        if (!trimmed)
          throw new WearStoreError('empty_highlight', 'Highlight name must not be empty.');
        const row = await this._single(
          this.db
            .from('story_highlights')
            .insert({ owner_id: ownerId, name: trimmed.slice(0, 80), cover_url: coverUrl ?? null })
            .select(HIGHLIGHT_COLS),
        );
        return mapHighlight(row, []);
      },
      listForOwner: async (ownerId) => {
        const rows = await this._many(
          this.db
            .from('story_highlights')
            .select(HIGHLIGHT_COLS)
            .eq('owner_id', ownerId)
            .order('created_at', { ascending: false }),
        );
        const out: StoryHighlight[] = [];
        for (const r of rows) {
          const loaded = await load(r.id);
          if (loaded) out.push(loaded);
        }
        return out;
      },
      getById: async (id) => load(id),
      addStory: async (highlightId, storyId, ownerId) => {
        const highlight = await requireOwned(highlightId, ownerId);
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        if (story.author_id !== ownerId) {
          throw new WearStoreError(
            'forbidden',
            'Highlights may only contain the owner’s own stories.',
          );
        }
        if (highlight.storyIds.includes(storyId)) return highlight;
        await this._run(
          this.db.from('story_highlight_items').upsert(
            {
              highlight_id: highlightId,
              story_id: storyId,
              order_index: highlight.storyIds.length,
            },
            { onConflict: 'highlight_id,story_id', ignoreDuplicates: true },
          ),
        );
        return (await load(highlightId))!;
      },
      removeStory: async (highlightId, storyId, ownerId) => {
        await requireOwned(highlightId, ownerId);
        await this._run(
          this.db
            .from('story_highlight_items')
            .delete()
            .eq('highlight_id', highlightId)
            .eq('story_id', storyId),
        );
        return (await load(highlightId))!;
      },
      delete: async (highlightId, ownerId) => {
        await requireOwned(highlightId, ownerId);
        await this._run(this.db.from('story_highlights').delete().eq('id', highlightId));
      },
    };
  }

  // ── Conversations ─────────────────────────────────────────────────────────
  private _conversations(): ConversationRepo {
    const summarise = async (
      conv: ConversationRow,
      userId: ConnectId,
    ): Promise<ConversationSummary> => {
      const members = await this._many(
        this.db.from('conversation_members').select(MEMBER_COLS).eq('conversation_id', conv.id),
      );
      const messages = await this._many(
        this.db
          .from('messages')
          .select(MESSAGE_COLS)
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true }),
      );
      const me = members.find((m) => m.user_id === userId);
      const lastReadMs = me?.last_read_at ? Date.parse(me.last_read_at) : 0;
      const lastMessage = messages.length ? messages[messages.length - 1]! : null;
      const unreadCount = messages.filter(
        (m) => m.author_id !== userId && !m.deleted_at && Date.parse(m.created_at) > lastReadMs,
      ).length;
      return {
        conversation: mapConversation(conv),
        members: members.map(mapMember),
        lastMessage: lastMessage ? mapMessage(lastMessage) : null,
        unreadCount,
      };
    };
    return {
      getOrCreateDirect: async (actorId, otherId) => {
        if (actorId === otherId)
          throw new WearStoreError('self_dm', 'Cannot start a DM with yourself.');
        const conv = await this._rpcRow('create_direct_conversation', { p_other: otherId });
        return mapConversation(conv as ConversationRow);
      },
      createGroup: async ({ createdById: _createdById, name, memberIds }) => {
        // createdById is implied by auth.uid() inside the SECDEF helper.
        const conv = await this._rpcRow('create_group_conversation', {
          p_name: name,
          p_member_ids: [...memberIds],
        });
        return mapConversation(conv as ConversationRow);
      },
      getById: async (id, callerId) => {
        const conv = await this._maybeSingle(
          this.db.from('conversations').select(CONVERSATION_COLS).eq('id', id),
        );
        if (!conv) return null;
        const me = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', id)
            .eq('user_id', callerId),
        );
        if (!me) return null;
        return mapConversation(conv);
      },
      membership: async (conversationId, userId) => {
        const row = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select(MEMBER_COLS)
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
        return row ? mapMember(row) : null;
      },
      listMembers: async (conversationId) => {
        const rows = await this._many(
          this.db
            .from('conversation_members')
            .select(MEMBER_COLS)
            .eq('conversation_id', conversationId),
        );
        return rows.map(mapMember);
      },
      listForUser: async (userId, options) => {
        let mine = this.db
          .from('conversation_members')
          .select('conversation_id,request_state')
          .eq('user_id', userId);
        if (options?.requestState) mine = mine.eq('request_state', options.requestState);
        const memberships = await this._many(mine);
        if (!memberships.length) return [];
        const convs = await this._many(
          this.db
            .from('conversations')
            .select(CONVERSATION_COLS)
            .in(
              'id',
              memberships.map((m) => m.conversation_id),
            ),
        );
        const summaries = await Promise.all(convs.map((c) => summarise(c, userId)));
        return summaries.sort((a, b) => {
          const aTs = a.lastMessage?.createdAt ?? a.conversation.updatedAt;
          const bTs = b.lastMessage?.createdAt ?? b.conversation.updatedAt;
          return Date.parse(bTs) - Date.parse(aTs);
        });
      },
      markRead: async (conversationId, userId) => {
        await this._run(
          this.db
            .from('conversation_members')
            .update({ last_read_at: this.now().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
      },
      acceptRequest: async (conversationId, userId) => {
        const updated = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .update({ request_state: 'accepted' })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .select(MEMBER_COLS),
        );
        if (!updated) throw new WearStoreError('not_a_member', 'No membership found.');
        return mapMember(updated);
      },
      declineRequest: async (conversationId, userId) => {
        await this._run(
          this.db
            .from('conversation_members')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
      },
      setMuted: async (conversationId, userId, mutedUntil) => {
        const updated = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .update({ muted_until: mutedUntil })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .select(MEMBER_COLS),
        );
        if (!updated) throw new WearStoreError('not_a_member', 'No membership found.');
        return mapMember(updated);
      },
      leave: async (conversationId, userId) => {
        await this._run(
          this.db
            .from('conversation_members')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
      },
    };
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  private _messages(): MessageRepo {
    return {
      send: async ({ conversationId, authorId, body }) => {
        const me = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select('request_state')
            .eq('conversation_id', conversationId)
            .eq('user_id', authorId),
        );
        if (!me) throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        const conv = await this._maybeSingle(
          this.db.from('conversations').select('created_by').eq('id', conversationId),
        );
        if (!conv) throw new WearStoreError('conversation_not_found', `Unknown ${conversationId}.`);
        if (me.request_state !== 'accepted' && conv.created_by !== authorId) {
          throw new WearStoreError('request_pending', 'Accept the request before replying.');
        }
        const trimmed = body.trim();
        if (!trimmed) throw new WearStoreError('empty_message', 'Message body must not be empty.');
        const others = await this._many(
          this.db
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', authorId),
        );
        for (const m of others) {
          if (await this._isBlockedEither(authorId, m.user_id)) {
            throw new WearStoreError('forbidden', 'Cannot message a user you have blocked.');
          }
        }
        // The conversation.updated_at bump is handled by the mig-144 trigger.
        const row = await this._single(
          this.db
            .from('messages')
            .insert({
              conversation_id: conversationId,
              author_id: authorId,
              body: trimmed.slice(0, 4000),
            })
            .select(MESSAGE_COLS),
        );
        return mapMessage(row);
      },
      list: async (conversationId, callerId, params) => {
        const me = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', callerId),
        );
        if (!me) throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        const all = await this._many(
          this.db
            .from('messages')
            .select(MESSAGE_COLS)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }),
        );
        const limit = clamp(params?.limit ?? 50, 1, 100);
        const start = parseCursor(params?.cursor);
        const slice = all.slice(start, start + limit);
        const nextIndex = start + slice.length;
        return {
          items: slice.map(mapMessage),
          nextCursor: nextIndex < all.length ? String(nextIndex) : null,
        };
      },
      deleteOwn: async (messageId, callerId) => {
        const m = await this._maybeSingle(
          this.db.from('messages').select('author_id').eq('id', messageId),
        );
        if (!m) return;
        if (m.author_id !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this message.');
        }
        await this._run(
          this.db
            .from('messages')
            .update({ deleted_at: this.now().toISOString(), body: '' })
            .eq('id', messageId),
        );
      },
    };
  }

  // ── Blocks ────────────────────────────────────────────────────────────────
  private _blocks(): BlockRepo {
    return {
      block: async (actorId, targetId) => {
        if (actorId === targetId)
          throw new WearStoreError('self_block', 'A user cannot block themselves.');
        const existing = await this._maybeSingle(
          this.db
            .from('blocks')
            .select('actor_id,target_id,created_at')
            .eq('actor_id', actorId)
            .eq('target_id', targetId),
        );
        if (existing) return mapBlock(existing);
        // The mig-144 trigger removes both follow directions on insert.
        const created = await this._single(
          this.db
            .from('blocks')
            .insert({ actor_id: actorId, target_id: targetId })
            .select('actor_id,target_id,created_at'),
        );
        return mapBlock(created);
      },
      unblock: async (actorId, targetId) => {
        await this._run(
          this.db.from('blocks').delete().eq('actor_id', actorId).eq('target_id', targetId),
        );
      },
      isBlockedEither: async (a, b) => this._isBlockedEither(a, b),
      listBlocked: async (actorId) => {
        const rows = await this._many(
          this.db.from('blocks').select('actor_id,target_id,created_at').eq('actor_id', actorId),
        );
        return rows.map(mapBlock);
      },
    };
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  private _reports(): ReportRepo {
    return {
      create: async ({ reporterId, subjectKind, subjectId, reason, note }) => {
        const trimmed = (note ?? '').trim();
        const row = await this._single(
          this.db
            .from('reports')
            .insert({
              reporter_id: reporterId,
              subject_kind: subjectKind,
              subject_id: subjectId,
              reason,
              note: trimmed ? trimmed.slice(0, 2000) : null,
            })
            .select(REPORT_COLS),
        );
        return mapReport(row);
      },
      // Since mig 145, moderators hold SELECT/UPDATE on reports; for everyone
      // else these return no rows (RLS), which is the intended posture.
      listForSubject: async (subjectKind, subjectId) => {
        const rows = await this._many(
          this.db
            .from('reports')
            .select(REPORT_COLS)
            .eq('subject_kind', subjectKind)
            .eq('subject_id', subjectId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapReport);
      },
      listByReporter: async (reporterId) => {
        const rows = await this._many(
          this.db
            .from('reports')
            .select(REPORT_COLS)
            .eq('reporter_id', reporterId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapReport);
      },
      listForModeration: async (callerId, filter) => {
        if (!(await this._getOwnRole(callerId))) {
          throw new WearStoreError('forbidden', 'Moderators only.');
        }
        let builder = this.db
          .from('reports')
          .select(REPORT_COLS)
          .order('created_at', { ascending: false });
        if (filter?.status) builder = builder.eq('status', filter.status);
        const rows = await this._many(builder);
        return rows.map(mapReport);
      },
      triage: async (reportId, callerId, status) => {
        if (!(await this._getOwnRole(callerId))) {
          throw new WearStoreError('forbidden', 'Moderators only.');
        }
        const row = await this._maybeSingle(
          this.db
            .from('reports')
            .update({ status, handled_by: callerId, handled_at: this.now().toISOString() })
            .eq('id', reportId)
            .select(REPORT_COLS),
        );
        // RLS-filtered zero-row update = unknown id (we already know the
        // caller is a moderator, so visibility isn't the cause).
        if (!row) throw new WearStoreError('report_not_found', `Unknown report ${reportId}.`);
        return mapReport(row);
      },
    };
  }

  // ── Mig 157 — Concepts marketplace ──────────────────────────────────────────
  // Reads go through RLS (party/public scoping happens in the database);
  // lifecycle writes delegate to the SECURITY DEFINER RPCs. Pre-checks before
  // inserts exist only to surface the same clean `WearStoreError` codes the
  // MemoryWearStore spec throws — RLS remains the wall either way.
  private _concepts(): ConceptRepo {
    return {
      create: async (input) => {
        const title = input.title.trim();
        if (!title) {
          throw new WearStoreError('empty_concept', 'Concept title must not be empty.');
        }
        const row = await this._single(
          this.db
            .from('concepts')
            .insert({
              creator_id: input.creatorId,
              title,
              description: (input.description ?? '').trim() || null,
            })
            .select(CONCEPT_COLS),
        );
        const concept = mapConcept(row);
        if (input.media?.length) {
          await this._run(
            this.db.from('concept_media').insert(
              input.media.map((m, i) => ({
                concept_id: concept.id,
                url: m.url,
                kind: m.kind,
                alt_text: m.altText,
                order_index: m.orderIndex ?? i,
              })),
            ),
          );
        }
        return (await this.concepts.getById(concept.id))!;
      },
      getById: async (id) => {
        const row = await this._maybeSingle(
          this.db.from('concepts').select(CONCEPT_COLS).eq('id', id),
        );
        if (!row) return null;
        const media = await this._many(
          this.db
            .from('concept_media')
            .select(CONCEPT_MEDIA_COLS)
            .eq('concept_id', id)
            .order('order_index', { ascending: true }),
        );
        return { concept: mapConcept(row), media: media.map(mapConceptMedia) };
      },
      countByCreator: async (creatorId) =>
        this._count(
          this.db
            .from('concepts')
            .select('id', { count: 'exact', head: true })
            .eq('creator_id', creatorId),
        ),
      list: async (filter) => {
        let builder = this.db
          .from('concepts')
          .select(CONCEPT_COLS)
          .order('created_at', { ascending: false });
        if (filter?.status) builder = builder.eq('status', filter.status);
        if (filter?.creatorId) builder = builder.eq('creator_id', filter.creatorId);
        const page = await this._pageFrom(builder, filter, mapConcept);
        const withMedia = await this._attachConceptMedia(page.items);
        return { items: withMedia, nextCursor: page.nextCursor };
      },
      update: async (conceptId, callerId, patch) => {
        const current = await this._maybeSingle(
          this.db.from('concepts').select(CONCEPT_COLS).eq('id', conceptId),
        );
        if (!current) {
          throw new WearStoreError('concept_not_found', `Unknown concept ${conceptId}.`);
        }
        if (current.creator_id !== callerId) {
          throw new WearStoreError('forbidden', 'Only the creator can edit this concept.');
        }
        if (current.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept is frozen once claimed.');
        }
        const patchRow: Record<string, unknown> = {};
        if (patch.title !== undefined) {
          const title = patch.title.trim();
          if (!title) {
            throw new WearStoreError('empty_concept', 'Concept title must not be empty.');
          }
          patchRow.title = title;
        }
        if (patch.description !== undefined) {
          patchRow.description = (patch.description ?? '').trim() || null;
        }
        if (Object.keys(patchRow).length) {
          await this._run(this.db.from('concepts').update(patchRow).eq('id', conceptId));
        }
        if (patch.media !== undefined) {
          await this._run(this.db.from('concept_media').delete().eq('concept_id', conceptId));
          if (patch.media.length) {
            await this._run(
              this.db.from('concept_media').insert(
                patch.media.map((m, i) => ({
                  concept_id: conceptId,
                  url: m.url,
                  kind: m.kind,
                  alt_text: m.altText,
                  order_index: m.orderIndex ?? i,
                })),
              ),
            );
          }
        }
        return (await this.concepts.getById(conceptId))!;
      },
      delete: async (conceptId, callerId) => {
        const current = await this._maybeSingle(
          this.db.from('concepts').select(CONCEPT_COLS).eq('id', conceptId),
        );
        if (!current) return;
        if (current.creator_id !== callerId || current.status !== 'proposed') {
          // Not the plain creator-while-open path — only a moderator may
          // proceed (mig-145 takedown policy; RLS backstops regardless).
          const role = await this._getOwnRole(callerId);
          if (!role) {
            throw new WearStoreError(
              current.creator_id === callerId ? 'concept_not_open' : 'forbidden',
              'Only the creator may delete, and only while open.',
            );
          }
        }
        await this._run(this.db.from('concepts').delete().eq('id', conceptId));
      },
      upvote: async (conceptId, userId) => {
        const { data, error } = await this.db
          .from('concept_upvotes')
          .insert({ concept_id: conceptId, user_id: userId })
          .select(UPVOTE_COLS);
        if (!error && data?.length) return mapUpvote(data[0] as UpvoteRow);
        if (error && error.code === '23505') {
          const existing = await this._single(
            this.db
              .from('concept_upvotes')
              .select(UPVOTE_COLS)
              .eq('concept_id', conceptId)
              .eq('user_id', userId),
          );
          return mapUpvote(existing);
        }
        if (error && error.code === '23503') {
          throw new WearStoreError('concept_not_found', `Unknown concept ${conceptId}.`);
        }
        throw wrap(error!);
      },
      removeUpvote: async (conceptId, userId) => {
        await this._run(
          this.db
            .from('concept_upvotes')
            .delete()
            .eq('concept_id', conceptId)
            .eq('user_id', userId),
        );
      },
      upvoteCount: async (conceptId) =>
        this._count(
          this.db
            .from('concept_upvotes')
            .select('concept_id', { count: 'exact', head: true })
            .eq('concept_id', conceptId),
        ),
      hasUpvoted: async (conceptId, userId) => {
        const row = await this._maybeSingle(
          this.db
            .from('concept_upvotes')
            .select('concept_id')
            .eq('concept_id', conceptId)
            .eq('user_id', userId),
        );
        return !!row;
      },
      share: async (conceptId, userId, channel) => {
        const { data, error } = await this.db
          .from('concept_shares')
          .insert({ concept_id: conceptId, user_id: userId, channel: channel ?? 'link' })
          .select(SHARE_COLS);
        if (!error && data?.length) return mapShare(data[0] as ShareRow);
        if (error && error.code === '23505') {
          // Distinct-sharer PK: the first share stands.
          const existing = await this._single(
            this.db
              .from('concept_shares')
              .select(SHARE_COLS)
              .eq('concept_id', conceptId)
              .eq('user_id', userId),
          );
          return mapShare(existing);
        }
        if (error && error.code === '23503') {
          throw new WearStoreError('concept_not_found', `Unknown concept ${conceptId}.`);
        }
        throw wrap(error!);
      },
      shareCount: async (conceptId) =>
        this._count(
          this.db
            .from('concept_shares')
            .select('concept_id', { count: 'exact', head: true })
            .eq('concept_id', conceptId),
        ),
      hasShared: async (conceptId, userId) => {
        const row = await this._maybeSingle(
          this.db
            .from('concept_shares')
            .select('concept_id')
            .eq('concept_id', conceptId)
            .eq('user_id', userId),
        );
        return !!row;
      },
    };
  }

  // Mig 161 — community engagement on Concepts. Notifications and status
  // promotion are DB-trigger-side here (SECDEF, mig 161); only the memory
  // store mirrors them inline.
  private _conceptComments(): ConceptCommentRepo {
    return {
      create: async (input) => {
        const body = input.body.trim();
        if (!body) {
          throw new WearStoreError('empty_comment', 'Comment body must not be empty.');
        }
        if (input.parentCommentId) {
          const parent = await this._maybeSingle(
            this.db
              .from('concept_comments')
              .select('id,concept_id')
              .eq('id', input.parentCommentId),
          );
          if (!parent || parent.concept_id !== input.conceptId) {
            throw new WearStoreError('comment_not_found', 'Parent comment not found.');
          }
        }
        const { data, error } = await this.db
          .from('concept_comments')
          .insert({
            concept_id: input.conceptId,
            author_id: input.authorId,
            body,
            parent_comment_id: input.parentCommentId ?? null,
          })
          .select(CONCEPT_COMMENT_COLS);
        if (!error && data?.length) return mapConceptComment(data[0] as ConceptCommentRow);
        if (error && error.code === '23503') {
          throw new WearStoreError('concept_not_found', `Unknown concept ${input.conceptId}.`);
        }
        throw wrap(error!);
      },
      listForConcept: async (conceptId) => {
        const rows = await this._many(
          this.db
            .from('concept_comments')
            .select(CONCEPT_COMMENT_COLS)
            .eq('concept_id', conceptId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapConceptComment);
      },
      countForConcept: async (conceptId) =>
        this._count(
          this.db
            .from('concept_comments')
            .select('id', { count: 'exact', head: true })
            .eq('concept_id', conceptId),
        ),
    };
  }

  private _conceptStatuses(): ConceptStatusRepo {
    return {
      listActive: async (viewerId) => {
        const rows = await this._many(
          this.db
            .from('concept_statuses')
            .select(CONCEPT_STATUS_COLS)
            .gt('expires_at', this.now().toISOString())
            .order('created_at', { ascending: false }),
        );
        const statuses = rows.map(mapConceptStatus);
        if (!statuses.length || !viewerId) {
          return statuses.map((status) => ({ status, viewerSeen: false }));
        }
        // RLS scopes concept_status_views to the viewer's own rows.
        const seenRows = await this._many(
          this.db
            .from('concept_status_views')
            .select('status_id')
            .eq('viewer_id', viewerId)
            .in(
              'status_id',
              statuses.map((s) => s.id),
            ),
        );
        const seen = new Set(seenRows.map((r) => r.status_id));
        return statuses.map((status) => ({ status, viewerSeen: seen.has(status.id) }));
      },
      recordView: async (statusId, viewerId) => {
        const { error } = await this.db
          .from('concept_status_views')
          .insert({ status_id: statusId, viewer_id: viewerId });
        if (!error || error.code === '23505') return; // already seen is fine
        if (error.code === '23503') {
          throw new WearStoreError('status_not_found', `Unknown concept status ${statusId}.`);
        }
        throw wrap(error);
      },
    };
  }

  private _conceptProposals(): ConceptProposalRepo {
    return {
      create: async (callerId, input) => {
        // Pre-checks mirror the RLS INSERT policy for clean error codes.
        const brand = await this._maybeSingle(
          this.db.from('brands').select(BRAND_COLS).eq('id', input.brandId),
        );
        if (!brand) {
          throw new WearStoreError('brand_not_found', `Unknown brand ${input.brandId}.`);
        }
        if (brand.owner_user_id !== callerId) {
          throw new WearStoreError('forbidden', 'Only the brand owner can propose.');
        }
        if (!brand.verified) {
          throw new WearStoreError('brand_not_verified', 'Only verified brands may propose.');
        }
        const concept = await this._maybeSingle(
          this.db.from('concepts').select(CONCEPT_COLS).eq('id', input.conceptId),
        );
        if (!concept) {
          throw new WearStoreError('concept_not_found', `Unknown concept ${input.conceptId}.`);
        }
        if (concept.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept is no longer open for proposals.');
        }
        if (await this._isBlockedEither(callerId, concept.creator_id)) {
          throw new WearStoreError('forbidden', 'Cannot propose across a block.');
        }
        const { data, error } = await this.db
          .from('concept_proposals')
          .insert({
            concept_id: input.conceptId,
            brand_id: input.brandId,
            mockup_urls: [...(input.mockupUrls ?? [])],
            materials: (input.materials ?? '').trim() || null,
            est_unit_price: input.estUnitPrice ?? null,
            moq: input.moq ?? null,
            est_turnaround_days: input.estTurnaroundDays ?? null,
            note: (input.note ?? '').trim() || null,
          })
          .select(PROPOSAL_COLS)
          .single();
        if (error) {
          if (error.code === '23505') {
            throw new WearStoreError('proposal_exists', 'This brand already proposed.');
          }
          throw wrap(error);
        }
        return mapProposal(data as ProposalRow);
      },
      getById: async (id) => {
        // RLS is the party filter: non-parties simply see no row.
        const row = await this._maybeSingle(
          this.db.from('concept_proposals').select(PROPOSAL_COLS).eq('id', id),
        );
        return row ? mapProposal(row) : null;
      },
      listForConcept: async (conceptId) => {
        const rows = await this._many(
          this.db
            .from('concept_proposals')
            .select(PROPOSAL_COLS)
            .eq('concept_id', conceptId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapProposal);
      },
      listForBrand: async (brandId) => {
        const rows = await this._many(
          this.db
            .from('concept_proposals')
            .select(PROPOSAL_COLS)
            .eq('brand_id', brandId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapProposal);
      },
      update: async (proposalId, callerId, patch) => {
        const current = await this._requireOwnedProposal(proposalId, callerId);
        if (current.status !== 'submitted') {
          throw new WearStoreError('proposal_not_open', 'Only a submitted proposal can be edited.');
        }
        const patchRow: Record<string, unknown> = {};
        if (patch.mockupUrls !== undefined) patchRow.mockup_urls = [...patch.mockupUrls];
        if (patch.materials !== undefined) {
          patchRow.materials = (patch.materials ?? '').trim() || null;
        }
        if (patch.estUnitPrice !== undefined) patchRow.est_unit_price = patch.estUnitPrice;
        if (patch.moq !== undefined) patchRow.moq = patch.moq;
        if (patch.estTurnaroundDays !== undefined) {
          patchRow.est_turnaround_days = patch.estTurnaroundDays;
        }
        if (patch.note !== undefined) patchRow.note = (patch.note ?? '').trim() || null;
        if (!Object.keys(patchRow).length) return mapProposal(current);
        const row = await this._maybeSingle(
          this.db
            .from('concept_proposals')
            .update(patchRow)
            .eq('id', proposalId)
            .select(PROPOSAL_COLS),
        );
        // RLS WITH CHECK re-verifies brand verification + concept openness.
        if (!row) {
          throw new WearStoreError('concept_not_open', 'Concept or verification is no longer open.');
        }
        return mapProposal(row);
      },
      withdraw: async (proposalId, callerId) => {
        const current = await this._requireOwnedProposal(proposalId, callerId);
        if (current.status === 'awarded') {
          throw new WearStoreError('forbidden', 'An awarded proposal cannot be withdrawn.');
        }
        if (current.status === 'withdrawn') return mapProposal(current);
        const row = await this._maybeSingle(
          this.db
            .from('concept_proposals')
            .update({ status: 'withdrawn' })
            .eq('id', proposalId)
            .select(PROPOSAL_COLS),
        );
        if (!row) throw new WearStoreError('forbidden', 'Withdraw was refused.');
        return mapProposal(row);
      },
      resubmit: async (proposalId, callerId) => {
        const current = await this._requireOwnedProposal(proposalId, callerId);
        if (current.status !== 'withdrawn' && current.status !== 'declined') {
          throw new WearStoreError('proposal_not_open', 'Only withdrawn/declined can re-enter.');
        }
        // Mirror the memory spec's clean errors before the RLS-checked write.
        const brand = await this._maybeSingle(
          this.db.from('brands').select(BRAND_COLS).eq('id', current.brand_id),
        );
        if (!brand?.verified) {
          throw new WearStoreError('brand_not_verified', 'Only verified brands may propose.');
        }
        const concept = await this._maybeSingle(
          this.db.from('concepts').select(CONCEPT_COLS).eq('id', current.concept_id),
        );
        if (!concept || concept.status !== 'proposed') {
          throw new WearStoreError('concept_not_open', 'Concept is no longer open.');
        }
        const row = await this._maybeSingle(
          this.db
            .from('concept_proposals')
            .update({ status: 'submitted' })
            .eq('id', proposalId)
            .select(PROPOSAL_COLS),
        );
        if (!row) throw new WearStoreError('concept_not_open', 'Re-entry was refused.');
        return mapProposal(row);
      },
      publicTags: async (conceptId) => {
        const { data, error } = await this.db.rpc('get_concept_proposal_tags', {
          p_concept_id: conceptId,
        });
        if (error) throw mapRpcError(error);
        return ((data ?? []) as { brand_id: string; proposed_at: string }[]).map((r) => ({
          brandId: r.brand_id,
          proposedAt: r.proposed_at,
        }));
      },
    };
  }

  private _conceptClaims(): ConceptClaimRepo {
    return {
      award: async (proposalId) => {
        const data = await this._rpcRow('award_concept_claim', { p_proposal_id: proposalId });
        return mapClaim(data as ClaimRow);
      },
      getById: async (claimId) => {
        const row = await this._maybeSingle(
          this.db.from('concept_claims').select(CLAIM_COLS).eq('id', claimId),
        );
        return row ? mapClaim(row) : null;
      },
      getActiveForConcept: async (conceptId) => {
        const row = await this._maybeSingle(
          this.db
            .from('concept_claims')
            .select(CLAIM_COLS)
            .eq('concept_id', conceptId)
            .eq('status', 'active'),
        );
        return row ? mapClaim(row) : null;
      },
      listForBrand: async (brandId) => {
        const rows = await this._many(
          this.db
            .from('concept_claims')
            .select(CLAIM_COLS)
            .eq('brand_id', brandId)
            .order('awarded_at', { ascending: false }),
        );
        return rows.map(mapClaim);
      },
      revoke: async (claimId, callerId) => {
        const current = await this._maybeSingle(
          this.db.from('concept_claims').select(CLAIM_COLS).eq('id', claimId),
        );
        if (!current) {
          throw new WearStoreError('claim_not_found', `Unknown claim ${claimId}.`);
        }
        if ((await this._getOwnRole(callerId)) !== 'admin') {
          throw new WearStoreError('forbidden', 'Only an admin can revoke a claim.');
        }
        if (current.status === 'revoked') return mapClaim(current);
        // trg_reopen_concept_on_claim_revoke re-opens the concept DB-side.
        const row = await this._maybeSingle(
          this.db
            .from('concept_claims')
            .update({ status: 'revoked' })
            .eq('id', claimId)
            .select(CLAIM_COLS),
        );
        if (!row) throw new WearStoreError('forbidden', 'Revoke was refused.');
        return mapClaim(row);
      },
    };
  }

  private _conceptStatusLog(): ConceptStatusLogRepo {
    return {
      listForConcept: async (conceptId) => {
        const rows = await this._many(
          this.db
            .from('concept_status_log')
            .select(STATUS_LOG_COLS)
            .eq('concept_id', conceptId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapStatusLog);
      },
      advance: async (conceptId, _callerId, status, note) => {
        const data = await this._rpcRow('advance_concept_status', {
          p_concept_id: conceptId,
          p_status: status,
          p_note: note ?? null,
        });
        return mapStatusLog(data as StatusLogRow);
      },
    };
  }

  private _royalties(): RoyaltyRepo {
    return {
      listForClaim: async (claimId) => {
        const rows = await this._many(
          this.db
            .from('royalty_obligations')
            .select(ROYALTY_COLS)
            .eq('claim_id', claimId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapRoyalty);
      },
      listForUser: async () => {
        // RLS already scopes rows to the caller's claims (brand or creator).
        const rows = await this._many(
          this.db
            .from('royalty_obligations')
            .select(ROYALTY_COLS)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapRoyalty);
      },
      submitProof: async (obligationId, _callerId, proofUrl, note) => {
        const data = await this._rpcRow('submit_royalty_proof', {
          p_obligation_id: obligationId,
          p_proof_url: proofUrl,
          p_note: note ?? null,
        });
        return mapRoyalty(data as RoyaltyRow);
      },
      close: async (obligationId) => {
        const data = await this._rpcRow('close_royalty_obligation', {
          p_obligation_id: obligationId,
        });
        return mapRoyalty(data as RoyaltyRow);
      },
    };
  }

  private _conversions(): CatalogueConversionRepo {
    return {
      propose: async (claimId) => {
        const data = await this._rpcRow('propose_catalogue_conversion', { p_claim_id: claimId });
        return mapConversion(data as ConversionRow);
      },
      respond: async (conversionId, _callerId, accept) => {
        const data = await this._rpcRow('respond_catalogue_conversion', {
          p_conversion_id: conversionId,
          p_accept: accept,
        });
        return mapConversion(data as ConversionRow);
      },
      cancel: async (conversionId) => {
        const data = await this._rpcRow('cancel_catalogue_conversion', {
          p_conversion_id: conversionId,
        });
        return mapConversion(data as ConversionRow);
      },
      listForClaim: async (claimId) => {
        const rows = await this._many(
          this.db
            .from('catalogue_conversions')
            .select(CONVERSION_COLS)
            .eq('claim_id', claimId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapConversion);
      },
    };
  }

  private _brandVerifications(): BrandVerificationRepo {
    return {
      request: async (brandId, callerId, note) => {
        const brand = await this._maybeSingle(
          this.db.from('brands').select(BRAND_COLS).eq('id', brandId),
        );
        if (!brand) {
          throw new WearStoreError('brand_not_found', `Unknown brand ${brandId}.`);
        }
        if (brand.owner_user_id !== callerId) {
          throw new WearStoreError('forbidden', 'Only the brand owner can request verification.');
        }
        const trimmed = (note ?? '').trim().slice(0, 2000) || null;
        const existing = await this._maybeSingle(
          this.db.from('brand_verifications').select(VERIFICATION_COLS).eq('brand_id', brandId),
        );
        if (existing) {
          if (existing.status !== 'rejected') {
            throw new WearStoreError('verification_exists', 'A verification request already exists.');
          }
          // Owner re-request after 'rejected' (the RLS owner_rerequest policy).
          const row = await this._maybeSingle(
            this.db
              .from('brand_verifications')
              .update({
                status: 'pending',
                note: trimmed,
                requested_by: callerId,
                requested_at: this.now().toISOString(),
              })
              .eq('brand_id', brandId)
              .select(VERIFICATION_COLS),
          );
          if (!row) throw new WearStoreError('forbidden', 'Re-request was refused.');
          return mapVerification(row);
        }
        const { data, error } = await this.db
          .from('brand_verifications')
          .insert({ brand_id: brandId, note: trimmed, requested_by: callerId })
          .select(VERIFICATION_COLS)
          .single();
        if (error) {
          if (error.code === '23505') {
            throw new WearStoreError('verification_exists', 'A verification request already exists.');
          }
          throw wrap(error);
        }
        return mapVerification(data as VerificationRow);
      },
      getForBrand: async (brandId) => {
        // RLS: owner + moderators only — everyone else sees no row.
        const row = await this._maybeSingle(
          this.db.from('brand_verifications').select(VERIFICATION_COLS).eq('brand_id', brandId),
        );
        return row ? mapVerification(row) : null;
      },
      listPending: async () => {
        const rows = await this._many(
          this.db
            .from('brand_verifications')
            .select(VERIFICATION_COLS)
            .eq('status', 'pending')
            .order('requested_at', { ascending: true }),
        );
        return rows.map(mapVerification);
      },
      review: async (brandId, callerId, decision, reviewNote) => {
        if ((await this._getOwnRole(callerId)) !== 'admin') {
          throw new WearStoreError('forbidden', 'Only an admin can review verification.');
        }
        // trg_sync_brand_verified caches the outcome onto brands.verified.
        const row = await this._maybeSingle(
          this.db
            .from('brand_verifications')
            .update({
              status: decision,
              reviewed_by: callerId,
              reviewed_at: this.now().toISOString(),
              review_note: (reviewNote ?? '').trim().slice(0, 2000) || null,
            })
            .eq('brand_id', brandId)
            .select(VERIFICATION_COLS),
        );
        if (!row) {
          throw new WearStoreError('verification_not_found', `No request for brand ${brandId}.`);
        }
        return mapVerification(row);
      },
    };
  }

  // ── Become-a-Brand applications (mig 162) ─────────────────────────────────
  private _brandApplications(): BrandApplicationRepo {
    return {
      eligibility: async (userId) => this._brandEligibility(userId),
      submit: async (callerId, input) => {
        // Pre-check for the clean error code; the RLS WITH CHECK (which calls
        // the same SECDEF fn) + the partial unique index remain the wall.
        const gate = await this._brandEligibility(callerId);
        if (!gate.eligible) {
          throw new WearStoreError(
            'not_eligible',
            'The Become-a-Brand gate is not met yet — keep creating.',
          );
        }
        const socials: Record<string, string> = {};
        for (const [key, value] of Object.entries(input.socials ?? {})) {
          if (typeof value === 'string' && value.trim()) socials[key] = value.trim();
        }
        const { data, error } = await this.db
          .from('brand_applications')
          .insert({
            applicant_id: callerId,
            brand_name: input.brandName.trim(),
            bio: (input.bio ?? '').trim() || null,
            socials,
            support_email: input.supportEmail.trim(),
            contact_number: input.contactNumber.trim(),
            delivery_options: input.deliveryOptions.trim(),
            agree_terms: input.agreeTerms,
            agree_conduct: input.agreeConduct,
            agree_fees: input.agreeFees,
          })
          .select(BRAND_APPLICATION_COLS)
          .single();
        if (error) {
          // 23505 = the one-pending partial unique; 42501 = the RLS backstop
          // (eligibility flipped between the pre-check and the insert);
          // 23514 = a table CHECK — map the constraint to the memory-spec code.
          if (error.code === '23505') {
            throw new WearStoreError(
              'application_pending',
              'You already have an application under review.',
            );
          }
          if (error.code === '42501') {
            throw new WearStoreError(
              'not_eligible',
              'The Become-a-Brand gate is not met yet — keep creating.',
            );
          }
          if (error.code === '23514') throw mapApplicationCheckError(error);
          throw wrap(error);
        }
        return mapBrandApplication(data as BrandApplicationRow);
      },
      getOwnLatest: async (callerId) => {
        const row = await this._maybeSingle(
          this.db
            .from('brand_applications')
            .select(BRAND_APPLICATION_COLS)
            .eq('applicant_id', callerId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(1),
        );
        return row ? mapBrandApplication(row) : null;
      },
      getById: async (id) => {
        // RLS: applicant + moderators only — everyone else sees no row.
        const row = await this._maybeSingle(
          this.db.from('brand_applications').select(BRAND_APPLICATION_COLS).eq('id', id),
        );
        return row ? mapBrandApplication(row) : null;
      },
      listPending: async () => {
        // RLS scopes rows: moderators see the whole queue, an applicant only
        // their own pending row (MemoryWearStore throws `forbidden` instead to
        // make misuse loud in tests — the reports.listForModeration precedent).
        const rows = await this._many(
          this.db
            .from('brand_applications')
            .select(BRAND_APPLICATION_COLS)
            .eq('status', 'pending')
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapBrandApplication);
      },
      review: async (id, callerId, decision, opts) => {
        if ((await this._getOwnRole(callerId)) !== 'admin') {
          throw new WearStoreError('forbidden', 'Only an admin can decide applications.');
        }
        // The `.eq('status','pending')` mirrors the RLS USING clause: decided
        // rows are immutable for everyone. The decision trigger notifies.
        const row = await this._maybeSingle(
          this.db
            .from('brand_applications')
            .update({
              status: decision,
              reviewed_by: callerId,
              reviewed_at: this.now().toISOString(),
              review_note: (opts?.reviewNote ?? '').trim().slice(0, 2000) || null,
              minted_brand_id: decision === 'approved' ? (opts?.mintedBrandId ?? null) : null,
            })
            .eq('id', id)
            .eq('status', 'pending')
            .select(BRAND_APPLICATION_COLS),
        );
        if (!row) {
          const existing = await this._maybeSingle(
            this.db.from('brand_applications').select('id,status').eq('id', id),
          );
          throw existing
            ? new WearStoreError('application_not_open', 'This application was already decided.')
            : new WearStoreError('application_not_found', `Unknown application ${id}.`);
        }
        return mapBrandApplication(row);
      },
    };
  }

  /** `wear.brand_eligibility()` (mig 162, SECDEF): self-or-moderator guarded. */
  private async _brandEligibility(userId: ConnectId): Promise<BrandEligibility> {
    const data = await this._rpcRow('brand_eligibility', { p_user: userId });
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          concepts_posted: number;
          concepts_claimed: number;
          actioned_reports: number;
          eligible: boolean;
        }
      | undefined;
    if (!row) throw new WearStoreError('rpc_error', 'brand_eligibility returned no row.');
    return {
      eligible: row.eligible,
      conceptsPosted: row.concepts_posted,
      conceptsClaimed: row.concepts_claimed,
      actionedReports: row.actioned_reports,
      conceptsPostedRequired: BRAND_ELIGIBILITY_MIN_CONCEPTS_POSTED,
      conceptsClaimedRequired: BRAND_ELIGIBILITY_MIN_CONCEPTS_CLAIMED,
    };
  }

  private _roles(): RoleRepo {
    return {
      getOwn: async (userId) => this._getOwnRole(userId),
    };
  }

  // ── Notifications (mig 159) ───────────────────────────────────────────────
  // Read + mark-read only; rows are produced by the DB triggers. RLS scopes
  // every query to the caller's own rows, so the explicit `recipient_id` filters
  // are belt-and-braces (and let markAll/count run without an extra round-trip).
  private _notifications(): NotificationRepo {
    return {
      list: async (userId, params) =>
        this._pageFrom(
          this.db
            .from('notifications')
            .select(NOTIFICATION_COLS)
            .eq('recipient_id', userId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
          params,
          mapNotification,
        ),
      unreadCount: async (userId) =>
        this._count(
          this.db
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_id', userId)
            .is('read_at', null),
        ),
      markRead: async (userId, ids) => {
        if (!ids.length) return 0;
        const rows = await this._many(
          this.db
            .from('notifications')
            .update({ read_at: this.now().toISOString() })
            .eq('recipient_id', userId)
            .is('read_at', null)
            .in('id', [...ids])
            .select('id'),
        );
        return rows.length;
      },
      markAllRead: async (userId) => {
        const rows = await this._many(
          this.db
            .from('notifications')
            .update({ read_at: this.now().toISOString() })
            .eq('recipient_id', userId)
            .is('read_at', null)
            .select('id'),
        );
        return rows.length;
      },
    };
  }

  /** Caller's mig-145 platform role (user_roles is self-SELECT under RLS). */
  private async _getOwnRole(userId: ConnectId): Promise<WearPlatformRole | null> {
    const row = await this._maybeSingle(
      this.db.from('user_roles').select('role').eq('user_id', userId),
    );
    return (row?.role as WearPlatformRole | undefined) ?? null;
  }

  /** Load a proposal and require the caller to own its brand (clean errors). */
  private async _requireOwnedProposal(
    proposalId: string,
    callerId: ConnectId,
  ): Promise<ProposalRow> {
    const row = await this._maybeSingle(
      this.db.from('concept_proposals').select(PROPOSAL_COLS).eq('id', proposalId),
    );
    if (!row) {
      throw new WearStoreError('proposal_not_found', `Unknown proposal ${proposalId}.`);
    }
    const brand = await this._maybeSingle(
      this.db.from('brands').select('id,owner_user_id').eq('id', row.brand_id),
    );
    if (!brand || (brand as { owner_user_id: string }).owner_user_id !== callerId) {
      throw new WearStoreError('forbidden', 'Only the proposing brand can do this.');
    }
    return row;
  }

  private async _attachConceptMedia(
    concepts: readonly Concept[],
  ): Promise<ConceptWithMedia[]> {
    if (!concepts.length) return [];
    const media = await this._many(
      this.db
        .from('concept_media')
        .select(CONCEPT_MEDIA_COLS)
        .in(
          'concept_id',
          concepts.map((c) => c.id),
        ),
    );
    const byConcept = new Map<string, ConceptMediaRow[]>();
    for (const m of media) {
      const list = byConcept.get(m.concept_id) ?? [];
      list.push(m);
      byConcept.set(m.concept_id, list);
    }
    return concepts.map((c) => ({
      concept: c,
      media: (byConcept.get(c.id) ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(mapConceptMedia),
    }));
  }

  // ── Shared internals ──────────────────────────────────────────────────────
  private async _isBlockedEither(a: ConnectId, b: ConnectId): Promise<boolean> {
    const { data, error } = await this.db.rpc('is_blocked_either', { p_a: a, p_b: b });
    if (error) throw wrap(error);
    return Boolean(data);
  }

  private async _followedPlusSelf(viewerId: ConnectId): Promise<ConnectId[]> {
    const rows = await this._many(
      this.db.from('follows').select('target_id').eq('actor_id', viewerId),
    );
    return [viewerId, ...rows.map((r) => r.target_id)];
  }

  private async _seenStoryIds(viewerId: ConnectId): Promise<Set<string>> {
    const rows = await this._many(
      this.db.from('story_views').select('story_id').eq('viewer_id', viewerId),
    );
    return new Set(rows.map((r) => r.story_id));
  }

  private async _attachMedia(posts: readonly PostRow[]): Promise<PostWithMedia[]> {
    if (!posts.length) return [];
    const media = await this._many(
      this.db
        .from('post_media')
        .select(MEDIA_COLS)
        .in(
          'post_id',
          posts.map((p) => p.id),
        ),
    );
    const byPost = new Map<string, MediaRow[]>();
    for (const m of media) {
      const list = byPost.get(m.post_id) ?? [];
      list.push(m);
      byPost.set(m.post_id, list);
    }
    return posts.map((p) => ({
      post: mapPost(p),
      media: (byPost.get(p.id) ?? []).sort((a, b) => a.order_index - b.order_index).map(mapMedia),
    }));
  }

  // ── PostgREST plumbing ────────────────────────────────────────────────────
  private async _maybeSingle<T>(
    builder: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  ): Promise<T | null> {
    const { data, error } = await builder;
    if (error) throw wrap(error);
    return data && data.length ? data[0]! : null;
  }

  private async _single<T>(
    builder: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  ): Promise<T> {
    const row = await this._maybeSingle(builder);
    if (!row) throw new WearStoreError('not_found', 'Expected exactly one row.');
    return row;
  }

  private async _many<T>(
    builder: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  ): Promise<T[]> {
    const { data, error } = await builder;
    if (error) throw wrap(error);
    return data ?? [];
  }

  private async _run(builder: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
    const { error } = await builder;
    if (error) throw wrap(error);
  }

  private async _count(
    builder: PromiseLike<{ count: number | null; error: PostgrestError | null }>,
  ): Promise<number> {
    const { count, error } = await builder;
    if (error) throw wrap(error);
    return count ?? 0;
  }

  private async _rpcRow(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw mapRpcError(error);
    return data;
  }

  private async _pageFrom<TRow, TOut>(
    builder: PostgrestPageBuilder<TRow>,
    params: PageParams | undefined,
    map: (row: TRow) => TOut,
  ): Promise<Page<TOut>> {
    const start = parseCursor(params?.cursor);
    const limit = clamp(params?.limit ?? 20, 1, 100);
    const { data, error } = await builder.range(start, start + limit); // limit+1 rows
    if (error) throw wrap(error);
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(map);
    return { items, nextCursor: hasMore ? String(start + limit) : null };
  }
}

/**
 * Build a request-scoped `SupabaseWearStore` from an already `wear`-scoped
 * server client (see `createWearServerClient`). Kept separate so callers that
 * degrade to `MemoryWearStore` when Supabase is unconfigured own that branch.
 */
export function createSupabaseWearStore(
  client: SupabaseClient,
  options?: { readonly now?: () => Date },
): SupabaseWearStore {
  return new SupabaseWearStore(client, options);
}

// ── Types + mappers (snake_case row → camelCase domain) ─────────────────────
type PostgrestPageBuilder<TRow> = PromiseLike<{
  data: TRow[] | null;
  error: PostgrestError | null;
}> & {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: TRow[] | null; error: PostgrestError | null }>;
};

const USER_COLS = 'id,handle,display_name,avatar_url,created_at,updated_at';
const BRAND_COLS =
  'id,slug,name,tagline,website_url,logo_url,verified,owner_user_id,connect_contributor_id,created_at,updated_at';
const PROFILE_COLS = 'user_id,bio,visibility,verified,created_at,updated_at';
const SETTINGS_COLS = 'user_id,display_name_override,profile_visibility,created_at,updated_at';
const POST_COLS = 'id,author_id,brand_id,body,tagged_product_ids,concept_id,created_at,updated_at';
const MEDIA_COLS = 'id,post_id,url,kind,alt_text,order_index';
const COMMENT_COLS = 'id,post_id,author_id,parent_comment_id,body,created_at';
const SAVE_COLLECTION_COLS = 'id,owner_id,name,created_at';
const STORY_COLS =
  'id,author_id,brand_id,media_url,media_kind,caption,audience,created_at,expires_at';
const STORY_REACTION_COLS = 'id,story_id,user_id,kind,created_at';
const HIGHLIGHT_COLS = 'id,owner_id,name,cover_url,created_at';
const CONVERSATION_COLS = 'id,kind,name,created_by,created_at,updated_at';
const MEMBER_COLS = 'conversation_id,user_id,joined_at,last_read_at,muted_until,request_state,role';
const MESSAGE_COLS = 'id,conversation_id,author_id,body,created_at,deleted_at';
const REPORT_COLS =
  'id,reporter_id,subject_kind,subject_id,reason,note,status,handled_by,handled_at,created_at';
const NOTIFICATION_COLS =
  'id,recipient_id,type,actor_id,concept_id,brand_id,data,read_at,created_at';
// Mig 157 — Concepts marketplace
const CONCEPT_COLS = 'id,creator_id,title,description,status,created_at,updated_at';
const CONCEPT_MEDIA_COLS = 'id,concept_id,url,kind,alt_text,order_index';
const UPVOTE_COLS = 'concept_id,user_id,created_at';
// Mig 161 — community engagement on Concepts
const CONCEPT_COMMENT_COLS = 'id,concept_id,author_id,parent_comment_id,body,created_at';
const SHARE_COLS = 'concept_id,user_id,channel,created_at';
const CONCEPT_STATUS_COLS = 'id,concept_id,creator_id,reason,created_at,expires_at';
const PROPOSAL_COLS =
  'id,concept_id,brand_id,status,mockup_urls,materials,est_unit_price,moq,est_turnaround_days,note,created_at,updated_at';
const CLAIM_COLS =
  'id,concept_id,brand_id,proposal_id,status,awarded_by,awarded_at,attribution_public,attribution_note,created_at,updated_at';
const STATUS_LOG_COLS = 'id,concept_id,claim_id,status,note,created_by,created_at';
const ROYALTY_COLS =
  'id,claim_id,kind,pct,threshold_units,status,proof_url,proof_note,proof_submitted_at,closed_at,closed_by,closed_note,created_at,updated_at';
const CONVERSION_COLS =
  'id,claim_id,status,proposed_by,proposed_at,responded_by,responded_at,created_at,updated_at';
const VERIFICATION_COLS =
  'brand_id,status,note,requested_by,requested_at,reviewed_by,reviewed_at,review_note,created_at,updated_at';
// Mig 162 — Become-a-Brand applications
const BRAND_APPLICATION_COLS =
  'id,applicant_id,status,brand_name,bio,socials,support_email,contact_number,delivery_options,agree_terms,agree_conduct,agree_fees,reviewed_by,reviewed_at,review_note,minted_brand_id,created_at,updated_at';

const FOR_YOU_CANDIDATES = 500;
const TRENDING_CANDIDATES = 1000;

interface UserRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
interface BrandRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  website_url: string | null;
  logo_url: string | null;
  verified: boolean;
  owner_user_id: string;
  connect_contributor_id: string | null;
  created_at: string;
  updated_at: string;
}
interface ProfileRow {
  user_id: string;
  bio: string | null;
  visibility: Profile['visibility'];
  verified: boolean;
  created_at: string;
  updated_at: string;
}
interface SettingsRow {
  user_id: string;
  display_name_override: string | null;
  profile_visibility: UserSettings['profileVisibility'];
  created_at: string;
  updated_at: string;
}
interface PostRow {
  id: string;
  author_id: string;
  brand_id: string | null;
  body: string;
  tagged_product_ids: string[] | null;
  concept_id: string | null;
  created_at: string;
  updated_at: string;
}
interface MediaRow {
  id: string;
  post_id: string;
  url: string;
  kind: PostMedia['kind'];
  alt_text: string | null;
  order_index: number;
}
interface LikeRow {
  post_id: string;
  user_id: string;
  created_at: string;
}
interface CommentLikeRow {
  comment_id: string;
  user_id: string;
  created_at: string;
}
interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
}
interface SaveCollectionRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}
interface StoryRow {
  id: string;
  author_id: string;
  brand_id: string | null;
  media_url: string | null;
  media_kind: Story['mediaKind'];
  caption: string | null;
  audience: Story['audience'];
  created_at: string;
  expires_at: string;
}
interface StoryViewRow {
  story_id: string;
  viewer_id: string;
  viewed_at: string;
}
interface StoryReactionRow {
  id: string;
  story_id: string;
  user_id: string;
  kind: StoryReactionKind;
  created_at: string;
}
interface HighlightRow {
  id: string;
  owner_id: string;
  name: string;
  cover_url: string | null;
  created_at: string;
}
interface ConversationRow {
  id: string;
  kind: Conversation['kind'];
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
interface MemberRow {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  muted_until: string | null;
  request_state: ConversationRequestState;
  role: ConversationMember['role'];
}
interface MessageRow {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
}
interface ReportRow {
  id: string;
  reporter_id: string;
  subject_kind: Report['subjectKind'];
  subject_id: string;
  reason: Report['reason'];
  note: string | null;
  status: Report['status'];
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}
// Mig 159 — notifications
interface NotificationRow {
  id: string;
  recipient_id: string;
  type: NotificationType;
  actor_id: string | null;
  concept_id: string | null;
  brand_id: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}
// Mig 157 — Concepts marketplace rows
interface ConceptRow {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  status: ConceptStage;
  created_at: string;
  updated_at: string;
}
interface ConceptMediaRow {
  id: string;
  concept_id: string;
  url: string;
  kind: ConceptMedia['kind'];
  alt_text: string | null;
  order_index: number;
}
interface UpvoteRow {
  concept_id: string;
  user_id: string;
  created_at: string;
}
interface ConceptCommentRow {
  id: string;
  concept_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
}
interface ShareRow {
  concept_id: string;
  user_id: string;
  channel: ConceptShare['channel'];
  created_at: string;
}
interface ConceptStatusRow {
  id: string;
  concept_id: string;
  creator_id: string;
  reason: ConceptStatus['reason'];
  created_at: string;
  expires_at: string;
}
interface ProposalRow {
  id: string;
  concept_id: string;
  brand_id: string;
  status: ConceptProposalStatus;
  mockup_urls: string[] | null;
  materials: string | null;
  est_unit_price: number | string | null;
  moq: number | null;
  est_turnaround_days: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
interface ClaimRow {
  id: string;
  concept_id: string;
  brand_id: string;
  proposal_id: string | null;
  status: ConceptClaimStatus;
  awarded_by: string | null;
  awarded_at: string;
  attribution_public: boolean;
  attribution_note: string | null;
  created_at: string;
  updated_at: string;
}
interface StatusLogRow {
  id: string;
  concept_id: string;
  claim_id: string;
  status: ConceptStage;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
interface RoyaltyRow {
  id: string;
  claim_id: string;
  kind: RoyaltyObligation['kind'];
  pct: number | string;
  threshold_units: number | null;
  status: RoyaltyObligation['status'];
  proof_url: string | null;
  proof_note: string | null;
  proof_submitted_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  closed_note: string | null;
  created_at: string;
  updated_at: string;
}
interface ConversionRow {
  id: string;
  claim_id: string;
  status: CatalogueConversionStatus;
  proposed_by: string | null;
  proposed_at: string;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}
interface VerificationRow {
  brand_id: string;
  status: BrandVerificationStatus;
  note: string | null;
  requested_by: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}
interface BrandApplicationRow {
  id: string;
  applicant_id: string;
  status: BrandApplicationStatus;
  brand_name: string;
  bio: string | null;
  socials: Record<string, string> | null;
  support_email: string;
  contact_number: string;
  delivery_options: string;
  agree_terms: boolean;
  agree_conduct: boolean;
  agree_fees: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  minted_brand_id: string | null;
  created_at: string;
  updated_at: string;
}

const mapUser = (r: UserRow): WearUser => ({
  id: r.id,
  handle: r.handle,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapBrand = (r: BrandRow): WearBrand => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  tagline: r.tagline,
  websiteUrl: r.website_url,
  logoUrl: r.logo_url,
  verified: r.verified,
  ownerUserId: r.owner_user_id,
  connectContributorId: r.connect_contributor_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapBrandApplication = (r: BrandApplicationRow): BrandApplication => ({
  id: r.id,
  applicantId: r.applicant_id,
  status: r.status,
  brandName: r.brand_name,
  bio: r.bio,
  socials: r.socials ?? {},
  supportEmail: r.support_email,
  contactNumber: r.contact_number,
  deliveryOptions: r.delivery_options,
  agreeTerms: r.agree_terms,
  agreeConduct: r.agree_conduct,
  agreeFees: r.agree_fees,
  reviewedBy: r.reviewed_by,
  reviewedAt: r.reviewed_at,
  reviewNote: r.review_note,
  mintedBrandId: r.minted_brand_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapProfile = (r: ProfileRow): Profile => ({
  userId: r.user_id,
  bio: r.bio,
  visibility: r.visibility,
  verified: r.verified,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapSettings = (r: SettingsRow): UserSettings => ({
  userId: r.user_id,
  displayNameOverride: r.display_name_override,
  profileVisibility: r.profile_visibility,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapFollow = (r: { actor_id: string; target_id: string; created_at: string }): FollowEdge => ({
  actorId: r.actor_id,
  targetId: r.target_id,
  createdAt: r.created_at,
});
const mapPost = (r: PostRow): Post => ({
  id: r.id,
  authorId: r.author_id,
  brandId: r.brand_id,
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  taggedProductIds: r.tagged_product_ids ?? [],
  conceptId: r.concept_id,
});
const mapMedia = (r: MediaRow): PostMedia => ({
  id: r.id,
  postId: r.post_id,
  url: r.url,
  kind: r.kind,
  altText: r.alt_text,
  orderIndex: r.order_index,
});
const mapLike = (r: LikeRow): LikeEdge => ({
  postId: r.post_id,
  userId: r.user_id,
  createdAt: r.created_at,
});
const mapCommentLike = (r: CommentLikeRow) => ({
  commentId: r.comment_id,
  userId: r.user_id,
  createdAt: r.created_at,
});
const mapComment = (r: CommentRow): Comment => ({
  id: r.id,
  postId: r.post_id,
  authorId: r.author_id,
  parentCommentId: r.parent_comment_id,
  body: r.body,
  createdAt: r.created_at,
});
const mapSaveCollection = (r: SaveCollectionRow, postIds: string[]): SaveCollection => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  createdAt: r.created_at,
  postIds,
});
const mapStory = (r: StoryRow): Story => ({
  id: r.id,
  authorId: r.author_id,
  brandId: r.brand_id,
  mediaUrl: r.media_url,
  mediaKind: r.media_kind,
  caption: r.caption,
  audience: r.audience,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});
const mapStoryView = (r: StoryViewRow): StoryView => ({
  storyId: r.story_id,
  viewerId: r.viewer_id,
  viewedAt: r.viewed_at,
});
const mapStoryReaction = (r: StoryReactionRow): StoryReaction => ({
  id: r.id,
  storyId: r.story_id,
  userId: r.user_id,
  kind: r.kind,
  createdAt: r.created_at,
});
const mapHighlight = (r: HighlightRow, storyIds: string[]): StoryHighlight => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  coverUrl: r.cover_url,
  createdAt: r.created_at,
  storyIds,
});
const mapConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  createdById: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapMember = (r: MemberRow): ConversationMember => ({
  conversationId: r.conversation_id,
  userId: r.user_id,
  joinedAt: r.joined_at,
  lastReadAt: r.last_read_at,
  mutedUntil: r.muted_until,
  requestState: r.request_state,
  role: r.role,
});
const mapMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
});
const mapBlock = (r: { actor_id: string; target_id: string; created_at: string }): BlockEdge => ({
  actorId: r.actor_id,
  targetId: r.target_id,
  createdAt: r.created_at,
});
const mapReport = (r: ReportRow): Report => ({
  id: r.id,
  reporterId: r.reporter_id,
  subjectKind: r.subject_kind,
  subjectId: r.subject_id,
  reason: r.reason,
  note: r.note,
  status: r.status,
  handledBy: r.handled_by,
  handledAt: r.handled_at,
  createdAt: r.created_at,
});
const mapNotification = (r: NotificationRow): WearNotification => ({
  id: r.id,
  recipientId: r.recipient_id,
  type: r.type,
  actorId: r.actor_id,
  conceptId: r.concept_id,
  brandId: r.brand_id,
  data: r.data ?? {},
  readAt: r.read_at,
  createdAt: r.created_at,
});
// Mig 157 — Concepts marketplace mappers
const mapConcept = (r: ConceptRow): Concept => ({
  id: r.id,
  creatorId: r.creator_id,
  title: r.title,
  description: r.description,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapConceptMedia = (r: ConceptMediaRow): ConceptMedia => ({
  id: r.id,
  conceptId: r.concept_id,
  url: r.url,
  kind: r.kind,
  altText: r.alt_text,
  orderIndex: r.order_index,
});
const mapUpvote = (r: UpvoteRow): ConceptUpvote => ({
  conceptId: r.concept_id,
  userId: r.user_id,
  createdAt: r.created_at,
});
const mapConceptComment = (r: ConceptCommentRow): ConceptComment => ({
  id: r.id,
  conceptId: r.concept_id,
  authorId: r.author_id,
  parentCommentId: r.parent_comment_id,
  body: r.body,
  createdAt: r.created_at,
});
const mapShare = (r: ShareRow): ConceptShare => ({
  conceptId: r.concept_id,
  userId: r.user_id,
  channel: r.channel,
  createdAt: r.created_at,
});
const mapConceptStatus = (r: ConceptStatusRow): ConceptStatus => ({
  id: r.id,
  conceptId: r.concept_id,
  creatorId: r.creator_id,
  reason: r.reason,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});
const mapProposal = (r: ProposalRow): ConceptProposal => ({
  id: r.id,
  conceptId: r.concept_id,
  brandId: r.brand_id,
  status: r.status,
  mockupUrls: r.mockup_urls ?? [],
  materials: r.materials,
  estUnitPrice: toNum(r.est_unit_price),
  moq: r.moq,
  estTurnaroundDays: r.est_turnaround_days,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapClaim = (r: ClaimRow): ConceptClaim => ({
  id: r.id,
  conceptId: r.concept_id,
  brandId: r.brand_id,
  proposalId: r.proposal_id,
  status: r.status,
  awardedBy: r.awarded_by,
  awardedAt: r.awarded_at,
  attributionPublic: r.attribution_public,
  attributionNote: r.attribution_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapStatusLog = (r: StatusLogRow): ConceptStatusLogEntry => ({
  id: r.id,
  conceptId: r.concept_id,
  claimId: r.claim_id,
  status: r.status,
  note: r.note,
  createdBy: r.created_by,
  createdAt: r.created_at,
});
const mapRoyalty = (r: RoyaltyRow): RoyaltyObligation => ({
  id: r.id,
  claimId: r.claim_id,
  kind: r.kind,
  pct: toNum(r.pct) ?? 0,
  thresholdUnits: r.threshold_units,
  status: r.status,
  proofUrl: r.proof_url,
  proofNote: r.proof_note,
  proofSubmittedAt: r.proof_submitted_at,
  closedAt: r.closed_at,
  closedBy: r.closed_by,
  closedNote: r.closed_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapConversion = (r: ConversionRow): CatalogueConversion => ({
  id: r.id,
  claimId: r.claim_id,
  status: r.status,
  proposedBy: r.proposed_by,
  proposedAt: r.proposed_at,
  respondedBy: r.responded_by,
  respondedAt: r.responded_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapVerification = (r: VerificationRow): BrandVerification => ({
  brandId: r.brand_id,
  status: r.status,
  note: r.note,
  requestedBy: r.requested_by,
  requestedAt: r.requested_at,
  reviewedBy: r.reviewed_by,
  reviewedAt: r.reviewed_at,
  reviewNote: r.review_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** PostgREST serialises `numeric` as a JSON number, but be tolerant of strings. */
function toNum(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

// ── small helpers ───────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseCursor(cursor?: string): number {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  if (Number.isNaN(start) || start < 0) {
    throw new WearStoreError('invalid_cursor', `Invalid cursor: ${cursor ?? ''}`);
  }
  return start;
}

/** Escape PostgREST `like`/`ilike` wildcards in user input. */
function escapeLike(input: string): string {
  return input.replace(/[%_,()]/g, (c) => `\\${c}`);
}

function wrap(error: PostgrestError): WearStoreError {
  return new WearStoreError(error.code || 'db_error', error.message);
}

/**
 * Map a mig-162 `brand_applications` CHECK violation (23514) onto the same
 * `WearStoreError` codes `MemoryWearStore.submit` throws, keyed by the
 * violated constraint's name in the Postgres error message.
 */
const APPLICATION_CHECK_CODES: readonly (readonly [string, string, string])[] = [
  ['brand_name', 'invalid_brand_name', 'Brand name must be 2–80 characters.'],
  ['support_email', 'invalid_support_email', 'A valid support email is required.'],
  ['contact_number', 'invalid_contact_number', 'A contact number (7–32 characters) is required.'],
  ['delivery_options', 'invalid_delivery_options', 'Describe your delivery options (3–500 characters).'],
  ['bio', 'invalid_bio', 'Bio must be at most 500 characters.'],
  ['socials', 'invalid_socials', 'Social links are too long.'],
  ['agreements', 'agreements_required', 'The Ts&Cs, Code of Conduct, and platform-fee agreements are all required.'],
];

function mapApplicationCheckError(error: PostgrestError): WearStoreError {
  const msg = error.message || '';
  for (const [needle, code, human] of APPLICATION_CHECK_CODES) {
    if (msg.includes(needle)) return new WearStoreError(code, human);
  }
  return new WearStoreError('invalid_application', msg || 'The application is invalid.');
}

/**
 * Map a SECDEF-RPC `raise exception … using errcode` to the same
 * `WearStoreError` codes MemoryWearStore throws, so callers are storage-agnostic.
 */
function mapRpcError(error: PostgrestError): WearStoreError {
  const msg = error.message || '';
  const known = [
    'unauthorized',
    'self_dm',
    'forbidden',
    'empty_group_name',
    'group_too_small',
    // Mig 157 marketplace RPC raise messages (checked before generic codes so
    // callers see the same WearStoreError codes MemoryWearStore throws).
    'proposal_not_found',
    'concept_not_found',
    'concept_not_open',
    'proposal_not_open',
    'brand_not_verified',
    'no_active_claim',
    'invalid_stage',
    'stage_not_forward',
    'claim_not_active',
    'not_released',
    'conversion_already_open',
    'conversion_not_open',
    'not_milestone',
    'already_closed',
    'obligation_not_found',
    'proof_url_required',
  ];
  const code = known.find((k) => msg.includes(k)) ?? error.code ?? 'rpc_error';
  return new WearStoreError(code, msg);
}
