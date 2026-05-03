import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { followBrand, unfollowBrand } from '@/lib/actions';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { getWearStore } from '@/lib/store';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

interface Params {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const client = getConnectClient();
  const brand = await client.brands.getBySlug(slug);
  if (!brand) return { title: 'Not found — Citizens Wear' };
  return {
    title: `${brand.name} — Citizens Wear`,
    description: brand.tagline ?? `Citizens Wear brand page for ${brand.name}.`,
  };
}

export default async function BrandProfilePage({ params }: Params) {
  const { slug } = await params;
  const client = getConnectClient();
  const store = getWearStore();
  const session = await getSession();

  const brand = await client.brands.getBySlug(slug);
  if (!brand) notFound();

  const [owner, products, postsPage, followCounts, isFollowing] = await Promise.all([
    client.users.getById(brand.ownerUserId),
    client.products.listForBrand(brand.id, { limit: 12 }),
    store.posts.listForBrand(brand.id, { limit: 12, viewerUserId: session?.user.id }),
    store.brandFollows.counts(brand.id),
    session ? store.brandFollows.isFollowing(session.user.id, brand.id) : Promise.resolve(false),
  ]);

  return (
    <PageShell session={session}>
      <section className="my-10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-4xl">{brand.name}</h1>
            {brand.verified ? (
              <span
                aria-label="Verified brand"
                title="Verified brand"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold-muted text-xs font-semibold text-gold-deep"
              >
                ✓
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-ink-soft">@{brand.slug}</p>
          {brand.tagline ? (
            <p className="mt-4 max-w-xl text-base text-ink">{brand.tagline}</p>
          ) : null}
          {owner ? (
            <p className="mt-2 text-sm text-ink-soft">
              Owned by{' '}
              <Link
                href={{ pathname: '/u/[handle]', query: { handle: owner.handle } }}
                className="underline decoration-gold underline-offset-2 hover:text-ink"
              >
                @{owner.handle}
              </Link>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ink-soft">
              Followers: <span className="font-medium text-ink">{followCounts.followers}</span>
            </span>
            {session ? (
              <form action={isFollowing ? unfollowBrand : followBrand}>
                <input type="hidden" name="brandSlug" value={brand.slug} />
                <button
                  type="submit"
                  className={
                    isFollowing
                      ? 'rounded-md border border-border bg-paper px-3 py-1 text-xs hover:bg-paper-soft'
                      : 'rounded-md bg-ink px-3 py-1 text-xs font-medium text-paper hover:bg-ink-soft'
                  }
                >
                  {isFollowing ? 'Following brand' : 'Follow brand'}
                </button>
              </form>
            ) : (
              <Link
                href="/sign-in"
                className="rounded-md border border-border bg-paper px-3 py-1 text-xs hover:bg-paper-soft"
              >
                Sign in to follow
              </Link>
            )}
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">Posts</h2>
          {postsPage.items.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No posts yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {postsPage.items.map((post) => (
                <li key={post.id}>
                  <Link
                    href={{ pathname: '/p/[id]', query: { id: post.id } }}
                    className="flex items-center gap-2 rounded-md border border-border bg-paper-soft px-3 py-2 text-sm hover:border-gold"
                  >
                    <span className="line-clamp-1 text-ink">{post.caption.slice(0, 120)}</span>
                    <span className="ml-auto text-xs text-ink-soft">
                      {post.publishedAt
                        ? new Date(post.publishedAt).toLocaleDateString()
                        : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-ink-soft">Drops</h2>
          {products.items.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No products yet.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {products.items.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-border bg-paper-soft px-3 py-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{p.title}</span>
                    <span className="text-ink-soft">
                      {(p.priceCents / 100).toLocaleString(undefined, {
                        style: 'currency',
                        currency: p.currency,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">{p.stockState.replace('_', ' ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </PageShell>
  );
}
