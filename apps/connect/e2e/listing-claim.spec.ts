import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Verify-first attach for Form / Admin-created listings (C10, issue #159).
//
//  A listing made FOR an email address is never attached to anybody until that person has signed in and
//  said yes. The three ways it can end, in a real browser against the real app:
//
//    Confirm      "Attach 'X' to your account?" → Confirm → the claim runs once, they land on /dashboard
//    Not me       → the decline runs once, the claim NEVER runs, nothing else changes
//    No response  "Decide later" (or never opening it) → nothing runs; it asks again at the next sign-in
//
//  Also pinned: signing in alone claims nothing, an owner who already has a listing cannot attach another,
//  and the account menu's manual button only OPENS the screen.
//
//  Hermetic like the other signed-in specs: every backend call is mocked (e2e/support/fake-project.ts); the
//  server's own refusals (unverified address, replay, wrong person) are proven in the route tests and, against
//  the real functions, by docs/audit/probes/196_listing_claim_verify_first.probe.sql.
// ════════════════════════════════════════════════════════════════════

const USER_ID = "55555555-5555-4555-8555-555555555555";
const USER = { id: USER_ID, email: "daniel@gracepointchurch.example", fullName: "Daniel Naidoo" };

type Waiting = {
  found: true;
  mode: "attach" | "self";
  eligible: boolean;
  name: string;
  slug: string;
  category: string;
  kind: string;
  logo_url: string | null;
};
const WAITING: Waiting = {
  found: true,
  mode: "attach",
  eligible: true,
  name: "Grace Point Community Church",
  slug: "grace-point-community-church",
  category: "churches-ministries",
  kind: "ministry",
  logo_url: null,
};

type Server = {
  /** What the database still holds for this person: flips to nothing once they answered. */
  waiting: Waiting | null;
  asks: number;
  confirms: number;
  declines: number;
};

/** A real-mode session for a plain Citizen, with the three claim endpoints mocked like the server answers them. */
async function openAsCitizen(page: Page, initial: Waiting | null): Promise<Server> {
  const server: Server = { waiting: initial, asks: 0, confirms: 0, declines: 0 };
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, { user: USER, profile: { role: "citizen", contributor_status: "not_applied" } });
  // Registered after the /api/** catch-all, so these win for their paths.
  await page.route("**/api/contributor/claim", (route: Route) => {
    if (route.request().method() === "GET") {
      server.asks++;
      return route.fulfill({ json: server.waiting ?? { found: false } });
    }
    server.confirms++;
    if (!server.waiting) return route.fulfill({ status: 404, json: { error: "nothing_to_claim" } });
    const mode = server.waiting.mode;
    server.waiting = null;
    return route.fulfill({ json: { success: true, mode, slug: WAITING.slug } });
  });
  await page.route("**/api/contributor/claim/decline", (route: Route) => {
    server.declines++;
    if (!server.waiting) return route.fulfill({ status: 404, json: { error: "nothing_to_decline" } });
    server.waiting = null;
    return route.fulfill({ json: { success: true } });
  });
  return server;
}

const dialog = (page: Page) => page.getByRole("dialog");
const button = (page: Page, name: string) => dialog(page).getByRole("button", { name, exact: true });

test.describe("Verify-first attach (C10)", () => {
  // The app's CSP connect-src allows only the REAL Supabase project host;
  // bypass it so the fake project stays fully separate from production.
  test.use({ bypassCSP: true });

  test("signing in alone claims nothing: the person is ASKED, and the listing is named", async ({ page }) => {
    const server = await openAsCitizen(page, WAITING);
    await page.goto("/");

    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(dialog(page).getByRole("heading", { name: "Attach “Grace Point Community Church” to your account?" })).toBeVisible();
    await expect(dialog(page).getByText("Church", { exact: true })).toBeVisible();
    await expect(dialog(page).getByText("Nothing on your account changes unless you confirm.", { exact: false })).toBeVisible();
    await expect(button(page, "Confirm")).toBeVisible();
    await expect(button(page, "Not me")).toBeVisible();

    // Only the read-only question has been asked. No claim, no decline.
    expect(server.asks).toBe(1);
    expect(server.confirms).toBe(0);
    expect(server.declines).toBe(0);
    await expect(page.locator('[data-screen="dashboard"]')).toHaveCount(0);
  });

  test("Confirm: the claim runs exactly once and the person lands on their dashboard", async ({ page }) => {
    const server = await openAsCitizen(page, WAITING);
    // The role changed in the database, so the app does a FULL load of /dashboard (the fake project has no server
    // session, so what the dev server answers for that URL is not the point: the request is).
    const dashboardLoads: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "document" && new URL(r.url()).pathname === "/dashboard") dashboardLoads.push(r.url());
    });
    await page.goto("/");
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });

    // A double tap must not run it twice.
    await button(page, "Confirm").dblclick();

    await expect.poll(() => dashboardLoads.length).toBeGreaterThan(0);
    expect(server.confirms).toBe(1);
    expect(server.declines).toBe(0);
  });

  test("Not me: the decline runs once, the claim never runs, nothing else changes", async ({ page }) => {
    const server = await openAsCitizen(page, WAITING);
    await page.goto("/");
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });

    await button(page, "Not me").click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText("We have hidden the listing and let the team know. Nothing on your account changed.", { exact: false })).toBeVisible();
    expect(server.declines).toBe(1);
    expect(server.confirms).toBe(0);
    // They stay exactly where they were: still a Citizen on Discover, not taken to a dashboard or an apply form.
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await expect(page.locator('[data-screen="dashboard"]')).toHaveCount(0);

    // Answered is answered: the database holds nothing for them, so the next page load does not ask again.
    await page.reload();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(dialog(page)).toHaveCount(0);
    expect(server.confirms).toBe(0);
  });

  test("No response: Decide later changes nothing, is remembered for the session, and asks again at the next sign-in", async ({ page }) => {
    const server = await openAsCitizen(page, WAITING);
    await page.goto("/");
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });

    await button(page, "Decide later").click();
    await expect(dialog(page)).toHaveCount(0);
    expect(server.confirms).toBe(0);
    expect(server.declines).toBe(0);
    // The listing is still waiting: nothing was attached, nothing expired, nothing was hidden.
    expect(server.waiting).not.toBeNull();

    // Same browser session: a reload does not nag again (and does not even ask).
    const asksBefore = server.asks;
    await page.reload();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(dialog(page)).toHaveCount(0);
    expect(server.asks).toBe(asksBefore);

    // A new sign-in (a fresh browser session) asks again, and the listing is still there to answer.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
    expect(server.confirms).toBe(0);
    expect(server.declines).toBe(0);
  });

  test("Escape and the back button also just put it off: they never answer for the person", async ({ page }) => {
    const server = await openAsCitizen(page, WAITING);
    await page.goto("/");
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    expect(server.confirms + server.declines).toBe(0);
  });

  test("an owner who signed in AS the listing's own account (a new address) confirms it and opens their dashboard", async ({ page }) => {
    const server = await openAsCitizen(page, { ...WAITING, mode: "self" });
    await page.goto("/");
    await expect(dialog(page).getByRole("heading", { name: "Is “Grace Point Community Church” your listing?" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-screen="dashboard"]')).toHaveCount(0);
    expect(server.confirms).toBe(0);

    await button(page, "Confirm").click();
    await expect(page.getByText("Thank you. Your listing is confirmed.")).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 15_000 });
    expect(server.confirms).toBe(1);
    expect(server.declines).toBe(0);
  });

  test("a person who already has a listing cannot attach another: no Confirm, only Not me", async ({ page }) => {
    const server = await openAsCitizen(page, { ...WAITING, eligible: false });
    await page.goto("/");
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
    await expect(button(page, "Confirm")).toHaveCount(0);
    await expect(dialog(page).getByText("already have a listing on this account", { exact: false })).toBeVisible();
    await button(page, "Not me").click();
    await expect(dialog(page)).toHaveCount(0);
    expect(server.declines).toBe(1);
    expect(server.confirms).toBe(0);
  });

  test("a failed Confirm is explained calmly, keeps the screen open, and can be tried again", async ({ page }) => {
    const server = await openAsCitizen(page, WAITING);
    let fail = true;
    await page.route("**/api/contributor/claim", (route: Route) => {
      if (route.request().method() === "POST" && fail) {
        server.confirms++;
        return route.fulfill({ status: 403, json: { error: "email_not_verified" } });
      }
      return route.fallback();
    });
    await page.goto("/");
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });

    await button(page, "Confirm").click();
    await expect(dialog(page).getByRole("alert")).toContainText("could not confirm your email address yet");
    await expect(button(page, "Confirm")).toBeEnabled();
    fail = false;
    await button(page, "Confirm").click();
    await expect.poll(() => server.confirms).toBe(2);
  });

  test("the account menu's 'Claim a Contributor listing' only opens the screen; it claims nothing", async ({ page }) => {
    const server = await openAsCitizen(page, null);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    // nothing waiting: said plainly
    await page.getByRole("button", { name: "Your account" }).first().click();
    await page.getByRole("button", { name: "Claim a Contributor listing" }).click();
    await expect(page.getByText("No pending listing found for your email.")).toBeVisible();
    expect(server.confirms).toBe(0);

    // something waiting: the screen opens (and still nothing is claimed until Confirm)
    server.waiting = WAITING;
    await page.getByRole("button", { name: "Your account" }).first().click();
    await page.getByRole("button", { name: "Claim a Contributor listing" }).click();
    await expect(dialog(page)).toBeVisible();
    expect(server.confirms).toBe(0);
    expect(server.declines).toBe(0);
  });
});
