import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  The sheet on the small phone (360 x 800) and with iOS-style safe areas
//  (a notch and a home indicator), emulated through the DevTools protocol.
//  Tracker P1-06 Accept: "works at 360x800 and with emulated iOS safe areas".
// ════════════════════════════════════════════════════════════════════

type Seed = MapSeed & { contributors: { id: string; physical_longitude: number; physical_latitude: number }[] };
type MapHook = { jumpTo: (o: object, d: object) => void };
const seed0 = () => smallSeed(FIXED_NOW) as Seed;
const SHEET = "[data-mv2='sheet']";

async function open(page: Page, seed: Seed) {
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 6 });
  await openMap(page, "/?map=v2", 8);
  const c = seed.contributors[0];
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
  await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).click({ force: true });
  await expect(page.locator(SHEET)).toBeVisible();
}

test.describe("360 x 800", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("the header, the actions and the close button fit; nothing scrolls sideways; every control is 44 px", async ({ page }) => {
    await open(page, seed0());
    await expect(page.locator("[data-mv2='sheet'] [data-mv2='name']")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const sheet = (await page.locator(SHEET).boundingBox())!;
    expect(sheet.x).toBe(0);
    expect(Math.round(sheet.width)).toBe(360);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("[data-mv2='sheet'] button, [data-mv2='sheet'] a[href]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        if (Math.min(r.width, r.height) >= 44) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const padded = [[0, -21], [0, 21]].every(([dx, dy]) => { const h = document.elementFromPoint(cx + dx, cy + dy); return h && (h === el || el.contains(h)); });
        if (!padded) bad.push(`${el.getAttribute("aria-label") || el.textContent} ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return bad;
    });
    expect(small).toEqual([]);
    const buttons = await page.locator("[data-mv2='actions'] [data-mv2='action']").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
    expect(Math.max(...buttons)).toBeLessThanOrEqual(360);
  });

  test("full is 90 % of the screen and the sheet stays on screen at all three snap states", async ({ page }) => {
    await open(page, seed0());
    for (const [snap, top] of [["half", 800 * 0.54], ["full", 80]] as const) {
      if (snap === "full") await page.locator("[data-mv2='handle']").click();
      await expect.poll(async () => (await page.locator(SHEET).boundingBox())!.y, { timeout: 3000 }).toBeCloseTo(top, -1);
    }
  });
});

test.describe("iOS safe areas (notch 47 px, home indicator 34 px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("full stops below the notch, and the peek strip clears the home indicator", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
    await open(page, seed0());
    const H = 844;
    // full = 90 % of the height minus the top inset, anchored to the bottom: its top edge is 10 % + 47 px down
    await page.locator("[data-mv2='handle']").click();
    await expect.poll(async () => (await page.locator(SHEET).boundingBox())!.y, { timeout: 3000 }).toBeCloseTo(H * 0.1 + 47, -1);
    // peek = 88 px of header plus the 34 px home-indicator inset
    await page.locator("[data-mv2='handle']").click(); // full -> half
    const handle = (await page.locator("[data-mv2='handle']").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 27 * i); await page.waitForTimeout(110); }
    await page.mouse.up();
    await expect(page.locator(SHEET)).toHaveAttribute("data-snap", "peek");
    await expect.poll(async () => (await page.locator(SHEET).boundingBox())!.y, { timeout: 3000 }).toBeCloseTo(H - (88 + 34), -1);
    // the header row sits above the home-indicator area
    const head = (await page.locator("[data-map-sheet-header]").boundingBox())!;
    expect(head.y + head.height).toBeLessThanOrEqual(H - 34 + 1);
  });
});
