import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { addComment } from '@/lib/actions';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { getWearStore } from '@/lib/store';
import { PageShell } from '@/lib/shell';
import { PostCard, type PostCardData } from '@/components/post-card';

export const dynamic = 'force-dynamic';

interface Params {
  readonly params: Promise<{ readonly id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const post = await getWearStore().posts.get(id);
  if (!post) return { title: 'Not found — Citizens Wear' };
  const trimmed = post.caption.length > 80 ? `${post.caption.slice(0, 77)}...` : post.caption;
  // Drafts/hidden/rejected posts are visible only to the author — keep them
  // out of search engines regardless of metadata cache state.
  const noindex = post.status !== 'published';
  return {
    title: `Post — Citizens Wear`,
    description: trimmed,
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function PostDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await getSession();
  const viewerUserId = session?.user.id ?? null;

  const store = getWearStore();
  const client = getConnectClient();

  const post = await store.posts.get(id);
  if (!post) notFound();

  // Visibility check — published-only feed semantics, plus author-only access
  // to drafts/hidden/rejected. We mirror what `WearStore.posts.listFeed`
  // would return for this viewer rather than re-implementing it.
  const isAuthor = viewerUserId === post.authorUserId;
  if (post.status !== 'published' && !isAuthor) notFound();

  const [author, brand, media, productTags, likeCount, comments] = await Promise.all([
    client.users.getById(post.authorUserId),
    post.brandId ? client.brands.getById(post.brandId) : Promise.resolve(null),
    store.posts.listMedia(post.id),
    store.posts.listProductTags(post.id),
    store.postEngagement.likeCount(post.id),
    store.comments.listForPost(post.id, { limit: 50 }),
  ]);

  const products = (
    await Promise.all(productTags.map((tag) => client.products.getById(tag.productId)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);

  const [likedByViewer, savedByViewer] = await Promise.all([
    viewerUserId ? store.postEngagement.isLiked(viewerUserId, post.id) : Promise.resolve(false),
    viewerUserId ? store.saves.isSaved(viewerUserId, post.id) : Promise.resolve(false),
  ]);

  // Resolve comment authors in one fan-out (no N+1 inside the comment list).
  const commenterIds = Array.from(new Set(comments.items.map((c) => c.authorUserId)));
  const commenterEntries = await Promise.all(
    commenterIds.map(async (commenterId) => {
      const user = await client.users.getById(commenterId);
      return [commenterId, user] as const;
    }),
  );
  const commenters = new Map(commenterEntries);

  const cardData: PostCardData = {
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

  return (
    <PageShell session={session} tone="dark" width="narrow">
      <nav className="mb-4 text-xs">
        <Link
          href="/feed"
          className="text-paper-soft/80 underline decoration-gold underline-offset-2 hover:text-paper"
        >
          ← Back to feed
        </Link>
      </nav>

      <PostCard data={cardData} viewerSignedIn={Boolean(session)} detail={true} />

      <section className="mt-8 rounded-2xl border border-ink-soft/40 bg-ink/60 p-4">
        <h2 className="text-sm font-medium text-paper">Comments</h2>

        {session ? (
          <form action={addComment} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="postId" value={post.id} />
            <label htmlFor="comment-body" className="sr-only">
              Add a comment
            </label>
            <textarea
              id="comment-body"
              name="body"
              required
              maxLength={1000}
              rows={2}
              placeholder="Speak peace into the conversation."
              className="rounded-md border border-ink-soft/50 bg-ink px-3 py-2 text-sm text-paper focus:border-gold focus:outline-none"
            />
            <button
              type="submit"
              className="self-start rounded-full border border-gold/60 bg-ink-soft/40 px-4 py-1 text-xs hover:border-gold"
            >
              Post comment
            </button>
          </form>
        ) : (
          <p className="mt-3 text-xs text-paper-soft/80">
            <Link href="/sign-in" className="underline decoration-gold underline-offset-2">
              Sign in
            </Link>{' '}
            to comment.
          </p>
        )}

        {comments.items.length === 0 ? (
          <p className="mt-4 text-xs text-paper-soft/70">No comments yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {comments.items.map((comment) => {
              const commenter = commenters.get(comment.authorUserId);
              return (
                <li
                  key={comment.id}
                  className="rounded-md border border-ink-soft/40 bg-ink/40 p-3 text-sm"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-paper">
                      {commenter ? commenter.displayName : 'Citizen'}
                    </span>
                    {commenter ? (
                      <Link
                        href={{ pathname: '/u/[handle]', query: { handle: commenter.handle } }}
                        className="text-xs text-paper-soft/80 underline decoration-gold underline-offset-2"
                      >
                        @{commenter.handle}
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-1 text-paper-soft/95">{comment.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
