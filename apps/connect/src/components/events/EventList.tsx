import type { Event } from "@/types/db";
import EventCard from "./EventCard";

export default function EventList({
  events,
  emptyTitle = "No events here yet",
  emptyHint = "Be the first to create one — or widen your filters to see more.",
}: {
  events: Event[];
  /** Override title shown when the list is empty (e.g. category/filter-aware). */
  emptyTitle?: string;
  /** Override the secondary hint shown when the list is empty. */
  emptyHint?: string;
}) {
  if (events.length === 0) {
    return (
      <div className="surface-card rounded-2xl py-12 text-center text-(--foreground-soft)">
        <p className="text-lg font-medium text-black">{emptyTitle}</p>
        <p className="mt-1 text-sm">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
