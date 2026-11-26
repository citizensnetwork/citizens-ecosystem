import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Explore's city scope and honest empty states (QA 2026-11-25, CCQA-0002/0003; founder: 35 km).
//  Explore "Pretoria" used to list places in another city, and a search that found nothing left a blank page.
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>;
const JOBURG_PLACE = "Far Place in Johannesburg";
const ONLINE_ONE = "Online Fellowship Fixture";

function seedWithFarAndOnline(): MapSeed {
  const seed = smallSeed(FIXED_NOW) as MapSeed & { places: Row[]; contributors: Row[] };
  const far = { ...(seed.places[0] as Row), id: "e2e00000-0000-4000-8000-00000000f001", name: JOBURG_PLACE, latitude: -26.2041, longitude: 28.0473, address: "1 Main Road, Johannesburg" };
  seed.places.push(far);
  const online = { ...(seed.contributors[0] as Row), id: "e2e00000-0000-4000-8000-00000000f002", contributor_slug: "online-fellowship-fixture", full_name: ONLINE_ONE, physical_latitude: null, physical_longitude: null, physical_address: null, no_fixed_location: true };
  seed.contributors.push(online);
  return seed;
}

async function openExplore(page: Page) {
  await mockMapNetwork(page, seedWithFarAndOnline());
  await openMap(page, "/", 1); // the map looks at the fixture town, Pretoria
  await page.evaluate(() => (window as unknown as { __cc: { go: (p: string) => void } }).__cc.go("explore"));
  await expect(page.locator("[data-screen='explore']")).toBeVisible();
}
const search = (page: Page) => page.getByLabel("Search Explore");
const resultTitles = (page: Page) => page.locator("[data-screen='explore'] [data-mv2='xs-results'] [data-mv2='xs-title']");

test("Explore keeps to the city within 35 km, says so, and can widen to all of South Africa", async ({ page }) => {
  await openExplore(page);
  const scope = page.locator("[data-cc='explore-scope']");
  await expect(scope).toContainText(/Showing Pretoria: \d+ listings? within 35 km\./);
  await search(page).fill("Far Place");
  await expect(resultTitles(page).filter({ hasText: JOBURG_PLACE })).toHaveCount(0);

  await scope.getByRole("button", { name: "Widen to all South Africa" }).click();
  await expect(scope).toContainText("Showing all of South Africa.");
  await expect(resultTitles(page).filter({ hasText: JOBURG_PLACE })).toHaveCount(1);

  await scope.getByRole("button", { name: "Back to Pretoria" }).click();
  await expect(resultTitles(page).filter({ hasText: JOBURG_PLACE })).toHaveCount(0);
});

test("a listing with no pin is never hidden by the city: it has its own group", async ({ page }) => {
  await openExplore(page);
  const online = page.locator("[data-cc='explore-online']");
  await expect(online).toContainText("Online and serving across South Africa");
  await expect(online.locator("[data-mv2='xs-title']").filter({ hasText: ONLINE_ONE })).toHaveCount(1);
});

test("a search that finds nothing says so and offers a way out", async ({ page }) => {
  await openExplore(page);
  await search(page).fill("zzqx nothing");
  const empty = page.locator("[data-cc='explore-empty']");
  await expect(empty).toHaveAttribute("role", "status");
  await expect(empty).toContainText("Nothing for “zzqx nothing” in Pretoria yet.");
  await expect(empty.getByRole("button", { name: "Widen to all South Africa" })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Add a listing" })).toBeVisible();
  await empty.getByRole("button", { name: "Clear the search" }).click();
  await expect(empty).toHaveCount(0);
  await expect(search(page)).toHaveValue("");
});
