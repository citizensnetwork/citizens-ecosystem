import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Map v2 sheet, Phase 2 (tracker P2-07, P2-08, P2-06). Hermetic, clock frozen.
//    P2-07  Events tab: Upcoming | Recent
//    P2-08  follower count only from 100 up, rounded down ("100+"), never below
//    P2-06  QR code per Contributor, for printing at venues (no new dependency)
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; full_name: string; physical_longitude: number; physical_latitude: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[] };
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
type MapHook = { jumpTo: (o: object, d: object) => void };

async function openContributor(page: Page, index: number, detail: Parameters<typeof mockContributorDetail>[2] = {}) {
  const seed = seed0();
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, detail);
  await openMap(page, "/?map=v2", 8);
  const c = seed.contributors[index];
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
  await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).click({ force: true });
  await expect(sheet(page)).toBeVisible();
  return { seed, c };
}

test.use({ viewport: { width: 390, height: 844 } });

/** The QR code action sits at the bottom of the content, which only scrolls at full: open the sheet all the way first. */
async function expand(page: Page) {
  await page.locator("[data-mv2='handle']").click();
  await expect(sheet(page)).toHaveAttribute("data-snap", "full");
}

test.describe("P2-07 Upcoming | Recent", () => {
  test("the Events tab opens on Upcoming and Recent lists past events, newest first, with when they were", async ({ page }) => {
    await openContributor(page, 0, { past: 3 });
    await expect(page.getByRole("tab", { name: "Events" })).toHaveAttribute("aria-selected", "true");
    const upcoming = page.getByRole("button", { name: "Upcoming" });
    const recent = page.getByRole("button", { name: "Recent" });
    await expect(upcoming).toHaveAttribute("aria-pressed", "true");
    await expect(recent).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-mv2='row-title']")).toHaveText(["Fixture Gathering 1"]);

    await recent.click();
    await expect(recent).toHaveAttribute("aria-pressed", "true");
    await expect(upcoming).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-mv2='row-title']")).toHaveText(["Past gathering 1", "Past gathering 2", "Past gathering 3"]);
    await expect(page.locator("[data-mv2='row-meta']").first()).toHaveText("3 days ago");

    await upcoming.click();
    await expect(page.locator("[data-mv2='row-title']")).toHaveText(["Fixture Gathering 1"]);
  });

  test("a Contributor with nothing coming up but past events opens on Recent, and Upcoming says so plainly", async ({ page }) => {
    await openContributor(page, 2, { past: 2 });
    await expect(page.getByRole("tab", { name: "Events" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Recent" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-mv2='row-title']")).toHaveText(["Past gathering 1", "Past gathering 2"]);
    await page.getByRole("button", { name: "Upcoming" }).click();
    await expect(page.getByText("Nothing is coming up.")).toBeVisible();
  });

  test("with no events at all there is no Events tab and no sort control", async ({ page }) => {
    await openContributor(page, 2, { gallery: 2 });
    await expect(page.getByRole("tab", { name: "Events" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Recent" })).toHaveCount(0);
  });

  test("a past event the app does not have loaded is listed but is not a link; the sort choice resets on another pin", async ({ page }) => {
    const { seed } = await openContributor(page, 0, { past: 1 });
    await page.getByRole("button", { name: "Recent" }).click();
    await expect(page.locator("[data-mv2='row']")).toHaveCount(0); // not in the store: no button
    await expect(page.locator("[data-mv2='row-title']")).toHaveText(["Past gathering 1"]);
    const other = seed.contributors[1];
    await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [other.physical_longitude, other.physical_latitude]);
    await page.locator(`.maplibregl-marker[data-cc-id="${other.id}"]`).click({ force: true });
    await expect(page.getByRole("button", { name: "Upcoming" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("P2-08 count buckets: shown only from 100, never below", () => {
  const cases: [number | undefined, string | null][] = [
    [undefined, null], [0, null], [1, null], [42, null], [99, null],
    [100, "100+ followers"], [249, "100+ followers"], [250, "250+ followers"], [999, "500+ followers"], [1234, "1,000+ followers"], [26_000, "25,000+ followers"],
  ];
  for (const [n, want] of cases) {
    test(`followers ${n === undefined ? "missing" : n} -> ${want ?? "nothing shown"}`, async ({ page }) => {
      await openContributor(page, 0, { followers: n });
      const header = page.locator("[data-map-sheet-header]");
      await expect(header).toContainText("Fixture Fellowship 1");
      if (want) await expect(header).toContainText(want);
      else await expect(header).not.toContainText("followers");
      // the exact figure is never printed anywhere on the page
      // (a bucket that equals the figure, like "100+" for 100, is the one place the digits may appear: followed by "+")
      if (n !== undefined && n >= 100) expect(await page.locator("body").innerText()).not.toMatch(new RegExp(String.raw`(^|[^\d,])${n}(?![\d,+])`));
    });
  }

  test("the count is not shown on the Place or Event sheets", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { followers: 5000 });
    await openMap(page, "/?map=v2", 8);
    const pl = seed.places[0] as unknown as { id: string; latitude: number; longitude: number };
    await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [pl.longitude, pl.latitude]);
    await page.locator(`.maplibregl-marker[data-cc-id="${pl.id}"]`).click({ force: true });
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator("[data-map-sheet-header]")).not.toContainText("followers");
  });
});

test.describe("P2-06 QR code per Contributor", () => {
  const URL_OF = (slug: string) => `https://www.citizenscentral.co.za/c/${slug}`;

  test("the sheet has a QR code action that opens a labelled dialog with the listing's public link", async ({ page }) => {
    const { c } = await openContributor(page, 0);
    await expand(page);
    await page.getByRole("button", { name: "QR code", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: "QR code for Fixture Fellowship 1" });
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute("aria-modal", "true");
    // always the public site, never the origin the page is served from (localhost here)
    await expect(dlg.getByRole("img")).toHaveAttribute("aria-label", `QR code that opens Fixture Fellowship 1 at ${URL_OF(c.contributor_slug)}`);
    await expect(dlg).toContainText(URL_OF(c.contributor_slug));
    await expect(dlg).toContainText("Scanning it opens this listing in your phone's browser.");
    await expect(dlg).toContainText("Print it or show it at your venue.");
    // drawn from numbers only: one path, nothing from the text in the markup
    const d = await dlg.locator("svg path").getAttribute("d");
    expect(d).toMatch(/^[MhvzM0-9 \-]+$/);
  });

  test("Save image downloads a PNG named for the listing", async ({ page }) => {
    const { c } = await openContributor(page, 0);
    await expand(page);
    await page.getByRole("button", { name: "QR code", exact: true }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save image" }).click()]);
    expect(dl.suggestedFilename()).toBe(`citizens-connect-${c.contributor_slug}.png`);
    const path = await dl.path();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(path!);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(800);
  });

  test("inside the phone app there is no Save image button (a blob download does nothing there): a screenshot is offered instead", async ({ page }) => {
    // the native bridge's answer, kept even when the page's own Capacitor module loads and assigns window.CapCore
    await page.addInitScript(() => {
      Object.defineProperty(window, "CapCore", { get: () => ({ isNativePlatform: () => true }), set: () => {}, configurable: true });
    });
    await openContributor(page, 0);
    await expand(page);
    await page.getByRole("button", { name: "QR code", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: "QR code for Fixture Fellowship 1" });
    await expect(dlg).toBeVisible();
    await expect(page.getByRole("button", { name: "Save image" })).toHaveCount(0);
    await expect(dlg).toContainText("To keep it, take a screenshot of this screen.");
    await expect(dlg).not.toContainText("Print it or show it at your venue.");
    // the code itself, and Close, are still there
    await expect(dlg.getByRole("img")).toBeVisible();
    await expect(page.getByRole("button", { name: "Close QR code" })).toBeVisible();
  });

  test("Escape, the close button and Back each close only the QR dialog; focus returns to the QR action; the sheet stays", async ({ page }) => {
    await openContributor(page, 0);
    await expand(page);
    const open = () => page.getByRole("button", { name: "QR code", exact: true });
    const dlg = page.getByRole("dialog", { name: "QR code for Fixture Fellowship 1" });

    await open().click();
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await expect(sheet(page)).toBeVisible();
    await expect(open()).toBeFocused();

    await open().click();
    await page.getByRole("button", { name: "Close QR code" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(sheet(page)).toBeVisible();

    await open().click();
    await expect(dlg).toBeVisible();
    await page.goBack();
    await expect(dlg).toHaveCount(0);
    await expect(sheet(page)).toBeVisible();
  });

  test("the QR code action is for a Contributor only (not on a Place or an Event sheet)", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 8);
    const ev = seed.events[0] as unknown as { id: string; latitude: number; longitude: number };
    await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [ev.longitude, ev.latitude]);
    await page.locator(`.maplibregl-marker[data-cc-id="${ev.id}"]`).click({ force: true });
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "QR code", exact: true })).toHaveCount(0);
  });

  test("44 px target, and the dialog fits a 360 x 640 phone without scrolling the page", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openContributor(page, 0);
    await expand(page);
    const btn = page.getByRole("button", { name: "QR code", exact: true });
    const b = (await btn.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    await btn.click();
    const box = (await page.getByRole("dialog", { name: "QR code for Fixture Fellowship 1" }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.y + box.height).toBeLessThanOrEqual(640);
  });
});
