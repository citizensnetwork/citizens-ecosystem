export default function MessagesLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="border-b px-4 py-4">
        <div className="h-6 w-24 animate-pulse rounded bg-black/10" />
      </div>
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="h-12 w-12 rounded-full bg-black/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-black/10" />
              <div className="h-3 w-48 rounded bg-black/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
