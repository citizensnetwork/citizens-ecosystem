import { test, expect, type Page, type Route } from "@playwright/test";
import { goTo, mapReady } from "./support/app-hooks";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

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

/** The value under the "On the map" label on the Apply wizard's review card. */
const onTheMapRow = (page: Page) => page.locator("p", { hasText: /^On the map$/ }).locator("xpath=following-sibling::p");

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
  async function openAsApplicant(page: Page, saved: Record<string, unknown> = {}) {
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
          ...saved,
        },
      });
    });
    return db;
  }

  async function applyThroughTheWizard(page: Page) {
    await bootAt(page);
    await goTo(page, "apply");
    await expect(page.getByRole("heading", { name: "Become a Contributor" })).toBeVisible();
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
    await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
    await page.getByRole("button", { name: "Market / Expo" }).click();
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
    expect(applied).toMatchObject({
      display_name: ORG_NAME,
      contributor_category: "markets-expos",
      contributor_kind: "ministry",
    });
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
    await goTo(page, "home");
    await mapReady(page);
    await expect(page.locator(".maplibregl-marker")).toHaveCount(0);
    await goTo(page, "kingdom-discovery");
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
      contributor_kind: "ministry",
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
    await goTo(page, "settings");
    await expect(page.getByText("Your Contributor application is being reviewed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply to become a Contributor" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open my application" }).click();
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible();
  });

  test("an individual is asked for their own name, and the application records that kind", async ({ page }) => {
    const db = await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await expect(page.getByRole("heading", { name: "Become a Contributor" })).toBeVisible();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.getByRole("heading", { name: "About your ministry" })).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Organisation / ministry name" })).toBeVisible();
    const type = page.getByRole("combobox", { name: "Type" });
    await expect(type).toHaveValue("ministry");

    await type.selectOption("individual");
    await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "About your ministry" })).toHaveCount(0);
    await expect(page.locator("label").filter({ hasText: /^Your name/ })).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Organisation / ministry name" })).toHaveCount(0);
    await page.getByPlaceholder("e.g. your name").fill("Grace Applicant");
    await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
    await page.getByRole("button", { name: "Market / Expo" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Individual", { exact: true })).toBeVisible();
    await expect(page.getByText("Your ministry")).toHaveCount(0);
    await page.getByRole("button", { name: "Submit application" }).click();

    await expect.poll(() => db.calls.filter((c) => c.path === "apply").length).toBe(1);
    expect(db.calls.find((c) => c.path === "apply")!.body).toMatchObject({
      display_name: "Grace Applicant",
      contributor_kind: "individual",
    });
  });

  test("presets (#202): a category starts the Type on its default, and a Type the person chose is never overwritten", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    const type = page.getByRole("combobox", { name: "Type" });
    await expect(type).toHaveValue("ministry");
    await page.getByRole("button", { name: "Business", exact: true }).click();
    await expect(type).toHaveValue("business");
    await expect(page.getByText(/We matched your Type to Business/)).toBeVisible();
    // No extra step: still three.
    await expect(page.getByText("Step 1 of 3")).toBeVisible();

    await type.selectOption("individual");
    await expect(page.getByText(/We matched your Type/)).toHaveCount(0);
    await page.getByRole("button", { name: "Church", exact: true }).click();
    await expect(type).toHaveValue("individual");
  });

  test("Care / Recovery (#202) opts in to the map: no address is asked for, and none is sent", async ({ page }) => {
    const db = await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
    await page.getByRole("button", { name: "Clinic" }).click();
    await expect(page.getByRole("combobox", { name: "Type" })).toHaveValue("organization");
    await expect(page.getByTestId("preset-care-note")).toContainText("extra look from an admin");
    await expect(page.getByPlaceholder("e.g. Eastside, Central District")).toHaveCount(0);
    await expect(page.getByText("I don't have a fixed physical location")).toHaveCount(0);

    // Nothing but the name and category is needed to go on.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    // The review says it once, and truthfully: no address or pin is stored (the listing itself is public in Discovery).
    await expect(page.getByText("Clinic · Not on the map")).toBeVisible();
    await expect(page.getByText("No. We store no address or pin.")).toBeVisible();
    await expect(page.getByText(/private/i)).toHaveCount(0);
    await expect(page.getByText(/closer look before anything is public/)).toBeVisible();
    await page.getByRole("button", { name: "Submit application" }).click();

    await expect.poll(() => db.calls.filter((c) => c.path === "apply").length).toBe(1);
    expect(db.calls.find((c) => c.path === "apply")!.body).toMatchObject({
      contributor_category: "clinic",
      contributor_kind: "organization",
      show_on_map: false,
      physical_address: null,
      physical_latitude: null,
      physical_longitude: null,
    });
  });

  test("Care / Recovery (#202): turning the map on brings the address back and says so", async ({ page }) => {
    const db = await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
    await page.getByRole("button", { name: "Clinic" }).click();
    await page.getByText("Show my address and pin on the map").click();
    await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("No. We store no address or pin.")).toHaveCount(0);
    await expect(page.getByText("Clinic · Church Square, Pretoria")).toBeVisible();
    // Yes, because the wizard has a pin here (the geocoder mock places one for a typed address): the row and the note below it
    // agree (C21). The map-on-without-a-pin case, "No", is pinned in onboardingPresetsLib.test.ts (mapRowFor).
    await expect(onTheMapRow(page)).toHaveText("Yes");
    await expect(page.getByText(/before it goes live on the map and in Kingdom Discovery/)).toBeVisible();
    await page.getByRole("button", { name: "Submit application" }).click();

    await expect.poll(() => db.calls.filter((c) => c.path === "apply").length).toBe(1);
    expect(db.calls.find((c) => c.path === "apply")!.body).toMatchObject({ show_on_map: true, physical_address: "Church Square, Pretoria" });
  });

  test("design spec on #202: a Care / Recovery type has no 'no fixed location' switch, so the map switch and it cannot contradict", async ({ page }) => {
    const db = await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
    const noFixed = page.getByRole("switch", { name: /fixed physical location/ });

    // Said "no fixed location" first, then picked a Care type: that answer does not carry over.
    await noFixed.click();
    await expect(noFixed).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Clinic" }).click();
    await expect(noFixed).toHaveCount(0);
    await page.getByRole("switch", { name: /Show my address and pin on the map/ }).click();
    await expect(noFixed).toHaveCount(0);
    await expect(page.getByPlaceholder("e.g. Eastside, Central District")).toBeVisible();
    await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");

    // Back to a type with no Care rule: the switch returns, and it starts off.
    await page.getByRole("button", { name: "Church", exact: true }).click();
    await expect(noFixed).toHaveAttribute("aria-checked", "false");

    await page.getByRole("button", { name: "Clinic" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/Online \/ no fixed location/)).toHaveCount(0);
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect.poll(() => db.calls.filter((c) => c.path === "apply").length).toBe(1);
    expect(db.calls.find((c) => c.path === "apply")!.body).toMatchObject({ no_fixed_location: false, show_on_map: true });
  });

  test("design spec on #202: the Type follows the category until the person picks one", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    const type = page.getByRole("combobox", { name: "Type" });
    await page.getByRole("button", { name: "Business", exact: true }).click();
    await expect(type).toHaveValue("business");
    // Market / Expo names no preset: the Type goes back to where the wizard starts, and the hint goes with it.
    await page.getByRole("button", { name: "Market / Expo" }).click();
    await expect(type).toHaveValue("ministry");
    await expect(page.getByText(/We matched your Type/)).toHaveCount(0);

    // A Type the person chose is never changed, by a preset or by a category with none.
    await type.selectOption("individual");
    await page.getByRole("button", { name: "Business", exact: true }).click();
    await expect(type).toHaveValue("individual");
    await page.getByRole("button", { name: "Market / Expo" }).click();
    await expect(type).toHaveValue("individual");
  });

  test("design spec on #202: what appears is announced (live regions), and the note and switch share a named group", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    const careNote = page.getByTestId("preset-care-note");
    const noteSlot = page.locator('[aria-live="polite"]').filter({ has: careNote });

    // Both live regions are in the page BEFORE anything changes (a region added with its content is not announced).
    await expect(careNote).toHaveCount(0);
    const slotsBefore = await page.locator('[aria-live="polite"]').count();
    expect(slotsBefore).toBeGreaterThanOrEqual(2);
    const groupSlot = page.getByRole("group", { name: "Area / location served" }).locator(':scope > [aria-live="polite"]');
    await expect(groupSlot).toHaveCount(1);
    await expect(groupSlot).toBeEmpty();

    await page.getByRole("button", { name: "Clinic" }).click();
    await expect(noteSlot).toHaveCount(1);
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(slotsBefore);
    const group = page.getByRole("group", { name: "Area / location served" });
    await expect(group.getByTestId("preset-care-note")).toBeVisible();
    // The switch sits in the group, outside the live region.
    await expect(group.getByRole("switch", { name: /Show my address and pin on the map/ })).toBeVisible();
    await expect(noteSlot.getByRole("switch")).toHaveCount(0);

    // The Type sentence is announced in its own region, which holds the changing words.
    await page.getByRole("button", { name: "Business", exact: true }).click();
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: /We matched your Type to Business/ })).toHaveCount(1);
  });

  test("design spec on #202: the Care note's words are the foreground colour (the icon alone is gold), and the empty slot adds no gap", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    // No Care type yet: the slot is empty and takes no room, so the rows below it sit where they always did.
    const slotGap = await page.getByRole("group", { name: "Area / location served" }).evaluate((group) => {
      const slot = group.firstElementChild as HTMLElement;
      const next = slot.nextElementSibling as HTMLElement;
      return { slotHeight: slot.getBoundingClientRect().height, gap: next.getBoundingClientRect().top - group.getBoundingClientRect().top };
    });
    expect(slotGap.slotHeight).toBe(0);
    expect(slotGap.gap).toBe(0);

    await page.getByRole("button", { name: "Clinic" }).click();
    // The note's words are the foreground colour, the icon alone is the gold ink (design spec change 2: gold text on this
    // fill was 4.35:1, under the 4.5:1 text minimum; the foreground is 17.03:1).
    const note = page.getByTestId("preset-care-note");
    await expect(note).toHaveClass(/text-foreground/);
    await expect(note).not.toHaveClass(/text-gold/);
    await expect(note.locator("svg")).toHaveClass(/text-gold-dark/);
    const colours = await note.evaluate((el) => ({
      container: getComputedStyle(el).color,
      text: getComputedStyle(el.querySelector("p")!).color,
      icon: getComputedStyle(el.querySelector("svg")!).color,
    }));
    expect(colours.text).toBe(colours.container);
    expect(colours.icon).not.toBe(colours.text);
  });

  test("design spec on #202: the review step names the category for a Church as well as a Clinic", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
    await page.getByRole("button", { name: "Church", exact: true }).click();
    await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Church · Church Square, Pretoria")).toBeVisible();
    await expect(page.getByText("Category · ")).toHaveCount(0);
  });

  test("a pending individual keeps that kind, and the name field still says Your name", async ({ page }) => {
    const db = await openAsApplicant(page, { contributor_kind: "individual" });
    db.profile.contributor_status = "pending";
    await bootAt(page, "/dashboard");
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Type" })).toHaveValue("individual");
    await expect(page.locator("label").filter({ hasText: /^Your name/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue(ORG_NAME);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => db.calls.filter((c) => c.method === "PATCH").length).toBe(1);
    expect(db.calls.find((c) => c.method === "PATCH")!.body).toMatchObject({
      display_name: ORG_NAME,
      contributor_kind: "individual",
    });
  });

  test("C21: the last wizard step says an online-only listing goes live in Kingdom Discovery, never on the map", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
    await page.getByRole("switch", { name: /fixed physical location/ }).click();
    await page.getByRole("button", { name: "Market / Expo" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    const note = page.getByText(/admin reviews every application/i);
    await expect(note).toContainText("before it goes live in Kingdom Discovery.");
    await expect(note).not.toContainText("on the map");
  });

  test("C21: the 'being reviewed' banner says 'on the map' only for an application with a pin", async ({ page }) => {
    const db = await openAsApplicant(page);
    db.profile.contributor_status = "pending";
    await bootAt(page, "/dashboard");
    await expect(page.getByTestId("pending-banner")).toContainText("it goes on the map once approved");
  });

  test("C21: an online-only application is told it goes into Kingdom Discovery, never the map", async ({ page }) => {
    const db = await openAsApplicant(page, { no_fixed_location: true, physical_address: null, physical_latitude: null, physical_longitude: null });
    db.profile.contributor_status = "pending";
    await bootAt(page, "/dashboard");
    const banner = page.getByTestId("pending-banner");
    await expect(banner).toContainText("it goes into Kingdom Discovery once approved");
    await expect(banner).not.toContainText("on the map");
  });

  test("C21: an application with an address but no pin is not promised the map either", async ({ page }) => {
    const db = await openAsApplicant(page, { physical_latitude: null, physical_longitude: null });
    db.profile.contributor_status = "pending";
    await bootAt(page, "/dashboard");
    await expect(page.getByTestId("pending-banner")).toContainText("it goes into Kingdom Discovery once approved");
  });

  test("C21: Settings tells a pending applicant it 'goes live', which is true for everyone", async ({ page }) => {
    const db = await openAsApplicant(page, { no_fixed_location: true, physical_address: null, physical_latitude: null, physical_longitude: null });
    db.profile.contributor_status = "pending";
    await bootAt(page, "/dashboard");
    await goTo(page, "settings");
    await expect(page.getByText("It goes live once an admin approves it.")).toBeVisible();
    await expect(page.getByText(/It goes on the map once an admin approves it/)).toHaveCount(0);
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
    await goTo(page, "settings");
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
    await goTo(page, "admin");
    await expect(page.locator('[data-screen="admin"]')).toBeVisible();
    return reviews;
  }

  test("a Care / Recovery application carries the extra-review note for the admin, and nobody else's does (#202)", async ({ page }) => {
    await openApplications(page, [application({}), application({ id: "22222222-2222-4222-8222-222222222222", category: "churches-ministries" })]);
    await expect(page.locator(`[data-application="${PENDING_ID}"]`).getByTestId("extra-review")).toContainText("Extra review: care or recovery");
    await expect(page.locator(`[data-application="${PENDING_ID}"]`).getByTestId("extra-review")).toContainText("Read the story, the website and their reason before you approve.");
    await expect(page.locator('[data-application="22222222-2222-4222-8222-222222222222"]').getByTestId("extra-review")).toHaveCount(0);
  });

  test("design spec on #202: the extra-review note is told apart from 'previously removed' (own icon, 12 px sentence-case heading)", async ({ page }) => {
    await openApplications(page, [application({ previouslyRemovedAt: "2026-10-03T14:07:00Z" })]);
    const card = page.locator(`[data-application="${PENDING_ID}"]`);
    const removed = card.getByTestId("previously-removed");
    const extra = card.getByTestId("extra-review");
    await expect(removed).toBeVisible();
    await expect(extra).toBeVisible();
    // Two notes, two icons: the flag stays with the warning about this applicant, the procedure gets the shield.
    const icons = {
      removed: await removed.locator("svg").first().evaluate((el) => el.outerHTML),
      extra: await extra.locator("svg").first().evaluate((el) => el.outerHTML),
    };
    expect(icons.extra).not.toBe(icons.removed);
    // The heading is at the 12 px floor (the old badge was 10 px, uppercase) and says "Extra review", not "Care / Recovery" twice.
    const heading = extra.locator("p").first();
    await expect(heading).toHaveText("Extra review: care or recovery");
    expect(await heading.evaluate((el) => getComputedStyle(el).fontSize)).toBe("12px");
    expect(await heading.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
    await expect(extra).not.toContainText(/founder/i);
  });

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

  test("C21: the Approve step and the toast say 'on the map' only when the applicant has a pin", async ({ page }) => {
    const ONLINE_ID = "d4444444-4444-4444-8444-444444444444";
    await openApplications(page, [
      application({}),
      application({ id: ONLINE_ID, name: "Online Fixture Fellowship", noFixedLocation: true, hasPin: false, location: "Online / no fixed location" }),
    ]);
    const pinned = page.locator(`[data-application="${PENDING_ID}"]`);
    const online = page.locator(`[data-application="${ONLINE_ID}"]`);

    await pinned.getByRole("button", { name: "Approve" }).click();
    await expect(pinned.getByTestId("approve-where")).toHaveText("This puts them on the map and in Kingdom Discovery, and emails them.");
    await online.getByRole("button", { name: "Approve" }).click();
    const where = online.getByTestId("approve-where");
    await expect(where).toContainText("This puts them in Kingdom Discovery");
    await expect(where).toContainText("no map pin");
    await expect(where).not.toContainText("on the map and");

    // the toast follows what the server says about the approved listing: pin, no pin, or nothing said
    const answers: Record<string, unknown>[] = [
      { success: true, action: "approved", slug: "online-fixture", onMap: false, email: "sent" },
      { success: true, action: "approved", slug: "grace-test-ministry", onMap: true, email: "sent" },
    ];
    await page.route("**/api/admin/contributors/review", (route) => json(route, answers.shift() ?? {}));
    await online.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(/Approved\. They are live in Kingdom Discovery \(no map pin\)\./)).toBeVisible();
    await pinned.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(/Approved\. They are live on the map\./)).toBeVisible();
  });

  test("C21: when the server does not say, the toast claims nothing about the map", async ({ page }) => {
    await openApplications(page, [application({})]);
    await page.route("**/api/admin/contributors/review", (route) => json(route, { success: true, action: "approved", slug: "grace-test-ministry", email: "sent" }));
    const card = page.locator(`[data-application="${PENDING_ID}"]`);
    await card.getByRole("button", { name: "Approve" }).click();
    await card.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(/Approved\. They are live\. We emailed them\./)).toBeVisible();
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
