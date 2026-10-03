import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, FAKE_PROJECT_CORS, mockAppShell, signInToFakeProject } from "./support/fake-project";

declare global {
  interface Window {
    __cc: { go: (page: string, params?: Record<string, unknown>) => void };
  }
}

// ════════════════════════════════════════════════════════════════════
//  C1 / C1b (found live by the founder, 2026-10-03): a Contributor cancelled
//  one of their events and
//    C1b  its pin stayed on the map until a reload, and
//    C1   after the reload it was gone from the map AND from their dashboard,
//         so it could never be restored.
//  Cause: one list fed both surfaces, and the public feed (/api/v1) returns
//  published rows only. Now the Dashboard also reads the owner's own rows of
//  every status straight from Supabase, and the map reads published rows only.
//
//  Hermetic like the other signed-in specs: a REAL-mode session against a fake
//  Supabase project (e2e/support/fake-project.ts) that keeps a small stateful
//  "database" for events and places, so Cancel / Restore really change what a
//  reload then reads back.
// ════════════════════════════════════════════════════════════════════

const OWNER = { id: "55555555-5555-4555-8555-555555555555", email: "owner@owner.example", fullName: "Test Owner Collective" };
const STRANGER_ID = "66666666-6666-4666-8666-666666666666";
const PRETORIA = { lat: -25.7479, lng: 28.2293 };
const IN_3_DAYS = new Date(Date.now() + 3 * 86_400_000).toISOString();

type Row = Record<string, unknown> & { id: string; status: string };

const eventRow = (id: string, title: string, status: string, extra: Record<string, unknown> = {}): Row => ({
  id,
  title,
  description: "A test event.",
  date: IN_3_DAYS,
  end_time: new Date(Date.now() + 3 * 86_400_000 + 7_200_000).toISOString(),
  location: "Hatfield, Pretoria",
  category: "church-services",
  image_url: null,
  latitude: PRETORIA.lat,
  longitude: PRETORIA.lng,
  created_by: OWNER.id,
  created_at: new Date().toISOString(),
  status,
  visibility: "public",
  ...extra,
});

const placeRow = (id: string, name: string, status: string): Row => ({
  id,
  name,
  description: "A test place.",
  address: "212 Justice Mahomed Street, Brooklyn, Pretoria",
  category_id: null,
  custom_category: "churches-ministries",
  image_url: null,
  latitude: PRETORIA.lat + 0.02,
  longitude: PRETORIA.lng + 0.02,
  created_by: OWNER.id,
  created_at: new Date().toISOString(),
  status,
  categories: null,
});

const LIVE_EVENT = "e0000000-0000-4000-8000-000000000001";
const CANCELLED_EVENT = "e0000000-0000-4000-8000-000000000002";
const PRIVATE_EVENT = "e0000000-0000-4000-8000-000000000003";
const STRANGER_EVENT = "e0000000-0000-4000-8000-000000000004";
const LIVE_PLACE = "a0000000-0000-4000-8000-000000000001";

/**
 * Wires the app to a fake project with a tiny stateful database. The public
 * feed (`/api/v1/*`) answers like the real route: published, public rows only,
 * from everyone. The owner read (Supabase REST, `created_by=eq.<me>`) answers
 * like RLS: my rows of every status. PATCH changes a row's status.
 */
async function openAsOwner(page: Page, db: { events: Row[]; places: Row[] }) {
  const requests: string[] = [];
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, {
    user: OWNER,
    profile: { role: "contributor", contributor_status: "approved" },
  });
  // A contributor with nothing to claim stays put (a 200 would reload to /dashboard).
  await page.route("**/api/contributor/claim", (route: Route) =>
    route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }),
  );

  const published = (rows: Row[]) => rows.filter((r) => r.status === "published" && (r.visibility ?? "public") === "public");
  await page.route("**/api/v1/events**", (route: Route) => route.fulfill({ json: { data: published(db.events) } }));
  await page.route("**/api/v1/places**", (route: Route) => route.fulfill({ json: { data: published(db.places) } }));

  const rest = (table: "events" | "places") => async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const rows = table === "events" ? db.events : db.places;
    const url = new URL(request.url());
    if (request.method() === "GET") {
      requests.push(`GET ${table} ${url.searchParams.get("created_by") ?? ""}`);
      const owner = url.searchParams.get("created_by");
      const mine = owner?.startsWith("eq.") ? rows.filter((r) => r.created_by === owner.slice(3)) : [];
      return route.fulfill({ json: mine, headers: FAKE_PROJECT_CORS });
    }
    if (request.method() === "PATCH") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const body = request.postDataJSON() as { status?: string };
      const row = rows.find((r) => r.id === id);
      if (row && body.status) row.status = body.status;
      requests.push(`PATCH ${table} ${id} ${body.status}`);
      return route.fulfill({ status: 204, headers: FAKE_PROJECT_CORS });
    }
    return route.fallback();
  };
  await page.route(`${FAKE_PROJECT}/rest/v1/events**`, rest("events"));
  await page.route(`${FAKE_PROJECT}/rest/v1/places**`, rest("places"));
  return requests;
}

const pins = (page: Page, kind: "event" | "place") => page.locator(`[data-cc-pin="${kind}"]`);
const card = (page: Page, id: string) => page.locator(`[data-manage-card="${id}"]`);

async function openDashboard(page: Page, tab = "events") {
  await page.goto("/");
  await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.__cc.go("dashboard"));
  await expect(page.locator('[data-screen="dashboard"]')).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).click();
}

test.describe("Dashboard keeps every status; the map shows published only", () => {
  // The app's CSP connect-src allows only the REAL Supabase project host;
  // bypass it so the fake project stays fully separate from production.
  test.use({ bypassCSP: true });

  test("a cancelled event is listed on the Dashboard after load, but is not on the map", async ({ page }) => {
    const db = { events: [eventRow(LIVE_EVENT, "Kayaking!", "published"), eventRow(CANCELLED_EVENT, "Cancelled test event", "cancelled")], places: [] };
    const requests = await openAsOwner(page, db);
    await openDashboard(page);

    // C1: the public feed never returns the cancelled row; the owner read does.
    await expect(card(page, CANCELLED_EVENT)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, CANCELLED_EVENT).getByText("CANCELLED", { exact: true })).toBeVisible();
    await expect(card(page, CANCELLED_EVENT).getByRole("button", { name: "Restore" })).toBeVisible();
    await expect(card(page, LIVE_EVENT).getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(requests).toContain(`GET events eq.${OWNER.id}`);

    // The stat card counts what is live, not the cancelled one.
    await expect(page.locator("p", { hasText: /^Events$/ }).locator("xpath=preceding-sibling::p[1]")).toHaveText("1");

    // And only the published event is on the map.
    await page.evaluate(() => window.__cc.go("home"));
    await expect(pins(page, "event")).toHaveCount(1, { timeout: 15_000 });
  });

  test("Cancel takes the pin off the map at once, a reload keeps it on the Dashboard, Restore puts it back", async ({ page }) => {
    const db = { events: [eventRow(LIVE_EVENT, "Kayaking!", "published")], places: [] };
    const requests = await openAsOwner(page, db);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(pins(page, "event")).toHaveCount(1, { timeout: 15_000 });

    // C1b: cancel from the Dashboard, then look at the map WITHOUT reloading.
    await page.evaluate(() => window.__cc.go("dashboard"));
    await page.getByRole("button", { name: /^events$/i }).click();
    await card(page, LIVE_EVENT).getByRole("button", { name: "Cancel" }).click();
    await expect(card(page, LIVE_EVENT)).toHaveAttribute("data-status", "cancelled");
    expect(requests).toContain(`PATCH events ${LIVE_EVENT} cancelled`);
    await page.evaluate(() => window.__cc.go("home"));
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await expect(pins(page, "event")).toHaveCount(0);

    // C1: reload. The public feed no longer has it; the Dashboard still does.
    await page.reload();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(pins(page, "event")).toHaveCount(0);
    await page.evaluate(() => window.__cc.go("dashboard"));
    await page.getByRole("button", { name: /^events$/i }).click();
    await expect(card(page, LIVE_EVENT)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, LIVE_EVENT).getByText("CANCELLED", { exact: true })).toBeVisible();

    // Restore: the pin comes straight back, no reload.
    await card(page, LIVE_EVENT).getByRole("button", { name: "Restore" }).click();
    await expect(card(page, LIVE_EVENT)).toHaveAttribute("data-status", "published");
    expect(requests).toContain(`PATCH events ${LIVE_EVENT} published`);
    await page.evaluate(() => window.__cc.go("home"));
    await expect(pins(page, "event")).toHaveCount(1, { timeout: 15_000 });
  });

  test("the same holds for places", async ({ page }) => {
    const db = { events: [], places: [placeRow(LIVE_PLACE, "Brooklyn Anchor Campus", "published")] };
    const requests = await openAsOwner(page, db);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(pins(page, "place")).toHaveCount(1, { timeout: 15_000 });

    await page.evaluate(() => window.__cc.go("dashboard"));
    await page.getByRole("button", { name: /^events$/i }).click();
    await card(page, LIVE_PLACE).getByRole("button", { name: "Cancel" }).click();
    await expect(card(page, LIVE_PLACE)).toHaveAttribute("data-status", "cancelled");
    expect(requests).toContain(`PATCH places ${LIVE_PLACE} cancelled`);
    await page.evaluate(() => window.__cc.go("home"));
    await expect(pins(page, "place")).toHaveCount(0);

    await page.reload();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(pins(page, "place")).toHaveCount(0);
    await page.evaluate(() => window.__cc.go("dashboard"));
    await page.getByRole("button", { name: /^events$/i }).click();
    await expect(card(page, LIVE_PLACE).getByText("CANCELLED", { exact: true })).toBeVisible({ timeout: 15_000 });

    await card(page, LIVE_PLACE).getByRole("button", { name: "Restore" }).click();
    await page.evaluate(() => window.__cc.go("home"));
    await expect(pins(page, "place")).toHaveCount(1, { timeout: 15_000 });
  });

  test("a cancelled event stays off Kingdom Discovery, and opens for its owner with a banner", async ({ page }) => {
    const db = { events: [eventRow(LIVE_EVENT, "Kayaking!", "published"), eventRow(CANCELLED_EVENT, "Cancelled test event", "cancelled")], places: [] };
    await openAsOwner(page, db);
    await openDashboard(page);
    await expect(card(page, CANCELLED_EVENT)).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.__cc.go("kingdom-discovery"));
    const list = page.locator('[data-screen="kingdom-discovery"]');
    await expect(list).toBeVisible();
    await expect(list.getByText("Kayaking!").first()).toBeVisible();
    await expect(list.getByText("Cancelled test event")).toHaveCount(0);

    // Its own page opens from the Dashboard's View, and says it is cancelled.
    await page.evaluate(([id]) => window.__cc.go("event", { id }), [CANCELLED_EVENT]);
    const event = page.locator('[data-screen="event"]');
    await expect(event.getByText("This event has been cancelled.")).toBeVisible();
    await expect(event.getByRole("button", { name: "Connect" })).toHaveCount(0);
  });

  test("private events and other people's rows never reach the public lists", async ({ page }) => {
    const db = {
      events: [
        eventRow(LIVE_EVENT, "Kayaking!", "published"),
        eventRow(PRIVATE_EVENT, "Leaders only", "published", { visibility: "private" }),
        eventRow(STRANGER_EVENT, "Someone else's event", "published", { created_by: STRANGER_ID }),
      ],
      places: [],
    };
    const requests = await openAsOwner(page, db);
    await openDashboard(page);

    // The owner read asked for MY rows only, and got my private event with them.
    await expect(card(page, PRIVATE_EVENT)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, STRANGER_EVENT)).toHaveCount(0);
    expect(requests.filter((r) => r.startsWith("GET events"))).toEqual([`GET events eq.${OWNER.id}`]);

    // The private one is not a pin; the public feed carries Kayaking and the stranger's.
    await page.evaluate(() => window.__cc.go("home"));
    await expect(pins(page, "event")).toHaveCount(2, { timeout: 15_000 });
    await page.evaluate(() => window.__cc.go("kingdom-discovery"));
    await expect(page.locator('[data-screen="kingdom-discovery"]').getByText("Leaders only")).toHaveCount(0);
  });
});
