import { test, expect, type Page, type Route } from "@playwright/test";
import {
  FAKE_PROJECT,
  installFakeProject,
  mockAppShell,
  signInToFakeProject,
  type FakeUser,
} from "./support/fake-project";

// Confirm-and-upgrade (issue #248). The email link only opens this screen.
// Confirm and Not mine are buttons, so opening the URL changes nothing.

const TOKEN = "ab".repeat(32);
const CITIZEN: FakeUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "citizen@example.test",
  fullName: "Example Citizen",
};

const PREVIEW = {
  status: "pending",
  display_name: "Example Fellowship",
  contributor_kind: "ministry",
  contributor_category: "churches-ministries",
  bio: "A neighbourhood fellowship.",
  no_fixed_location: true,
  physical_address: null,
  expires_at: "2026-11-01T00:00:00.000Z",
};

async function answerUpgrade(page: Page) {
  await page.route("**/api/contributor/claim", (route: Route) => route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
  await page.route("**/api/account/intake-upgrade", async (route: Route) => {
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === "preview") return route.fulfill({ json: PREVIEW });
    if (body.action === "confirm") {
      return route.fulfill({
        json: { status: "confirmed", slug: "example-fellowship", url: "http://localhost:3100/c/example-fellowship", on_map: false, email: "sent" },
      });
    }
    if (body.action === "decline") return route.fulfill({ json: { status: "declined" } });
    return route.fulfill({ status: 400, json: { error: "invalid_input" } });
  });
}

test.use({ bypassCSP: true });

test("a signed-in citizen sees the organisation and confirms from the button", async ({ page }) => {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
  await answerUpgrade(page);
  await page.goto(`/upgrade/${TOKEN}`);
  await expect(page.locator('[data-screen="intake-upgrade"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Example Fellowship" })).toBeVisible();
  await expect(page.getByText("Online / no fixed location")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm upgrade" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Not mine" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm upgrade" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

test("a signed-out visitor keeps the token path and sees sign-in", async ({ page }) => {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await installFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
  await page.goto(`/upgrade/${TOKEN}`);
  await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-screen="intake-upgrade"]')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(`/upgrade/${TOKEN}`);
});

test("Not mine leaves a note and does not open the dashboard", async ({ page }) => {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
  await answerUpgrade(page);
  await page.goto(`/upgrade/${TOKEN}/decline`);
  await expect(page.getByRole("button", { name: "Not mine" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Not mine" }).click();
  await expect(page.getByText("Nothing on your account was changed. The team has been told.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/upgrade/${TOKEN}/decline`);
});
