import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Dated discovery on Explore (QA 2026-11-25, CCQA-0005): "what is on this weekend?". The clock is frozen at Saturday
//  2026-10-10 10:00 in Pretoria, so this weekend runs Friday 9 Oct 17:00 to Monday 12 Oct 00:00. The small seed's
//  events start within hours; one more event, three weeks out, must be left out by every date chip.
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>;
const LATER = "Gathering Three Weeks Out";

async function openExplore(page: Page) {
  const seed = smallSeed(FIXED_NOW) as MapSeed & { events: Row[] };
  const start = FIXED_NOW + 21 * 86_400_000;
  seed.events.push({ ...seed.events[0], id: "e2e00000-0000-4000-8000-00000000d001", title: LATER, date: new Date(start).toISOString(), end_time: new Date(start + 7_200_000).toISOString() });
  await mockMapNetwork(page, seed);
  await openMap(page, "/", 1);
  await page.evaluate(() => (window as unknown as { __cc: { go: (p: string) => void } }).__cc.go("explore"));
  await expect(page.locator("[data-screen='explore']")).toBeVisible();
}
const mainTitles = (page: Page) => page.locator("[data-screen='explore'] .explore-content > .photo-carousel, [data-screen='explore'] .explore-content > .explore-grid").first().locator(".photo-tile h3");

test("'This weekend in Pretoria' shows what is on, with a date line on each event", async ({ page }) => {
  await openExplore(page);
  const shelf = page.locator("[data-cc='explore-weekend']");
  await expect(shelf.getByRole("heading", { name: "This weekend in Pretoria" })).toBeVisible();
  await expect(shelf.locator(".photo-tile h3").first()).toContainText("Fixture Gathering");
  await expect(shelf.locator(".photo-tile h3").filter({ hasText: LATER })).toHaveCount(0);
  // "Sat 10 Oct · 12:00 · 30 Example Avenue, Pretoria ↗"
  await expect(shelf.locator(".photo-tile .photo-title > span").first()).toContainText(/^(Fri|Sat|Sun) \d{1,2} Oct · \d\d:\d\d · /);
});

test("the date chips keep only events in their window, and say so when there are none", async ({ page }) => {
  await openExplore(page);
  const when = page.locator("[data-cc='explore-when']");
  await when.getByRole("button", { name: "This weekend" }).click();
  await expect(when.getByRole("button", { name: "This weekend" })).toHaveAttribute("aria-pressed", "true");
  await expect(mainTitles(page).first()).toContainText("Fixture Gathering");
  await expect(mainTitles(page).filter({ hasText: LATER })).toHaveCount(0);
  await expect(mainTitles(page).filter({ hasText: "Fixture Place" })).toHaveCount(0); // places are not "on" a date

  await when.getByRole("button", { name: "Any date" }).click();
  await expect(mainTitles(page).filter({ hasText: LATER })).toHaveCount(1);

  await when.getByRole("button", { name: "Today" }).click();
  await page.getByLabel("Explore search").fill(LATER);
  await expect(page.locator("[data-cc='explore-empty']")).toBeVisible();
});
