import { describe, expect, it } from 'vitest';
import {
  ConnectError,
  MockConnectClient,
  fixtureCategories,
  fixtureContributors,
} from '../src/index';
import type { ConnectClient } from '../src/index';

/**
 * Contract tests. These are written against the `ConnectClient` interface,
 * not against `MockConnectClient` specifically — the HTTP client must satisfy
 * exactly the same expectations (see http.test.ts for its wire mapping).
 */

function makeClient(): ConnectClient {
  return new MockConnectClient();
}

describe('ContributorDirectory', () => {
  it('lists contributors ordered by name', async () => {
    const client = makeClient();
    const page = await client.contributors.list();
    expect(page.items.map((c) => c.slug)).toEqual([
      'bread-of-life-ministries',
      'kingdom-threads',
      'united-hands',
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('filters by kind and by query (name or bio, case-insensitive)', async () => {
    const client = makeClient();
    expect((await client.contributors.list({ kind: 'business' })).items.map((c) => c.id)).toEqual([
      'ctr_002',
    ]);
    expect(
      (await client.contributors.list({ query: 'VOLUNTEERING' })).items.map((c) => c.id),
    ).toEqual(['ctr_003']);
    expect(
      (await client.contributors.list({ kind: 'ministry', query: 'apparel' })).items,
    ).toHaveLength(0);
  });

  it('paginates with offset-style cursors', async () => {
    const client = makeClient();
    const first = await client.contributors.list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe('2');
    const rest = await client.contributors.list({ limit: 2, cursor: first.nextCursor! });
    expect(rest.items.map((c) => c.id)).toEqual(['ctr_003']);
    expect(rest.nextCursor).toBeNull();
  });

  it('rejects invalid cursors', async () => {
    const client = makeClient();
    await expect(client.contributors.list({ cursor: 'not-a-number' })).rejects.toBeInstanceOf(
      ConnectError,
    );
  });

  it('resolves a contributor profile by slug (case-insensitive) with counts', async () => {
    const client = makeClient();
    const profile = await client.contributors.getBySlug('KINGDOM-THREADS');
    expect(profile?.contributor.name).toBe('Kingdom Threads');
    expect(profile?.followerCount).toBe(0);
    expect(await client.contributors.getBySlug('missing')).toBeNull();
  });
});

describe('CategoryDirectory', () => {
  it('lists all categories in sort order', async () => {
    const client = makeClient();
    const categories = await client.categories.list();
    expect(categories.map((c) => c.slug)).toEqual(['church-service', 'youth', 'coffee-spots']);
  });

  it('filters by appliesTo, including "both" rows for events/places', async () => {
    const client = makeClient();
    expect((await client.categories.list({ appliesTo: 'events' })).map((c) => c.slug)).toEqual([
      'church-service',
      'youth',
    ]);
    expect((await client.categories.list({ appliesTo: 'places' })).map((c) => c.slug)).toEqual([
      'church-service',
      'coffee-spots',
    ]);
    expect((await client.categories.list({ appliesTo: 'both' })).map((c) => c.slug)).toEqual([
      'church-service',
    ]);
  });
});

describe('healthCheck', () => {
  it('returns ok/mock with a deterministic timestamp when `now` is overridden', async () => {
    const fixedNow = new Date('2026-07-02T00:00:00.000Z');
    const client = new MockConnectClient({ now: () => fixedNow });
    const status = await client.healthCheck();
    expect(status.ok).toBe(true);
    expect(status.mode).toBe('mock');
    expect(status.checkedAt).toBe(fixedNow.toISOString());
  });
});

describe('custom fixtures', () => {
  it('accepts caller-supplied contributors and categories', async () => {
    const client = new MockConnectClient({
      contributors: [
        { ...fixtureContributors[0]!, id: 'ctr_x', name: 'Zion Works', slug: 'zion-works' },
      ],
      categories: [fixtureCategories[1]!],
    });
    expect((await client.contributors.list()).items.map((c) => c.id)).toEqual(['ctr_x']);
    expect((await client.categories.list()).map((c) => c.slug)).toEqual(['youth']);
  });

  it('exposes stable contributor and category fixtures', () => {
    expect(fixtureContributors).toHaveLength(3);
    expect(fixtureCategories).toHaveLength(3);
  });
});
