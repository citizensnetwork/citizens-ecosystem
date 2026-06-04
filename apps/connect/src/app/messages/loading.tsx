export default function MessagesLoading() {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* List skeleton */}
      <div className="flex flex-col w-full md:w-80 border-r border-border">
        <div className="px-5 py-5 border-b border-border space-y-3">
          <div className="h-6 w-24 animate-pulse rounded bg-black/10" />
          <div className="h-10 rounded-xl bg-black/5 animate-pulse" />
        </div>
        <div className="flex-1 space-y-px">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse border-b border-border/50">
              <div className="h-12 w-12 rounded-xl bg-black/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-28 rounded bg-black/8" />
                <div className="h-3 w-44 rounded bg-black/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Empty right panel */}
      <div className="hidden md:flex flex-1 items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-black/5 animate-pulse" />
      </div>
    </div>
  );
}
