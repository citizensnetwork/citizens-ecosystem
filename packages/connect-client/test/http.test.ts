import { describe, expect, it, vi } from 'vitest';
import { ConnectError, HttpConnectClient, createConnectClient, fixtureUsers } from '../src/index';

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

describe('HttpConnectClient', () => {
  it('verifies tokens via POST /v1/auth/verify with the bearer header', async () => {
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['authorization']).toBe('Bearer tkn');
      expect(headers['x-api-key']).toBe('svc-key');
      return jsonResponse(200, {
        userId: 'usr_001',
        issuedAt: '2026-04-18T00:00:00.000Z',
        expiresAt: '2026-05-18T00:00:00.000Z',
        scopes: ['profile'],
      });
    }) as unknown as typeof fetch;

    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example/',
      apiKey: 'svc-key',
      fetch: fetchSpy,
    });
    const session = await client.auth.verifyToken('tkn');
    expect(session.userId).toBe('usr_001');
    expect(session.scopes).toEqual(['profile']);
  });

  it('maps 404 responses to null for *_Nullable lookups', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([() => jsonResponse(404, { code: 'not_found', message: 'no' })]),
    });
    expect(await client.users.getById('missing')).toBeNull();
  });

  it('encodes handles and slugs safely', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([
        (url) => {
          expect(url).toBe('https://connect.example/v1/users/by-handle/hannah');
          return jsonResponse(200, fixtureUsers[0]);
        },
      ]),
    });
    const user = await client.users.getByHandle('HANNAH');
    expect(user?.id).toBe('usr_001');
  });

  it('raises ConnectError with upstream code/message on non-2xx', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([() => jsonResponse(418, { code: 'teapot', message: 'short and stout' })]),
    });
    await expect(client.brands.listAll()).rejects.toMatchObject({
      name: 'ConnectError',
      code: 'teapot',
      status: 418,
    });
  });

  it('wraps network errors as ConnectError', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: (async () => {
        throw new Error('boom');
      }) as unknown as typeof fetch,
    });
    await expect(client.products.getById('p1')).rejects.toBeInstanceOf(ConnectError);
  });

  it('reports live mode in healthCheck and degrades gracefully on failure', async () => {
    const now = new Date('2026-04-18T00:00:00.000Z');
    const ok = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      now: () => now,
      fetch: makeFetch([() => jsonResponse(200, { ok: true, message: 'up' })]),
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

  it('fans subscribed handlers out when events.publish is invoked', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([]),
    });
    const handler = vi.fn();
    client.events.subscribe(handler);
    await client.events.publish({
      type: 'product.stock_changed',
      productId: 'prd_001',
      stockState: 'low',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lists contributors from /api/v1/contributors, mapping snake_case and offset pagination', async () => {
    const wire = {
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
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([
        (url) => {
          const u = new URL(url);
          expect(u.pathname).toBe('/api/v1/contributors');
          expect(u.searchParams.get('kind')).toBe('ministry');
          expect(u.searchParams.get('q')).toBe('bread');
          expect(u.searchParams.get('limit')).toBe('1');
          expect(u.searchParams.get('offset')).toBeNull();
          return jsonResponse(200, { data: [wire], meta: { count: 3, limit: 1, offset: 0 } });
        },
        (url) => {
          expect(new URL(url).searchParams.get('offset')).toBe('1');
          return jsonResponse(200, { data: [wire], meta: { count: 3, limit: 1, offset: 1 } });
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
                id: 'uuid-2',
                full_name: 'Kingdom Threads',
                contributor_kind: 'business',
                contributor_slug: 'kingdom-threads',
                bio: null,
                avatar_url: null,
                logo_url: null,
                website_url: null,
                instagram_handle: null,
                facebook_url: null,
                tiktok_handle: null,
                youtube_url: null,
                physical_address: null,
                physical_latitude: null,
                physical_longitude: null,
                created_at: '2026-02-20T10:30:00.000Z',
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

  it('searches brands and products against /v1/{brands,products}/search', async () => {
    const client = new HttpConnectClient({
      baseUrl: 'https://connect.example',
      fetch: makeFetch([
        (url) => {
          expect(url).toContain('/v1/brands/search?q=salt&limit=5');
          return jsonResponse(200, { items: [], nextCursor: null });
        },
        (url) => {
          expect(url).toContain('/v1/products/search?q=hoodie');
          return jsonResponse(200, { items: [], nextCursor: null });
        },
      ]),
    });
    await client.brands.search('salt', { limit: 5 });
    await client.products.search('hoodie');
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
      fetch: makeFetch([() => jsonResponse(200, { ok: true })]),
      now: () => new Date('2026-04-18T00:00:00.000Z'),
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
