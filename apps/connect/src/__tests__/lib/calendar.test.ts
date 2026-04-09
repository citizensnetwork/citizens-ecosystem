import { describe, it, expect } from "vitest";
import { buildGoogleCalendarUrl, generateICalString } from "@/lib/calendar";
import { makeEvent } from "../helpers/fixtures";

describe("buildGoogleCalendarUrl", () => {
  it("returns a Google Calendar URL with action=TEMPLATE", () => {
    const event = makeEvent({ date: "2026-04-12T09:00:00Z", end_time: "2026-04-12T11:00:00Z" });
    const url = buildGoogleCalendarUrl(event);

    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
  });

  it("includes event title in the URL", () => {
    const event = makeEvent({ title: "Worship Night" });
    const url = buildGoogleCalendarUrl(event);

    expect(url).toContain("text=Worship+Night");
  });

  it("includes formatted start and end dates", () => {
    const event = makeEvent({ date: "2026-04-12T09:00:00Z", end_time: "2026-04-12T11:00:00Z" });
    const url = buildGoogleCalendarUrl(event);

    expect(url).toContain("dates=20260412T090000Z%2F20260412T110000Z");
  });

  it("defaults end time to 2 hours after start when end_time is null", () => {
    const event = makeEvent({ date: "2026-04-12T09:00:00Z", end_time: null });
    const url = buildGoogleCalendarUrl(event);

    expect(url).toContain("dates=20260412T090000Z%2F20260412T110000Z");
  });

  it("URL-encodes special characters in title and description", () => {
    const event = makeEvent({
      title: "Youth & Worship",
      description: "Fun time with friends; bring snacks!",
    });
    const url = buildGoogleCalendarUrl(event);

    expect(url).toContain("text=Youth+%26+Worship");
    expect(url).toContain("details=Fun+time+with+friends");
  });

  it("includes the event location", () => {
    const event = makeEvent({ location: "Grace Church, Durban" });
    const url = buildGoogleCalendarUrl(event);

    expect(url).toContain("location=Grace+Church");
  });
});

describe("generateICalString", () => {
  it("returns a string with VCALENDAR and VEVENT blocks", () => {
    const event = makeEvent();
    const ical = generateICalString(event);

    expect(ical).toContain("BEGIN:VCALENDAR");
    expect(ical).toContain("END:VCALENDAR");
    expect(ical).toContain("BEGIN:VEVENT");
    expect(ical).toContain("END:VEVENT");
  });

  it("contains the correct PRODID", () => {
    const event = makeEvent();
    const ical = generateICalString(event);

    expect(ical).toContain("PRODID:-//Citizens Connect//EN");
  });

  it("contains the UID with event ID", () => {
    const event = makeEvent({ id: "test-uuid-1234" });
    const ical = generateICalString(event);

    expect(ical).toContain("UID:test-uuid-1234@citizens-connect");
  });

  it("uses CRLF line separators", () => {
    const event = makeEvent();
    const ical = generateICalString(event);

    expect(ical).toContain("\r\n");
    // All line breaks should be \r\n
    const lines = ical.split("\r\n");
    expect(lines.length).toBeGreaterThan(5);
  });

  it("defaults end time to 2h after start when end_time is null", () => {
    const event = makeEvent({ date: "2026-06-15T14:00:00Z", end_time: null });
    const ical = generateICalString(event);

    expect(ical).toContain("DTSTART:20260615T140000Z");
    expect(ical).toContain("DTEND:20260615T160000Z");
  });

  it("uses provided end_time when available", () => {
    const event = makeEvent({ date: "2026-06-15T14:00:00Z", end_time: "2026-06-15T17:30:00Z" });
    const ical = generateICalString(event);

    expect(ical).toContain("DTSTART:20260615T140000Z");
    expect(ical).toContain("DTEND:20260615T173000Z");
  });

  it("escapes semicolons, commas, and backslashes in event fields", () => {
    const event = makeEvent({
      title: "Youth; Worship",
      description: "Come, everyone!",
      location: "Corner of Main\\5th",
    });
    const ical = generateICalString(event);

    expect(ical).toContain("SUMMARY:Youth\\; Worship");
    expect(ical).toContain("DESCRIPTION:Come\\, everyone!");
    expect(ical).toContain("LOCATION:Corner of Main\\\\5th");
  });
});
