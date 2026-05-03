import type { Metadata } from 'next';
import Link from 'next/link';
import type { Post } from '@citizens-wear/db';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { getWearStore } from '@/lib/store';
import { PageShell } from '@/lib/shell';
import { PostCard, type PostCardData } from '@/components/post-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feed — Citizens Wear',
  description: 'The Citizens Wear feed: brands and citizens, side by side.',
};

const PAGE_SIZE = 12;

/**
 * Resolve a single post into a `PostCardData` view-model. All Connect lookups
 * happen here so the card stays a pure presentational component.
 */
async function resolvePost(post: Post, viewerUserId: string | null): Promise<PostCardData> {
  const client = getConnectClient();
  const store = getWearStore();

  const [author, brand, media, productTags, likeCount] = await Promise.all([
    client.users.getById(post.authorUserId),
    post.brandId ? client.brands.getById(post.brandId) : Promise.resolve(null),
    store.posts.listMedia(post.id),
    store.posts.listProductTags(post.id),
    store.postEngagement.likeCount(post.id),
  ]);

  const products = (
    await Promise.all(productTags.map((tag) => client.products.getById(tag.productId)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);

  const [likedByViewer, savedByViewer] = await Promise.all([
    viewerUserId ? store.postEngagement.isLiked(viewerUserId, post.id) : Promise.resolve(false),
    viewerUserId ? store.saves.isSaved(viewerUserId, post.id) : Promise.resolve(false),
  ]);

  return {
    post,
    author,
    brand,
    media,
    productTags,
    products,
    likeCount,
    likedByViewer,
    savedByViewer,
  };
}

export default async function FeedPage() {
  const session = await getSession();
  const viewerUserId = session?.user.id ?? null;

  const page = await getWearStore().posts.listFeed({
    limit: PAGE_SIZE,
    viewerUserId: viewerUserId ?? undefined,
  });

  const cards = await Promise.all(
    page.items.map((post) => resolvePost(post, viewerUserId)),
  );

  return (
    <PageShell session={session} tone="dark" width="narrow">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-paper-soft/70">
          The Citizens Wear feed
        </p>
        <h1 className="mt-2 font-display text-3xl text-paper md:text-4xl">
          Made for the Kingdom. Worn in the world.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-paper-soft/80">
          Posts from brands and citizens, newest first. Tap a tag to put a piece in your cart;
          the rest is for the heart.
        </p>
        {session ? (
          <Link
            href="/compose"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-ink-soft/40 px-4 py-2 text-sm hover:border-gold"
          >
            <span aria-hidden="true">✦</span>
            <span>Compose a post</span>
          </Link>
        ) : (
          <Link
            href="/sign-in"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-ink-soft/40 px-4 py-2 text-sm hover:border-gold"
          >
            Sign in to like, save, and shop
          </Link>
        )}
      </header>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-ink-soft/40 bg-ink/60 p-6 text-sm text-paper-soft/90">
          No posts yet. The Kingdom moves quietly before it moves loudly.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {cards.map((card) => (
            <li key={card.post.id}>
              <PostCard data={card} viewerSignedIn={Boolean(session)} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
