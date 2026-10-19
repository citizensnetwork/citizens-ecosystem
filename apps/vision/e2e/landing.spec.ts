import { expect, test } from "@playwright/test";
import { collectPageErrors, mockAppShell } from "./support/app-shell";

// The signed-out screen is the app: `/` rewrites to the standalone HTML
// frontend, and sign-in is Google only (app/login.jsx). There is no
// /auth/login page, no email field and no password field.
//
// Dropped from the old suite, because the current screen does not have them
// (product code was not changed to invent them):
// - heading hierarchy (the title is a div; the frontend has no h1–h6)
// - skip link (no a[href="#main-content"])
// - email/password labels, signup, and empty-submit validation
// - header brand, and the mobile/desktop sidebar checks on `/`

test.describe("Sign-in screen", () => {
  test("renders the landing with the Google button and no console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await mockAppShell(page);
    await page.goto("/");

    await expect(page).toHaveTitle("Citizens Vision");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Citizens Vision", { exact: true })).toBeVisible();
    await expect(page.getByText("Connecting the Kingdom")).toBeVisible();
    const google = page.getByRole("button", { name: "Continue with Google" });
    await expect(google).toBeVisible();
    await expect(page.getByRole("button", { name: "Explore the demo (Hope Collective)" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    const images = page.locator("img");
    const imageCount = await images.count();
    for (let i = 0; i < imageCount; i++) {
      await expect(images.nth(i)).toHaveAttribute("alt", /.*/);
    }

    await page.keyboard.press("Tab");
    await expect(google).toBeFocused();

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
