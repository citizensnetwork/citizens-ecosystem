import { test, expect, type Page, type Route } from "@playwright/test";
import { mockAppShell } from "./support/fake-project";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed, openListing } from "./support/map-v2";

// Issue #160: a person can report an event, a profile and a Moment, and a guest
// is sent to sign in. The API is answered here. Nothing reaches a real project.

const EVENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PLACE_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const ORG_ID = "11111111-1111-4111-8111-000000000001";
const MOMENT_ID = "3f1c0a2e-7b6d-4e18-9a5c-2d8e6f0b1c44";
const SLUG = "anchor-community-church";
const PRETORIA = { lat: -25.7479, lng: 28.2293 };
const THANKS = "Thanks. An admin will look at it.";

const EVENT = {
  id: EVENT_ID,
  title: "Hatfield Sunday Celebration",
  description: "A weekly gathering open to everyone in the city.",
  date: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  end_time: new Date(Date.now() + 3 * 86_400_000 + 7_200_000).toISOString(),
  location: "1186 Burnett Street, Hatfield, Pretoria",
  category: "church-services",
  image_url: null,
  latitude: PRETORIA.lat,
  longitude: PRETORIA.lng,
  created_by: ORG_ID,
  created_at: new Date().toISOString(),
  volunteer_openings: false,
};
const PLACE = {
  id: PLACE_ID,
  name: "Brooklyn Anchor Campus",
  description: "Open through the week for prayer, coffee and community.",
  address: "212 Justice Mahomed Street, Brooklyn, Pretoria",
  category: "churches-ministries",
  custom_category: null,
  image_url: null,
  open_hours: "Mon-Fri 08:00-17:00",
  latitude: PRETORIA.lat + 0.02,
  longitude: PRETORIA.lng + 0.02,
  created_by: ORG_ID,
  verified: true,
  status: "published",
  volunteer_openings: false,
};
const CONTRIBUTOR = {
  id: ORG_ID,
  full_name: "Anchor Community Church",
  role: "contributor",
  contributor_kind: "ministry",
  category: "churches-ministries",
  contributor_slug: SLUG,
  bio: "A church family serving Pretoria.",
  logo_url: null,
  avatar_url: null,
  physical_address: "212 Justice Mahomed Street, Brooklyn, Pretoria",
  physical_latitude: PRETORIA.lat + 0.03,
  physical_longitude: PRETORIA.lng - 0.03,
  no_fixed_location: false,
  gallery_urls: [],
  cover_photo_urls: [],
};

async function mockListings(page: Page) {
  await page.route("**/api/v1/events**", (route: Route) => route.fulfill({ json: { data: [EVENT], meta: {} } }));
  await page.route(`**/api/v1/events/${EVENT_ID}`, (route: Route) => route.fulfill({ json: { data: { ...EVENT, stats: {} }, meta: {} } }));
  await page.route("**/api/v1/places**", (route: Route) => route.fulfill({ json: { data: [PLACE], meta: {} } }));
  await page.route("**/api/v1/contributors**", (route: Route) => route.fulfill({ json: { data: [CONTRIBUTOR], meta: {} } }));
  await page.route(`**/api/v1/contributors/${SLUG}`, (route: Route) =>
    route.fulfill({ json: { data: { profile: CONTRIBUTOR, upcoming_events: [], past_events: [], places: [] } } }),
  );
}

/** Demo mode: no Supabase. `authed` is the stored demo session the app already treats as signed in. */
async function openDemo(page: Page, authed: boolean) {
  await mockAppShell(page, { supabaseUrl: "", anonKey: "" });
  await mockListings(page);
  if (authed) {
    await page.addInitScript(() => {
      localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: "citizen" }));
    });
  }
}

function captureReports(page: Page) {
  const bodies: unknown[] = [];
  const ready = page.route("**/api/reports", async (route) => {
    if (route.request().method() === "POST") bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8" }) });
  });
  return { bodies, ready };
}

async function sendReport(page: Page, reason: string) {
  const dialog = page.locator("[data-mv2='report']");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio").first()).toBeFocused();
  await dialog.getByRole("radio", { name: reason }).check();
  await dialog.getByRole("button", { name: "Send report" }).click();
}

test.describe("Report an event, a profile and a Moment", () => {
  test("an event page files one report and thanks the person", async ({ page }) => {
    await openDemo(page, true);
    const { bodies, ready } = captureReports(page);
    await ready;
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Report", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Report this event" })).toBeVisible();
    await sendReport(page, "Spam");
    await expect(page.getByText(THANKS)).toBeVisible();
    await expect(page.locator("[data-mv2='report']")).toHaveCount(0);
    expect(bodies).toEqual([{ target_type: "event", target_id: EVENT_ID, reason: "spam", body: "" }]);
  });

  test("a profile page files one report about that person", async ({ page }) => {
    await openDemo(page, true);
    const { bodies, ready } = captureReports(page);
    await ready;
    await page.goto(`/c/${SLUG}`);
    await expect(page.locator('[data-screen="profile"]').getByRole("heading", { name: "Anchor Community Church" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Report", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Report this person" })).toBeVisible();
    await sendReport(page, "Harassment");
    await expect(page.getByText(THANKS)).toBeVisible();
    expect(bodies).toEqual([{ target_type: "user", target_id: ORG_ID, reason: "harassment", body: "" }]);
  });

  test("a Moment on the sheet files one report from its menu", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as MapSeed & { contributors: { id: string; physical_longitude: number; physical_latitude: number }[] };
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, {
      moments: [{
        id: MOMENT_ID,
        body: "Prayer walk tonight at the north gate.",
        image_url: null,
        created_at: new Date(FIXED_NOW - 3 * 3_600_000).toISOString(),
        expires_at: new Date(FIXED_NOW + 21 * 3_600_000).toISOString(),
      }],
    });
    const { bodies, ready } = captureReports(page);
    await ready;
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[0];
    await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
    await openListing(page, c.id);
    await expect(page.locator("[data-mv2='sheet']")).toBeVisible();
    await page.getByRole("tab", { name: "Today" }).click();
    await page.locator("[data-moment]").getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Report" }).click();
    await expect(page.getByRole("heading", { name: "Report this moment" })).toBeVisible();
    await sendReport(page, "Something else");
    await expect(page.getByText(THANKS)).toBeVisible();
    expect(bodies).toEqual([{ target_type: "moment", target_id: MOMENT_ID, reason: "other", body: "" }]);
  });

  test("a guest who taps Report is taken to sign in, and no dialog opens", async ({ page }) => {
    await openDemo(page, false);
    let posts = 0;
    await page.route("**/api/reports", async (route) => {
      posts += 1;
      await route.fulfill({ status: 401, json: { error: "Sign in required" } });
    });
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Report", exact: true }).click();
    await expect(page.locator('[data-screen-label="Sign in"]')).toBeVisible();
    await expect(page.locator("[data-mv2='report']")).toHaveCount(0);
    expect(posts).toBe(0);
  });

  test("a duplicate open report closes with the calm line, not the generic error or the server text", async ({ page }) => {
    await openDemo(page, true);
    await page.route("**/api/reports", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "You've already reported this. Our team is reviewing it." }),
      }),
    );
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Report", exact: true }).click();
    await sendReport(page, "Spam");
    await expect(page.getByText("You've already reported this. Thanks, we're looking into it.")).toBeVisible();
    await expect(page.getByText("Could not send. Please try again.")).toHaveCount(0);
    await expect(page.getByText("Our team is reviewing it.")).toHaveCount(0);
    await expect(page.locator("[data-mv2='report']")).toHaveCount(0);
  });

  test("on the old map the dialog is styled, and the Map v2 stylesheet is not loaded", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await openDemo(page, true);
    await page.goto(`/e/${EVENT_ID}?map=v1`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    expect(requested.filter((u) => u.includes("map-v2.css"))).toEqual([]);
    expect(requested.some((u) => u.includes("/assets/report.css"))).toBe(true);
    await page.getByRole("button", { name: "Report", exact: true }).click();
    const dialog = page.locator("[data-mv2='report']");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("heading", { name: "Report this event" })).toBeVisible();
    const box = await dialog.evaluate((el) => {
      const s = getComputedStyle(el);
      const card = el.querySelector("[data-mv2='report-card']");
      const c = card ? getComputedStyle(card) : null;
      const send = el.querySelector("[data-mv2='action'][data-primary]");
      const b = send ? getComputedStyle(send) : null;
      return {
        position: s.position,
        z: s.zIndex,
        display: s.display,
        bg: c ? c.backgroundColor : "",
        radius: c ? c.borderRadius : "",
        color: c ? c.color : "",
        hit: b ? b.minHeight : "",
      };
    });
    expect(box).toEqual({
      position: "fixed",
      z: "300",
      display: "flex",
      bg: "rgb(255, 255, 255)",
      radius: "20px",
      color: "rgb(10, 9, 8)",
      hit: "44px",
    });
  });
});
