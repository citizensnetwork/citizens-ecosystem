/**
 * Phase 4 server action tests.
 *
 * These mount the actions against the real `WearStore` + `MockConnectClient`
 * but mock the App Router runtime (`next/headers`, `next/navigation`,
 * `next/cache`). The goal is to lock the *authz* invariants in place:
 *   - Brand posts require Connect-verified brand ownership.
 *   - Likes/saves/comments require a session AND that the post is engageable.
 *   - Admin moderation rejects non-admin sessions.
 *   - Cart and brand-follow actions resolve ids server-side.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_ADMIN_TOKEN, FIXTURE_VALID_TOKEN } from '@citizens-wear/connect-client';

// ────────────────────────────────────────────────────────────────────────
// Mock the App Router runtime BEFORE importing the action module.
// ────────────────────────────────────────────────────────────────────────
const cookieJar = new Map<string, string>();
const revalidated: string[] = [];
const redirected: string[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (opts: { name: string; value: string } | string, value?: string) => {
      if (typeof opts === 'string' && typeof value === 'string') {
        cookieJar.set(opts, value);
      } else if (typeof opts === 'object') {
        cookieJar.set(opts.name, opts.value);
      }
    },
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    redirected.push(path);
    // Match Next's behaviour: redirect throws to halt the action.
    throw Object.assign(new Error(`NEXT_REDIRECT:${path}`), { digest: 'NEXT_REDIRECT' });
  },
  notFound: () => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
  },
}));

import {
  addComment,
  addToCart,
  createPost,
  followBrand,
  reportPost,
  resolveModeration,
  togglePostLike,
  togglePostSave,
  unfollowBrand,
} from './actions';
import { getWearStore } from './store';

function fd(entries: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const v of value) form.append(key, v);
    } else {
      form.set(key, value);
    }
  }
  return form;
}

async function expectRedirectsToSignIn(action: () => Promise<unknown>): Promise<void> {
  redirected.length = 0;
  await expect(action()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT' });
  expect(redirected).toContain('/sign-in');
}

beforeEach(() => {
  cookieJar.clear();
  revalidated.length = 0;
  redirected.length = 0;
});

afterEach(() => {
  cookieJar.clear();
});

describe('createPost', () => {
  it('redirects to sign-in when there is no session', async () => {
    await expectRedirectsToSignIn(() => createPost(fd({ caption: 'hello' })));
  });

  it('creates a citizen post for a signed-in user (no brandSlug)', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    redirected.length = 0;
    await expect(createPost(fd({ caption: 'walked in faith today' }))).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT',
    });
    // Final redirect is to /feed after publish.
    expect(redirected).toContain('/feed');

    const page = await getWearStore().posts.listForAuthor('usr_001', { limit: 50 });
    expect(page.items.some((p) => p.caption === 'walked in faith today')).toBe(true);
    const created = page.items.find((p) => p.caption === 'walked in faith today')!;
    expect(created.authorKind).toBe('citizen');
    expect(created.brandId).toBeNull();
  });

  it('rejects brand posts when the actor does not own the brand', async () => {
    // Sign in as @hannah (usr_001) — she owns brd_001 (salt-and-light), NOT
    // brd_002 (cornerstone-co).
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await createPost(
      fd({
        caption: 'spoof brand post',
        brandSlug: 'cornerstone-co',
      }),
    ).catch(() => {
      /* may redirect on success path; rejection just means we exited early */
    });

    const page = await getWearStore().posts.listForBrand('brd_002', { limit: 50 });
    expect(page.items.some((p) => p.caption === 'spoof brand post')).toBe(false);
  });

  it('drops product tags from a different brand than the post brand', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await createPost(
      fd({
        caption: 'mixed-brand tag attempt',
        brandSlug: 'salt-and-light',
        productId: ['prd_001', 'prd_003'], // prd_003 belongs to brd_002.
      }),
    ).catch(() => {
      /* redirect after publish */
    });

    const page = await getWearStore().posts.listForBrand('brd_001', { limit: 50 });
    const created = page.items.find((p) => p.caption === 'mixed-brand tag attempt')!;
    expect(created).toBeDefined();
    const tags = await getWearStore().posts.listProductTags(created.id);
    expect(tags.map((t) => t.productId)).toEqual(['prd_001']);
  });

  it('drops product tags on a citizen post when the actor does not own the source brand', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    // usr_001 (hannah) owns brd_001 only. prd_003 belongs to brd_002.
    await createPost(
      fd({
        caption: 'citizen tag attempt',
        productId: ['prd_001', 'prd_003'],
      }),
    ).catch(() => {
      /* redirect after publish */
    });
    const page = await getWearStore().posts.listForAuthor('usr_001', { limit: 50 });
    const created = page.items.find((p) => p.caption === 'citizen tag attempt')!;
    expect(created).toBeDefined();
    const tags = await getWearStore().posts.listProductTags(created.id);
    // Only prd_001 (which belongs to brd_001 — owned by hannah) survives.
    expect(tags.map((t) => t.productId)).toEqual(['prd_001']);
  });

  it('drops media URLs that are not http(s) or carry credentials', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await createPost(
      fd({
        caption: 'media-validation post',
        mediaUrl: [
          'https://example.test/ok.jpg',
          'javascript:alert(1)',
          'https://user:pw@example.test/withcreds.jpg',
        ],
        mediaAlt: ['ok', 'evil', 'creds'],
      }),
    ).catch(() => {
      /* redirect after publish */
    });

    const page = await getWearStore().posts.listForAuthor('usr_001', { limit: 50 });
    const created = page.items.find((p) => p.caption === 'media-validation post')!;
    expect(created).toBeDefined();
    const media = await getWearStore().posts.listMedia(created.id);
    expect(media.map((m) => m.url)).toEqual(['https://example.test/ok.jpg']);
  });
});

describe('togglePostLike / togglePostSave', () => {
  it('redirects unauthenticated callers to sign-in', async () => {
    await expectRedirectsToSignIn(() => togglePostLike(fd({ postId: 'post_001' })));
    await expectRedirectsToSignIn(() => togglePostSave(fd({ postId: 'post_001' })));
  });

  it('toggles like state idempotently for a published post', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    const store = getWearStore();
    const startedLiked = await store.postEngagement.isLiked('usr_001', 'post_003');
    await togglePostLike(fd({ postId: 'post_003' }));
    expect(await store.postEngagement.isLiked('usr_001', 'post_003')).toBe(!startedLiked);
    await togglePostLike(fd({ postId: 'post_003' }));
    expect(await store.postEngagement.isLiked('usr_001', 'post_003')).toBe(startedLiked);
  });
});

describe('addComment', () => {
  it('refuses empty bodies silently', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await addComment(fd({ postId: 'post_001', body: '   ' }));
    const comments = await getWearStore().comments.listForPost('post_001');
    expect(comments.items.every((c) => c.body !== '')).toBe(true);
  });

  it('creates a comment when the post is engageable', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await addComment(fd({ postId: 'post_001', body: 'amen, sister' }));
    const comments = await getWearStore().comments.listForPost('post_001');
    expect(comments.items.some((c) => c.body === 'amen, sister')).toBe(true);
  });
});

describe('addToCart', () => {
  it('ignores unknown productIds', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    const before = await getWearStore().cart.countForUser('usr_001');
    await addToCart(fd({ productId: 'prd_does_not_exist', quantity: '2' }));
    const after = await getWearStore().cart.countForUser('usr_001');
    expect(after).toBe(before);
  });

  it('ignores sold-out products', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    const before = await getWearStore().cart.countForUser('usr_001');
    await addToCart(fd({ productId: 'prd_003', quantity: '1' }));
    const after = await getWearStore().cart.countForUser('usr_001');
    expect(after).toBe(before);
  });

  it('adds purchasable products and clamps quantity to [1, 99]', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await getWearStore().cart.clear('usr_001');
    await addToCart(fd({ productId: 'prd_001', quantity: '500' }));
    const items = await getWearStore().cart.listForUser('usr_001');
    expect(items[0]?.productId).toBe('prd_001');
    expect(items[0]?.quantity).toBe(99);
  });

  it('only revalidates returnPaths that match the social-commerce allowlist', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await getWearStore().cart.clear('usr_001');
    revalidated.length = 0;

    // Allowed: literal /feed.
    await addToCart(fd({ productId: 'prd_001', quantity: '1', returnPath: '/feed' }));
    expect(revalidated).toContain('/feed');

    // Allowed: /p/[id]-shaped path.
    revalidated.length = 0;
    await addToCart(fd({ productId: 'prd_001', quantity: '1', returnPath: '/p/post_001' }));
    expect(revalidated).toContain('/p/post_001');

    // Disallowed: arbitrary path is silently dropped.
    revalidated.length = 0;
    await addToCart(
      fd({ productId: 'prd_001', quantity: '1', returnPath: '/admin/moderation' }),
    );
    expect(revalidated).not.toContain('/admin/moderation');

    // Disallowed: external-looking path with embedded slash.
    revalidated.length = 0;
    await addToCart(
      fd({ productId: 'prd_001', quantity: '1', returnPath: '/p/../admin/moderation' }),
    );
    expect(revalidated).not.toContain('/p/../admin/moderation');
  });
});

describe('followBrand / unfollowBrand', () => {
  it('resolves the brand server-side from slug', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await followBrand(fd({ brandSlug: 'cornerstone-co' }));
    expect(await getWearStore().brandFollows.isFollowing('usr_001', 'brd_002')).toBe(true);
    await unfollowBrand(fd({ brandSlug: 'cornerstone-co' }));
    expect(await getWearStore().brandFollows.isFollowing('usr_001', 'brd_002')).toBe(false);
  });

  it('silently ignores unknown brand slugs', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await followBrand(fd({ brandSlug: 'no-such-brand' }));
    // No throw, no follow created.
    expect(
      (await getWearStore().brandFollows.following('usr_001')).every(
        (f) => f.brandId !== 'no-such-brand',
      ),
    ).toBe(true);
  });
});

describe('reportPost + resolveModeration', () => {
  it('opens a moderation item for a logged-in reporter', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    await reportPost(fd({ postId: 'post_002', reason: 'spam test' }));
    const queue = await getWearStore().moderation.listQueue({ limit: 50 });
    expect(queue.items.some((i) => i.targetId === 'post_002' && i.reason === 'spam test')).toBe(
      true,
    );
  });

  it('throws Forbidden when a non-admin tries to resolve', async () => {
    cookieJar.set('cw_session', FIXTURE_VALID_TOKEN);
    // Open an item to resolve.
    await reportPost(fd({ postId: 'post_001', reason: 'authz check' }));
    const queue = await getWearStore().moderation.listQueue({ limit: 50 });
    const item = queue.items.find((i) => i.reason === 'authz check')!;

    await expect(
      resolveModeration(fd({ itemId: item.id, decision: 'approved' })),
    ).rejects.toThrow(/Forbidden/);
  });

  it('lets an admin resolve a moderation item', async () => {
    cookieJar.set('cw_session', FIXTURE_ADMIN_TOKEN);
    // Use an item opened above (state persists across tests since the store
    // is a process-wide singleton — that is by design for the dev runtime).
    const open = await getWearStore().moderation.listQueue({ limit: 50 });
    const item =
      open.items.find((i) => i.reason === 'authz check') ??
      (await getWearStore().moderation.open({
        targetType: 'post',
        targetId: 'post_001',
        reporterUserId: 'usr_002',
        reason: 'admin-path setup',
      }));

    await resolveModeration(fd({ itemId: item.id, decision: 'approved' }));
    const resolved = await getWearStore().moderation.get(item.id);
    expect(resolved?.status).toBe('approved');
    expect(resolved?.reviewerUserId).toBe('usr_002');
  });

  it('rejects unknown decision values silently', async () => {
    cookieJar.set('cw_session', FIXTURE_ADMIN_TOKEN);
    const opened = await getWearStore().moderation.open({
      targetType: 'post',
      targetId: 'post_002',
      reporterUserId: null,
      reason: 'decision filter',
    });
    await resolveModeration(fd({ itemId: opened.id, decision: 'definitely-not-valid' }));
    const after = await getWearStore().moderation.get(opened.id);
    expect(after?.status).toBe('open');
  });
});
