/**
 * OrgBroadcastList — renders "From the Organiser" broadcast messages.
 *
 * Pure presentation component: accepts pre-fetched broadcast data so it can
 * be embedded in both server components (PlaceDetailServer, /e/[id]) and
 * client components (EventDetailContent) without triggering a secondary
 * client-side fetch.
 *
 * Returns null when there are no broadcasts — callers need not guard.
 */

export type OrgBroadcast = {
  id: string;
  body: string;
  created_at: string;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function IconMegaphone() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  );
}

type Props = {
  broadcasts: OrgBroadcast[];
  /** Renders with a slightly lighter border — useful inside dark hero sections. */
  variant?: "default" | "subtle";
};

export default function OrgBroadcastList({
  broadcasts,
  variant = "default",
}: Props) {
  if (broadcasts.length === 0) return null;

  const containerCls =
    variant === "subtle"
      ? "rounded-xl border border-(--gold)/20 bg-(--gold-soft)/50 px-4 py-3 space-y-2"
      : "rounded-xl border border-(--gold)/30 bg-(--gold-soft) px-4 py-3 space-y-2";

  return (
    <div className={containerCls} role="region" aria-label="Messages from the Organiser">
      <div className="flex items-center gap-1.5">
        <span className="text-(--gold)">
          <IconMegaphone />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--gold)">
          From the Organiser
        </h3>
      </div>

      <ul className="space-y-2">
        {broadcasts.map((b, idx) => (
          <li
            key={b.id}
            className={
              idx === 0
                ? ""
                : "border-t border-(--gold)/20 pt-2"
            }
          >
            <p className="text-sm leading-relaxed text-black/80">{b.body}</p>
            <p className="mt-0.5 text-[11px] text-black/40">{timeAgo(b.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
