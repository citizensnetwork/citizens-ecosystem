import { describe, it, expect } from "vitest";
import { isWeekendEvent } from "@/lib/weekendTag";

// Reference dates (all UTC):
//   2026-04-13 Mon | 2026-04-14 Tue | 2026-04-15 Wed | 2026-04-16 Thu
//   2026-04-17 Fri | 2026-04-18 Sat | 2026-04-19 Sun | 2026-04-20 Mon

describe("isWeekendEvent", () => {
  it("returns false for a Monday morning event with no end_time", () => {
    expect(
      isWeekendEvent({ date: "2026-04-13T09:00:00Z", end_time: null })
    ).toBe(false);
  });

  it("returns false for a Tue→Wed span", () => {
    expect(
      isWeekendEvent({
        date: "2026-04-14T09:00:00Z",
        end_time: "2026-04-15T18:00:00Z",
      })
    ).toBe(false);
  });

  it("returns true for a Saturday-only event", () => {
    expect(
      isWeekendEvent({ date: "2026-04-18T10:00:00Z", end_time: null })
    ).toBe(true);
  });

  it("returns true for a Sunday-only event", () => {
    expect(
      isWeekendEvent({ date: "2026-04-19T08:00:00Z", end_time: null })
    ).toBe(true);
  });

  it("returns true for a Friday event starting at 17:00 UTC", () => {
    expect(
      isWeekendEvent({ date: "2026-04-17T17:00:00Z", end_time: null })
    ).toBe(true);
  });

  it("returns true for a Friday event starting at 18:00 UTC", () => {
    expect(
      isWeekendEvent({ date: "2026-04-17T18:00:00Z", end_time: null })
    ).toBe(true);
  });

  it("returns false for a Friday morning event with no end_time", () => {
    expect(
      isWeekendEvent({ date: "2026-04-17T10:00:00Z", end_time: null })
    ).toBe(false);
  });

  it("returns false for a Friday daytime span ending at 16:00 UTC", () => {
    expect(
      isWeekendEvent({
        date: "2026-04-17T09:00:00Z",
        end_time: "2026-04-17T16:00:00Z",
      })
    ).toBe(false);
  });

  it("returns true for a Friday span that ends after 17:00 UTC", () => {
    expect(
      isWeekendEvent({
        date: "2026-04-17T10:00:00Z",
        end_time: "2026-04-17T19:00:00Z",
      })
    ).toBe(true);
  });

  it("returns true for a Thu→Sat span (touches Saturday)", () => {
    expect(
      isWeekendEvent({
        date: "2026-04-16T09:00:00Z",
        end_time: "2026-04-18T12:00:00Z",
      })
    ).toBe(true);
  });

  it("returns true for a Thu→Fri 18:00 span (touches Friday 17:00+)", () => {
    expect(
      isWeekendEvent({
        date: "2026-04-16T09:00:00Z",
        end_time: "2026-04-17T18:00:00Z",
      })
    ).toBe(true);
  });

  it("returns false for a Thu→Fri 16:00 span (Friday daytime only)", () => {
    expect(
      isWeekendEvent({
        date: "2026-04-16T09:00:00Z",
        end_time: "2026-04-17T16:00:00Z",
      })
    ).toBe(false);
  });

  it("returns true for a Mon→Mon week-long span (covers Sat/Sun)", () => {
    expect(
      isWeekendEvent({
        date: "2026-04-13T09:00:00Z",
        end_time: "2026-04-20T09:00:00Z",
      })
    ).toBe(true);
  });

  it("returns false for an invalid date string", () => {
    expect(isWeekendEvent({ date: "not-a-date", end_time: null })).toBe(false);
  });

  it("returns false for an invalid end_time", () => {
    expect(
      isWeekendEvent({ date: "2026-04-13T09:00:00Z", end_time: "garbage" })
    ).toBe(false);
  });

  it("does not throw on a >1-year span", () => {
    // The MAX_DAYS=366 guard is purely defensive (real inputs always hit
    // Sat/Sun within 7 days and short-circuit). This test only asserts
    // that absurd input never throws.
    expect(() =>
      isWeekendEvent({
        date: "2026-04-13T09:00:00Z",
        end_time: "2030-04-13T09:00:00Z",
      })
    ).not.toThrow();
  });
});
