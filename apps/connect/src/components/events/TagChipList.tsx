/**
 * TagChipList — read-only display of event tags.  Server-safe (no
 * hooks). Renders each tag as a pill; clicking routes to a tag-filtered
 * events view via `?tag=<slug>` (handled by the events list).
 */

import Link from "next/link";
import type { EventTag } from "@/types/db";

type Props = {
  tags: Pick<EventTag, "id" | "slug" | "label" | "is_official">[];
  /** When true, renders as plain span chips without links (for compact cards). */
  inert?: boolean;
  className?: string;
};

export default function TagChipList({ tags, inert = false, className }: Props) {
  if (!tags || tags.length === 0) return null;

  return (
    <ul
      className={`flex flex-wrap gap-1.5 ${className ?? ""}`}
      aria-label="Event tags"
    >
      {tags.map((tag) => {
        const chipClass =
          "inline-flex items-center rounded-full bg-(--gold-soft,#f5ecd3) px-2 py-0.5 text-[11px] font-medium text-black/80 transition hover:bg-(--gold-soft-strong,#efe0b6)";
        return (
          <li key={tag.id}>
            {inert ? (
              <span className={chipClass}>
                {tag.is_official && <span aria-hidden>★ </span>}
                {tag.label}
              </span>
            ) : (
              <Link
                href={`/events?tag=${encodeURIComponent(tag.slug)}`}
                className={chipClass}
              >
                {tag.is_official && <span aria-hidden>★ </span>}
                {tag.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
