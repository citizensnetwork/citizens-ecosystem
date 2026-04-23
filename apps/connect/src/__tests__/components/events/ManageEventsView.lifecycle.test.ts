import { describe, it, expect } from "vitest";
import { lifecycleOf, MANAGE_LIVE_FALLBACK_MS } from "@/components/events/ManageEventsView";

// Fixed reference point so the tests are deterministic.
const NOW = Date.parse("2026-04-20T12:00:00.000Z");

function mk(status: string, dateIso: string, endIso: string | null = null) {
  return { status, date: dateIso, end_time: endIso };
}

describe("lifecycleOf (ManageEventsView dashboard grouping)", () => {
  it("flags cancelled status regardless of date", () => {
    const future = mk("cancelled", "2026-06-01T10:00:00.000Z");
    const past = mk("cancelled", "2025-01-01T10:00:00.000Z");
    expect(lifecycleOf(future, NOW)).toBe("cancelled");
    expect(lifecycleOf(past, NOW)).toBe("cancelled");
  });

  it("treats a future event as upcoming", () => {
    const e = mk("published", "2026-05-01T10:00:00.000Z");
    expect(lifecycleOf(e, NOW)).toBe("upcoming");
  });

  it("treats an in-progress event (now between start and end) as live", () => {
    const e = mk(
      "published",
      "2026-04-20T11:30:00.000Z",
      "2026-04-20T13:00:00.000Z",
    );
    expect(lifecycleOf(e, NOW)).toBe("live");
  });

  it("uses a 2h fallback window when end_time is null", () => {
    // Start 30m before NOW, no end → live (within 2h fallback).
    const stillLive = mk("published", "2026-04-20T11:30:00.000Z", null);
    expect(lifecycleOf(stillLive, NOW)).toBe("live");

    // Start 3h before NOW → past (beyond fallback).
    const ended = mk(
      "published",
      new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
      null,
    );
    expect(lifecycleOf(ended, NOW)).toBe("past");
  });

  it("treats an event that ended before now as past", () => {
    const e = mk(
      "published",
      "2026-04-19T10:00:00.000Z",
      "2026-04-19T12:00:00.000Z",
    );
    expect(lifecycleOf(e, NOW)).toBe("past");
  });

  it("exports the fallback constant as ~2h", () => {
    // Sanity check — any change should be a deliberate product decision.
    expect(MANAGE_LIVE_FALLBACK_MS).toBe(2 * 60 * 60 * 1000);
  });
});
