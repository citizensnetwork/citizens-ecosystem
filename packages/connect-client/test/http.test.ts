import { describe, expect, it } from 'vitest';
import { ConnectError, HttpConnectClient, createConnectClient } from '../src/index';

function makeFetch(
  handlers: Array<(url: string, init: RequestInit) => Response | Promise<Response>>,
): typeof fetch {
  let call = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const handler = handlers[call++];
    if (!handler) throw new Error(`Unexpected extra call to ${url}`);
    return handler(url, init ?? {});
  }) as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const wireContributor = {
  id: 'uuid-1',
  full_name: 'Bread of Life Ministries',
  role: 'contributor',
  contributor_kind: 'ministry',
  contributor_slug: 'bread-of-life-ministries',
  bio: 'Feeding body and soul.',
  avatar_url: null,
  logo_url: 'https://cdn.example/logo.png',
  website_url: 'https://example.test',
  instagram_handle: 'breadoflife',
  facebook_url: null,
  tiktok_handle: null,
  youtube_url: null,
  physical_address: '12 Harvest Rd',
  physical_latitude: -25.7,
  physical_longitude: 28.2,
  created_at: '2026-01-15T08:00:00.000Z',
};

describe('HttpConnectClient', () => {
  it('requires a baseUrl', () => {
    expect(() => new HttpConnectClient({ baseUrl: '' })).toThrowError(ConnectError);
  });

  it('lists contributors from /api/v1/contributors, mapping snake_case and offset pagination', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      apiKey: 'cck_live_key',
      fetch: makeFetch([
        (url, init) => {
          const u = new URL(url);
          expect(u.pathname).toBe('/api/v1/contributors');
          expect(u.searchParams.get('kind')).toBe('ministry');
          expect(u.searchParams.get('q')).toBe('bread');
          expect(u.searchParams.get('limit')).toBe('1');
          expect(u.searchParams.get('offset')).toBeNull();
          // Connect's key resolver reads X-API-Key (the retired client sent a
          // header Connect never recognised — ADR-0002 amendment).
          expect((init.headers as Record<string, string>)['x-api-key']).toBe('cck_live_key');
          return jsonResponse(200, {
            data: [wireContributor],
            meta: { count: 3, limit: 1, offset: 0 },
          });
        },
        (url) => {
          expect(new URL(url).searchParams.get('offset')).toBe('1');
          return jsonResponse(200, {
            data: [wireContributor],
            meta: { count: 3, limit: 1, offset: 1 },
          });
        },
      ]),
    });

    const page = await client.contributors.list({ kind: 'ministry', query: 'bread', limit: 1 });
    expect(page.items[0]).toMatchObject({
      id: 'uuid-1',
      name: 'Bread of Life Ministries',
      slug: 'bread-of-life-ministries',
      kind: 'ministry',
      logoUrl: 'https://cdn.example/logo.png',
      physicalLatitude: -25.7,
    });
    expect(page.nextCursor).toBe('1');

    const next = await client.contributors.list({ limit: 1, cursor: page.nextCursor! });
    expect(next.nextCursor).toBe('2');

    await expect(client.contributors.list({ cursor: 'bogus' })).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
  });

  it('resolves contributor profiles from /api/v1/contributors/{slug} with counts, 404 → null', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([
        (url) => {
          expect(url).toBe('https://connect.example/api/v1/contributors/kingdom-threads');
          return jsonResponse(200, {
            data: {
              profile: {
                ...wireContributor,
                id: 'uuid-2',
                full_name: 'Kingdom Threads',
                contributor_kind: 'business',
                contributor_slug: 'kingdom-threads',
              },
              upcoming_events: [],
              past_events: [],
              places: [],
              counts: { followers: 7, events_total: 2, places_total: 1 },
            },
            meta: { generated_at: '2026-07-02T00:00:00.000Z' },
          });
        },
        () => jsonResponse(404, { error: 'Contributor not found' }),
      ]),
    });

    const profile = await client.contributors.getBySlug('Kingdom-Threads');
    expect(profile).toMatchObject({
      contributor: { id: 'uuid-2', name: 'Kingdom Threads', kind: 'business' },
      followerCount: 7,
      eventCount: 2,
      placeCount: 1,
    });
    expect(await client.contributors.getBySlug('missing')).toBeNull();
  });

  it('lists categories from /api/v1/categories, mapping applies_to/sort_order/event_count', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([
        (url) => {
          const u = new URL(url);
          expect(u.pathname).toBe('/api/v1/categories');
          expect(u.searchParams.get('applies_to')).toBe('events');
          return jsonResponse(200, {
            data: [
              {
                id: 'uuid-3',
                name: 'Youth',
                slug: 'youth',
                emoji: '🌟',
                color: '#f59e0b',
                applies_to: 'events',
                sort_order: 2,
                event_count: 5,
              },
            ],
            meta: { count: 1 },
          });
        },
      ]),
    });

    const categories = await client.categories.list({ appliesTo: 'events' });
    expect(categories).toEqual([
      {
        id: 'uuid-3',
        name: 'Youth',
        slug: 'youth',
        emoji: '🌟',
        color: '#f59e0b',
        appliesTo: 'events',
        sortOrder: 2,
        eventCount: 5,
      },
    ]);
  });

  it('raises ConnectError with upstream code/message on non-2xx', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([() => jsonResponse(429, { error: 'Too many requests' })]),
    });
    await expect(client.categories.list()).rejects.toMatchObject({
      name: 'ConnectError',
      code: 'Too many requests',
      status: 429,
    });
  });

  it('wraps network errors as ConnectError', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: (async () => {
        throw new Error('boom');
      }) as unknown as typeof fetch,
    });
    await expect(client.contributors.getBySlug('x')).rejects.toBeInstanceOf(ConnectError);
  });

  it('healthCheck probes /api/v1/categories (Connect has no /health) and degrades gracefully', async () => {
    const now = new Date('2026-07-02T00:00:00.000Z');
    const ok = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      now: () => now,
      fetch: makeFetch([
        (url) => {
          const u = new URL(url);
          expect(u.pathname).toBe('/api/v1/categories');
          expect(u.searchParams.get('applies_to')).toBe('both');
          return jsonResponse(200, { data: [], meta: { count: 0 } });
        },
      ]),
    });
    const okStatus = await ok.healthCheck();
    expect(okStatus).toMatchObject({ ok: true, mode: 'live', checkedAt: now.toISOString() });

    const bad = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      now: () => now,
      fetch: (async () => {
        throw new Error('down');
      }) as unknown as typeof fetch,
    });
    const badStatus = await bad.healthCheck();
    expect(badStatus.ok).toBe(false);
    expect(badStatus.mode).toBe('live');
  });
});

describe('createConnectClient', () => {
  it('returns a MockConnectClient by default', async () => {
    const client = createConnectClient();
    const status = await client.healthCheck();
    expect(status.mode).toBe('mock');
  });

  it('returns an HttpConnectClient when mode=live and a baseUrl is provided', async () => {
    const client = createConnectClient({
      mode: 'live',
      baseUrl: 'https://connect.example',
      fetch: makeFetch([() => jsonResponse(200, { data: [] })]),
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });
    const status = await client.healthCheck();
    expect(status.mode).toBe('live');
    expect(status.ok).toBe(true);
  });

  it('falls back to mock when mode=live but no baseUrl is configured', async () => {
    const client = createConnectClient({ mode: 'live' });
    expect((await client.healthCheck()).mode).toBe('mock');
  });
});
