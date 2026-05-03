import type { WearStore } from '@citizens-wear/db';
import { MemoryWearStore } from '@citizens-wear/db';

/**
 * Single app-wide `WearStore` instance.
 *
 * Phase 4 seeds a handful of citizen + brand posts, media references, product
 * tags, likes, and a moderation item so the feed, post detail, profile
 * activity, and admin queue all have something to render in mock mode. Phase
 * 5 swaps this for a Prisma-backed store — the interface is identical.
 */
let _store: WearStore | undefined;

export function getWearStore(): WearStore {
  if (!_store) {
    _store = new MemoryWearStore({
      seedProfiles: [
        {
          userId: 'usr_001',
          bio: 'Building Salt & Light Apparel. Wear the Kingdom.',
          visibility: 'public',
          verified: true,
          createdAt: '2026-01-10T12:00:00.000Z',
          updatedAt: '2026-01-10T12:00:00.000Z',
        },
        {
          userId: 'usr_002',
          bio: 'Founder, Cornerstone Co. Built on the Rock.',
          visibility: 'public',
          verified: false,
          createdAt: '2026-02-02T09:30:00.000Z',
          updatedAt: '2026-02-02T09:30:00.000Z',
        },
      ],
      seedFollows: [
        {
          actorId: 'usr_002',
          targetId: 'usr_001',
          createdAt: '2026-02-10T09:00:00.000Z',
        },
      ],
      seedPosts: [
        {
          id: 'post_001',
          authorUserId: 'usr_001',
          authorKind: 'brand',
          brandId: 'brd_001',
          caption:
            'Salt Tee — Ivory drops Friday. Heavyweight organic cotton, woven for the long walk.',
          status: 'published',
          visibility: 'public',
          createdAt: '2026-04-20T15:00:00.000Z',
          updatedAt: '2026-04-20T15:00:00.000Z',
          publishedAt: '2026-04-20T15:00:00.000Z',
        },
        {
          id: 'post_002',
          authorUserId: 'usr_002',
          authorKind: 'citizen',
          brandId: null,
          caption:
            'Wore my Cornerstone cap to outreach this morning. Built on the Rock — the conversations followed.',
          status: 'published',
          visibility: 'public',
          createdAt: '2026-04-22T10:00:00.000Z',
          updatedAt: '2026-04-22T10:00:00.000Z',
          publishedAt: '2026-04-22T10:00:00.000Z',
        },
        {
          id: 'post_003',
          authorUserId: 'usr_001',
          authorKind: 'brand',
          brandId: 'brd_001',
          caption: 'Light Hoodie — Gold. Midweight fleece, finished by hand. Limited run of 120.',
          status: 'published',
          visibility: 'public',
          createdAt: '2026-04-28T11:30:00.000Z',
          updatedAt: '2026-04-28T11:30:00.000Z',
          publishedAt: '2026-04-28T11:30:00.000Z',
        },
      ],
      seedPostMedia: [
        {
          id: 'media_001',
          postId: 'post_001',
          url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200',
          altText: 'Ivory tee laid flat on linen, gold light.',
          sortOrder: 0,
        },
        {
          id: 'media_002',
          postId: 'post_002',
          url: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=1200',
          altText: 'Black six-panel cap on a wooden bench at sunrise.',
          sortOrder: 0,
        },
        {
          id: 'media_003',
          postId: 'post_003',
          url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1200',
          altText: 'Gold fleece hoodie folded over a chair, paper backdrop.',
          sortOrder: 0,
        },
      ],
      seedPostProductTags: [
        { postId: 'post_001', productId: 'prd_001', sortOrder: 0 },
        { postId: 'post_003', productId: 'prd_002', sortOrder: 0 },
      ],
      seedPostLikes: [
        { actorUserId: 'usr_002', postId: 'post_001', createdAt: '2026-04-20T16:00:00.000Z' },
        { actorUserId: 'usr_001', postId: 'post_002', createdAt: '2026-04-22T11:00:00.000Z' },
      ],
      seedBrandFollows: [
        { userId: 'usr_002', brandId: 'brd_001', createdAt: '2026-04-20T15:30:00.000Z' },
      ],
    });
  }
  return _store;
}
