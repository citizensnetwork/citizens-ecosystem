import { test, expect, type Page } from "@playwright/test";
import { useOldMap } from "./support/app-hooks";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed, openListing } from "./support/map-v2";
import { touchSession, twoFingerSwipe, pinch, rotateGesture, swipe } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Map v2's fixed tilt (tracker R8 / RESUME C23, decision D17).
//  The main map is always drawn at one oblique angle (MapV2.PITCH, 45 degrees);
//  zoom and rotation work as before. A pitch of 0 in map-v2-lib.jsx is the
//  rollback (MapLibre's own defaults: flat, and a person may tilt it).
//  The old map (?map=v1) and the address-picker map stay flat and untouched.
//  Everything with fingers goes through CDP touch (e2e/support/touch.ts).
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; physical_longitude: number; physical_latitude: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[] };
/** The slice of the MapLibre instance (window.__ccMap) these specs touch. */
type MapApi = {
  getPitch(): number; getBearing(): number; getZoom(): number; getMinPitch(): number; getMaxPitch(): number;
  touchPitch: { isEnabled(): boolean };
  getCenter(): { lng: number; lat: number };
  flyTo(o: object): void; easeTo(o: object): void; fitBounds(b: unknown, o: object): void;
};
type Cam = { pitch: number; bearing: number; zoom: number; minPitch: number; maxPitch: number; touchPitch: boolean };
const cam = (page: Page): Promise<Cam> =>
  page.evaluate(() => {
    const m = (window as unknown as { __ccMap: MapApi }).__ccMap;
    return { pitch: m.getPitch(), bearing: m.getBearing(), zoom: m.getZoom(), minPitch: m.getMinPitch(), maxPitch: m.getMaxPitch(), touchPitch: m.touchPitch.isEnabled() };
  });
const PITCH = 45;
const jump = (page: Page, lng: number, lat: number, zoom: number) =>
  page.evaluate(([lo, la, z]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: z }, { originalEvent: {} }), [lng, lat, zoom]);

async function open(page: Page, path = "/?map=v2") {
  const seed = seed0();
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 3 });
  await openMap(page, path, 8);
  return seed;
}

test.describe("R8 fixed tilt: the camera (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Map v2's main map starts tilted and cannot be tilted or flattened", async ({ page }) => {
    await open(page);
    const c = await cam(page);
    expect(c.pitch).toBeCloseTo(PITCH, 1);
    expect(c.minPitch).toBe(PITCH);
    expect(c.maxPitch).toBe(PITCH);
    expect(c.touchPitch).toBe(false);
  });

  test("a two-finger vertical drag does not change the pitch (the same drag does on the old map)", async ({ page }) => {
    await open(page);
    const cdp = await touchSession(page);
    const before = await cam(page);
    await twoFingerSwipe(cdp, { x: 150, y: 420 }, { x: 240, y: 420 }, -220, { ms: 500, steps: 16 });
    await twoFingerSwipe(cdp, { x: 150, y: 300 }, { x: 240, y: 300 }, 260, { ms: 500, steps: 16 });
    const after = await cam(page);
    expect(after.pitch).toBeCloseTo(before.pitch, 5);
    expect(after.pitch).toBeCloseTo(PITCH, 1);
  });

  test("pinch still zooms and a two-finger twist still rotates; neither changes the pitch", async ({ page }) => {
    await open(page);
    const cdp = await touchSession(page);
    const z0 = (await cam(page)).zoom;
    await pinch(cdp, { x: 195, y: 420 }, 60, 220, { ms: 500, steps: 16 });
    await expect.poll(async () => (await cam(page)).zoom, { timeout: 4000 }).toBeGreaterThan(z0 + 0.5);
    const b0 = (await cam(page)).bearing;
    await rotateGesture(cdp, { x: 195, y: 420 }, 90, 70, { ms: 500, steps: 16 });
    await expect.poll(async () => Math.abs((await cam(page)).bearing - b0), { timeout: 4000 }).toBeGreaterThan(10);
    expect((await cam(page)).pitch).toBeCloseTo(PITCH, 1);
  });

  test("a one-finger drag still pans", async ({ page }) => {
    await open(page);
    const cdp = await touchSession(page);
    const c0 = await page.evaluate(() => { const c = (window as unknown as { __ccMap: MapApi }).__ccMap.getCenter(); return [c.lng, c.lat]; });
    await swipe(cdp, { x: 195, y: 400 }, 160, { ms: 400, steps: 14, dx: 60 });
    await expect
      .poll(async () => page.evaluate((c) => { const n = (window as unknown as { __ccMap: MapApi }).__ccMap.getCenter(); return Math.abs(n.lng - c[0]) + Math.abs(n.lat - c[1]); }, c0), { timeout: 4000 })
      .toBeGreaterThan(0);
    expect((await cam(page)).pitch).toBeCloseTo(PITCH, 1);
  });

  test("programmatic camera moves keep the tilt: jumpTo (the spec hook), flyTo, easeTo and fitBounds", async ({ page }) => {
    const seed = await open(page);
    const c = seed.contributors[0];
    await jump(page, c.physical_longitude, c.physical_latitude, 15.5);
    expect((await cam(page)).pitch).toBeCloseTo(PITCH, 1);
    await page.evaluate(() => (window as unknown as { __ccMap: MapApi }).__ccMap.flyTo({ center: [28.2, -25.7], zoom: 12, duration: 0 }));
    expect((await cam(page)).pitch).toBeCloseTo(PITCH, 1);
    await page.evaluate(() => { const m = (window as unknown as { __ccMap: MapApi }).__ccMap; m.easeTo({ center: [28.21, -25.71], duration: 0 }); m.fitBounds([[28.1, -25.8], [28.3, -25.6]], { padding: 70, duration: 0 }); });
    expect((await cam(page)).pitch).toBeCloseTo(PITCH, 1);
  });

  test("keyboard: Shift + Arrow Up / Down (MapLibre's own pitch keys) cannot change it", async ({ page }) => {
    await open(page);
    await page.locator(".maplibregl-canvas").focus();
    for (let i = 0; i < 4; i++) { await page.keyboard.press("Shift+ArrowUp"); await page.keyboard.press("Shift+ArrowDown"); }
    await page.waitForTimeout(400);
    expect((await cam(page)).pitch).toBeCloseTo(PITCH, 1);
  });
});

test.describe("R8 fixed tilt: desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a right-button drag still rotates and never tilts (no pitch with rotate)", async ({ page }) => {
    await open(page);
    const b0 = (await cam(page)).bearing;
    await page.mouse.move(700, 450);
    await page.mouse.down({ button: "right" });
    for (let i = 1; i <= 12; i++) await page.mouse.move(700 + 12 * i, 450 - 14 * i);
    await page.mouse.up({ button: "right" });
    const c = await cam(page);
    expect(Math.abs(c.bearing - b0)).toBeGreaterThan(5);
    expect(c.pitch).toBeCloseTo(PITCH, 1);
  });
});

test.describe("R8 fixed tilt: what must stay flat", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the old map (?map=v1) is untouched: flat, and MapLibre's own defaults apply", async ({ page }) => {
    await useOldMap(page);
    await open(page, "/");
    const c = await cam(page);
    expect(c.pitch).toBe(0);
    expect(c.minPitch).toBe(0);
    expect(c.maxPitch).toBe(60);
    expect(c.touchPitch).toBe(true);
  });
});

test.describe("R8 controls: the same gestures DO tilt the old map (so the tests above can fail)", () => {
  test.describe("touch", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test("a two-finger vertical drag raises the pitch of the old map", async ({ page }) => {
      await useOldMap(page);
      await open(page, "/");
      const cdp = await touchSession(page);
      await twoFingerSwipe(cdp, { x: 150, y: 520 }, { x: 240, y: 520 }, -260, { ms: 500, steps: 16 });
      await expect.poll(async () => (await cam(page)).pitch, { timeout: 4000 }).toBeGreaterThan(10);
    });
  });
  test.describe("desktop", () => {
    test.use({ viewport: { width: 1280, height: 900 } });
    test("a right-button drag changes both bearing and pitch on the old map", async ({ page }) => {
      await useOldMap(page);
      await open(page, "/");
      await page.mouse.move(700, 450);
      await page.mouse.down({ button: "right" });
      for (let i = 1; i <= 12; i++) await page.mouse.move(700 + 12 * i, 450 - 14 * i);
      await page.mouse.up({ button: "right" });
      const c = await cam(page);
      expect(Math.abs(c.bearing)).toBeGreaterThan(5);
      expect(c.pitch).toBeGreaterThan(10);
    });
    test("Shift + Arrow Up raises the pitch of the old map", async ({ page }) => {
      await useOldMap(page);
      await open(page, "/");
      await page.locator(".maplibregl-canvas").focus();
      for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowUp");
      await expect.poll(async () => (await cam(page)).pitch, { timeout: 4000 }).toBeGreaterThan(5);
    });
  });
});

test.describe("R8 fixed tilt: the map still works under it (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("every pin is inside the screen after the map frames the data", async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
      const w = window.innerWidth, h = window.innerHeight;
      return [...document.querySelectorAll(".maplibregl-marker")]
        .filter((e) => (e as HTMLElement).style.display !== "none")
        .map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w, h }; })
        .filter((p) => p.x < 0 || p.x > p.w || p.y < 0 || p.y > p.h);
    });
    expect(out, "pins outside the viewport after framing").toHaveLength(0);
  });

  test("tapping a pin opens the sheet and the pin stays clear of it (the map re-centres under the pitch)", async ({ page }) => {
    const seed = await open(page);
    const c = seed.contributors[0];
    await jump(page, c.physical_longitude, c.physical_latitude, 15.5);
    await openListing(page, c.id, "tap");
    const sheet = page.locator("[data-mv2='sheet']");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(900); // the 320 ms ease
    const { pinBottom, sheetTop } = await page.evaluate((id) => {
      const p = document.querySelector(`.maplibregl-marker[data-cc-id="${id}"]`)!.getBoundingClientRect();
      const s = document.querySelector("[data-mv2='sheet']")!.getBoundingClientRect();
      return { pinBottom: p.bottom, sheetTop: s.top };
    }, c.id);
    expect(pinBottom, "pin above the sheet's top edge").toBeLessThan(sheetTop);
    expect((await cam(page)).pitch).toBeCloseTo(PITCH, 1);
  });
});
