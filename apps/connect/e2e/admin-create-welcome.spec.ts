import { test, expect, type Page, type Route } from "@playwright/test";
import { goTo } from "./support/app-hooks";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  D-13: Admin → Create Contributor emails the owner a welcome.
//
//  What is under test is the BROWSER: the "Email the owner a welcome" checkbox
//  (on by default), what the Create request carries, how the toasts report the
//  server's answer (sent / failed / skipped), and that the screen no longer
//  tells the admin the owner must use Google. Success closes the overlay.
//  The email itself is sent by the server (unit-tested; no real mail here).
//  Hermetic: a signed-in admin against the fake Supabase project.
// ════════════════════════════════════════════════════════════════════

test.use({ bypassCSP: true });

const ADMIN = { id: "88888888-8888-4888-8888-888888888888", email: "admin@citizens.example", fullName: "Test Admin" };
const OWNER_EMAIL = "owner@grace.example";

type Reply = { email: "sent" | "failed" | "skipped"; onMap?: boolean };

async function openCreateScreen(page: Page, reply: Reply = { email: "sent" }) {
  const requests: Record<string, unknown>[] = [];
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, { user: ADMIN, profile: { role: "admin", contributor_status: "not_applied" } });
  await page.route("**/api/contributor/claim", (route: Route) => route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
  await page.route("**/api/admin/contributor-applications", (route: Route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/admin/contributors/create", (route: Route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: { success: true, contributor_id: "99999999-9999-4999-8999-999999999999", slug: "grace-outreach", claim_email: OWNER_EMAIL, ...reply },
    });
  });
  await page.goto("/");
  await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
  await goTo(page, "admin");
  await expect(page.locator('[data-screen="admin"]')).toBeVisible();
  await page.getByRole("button", { name: "Contributors", exact: true }).click();
  await page.getByRole("button", { name: "Create Contributor", exact: true }).click();
  await expect(page.getByTestId("admin-create-form")).toBeVisible();
  return requests;
}

async function fillAndCreate(page: Page) {
  await page.getByPlaceholder("e.g. New Wine Fellowship").fill("Grace Outreach");
  await page.getByPlaceholder("contact@ministry.org").fill(OWNER_EMAIL);
  await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
  await page.getByRole("button", { name: "Retreat / Healing" }).click();
  await page.getByRole("button", { name: "Create Contributor Listing" }).click();
}

test.describe("Admin → Create Contributor: welcome email (D-13)", () => {
  test("'Email the owner a welcome' is ticked by default, and the old Google-only wording is gone", async ({ page }) => {
    await openCreateScreen(page);
    await expect(page.getByLabel("Email the owner a welcome")).toBeChecked();
    await expect(page.getByText(/6-digit code/).first()).toBeVisible();
    // The intro paragraph and the field hint used to say the owner must sign in with Google.
    await expect(page.getByText(/must sign in with \(Google\)/)).toHaveCount(0);
    await expect(page.getByText(/signs in with Google using the email below/)).toHaveCount(0);
  });

  test("ticked: the request asks for the email, and a toast says it was sent", async ({ page }) => {
    const requests = await openCreateScreen(page, { email: "sent" });
    await fillAndCreate(page);

    await expect(page.getByTestId("admin-create-form")).toHaveCount(0);
    const welcome = page.getByText(`Welcome email sent to ${OWNER_EMAIL}`);
    await expect(welcome).toBeVisible();
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: `Welcome email sent to ${OWNER_EMAIL}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Contributor", exact: true })).toBeFocused();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ display_name: "Grace Outreach", claim_email: OWNER_EMAIL, email_owner: true });
  });

  test("unticked: the request says not to, and a toast tells the admin to let them know", async ({ page }) => {
    const requests = await openCreateScreen(page, { email: "skipped" });
    await page.getByLabel("Email the owner a welcome").uncheck();
    await fillAndCreate(page);

    await expect(page.getByText("No welcome email was sent (you chose not to)")).toBeVisible();
    expect(requests[0]).toMatchObject({ email_owner: false });
  });

  test("a failed send does not undo the listing, and a toast says so", async ({ page }) => {
    await openCreateScreen(page, { email: "failed" });
    await fillAndCreate(page);
    await expect(page.getByTestId("admin-create-form")).toHaveCount(0);
    await expect(page.getByText("Contributor listing created — live now.")).toBeVisible();
    await expect(page.getByText("couldn't be sent")).toBeVisible();
  });

  test("email not configured on the server: a toast says no welcome was sent", async ({ page }) => {
    await openCreateScreen(page, { email: "skipped" });
    await fillAndCreate(page);
    await expect(page.getByText("Email isn't set up on the server yet")).toBeVisible();
  });

  test("C21: the intro and the toast say 'on the map' only when the new listing has a pin", async ({ page }) => {
    await openCreateScreen(page, { email: "sent", onMap: true });
    // the intro is true for every listing: Kingdom Discovery always, the map when there is a location
    await expect(page.getByText(/live in Kingdom Discovery immediately, and on the map when you give it a location/)).toBeVisible();
    await expect(page.getByText(/goes live on the map and in Kingdom Discovery immediately/)).toHaveCount(0);
    await fillAndCreate(page);
    await expect(page.getByText("Contributor listing created — live on the map now.")).toBeVisible();
  });

  test("C21: an online-only listing is announced as in Kingdom Discovery, with no map pin", async ({ page }) => {
    await openCreateScreen(page, { email: "sent", onMap: false });
    await fillAndCreate(page);
    await expect(page.getByText("Contributor listing created — live in Kingdom Discovery now. It has no map pin.")).toBeVisible();
    await expect(page.getByText(/live on the map now/)).toHaveCount(0);
  });

  test("C21: when the server does not say, the toast claims nothing about the map", async ({ page }) => {
    await openCreateScreen(page, { email: "sent" });
    await fillAndCreate(page);
    await expect(page.getByText("Contributor listing created — live now.")).toBeVisible();
  });

  test("the checkbox goes back to ticked for the next listing", async ({ page }) => {
    await openCreateScreen(page);
    await page.getByLabel("Email the owner a welcome").uncheck();
    await fillAndCreate(page);
    await expect(page.getByTestId("admin-create-form")).toHaveCount(0);
    await page.getByRole("button", { name: "Create Contributor", exact: true }).click();
    await expect(page.getByLabel("Email the owner a welcome")).toBeChecked();
  });
});
