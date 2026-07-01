import type {
  ConnectBrand,
  ConnectCategory,
  ConnectContributor,
  ConnectProduct,
  ConnectSession,
  ConnectUser,
} from '../contract';

/**
 * Development/test fixtures for the Citizens Connect contract.
 *
 * These are intentionally small, hand-written, and stable so that tests and
 * the local dev environment stay deterministic.
 */

export const fixtureUsers: readonly ConnectUser[] = [
  {
    id: 'usr_001',
    handle: 'hannah',
    displayName: 'Hannah K.',
    email: 'hannah@example.test',
    avatarUrl: null,
    createdAt: '2026-01-10T12:00:00.000Z',
  },
  {
    id: 'usr_002',
    handle: 'samuel',
    displayName: 'Samuel O.',
    email: 'samuel@example.test',
    avatarUrl: null,
    createdAt: '2026-02-02T09:30:00.000Z',
  },
];

export const fixtureBrands: readonly ConnectBrand[] = [
  {
    id: 'brd_001',
    slug: 'salt-and-light',
    name: 'Salt & Light Apparel',
    tagline: 'Wear the Kingdom.',
    websiteUrl: 'https://example.test/salt-and-light',
    logoUrl: null,
    verified: true,
    ownerUserId: 'usr_001',
  },
  {
    id: 'brd_002',
    slug: 'cornerstone-co',
    name: 'Cornerstone Co.',
    tagline: 'Built on the Rock.',
    websiteUrl: null,
    logoUrl: null,
    verified: false,
    ownerUserId: 'usr_002',
  },
];

export const fixtureProducts: readonly ConnectProduct[] = [
  {
    id: 'prd_001',
    brandId: 'brd_001',
    title: 'Salt Tee — Ivory',
    description: 'Heavyweight organic cotton tee.',
    priceCents: 4500,
    currency: 'USD',
    imageUrls: [],
    stockState: 'in_stock',
    updatedAt: '2026-04-01T10:00:00.000Z',
  },
  {
    id: 'prd_002',
    brandId: 'brd_001',
    title: 'Light Hoodie — Gold',
    description: 'Midweight fleece hoodie.',
    priceCents: 8900,
    currency: 'USD',
    imageUrls: [],
    stockState: 'low',
    updatedAt: '2026-04-05T10:00:00.000Z',
  },
  {
    id: 'prd_003',
    brandId: 'brd_002',
    title: 'Cornerstone Cap — Black',
    description: 'Structured 6-panel cap.',
    priceCents: 3200,
    currency: 'USD',
    imageUrls: [],
    stockState: 'sold_out',
    updatedAt: '2026-03-20T10:00:00.000Z',
  },
];

/**
 * Kingdom Contributors as Connect's real `/api/v1/contributors` serves them
 * (mapped to camelCase). Kept in `full_name` ascending order — the order the
 * live endpoint guarantees — so pagination fixtures stay deterministic.
 */
export const fixtureContributors: readonly ConnectContributor[] = [
  {
    id: 'ctr_001',
    slug: 'bread-of-life-ministries',
    name: 'Bread of Life Ministries',
    kind: 'ministry',
    bio: 'Feeding body and soul across Pretoria east.',
    avatarUrl: null,
    logoUrl: 'https://example.test/logos/bread-of-life.png',
    websiteUrl: 'https://example.test/bread-of-life',
    instagramHandle: 'breadoflife',
    facebookUrl: null,
    tiktokHandle: null,
    youtubeUrl: null,
    physicalAddress: '12 Harvest Rd, Pretoria',
    physicalLatitude: -25.7479,
    physicalLongitude: 28.2293,
    createdAt: '2026-01-15T08:00:00.000Z',
  },
  {
    id: 'ctr_002',
    slug: 'kingdom-threads',
    name: 'Kingdom Threads',
    kind: 'business',
    bio: 'Ethical Christian apparel collective.',
    avatarUrl: null,
    logoUrl: null,
    websiteUrl: 'https://example.test/kingdom-threads',
    instagramHandle: null,
    facebookUrl: null,
    tiktokHandle: 'kingdomthreads',
    youtubeUrl: null,
    physicalAddress: null,
    physicalLatitude: null,
    physicalLongitude: null,
    createdAt: '2026-02-20T10:30:00.000Z',
  },
  {
    id: 'ctr_003',
    slug: 'united-hands',
    name: 'United Hands',
    kind: 'organization',
    bio: 'Cross-church volunteering network.',
    avatarUrl: null,
    logoUrl: null,
    websiteUrl: null,
    instagramHandle: null,
    facebookUrl: 'https://facebook.example/unitedhands',
    tiktokHandle: null,
    youtubeUrl: null,
    physicalAddress: null,
    physicalLatitude: null,
    physicalLongitude: null,
    createdAt: '2026-03-05T14:00:00.000Z',
  },
];

/** Categories as Connect's `/api/v1/categories` serves them, in sort order. */
export const fixtureCategories: readonly ConnectCategory[] = [
  {
    id: 'cat_001',
    name: 'Church Service',
    slug: 'church-service',
    emoji: '⛪',
    color: '#6366f1',
    appliesTo: 'both',
    sortOrder: 1,
    eventCount: 4,
  },
  {
    id: 'cat_002',
    name: 'Youth',
    slug: 'youth',
    emoji: '🌟',
    color: '#f59e0b',
    appliesTo: 'events',
    sortOrder: 2,
    eventCount: 2,
  },
  {
    id: 'cat_003',
    name: 'Coffee Spots',
    slug: 'coffee-spots',
    emoji: '☕',
    color: '#10b981',
    appliesTo: 'places',
    sortOrder: 3,
    eventCount: 0,
  },
];

export const fixtureSession: ConnectSession = {
  userId: 'usr_001',
  issuedAt: '2026-04-10T12:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  scopes: ['profile', 'brands.read', 'products.read'],
};

/** The token the `MockConnectClient` will accept in `verifyToken`. */
export const FIXTURE_VALID_TOKEN = 'mock-valid-token';
