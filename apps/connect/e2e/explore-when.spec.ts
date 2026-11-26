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
const resultTitles = (page: Page) => page.locator("[data-screen='explore'] [data-mv2='xs-results'] [data-mv2='xs-title']");
/** The date choice lives in Refine (founder's design, 2026-11-26): pick one and show the results. */
async function refineWhen(page: Page, word: string) {
  await page.getByRole("button", { name: /^Refine/ }).click();
  const when = page.locator("[data-cc='explore-when']");
  await when.getByRole("button", { name: word }).click();
  await expect(when.getByRole("button", { name: word })).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-mv2='xs-refine']").getByRole("button", { name: "Show results" }).click();
  await expect(page.locator("[data-mv2='xs-refine']")).toHaveCount(0);
}

test("'This weekend in Pretoria' shows what is on, with a date line on each event", async ({ page }) => {
  await openExplore(page);
  const shelf = page.locator("[data-cc='explore-weekend']");
  await expect(shelf.getByRole("heading", { name: "This weekend in Pretoria" })).toBeVisible();
  await expect(shelf.locator("[data-mv2='xs-title']").first()).toContainText("Fixture Gathering");
  await expect(shelf.locator("[data-mv2='xs-title']").filter({ hasText: LATER })).toHaveCount(0);
  // "Sat 10 Oct · 12:00 · <area>"
  await expect(shelf.locator("[data-mv2='xs-meta']").first()).toContainText(/^(Fri|Sat|Sun) \d{1,2} Oct · \d\d:\d\d/);
});

test("the date choice keeps only events in its window, and says so when there are none", async ({ page }) => {
  await openExplore(page);
  await refineWhen(page, "This weekend");
  await expect(resultTitles(page).first()).toContainText("Fixture Gathering");
  await expect(resultTitles(page).filter({ hasText: LATER })).toHaveCount(0);
  await expect(resultTitles(page).filter({ hasText: "Fixture Place" })).toHaveCount(0); // places are not "on" a date

  await page.getByLabel("Search Explore").fill(LATER);
  await expect(page.locator("[data-cc='explore-empty']")).toBeVisible();
  await refineWhen(page, "Any date");
  await expect(resultTitles(page).filter({ hasText: LATER })).toHaveCount(1);

  await refineWhen(page, "Today");
  await expect(page.locator("[data-cc='explore-empty']")).toBeVisible();
});
