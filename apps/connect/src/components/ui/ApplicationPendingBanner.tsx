// Sticky global banner shown to users whose contributor application
// is in `pending` status. Keeps them oriented and offers a way back
// to the application details without forcing them off the normal app
// flow.
//
// The banner can be dismissed per-session via the red × button on the
// left; it reappears on next login / hard refresh.

"use client";

import { useState } from "react";
import Link from "next/link";

export function ApplicationPendingBanner({
  status,
}: {
  status: "pending" | "rejected" | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (status !== "pending" && status !== "rejected") return null;
  if (dismissed) return null;

  if (status === "pending") {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 w-full border-b border-(--gold,#C9A84C)/40 bg-(--gold,#C9A84C)/10 text-black"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-sm">
          <button
            type="button"
            aria-label="Dismiss banner"
            onClick={() => setDismissed(true)}
            className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 10 10"
              className="h-2.5 w-2.5"
              aria-hidden={true}
            >
              <path
                d="M2 2l6 6M8 2l-6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="flex flex-1 items-center gap-2">
            <span
              aria-hidden={true}
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-(--gold,#C9A84C)"
            />
            <span>
              <strong className="font-semibold">Under review.</strong> Your
              Contributor application is with our team. We&rsquo;ll email you
              as soon as it&rsquo;s reviewed.
            </span>
          </span>
          <Link
            href="/profile"
            className="shrink-0 font-medium text-black underline underline-offset-2 hover:opacity-80"
          >
            View
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-40 w-full border-b border-black/20 bg-black/4 text-black"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-sm">
        <button
          type="button"
          aria-label="Dismiss banner"
          onClick={() => setDismissed(true)}
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 10 10"
            className="h-2.5 w-2.5"
            aria-hidden={true}
          >
            <path
              d="M2 2l6 6M8 2l-6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="flex-1">
          Your previous Contributor application wasn&rsquo;t approved. You can
          update and re-apply anytime.
        </span>
        <Link
          href="/contributor/apply"
          className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
        >
          Re-apply
        </Link>
      </div>
    </div>
  );
}
