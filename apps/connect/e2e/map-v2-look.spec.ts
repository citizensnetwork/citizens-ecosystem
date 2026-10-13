import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  The map look (tracker P1-12; founder, D1 as revised 2026-10-12): it
//  follows the phone's own light/dark setting, live, with no in-app control.
//  The dark base style is MapTiler's own `dataviz-dark`; MapTiler is
//  answered locally here, so the spec reads which style the map asked for.
// ════════════════════════════════════════════════════════════════════

test.use({ viewport: { width: 390, height: 844 } });
type Seed = MapSeed & { contributors: { id: string; physical_longitude: number; physical_latitude: number }[] };

/** Opens the map and records every MapTiler style the map requests. */
async function openRecording(page: Page, path = "/?map=v2") {
  const seed = smallSeed(FIXED_NOW) as Seed;
  const styles: string[] = [];
  page.on("request", (r) => {
    const m = /api\.maptiler\.com\/maps\/([^/]+)\/style\.json/.exec(r.url());
    if (m) styles.push(m[1]);
  });
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed);
  await openMap(page, path, 8);
  return { seed, styles };
}
const theme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));

test.describe("P1-12 the map look follows the phone", () => {
  test("a phone set to light gets the light map", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const { styles } = await openRecording(page);
    expect(await theme(page)).toBe("light");
    expect(styles).toEqual(["streets-v2"]); // the e2e config's light style; never the dark one
  });

  test("a phone set to dark gets the dark map from the first frame: one style request, no light flash", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const { styles } = await openRecording(page);
    expect(await theme(page)).toBe("dark");
    await expect.poll(() => styles).toEqual(["dataviz-dark"]);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim())).toBe("#1a1714");
  });

  test("switching the phone's setting while the map is open switches the map at once, both ways", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const { styles } = await openRecording(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => theme(page)).toBe("dark");
    await expect.poll(() => styles).toContain("dataviz-dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => theme(page)).toBe("light");
  });

  test("there is no Map look button and no build badge on the map", async ({ page }) => {
    await openRecording(page);
    await expect(page.getByRole("button", { name: "Map look" })).toHaveCount(0);
    await expect(page.locator("[data-mv2^='look']")).toHaveCount(0);
    await expect(page.locator("#cc-map-v2-badge")).toHaveCount(0);
    await expect(page.getByText("map v2", { exact: true })).toHaveCount(0);
  });

  test("a choice stored by the retired Map look control is cleared and never overrides the phone", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cc_map_theme", "dark");
      } catch {
        /* storage blocked */
      }
    });
    await page.emulateMedia({ colorScheme: "light" });
    await openRecording(page);
    expect(await theme(page)).toBe("light");
    expect(await page.evaluate(() => localStorage.getItem("cc_map_theme"))).toBeNull();
  });

  test("in the dark look the sheet, pins and labels use the dark tokens, and logos stay on white", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const { seed } = await openRecording(page);
    const c = seed.contributors[0];
    await page.evaluate(
      ([lo, la]) =>
        (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo(
          { center: [lo, la], zoom: 15.5 },
          { originalEvent: {} },
        ),
      [c.physical_longitude, c.physical_latitude],
    );
    const pin = page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`);
    await expect(pin.locator("[data-mv2='label-text']")).toHaveCSS("color", "rgb(247, 244, 238)"); // --pin-label (dark)
    await pin.click({ force: true });
    const sheet = page.locator("[data-mv2='sheet']");
    await expect(sheet).toHaveCSS("background-color", "rgb(26, 23, 20)");
    await expect(sheet.locator("[data-mv2='name']")).toHaveCSS("color", "rgb(247, 244, 238)");
    await expect(pin.locator("[data-mv2='logo-wrap']")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    // the gold action keeps its near-black label
    await expect(sheet.getByRole("link", { name: "Directions" })).toHaveCSS("color", "rgb(10, 9, 8)");
  });

  test("flag off: no look is applied, even on a dark phone", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await openMap(page, "/", 8);
    expect(await theme(page)).toBeNull();
  });
});
