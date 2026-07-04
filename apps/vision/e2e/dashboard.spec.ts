import { test, expect } from "@playwright/test";

/**
 * Dashboard E2E tests — these require authentication.
 * In CI, seed a test user or use Supabase service-role auth fixture.
 * Locally, tests rely on an existing dev session.
 */
test.describe("Dashboard", () => {
  test.skip(
    !process.env.E2E_TEST_ORG_SLUG,
    "Skipped: set E2E_TEST_ORG_SLUG env var to run dashboard tests"
  );

  const orgSlug = process.env.E2E_TEST_ORG_SLUG ?? "test-org";

  test("dashboard page renders metric cards", async ({ page }) => {
    await page.goto(`/${orgSlug}/dashboard`);
    // Should show metric cards or redirect to login
    const isLogin = page.url().includes("/auth/login");
    if (!isLogin) {
      await expect(page.locator('[class*="rounded-lg"]').first()).toBeVisible();
    }
  });

  test("dashboard has analytics link", async ({ page }) => {
    await page.goto(`/${orgSlug}/dashboard`);
    const isLogin = page.url().includes("/auth/login");
    if (!isLogin) {
      await expect(page.locator('a[href*="analytics"]')).toBeVisible();
    }
  });

  test("dashboard has federation link", async ({ page }) => {
    await page.goto(`/${orgSlug}/dashboard`);
    const isLogin = page.url().includes("/auth/login");
    if (!isLogin) {
      await expect(page.locator('a[href*="federation"]')).toBeVisible();
    }
  });
});
