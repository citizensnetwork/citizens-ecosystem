import type {
  CategoryDirectory,
  ConnectCategory,
  ConnectClient,
  ConnectContributor,
  ConnectStatus,
  ContributorDirectory,
  Page,
  PageParams,
} from '../contract';
import { ConnectError } from '../contract';
import { fixtureCategories, fixtureContributors } from '../fixtures/index';

/**
 * In-memory implementation of the Citizens Connect contract.
 *
 * Used by local dev, unit/integration tests, and Wear deployments running
 * without a `CONNECT_API_BASE_URL`. Mirrors the live `/api/v1` semantics:
 * name-ascending contributor ordering, kind/query filters, and `applies_to`
 * widening to `both` for categories.
 */

const DEFAULT_LIMIT = 20;

function paginate<T>(items: readonly T[], params?: PageParams): Page<T> {
  const limit = Math.max(1, Math.min(100, params?.limit ?? DEFAULT_LIMIT));
  const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
  if (Number.isNaN(start) || start < 0) {
    throw new ConnectError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
  }
  const slice = items.slice(start, start + limit);
  const nextIndex = start + slice.length;
  return {
    items: slice,
    nextCursor: nextIndex < items.length ? String(nextIndex) : null,
  };
}

export interface MockConnectClientOptions {
  readonly contributors?: readonly ConnectContributor[];
  readonly categories?: readonly ConnectCategory[];
  /** Override `Date.now` (useful for deterministic tests). */
  readonly now?: () => Date;
}

export class MockConnectClient implements ConnectClient {
  public readonly contributors: ContributorDirectory;
  public readonly categories: CategoryDirectory;

  private readonly _contributors: ConnectContributor[];
  private readonly _categories: ConnectCategory[];
  private readonly _now: () => Date;

  public constructor(options: MockConnectClientOptions = {}) {
    this._contributors = [...(options.contributors ?? fixtureContributors)];
    this._categories = [...(options.categories ?? fixtureCategories)];
    this._now = options.now ?? (() => new Date());

    this.contributors = {
      // Mirrors the live endpoint's semantics: kind filter is exact, `query`
      // is a case-insensitive substring match on name/bio, results are
      // ordered by name ascending.
      list: async (params) => {
        const q = (params?.query ?? '').trim().toLowerCase();
        let matches = this._contributors.filter((c) => {
          if (params?.kind && c.kind !== params.kind) return false;
          if (!q) return true;
          return (
            c.name.toLowerCase().includes(q) || (c.bio ?? '').toLowerCase().includes(q)
          );
        });
        matches = matches.slice().sort((a, b) => a.name.localeCompare(b.name));
        return paginate(matches, params);
      },
      getBySlug: async (slug) => {
        const contributor =
          this._contributors.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) ?? null;
        if (!contributor) return null;
        // The mock has no event/place/follow graph behind contributors, so
        // counts are deterministically zero (the live client maps Connect's
        // real `counts` block).
        return { contributor, followerCount: 0, eventCount: 0, placeCount: 0 };
      },
    };

    this.categories = {
      list: async (params) => {
        const applies = params?.appliesTo;
        const include =
          applies === 'events'
            ? ['events', 'both']
            : applies === 'places'
              ? ['places', 'both']
              : applies === 'both'
                ? ['both']
                : null;
        const matches = include
          ? this._categories.filter((c) => include.includes(c.appliesTo))
          : this._categories;
        return matches.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      },
    };
  }

  public async healthCheck(): Promise<ConnectStatus> {
    return {
      ok: true,
      mode: 'mock',
      checkedAt: this._now().toISOString(),
      message: 'MockConnectClient ready.',
    };
  }
}
