import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, mapSettled, makeSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Keyboard and screen-reader reach on the map home (QA 2026-11-25, CCQA-0004).
//  The QA pressed Tab 22 times on the desktop home and reached 6 pins off the screen and 3 under a panel (14 and 1 at
//  390 px). Every Tab stop must be on the screen and be what a sighted person sees at that spot: inside the window, and
//  the topmost element at its centre is the stop itself (or inside it). A large seed spreads pins well past the screen.
// ════════════════════════════════════════════════════════════════════

type Stop = { tag: string; label: string; inside: boolean; onTop: boolean; pin: boolean };

/** Where focus is now, and whether a sighted person can see it there. */
function focusedStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const inside = r.width > 0 && r.height > 0 && cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight;
    const hit = inside ? document.elementFromPoint(cx, cy) : null;
    const onTop = !!hit && (el === hit || el.contains(hit) || hit.contains(el));
    return {
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60),
      inside,
      onTop,
      pin: !!el.closest(".maplibregl-marker"),
    };
  });
}

for (const size of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test.describe(`keyboard reach (${size.name}, ${size.width}x${size.height})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("every Tab stop on the map home is on the screen and not under a panel", async ({ page }) => {
      // many pins spread well past the screen (about 0.3° each way around the town), so off-screen pins exist
      const seed = makeSeed({ contributors: 6, places: 60, events: 30, now: FIXED_NOW, spread: 0.3 }) as MapSeed;
      await mockMapNetwork(page, seed);
      await openMap(page, "/?map=v2", 5);
      await mapSettled(page);
      await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => {});
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const bad: Stop[] = [];
      let pins = 0;
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press("Tab");
        // measure what a person sees: after the next two frames (the browser's focus scroll and the app's own settle there)
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
        const s = await focusedStop(page);
        if (!s) continue;
        if (s.pin) pins += 1;
        if (!s.inside || !s.onTop) bad.push(s);
      }
      expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
      // pins are still reachable: the fix is fewer, visible stops, not none
      expect(pins).toBeGreaterThan(0);
      expect(pins).toBeLessThanOrEqual(12);
    });
  });
}

test("the first Tab stop skips the map, and the map says how many listings are in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockMapNetwork(page);
  await openMap(page, "/?map=v2", 1);
  await mapSettled(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  const skip = page.locator("[data-cc='skip-map']");
  await expect(skip).toHaveText("Skip the map, go to the list");
  await skip.focus();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  // focus leaves the map for the list: not on a pin, not on the skip link
  const where = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return { pin: !!a?.closest(".maplibregl-marker"), skip: a?.getAttribute("data-cc") === "skip-map", body: a === document.body };
  });
  expect(where).toEqual({ pin: false, skip: false, body: false });

  await expect(page.locator("[data-cc='map-in-view']")).toHaveText(/^(\d+ listings? in view\.|No listings in this part of the map\.)$/, { timeout: 5000 });
});
