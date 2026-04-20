// Sticky global banner shown to users whose contributor application
// is in `pending` status. Keeps them oriented and offers a way back
// to the application details without forcing them off the normal app
// flow.

import Link from "next/link";

export function ApplicationPendingBanner({
  status,
}: {
  status: "pending" | "rejected" | null;
}) {
  if (status !== "pending" && status !== "rejected") return null;

  if (status === "pending") {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 w-full border-b border-(--gold,#D4AF37)/40 bg-(--gold,#D4AF37)/10 text-black"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 text-sm">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-(--gold,#D4AF37)"
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
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span>
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
