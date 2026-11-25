/**
 * Dated discovery windows (map-v2-time.jsx; QA 2026-11-25, CCQA-0005). Johannesburg is a fixed UTC+2, so every instant
 * below is written in UTC and the comment gives the local time. The weekend runs Friday 17:00 to Monday 00:00.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Range = { start: number; end: number };
type T = {
  todayRange: (now: number) => Range;
  nextDaysRange: (now: number, d?: number) => Range;
  weekendRange: (now: number) => Range;
  overlaps: (s: unknown, e: unknown, r: Range) => boolean;
  dateLine: (t: unknown) => string;
};
let Tm: T;
beforeAll(() => {
  const win = loadFrontend("map-v2-strings.jsx");
  Tm = loadFrontend("map-v2-time.jsx", win).MapV2Time as T;
});
const at = (iso: string) => Date.parse(iso);

describe("weekendRange", () => {
  const FRI_17 = at("2026-11-27T15:00:00Z"); // Fri 27 Nov 17:00 SAST
  const MON_00 = at("2026-11-29T22:00:00Z"); // Mon 30 Nov 00:00 SAST
  it("on a Wednesday it is the coming weekend", () => {
    expect(Tm.weekendRange(at("2026-11-25T10:00:00Z"))).toEqual({ start: FRI_17, end: MON_00 });
  });
  it("on Friday, Saturday and Sunday it is the weekend under way", () => {
    for (const now of ["2026-11-27T08:00:00Z", "2026-11-28T10:00:00Z", "2026-11-29T21:59:00Z"]) {
      expect(Tm.weekendRange(at(now))).toEqual({ start: FRI_17, end: MON_00 });
    }
  });
  it("at 00:30 on Monday (22:30 UTC on Sunday) the next weekend is meant", () => {
    const r = Tm.weekendRange(at("2026-11-29T22:30:00Z"));
    expect(r.start).toBe(at("2026-12-04T15:00:00Z"));
  });
});

describe("todayRange and nextDaysRange", () => {
  it("today is Johannesburg's day, not UTC's (23:30 UTC is already tomorrow)", () => {
    const r = Tm.todayRange(at("2026-11-25T23:30:00Z")); // Thu 26 Nov 01:30 SAST
    expect(r.start).toBe(at("2026-11-25T22:00:00Z"));
    expect(r.end).toBe(at("2026-11-26T22:00:00Z"));
  });
  it("the next 7 days run from now to the end of the 7th day", () => {
    const now = at("2026-11-25T10:00:00Z");
    expect(Tm.nextDaysRange(now, 7)).toEqual({ start: now, end: at("2026-12-01T22:00:00Z") });
  });
});

describe("overlaps", () => {
  const weekend = { start: at("2026-11-27T15:00:00Z"), end: at("2026-11-29T22:00:00Z") };
  it("an event inside the window counts", () => expect(Tm.overlaps("2026-11-28T16:00:00Z", "", weekend)).toBe(true));
  it("a camp that began on Thursday and runs into Saturday counts", () => {
    expect(Tm.overlaps("2026-11-26T08:00:00Z", "2026-11-28T12:00:00Z", weekend)).toBe(true);
  });
  it("Friday at 16:00 (before the weekend starts) does not, nor next Monday", () => {
    expect(Tm.overlaps("2026-11-27T14:00:00Z", "2026-11-27T14:30:00Z", weekend)).toBe(false);
    expect(Tm.overlaps("2026-11-29T22:00:00Z", "", weekend)).toBe(false);
  });
  it("no start means no match", () => expect(Tm.overlaps("", "", weekend)).toBe(false));
});

describe("dateLine", () => {
  it("reads in Johannesburg time", () => expect(Tm.dateLine("2026-11-28T16:00:00Z")).toBe("Sat 28 Nov · 18:00"));
});
