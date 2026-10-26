import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW } from "./support/map-v2";

// ═════════════════════════════════════════════════════════════════
//  Issue #179 (Map v2 R6): the old map and its `?map=v1` escape hatch are deleted.
//  A link, a bookmark or a device that still carries the old choice must land on
//  the one map, quietly: no error, no old pins, and the stale choice forgotten.
// ═════════════════════════════════════════════════════════════════

const theme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const stored = (page: Page) => page.evaluate(() => localStorage.getItem("cc_map_v2"));

/** The map a person gets today: Map v2's stylesheet applied, its pins (controls, not bare SVG), its sheet on a tap. */
async function expectTheOneMap(page: Page, pageErrors: string[]) {
  expect(await theme(page)).not.toBeNull();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("#c9a84c");
  expect(await page.locator(".maplibregl-marker[role='button']").count()).toBeGreaterThanOrEqual(8);
  await expect(page.locator('[data-cc-pin="contributor-logo"]')).toHaveCount(0); // the old logo pin
  expect(await page.evaluate(() => typeof (window as unknown as { isMapV2?: unknown }).isMapV2)).toBe("undefined");
  expect(pageErrors).toEqual([]);

  const seed = smallSeed(FIXED_NOW) as { contributors: { id: string }[] };
  const marker = page.locator(`.maplibregl-marker[data-cc-id="${seed.contributors[0].id}"]`);
  await marker.click({ force: true });
  await expect(page.locator("[data-mv2='sheet']")).toBeVisible(); // the sheet, not the old floating preview card
}

test.describe("the old map is retired", () => {
  test("?map=v1 gives the one map (Map v2), with no error", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await mockMapNetwork(page);
    await openMap(page, "/?map=v1", 8);
    await expectTheOneMap(page, pageErrors);
  });

  test("?map=v2 is no different, and neither stores anything", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    expect(await stored(page)).toBeNull();
    await page.goto("/?map=v1");
    await page.waitForSelector('[data-screen="discover"]');
    expect(await stored(page)).toBeNull();
  });

  test("a device that opted out long ago ('v1' stored) gets the one map, and the old choice is forgotten", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    // seeded once, so the forgetting below is not undone by the init script running again on a reload
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("seeded")) {
          sessionStorage.setItem("seeded", "1");
          localStorage.setItem("cc_map_v2", "v1");
        }
      } catch {
        /* storage blocked: the spec would then not prove the cleanup, and fail on the key below */
      }
    });
    await mockMapNetwork(page);
    await openMap(page, "/", 8);
    await expectTheOneMap(page, pageErrors);
    expect(await stored(page)).toBeNull();
    await page.reload();
    await page.waitForSelector('[data-screen="discover"]');
    expect(await theme(page)).not.toBeNull();
    expect(await stored(page)).toBeNull();
  });

  test("the old map's pin styles are not shipped in the page", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/", 8);
    const shipped = await page.evaluate(async () => (await (await fetch("/")).text()));
    expect(shipped).not.toContain("cc-pin-label");
    expect(shipped).not.toContain("cc-pin-pulse");
  });
});
