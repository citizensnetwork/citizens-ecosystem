import { test, expect, type Page, type Route } from "@playwright/test";
import { mockMapNetwork, openMap, openPinSheet, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Event location truth (QA 2026-11-25, CCQA-0009; src/frontend/app/location-lib.jsx).
//  A published event named a Pretoria venue but its pin was the geocoder's first hit near Durban, and its Directions
//  sent people 522 km away. Two promises are checked in the running app:
//    1. Directions never send anyone to a pin that is far from the city the listing's own address names.
//    2. The event form never saves a far geocoder hit unasked: it shows the guess and waits for the owner's yes.
//  Hermetic: the geocoder is answered locally; the coordinates are public geography, the names neutral.
// ════════════════════════════════════════════════════════════════════

const FAR = { lng: 31.0679, lat: -29.7128 }; // near Durban
const ADDRESS = "Woodlands Mall, Olympus, Pretoria";

type Hooks = { setRole: (r: string) => void; openCreate: (kind: string) => void };
type MapHook = { jumpTo: (o: object, d: object) => void };

/** Answer every forward geocode with one confident hit near Durban, whatever was typed. */
async function farGeocoder(page: Page) {
  const asked: string[] = [];
  await page.route("**/api.maptiler.com/geocoding/**", (route: Route) => {
    asked.push(route.request().url());
    return route.fulfill({
      json: { type: "FeatureCollection", features: [{ center: [FAR.lng, FAR.lat], relevance: 1, place_name: "Woodlands, Durban" }] },
    });
  });
  return asked;
}

test.describe("event location truth", () => {
  test("Directions send the address text, not a pin 500 km from the city the address names", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as MapSeed;
    const ev = seed.events[0] as Record<string, unknown> & { id: string };
    Object.assign(ev, { location: ADDRESS, longitude: FAR.lng, latitude: FAR.lat });
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 1);
    await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [FAR.lng, FAR.lat]);
    await openPinSheet(page, ev.id);

    const dir = page.locator("[data-mv2='sheet']").getByRole("link", { name: "Directions" });
    await expect(dir).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(ADDRESS));
  });

  test("the event form shows a far guess and will not publish until the owner says it is the right spot", async ({ page }) => {
    await mockMapNetwork(page);
    const asked = await farGeocoder(page);
    await openMap(page, "/?map=v2", 1);
    await page.evaluate(() => {
      const cc = (window as unknown as { __cc: Hooks }).__cc;
      cc.setRole("contributor");
      cc.openCreate("event");
    });

    await page.getByPlaceholder("e.g. Sunday Glory Service").fill("Evening of worship");
    // The map's own filter list has a button of the same name: take the one in the form's category grid.
    await page.locator("button.border-2", { hasText: "Worship & Prayer" }).click();
    const next = page.getByRole("button", { name: "Continue" });
    await next.click();
    await page.getByPlaceholder("Where is it held?").fill("Woodlands Mall");
    await page.getByPlaceholder("Street, suburb, city").fill("Olympus, Pretoria");

    const box = page.locator("[data-cc='pin-confirm']");
    await expect(box).toBeVisible({ timeout: 5000 });
    await expect(box).toContainText("Is this the right spot?");
    await expect(box).toContainText(/The pin is 5\d\d km from Pretoria, which the address names\./);
    expect(asked.some((u) => new URL(u).searchParams.get("limit") === "5")).toBe(true);
    // The wizard cannot leave the "When & where" step, and so cannot reach Publish, while the pin is in doubt.
    await expect(next).toBeDisabled();

    await box.getByRole("button", { name: "This is the right spot" }).click();
    await expect(box).toHaveCount(0);
    await expect(next).toBeEnabled();
    await next.click();
    await next.click();
    await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  test("editing an event whose saved pin is far starts with the question, and new words that find nothing drop the guess", async ({ page }) => {
    await mockMapNetwork(page);
    await page.route("**/api.maptiler.com/geocoding/**", (route: Route) => route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
    await openMap(page, "/?map=v2", 1);
    await page.evaluate(([lng, lat, loc]) => {
      const cc = (window as unknown as { __cc: Hooks & { openCreate: (k: string, e?: object) => void } }).__cc;
      cc.setRole("contributor");
      cc.openCreate("event", { id: "e2e-far-event", title: "Evening of worship", category: "worship-prayer", location: loc, lat, lng });
    }, [FAR.lng, FAR.lat, ADDRESS] as const);

    await page.getByRole("button", { name: "Continue" }).click();
    const box = page.locator("[data-cc='pin-confirm']");
    await expect(box).toBeVisible();
    await expect(box).toContainText(/The pin is 5\d\d km from Pretoria, which the address names\./);

    // The owner corrects the words; the geocoder finds nothing for them, so the doubtful old pin is not kept.
    await page.getByPlaceholder("Where is it held?").fill("Community hall, Olympus, Pretoria");
    await expect(box).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText("Drag the map to drop your pin")).toBeVisible();
  });
});
