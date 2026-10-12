import { test, expect, type Page, type Route } from "@playwright/test";
import { goTo } from "./support/app-hooks";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  D-13: Admin → Create Contributor emails the owner a welcome.
//
//  What is under test is the BROWSER: the "Email the owner a welcome" checkbox
//  (on by default), what the Create request carries, how the success panel
//  reports the server's answer (sent / failed / skipped), and that the screen
//  no longer tells the admin the owner must use Google. The email itself is
//  sent by the server (unit-tested with a faked network; no real mail here).
//  Hermetic: a signed-in admin against the fake Supabase project.
// ════════════════════════════════════════════════════════════════════

test.use({ bypassCSP: true });

const ADMIN = { id: "88888888-8888-4888-8888-888888888888", email: "admin@citizens.example", fullName: "Test Admin" };
const OWNER_EMAIL = "owner@grace.example";

type Reply = { email: "sent" | "failed" | "skipped" };

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
  await page.getByRole("button", { name: "Create Contributor" }).click();
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

  test("ticked: the request asks for the email, and the panel says it was sent", async ({ page }) => {
    const requests = await openCreateScreen(page, { email: "sent" });
    await fillAndCreate(page);

    await expect(page.getByTestId("create-result")).toBeVisible();
    await expect(page.getByTestId("create-email-status")).toContainText(`Welcome email sent to ${OWNER_EMAIL}`);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ display_name: "Grace Outreach", claim_email: OWNER_EMAIL, email_owner: true });
  });

  test("unticked: the request says not to, and the panel tells the admin to let them know", async ({ page }) => {
    const requests = await openCreateScreen(page, { email: "skipped" });
    await page.getByLabel("Email the owner a welcome").uncheck();
    await fillAndCreate(page);

    await expect(page.getByTestId("create-email-status")).toContainText("No welcome email was sent (you chose not to)");
    expect(requests[0]).toMatchObject({ email_owner: false });
  });

  test("a failed send does not undo the listing, and the panel says so", async ({ page }) => {
    await openCreateScreen(page, { email: "failed" });
    await fillAndCreate(page);
    await expect(page.getByText(/Live: \/grace-outreach/)).toBeVisible();
    await expect(page.getByTestId("create-email-status")).toContainText("couldn't be sent");
  });

  test("email not configured on the server: the panel says no welcome was sent", async ({ page }) => {
    await openCreateScreen(page, { email: "skipped" });
    await fillAndCreate(page);
    await expect(page.getByTestId("create-email-status")).toContainText("Email isn't set up on the server yet");
  });

  test("the checkbox goes back to ticked for the next listing", async ({ page }) => {
    await openCreateScreen(page);
    await page.getByLabel("Email the owner a welcome").uncheck();
    await fillAndCreate(page);
    await expect(page.getByTestId("create-result")).toBeVisible();
    await expect(page.getByLabel("Email the owner a welcome")).toBeChecked();
  });
});
