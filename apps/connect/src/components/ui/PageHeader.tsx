"use client";

// Shared sticky page header used on every non-map full-page route.
// Replaces the scattered "← Back" links. Clicks Back on the router
// when there is history, otherwise falls back to `fallbackHref` so a
// user who lands on the page from a share-link or deep-link never
// hits a dead-end.

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  /** Where to go if there is no history to pop. */
  fallbackHref?: string;
  /** Optional subtitle rendered under the title. */
  subtitle?: string;
  /** Right-side action slot (buttons, links, chips). */
  action?: ReactNode;
  /** Hide the back button (e.g. on top-level pages reached from nav). */
  hideBack?: boolean;
}

export function PageHeader({
  title,
  fallbackHref = "/events",
  subtitle,
  action,
  hideBack = false,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    // history.length > 1 means there's a page to pop back to inside
    // this tab. Otherwise we hard-navigate to the fallback (usually
    // the map) so users never get stranded.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/75">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {!hideBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-black/70 transition-colors hover:bg-black/6 hover:text-black"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-black sm:text-lg">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-black/60 sm:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>

        {action ? (
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Link-styled back-to-map fallback for server components that can't
 * use the client `PageHeader`. Rendered only when the client one is
 * unavailable (e.g. error boundaries pre-hydration).
 */
export function StaticBackLink({
  href = "/events",
  label = "Back to map",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-black/70 hover:text-black"
    >
      <span aria-hidden>←</span> {label}
    </Link>
  );
}
