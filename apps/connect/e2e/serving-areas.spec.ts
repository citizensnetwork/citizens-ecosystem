import { test, expect, type Page, type Route } from "@playwright/test";
import { goTo } from "./support/app-hooks";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Issue #259, PR B: the serving-areas picker, in a real browser.
//
//  Hermetic like the other signed-in specs: a REAL-mode session against a fake Supabase project plus the app's own /api/**
//  answered locally (the public area index, the owner's read and write, the apply route). What is under test is what the
//  BROWSER does: the picker appears only for a Contributor with no fixed location and adds no wizard step; opening an area ticks
//  nothing; a tick never goes upward; the distance is disabled until an area is chosen; the choice is sent AFTER the application
//  is; a failure never undoes the application.
//  The globe itself (PR C) has its own real-touch spec. The database rules are proved by the probe, not here.
// ════════════════════════════════════════════════════════════════════

test.use({ bypassCSP: true });

const APPLICANT = { id: "77777777-7777-4777-8777-777777777777", email: "applicant@applicant.example", fullName: "Grace Applicant" };
const APP_ID = "a1111111-1111-4111-8111-111111111111";
const ORG = "Grace Online Ministry";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GP = U(1), KZN = U(2), PTA = U(3), CEN = U(4), ELD = U(5), HAT = U(6);
const area = (id: string, name: string, level: string, parent: string | null) => ({ id, name, level, parent_id: parent, slug: name.toLowerCase(), sort: 0 });
const AREAS = [
  area(GP, "Gauteng", "province", null), area(KZN, "KwaZulu-Natal", "province", null),
  area(PTA, "Pretoria", "place", GP), area(CEN, "Centurion", "place", GP),
  area(ELD, "Eldoraigne", "suburb", CEN), area(HAT, "Hatfield", "suburb", PTA),
];

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
const tick = (page: Page, id: string) => page.locator(`[data-serving-tick="${id}"]`);
const expander = (page: Page, id: string) => page.locator(`[data-serving-expand="${id}"]`);

type Db = { calls: { method: string; path: string; body: Record<string, unknown> | null }[]; areaRequests: string[]; saved: Record<string, unknown> };

async function openAsApplicant(page: Page, opts: { pending?: boolean; saved?: Record<string, unknown>; putStatus?: number } = {}) {
  const db: Db = { calls: [], areaRequests: [], saved: opts.saved ?? { area_ids: [], radius_km: null, radius_centre_area_id: null, presence: "online" } };
  const profile = { role: "citizen", contributor_status: opts.pending ? "pending" : "not_applied" };
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, { user: APPLICANT, profile });
  await page.route("**/api/contributor/claim", (route) => json(route, { error: "nothing_to_claim" }, 404));
  await page.route(/\/api\/v1\/contributors(\?|$)/, (route) => json(route, { data: [], meta: { count: 0, limit: 100, offset: 0 } }));

  // the public area index: provinces and cities/towns by default, children by parent, suburbs by level
  await page.route("**/api/v1/service-areas**", (route) => {
    const url = new URL(route.request().url());
    db.areaRequests.push(url.pathname + url.search);
    const parent = url.searchParams.get("parent");
    const level = url.searchParams.get("level");
    const data = parent ? AREAS.filter((a) => a.parent_id === parent) : level ? AREAS.filter((a) => a.level === level) : AREAS.filter((a) => a.level !== "suburb");
    return json(route, { data, meta: { count: data.length, limit: 500, offset: 0 } });
  });
  await page.route("**/api/contributor/service-areas**", (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      db.calls.push({ method: "PUT", path: "service-areas", body: request.postDataJSON() });
      const status = opts.putStatus ?? 200;
      if (status >= 400) return json(route, { error: "save_failed" }, status);
      const sent = request.postDataJSON();
      db.saved = { area_ids: sent.area_ids, radius_km: sent.radius_km, radius_centre_area_id: sent.radius_centre_area_id, presence: sent.presence };
      return json(route, db.saved);
    }
    return json(route, db.saved);
  });
  await page.route("**/api/contributor/apply", (route) => {
    db.calls.push({ method: "POST", path: "apply", body: route.request().postDataJSON() });
    profile.contributor_status = "pending";
    return json(route, { success: true, application_id: APP_ID, status: "pending", approved: false, slug: null });
  });
  await page.route("**/api/contributor/application", (route) =>
    json(route, {
      data: {
        id: APP_ID, status: "pending", submitted_at: new Date().toISOString(), rejection_reason: null, display_name: ORG,
        contributor_category: "retreat-healing", bio: "Saved earlier.", website_url: null, contributor_contact_email: null,
        no_fixed_location: true, physical_address: null, physical_latitude: null, physical_longitude: null, logo_url: null, cover_photo_urls: [],
      },
    }),
  );
  return db;
}

async function bootAt(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator('[data-screen="discover"], [data-screen="pending-application"], [data-screen="dashboard"]').first()).toBeVisible({ timeout: 15_000 });
}

test.describe("the Apply wizard", () => {
  test("a Contributor with a place sees no picker and no extra step", async ({ page }) => {
    const db = await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.locator("[data-serving-picker]")).toHaveCount(0);
    await expect(page.getByText("Where do you serve?")).toHaveCount(0);
    expect(db.areaRequests).toEqual([]); // nothing is even fetched for them
  });

  test("saying 'no fixed location' reveals the picker inside the same step; opening ticks nothing; a tick never goes upward", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG);
    await page.getByText("I don't have a fixed physical location").click();

    await expect(page.locator("[data-serving-picker]")).toBeVisible();
    await expect(page.getByText("Step 1 of 3")).toBeVisible(); // still three steps
    await expect(page.locator('[data-serving-row="' + GP + '"]')).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0); // no mini-map

    // opening is not ticking
    await expander(page, GP).click();
    await expect(page.locator('[data-serving-row="' + CEN + '"]')).toBeVisible();
    await expect(tick(page, GP)).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("[data-serving-summary]")).toHaveText("Serving: nothing chosen yet");

    // a suburb: only that suburb
    await expander(page, CEN).click();
    await tick(page, ELD).click();
    await expect(tick(page, ELD)).toHaveAttribute("aria-checked", "true");
    await expect(tick(page, CEN)).toHaveAttribute("aria-checked", "false");
    await expect(tick(page, GP)).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("[data-serving-summary]")).toHaveText("Serving: Eldoraigne");
  });

  test("the distance is disabled with a reason until an area is chosen", async ({ page }) => {
    await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByText("I don't have a fixed physical location").click();
    const box = page.locator("[data-serving-radius]");
    await expect(box).toHaveAttribute("data-serving-radius", "disabled");
    await expect(page.getByText("Choose an area first. A distance needs a centre.")).toBeVisible();
    await expect(page.locator('[data-serving-radius-km="50"]')).toBeDisabled();
    await tick(page, GP).click();
    await expect(box).toHaveAttribute("data-serving-radius", "enabled");
    await expect(page.locator('[data-serving-radius-km="50"]')).toBeEnabled();
    await tick(page, GP).click(); // unticking the last area closes it again
    await expect(box).toHaveAttribute("data-serving-radius", "disabled");
  });

  test("the choice is sent AFTER the application, exactly as chosen, and the review says what was chosen", async ({ page }) => {
    const db = await openAsApplicant(page);
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG);
    await page.getByRole("button", { name: "Retreat / Healing" }).click();
    await page.getByText("I don't have a fixed physical location").click();

    await expander(page, GP).click();
    await tick(page, PTA).click();
    await expect(page.getByText("Includes everything inside")).toBeVisible();
    await page.locator('[data-serving-radius-km="25"]').click();
    await page.locator('[data-serving-presence="no_fixed_place"]').click();

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/admin reviews every application/i)).toBeVisible();
    await expect(page.getByText("all of Pretoria")).toBeVisible(); // the review row
    await expect(page.getByText("Online in this area: people there find you once you are approved.")).toBeVisible();
    // C21: an online-only application is never promised the map
    await expect(page.getByText(/on the map/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Submit application" }).click();

    await expect.poll(() => db.calls.map((c) => c.path)).toEqual(["apply", "service-areas"]); // application first, then the areas
    expect(db.calls[0]!.body).toMatchObject({ no_fixed_location: true, display_name: ORG });
    expect(db.calls[1]!.body).toEqual({ area_ids: [PTA], radius_km: 25, radius_centre_area_id: PTA, presence: "no_fixed_place" });
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible({ timeout: 10_000 });
  });

  test("a failed save of the areas never undoes the application: they are told, plainly", async ({ page }) => {
    const db = await openAsApplicant(page, { putStatus: 500 });
    await bootAt(page);
    await goTo(page, "apply");
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG);
    await page.getByRole("button", { name: "Retreat / Healing" }).click();
    await page.getByText("I don't have a fixed physical location").click();
    await tick(page, GP).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Your application is sent. Please add your areas again from your dashboard.")).toBeVisible();
    expect(db.calls.map((c) => c.path)).toEqual(["apply", "service-areas"]);
  });
});

test.describe("the pending Dashboard", () => {
  test("shows the saved choice, saves a change on its own button, and says so", async ({ page }) => {
    const db = await openAsApplicant(page, { pending: true, saved: { area_ids: [CEN], radius_km: null, radius_centre_area_id: null, presence: "online" } });
    await bootAt(page, "/dashboard");
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible({ timeout: 10_000 });
    const editor = page.locator('[data-serving-editor="ready"]');
    await expect(editor).toBeVisible();
    await expect(editor.locator("[data-serving-summary]")).toHaveText("Serving: all of Centurion");
    const save = editor.locator("[data-serving-save]");
    await expect(save).toBeDisabled(); // nothing changed yet

    await expander(page, GP).click();
    await tick(page, PTA).click();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Saved. Your areas are updated.")).toBeVisible();
    expect(db.calls.filter((c) => c.method === "PUT")[0]!.body).toEqual({ area_ids: [CEN, PTA], radius_km: null, radius_centre_area_id: null, presence: "online" });
    await expect(save).toBeDisabled();
  });
});
