export default function EventsLoading() {
  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div className="skeleton h-full w-full" />

      <div className="absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          <div className="skeleton h-11 w-full rounded-2xl" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="skeleton h-10 w-10 rounded-xl" />
              <div className="skeleton h-10 w-44 rounded-xl" />
            </div>
            <div className="skeleton h-10 w-12 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
