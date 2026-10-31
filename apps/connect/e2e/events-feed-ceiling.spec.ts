import { test, expect, type Route } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Events feed ceiling (tracker C11).
//  /api/v1/events returns the oldest events first and at most 100 per page, past ones included. The map used to ask
//  for page 1 with no start date, so once 100 finished events existed the UPCOMING ones never arrived. This spec
//  stands in for the server with that exact behaviour (order by date, honour `from`, cut at `limit`): with the old
//  request the 120 finished events fill the page and the map loses the two upcoming ones.
// ════════════════════════════════════════════════════════════════════

type EventRow = Record<string, unknown> & { id: string; date: string };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { events: EventRow[] };
const DAY = 86_400_000;
const pastId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

/** 120 finished events, one a day, ending a fortnight before the frozen "now". */
function finishedEvents(template: EventRow): EventRow[] {
  return Array.from({ length: 120 }, (_, i) => {
    const start = FIXED_NOW - (14 + 120 - i) * DAY;
    return { ...template, id: pastId(i + 1), title: `Finished ${i + 1}`, date: new Date(start).toISOString(), end_time: new Date(start + 7_200_000).toISOString() };
  });
}

async function openWithBusyFeed(page: import("@playwright/test").Page) {
  const seed = seed0();
  const upcoming = seed.events;
  const everything = [...finishedEvents(upcoming[0]), ...upcoming].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const asked: string[] = [];
  await mockMapNetwork(page, seed, async (p) => {
    await p.route("**/api/v1/events?**", (route: Route) => {
      const url = new URL(route.request().url());
      asked.push(url.search);
      const fromRaw = url.searchParams.get("from");
      const from = fromRaw ? Date.parse(fromRaw) : -Infinity;
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
      const rows = everything.filter((e) => Date.parse(e.date) >= from).slice(0, limit);
      return route.fulfill({ json: { data: rows, meta: { count: rows.length, limit, offset: 0 } } });
    });
  });
  await openMap(page, "/?map=v2", 4);
  return { upcoming, asked };
}

test.describe("C11: the events feed ceiling", () => {
  test("upcoming events still reach the map when more than 100 finished events exist", async ({ page }) => {
    const { upcoming } = await openWithBusyFeed(page);
    for (const e of upcoming) await expect(page.locator(`.maplibregl-marker[data-cc-id="${e.id}"]`)).toHaveCount(1);
    await expect(page.locator(`.maplibregl-marker[data-cc-id="${pastId(1)}"]`)).toHaveCount(0);
  });

  test("the map asks for events from the start of the day before today, in the visitor's own calendar", async ({ page }) => {
    const { asked } = await openWithBusyFeed(page);
    expect(asked.length).toBeGreaterThan(0);
    const from = new URLSearchParams(asked[0]).get("from");
    expect(from).toBeTruthy();
    const check = await page.evaluate((raw) => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const t = Date.parse(raw as string);
      return { notLaterThanTodayStart: t <= midnight, notEarlierThanADayBefore: t >= midnight - 25 * 3_600_000, localMidnight: new Date(t).getHours() === 0 && new Date(t).getMinutes() === 0 };
    }, from);
    expect(check).toEqual({ notLaterThanTodayStart: true, notEarlierThanADayBefore: true, localMidnight: true });
  });
});
