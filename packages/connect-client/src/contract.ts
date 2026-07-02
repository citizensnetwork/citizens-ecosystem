/**
 * Citizens Connect integration contract — RECONCILED (ADR-0002 amendment,
 * 2026-07-02).
 *
 * Citizens Wear consumes Citizens Connect as the ecosystem's public commons:
 * the Kingdom contributor directory and categories, served by Connect's real
 * `GET /api/v1/*` surface. Identity comes from the shared Supabase project
 * (one `auth.users`, ADR-0007) and users/brands/products are Wear-owned
 * (`wear.*`, `@citizens-wear/db`) — the Phase-1 assumption that Connect was
 * an identity + clothing-catalog service (users/brands/products/OIDC) never
 * matched Connect's real shape and that surface was retired together with
 * the RSC frontend (Step 3 D-removal + E).
 *
 * Design notes:
 *   - All identifiers are opaque strings (Connect-owned).
 *   - All methods are async and may throw `ConnectError`.
 *   - Results are read-only snapshots; Wear never mutates Connect data.
 */

/** Opaque identifier issued by Citizens Connect. */
export type ConnectId = string;

export type IsoDateTime = string;

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface PageParams {
  readonly cursor?: string;
  readonly limit?: number;
}

/**
 * A Kingdom Contributor — Connect's real first-class organisation record
 * (ministry / organization / business), served by `GET /api/v1/contributors`.
 *
 * Wire mapping (Connect snake_case → Wear camelCase):
 *   full_name→name · contributor_slug→slug · contributor_kind→kind ·
 *   logo_url→logoUrl · avatar_url→avatarUrl · etc.
 */
export type ConnectContributorKind = 'ministry' | 'organization' | 'business';

export interface ConnectContributor {
  readonly id: ConnectId;
  readonly slug: string;
  readonly name: string;
  readonly kind: ConnectContributorKind | null;
  readonly bio: string | null;
  readonly avatarUrl: string | null;
  readonly logoUrl: string | null;
  readonly websiteUrl: string | null;
  readonly instagramHandle: string | null;
  readonly facebookUrl: string | null;
  readonly tiktokHandle: string | null;
  readonly youtubeUrl: string | null;
  readonly physicalAddress: string | null;
  readonly physicalLatitude: number | null;
  readonly physicalLongitude: number | null;
  readonly createdAt: IsoDateTime;
}

/**
 * Detail view returned by `GET /api/v1/contributors/{slug}` — the contributor
 * plus its public activity counts. Connect also returns the raw event/place
 * lists; Wear deliberately does not surface those yet (no consumer), so the
 * contract stays minimal until a screen needs them.
 */
export interface ConnectContributorProfile {
  readonly contributor: ConnectContributor;
  readonly followerCount: number;
  readonly eventCount: number;
  readonly placeCount: number;
}

/** An event/place category served by `GET /api/v1/categories`. */
export type CategoryAppliesTo = 'events' | 'places' | 'both';

export interface ConnectCategory {
  readonly id: ConnectId;
  readonly name: string;
  readonly slug: string;
  readonly emoji: string;
  readonly color: string;
  readonly appliesTo: CategoryAppliesTo;
  readonly sortOrder: number;
  /** Count of currently-published public events in this category. */
  readonly eventCount: number;
}

/**
 * Directory of Kingdom Contributors over Connect's REAL `/api/v1` surface.
 *
 * Connect paginates this endpoint with `limit`/`offset` (not cursors). The
 * contract keeps the uniform `Page`/`PageParams` shape: a cursor here is the
 * stringified next offset (exactly the convention the mock's paginator has
 * always used), so callers page identically across every directory.
 */
export interface ContributorListParams extends PageParams {
  /** Filter by contributor kind. */
  readonly kind?: ConnectContributorKind;
  /** Case-insensitive substring match on name / bio. */
  readonly query?: string;
}

export interface ContributorDirectory {
  list(params?: ContributorListParams): Promise<Page<ConnectContributor>>;
  getBySlug(slug: string): Promise<ConnectContributorProfile | null>;
}

/**
 * Directory of Connect categories. Not paginated: Connect hard-caps the
 * list (≤30 rows) and serves it in `sort_order`.
 */
export interface CategoryListParams {
  readonly appliesTo?: CategoryAppliesTo;
}

export interface CategoryDirectory {
  list(params?: CategoryListParams): Promise<readonly ConnectCategory[]>;
}

/** The capability surface Wear consumes from Connect. */
export interface ConnectClient {
  /** Connect's REAL `/api/v1` commons (contributors directory). */
  readonly contributors: ContributorDirectory;
  /** Connect's REAL `/api/v1` commons (categories). */
  readonly categories: CategoryDirectory;
  /** Lightweight probe used by `/api/connect/status`. */
  healthCheck(): Promise<ConnectStatus>;
}

export interface ConnectStatus {
  readonly ok: boolean;
  readonly mode: 'mock' | 'live';
  readonly checkedAt: IsoDateTime;
  readonly message?: string;
}

/** All errors thrown by a `ConnectClient` should be `ConnectError` instances. */
export class ConnectError extends Error {
  public readonly code: string;
  public readonly status: number | undefined;

  public constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'ConnectError';
    this.code = code;
    this.status = status;
  }
}
