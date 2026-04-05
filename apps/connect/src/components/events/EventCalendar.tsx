"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Event, EventCategory } from "@/types/db";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";

/* ── Category colours (match markers.ts) ──────────────── */
const CATEGORY_COLORS: Record<EventCategory, string> = {
  "church-service": "#6366f1",
  youth: "#f59e0b",
  "community-outreach": "#10b981",
  worship: "#c8a24f",
  "bible-study": "#8b5cf6",
  prayer: "#ec4899",
  social: "#06b6d4",
  other: "#6b7280",
};

type Props = {
  events: Event[];
  onSelectEvent?: (event: Event) => void;
  isVendor?: boolean;
};

export default function EventCalendar({
  events,
  onSelectEvent,
  isVendor = false,
}: Props) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar>(null);

  /* Map Event[] → FullCalendar EventInput[] */
  const fcEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.date,
    backgroundColor: CATEGORY_COLORS[e.category ?? "other"] ?? "#6b7280",
    borderColor: "transparent",
    textColor: "#fff",
    extendedProps: { event: e },
  }));

  /* Click an event → open detail panel or navigate */
  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const event = info.event.extendedProps.event as Event;
      if (onSelectEvent) {
        onSelectEvent(event);
      } else {
        router.push(`/events/${event.id}`);
      }
    },
    [onSelectEvent, router]
  );

  /* Click a date → navigate to create (vendor only) */
  const handleDateClick = useCallback(
    (info: DateClickArg) => {
      if (!isVendor) return;
      const dateParam = info.dateStr;
      router.push(`/events/new?date=${dateParam}`);
    },
    [isVendor, router]
  );

  /* Force FullCalendar to resize when it becomes visible */
  useEffect(() => {
    const timer = setTimeout(() => {
      calendarRef.current?.getApi().updateSize();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="cc-calendar surface-card rounded-2xl p-3 sm:p-4">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={fcEvents}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        editable={false}
        selectable={false}
        dayMaxEvents={3}
        height="auto"
        nowIndicator
        fixedWeekCount={false}
        eventDisplay="block"
        eventTimeFormat={{
          hour: "2-digit",
          minute: "2-digit",
          meridiem: "short",
        }}
      />
    </div>
  );
}
