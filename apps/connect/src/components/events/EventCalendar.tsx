"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@/types/db";
import { CATEGORY_COLORS } from "@/lib/categories";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";

/**
 * Returns black or white text colour based on the perceived luminance of the
 * background hex, ensuring WCAG AA contrast for calendar event labels.
 */
function calendarTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance (ITU-R BT.601 coefficients)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 155 ? "#111" : "#fff";
}


type Props = {
  events: Event[];
  rsvpEventIds?: Set<string>;
  onSelectEvent?: (event: Event) => void;
  isVendor?: boolean;
};

export default function EventCalendar({
  events,
  rsvpEventIds = new Set(),
  onSelectEvent,
  isVendor = false,
}: Props) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Map Event[] → FullCalendar EventInput[] */
  const fcEvents = events.map((e) => {
    const isRsvpd = rsvpEventIds.has(e.id);
    const catColor = CATEGORY_COLORS[e.category ?? "church"] ?? "#D4AF37";
    const bgColor = isRsvpd ? "#D4AF37" : catColor;
    return {
      id: e.id,
      title: e.title,
      start: e.date,
      end: e.end_time ?? undefined,
      backgroundColor: bgColor,
      borderColor: isRsvpd ? "#b8941f" : catColor,
      textColor: isRsvpd ? "#111" : calendarTextColor(catColor),
      extendedProps: { event: e },
    };
  });

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

  /* Mobile swipe left/right to navigate months */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;

    function handleTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }

    function handleTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      // Only trigger if horizontal swipe is dominant and exceeds threshold
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const api = calendarRef.current?.getApi();
        if (!api) return;
        if (dx < 0) {
          api.next();
        } else {
          api.prev();
        }
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return (
    <div ref={containerRef} className="cc-calendar surface-card rounded-2xl p-3 sm:p-4">
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
