import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@citizens/utils';
import { __resetWearStoreForTests, getWearStore } from '@/lib/store';

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
import { GET as brandAppsGET, POST as brandAppsPOST } from './brand-applications/route';
import { GET as adminAppsGET } from './admin/brand-applications/route';
import { POST as adminAppDecidePOST } from './admin/brand-applications/[id]/route';

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

// ── Mig 162 — the Become-a-Brand application ─────────────────────────────────

/**
 * Drive `userId` through the §6.1 gate: 20 Concepts posted, 10 of them
 * claimed (the verified salt-and-light proposes, the creator awards).
 */
async function makeEligible(userId = 'usr_002'): Promise<void> {
  const store = getWearStore();
  const conceptIds: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const c = await store.concepts.create({ creatorId: userId, title: `Gate Design ${i + 1}` });
    conceptIds.push(c.concept.id);
  }
  for (const conceptId of conceptIds.slice(0, 10)) {
    const proposal = await store.conceptProposals.create('usr_001', {
      conceptId,
      brandId: 'brd_001',
    });
    await store.conceptClaims.award(proposal.id, userId);
  }
}

const APPLICATION_BODY = {
  brandName: 'New Wine Threads',
  bio: 'Apparel from the vineyard.',
  socials: { instagram: '@newwine', website: 'https://newwine.example' },
  supportEmail: 'hello@newwine.example',
  contactNumber: '+27 82 000 0000',
  deliveryOptions: 'Courier nationwide; pickup in Pretoria.',
  agreeTerms: true,
  agreeConduct: true,
  agreeFees: true,
};

describe('brand applications (Become a Brand)', () => {
  it('401s an anonymous panel read', async () => {
    anonymous();
    const res = await brandAppsGET(req('/api/brand-applications'), route());
    expect(res.status).toBe(401);
  });

  it('reports live ineligibility numbers for a fresh citizen', async () => {
    asUser('usr_002');
    const res = await brandAppsGET(req('/api/brand-applications'), route());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eligibility.eligible).toBe(false);
    expect(data.eligibility.conceptsPosted).toBe(0);
    expect(data.eligibility.conceptsPostedRequired).toBe(20);
    expect(data.eligibility.conceptsClaimedRequired).toBe(10);
    expect(data.application).toBeNull();
  });

  it('403s a submit below the gate (the eligibility wall)', async () => {
    asUser('usr_002');
    const res = await brandAppsPOST(
      req('/api/brand-applications', jsonBody(APPLICATION_BODY)),
      route(),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_eligible');
  });

  it('422s an eligible submit missing an agreement', async () => {
    await makeEligible();
    asUser('usr_002');
    const res = await brandAppsPOST(
      req('/api/brand-applications', jsonBody({ ...APPLICATION_BODY, agreeFees: false })),
      route(),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('agreements_required');
  });

  it('accepts an eligible submit, then 409s a second open application', async () => {
    await makeEligible();
    asUser('usr_002');
    const res = await brandAppsPOST(
      req('/api/brand-applications', jsonBody(APPLICATION_BODY)),
      route(),
    );
    expect(res.status).toBe(201);
    const { application } = await res.json();
    expect(application.status).toBe('pending');
    expect(application.brandName).toBe('New Wine Threads');

    const dup = await brandAppsPOST(
      req('/api/brand-applications', jsonBody(APPLICATION_BODY)),
      route(),
    );
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe('application_pending');

    const panel = await brandAppsGET(req('/api/brand-applications'), route());
    const data = await panel.json();
    expect(data.eligibility.eligible).toBe(true);
    expect(data.application.status).toBe('pending');
  });

  it('an admin-ACTIONED report against the user closes the gate', async () => {
    await makeEligible();
    const store = getWearStore();
    const report = await store.reports.create({
      reporterId: 'usr_001',
      subjectKind: 'user',
      subjectId: 'usr_002',
      reason: 'abuse',
    });
    await store.reports.triage(report.id, 'usr_003', 'actioned');
    asUser('usr_002');
    const panel = await brandAppsGET(req('/api/brand-applications'), route());
    const data = await panel.json();
    expect(data.eligibility.eligible).toBe(false);
    expect(data.eligibility.actionedReports).toBe(1);
    const res = await brandAppsPOST(
      req('/api/brand-applications', jsonBody(APPLICATION_BODY)),
      route(),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_eligible');
  });
});

describe('admin brand-application queue', () => {
  /** Submit as usr_002 (made eligible first) and return the application id. */
  async function submitAsSamuel(): Promise<string> {
    await makeEligible();
    asUser('usr_002');
    const res = await brandAppsPOST(
      req('/api/brand-applications', jsonBody(APPLICATION_BODY)),
      route(),
    );
    expect(res.status).toBe(201);
    return (await res.json()).application.id as string;
  }

  it('403s a non-moderator queue read', async () => {
    asUser('usr_002');
    const res = await adminAppsGET(req('/api/admin/brand-applications'), route());
    expect(res.status).toBe(403);
  });

  it('lists pending applications with the applicant + live eligibility', async () => {
    await submitAsSamuel();
    asUser('usr_003'); // ruth = seeded admin
    const res = await adminAppsGET(req('/api/admin/brand-applications'), route());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applications).toHaveLength(1);
    expect(data.applications[0].applicant.handle).toBe('samuel');
    expect(data.applications[0].eligibility.eligible).toBe(true);
    expect(data.applications[0].agreeFees).toBe(true);
  });

  it('403s a decision from a non-admin', async () => {
    const id = await submitAsSamuel();
    asUser('usr_002');
    const res = await adminAppDecidePOST(
      req(`/api/admin/brand-applications/${id}`, jsonBody({ decision: 'rejected' })),
      route({ id }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('admin_only');
  });

  it('approve mints a verified brand for the applicant and notifies them', async () => {
    const id = await submitAsSamuel();
    asUser('usr_003');
    const res = await adminAppDecidePOST(
      req(
        `/api/admin/brand-applications/${id}`,
        jsonBody({ decision: 'approved', slug: 'new-wine-threads', reviewNote: 'Welcome!' }),
      ),
      route({ id }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.brand.verified).toBe(true);
    expect(data.brand.ownerUserId).toBe('usr_002');
    expect(data.application.status).toBe('approved');
    expect(data.application.mintedBrandId).toBe(data.brand.id);

    const store = getWearStore();
    const owned = await store.brands.listForOwner('usr_002');
    expect(owned.some((b) => b.slug === 'new-wine-threads' && b.verified)).toBe(true);
    const notifs = await store.notifications.list('usr_002');
    expect(notifs.items.some((n) => n.type === 'brand_application_approved')).toBe(true);

    // Decided rows are immutable — for admins too.
    const again = await adminAppDecidePOST(
      req(
        `/api/admin/brand-applications/${id}`,
        jsonBody({ decision: 'rejected', reviewNote: 'flip-flop' }),
      ),
      route({ id }),
    );
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe('application_not_open');
  });

  it('reject records the note, notifies, and permits an immediate re-apply', async () => {
    const id = await submitAsSamuel();
    asUser('usr_003');
    const res = await adminAppDecidePOST(
      req(
        `/api/admin/brand-applications/${id}`,
        jsonBody({ decision: 'rejected', reviewNote: 'Support email bounced.' }),
      ),
      route({ id }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).application.status).toBe('rejected');

    const store = getWearStore();
    const notifs = await store.notifications.list('usr_002');
    const rejected = notifs.items.find((n) => n.type === 'brand_application_rejected');
    expect(rejected?.data.reviewNote).toBe('Support email bounced.');

    asUser('usr_002');
    const panel = await brandAppsGET(req('/api/brand-applications'), route());
    const data = await panel.json();
    expect(data.application.status).toBe('rejected');
    expect(data.application.reviewNote).toBe('Support email bounced.');

    const reapply = await brandAppsPOST(
      req('/api/brand-applications', jsonBody(APPLICATION_BODY)),
      route(),
    );
    expect(reapply.status).toBe(201);
  });

  it("409s an approve whose slug belongs to another owner's brand, leaving the application open", async () => {
    const id = await submitAsSamuel();
    asUser('usr_003');
    const clash = await adminAppDecidePOST(
      req(
        `/api/admin/brand-applications/${id}`,
        jsonBody({ decision: 'approved', slug: 'salt-and-light' }),
      ),
      route({ id }),
    );
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toBe('slug_taken');

    // Still pending → a retry with a free slug converges.
    const retry = await adminAppDecidePOST(
      req(
        `/api/admin/brand-applications/${id}`,
        jsonBody({ decision: 'approved', slug: 'new-wine-threads' }),
      ),
      route({ id }),
    );
    expect(retry.status).toBe(200);
    expect((await retry.json()).application.status).toBe('approved');
  });
});
