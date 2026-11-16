import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";

// Pack 08: the crown, the Explore sheet, and the pin mix on the live map.
// The folding nav remains on every screen that is not the map home.

type Row = Record<string, unknown> & { id: string };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 6, places: 6, events: 4, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed;

async function open(page: Page) {
  const seed = seedOf();
  await mockMapNetwork(page, seed);
  await openMap(page, "/", 5);
  return seed;
}

const crown = (page: Page) => page.locator("[data-mv2='explore-crown']");
const sheet = (page: Page) => page.locator("[data-mv2='explore']");

test.describe("the map home", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the crown replaces the folding nav, and the + button is not on the map", async ({ page }) => {
    await open(page);
    await expect(crown(page)).toBeVisible();
    await expect(page.locator("[data-mv2='nav-toggle']")).toHaveCount(0);
    await expect(page.locator("button.gold-gradient")).toHaveCount(0);
    const box = await page.locator("[data-mv2='explore-dock']").boundingBox();
    expect(box!.width).toBeGreaterThan(48);
    expect(box!.width).toBeLessThan(56);
    const border = await page.locator("[data-mv2='explore-dock']").evaluate((e) => getComputedStyle(e).borderTopColor);
    const [r, g, b] = border.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(150);
    expect(b).toBeLessThan(90);
  });

  test("the crown opens Where to… tiles, a tile becomes grey tabs, and See all opens Explore", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    await expect(page.getByRole("heading", { name: "Where to…" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Coffee" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Near and Now…" })).toBeVisible();

    await page.getByRole("button", { name: "Coffee" }).click();
    const tab = page.getByRole("tab", { name: "Coffee" });
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const plate = await tab.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(plate).not.toMatch(/212,\s*175,\s*55|242,\s*189,\s*34/);
    await expect(page.getByRole("button", { name: "All types" })).toBeVisible();
    await page.getByRole("button", { name: "All types" }).click();
    await expect(page.getByRole("tab", { name: "Coffee" })).toHaveCount(0);

    await page.getByRole("button", { name: "Explore more" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.locator("[data-screen='explore']")).toBeVisible();
  });

  test("Map in the sticky nav lowers the sheet, and a card opens the listing", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await page.getByRole("navigation", { name: "Connect" }).getByRole("button", { name: "Map" }).click();
    await expect(sheet(page)).not.toHaveAttribute("data-open", "");

    await crown(page).click();
    const card = page.locator("[data-mv2='xcard']").first();
    await card.click();
    await expect(page.locator("[data-mv2='sheet']")).toBeVisible();
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the sheet is a centred bottom sheet no wider than 720px, and the sidebar stays", async ({ page }) => {
    await open(page);
    await expect(page.locator("[data-mv2='desktop-nav']")).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("[data-mv2='nav-toggle']")).toHaveCount(0);
    await page.locator("[data-mv2='desktop-item'][data-nav='explore']").click();
    const box = await sheet(page).boundingBox();
    expect(box!.width).toBeLessThanOrEqual(724);
    expect(box!.width).toBeGreaterThan(480);
  });
});

test.describe("pin mix", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("events wear the disc, places wear the filled circle, and contributors are not pinned", async ({ page }) => {
    await open(page);
    await expect(page.locator(".mv2-pin--event [data-mv2='disc']").first()).toBeAttached();
    await expect(page.locator(".mv2-pin--event [data-mv2='tail']").first()).toBeAttached();
    await expect(page.locator("[data-cc-pin='place']").first()).toBeAttached();
    await expect(page.locator(".mv2-pin--place [data-mv2='ink']")).toHaveCount(0);
    await expect(page.locator("[data-cc-pin='contributor']")).toHaveCount(0);
    const ring = await page.locator(".mv2-pin--event [data-mv2='disc']").first().evaluate((e) => parseFloat(getComputedStyle(e).borderTopWidth));
    const placeRing = await page.locator("[data-cc-pin='place'] [data-mv2='shape']").first().evaluate((e) => parseFloat(getComputedStyle(e).strokeWidth));
    expect(ring).toBeGreaterThan(2);
    expect(ring).toBeLessThan(4);
    expect(placeRing).toBeGreaterThan(0.5);
    expect(placeRing).toBeLessThan(2);
  });
});
