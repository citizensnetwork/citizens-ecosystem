import type { ConnectCategory, ConnectContributor } from '../contract';

/**
 * Development/test fixtures for the Citizens Connect contract.
 *
 * These are intentionally small, hand-written, and stable so that tests and
 * the local dev environment stay deterministic.
 */

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
