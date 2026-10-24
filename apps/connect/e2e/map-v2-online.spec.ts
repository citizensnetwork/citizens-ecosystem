import { test, expect, type Page, type Route } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";
import { touchSession, tapTouch, swipe, type Pt } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Issue #259, PR C: "Online in this area", the globe, with REAL touch.
//
//  The globe is ONE button among the map's own controls that exists only when Contributors with no fixed place serve the area
//  in view. Every tap here goes through CDP Input.dispatchTouchEvent in a context with hasTouch + isMobile, so Chrome decides
//  what is a tap and what is a scroll exactly as on a phone. The public API (the area index and the list) is answered locally:
//  what is under test is what the BROWSER does with it. The database side is proved by the probe, not here.
// ════════════════════════════════════════════════════════════════════

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GP = U(1), KZN = U(2), PTA = U(3), CEN = U(4);
const area = (id: string, name: string, level: string, parent: string | null, c: [number, number], b: [number, number, number, number]) => ({
  id, name, level, parent_id: parent, slug: name.toLowerCase(), sort: 0, centroid_lat: c[0], centroid_lng: c[1], bbox_south: b[0], bbox_west: b[1], bbox_north: b[2], bbox_east: b[3],
});
const AREAS = [
  area(GP, "Gauteng", "province", null, [-26.2, 28.1], [-26.9, 27.2, -25.1, 29.0]),
  area(KZN, "KwaZulu-Natal", "province", null, [-29.0, 30.9], [-31.1, 28.8, -26.8, 32.9]),
  area(PTA, "Pretoria", "place", GP, [-25.7479, 28.2293], [-25.9, 28.05, -25.62, 28.4]),
  area(CEN, "Centurion", "place", GP, [-25.8603, 28.1894], [-25.93, 28.08, -25.8, 28.26]),
];
const PRETORIA = { lng: 28.2293, lat: -25.7479 };

const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: { id: string; full_name: string; contributor_slug: string }[] };

type Listing = { id: string; name: string; presence: "online" | "no_fixed_place" | null; served?: { id: string; name: string; level: string } };
const listing = (l: Listing) => ({ id: l.id, name: l.name, slug: null, kind: null, category: "worship", avatar_url: null, logo_url: null, presence: l.presence, served: l.served ?? { id: PTA, name: "Pretoria", level: "place" } });

type Serving = { main: ReturnType<typeof listing>[]; also_served_by: Record<string, unknown>[] };
type Api = { servingFor: Record<string, Serving>; requests: string[] };

/** The public area index and the list, answered locally; every request is recorded. */
function installOnlineApi(servingFor: Record<string, Serving>) {
  const api: Api = { servingFor, requests: [] };
  const extra = async (page: Page) => {
    await page.route("**/api/v1/service-areas**", (route: Route) => {
      const u = new URL(route.request().url());
      api.requests.push(u.pathname + u.search);
      const parent = u.searchParams.get("parent");
      return route.fulfill({ json: { data: parent ? [] : AREAS, meta: { count: AREAS.length, limit: 500, offset: 0 } } });
    });
    await page.route("**/api/v1/serving**", (route: Route) => {
      const u = new URL(route.request().url());
      api.requests.push(u.pathname + u.search);
      const id = u.searchParams.get("area") ?? "";
      const a = AREAS.find((x) => x.id === id);
      const s = api.servingFor[id] ?? { main: [], also_served_by: [] };
      if (!a) return route.fulfill({ status: 404, json: { error: "not_found" } });
      return route.fulfill({ json: { data: { area: { id, name: a.name, slug: a.slug, level: a.level }, ...s } } });
    });
  };
  return { api, extra };
}
const servingRequests = (api: Api) => api.requests.filter((r) => r.startsWith("/api/v1/serving"));

type MapHook = { jumpTo: (o: object, d: object) => void; getCenter: () => { lng: number; lat: number } };
const jump = (page: Page, lng: number, lat: number, zoom: number) =>
  page.evaluate(([lo, la, z]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: z }, { originalEvent: {} }), [lng, lat, zoom]);
const center = (page: Page) => page.evaluate(() => (window as unknown as { __ccMap: MapHook }).__ccMap.getCenter());

const GLOBE = "[data-mv2='globe']";
const SHEET = "[data-mv2='online-sheet']";
const globe = (page: Page) => page.locator(GLOBE);
const sheet = (page: Page) => page.locator(SHEET);

async function at(page: Page, selector: string): Promise<Pt> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error("no box for " + selector);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const TWO: Serving = {
  main: [listing({ id: U(10), name: "Daily Word Online", presence: "online" }), listing({ id: U(11), name: "Mobile Food Outreach", presence: "no_fixed_place" })],
  also_served_by: [{ id: U(20), name: "Midrand Care Vans", slug: null, kind: null, category: null, avatar_url: null, logo_url: null, presence: "no_fixed_place", centre_name: "Midrand", radius_km: 50, distance_km: 22.4 }],
};

async function openAtPretoria(page: Page, servingFor: Record<string, Serving>, path = "/?map=v2") {
  const { api, extra } = installOnlineApi(servingFor);
  await mockMapNetwork(page, seed0(), extra);
  await openMap(page, path, 1);
  await jump(page, PRETORIA.lng, PRETORIA.lat, 11);
  return api;
}

test.describe("the globe on a phone (real touch)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("when nobody serves the area in view NOTHING is drawn (no button, no gap), after a single quiet look", async ({ page }) => {
    const api = await openAtPretoria(page, { [PTA]: { main: [], also_served_by: [] } });
    await expect.poll(() => servingRequests(api).length).toBe(1);
    await page.waitForTimeout(700);
    await expect(globe(page)).toHaveCount(0);
    await expect(page.locator("[data-mv2='globe-host']")).toHaveCount(0);
  });

  test("a globe appears with a count, among the map's controls, at least 44 px, one labelled button", async ({ page }) => {
    await openAtPretoria(page, { [PTA]: TWO });
    await expect(globe(page)).toHaveCount(1);
    await expect(globe(page)).toHaveAttribute("aria-label", "Online in this area: 3 listings");
    await expect(globe(page).locator("[data-mv2='globe-count']")).toHaveText("3");
    const b = (await globe(page).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(43.5);
    expect(b.height).toBeGreaterThanOrEqual(43.5);
    // it sits in the bottom-right control stack, in the same column as the zoom buttons, above them
    const zoomIn = (await page.locator(".maplibregl-ctrl-zoom-in").boundingBox())!;
    expect(Math.abs(b.x - zoomIn.x)).toBeLessThanOrEqual(2);
    expect(b.y).toBeLessThan(zoomIn.y);
  });

  test("a real tap on the globe opens the list; a real tap on Close ends it; Back ends it too and stays in the app", async ({ page }) => {
    await openAtPretoria(page, { [PTA]: TWO });
    await expect(globe(page)).toHaveCount(1);
    const cdp = await touchSession(page);
    await tapTouch(cdp, await at(page, GLOBE));
    await expect(sheet(page)).toBeVisible();
    await expect(globe(page)).toHaveAttribute("aria-expanded", "true");
    await expect(sheet(page).getByRole("heading", { level: 2 })).toHaveText("Online in this area");
    await expect(sheet(page)).toContainText("Online or no fixed place · Pretoria");
    await expect(sheet(page)).not.toContainText(/on the map/i);

    await tapTouch(cdp, await at(page, "[data-online='close']"));
    await expect(sheet(page)).toHaveCount(0);

    // Back: open again by a tap (the Back entry is pushed inside the tap), then go back
    const url = page.url();
    await tapTouch(cdp, await at(page, GLOBE));
    await expect(sheet(page)).toBeVisible();
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('[data-screen="discover"]')).toBeVisible(); // still in Connect, on the map
    expect(page.url()).toBe(url);
  });

  test("the list shows each row's tag: a mobile ministry is never labelled Online; 'Also reaching this area' sits under it", async ({ page }) => {
    await openAtPretoria(page, { [PTA]: TWO });
    const cdp = await touchSession(page);
    await expect(globe(page)).toHaveCount(1);
    await tapTouch(cdp, await at(page, GLOBE));
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator(`[data-online-row="${U(11)}"]`)).toContainText("No fixed place · Pretoria");
    await expect(page.locator(`[data-online-row="${U(11)}"]`)).not.toContainText("Online");
    await expect(page.locator(`[data-online-row="${U(10)}"]`)).toContainText("Online · Pretoria");
    const also = page.locator("[data-online='also']");
    await expect(also.locator("h3")).toHaveText("Also reaching this area");
    await expect(also).toContainText("Within 50 km of Midrand");
    await expect(also).toContainText("22.4 km away");
    const mainBottom = (await page.locator("[data-online-group='place']").boundingBox())!;
    const alsoTop = (await also.boundingBox())!;
    expect(alsoTop.y).toBeGreaterThan(mainBottom.y);
  });

  test("a real tap on a row opens that Contributor's profile and closes the list", async ({ page }) => {
    const first = seed0().contributors[0]!;
    await openAtPretoria(page, { [PTA]: { main: [listing({ id: first.id, name: first.full_name, presence: "online" })], also_served_by: [] } });
    const cdp = await touchSession(page);
    await expect(globe(page)).toHaveCount(1);
    await tapTouch(cdp, await at(page, GLOBE));
    await expect(sheet(page)).toBeVisible();
    await tapTouch(cdp, await at(page, `[data-online-row="${first.id}"] button`));
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('[data-screen="profile"]')).toBeVisible({ timeout: 10_000 });
  });

  test("scrolling a long list with a thumb moves the list, never the map under it", async ({ page }) => {
    const many = Array.from({ length: 16 }, (_, i) => listing({ id: U(100 + i), name: "Listing " + String.fromCharCode(65 + i), presence: i % 3 ? "online" : "no_fixed_place" }));
    await openAtPretoria(page, { [PTA]: { main: many, also_served_by: [] } });
    const cdp = await touchSession(page);
    await expect(globe(page)).toHaveCount(1);
    await tapTouch(cdp, await at(page, GLOBE));
    await expect(sheet(page)).toBeVisible();
    const before = await center(page);
    const from = await at(page, "[data-mv2='online-scroller']");
    await swipe(cdp, from, -220, { ms: 300, steps: 14 });
    await page.waitForTimeout(250);
    const scrollTop = await page.locator("[data-mv2='online-scroller']").evaluate((e) => e.scrollTop);
    expect(scrollTop).toBeGreaterThan(40);
    const after = await center(page);
    expect(Math.abs(after.lng - before.lng)).toBeLessThan(1e-9);
    expect(Math.abs(after.lat - before.lat)).toBeLessThan(1e-9);
  });

  test("panning around inside one area asks for nothing more; a new area asks once; leaving every area removes the globe", async ({ page }) => {
    const api = await openAtPretoria(page, { [PTA]: TWO, [CEN]: { main: [listing({ id: U(30), name: "Centurion Cell", presence: "online", served: { id: CEN, name: "Centurion", level: "place" } })], also_served_by: [] } });
    await expect(globe(page)).toHaveCount(1);
    expect(servingRequests(api)).toEqual(["/api/v1/serving?area=" + PTA]);
    for (const [dx, dy] of [[0.01, 0.01], [-0.02, 0.0], [0.0, -0.02], [0.03, 0.02], [-0.01, -0.01]]) {
      await jump(page, PRETORIA.lng + dx, PRETORIA.lat + dy, 11);
      await page.waitForTimeout(500);
    }
    expect(servingRequests(api)).toHaveLength(1); // five pans, still the same area: nothing more asked

    await jump(page, 28.1894, -25.8603, 11); // Centurion
    await expect(globe(page)).toHaveAttribute("aria-label", "Online in this area: 1 listing");
    expect(servingRequests(api)).toEqual(["/api/v1/serving?area=" + PTA, "/api/v1/serving?area=" + CEN]);

    await jump(page, 30.9, -29.0, 8); // KwaZulu-Natal: nobody there
    await expect.poll(() => servingRequests(api).length).toBe(3);
    await expect(globe(page)).toHaveCount(0);
    await jump(page, 28.2293, -25.7479, 3); // zoomed right out: no area in view, no request at all
    await page.waitForTimeout(700);
    expect(servingRequests(api)).toHaveLength(3);
    await expect(globe(page)).toHaveCount(0);
  });

  test("no coordinate is ever sent: the list is asked for by area id only", async ({ page }) => {
    const api = await openAtPretoria(page, { [PTA]: TWO });
    await expect(globe(page)).toHaveCount(1);
    for (const r of api.requests) expect(r).not.toMatch(/lat|lng|-25\.|28\.2/);
    expect(api.requests.filter((r) => r.startsWith("/api/v1/service-areas"))).toEqual(["/api/v1/service-areas"]); // one cacheable index read
  });

  test("a failed list shows an error with a retry that asks again", async ({ page }) => {
    const { api, extra } = installOnlineApi({ [PTA]: TWO });
    let fail = true;
    await mockMapNetwork(page, seed0(), async (p) => {
      await extra(p);
      await p.route("**/api/v1/serving**", (route: Route) => {
        api.requests.push("/api/v1/serving?retry-probe");
        if (fail) return route.fulfill({ status: 500, json: { error: "x" } });
        return route.fulfill({ json: { data: { area: { id: PTA, name: "Pretoria", slug: "pretoria", level: "place" }, ...TWO } } });
      });
    });
    await openMap(page, "/?map=v2", 1);
    await jump(page, PRETORIA.lng, PRETORIA.lat, 11);
    await page.waitForTimeout(800);
    // nothing to show means no globe: an error never draws a button of its own
    await expect(globe(page)).toHaveCount(0);
    fail = false;
    await jump(page, PRETORIA.lng + 0.001, PRETORIA.lat, 11); // the next settle asks again
    await expect(globe(page)).toHaveCount(1);
  });
});

test.describe("looks and settings", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("reduced motion: the first appearance is a jump, not a fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openAtPretoria(page, { [PTA]: TWO });
    await expect(globe(page)).toHaveCount(1);
    expect(await globe(page).evaluate((e) => getComputedStyle(e).animationDuration)).toMatch(/^0(\.0+)?m?s$/);
  });
  test("by default it fades in over one short moment, and nothing loops", async ({ page }) => {
    await openAtPretoria(page, { [PTA]: TWO });
    await expect(globe(page)).toHaveCount(1);
    const css = await globe(page).evaluate((e) => ({ d: getComputedStyle(e).animationDuration, n: getComputedStyle(e).animationIterationCount }));
    expect(css.d).toBe("0.2s");
    expect(css.n).toBe("1");
  });
  test("dark look: the button and the list are drawn from the same tokens", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openAtPretoria(page, { [PTA]: TWO });
    const cdp = await touchSession(page);
    await expect(globe(page)).toHaveCount(1);
    await tapTouch(cdp, await at(page, GLOBE));
    await expect(sheet(page)).toBeVisible();
    const bg = await sheet(page).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toBe("rgb(255, 255, 255)"); // the dark sheet, not the light one
  });
});

test.describe("flag off keeps the map exactly as it was", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("on the old map (?map=v1) there is no globe, no stylesheet rule and NO request for areas", async ({ page }) => {
    const { api, extra } = installOnlineApi({ [PTA]: TWO });
    await mockMapNetwork(page, seed0(), extra);
    await page.goto("/?map=v1");
    await page.waitForSelector('[data-screen="discover"]', { timeout: 20_000 });
    await page.waitForFunction(() => !!(window as unknown as { __ccMap?: unknown }).__ccMap, undefined, { timeout: 20_000 });
    await jump(page, PRETORIA.lng, PRETORIA.lat, 11);
    await page.waitForTimeout(900);
    await expect(globe(page)).toHaveCount(0);
    expect(api.requests).toEqual([]);
  });
});
