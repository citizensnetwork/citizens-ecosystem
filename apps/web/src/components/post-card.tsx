import Link from 'next/link';
import type {
  ConnectBrand,
  ConnectProduct,
  ConnectUser,
} from '@citizens-wear/connect-client';
import type { Post, PostMedia, PostProductTag } from '@citizens-wear/db';
import {
  addToCart,
  reportPost,
  togglePostLike,
  togglePostSave,
} from '@/lib/actions';

/**
 * Resolved view-model the feed/post-detail surfaces consume. Keeping the
 * resolution in the page layer (rather than inside the card) means a single
 * `Promise.all` fan-out resolves all Connect ids — no N+1 inside cards.
 */
export interface PostCardData {
  readonly post: Post;
  readonly author: ConnectUser | null;
  readonly brand: ConnectBrand | null;
  readonly media: readonly PostMedia[];
  readonly productTags: readonly PostProductTag[];
  readonly products: readonly ConnectProduct[];
  readonly likeCount: number;
  readonly likedByViewer: boolean;
  readonly savedByViewer: boolean;
}

function formatPrice(cents: number, currency: string): string {
  try {
    return (cents / 100).toLocaleString(undefined, { style: 'currency', currency });
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Image-first dark post card. Server-rendered. All mutations go through
 * server actions which re-authenticate via `getSession()`.
 *
 * `viewerSignedIn === false` keeps the card readable but disables write
 * actions — matching Instagram's "anonymous browse" pattern that the
 * vertical-slice product brief permits.
 */
export function PostCard({
  data,
  viewerSignedIn,
  detail = false,
}: {
  readonly data: PostCardData;
  readonly viewerSignedIn: boolean;
  readonly detail?: boolean;
}) {
  const { post, author, brand, media, products, likeCount, likedByViewer, savedByViewer } = data;
  const heroMedia = media[0] ?? null;

  const headlineHref = brand
    ? ({ pathname: '/b/[slug]', query: { slug: brand.slug } } as const)
    : author
      ? ({ pathname: '/u/[handle]', query: { handle: author.handle } } as const)
      : ({ pathname: '/feed' } as const);

  const headlineText = brand
    ? brand.name
    : author
      ? author.displayName
      : 'Citizens Wear';

  const headlineHandle = brand ? `@${brand.slug}` : author ? `@${author.handle}` : '';
  const verified = brand ? brand.verified : false;

  return (
    <article className="overflow-hidden rounded-2xl border border-ink-soft/30 bg-ink/60 text-paper shadow-sm">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link
          href={headlineHref}
          className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          <span className="truncate text-sm font-medium">{headlineText}</span>
          {verified ? (
            <span
              aria-label="Verified brand"
              title="Verified brand"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gold-muted text-[10px] font-semibold text-gold-deep"
            >
              ✓
            </span>
          ) : null}
          <span className="truncate text-xs text-paper-soft/80">{headlineHandle}</span>
        </Link>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-paper-soft/70">
          {post.authorKind === 'brand' ? 'Brand' : 'Citizen'}
        </span>
      </header>

      {heroMedia ? (
        <Link
          href={{ pathname: '/p/[id]', query: { id: post.id } }}
          aria-label={`Open post ${post.id}`}
          className="block bg-ink-soft/30"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- using <img> avoids
              wiring next/image remote patterns for the in-memory mock dataset. */}
          <img
            src={heroMedia.url}
            alt={heroMedia.altText}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="aspect-square w-full object-cover"
          />
        </Link>
      ) : null}

      <div className="px-4 py-3">
        <p className={detail ? 'text-base leading-relaxed' : 'text-sm leading-relaxed'}>
          {post.caption}
        </p>

        {products.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tagged products">
            {products.map((product) => {
              const purchasable = product.stockState !== 'sold_out';
              return (
                <li key={product.id}>
                  <form action={addToCart} className="inline-flex">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="returnPath" value={detail ? `/p/${post.id}` : '/feed'} />
                    <button
                      type="submit"
                      disabled={!viewerSignedIn || !purchasable}
                      className="inline-flex items-center gap-2 rounded-full border border-gold/50 bg-ink-soft/40 px-3 py-1 text-xs text-paper transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-60"
                      title={
                        !viewerSignedIn
                          ? 'Sign in to add to cart'
                          : !purchasable
                            ? 'Sold out'
                            : `Add ${product.title} to cart`
                      }
                    >
                      <span className="truncate">{product.title}</span>
                      <span className="text-paper-soft/80">
                        {formatPrice(product.priceCents, product.currency)}
                      </span>
                      {!purchasable ? (
                        <span className="text-[10px] uppercase tracking-wide text-gold">
                          Sold out
                        </span>
                      ) : null}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <form action={togglePostLike}>
            <input type="hidden" name="postId" value={post.id} />
            <button
              type="submit"
              disabled={!viewerSignedIn}
              className="inline-flex items-center gap-1 rounded-full border border-ink-soft/40 px-3 py-1 hover:border-gold disabled:cursor-not-allowed disabled:opacity-60"
              aria-pressed={likedByViewer}
              aria-label={likedByViewer ? 'Unlike post' : 'Like post'}
            >
              <span aria-hidden="true">{likedByViewer ? '★' : '☆'}</span>
              <span>{likeCount}</span>
            </button>
          </form>

          <form action={togglePostSave}>
            <input type="hidden" name="postId" value={post.id} />
            <button
              type="submit"
              disabled={!viewerSignedIn}
              className="inline-flex items-center gap-1 rounded-full border border-ink-soft/40 px-3 py-1 hover:border-gold disabled:cursor-not-allowed disabled:opacity-60"
              aria-pressed={savedByViewer}
              aria-label={savedByViewer ? 'Unsave post' : 'Save post'}
            >
              <span aria-hidden="true">{savedByViewer ? '◆' : '◇'}</span>
              <span>{savedByViewer ? 'Saved' : 'Save'}</span>
            </button>
          </form>

          {!detail ? (
            <Link
              href={{ pathname: '/p/[id]', query: { id: post.id } }}
              className="ml-auto rounded-full border border-ink-soft/40 px-3 py-1 hover:border-gold"
            >
              Open
            </Link>
          ) : null}

          {viewerSignedIn ? (
            <details className="ml-auto text-paper-soft/80">
              <summary className="cursor-pointer rounded-full border border-ink-soft/40 px-3 py-1 hover:border-gold">
                Report
              </summary>
              <form action={reportPost} className="mt-2 flex flex-col gap-2 rounded-md border border-ink-soft/40 bg-ink/70 p-3">
                <input type="hidden" name="postId" value={post.id} />
                <label htmlFor={`report-${post.id}`} className="text-[11px] uppercase tracking-wide">
                  Reason
                </label>
                <textarea
                  id={`report-${post.id}`}
                  name="reason"
                  required
                  maxLength={500}
                  rows={3}
                  className="rounded-md border border-ink-soft/50 bg-ink px-2 py-1 text-xs text-paper focus:border-gold focus:outline-none"
                />
                <button
                  type="submit"
                  className="self-start rounded-full border border-gold/60 bg-ink-soft/40 px-3 py-1 text-xs hover:border-gold"
                >
                  Submit report
                </button>
              </form>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}
