import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveModeration } from '@/lib/actions';
import { getConnectClient } from '@/lib/connect';
import { getSession, isAdmin } from '@/lib/session';
import { getWearStore } from '@/lib/store';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Moderation — Citizens Wear',
  description: 'Citizens Wear moderation queue (admin only).',
  robots: { index: false, follow: false },
};

/**
 * Admin moderation queue. Gated by the `admin.moderation` scope on the
 * verified Connect session — never by cookies, query strings, or form input.
 *
 * Renders 401 / 403 surfaces in-page rather than redirecting, so admins do
 * not get bounced through the citizen sign-in flow.
 */
export default async function AdminModerationPage() {
  const session = await getSession();
  const client = getConnectClient();
  const store = getWearStore();

  if (!session) {
    return (
      <PageShell session={null} tone="dark" width="narrow">
        <h1 className="font-display text-3xl text-paper">Moderation</h1>
        <p className="mt-3 text-sm text-paper-soft/90">
          You must{' '}
          <Link href="/sign-in" className="underline decoration-gold underline-offset-2">
            sign in
          </Link>{' '}
          with a moderator account to view this queue.
        </p>
      </PageShell>
    );
  }

  if (!isAdmin(session)) {
    return (
      <PageShell session={session} tone="dark" width="narrow">
        <h1 className="font-display text-3xl text-paper">Moderation</h1>
        <p className="mt-3 text-sm text-paper-soft/90">
          Your account does not carry the moderation scope. If you believe this is wrong,
          contact a Citizens Network operator.
        </p>
      </PageShell>
    );
  }

  const queue = await store.moderation.listQueue({ limit: 50 });

  // Resolve target previews in one fan-out, falling back gracefully if a
  // target has been deleted between report and review.
  const items = await Promise.all(
    queue.items.map(async (item) => {
      let preview: string | null = null;
      let targetHref: string | null = null;
      let targetLabel: string | null = null;
      if (item.targetType === 'post') {
        const post = await store.posts.get(item.targetId);
        if (post) {
          preview = post.caption.slice(0, 200);
          targetHref = `/p/${post.id}`;
          targetLabel = `Post ${post.id}`;
        }
      } else if (item.targetType === 'comment') {
        const comment = await store.comments.get(item.targetId);
        if (comment) {
          preview = comment.body.slice(0, 200);
          targetHref = `/p/${comment.postId}`;
          targetLabel = `Comment on ${comment.postId}`;
        }
      } else {
        targetLabel = `Submission ${item.targetId}`;
      }

      const reporter = item.reporterUserId
        ? await client.users.getById(item.reporterUserId)
        : null;

      return { item, preview, targetHref, targetLabel, reporter };
    }),
  );

  return (
    <PageShell session={session} tone="dark" width="narrow">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-paper-soft/70">
          Moderation queue
        </p>
        <h1 className="mt-2 font-display text-3xl text-paper md:text-4xl">
          Keep the conversation faithful.
        </h1>
        <p className="mt-2 text-sm text-paper-soft/80">
          Approve, hide, or reject reported items. Every decision is auditable on the item
          record.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-ink-soft/40 bg-ink/60 p-6 text-sm text-paper-soft/90">
          No open items. The queue is clean.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map(({ item, preview, targetHref, targetLabel, reporter }) => (
            <li
              key={item.id}
              className="rounded-2xl border border-ink-soft/40 bg-ink/60 p-4 text-sm text-paper"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-paper-soft/80">
                  {item.targetType} · opened {new Date(item.createdAt).toLocaleString()}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-gold">
                  {item.status}
                </span>
              </div>

              <p className="mt-2">
                <span className="text-paper-soft/80">Target: </span>
                {targetHref ? (
                  <Link
                    href={targetHref}
                    className="underline decoration-gold underline-offset-2"
                  >
                    {targetLabel}
                  </Link>
                ) : (
                  <span>{targetLabel ?? item.targetId}</span>
                )}
              </p>

              <p className="mt-1 text-paper-soft/90">
                <span className="text-paper-soft/80">Reason: </span>
                {item.reason}
              </p>

              {preview ? (
                <blockquote className="mt-2 border-l-2 border-gold/60 pl-3 text-paper-soft/90">
                  {preview}
                </blockquote>
              ) : (
                <p className="mt-2 text-paper-soft/70">
                  Target is no longer available (deleted or moved).
                </p>
              )}

              <p className="mt-1 text-xs text-paper-soft/70">
                Reporter: {reporter ? `@${reporter.handle}` : item.reporterUserId ?? 'system'}
              </p>

              <form action={resolveModeration} className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                <input type="hidden" name="itemId" value={item.id} />
                <select
                  name="decision"
                  defaultValue="approved"
                  aria-label="Decision"
                  className="rounded-md border border-ink-soft/50 bg-ink px-3 py-1 text-xs text-paper focus:border-gold focus:outline-none"
                >
                  <option value="approved">Approve</option>
                  <option value="hidden">Hide</option>
                  <option value="rejected">Reject</option>
                </select>
                <input
                  type="text"
                  name="note"
                  placeholder="Reviewer note (optional)"
                  maxLength={500}
                  className="flex-1 rounded-md border border-ink-soft/50 bg-ink px-3 py-1 text-xs text-paper focus:border-gold focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full border border-gold/60 bg-ink-soft/40 px-4 py-1 text-xs hover:border-gold"
                >
                  Resolve
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
