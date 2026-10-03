import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

declare global {
  interface Window {
    __cc: { go: (page: string, params?: Record<string, unknown>) => void };
    __ccMap?: unknown;
  }
}

// ════════════════════════════════════════════════════════════════════
//  D-12, signed in (real mode): a self-serve application WAITS for an admin.
//
//  Hermetic like the other signed-in specs: a REAL-mode session against a fake
//  Supabase project (e2e/support/fake-project.ts) plus the app's own /api/**
//  answered locally. The routes below behave like the real ones (the apply
//  route leaves the person `pending`; the public feed lists approved
//  Contributors only), so what is under test is what the BROWSER does with
//  them: the pending Dashboard, the staged profile edits, and an admin
//  decision that waits for the server.
//
//  The demo-mode counterpart (no session, one person is both applicant and
//  admin, the pin appears after approval) is e2e/kingdom-discovery.spec.ts.
// ════════════════════════════════════════════════════════════════════

test.use({ bypassCSP: true });

const APPLICANT = { id: "77777777-7777-4777-8777-777777777777", email: "applicant@applicant.example", fullName: "Grace Applicant" };
const ADMIN = { id: "88888888-8888-4888-8888-888888888888", email: "admin@citizens.example", fullName: "Test Admin" };
const APP_ID = "a1111111-1111-4111-8111-111111111111";
const ORG_NAME = "Grace Test Ministry";
const PRETORIA = { lat: -25.7479, lng: 28.2293 };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });

async function bootAt(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator('[data-screen="discover"], [data-screen="pending-application"], [data-screen="dashboard"], [data-screen="admin"]').first()).toBeVisible({ timeout: 15_000 });
}

test.describe("signed in: applying and waiting", () => {
  /**
   * A tiny stateful "database": the applicant's profile (what loadSession reads)
   * and what the public feed would list. Applying flips them the way the real
   * route does; an admin approving (done by the test) flips them again.
   */
  async function openAsApplicant(page: Page) {
    const db = {
      profile: { role: "citizen", contributor_status: "not_applied" as string },
      calls: [] as { method: string; path: string; body: Record<string, unknown> | null }[],
    };
    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    await signInToFakeProject(page, { user: APPLICANT, profile: db.profile });

    // A citizen with nothing to claim stays put (a 200 would reload into /dashboard).
    await page.route("**/api/contributor/claim", (route) => json(route, { error: "nothing_to_claim" }, 404));

    // The public feed lists APPROVED Contributors only — an applicant is never in it.
    await page.route(/\/api\/v1\/contributors(\?|$)/, (route) =>
      json(route, { data: [], meta: { count: 0, limit: 100, offset: 0 } }),
    );

    await page.route("**/api/contributor/apply", (route) => {
      db.calls.push({ method: "POST", path: "apply", body: route.request().postDataJSON() });
      db.profile.contributor_status = "pending";
      return json(route, { success: true, application_id: APP_ID, status: "pending", approved: false, slug: null });
    });
    await page.route("**/api/contributor/application", (route) => {
      const request = route.request();
      if (request.method() === "PATCH") {
        db.calls.push({ method: "PATCH", path: "application", body: request.postDataJSON() });
        return json(route, { success: true });
      }
      return json(route, {
        data: {
          id: APP_ID,
          status: db.profile.contributor_status,
          submitted_at: new Date().toISOString(),
          rejection_reason: null,
          display_name: ORG_NAME,
          contributor_category: "retreat-healing",
          bio: "Saved earlier.",
          website_url: null,
          contributor_contact_email: null,
          no_fixed_location: false,
          physical_address: "Church Square, Pretoria",
          physical_latitude: PRETORIA.lat,
          physical_longitude: PRETORIA.lng,
          logo_url: null,
          cover_photo_urls: [],
        },
      });
    });
    return db;
  }

  async function applyThroughTheWizard(page: Page) {
    await bootAt(page);
    await page.evaluate(() => window.__cc.go("apply"));
    await expect(page.getByRole("heading", { name: "Become a Contributor" })).toBeVisible();
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
    await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
    await page.getByRole("button", { name: "Retreat / Healing" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/admin reviews every application/i)).toBeVisible();
    await page.getByRole("button", { name: "Submit application" }).click();
  }

  test("applying lands on the pending Dashboard with the banner, and nothing of theirs reaches the map or Discovery", async ({ page }) => {
    const db = await openAsApplicant(page);
    await applyThroughTheWizard(page);

    // The server was asked to apply, with the wizard's answers and nothing it should not decide.
    await expect.poll(() => db.calls.filter((c) => c.path === "apply").length).toBe(1);
    const applied = db.calls.find((c) => c.path === "apply")!.body!;
    expect(applied).toMatchObject({ display_name: ORG_NAME, contributor_category: "retreat-healing" });
    expect(applied).not.toHaveProperty("status");
    expect(applied).not.toHaveProperty("role");

    // Their Dashboard is the "being reviewed" page, not the Contributor portal and not the old "go live" wizard.
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-screen="dashboard"]')).toHaveCount(0);
    const banner = page.getByTestId("pending-banner");
    await expect(banner).toContainText("Your listing is being reviewed");
    await expect(banner).toContainText("it goes on the map once approved");
    await expect(page.getByRole("heading", { name: "You're approved!" })).toHaveCount(0);

    // Not on the map, not in Kingdom Discovery.
    await page.evaluate(() => window.__cc.go("home"));
    await page.waitForFunction(() => !!window.__ccMap, undefined, { timeout: 15_000 });
    await expect(page.locator(".maplibregl-marker")).toHaveCount(0);
    await page.evaluate(() => window.__cc.go("kingdom-discovery"));
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
    await expect(page.locator('[data-screen="kingdom-discovery"]').getByText(ORG_NAME)).toHaveCount(0);
  });

  test("they can finish their profile while pending: edits go to their own application, not the public profile", async ({ page }) => {
    const db = await openAsApplicant(page);
    await applyThroughTheWizard(page);
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible({ timeout: 10_000 });

    // The editor opens with what is already saved on the application.
    await expect(page.getByPlaceholder("Tell citizens who you are…")).toHaveValue("Saved earlier.");

    await page.getByPlaceholder("Tell citizens who you are…").fill("A quiet retreat in the heart of the city.");
    await page.getByPlaceholder("yourministry.org", { exact: true }).fill("grace.example");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText(/goes live once your application is approved/i)).toBeVisible();
    const patch = db.calls.filter((c) => c.method === "PATCH");
    expect(patch).toHaveLength(1);
    expect(patch[0].body).toMatchObject({
      display_name: ORG_NAME,
      bio: "A quiet retreat in the heart of the city.",
      website_url: "grace.example",
    });
    // The staged profile is the only thing this screen writes: no role, status or slug.
    for (const key of ["role", "status", "contributor_status", "contributor_slug", "user_id"]) {
      expect(patch[0].body).not.toHaveProperty(key);
    }
  });

  test("a reload (and the /dashboard link) still lands a pending applicant on their application, and Settings says so", async ({ page }) => {
    const db = await openAsApplicant(page);
    db.profile.contributor_status = "pending"; // they applied in an earlier visit
    await bootAt(page, "/dashboard");
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("pending-banner")).toBeVisible();

    // Settings no longer pitches "Apply to become a Contributor" to someone who already has.
    await page.evaluate(() => window.__cc.go("settings"));
    await expect(page.getByText("Your Contributor application is being reviewed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply to become a Contributor" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open my application" }).click();
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible();
  });

  test("once an admin has approved, the same person gets the real Contributor Dashboard", async ({ page }) => {
    const db = await openAsApplicant(page);
    db.profile.role = "contributor";
    db.profile.contributor_status = "approved"; // an admin approved them
    await bootAt(page, "/dashboard");
    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-screen="pending-application"]')).toHaveCount(0);
  });

  test("a rejected applicant is told how to apply again from Settings", async ({ page }) => {
    const db = await openAsApplicant(page);
    db.profile.contributor_status = "rejected";
    await bootAt(page);
    await page.evaluate(() => window.__cc.go("settings"));
    await expect(page.getByText(/wasn't approved this time/)).toBeVisible();
    await page.getByRole("button", { name: "Apply again" }).click();
    await expect(page.getByRole("heading", { name: "Become a Contributor" })).toBeVisible();
  });
});

test.describe("signed in as the admin: Applications", () => {
  const PENDING_ID = "b2222222-2222-4222-8222-222222222222";
  const REJECTED_ID = "c3333333-3333-4333-8333-333333333333";

  const application = (overrides: Record<string, unknown>) => ({
    id: PENDING_ID,
    userId: APPLICANT.id,
    name: ORG_NAME,
    photo: null,
    bio: "We serve the city.",
    category: "retreat-healing",
    kind: "ministry",
    website: "https://grace.example/",
    location: "1 Example Road, Pretoria",
    noFixedLocation: false,
    hasPin: true,
    reason: "To serve.",
    socials: { instagram: "@gracehub", facebook: "javascript:alert(1)" },
    contactEmail: "hello@grace.example",
    covers: ["https://cdn.grace.example/c1.jpg", "javascript:alert(2)"],
    status: "pending",
    submittedAt: "2026-10-03T10:00:00Z",
    reviewedAt: null,
    reviewNote: "",
    applicantName: "Grace Applicant",
    previouslyRemovedAt: null,
    ...overrides,
  });

  async function openApplications(page: Page, apps: unknown[]) {
    const reviews: { body: Record<string, unknown>; status: number }[] = [];
    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    await signInToFakeProject(page, { user: ADMIN, profile: { role: "admin", contributor_status: "not_applied" } });
    await page.route("**/api/contributor/claim", (route) => json(route, { error: "nothing_to_claim" }, 404));
    await page.route("**/api/admin/contributor-applications", (route) => json(route, { data: apps }));
    // The cover thumbnail is a (reserved-domain) https URL: answer it locally so nothing leaves the machine.
    await page.route("https://cdn.grace.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACw=", "base64") }),
    );
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => window.__cc.go("admin"));
    await expect(page.locator('[data-screen="admin"]')).toBeVisible();
    return reviews;
  }

  test("shows the staged profile, the 'previously removed' note, and only ever links http(s) addresses", async ({ page }) => {
    await openApplications(page, [application({ previouslyRemovedAt: "2026-10-03T14:07:00Z" })]);
    const card = page.locator(`[data-application="${PENDING_ID}"]`);
    await expect(card).toBeVisible();

    await expect(card.getByTestId("previously-removed")).toContainText("Previously removed by an admin on 3 Oct 2026");
    // The map category, not the kind (the old card showed the wrong chip).
    await expect(card.getByText("Retreat / Healing")).toBeVisible();
    await expect(card.getByText("hello@grace.example")).toBeVisible();

    // Untrusted content: an https website is a link; a javascript: value is never one.
    await expect(card.locator('a[href="https://grace.example/"]')).toHaveCount(1);
    await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0);
    await expect(card.locator('img[src^="javascript:" i]')).toHaveCount(0);
  });

  test("a decision waits for the server: a refusal is shown and the card stays pending, then a retry succeeds", async ({ page }) => {
    await openApplications(page, [application({})]);
    const calls: Record<string, unknown>[] = [];
    let attempt = 0;
    await page.route("**/api/admin/contributors/review", (route) => {
      calls.push(route.request().postDataJSON());
      attempt += 1;
      return attempt === 1
        ? json(route, { error: "review_failed" }, 500)
        : json(route, { success: true, action: "approved", slug: "grace-test-ministry", email: "sent" });
    });

    const card = page.locator(`[data-application="${PENDING_ID}"]`);
    await card.getByRole("button", { name: "Approve" }).click();
    await card.getByRole("button", { name: "Confirm" }).click();

    // The failure is visible and the card did NOT pretend it was approved.
    await expect(card.getByRole("alert")).toContainText("Could not save the decision");
    await expect(card.getByText("Pending Review", { exact: true })).toBeVisible();
    await expect(card.getByText(/Approved — contributor access granted/)).toHaveCount(0);

    await card.getByRole("button", { name: "Confirm" }).click();
    await expect(card.getByText(/Approved — contributor access granted/)).toBeVisible();
    await expect(page.getByText(/We emailed them/)).toBeVisible();
    expect(calls).toEqual([
      { application_id: PENDING_ID, action: "approve", reason: "" },
      { application_id: PENDING_ID, action: "approve", reason: "" },
    ]);
  });

  test("a rejection needs a reason, sends it to the server, and says when the email could not go", async ({ page }) => {
    await openApplications(page, [application({})]);
    const calls: Record<string, unknown>[] = [];
    await page.route("**/api/admin/contributors/review", (route) => {
      calls.push(route.request().postDataJSON());
      return json(route, { success: true, action: "rejected", email: "skipped" });
    });

    const card = page.locator(`[data-application="${PENDING_ID}"]`);
    await card.getByRole("button", { name: "Reject" }).click();
    await expect(card.getByRole("button", { name: "Confirm" })).toBeDisabled();
    await card.getByLabel("Reason for the applicant").fill("Please add a website or a social page.");
    await card.getByRole("button", { name: "Confirm" }).click();

    await expect(card.getByText("Rejected", { exact: true })).toBeVisible();
    // Email 'skipped' (no key configured): the admin is told to tell them themselves.
    await expect(page.getByText(/couldn't email them/)).toBeVisible();
    expect(calls).toEqual([{ application_id: PENDING_ID, action: "reject", reason: "Please add a website or a social page." }]);
  });

  test("an already-reviewed application shows the reason the applicant was given", async ({ page }) => {
    await openApplications(page, [
      application({ id: REJECTED_ID, status: "rejected", reviewNote: "Please add a website.", reviewedAt: "2026-10-04T08:00:00Z" }),
    ]);
    const card = page.locator(`[data-application="${REJECTED_ID}"]`);
    await expect(card.getByText("Please add a website.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });
});
