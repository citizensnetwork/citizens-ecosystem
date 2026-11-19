import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, openExploreAll, makeSeed, FIXED_NOW } from "./support/map-v2";
import { touchSession, swipe } from "./support/touch";

const network = (page: Page) => mockMapNetwork(page, makeSeed({
  contributors: 8, places: 8, events: 6, now: FIXED_NOW, spread: 0.02, seed: 23,
}));
const screen = (page: Page) => page.locator('[data-screen="explore"]');

test.describe("Explore listings", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => { await network(page); });

  test("Explore more opens the full page and Back returns to the map", async ({ page }) => {
    await openMap(page, "/", 5);
    await openExploreAll(page, "tap");
    await page.getByRole("button", { name: "Explore more" }).tap();
    await expect(screen(page)).toBeVisible();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goBack();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
  });

  test("a horizontal swipe moves the listing row while vertical swipes scroll the page", async ({ page }) => {
    await page.goto("/explore");
    const row = page.locator('[data-row="explore-all"]');
    await expect(row.locator(".photo-tile").first()).toBeVisible();
    const box = (await row.boundingBox())!;
    const at = { x: 260, y: box.y + box.height / 2 };
    const cdp = await touchSession(page);
    await swipe(cdp, at, 0, { dx: -150, ms: 300, steps: 12 });
    await expect.poll(() => row.evaluate((e) => e.scrollLeft)).toBeGreaterThan(40);
    await swipe(cdp, at, -180, { ms: 320, steps: 12 });
    await expect.poll(() => screen(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(45);
  });

  test("a filtered listing opens its profile, and Back restores the filter and its results", async ({ page }) => {
    await page.goto("/explore");
    const category = page.locator(".category-tiles button").first();
    await expect(page.locator(".photo-tile").first()).toBeVisible();
    const label = (await category.innerText()).trim();
    await category.tap();
    const results = page.locator(".explore-grid .photo-tile");
    await expect(results.first()).toBeVisible();
    const title = await results.first().locator("h3").innerText();
    await results.first().tap();
    await expect(page).toHaveURL(/\/(e|p|c)\/[^/]+$/);
    await page.goBack();
    await expect(screen(page).getByRole("heading", { name: label, exact: true }).first()).toBeVisible();
    await expect(results.first().locator("h3")).toHaveText(title);
  });
});
