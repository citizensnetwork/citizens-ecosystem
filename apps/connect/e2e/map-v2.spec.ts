import { test, expect } from "@playwright/test";
import { mockMapNetwork, openMap } from "./support/map-v2";
import { goTo } from "./support/app-hooks";

// ════════════════════════════════════════════════════════════════════
//  Map v2 (tracker docs/MAP_UX_TRACKER.md), everything behind `?map=v2`.
//  Hermetic: the same fake network as the other map specs (no real Supabase
//  or MapTiler), clock frozen. This file grows with each Phase 1 item; the
//  describe blocks are named after the item they guard.
// ════════════════════════════════════════════════════════════════════

test.describe("P1-01 the ?map=v2 flag", () => {
  test("flag off (the default): no Map v2 stylesheet, no badge, nothing set on the page", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await mockMapNetwork(page);
    await openMap(page, "/", 8);

    expect(requested.filter((u) => u.includes("map-v2"))).toEqual([]);
    await expect(page.locator("#cc-map-v2-badge")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
    expect(await page.evaluate(() => (window as unknown as { isMapV2: () => boolean }).isMapV2())).toBe(false);
  });

  test("?map=v2 turns it on, shows the badge, loads the tokens and defaults to the LIGHT look", async ({ page }) => {
    await mockMapNetwork(page);
    const css = page.waitForResponse((r) => r.url().includes("/assets/map-v2.css") && r.ok());
    await openMap(page, "/?map=v2", 8);
    await css;

    await expect(page.locator("#cc-map-v2-badge")).toHaveText("map v2");
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
    // the token file is really applied: --accent resolves to gold
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("#c9a84c");
    expect(await page.evaluate(() => localStorage.getItem("cc_map_v2"))).toBe("v2");
  });

  test("the flag survives a reload and a screen change that rewrites the address bar", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);

    // go() rebuilds the URL from the route table, so ?map=v2 is gone from the address bar...
    await goTo(page, "kingdom-discovery");
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
    // ...and a plain reload still has the flag on, from storage.
    await page.reload();
    await expect(page.locator("#cc-map-v2-badge")).toHaveText("map v2");
  });

  test("?map=v1 turns it off and forgets it", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    await expect(page.locator("#cc-map-v2-badge")).toBeVisible();

    await page.goto("/?map=v1");
    await page.waitForSelector('[data-screen="discover"]');
    await expect(page.locator("#cc-map-v2-badge")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("cc_map_v2"))).toBeNull();
  });
});

test.describe("P1-03 motion tokens and reduced motion", () => {
  test("durations are 120 / 200 / 320 ms, and collapse to 0 under prefers-reduced-motion", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    const read = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return ["--dur-fast", "--dur-base", "--dur-slow"].map((n) => cs.getPropertyValue(n).trim());
      });
    expect(await read()).toEqual(["120ms", "200ms", "320ms"]);

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await read()).toEqual(["0ms", "0ms", "0ms"]);
  });
});
