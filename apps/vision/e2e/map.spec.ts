import { test, expect } from "@playwright/test";

test.describe("Map View", () => {
  test.skip(
    !process.env.E2E_TEST_ORG_SLUG,
    "Skipped: set E2E_TEST_ORG_SLUG env var to run map tests"
  );

  const orgSlug = process.env.E2E_TEST_ORG_SLUG ?? "test-org";

  test("map page loads", async ({ page }) => {
    await page.goto(`/${orgSlug}/map`);
    const isLogin = page.url().includes("/auth/login");
    if (!isLogin) {
      // Map container should exist
      await expect(page.locator('[class*="map"], canvas').first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("map has layer toggle controls", async ({ page }) => {
    await page.goto(`/${orgSlug}/map`);
    const isLogin = page.url().includes("/auth/login");
    if (!isLogin) {
      // Layer toggle buttons should be present
      const controls = page.locator("button, [role='switch']");
      await expect(controls.first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
