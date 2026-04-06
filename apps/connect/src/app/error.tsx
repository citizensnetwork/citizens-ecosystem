"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-black">Something went wrong</h1>
        <p className="max-w-md text-sm text-black/60">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="rounded-xl bg-(--gold) px-6 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
