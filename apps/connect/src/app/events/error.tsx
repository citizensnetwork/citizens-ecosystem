"use client";

import Link from "next/link";

export default function EventsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-black">
          Couldn&apos;t load events
        </h1>
        <p className="max-w-md text-sm text-black/60">
          {error.message || "Something went wrong loading the events page."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-(--gold) px-6 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-black/10 px-6 py-2.5 text-sm font-medium text-black transition hover:bg-black/5"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
