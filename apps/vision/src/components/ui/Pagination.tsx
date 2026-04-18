import Link from "next/link";

export interface PaginationProps {
  /** Current 1-based page number. */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /**
   * Builds an href for a given page number. The return value is passed
   * directly to `next/link`. Implementers typically append `&page=N` to an
   * existing query string.
   */
  buildHref: (page: number) => string;
  /** Optional total item count; rendered as `(N total)` when provided. */
  total?: number;
  /**
   * Layout variant.
   *  - `between` (default): status on the left, prev/next buttons on the right
   *  - `centered`: status line with prev/next buttons centred beneath
   */
  variant?: "between" | "centered";
  /** Optional accessible label for the containing <nav>. */
  ariaLabel?: string;
  /** Optional extra class names for the outer element. */
  className?: string;
}

/**
 * Shared pagination footer for list views.
 *
 * Replaces hand-rolled prev/next blocks that were previously duplicated
 * across Activities, Projects, Connect events/places and Boundaries lists.
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
  total,
  variant = "between",
  ariaLabel = "Pagination",
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const prevLink =
    page > 1 ? (
      <Link
        href={buildHref(page - 1)}
        aria-label="Go to previous page"
        className="rounded-md border border-border px-3 py-1 text-sm hover:bg-surface-alt"
      >
        Previous
      </Link>
    ) : null;

  const nextLink =
    page < totalPages ? (
      <Link
        href={buildHref(page + 1)}
        aria-label="Go to next page"
        className="rounded-md border border-border px-3 py-1 text-sm hover:bg-surface-alt"
      >
        Next
      </Link>
    ) : null;

  const status = (
    <span className="text-sm text-text-secondary">
      Page {page} of {totalPages}
      {typeof total === "number" ? ` (${total} total)` : ""}
    </span>
  );

  if (variant === "centered") {
    return (
      <nav
        aria-label={ariaLabel}
        className={`mt-6 flex items-center justify-center gap-2 ${className ?? ""}`.trim()}
      >
        {prevLink}
        {status}
        {nextLink}
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={`mt-6 flex items-center justify-between ${className ?? ""}`.trim()}
    >
      {status}
      <div className="flex gap-2">
        {prevLink}
        {nextLink}
      </div>
    </nav>
  );
}
