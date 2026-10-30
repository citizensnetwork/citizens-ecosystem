import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed, openPinSheet, bareMapPoint } from "./support/map-v2";
import { touchSession, pinch, swipe, recordPointerEvents, pointerCounts, resetPointerCounts, type Pt } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Pinch zoom on the website (tracker R9, founder yes 2026-10-15).
//  The viewport tag no longer carries maximum-scale=1, so a citizen can pinch-zoom a plain page.
//  The map and the Map v2 sheet still own their two-finger gestures (touch-action), so the page
//  must NOT zoom under them. The Capacitor shell keeps the old block (an inline script puts it back
//  when window.Capacitor says "native"). Everything with fingers goes through CDP touch.
//  `window.visualViewport.scale` is the page zoom: 1 = none.
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; physical_longitude: number; physical_latitude: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[] };

const scale = (page: Page) => page.evaluate(() => window.visualViewport?.scale ?? 1);
const viewportTag = (page: Page) => page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "");
const SHEET = "[data-mv2='sheet']";

type MapApi = { getZoom(): number; jumpTo: (o: object, d: object) => void };
const mapZoom = (page: Page) => page.evaluate(() => (window as unknown as { __ccMap: MapApi }).__ccMap.getZoom());

/**
 * Put the sheet on a state. The handle cycles peek -> half -> full -> half (a tap, not a swipe); there is no tap
 * from half down to peek (the other button closes the sheet), so peek takes the same long slow drag down that
 * map-v2-sheet-touch.spec.ts uses.
 */
async function goTo(page: Page, want: "peek" | "half" | "full") {
  const snapOf = () => page.locator(SHEET).getAttribute("data-snap");
  for (let i = 0; i < 4 && (await snapOf()) !== want; i++) {
    if (want === "peek") {
      if ((await snapOf()) !== "half") await page.locator("[data-mv2='handle']").tap();
      await page.waitForTimeout(300);
      const b = (await page.locator("[data-mv2='actions']").boundingBox())!;
      await swipe(await touchSession(page), { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 24) }, 300, { ms: 1000, steps: 20 });
    } else {
      await page.locator("[data-mv2='handle']").tap();
    }
    await page.waitForTimeout(300);
  }
  expect(await snapOf()).toBe(want);
}

/** A plain screen (the Kingdom list): a normal scrolling page with no gesture handlers of its own. */
async function openPlainPage(page: Page, native = false) {
  if (native) {
    // what the native bridge does at document start: it defines window.Capacitor before any page script runs
    await page.addInitScript(() => {
      (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    });
  }
  await mockMapNetwork(page, seed0());
  await page.goto("/discover");
  await page.waitForSelector('[data-screen="kingdom-discovery"]', { timeout: 20_000 });
}

/** Spread two fingers apart on the page, the way a person zooms in. */
async function spread(page: Page, centre: Pt = { x: 195, y: 420 }) {
  const cdp = await touchSession(page);
  await pinch(cdp, centre, 60, 220, { ms: 500, steps: 16 });
}

test.describe("R9 the website can be pinch zoomed (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the page ships a viewport tag with no zoom block", async ({ page }) => {
    await openPlainPage(page);
    const tag = await viewportTag(page);
    expect(tag).toContain("width=device-width");
    expect(tag).not.toContain("maximum-scale");
    expect(tag).not.toContain("user-scalable");
  });

  test("a pinch on a plain page zooms it (the page scale rises above 1)", async ({ page }) => {
    await openPlainPage(page);
    expect(await scale(page)).toBe(1);
    await spread(page);
    await expect.poll(() => scale(page), { timeout: 4000 }).toBeGreaterThan(1.2);
  });

  test("control: inside the native shell the same pinch on the same page does NOT zoom it", async ({ page }) => {
    await openPlainPage(page, true);
    expect(await viewportTag(page)).toContain("maximum-scale=1");
    await spread(page);
    // the gesture was delivered (the control above zooms); the block holds the scale at 1
    await page.waitForTimeout(800);
    expect(await scale(page)).toBe(1);
  });
});

test.describe("R9 the map and the sheet still handle their own two-finger gestures (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function openOnMap(page: Page) {
    const seed = seed0();
    await recordPointerEvents(page);
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 3 });
    await openMap(page, "/?map=v2", 8);
    return seed;
  }

  test("a pinch on the map zooms the MAP and leaves the page scale at 1", async ({ page }) => {
    await openOnMap(page);
    const cdp = await touchSession(page);
    const z0 = await mapZoom(page);
    // on bare map (#210): the home frames its pins in the open middle, and a touch on a pin is not the map's
    await pinch(cdp, await bareMapPoint(page), 60, 220, { ms: 500, steps: 16 });
    await expect.poll(() => mapZoom(page), { timeout: 4000 }).toBeGreaterThan(z0 + 0.5);
    expect(await scale(page)).toBe(1);
  });

  // At FULL a pinch on the card's content zooms the page (the founder's yes of 2026-10-17, for poor eyesight); at peek and half the
  // sheet still keeps every two-finger gesture. The full case has its own test below.
  for (const snap of ["peek", "half"] as const) {
    test(`a pinch on the sheet at ${snap} leaves the page scale at 1 and the sheet on its snap state`, async ({ page }) => {
      const seed = await openOnMap(page);
      const c = seed.contributors[0];
      await page.evaluate(
        ([lo, la]) => (window as unknown as { __ccMap: MapApi }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }),
        [c.physical_longitude, c.physical_latitude],
      );
      await openPinSheet(page, c.id, "tap");
      const sheet = page.locator(SHEET);
      await expect(sheet).toBeVisible();
      await expect.poll(() => sheet.getAttribute("data-snap")).toBe("half");
      // let the 200 ms slide-in settle before measuring or moving it
      await page.waitForTimeout(400);
      await goTo(page, snap);
      await page.waitForTimeout(400);
      // the middle of the part of the sheet that is on screen (at peek most of it is below the screen edge)
      const b = (await sheet.boundingBox())!;
      const vh = await page.evaluate(() => window.innerHeight);
      const mid = { x: b.x + b.width / 2, y: (b.y + Math.min(b.y + b.height, vh)) / 2 };
      expect(mid.y).toBeLessThan(vh);
      const cdp = await touchSession(page);
      await resetPointerCounts(page);
      await pinch(cdp, mid, 50, 200, { ms: 500, steps: 16 });
      await page.waitForTimeout(600);
      // both fingers reached the page (a pinch that never registered would pass the next line for the wrong reason)
      expect((await pointerCounts(page)).pointerdown).toBeGreaterThanOrEqual(2);
      expect(await scale(page)).toBe(1);
      expect(await sheet.getAttribute("data-snap")).toBe(snap);
    });
  }

  test("at FULL a pinch on the card's content zooms the page, so small text can be enlarged, and the sheet stays at full", async ({ page }) => {
    const seed = await openOnMap(page);
    const c = seed.contributors[0];
    await page.evaluate(
      ([lo, la]) => (window as unknown as { __ccMap: MapApi }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }),
      [c.physical_longitude, c.physical_latitude],
    );
    await openPinSheet(page, c.id, "tap");
    const sheet = page.locator(SHEET);
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    await goTo(page, "full");
    await page.waitForTimeout(400);
    expect(await scale(page)).toBe(1);
    const sb = (await page.locator("[data-mv2='scroller']").boundingBox())!;
    const vh = await page.evaluate(() => window.innerHeight);
    const mid = { x: sb.x + sb.width / 2, y: sb.y + Math.min(sb.height, vh - sb.y) / 2 };
    const cdp = await touchSession(page);
    await pinch(cdp, mid, 50, 200, { ms: 500, steps: 16 });
    await expect.poll(() => scale(page), { timeout: 4000 }).toBeGreaterThan(1.2);
    expect(await sheet.getAttribute("data-snap")).toBe("full");
  });

  test("the rule itself: no zoom allowed on the sheet or its content at peek and half, zoom allowed at full", async ({ page }) => {
    const seed = await openOnMap(page);
    const c = seed.contributors[0];
    await page.evaluate(
      ([lo, la]) => (window as unknown as { __ccMap: MapApi }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }),
      [c.physical_longitude, c.physical_latitude],
    );
    await openPinSheet(page, c.id, "tap");
    await expect(page.locator(SHEET)).toBeVisible();
    await page.waitForTimeout(400);
    const rule = () => page.evaluate(() => {
      const ta = (sel: string) => getComputedStyle(document.querySelector(sel) as Element).touchAction;
      return { sheet: ta("[data-mv2='sheet']"), scroller: ta("[data-mv2='scroller']") };
    });
    expect(await rule()).toEqual({ sheet: "none", scroller: "none" });          // half
    await goTo(page, "full");
    await page.waitForTimeout(400);
    const full = await rule();
    expect(full.sheet).toBe("pinch-zoom");
    expect(full.scroller).toMatch(/pinch-zoom/);                                 // pan-down pinch-zoom at the top, pan-y pinch-zoom once scrolled
    await goTo(page, "half");
    await page.waitForTimeout(400);
    expect(await rule()).toEqual({ sheet: "none", scroller: "none" });          // and back
  });
});
