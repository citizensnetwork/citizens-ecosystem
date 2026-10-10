import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  The map look (tracker P1-12): auto | light | dark, DEFAULT LIGHT.
//  The dark base style is MapTiler's own `dataviz-dark`; MapTiler is
//  answered locally here, so the spec reads which style the map asked for.
// ════════════════════════════════════════════════════════════════════

test.use({ viewport: { width: 390, height: 844 } });
type Seed = MapSeed & { contributors: { id: string; physical_longitude: number; physical_latitude: number }[] };

/** Opens the map and records every MapTiler style the map requests. */
async function openRecording(page: Page, path = "/?map=v2") {
  const seed = smallSeed(FIXED_NOW) as Seed;
  const styles: string[] = [];
  page.on("request", (r) => { const m = /api\.maptiler\.com\/maps\/([^/]+)\/style\.json/.exec(r.url()); if (m) styles.push(m[1]); });
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed);
  await openMap(page, path, 8);
  return { seed, styles };
}
const theme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const lookBtn = (page: Page) => page.getByRole("button", { name: "Map look" });

test.describe("P1-12 map look", () => {
  test("a first-time visitor sees LIGHT whatever their phone is set to", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const { styles } = await openRecording(page);
    expect(await theme(page)).toBe("light");
    expect(styles).toEqual(["streets-v2"]); // the e2e config's light style; never the dark one
    expect(await page.evaluate(() => localStorage.getItem("cc_map_theme"))).toBeNull(); // nothing is stored until someone chooses
  });

  test("the control offers Match my phone, Light and Dark; Light is the one ticked at first", async ({ page }) => {
    await openRecording(page);
    await lookBtn(page).click();
    const items = page.getByRole("menuitemradio");
    await expect(items).toHaveText(["Match my phone", "Light", "Dark"]);
    await expect(page.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
  });

  test("choosing Dark switches the tokens at once and the map to the dark style; it survives a reload", async ({ page }) => {
    const { styles } = await openRecording(page);
    await lookBtn(page).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    expect(await theme(page)).toBe("dark");
    await expect.poll(() => styles).toContain("dataviz-dark");
    expect(await page.evaluate(() => localStorage.getItem("cc_map_theme"))).toBe("dark");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim())).toBe("#1a1714");

    // a reload keeps it: the map is built dark from the start (no light flash, no second style request)
    const again: string[] = [];
    page.on("request", (r) => { const m = /maps\/([^/]+)\/style\.json/.exec(r.url()); if (m) again.push(m[1]); });
    await page.reload();
    await page.waitForSelector('[data-screen="discover"]');
    expect(await theme(page)).toBe("dark");
    await expect.poll(() => again).toEqual(["dataviz-dark"]);
  });

  test("Match my phone follows the system, live", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const { styles } = await openRecording(page);
    await lookBtn(page).click();
    await page.getByRole("menuitemradio", { name: "Match my phone" }).click();
    expect(await theme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => theme(page)).toBe("dark");
    await expect.poll(() => styles).toContain("dataviz-dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => theme(page)).toBe("light");
  });

  test("the menu is an overlay: Back closes it first (and stays on the map), Escape closes it and returns focus", async ({ page }) => {
    await openRecording(page);
    await lookBtn(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");

    await lookBtn(page).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-mv2"))).toBe("look-btn");
  });

  test("the menu works from the keyboard and every item is 44 px tall", async ({ page }) => {
    await openRecording(page);
    await lookBtn(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitemradio", { name: "Light" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeFocused();
    const heights = await page.getByRole("menuitemradio").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Enter");
    expect(await theme(page)).toBe("dark");
  });

  test("in the dark look the sheet, pins and labels use the dark tokens, and logos stay on white", async ({ page }) => {
    const { seed } = await openRecording(page);
    await lookBtn(page).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    const c = seed.contributors[0];
    await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
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

  test("flag off: no Map look control", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await openMap(page, "/", 8);
    await expect(lookBtn(page)).toHaveCount(0);
    expect(await theme(page)).toBeNull();
  });
});
