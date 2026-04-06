import type { Event } from "@/types/db";

/** Build a Google Calendar "Add Event" URL */
export function buildGoogleCalendarUrl(event: Event): string {
  const start = new Date(event.date);
  const end = event.end_time
    ? new Date(event.end_time)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000); // default 2h

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: event.description,
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Generate an iCal (.ics) string for a single event */
export function generateICalString(event: Event): string {
  const start = new Date(event.date);
  const end = event.end_time
    ? new Date(event.end_time)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Citizens Connect//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.description)}`,
    `LOCATION:${escape(event.location)}`,
    `UID:${event.id}@citizens-connect`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
