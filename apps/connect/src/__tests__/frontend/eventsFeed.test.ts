/**
 * The events feed request (tracker C11, `eventsFeedPath` in `src/frontend/app/data.jsx`).
 *
 * `/api/v1/events` is ordered by start date, oldest first, one page of at most 100 rows, finished events included. A request
 * with no start date fills with finished events once 100 exist and the upcoming ones fall off the page. These tests fail if
 * the map goes back to asking for page 1 unqualified.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Data = { eventsFeedPath: (now?: Date) => string };
let DATA: Data;

beforeAll(() => {
  DATA = loadFrontend("data.jsx").DATA as Data;
});

const fromOf = (path: string) => new URL(path, "https://x.example").searchParams.get("from");

describe("eventsFeedPath: always says where to start", () => {
  it("asks for a page of 100 from local midnight the day before today", () => {
    const now = new Date(2026, 9, 10, 15, 30); // local time, whatever the machine's zone
    const url = new URL(DATA.eventsFeedPath(now), "https://x.example");
    expect(url.pathname).toBe("/api/v1/events");
    expect(url.searchParams.get("limit")).toBe("100");
    const from = new Date(url.searchParams.get("from") as string);
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([2026, 9, 9, 0, 0, 0]);
  });

  it("keeps the margin across a month and a year boundary", () => {
    const first = new Date(fromOf(DATA.eventsFeedPath(new Date(2026, 10, 1, 0, 5))) as string);
    expect([first.getMonth(), first.getDate()]).toEqual([9, 31]);
    const newYear = new Date(fromOf(DATA.eventsFeedPath(new Date(2027, 0, 1, 23, 59))) as string);
    expect([newYear.getFullYear(), newYear.getMonth(), newYear.getDate()]).toEqual([2026, 11, 31]);
  });

  it("never starts later than the start of today, so nothing that is on today is cut", () => {
    for (const hour of [0, 1, 12, 23]) {
      const now = new Date(2026, 5, 15, hour, 59);
      const from = Date.parse(fromOf(DATA.eventsFeedPath(now)) as string);
      expect(from).toBeLessThanOrEqual(new Date(2026, 5, 15).getTime());
      expect(from).toBeGreaterThanOrEqual(new Date(2026, 5, 15).getTime() - 25 * 3_600_000);
    }
  });

  it("uses today's date by default", () => {
    const from = Date.parse(fromOf(DATA.eventsFeedPath()) as string);
    expect(Math.abs(Date.now() - from)).toBeLessThan(50 * 3_600_000);
  });
});

describe("the store uses it", () => {
  const store = readFileSync(join(process.cwd(), "src/frontend/app/store.jsx"), "utf8");

  it("the live feed is fetched through eventsFeedPath, never as a bare page 1", () => {
    expect(store).toContain("fetch(base + DATA.eventsFeedPath())");
    expect(store).not.toMatch(/\/api\/v1\/events\?limit=100['"]/);
  });
});
