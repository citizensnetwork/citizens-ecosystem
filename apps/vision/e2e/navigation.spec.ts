import { test, expect } from "@playwright/test";

test.describe("Home / Org Selector", () => {
  test("root page loads without crashing", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Citizens Vision/);
  });

  test("navbar brand is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toContainText("Citizens Vision");
  });

  test("skip link is present for accessibility", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
  });
});

test.describe("Responsive Layout", () => {
  test("mobile viewport hides sidebar by default", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    // Sidebar should not be visible on mobile
    const sidebar = page.locator("nav.sidebar, aside");
    if (await sidebar.count()) {
      await expect(sidebar.first()).not.toBeVisible();
    }
  });

  test("desktop viewport shows full layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
  });
});
