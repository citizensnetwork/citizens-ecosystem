import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/test-org");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator("h1, h2")).toContainText(/sign in|log in/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("signup page renders correctly", async ({ page }) => {
    await page.goto("/auth/signup");
    await expect(page.locator("h1, h2")).toContainText(/sign up|create/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("login form shows validation errors for empty submission", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator('button[type="submit"]').click();
    // HTML5 validation or custom error should appear
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute("required", "");
  });
});
