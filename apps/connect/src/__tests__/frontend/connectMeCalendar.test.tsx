/**
 * The phone's month calendar on Me (founder, 2026-11-25): months scroll down from this one, each name large; today wears
 * a soft gold; an event is a bar in each of its days (SAST); a day with events opens its list, and an item opens the event.
 */
import React from "react";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Ev = { id: string; title: string; startsAt?: string; endsAt?: string; date?: string; time?: string; location?: string; category?: string };
type MeApi = {
  MonthCalendar: React.ComponentType<{ events: Ev[]; onOpen: (id: string) => void }>;
  eventDays: (events: Ev[]) => Map<string, Ev[]>;
};

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
let M: MeApi;
// 2026-10-10 10:00 in Pretoria
const NOW = Date.UTC(2026, 9, 10, 8, 0, 0);

beforeAll(() => {
  new Function("window", "React", "document", read("src/frontend/app/connect-me.jsx"))(window, React, document);
  M = (window as unknown as { ConnectMe: MeApi }).ConnectMe;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("eventDays", () => {
  it("files an event under each SAST day it runs, once per event id, and skips undated ones", () => {
    const days = M.eventDays([
      // 23:30 UTC on the 14th is 01:30 on the 15th in Pretoria
      { id: "late", title: "Late", startsAt: "2026-10-14T23:30:00Z" },
      { id: "camp", title: "Camp", startsAt: "2026-10-20T06:00:00Z", endsAt: "2026-10-22T12:00:00Z" },
      { id: "camp", title: "Camp again (same id)", startsAt: "2026-10-20T06:00:00Z" },
      { id: "nodate", title: "No date" },
      { id: "plain", title: "Plain", date: "2026-11-02" },
    ]);
    expect(days.get("2026-10-15")!.map((e) => e.id)).toEqual(["late"]);
    expect(days.has("2026-10-14")).toBe(false);
    expect(["2026-10-20", "2026-10-21", "2026-10-22"].map((k) => days.get(k)!.map((e) => e.id))).toEqual([["camp"], ["camp"], ["camp"]]);
    expect(days.has("2026-10-23")).toBe(false);
    expect(days.get("2026-11-02")!.map((e) => e.id)).toEqual(["plain"]);
    expect([...days.values()].flat().some((e) => e.id === "nodate")).toBe(false);
  });

  it("caps a runaway end at a month, and treats an end before the start as a one-day event", () => {
    const days = M.eventDays([
      { id: "long", title: "Long", startsAt: "2026-10-01T08:00:00Z", endsAt: "2027-06-01T08:00:00Z" },
      { id: "back", title: "Backwards", startsAt: "2026-12-05T08:00:00Z", endsAt: "2026-12-01T08:00:00Z" },
    ]);
    const long = [...days.entries()].filter(([, l]) => l.some((e) => e.id === "long")).map(([k]) => k);
    expect(long.length).toBe(31);
    expect(long[0]).toBe("2026-10-01");
    expect([...days.entries()].filter(([, l]) => l.some((e) => e.id === "back")).map(([k]) => k)).toEqual(["2026-12-05"]);
  });
});

describe("MonthCalendar", () => {
  it("shows twelve months from this one, Monday first, with today marked", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    render(React.createElement(M.MonthCalendar, { events: [], onOpen: vi.fn() }));
    const months = document.querySelectorAll(".mc-cal-month");
    expect(months.length).toBe(12);
    expect(months[0].querySelector("h3")!.textContent).toBe("October");
    // a later year names itself
    expect(months[3].querySelector("h3")!.textContent).toBe("January2027");
    // 1 October 2026 is a Thursday: three blanks before it
    expect(months[0].querySelectorAll(".mc-cal-day.blank").length).toBe(3);
    const today = document.querySelector(".mc-cal-day[aria-current='date']")!;
    expect(today.getAttribute("data-day")).toBe("2026-10-10");
    expect(today.classList.contains("today")).toBe(true);
    expect(screen.getByText(/Nothing on your calendar yet/)).toBeTruthy();
  });

  it("draws bars in each day of an event; a day opens its list and an item opens the event", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const onOpen = vi.fn();
    render(React.createElement(M.MonthCalendar, {
      onOpen,
      events: [
        { id: "camp", title: "Youth camp", startsAt: "2026-10-20T06:00:00Z", endsAt: "2026-10-21T12:00:00Z", time: "08:00", location: "Hartbeespoort", category: "youth-students" },
        { id: "a", title: "One", startsAt: "2026-10-20T08:00:00Z" },
        { id: "b", title: "Two", startsAt: "2026-10-20T09:00:00Z" },
      ],
    }));
    const day = (k: string) => document.querySelector(`.mc-cal-day[data-day='${k}']`) as HTMLButtonElement;
    expect([...day("2026-10-20").querySelectorAll("i")].map((i) => i.textContent)).toEqual(["Youth camp", "One"]);
    expect(day("2026-10-20").querySelector("small")!.textContent).toBe("+1");
    expect([...day("2026-10-21").querySelectorAll("i")].map((i) => i.textContent)).toEqual(["Youth camp"]);
    // a day without events cannot be pressed
    expect(day("2026-10-22").disabled).toBe(true);
    fireEvent.click(day("2026-10-21"));
    expect(day("2026-10-21").getAttribute("aria-pressed")).toBe("true");
    const list = document.querySelector(".mc-cal-list") as HTMLElement;
    fireEvent.click(within(list).getByText("Youth camp"));
    expect(onOpen).toHaveBeenCalledWith("camp");
    // the same day again folds the list away
    fireEvent.click(day("2026-10-21"));
    expect(document.querySelector(".mc-cal-list")).toBeNull();
  });
});
