export default function GoalsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded bg-surface" />
        <div className="h-9 w-28 animate-pulse rounded bg-surface" />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-48 animate-pulse rounded-md bg-surface" />
        <div className="h-9 w-36 animate-pulse rounded-md bg-surface" />
        <div className="h-9 w-36 animate-pulse rounded-md bg-surface" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-lg border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );
}
