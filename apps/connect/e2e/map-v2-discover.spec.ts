import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, openExploreAll, makeSeed, FIXED_NOW } from "./support/map-v2";

// Explore (/explore) is the image-first page. Kingdom Exploration stays at /discover.
// A tile returns to the map and opens that listing in the pin carousel.

type Row = Record<string, unknown> & { id: string; category?: string | null };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 8, places: 8, events: 6, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed;

const page$ = (page: Page) => page.locator("[data-mv2='discover']");
const toggle = (page: Page) => page.locator("[data-mv2='nav-toggle']");
const nav = (page: Page) => page.locator("[data-mv2='nav']");
const GROUPS = ["Churches & worship", "Serve & care", "Culture & fun", "Learn & grow", "Audiences", "Business"];

async function network(page: Page) {
  const seed = seedOf();
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 0 });
  return seed;
}

async function openExplore(page: Page, path = "/explore") {
  const seed = await network(page);
  await page.goto(path);
  await page.waitForSelector('[data-screen="explore"]', { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Discover more");
  return seed;
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("See all on the Explore row opens Explore at /explore; Back returns to the map", async ({ page }) => {
    await network(page);
    await openMap(page, "/", 5);
    await openExploreAll(page, "tap");
    await page.getByRole("button", { name: "Explore more" }).tap();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page$(page)).toBeVisible();
    await expect.poll(() => page.title()).toBe("Explore · Citizens Connect");
    await page.goBack();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the nav's Explore opens it too, marked as the current item; Back returns to the map", async ({ page }) => {
    await network(page);
    await openMap(page, "/", 5);
    await openExploreAll(page, "tap");
    await page.getByRole("navigation", { name: "Connect" }).getByRole("button", { name: "Explore" }).tap();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page$(page)).toBeVisible();
    await toggle(page).tap();
    await expect(nav(page).getByRole("button", { name: "Explore" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await page.goBack();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
  });

  test("search, a location menu, photo tiles, and a category that filters the list", async ({ page }) => {
    await openExplore(page);
    await expect(page.getByLabel("Explore search")).toBeVisible();
    await expect(page.getByLabel("Location")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Happening around you" })).toBeVisible();
    await expect(page.locator(".photo-tile").first()).toBeVisible();
    for (const name of GROUPS) await expect(page.locator(".category-tiles").getByRole("button", { name })).toBeVisible();

    await page.locator(".category-tiles").getByRole("button", { name: "Serve & care" }).tap();
    await expect(page.getByRole("heading", { name: "Serve & care" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Happening around you" })).toHaveCount(0);
  });

  test("a tile returns to the map", async ({ page }) => {
    await openExplore(page);
    await page.locator(".photo-tile").first().tap();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
  });
});

test.describe("on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the sidebar keeps Kingdom Exploration at /discover; See all opens Explore", async ({ page }) => {
    await network(page);
    await openMap(page, "/", 5);
    await openExploreAll(page);
    await page.getByRole("button", { name: "Explore more" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page$(page)).toBeVisible();
    await page.locator("aside").getByRole("button", { name: "Kingdom Exploration" }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
  });
});
