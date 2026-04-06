"use client";

import EventCard from "./EventCard";
import type { Event } from "@/types/db";

type Props = {
  events: Event[];
  onSelectEvent?: (event: Event) => void;
};

export default function EventFeed({ events, onSelectEvent }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No events to show
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 space-y-4 max-w-2xl mx-auto">
      {events.map((event) => (
        <div
          key={event.id}
          onClick={(e) => {
            e.preventDefault();
            onSelectEvent?.(event);
          }}
          className="cursor-pointer"
        >
          <EventCard event={event} />
        </div>
      ))}
    </div>
  );
}
