import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@citizens/utils';
import { __resetWearStoreForTests } from '@/lib/store';

/**
 * Route-handler tests for the `/api/*` surface, driven against the seeded
 * in-memory store (no Supabase env → getRouteContext falls back to memory).
 * `getSession` is mocked so we can exercise both anonymous and authed paths.
 */
const mockSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: () => mockSession() }));

import { GET as meGET, PATCH as mePATCH } from './me/route';
import { POST as hydratePOST } from './me/hydrate/route';
import { GET as savesGET } from './me/saves/route';
import { GET as trendingGET } from './hashtags/trending/route';
import { GET as ecosystemGET } from './ecosystem/contributors/route';
import { GET as usersGET } from './users/route';
import { GET as userGET } from './users/[handle]/route';
import { GET as brandsGET, POST as brandsPOST } from './brands/route';
import { GET as brandGET } from './brands/[slug]/route';
import { POST as postsPOST } from './posts/route';
import { POST as savePOST } from './posts/[id]/save/route';
import { GET as feedGET } from './feed/route';
import { POST as followsPOST } from './follows/route';

const req = (url: string, init?: RequestInit): Request =>
  new Request(`http://localhost${url}`, init);
const route = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const jsonBody = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function asUser(id: string): void {
  mockSession.mockResolvedValue({
    user: { id, handle: 'seed', displayName: 'Seed', email: null, avatarUrl: null, createdAt: '' },
    session: { userId: id, issuedAt: '', expiresAt: '', scopes: [] },
  });
}
function anonymous(): void {
  mockSession.mockResolvedValue(null);
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  __resetWearStoreForTests();
  resetRateLimitStore(); // every handler now passes the blanket gate
  mockSession.mockReset();
});

describe('GET /api/me', () => {
  it('401s an anonymous caller', async () => {
    anonymous();
    const res = await meGET(req('/api/me'), route());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns the mirror row, profile and counts for a signed-in user', async () => {
    asUser('usr_001');
    const res = await meGET(req('/api/me'), route());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.handle).toBe('hannah');
    expect(data.counts.followers).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/users', () => {
  it('searches the identity mirror', async () => {
    anonymous();
    const res = await usersGET(req('/api/users?q=han'), route());
    const data = await res.json();
    expect(data.items.map((u: { id: string }) => u.id)).toContain('usr_001');
  });

  it('returns a user profile with owned brands', async () => {
    anonymous();
    const res = await userGET(req('/api/users/hannah'), route({ handle: 'hannah' }));
    const data = await res.json();
    expect(data.user.handle).toBe('hannah');
    expect(data.brands.map((b: { slug: string }) => b.slug)).toContain('salt-and-light');
  });

  it('404s an unknown handle', async () => {
    anonymous();
    const res = await userGET(req('/api/users/nobody'), route({ handle: 'nobody' }));
    expect(res.status).toBe(404);
  });
});

describe('brands', () => {
  it('lists seeded brands', async () => {
    anonymous();
    const res = await brandsGET(req('/api/brands'), route());
    expect((await res.json()).items).toHaveLength(2);
  });

  it('returns a brand with owner and posts', async () => {
    anonymous();
    const res = await brandGET(
      req('/api/brands/salt-and-light'),
      route({ slug: 'salt-and-light' }),
    );
    const data = await res.json();
    expect(data.brand.slug).toBe('salt-and-light');
    expect(data.owner.handle).toBe('hannah');
  });

  it('admin mints a brand (self-serve creation is retired — mig 160)', async () => {
    asUser('usr_003'); // ruth = seeded admin
    const res = await brandsPOST(
      req('/api/brands', jsonBody({ slug: 'kingdom-threads', name: 'Kingdom Threads' })),
      route(),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).ownerUserId).toBe('usr_003');
  });

  it('admin may mint a brand owned by an approved applicant', async () => {
    asUser('usr_003');
    const res = await brandsPOST(
      req(
        '/api/brands',
        jsonBody({ slug: 'anchor-crown', name: 'Anchor & Crown', ownerId: 'usr_002' }),
      ),
      route(),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).ownerUserId).toBe('usr_002');
  });

  it('403s a non-admin brand create', async () => {
    asUser('usr_002');
    const res = await brandsPOST(
      req('/api/brands', jsonBody({ slug: 'kingdom-threads', name: 'Kingdom Threads' })),
      route(),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('admin_only');
  });

  it('422s an admin brand create with no name', async () => {
    asUser('usr_003');
    const res = await brandsPOST(req('/api/brands', jsonBody({ slug: 'x' })), route());
    expect(res.status).toBe(422);
  });
});

describe('posts + feed', () => {
  it('creates a post as a verified brand and hydrates its author', async () => {
    asUser('usr_001'); // owns the verified brand salt-and-light
    const res = await postsPOST(
      req('/api/posts', jsonBody({ body: 'Wear the Kingdom', brandSlug: 'salt-and-light' })),
      route(),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).author.handle).toBe('hannah');
  });

  it('422s an empty post', async () => {
    asUser('usr_001');
    const res = await postsPOST(
      req('/api/posts', jsonBody({ body: '   ', brandSlug: 'salt-and-light' })),
      route(),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('empty_post');
  });

  it('403s a post with no brand (posts are brand-tier — mig 160)', async () => {
    asUser('usr_001');
    const res = await postsPOST(req('/api/posts', jsonBody({ body: 'As myself' })), route());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('brand_required');
  });

  it('403s a post as an unverified brand', async () => {
    asUser('usr_002'); // owns cornerstone-co (verified: false)
    const res = await postsPOST(
      req('/api/posts', jsonBody({ body: 'Too soon', brandSlug: 'cornerstone-co' })),
      route(),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('brand_not_verified');
  });

  it('403s a post as a brand you do not own', async () => {
    asUser('usr_002');
    const res = await postsPOST(
      req('/api/posts', jsonBody({ body: 'Not mine', brandSlug: 'salt-and-light' })),
      route(),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_brand_owner');
  });

  it('returns the signed-in user home feed', async () => {
    asUser('usr_001');
    const res = await feedGET(req('/api/feed?mode=chronological'), route());
    const data = await res.json();
    expect(data.mode).toBe('chronological');
    expect(Array.isArray(data.items)).toBe(true);
  });

  it('feed items carry engagement counts and viewer flags', async () => {
    asUser('usr_001');
    await postsPOST(
      req('/api/posts', jsonBody({ body: 'Count me', brandSlug: 'salt-and-light' })),
      route(),
    );
    const res = await feedGET(req('/api/feed?mode=chronological'), route());
    const item = (await res.json()).items[0];
    expect(item).toMatchObject({
      likeCount: expect.any(Number),
      commentCount: expect.any(Number),
      viewerLiked: expect.any(Boolean),
      viewerSaved: expect.any(Boolean),
    });
  });

  it('accepts https media urls and drops unsafe ones', async () => {
    asUser('usr_001');
    const res = await postsPOST(
      req(
        '/api/posts',
        jsonBody({
          body: 'With media',
          brandSlug: 'salt-and-light',
          mediaUrls: ['https://images.example/tee.jpg', 'javascript:alert(1)'],
        }),
      ),
      route(),
    );
    expect(res.status).toBe(201);
    const post = await res.json();
    expect(post.media).toHaveLength(1);
    expect(post.media[0].url).toBe('https://images.example/tee.jpg');
  });
});

describe('POST /api/me/hydrate (mirror hydration)', () => {
  it('401s an anonymous caller', async () => {
    anonymous();
    const res = await hydratePOST(req('/api/me/hydrate', { method: 'POST' }), route());
    expect(res.status).toBe(401);
  });

  it('keeps an existing mirror handle while refreshing the display name', async () => {
    asUser('usr_001'); // seeded as hannah; session identity says handle=seed, name=Seed
    const res = await hydratePOST(req('/api/me/hydrate', { method: 'POST' }), route());
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.handle).toBe('hannah'); // established handle is stable
    expect(user.displayName).toBe('Seed'); // refreshed from the session
  });

  it('creates the mirror row on first sign-in', async () => {
    asUser('usr_brand_new');
    const res = await hydratePOST(req('/api/me/hydrate', { method: 'POST' }), route());
    expect(res.status).toBe(200);
    expect((await res.json()).user.handle).toBe('seed');
    const found = await usersGET(req('/api/users?q=seed'), route());
    expect((await found.json()).items.map((u: { id: string }) => u.id)).toContain('usr_brand_new');
  });
});

describe('PATCH /api/me', () => {
  it('updates bio and visibility', async () => {
    asUser('usr_001');
    const res = await mePATCH(
      req('/api/me', {
        ...jsonBody({ bio: 'For His glory.', visibility: 'private' }),
        method: 'PATCH',
      }),
      route(),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile.bio).toBe('For His glory.');
    expect(data.profile.visibility).toBe('private');
    expect(data.settings.profileVisibility).toBe('private');
  });

  it('includes owned brands in GET /api/me', async () => {
    asUser('usr_001');
    const res = await meGET(req('/api/me'), route());
    const data = await res.json();
    expect(data.brands.map((b: { slug: string }) => b.slug)).toContain('salt-and-light');
  });
});

describe('GET /api/me/saves (boards)', () => {
  it('returns the default collection with hydrated saved posts', async () => {
    asUser('usr_001');
    const created = await postsPOST(
      req('/api/posts', jsonBody({ body: 'Saved grail', brandSlug: 'salt-and-light' })),
      route(),
    );
    const post = await created.json();
    await savePOST(req(`/api/posts/${post.id}/save`, { method: 'POST' }), route({ id: post.id }));

    const res = await savesGET(req('/api/me/saves'), route());
    expect(res.status).toBe(200);
    const { collections } = await res.json();
    expect(collections.length).toBeGreaterThanOrEqual(1);
    const all = collections.flatMap((c: { posts: { id: string }[] }) => c.posts.map((p) => p.id));
    expect(all).toContain(post.id);
  });
});

describe('GET /api/hashtags/trending', () => {
  it('surfaces hashtags from recent posts', async () => {
    asUser('usr_001');
    await postsPOST(
      req('/api/posts', jsonBody({ body: 'New drop #FaithOverFear', brandSlug: 'salt-and-light' })),
      route(),
    );
    anonymous();
    const res = await trendingGET(req('/api/hashtags/trending?limit=5'), route());
    expect(res.status).toBe(200);
    const { tags } = await res.json();
    expect(tags.map((t: { tag: string }) => t.tag.toLowerCase())).toContain('faithoverfear');
  });
});

describe('GET /api/users/:handle posts', () => {
  it('includes the author post grid', async () => {
    asUser('usr_001');
    await postsPOST(
      req('/api/posts', jsonBody({ body: 'Grid post', brandSlug: 'salt-and-light' })),
      route(),
    );
    const res = await userGET(req('/api/users/hannah'), route({ handle: 'hannah' }));
    const data = await res.json();
    expect(data.posts.items.map((p: { body: string }) => p.body)).toContain('Grid post');
  });
});

describe('GET /api/ecosystem/contributors', () => {
  it('lists the Kingdom contributor directory through connect-client', async () => {
    anonymous();
    const res = await ecosystemGET(req('/api/ecosystem/contributors'), route());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.map((c: { slug: string }) => c.slug)).toContain('bread-of-life-ministries');
  });

  it('filters by kind', async () => {
    anonymous();
    const res = await ecosystemGET(req('/api/ecosystem/contributors?kind=business'), route());
    const data = await res.json();
    expect(data.items.map((c: { slug: string }) => c.slug)).toEqual(['kingdom-threads']);
  });
});

describe('follows', () => {
  it('follows a user by handle', async () => {
    asUser('usr_001');
    // usr_001 unfollows then re-follows samuel to assert the toggle.
    const res = await followsPOST(req('/api/follows', jsonBody({ handle: 'samuel' })), route());
    expect(res.status).toBe(200);
    expect((await res.json()).following).toBe(true);
  });

  it('401s an anonymous follow', async () => {
    anonymous();
    const res = await followsPOST(req('/api/follows', jsonBody({ handle: 'samuel' })), route());
    expect(res.status).toBe(401);
  });
});
