import { test, expect, type Page } from "@playwright/test";
import {
  mockMapNetwork,
  mockContributorDetail,
  openMap,
  openListing,
  smallSeed,
  FIXED_NOW,
  type MapSeed,
} from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  The icon set is trimmed (QA fix plan PR F2, 2026-11-25): the page loads only the lucide icons the source names
//  (scripts/frontend-vendor.js), not all ~2,000. An icon named only at runtime would draw as an empty square, so
//  app/icons.jsx and map.jsx record every name the set lacks in window.__ccMissingIcons. This walks the main screens
//  as a citizen, a contributor and an admin (demo mode, the same seeded map the other specs use) and fails on any.
// ════════════════════════════════════════════════════════════════════

type Row = { id: string };
const missing = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ccMissingIcons?: string[] }).__ccMissingIcons ?? []);

async function asRole(page: Page, role: "citizen" | "contributor" | "admin") {
  await page.addInitScript((r) => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: r }));
  }, role);
}

/** Open an address and wait until its screen has drawn. */
async function visit(page: Page, path: string, screen: string) {
  await page.goto(path);
  await expect(page.locator(`[data-screen="${screen}"]`).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

test.describe("every icon a screen draws is in the trimmed lucide set", () => {
  test("a citizen: the map, its pins, Explore, a listing of each kind, Discover, Let's, Kingdom Projects, Me", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seed = smallSeed(FIXED_NOW) as MapSeed & {
      places: Row[];
      events: Row[];
      contributors: Row[];
    };
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await asRole(page, "citizen");
    await openMap(page, "/", 3);
    // openListing goes through the open Explore panel, so it draws Explore's cards and icons on the way
    for (const id of [seed.places[0].id, seed.events[0].id, seed.contributors[0].id]) {
      await openListing(page, id);
      await expect(page.locator("[data-mv2='sheet']")).toBeVisible();
    }
    expect(await missing(page), "icons missing on the map").toEqual([]);

    for (const [path, screen] of [
      ["/explore", "explore"],
      ["/lets", "lets"],
      ["/community", "community"],
      ["/me", "profile"],
    ] as const) {
      await visit(page, path, screen);
      expect(await missing(page), `icons missing on ${path}`).toEqual([]);
    }
  });

  for (const [role, base, tabs] of [
    ["contributor", "/dashboard", ["overview", "events", "news", "suggestions", "profile", "messages", "tools"]],
    ["admin", "/admin", ["applications", "overview", "contributors", "citizens", "reports"]],
  ] as const) {
    test(`a ${role}: every ${base} tab`, async ({ page }) => {
      test.setTimeout(120_000);
      await mockMapNetwork(page);
      await asRole(page, role);
      for (const tab of tabs) {
        await visit(page, `${base}/${tab}`, base.slice(1));
        expect(await missing(page), `icons missing on ${base}/${tab}`).toEqual([]);
      }
    });
  }
});
