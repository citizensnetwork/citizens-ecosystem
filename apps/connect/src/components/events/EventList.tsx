import type { Event } from "@/types/db";
import EventCard from "./EventCard";

export default function EventList({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <div className="surface-card rounded-2xl py-12 text-center text-[var(--foreground-soft)]">
        <p className="text-lg font-medium text-black">No events yet.</p>
        <p className="mt-1 text-sm">Be the first to create one!</p>
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
