import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW } from "./support/map-v2.look2026";

// The approved map shell replaces the folding four-item nav and the Explore row.
// Phone: glow source + dock (Me, Map, Central, Do, Explore). Desktop: crown + vertical rail.
// Category choice lives in the search strip. Do opens the three-row drawer.

async function open(page: Page) {
  await mockMapNetwork(page, smallSeed(FIXED_NOW));
  await openMap(page, "/", 4);
}

test.describe("phone dock", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("opens on Map with the five destinations and a reduced crown", async ({ page }) => {
    await open(page);
    const dock = page.getByRole("navigation", { name: "Connect navigation" });
    await expect(dock).toBeVisible();
    for (const name of ["Me", "Map", "Central", "Do", "Explore"]) {
      await expect(dock.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(dock.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Hide navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Phone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Desktop" })).toHaveCount(0);
    await expect(page.getByText("· preview")).toHaveCount(0);
  });

  test("the source hides the dock and the glow comes back", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Hide navigation" }).click({ force: true });
    await expect(page.getByRole("navigation", { name: "Connect navigation" })).toHaveCount(0);
    const source = page.getByRole("button", { name: "Show navigation" });
    await expect(source).toBeVisible();
    await expect.poll(async () => (await source.boundingBox())!.width).toBeGreaterThan(70);
    await expect.poll(async () => (await source.boundingBox())!.height).toBeGreaterThan(70);
  });

  test("Explore opens the Discover page", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("Do opens the three rows and does not navigate until one is chosen", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Do", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Do options" });
    await expect(menu.getByRole("menuitem", { name: /Kingdom Projects/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Let’s…/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /List an organisation/ })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await menu.getByRole("menuitem", { name: /Let’s…/ }).click();
    await expect(page).toHaveURL(/\/lets$/);
  });

  test("search expands to the category strip", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Expand search" }).click();
    const strip = page.getByRole("group", { name: "Filter the map by category" });
    await expect(strip.getByRole("button", { name: "All", exact: true })).toBeVisible();
    await expect(strip.getByRole("button", { name: "Churches & worship" })).toBeVisible();
    await expect(page.getByLabel("Search Connect")).toBeVisible();
    await expect(page.getByLabel("Search location")).toBeVisible();
  });
});

test.describe("desktop rail", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("shows the crown and the vertical rail, not the phone dock", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("button", { name: "Citizens navigation" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Connect navigation" })).toBeVisible();
    await expect(page.locator(".cn-dock")).toHaveCount(0);
    await page.getByRole("button", { name: "Citizens navigation" }).click();
    await expect(page.getByRole("navigation", { name: "Connect navigation" })).toHaveCount(0);
  });
});
