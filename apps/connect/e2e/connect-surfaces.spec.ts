import { test, expect } from "@playwright/test";
import { mockAppShell, signInToFakeProject, FAKE_PROJECT } from "./support/fake-project";
import { mockMapNetwork, makeSeed, FIXED_NOW } from "./support/map-v2";

for (const width of [390, 1280]) {
  test(`Explore, Me and Map share navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockMapNetwork(page, makeSeed({ contributors: 4, places: 8, events: 4, now: FIXED_NOW, spread: 0.02, seed: 23 }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/explore");
    const dock = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await expect(dock.getByRole("button")).toHaveText(["Explore", "Map", "Me"]);
    await expect(page.getByRole("heading", { name: "Happening around you" })).toBeVisible();
    await expect(page.locator(".photo-tile").first()).toBeVisible();
    expect(await page.locator(".explore-page").evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(width);
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeInViewport();
    if (process.env.CONNECT_SHOTS) await page.screenshot({ path: process.env.CONNECT_SHOTS + "/explore-" + width + ".png" });
    await page.getByRole("textbox", { name: "Explore search" }).fill("unmatched-word");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "No listings" })).toBeVisible();
    await dock.getByRole("button", { name: "Me" }).click();
    await expect(page.locator('[data-screen="profile"]')).toBeVisible();
    await expect(dock.getByRole("button", { name: "Me" })).toHaveAttribute("aria-current", "page");
    await dock.getByRole("button", { name: "Map" }).click();
    await expect(page.locator('[data-mv2="home"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("a map pin opens its preview and its selected card opens resizable details", async ({ page }) => {
  await mockMapNetwork(page, makeSeed({ contributors: 4, places: 8, events: 4, now: FIXED_NOW, spread: 0.02, seed: 23 }));
  await page.goto("/");
  const pin = page.locator(".maplibregl-marker[data-cc-id]").first();
  await expect(pin).toBeVisible({ timeout: 20000 });
  await pin.focus();
  await pin.press("Enter");
  const preview = page.locator('[data-mv2="pinpeek"]');
  await expect(preview).toBeVisible();
  await preview.locator('[data-explore-id][aria-pressed="true"], [data-explore-id][data-selected]').first().click();
  await expect(preview.locator('[data-mv2="pinpeek-details"]')).toBeVisible();
  const bar = preview.locator('[data-mv2="pinpeek-bar"]');
  await bar.click({ trial: true });
  const box = (await bar.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 70, { steps: 8 });
  await page.mouse.up();
  await expect(preview).toHaveAttribute("data-adjusted", "");
  await expect.poll(async () => Math.round((await bar.boundingBox())!.y - box.y)).toBeGreaterThan(45);
});

test("a signed-in citizen can return to their personal space and reopen their note", async ({ page }) => {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, {
    user: { id: "12345678-1234-4123-8123-123456789abc", email: "member@example.test", fullName: "Test Citizen" },
    profile: { role: "citizen", contributor_status: "none", full_name: "Test Citizen" },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Me", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test Citizen" })).toBeVisible();
  if (process.env.CONNECT_SHOTS) await page.screenshot({ path: process.env.CONNECT_SHOTS + "/me.png" });
  await page.getByRole("button", { name: /Add a private note/ }).click();
  const dialog = page.getByRole("dialog", { name: "Status" });
  await dialog.getByRole("textbox").fill("Volunteer on Friday");
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: /Settings Make it yours/ }).click();
  await expect(page.locator('[data-screen="settings"]')).toBeVisible();
  await page.getByRole("button", { name: "Me", exact: true }).click();
  await expect(page.getByRole("button", { name: /Volunteer on Friday/ })).toBeVisible();
});
