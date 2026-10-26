import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, makeSeed, FIXED_NOW, openListing } from "./support/map-v2";
import { touchSession, swipe, recordPointerEvents, pointerCounts, resetPointerCounts } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  The Nearby list at the bottom of the sheet (tracker P2-01, founder D2: beside the profile page).
//  The closest listings the map is drawing, nearest first, for a Contributor, a Place and an Event alike.
//  The page's own ordering code is not reused here: the expected list is worked out from the seed rows.
//  Fingers go through CDP touch (e2e/support/touch.ts).
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown> & { id: string };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = (o: Record<string, unknown> = {}) =>
  makeSeed({ contributors: 4, places: 4, events: 4, now: FIXED_NOW, spread: 0.02, seed: 11, ...o }) as unknown as Seed;

type Thing = { id: string; type: "contributor" | "place" | "event"; name: string; lat: number; lng: number; organiser?: string };
const things = (s: Seed): Thing[] => [
  ...s.contributors.map((c) => ({ id: c.id, type: "contributor" as const, name: String(c.full_name), lat: Number(c.physical_latitude), lng: Number(c.physical_longitude) })),
  ...s.places.map((p) => ({ id: p.id, type: "place" as const, name: String(p.name), lat: Number(p.latitude), lng: Number(p.longitude) })),
  ...s.events.map((e) => ({ id: e.id, type: "event" as const, name: String(e.title), lat: Number(e.latitude), lng: Number(e.longitude), organiser: String(e.created_by) })),
];
const metres = (a: Thing, b: Thing) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
};
/** What the list should show for `from`: nearest first, within 10 km, at most 8, without what is already on the sheet. */
function expected(s: Seed, from: Thing): { name: string; m: number }[] {
  const own = from.type === "contributor" ? new Set(s.events.filter((e) => e.created_by === from.id).map((e) => e.id)) : new Set<string>();
  return things(s)
    .filter((t) => !(t.id === from.id && t.type === from.type) && !own.has(t.id) && !(from.type === "event" && t.id === from.organiser))
    .map((t) => ({ name: t.name, m: metres(from, t) }))
    .filter((t) => t.m <= 10_000)
    .sort((a, b) => a.m - b.m || a.name.localeCompare(b.name))
    .slice(0, 8);
}

const SHEET = "[data-mv2='sheet']";
const NEARBY = "[data-mv2='nearby']";
const sheet = (page: Page) => page.locator(SHEET);
const snapOf = (page: Page) => sheet(page).getAttribute("data-snap");
const rowTitles = (page: Page) => page.locator(`${NEARBY} [data-mv2='row-title']`).allTextContents();

async function openSheetOn(page: Page, seed: Seed, who: Thing) {
  await recordPointerEvents(page);
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 3 });
  await openMap(page, "/?map=v2", 4);
  await page.evaluate(
    ([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }),
    [who.lng, who.lat],
  );
  await openListing(page, who.id, "tap");
  await expect(sheet(page)).toBeVisible();
  await expect.poll(() => snapOf(page)).toBe("half");
  await page.waitForTimeout(400);
}
async function toFull(page: Page) {
  for (let i = 0; i < 3 && (await snapOf(page)) !== "full"; i++) {
    await page.locator("[data-mv2='handle']").tap();
    await page.waitForTimeout(300);
  }
  expect(await snapOf(page)).toBe("full");
}
const scrollEnd = (page: Page) => page.locator("[data-mv2='scroller']").evaluate((e) => { e.scrollTop = e.scrollHeight; });

test.describe("P2-01 the Nearby list (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a Contributor's full sheet ends with Nearby: the closest listings, nearest first, without itself or its own events", async ({ page }) => {
    const seed = seedOf();
    const me = things(seed)[0];
    // its own event sits right beside it: without the rule it would head the list
    const own = seed.events.find((e) => e.created_by === me.id)!;
    own.latitude = me.lat + 0.0003;
    own.longitude = me.lng;
    await openSheetOn(page, seed, me);
    await toFull(page);
    await scrollEnd(page);
    await expect(page.locator(NEARBY)).toBeVisible();
    await expect(page.locator(`${NEARBY} [data-mv2='near-title']`)).toHaveText("Nearby");
    const want = expected(seed, me);
    expect(want.length).toBeGreaterThan(3);
    expect(await rowTitles(page)).toEqual(want.map((w) => w.name));
    // never itself, never an event it organises (that is its Events tab)
    const shown = await rowTitles(page);
    expect(shown).not.toContain(me.name);
    for (const e of seed.events.filter((x) => x.created_by === me.id)) expect(shown).not.toContain(String(e.title));
    expect(shown.length).toBeGreaterThan(0);
    // each row says how far, in words, nearest first
    const metas = await page.locator(`${NEARBY} [data-mv2='row-meta']`).allTextContents();
    expect(metas).toHaveLength(want.length);
    for (const m of metas) expect(m).toMatch(/(Under 100 m|\d+ m|[\d.]+ km) away$/);
  });

  test("a Place and an Event get the list too (an Event does not list its own organiser)", async ({ page, browser }) => {
    const seed = seedOf();
    const all = things(seed);
    const place = all.find((t) => t.type === "place")!;
    await openSheetOn(page, seed, place);
    await toFull(page);
    await scrollEnd(page);
    expect(await rowTitles(page)).toEqual(expected(seed, place).map((w) => w.name));

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p2 = await ctx.newPage();
    const ev = all.find((t) => t.type === "event")!;
    await openSheetOn(p2, seed, ev);
    await toFull(p2);
    await scrollEnd(p2);
    const got = await rowTitles(p2);
    expect(got).toEqual(expected(seed, ev).map((w) => w.name));
    expect(got).not.toContain(all.find((t) => t.id === ev.organiser)!.name);
    await ctx.close();
  });

  test("every row is a button at least 44 px tall", async ({ page }) => {
    const seed = seedOf();
    await openSheetOn(page, seed, things(seed)[0]);
    await toFull(page);
    await scrollEnd(page);
    const rows = page.locator(`${NEARBY} button[data-mv2='card2']`);
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) expect((await rows.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("tapping a row opens that listing in the same sheet, whatever its kind: back at half, one sheet, no new history entry, Back closes it", async ({ page }) => {
    const seed = seedOf();
    const me = things(seed)[0];
    await openSheetOn(page, seed, me);
    const all = things(seed);
    const len0 = await page.evaluate(() => history.length);
    // Contributor -> Place -> Event -> Contributor: every hop changes the kind of listing, so the type travels with the id
    let from = me;
    for (const kind of ["place", "event", "contributor"] as const) {
      await toFull(page);
      await scrollEnd(page);
      const want = expected(seed, from);
      const target = want.find((w) => all.find((t) => t.name === w.name)!.type === kind)!;
      expect(target, `a ${kind} row near ${from.name}`).toBeTruthy();
      await page.locator(`${NEARBY} button[data-mv2='card2']`).filter({ has: page.locator("[data-mv2='row-title']", { hasText: new RegExp("^" + target.name + "$") }) }).tap();
      await expect(page.locator("[data-mv2='name']")).toHaveText(target.name);
      await expect.poll(() => snapOf(page)).toBe("half");
      await page.waitForTimeout(400);
      await expect(sheet(page)).toHaveCount(1);
      expect(await page.evaluate(() => history.length)).toBe(len0);
      // the sheet starts again at the top, and the picked pin is selected and clear of the sheet
      expect(await page.locator("[data-mv2='scroller']").evaluate((e) => e.scrollTop)).toBe(0);
      const picked = all.find((t) => t.name === target.name)!;
      const pin = page.locator(`.maplibregl-marker[data-cc-id="${picked.id}"]`);
      const sheetTop = (await sheet(page).boundingBox())!.y;
      await expect.poll(async () => { const bx = await pin.boundingBox(); return bx ? bx.y + bx.height : 9999; }, { timeout: 4000 }).toBeLessThan(sheetTop);
      from = picked;
    }
    // Back closes the whole sheet at once (D6): one entry, however many listings were opened
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
  });

  test("a swipe that starts on a row scrolls the content: it does not tap the row and does not move the sheet", async ({ page }) => {
    const seed = seedOf();
    const me = things(seed)[0];
    await openSheetOn(page, seed, me);
    await toFull(page);
    await scrollEnd(page);
    const cdp = await touchSession(page);
    const scroller = page.locator("[data-mv2='scroller']");
    const before = await scroller.evaluate((e) => e.scrollTop);
    expect(before).toBeGreaterThan(0);
    // a row that is fully inside the scrolling area (the first rows can sit behind the header once scrolled)
    const area = (await scroller.boundingBox())!;
    const rows = page.locator(`${NEARBY} button[data-mv2='card2']`);
    let b: { x: number; y: number; width: number; height: number } | null = null;
    for (let i = 0; i < (await rows.count()) && !b; i++) {
      const r = (await rows.nth(i).boundingBox())!;
      if (r.y > area.y + 8 && r.y + r.height < area.y + area.height - 8) b = r;
    }
    expect(b, "a row inside the scrolling area").not.toBeNull();
    await resetPointerCounts(page);
    await swipe(cdp, { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }, 160, { ms: 400, steps: 14 });
    await expect.poll(() => scroller.evaluate((e) => e.scrollTop), { timeout: 3000 }).toBeLessThan(before - 40);
    expect(await snapOf(page)).toBe("full");
    await expect(page.locator("[data-mv2='name']")).toHaveText(me.name);     // the row was not tapped
    // control: the browser did take that swipe for scrolling (a swipe that went nowhere would pass the lines above)
    expect((await pointerCounts(page)).pointercancel ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("nothing within 10 km: no Nearby section at all (no empty box)", async ({ page }) => {
    const seed = seedOf();
    // move every other listing about 55 km north
    for (const list of [seed.contributors.slice(1), seed.places, seed.events]) {
      for (const r of list) {
        if ("physical_latitude" in r) r.physical_latitude = Number(r.physical_latitude) + 0.5;
        else r.latitude = Number(r.latitude) + 0.5;
      }
    }
    const me = things(seed)[0];
    await openSheetOn(page, seed, me);
    await toFull(page);
    await scrollEnd(page);
    await expect(page.locator(NEARBY)).toHaveCount(0);
    await expect(page.locator("[data-mv2='view-full']")).toBeVisible();
  });

  test("control: the same data does list them when they are near (the section is not simply hidden)", async ({ page }) => {
    const seed = seedOf();
    await openSheetOn(page, seed, things(seed)[0]);
    await toFull(page);
    await scrollEnd(page);
    await expect(page.locator(NEARBY)).toBeVisible();
  });
});
