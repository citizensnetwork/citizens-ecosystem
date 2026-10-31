import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  MapTiler's Free plan (founder: staying on it, tracker MAP:D12) needs its
//  logo, linked to maptiler.com, bottom-left on EVERY map that shows its
//  tiles, plus the © MapTiler / © OpenStreetMap text credit. The home map
//  carries the logo at the foot of its bottom-left overlay column (the Map
//  Key was removed at the founder's request, 2026-10-12); the LocationPicker
//  (apply / admin forms) carries it as a map control. MapTiler is mocked
//  here, so the image itself does not load: these checks are about the
//  link, the file it points at, and that nothing covers it.
// ════════════════════════════════════════════════════════════════════

const LOGO = "[data-cc-maptiler-logo]";

/** The logo's box, and whether the element at its centre is the logo itself (not covered). */
async function logoState(page: Page) {
  return page.locator(LOGO).first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, uncovered: !!(hit && el.contains(hit)) };
  });
}

async function expectLogoLink(page: Page) {
  const logo = page.locator(LOGO).first();
  await expect(logo).toHaveAttribute("href", "https://www.maptiler.com");
  await expect(logo).toHaveAttribute("target", "_blank");
  await expect(logo).toHaveAttribute("rel", /noopener/);
  await expect(logo.locator("img")).toHaveAttribute("src", "https://api.maptiler.com/resources/logo.svg");
  await expect(logo.locator("img")).toHaveAttribute("alt", "MapTiler logo");
}

for (const [label, path] of [
  ["flag off", "/?map=v1"],
  ["flag on", "/?map=v2"],
] as const) {
  test.describe(`the home map shows the MapTiler logo (${label})`, () => {
    test("on a phone: bottom-left, above the bottom navigation, never covered; no Map Key; the credit is a small pill", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockMapNetwork(page);
      await openMap(page, path, 1);
      await expectLogoLink(page);
      const s = await logoState(page);
      expect(s.uncovered).toBe(true);
      expect(s.x).toBeLessThan(40); // the left edge of the map
      expect(s.bottom).toBeLessThanOrEqual(844 - 60); // clear of the bottom navigation
      await expect(page.getByText("Map Key", { exact: true })).toHaveCount(0);
      // the © MapTiler / © OpenStreetMap credit stays (required), as a small dark pill, not a white bar
      const credit = page.locator(".maplibregl-ctrl-attrib").first();
      await expect(credit).toHaveCSS("background-color", "rgba(23, 19, 16, 0.62)");
      await expect(credit).toHaveCSS("font-size", "9px");
    });

    test("on a phone, zoomed out: the zoom hint and the expanded © credit never overlap", async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 }); // the narrowest phone we design for
      await mockMapNetwork(page);
      // A style whose one source carries the real credit, so the attribution control has its full text
      // (the shared mock style has no sources, which leaves the credit empty).
      await page.route("**/api.maptiler.com/maps/**", (route) =>
        route.fulfill({
          json: {
            version: 8,
            sources: {
              credit: {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
                attribution:
                  '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap contributors</a>',
              },
            },
            layers: [{ id: "credit", type: "circle", source: "credit" }],
          },
        }),
      );
      await openMap(page, path, 0);
      // marked as a person's move, so the app's auto-framing leaves the zoom alone
      await page.evaluate(() =>
        (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ zoom: 5 }, { originalEvent: {} }),
      );
      const hint = page.locator("[data-zoom-hint]");
      await expect(hint).toBeVisible();
      const credit = page.locator(".maplibregl-ctrl-attrib").first();
      await expect(credit).toContainText("OpenStreetMap");
      await expect(credit).toHaveClass(/maplibregl-compact-show/); // expanded, as on first load
      const h = (await hint.boundingBox())!;
      const c = (await credit.boundingBox())!;
      const overlap = h.x < c.x + c.width && c.x < h.x + h.width && h.y < c.y + c.height && c.y < h.y + h.height;
      expect(overlap).toBe(false);
      expect(c.y + c.height).toBeLessThanOrEqual(800 - 60); // and still above the bottom navigation
    });

    test("on a laptop: bottom-left of the map, never covered", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await mockMapNetwork(page);
      await openMap(page, path, 1);
      const s = await logoState(page);
      const map = await page.locator(".maplibregl-canvas").boundingBox();
      expect(s.uncovered).toBe(true);
      expect(s.x - map!.x).toBeLessThan(40);
      // Map v2 (#210): the Explore row sits at the foot of the map, so the logo sits just above the row instead
      const row = path.includes("v2") ? await page.locator("[data-mv2='explore']").boundingBox() : null;
      const floor = row ? row.y : map!.y + map!.height;
      expect(s.bottom).toBeLessThanOrEqual(floor);
      expect(floor - s.bottom).toBeLessThan(60);
    });
  });
}

test("the location picker (Become a Contributor) shows the logo and the © MapTiler / © OpenStreetMap credit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMapNetwork(page);
  await openMap(page, "/", 1);
  await page.evaluate(() => (window as unknown as { __cc: { go: (p: string) => void } }).__cc.go("apply"));
  const picker = page.locator(".maplibregl-map").filter({ has: page.locator(LOGO) });
  await expect(picker).toHaveCount(1, { timeout: 15_000 });
  await expectLogoLink(page);
  await expect(picker.locator(".maplibregl-ctrl-attrib")).toHaveCount(1);
  expect((await logoState(page)).uncovered).toBe(true);
});
