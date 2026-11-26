import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW } from "./support/map-v2";
import { touchSession, swipe } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Explore, pulled in over the map (founder's design, 2026-11-26; app/connect-explore.jsx, shell.jsx MapStage).
//  The map stays mounted under Explore (the same map object, blurred), a swipe left from the Map's right-edge pill pulls
//  Explore in, Back takes it away again, and a card's preview names where you are with one Close. The old Kingdom
//  Exploration address lands on Explore.
// ════════════════════════════════════════════════════════════════════

const mapId = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __ccMap?: { __e2eId?: number } };
    if (!w.__ccMap) return null;
    if (!w.__ccMap.__e2eId) w.__ccMap.__e2eId = Math.random();
    return w.__ccMap.__e2eId;
  });
const explore = (page: Page) => page.locator("[data-screen='explore']");
const edge = (page: Page) => page.locator("[data-mv2='xs-edge']");

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a swipe left from the Map's right edge pulls Explore in over the same map, and Back takes it away", async ({ page }) => {
    await mockMapNetwork(page, smallSeed(FIXED_NOW));
    await openMap(page, "/", 1);
    const before = await mapId(page);
    await expect(edge(page)).toBeVisible();

    const box = (await edge(page).boundingBox())!;
    const cdp = await touchSession(page);
    const y = box.y + box.height / 2;
    await swipe(cdp, { x: box.x + box.width - 6, y }, 0, { dx: -140, ms: 260, steps: 10 });
    await expect(explore(page)).toBeVisible();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(explore(page).getByRole("heading", { level: 1 })).toHaveText("Explore.");

    // the map underneath is the same object (not remounted), blurred and out of reach
    expect(await mapId(page)).toBe(before);
    await expect(page.locator("[data-mv2='map-under']")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("[data-mv2='home']")).not.toHaveAttribute("data-screen", /.+/);

    await page.goBack();
    await expect(explore(page)).toHaveCount(0);
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    expect(await mapId(page)).toBe(before);
  });

  test("a card opens its preview: one gold action, Close returns focus to the card, and Full profile opens the listing", async ({ page }) => {
    await mockMapNetwork(page, smallSeed(FIXED_NOW));
    await openMap(page, "/", 1);
    await edge(page).click();
    await expect(explore(page)).toBeVisible();

    const card = explore(page).locator("[data-mv2='xs-card']").first();
    await card.click();
    const preview = page.locator("[data-mv2='xs-preview']");
    await expect(preview).toBeVisible();
    await expect(preview.getByText("Preview", { exact: true })).toBeVisible();
    await expect(preview.locator("[data-mv2='xs-act'][data-primary]")).toHaveCount(1);
    await expect(preview.getByRole("button", { name: "Close" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await expect(card).toBeFocused();

    await card.click();
    await preview.getByRole("button", { name: "Full profile" }).click();
    await expect(page.locator("[data-screen='event'], [data-screen='place'], [data-screen='profile']").first()).toBeVisible();
  });

  test("the three views, and Back clears a filter before it leaves Explore", async ({ page }) => {
    await mockMapNetwork(page, smallSeed(FIXED_NOW));
    await openMap(page, "/", 1);
    await page.evaluate(() => (window as unknown as { __cc: { go: (p: string) => void } }).__cc.go("explore"));
    await expect(explore(page)).toBeVisible();

    await explore(page).getByRole("button", { name: "Things to do" }).click();
    await expect(explore(page).getByRole("button", { name: "Things to do" })).toHaveAttribute("aria-pressed", "true");
    await expect(explore(page).locator("[data-mv2='xs-question']").first()).toBeVisible();
    await explore(page).getByRole("button", { name: "Categories" }).click();
    await expect(explore(page).locator("[data-mv2='xs-dir-btn']").first()).toBeVisible();

    await explore(page).getByRole("button", { name: "Events", exact: true }).click();
    await expect(explore(page).locator("[data-mv2='xs-results']")).toBeVisible();
    await page.goBack();
    await expect(explore(page).locator("[data-mv2='xs-results']")).toHaveCount(0);
    await expect(explore(page)).toBeVisible();
  });
});

test("the retired /discover address lands on Explore and rewrites the bar", async ({ page }) => {
  await mockMapNetwork(page, smallSeed(FIXED_NOW));
  await page.goto("/discover");
  await expect(explore(page)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/explore$/);
});
