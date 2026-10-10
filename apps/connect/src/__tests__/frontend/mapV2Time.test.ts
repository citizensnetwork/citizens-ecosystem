/**
 * Map v2 time and freshness labels (`src/frontend/app/map-v2-time.jsx`, tracker P1-05).
 * Pure functions with `now` injected, evaluated against fixed instants in
 * Africa/Johannesburg (UTC+2, no daylight saving). The point of the file is
 * TRUTHFULNESS (Q2): "open" is said only when the hours text was understood in
 * full; anything else is `unknown` and the UI shows no open state.
 *
 * Calendar used below: 2026-10-10 is a Saturday, so 14 Oct is a Wednesday,
 * 16 Oct a Friday, 17 Oct a Saturday, 18 Oct a Sunday.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type OpenState = { status: "open" | "closed" | "unknown"; text: string };
type Time = {
  openState: (hours: unknown, now: number) => OpenState;
  eventStartsIn: (start: unknown, now: number, end?: unknown) => string | null;
  postedAgo: (time: unknown, now: number) => string | null;
  parseHours: (text: unknown) => { days: [number, number][][] } | null;
};

let T: Time;
beforeAll(() => {
  const win: Record<string, unknown> = {};
  loadFrontend("map-v2-strings.jsx", win);
  loadFrontend("map-v2-time.jsx", win);
  T = win.MapV2Time as Time;
});

/** An instant given as Johannesburg wall-clock time. */
const sast = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 2, mi);
const WORKWEEK = "Mon-Fri 08:00-17:00";

describe("openState: a weekday range", () => {
  it("is open inside the hours and says when it closes", () => {
    expect(T.openState(WORKWEEK, sast(2026, 10, 14, 10, 0))).toEqual({ status: "open", text: "Open · closes 17:00" });
    expect(T.openState(WORKWEEK, sast(2026, 10, 14, 8, 0)).status).toBe("open"); // the opening minute is open
  });

  it("is closed at the closing minute and after it, and says when it opens next", () => {
    expect(T.openState(WORKWEEK, sast(2026, 10, 14, 17, 0)).status).toBe("closed");
    expect(T.openState(WORKWEEK, sast(2026, 10, 14, 18, 0))).toEqual({ status: "closed", text: "Closed · opens tomorrow 08:00" });
  });

  it("opens later today when the day has not started yet", () => {
    expect(T.openState(WORKWEEK, sast(2026, 10, 14, 7, 0))).toEqual({ status: "closed", text: "Closed · opens 08:00" });
  });

  it("a day with no hours is a closed day", () => {
    expect(T.openState(WORKWEEK, sast(2026, 10, 17, 12, 0))).toEqual({ status: "closed", text: "Closed today" }); // Saturday
    expect(T.openState("Mon-Sat 09:00-13:00, Sun closed", sast(2026, 10, 18, 11, 0))).toEqual({ status: "closed", text: "Closed today" });
  });

  it("after the last opening of the week it names the next day with hours", () => {
    expect(T.openState("Mon-Fri 08:00-17:00, Sat 09:00-13:00", sast(2026, 10, 16, 18, 0))).toEqual({ status: "closed", text: "Closed · opens tomorrow 09:00" });
    expect(T.openState("Mon-Wed 08:00-17:00", sast(2026, 10, 14, 18, 0))).toEqual({ status: "closed", text: "Closed · opens Mon 08:00" });
  });

  it("two ranges in a day: closed at lunch, opens later today", () => {
    const h = "Mon-Fri 08:00-12:00, 14:00-17:00";
    expect(T.openState(h, sast(2026, 10, 14, 13, 0))).toEqual({ status: "closed", text: "Closed · opens 14:00" });
    expect(T.openState(h, sast(2026, 10, 14, 15, 0)).text).toBe("Open · closes 17:00");
  });
});

describe("openState: open 24 hours", () => {
  it.each(["24 hours", "Open 24 hours", "24/7", "Daily 24 hours", "Always open"])("%s is open at any hour", (hours) => {
    for (const now of [sast(2026, 10, 14, 3, 0), sast(2026, 10, 17, 23, 59)]) expect(T.openState(hours, now)).toEqual({ status: "open", text: "Open 24 hours" });
  });

  it("24 hours on some days only is not 'open 24 hours' the rest of the week", () => {
    expect(T.openState("Mon-Fri 24 hours", sast(2026, 10, 14, 3, 0)).status).toBe("open");
    expect(T.openState("Mon-Fri 24 hours", sast(2026, 10, 17, 3, 0)).status).toBe("closed");
  });
});

describe("openState: crossing midnight", () => {
  const night = "Fri-Sat 20:00-02:00";
  it("is open before midnight on the opening night", () => {
    expect(T.openState(night, sast(2026, 10, 16, 21, 0))).toEqual({ status: "open", text: "Open · closes 02:00" });
  });
  it("is still open after midnight, from the previous day's hours", () => {
    expect(T.openState(night, sast(2026, 10, 17, 1, 0)).status).toBe("open"); // Saturday 01:00 belongs to Friday's night
    expect(T.openState(night, sast(2026, 10, 18, 1, 0)).status).toBe("open"); // Sunday 01:00 belongs to Saturday's night
  });
  it("closes at the end of the range and does not open on the next day by itself", () => {
    expect(T.openState(night, sast(2026, 10, 18, 3, 0)).status).toBe("closed");
    expect(T.openState(night, sast(2026, 10, 16, 1, 0)).status).toBe("closed"); // Friday 01:00 is Thursday night: no hours
  });
});

describe("openState: formats people actually type", () => {
  it("understands am/pm, 'to', en dashes, 'daily', 'weekdays' and day lists", () => {
    expect(T.openState("Mon-Sat 9am-5pm", sast(2026, 10, 14, 10, 0)).text).toBe("Open · closes 17:00");
    expect(T.openState("Monday to Friday 08:00 to 17:00", sast(2026, 10, 14, 10, 0)).status).toBe("open");
    expect(T.openState("Mon–Fri 08:00–17:00", sast(2026, 10, 14, 10, 0)).status).toBe("open");
    expect(T.openState("Daily 06:00-22:00", sast(2026, 10, 18, 7, 0)).status).toBe("open");
    expect(T.openState("Weekdays 08:00-17:00", sast(2026, 10, 14, 10, 0)).status).toBe("open");
    expect(T.openState("Mon, Wed, Fri 09:00-12:00", sast(2026, 10, 15, 10, 0)).text).toBe("Closed today"); // Thursday
    expect(T.openState("Sun 09:00-12:00; Wed 19:00-20:30", sast(2026, 10, 14, 19, 30)).text).toBe("Open · closes 20:30");
  });
});

describe("openState: anything not understood is unknown (and shows nothing)", () => {
  it.each([
    "",
    "   ",
    "By appointment",
    "Varies with the season",
    "Mon-Fri 08:00-17:00 except public holidays",
    "Mon-Fri 8-5", // ambiguous: 8 to 5 who knows
    "Mon-Fri 25:00-26:00",
    "Mon-Fri 08:75-17:00",
    "asdf",
    "Phone for hours",
  ])("%j", (hours) => {
    expect(T.openState(hours, sast(2026, 10, 14, 10, 0))).toEqual({ status: "unknown", text: "" });
  });

  it("non-strings and a bad clock are unknown too", () => {
    expect(T.openState(null, sast(2026, 10, 14, 10, 0)).status).toBe("unknown");
    expect(T.openState(undefined, sast(2026, 10, 14, 10, 0)).status).toBe("unknown");
    expect(T.openState(42, sast(2026, 10, 14, 10, 0)).status).toBe("unknown");
    expect(T.openState(WORKWEEK, Number.NaN).status).toBe("unknown");
  });

  it("never returns 'open' without hours data: sweep every minute of a week against hours that are not understood", () => {
    const start = sast(2026, 10, 12, 0, 0);
    for (let m = 0; m < 7 * 24 * 60; m += 7) expect(T.openState("Phone for hours", start + m * 60_000).status).not.toBe("open");
  });
});

describe("eventStartsIn", () => {
  const now = sast(2026, 10, 14, 10, 0);
  const at = (ms: number) => now + ms;
  const MIN = 60_000, HOUR = 3_600_000;

  it("minutes, then hours, rounded down so it never overstates the wait", () => {
    expect(T.eventStartsIn(at(30 * 1000), now)).toBe("Starting now");
    expect(T.eventStartsIn(at(35 * MIN), now)).toBe("Starts in 35 min");
    expect(T.eventStartsIn(at(59 * MIN + 59_000), now)).toBe("Starts in 59 min");
    expect(T.eventStartsIn(at(2 * HOUR + 20 * MIN), now)).toBe("Starts in 2 h");
    expect(T.eventStartsIn(at(23 * HOUR), now)).toBe("Starts in 23 h");
  });

  it("tomorrow, a weekday this week, then a date", () => {
    expect(T.eventStartsIn(sast(2026, 10, 15, 9, 0), now)).toBe("Starts in 23 h"); // under 24 h away is always hours, even across midnight
    expect(T.eventStartsIn(sast(2026, 10, 15, 11, 0), now)).toBe("Starts tomorrow, 11:00");
    expect(T.eventStartsIn(sast(2026, 10, 17, 9, 0), now)).toBe("Starts Sat, 09:00");
    expect(T.eventStartsIn(sast(2026, 10, 24, 9, 0), now)).toBe("Starts 24 Oct, 09:00");
  });

  it("uses Johannesburg time, 24-hour clock", () => {
    expect(T.eventStartsIn(Date.UTC(2026, 9, 16, 15, 30), now)).toBe("Starts Fri, 17:30"); // 15:30 UTC is 17:30 in Pretoria
  });

  it("is 'Happening now' between start and end, and silent for a past event or a bad value", () => {
    expect(T.eventStartsIn(at(-1 * HOUR), now, at(1 * HOUR))).toBe("Happening now");
    expect(T.eventStartsIn(at(-3 * HOUR), now, at(-1 * HOUR))).toBeNull();
    expect(T.eventStartsIn(at(-1 * HOUR), now)).toBeNull();
    expect(T.eventStartsIn("not a date", now)).toBeNull();
    expect(T.eventStartsIn(null, now)).toBeNull();
  });
});

describe("postedAgo", () => {
  const now = sast(2026, 10, 14, 10, 0);
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  it("just now, minutes, hours", () => {
    expect(T.postedAgo(now - 20_000, now)).toBe("Just now");
    expect(T.postedAgo(now - 5 * MIN, now)).toBe("5 min ago");
    expect(T.postedAgo(now - 3 * HOUR, now)).toBe("3 h ago");
  });
  it("yesterday, days, then a date (with the year only when it is another year)", () => {
    expect(T.postedAgo(sast(2026, 10, 13, 8, 0), now)).toBe("Yesterday");
    expect(T.postedAgo(now - 3 * DAY, now)).toBe("3 days ago");
    expect(T.postedAgo(sast(2026, 10, 4, 12, 0), now)).toBe("4 Oct");
    expect(T.postedAgo(sast(2025, 10, 4, 12, 0), now)).toBe("4 Oct 2025");
  });
  it("a time in the future, or nonsense, is not 'posted'", () => {
    expect(T.postedAgo(now + 2 * HOUR, now)).toBeNull();
    expect(T.postedAgo("nope", now)).toBeNull();
  });
  it("accepts ISO strings and Dates", () => {
    expect(T.postedAgo(new Date(now - 2 * HOUR).toISOString(), now)).toBe("2 h ago");
    expect(T.postedAgo(new Date(now - 2 * HOUR), now)).toBe("2 h ago");
  });
});
