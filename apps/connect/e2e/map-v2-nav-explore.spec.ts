import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Issue #210, the map navigation refresh: the folding nav (app/map-v2-nav.jsx), the category pills and the
//  Explore row (app/map-v2-explore.jsx). Covered: the nav folds into one round gold-ringed button and opens to four
//  thumb-sized items with the current one marked, dims the map, folds back on its own, and its Map item gives a
//  clean map; the pills are one row with the chosen one in gold, and they filter the row and dim the other pins;
//  a real tap on a pin scrolls the row to that card and outlines it in gold without opening anything, and only the
//  card opens the sheet (one bottom area at a time); distances are in km; reduced motion; the old map keeps its
//  bar; a laptop keeps the sidebar. Set NAV_SHOTS_DIR to also write the PR screenshots (375 x 812, light and dark).
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown> & { id: string; category?: string | null };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 6, places: 6, events: 4, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed;

const nav = (page: Page) => page.locator("[data-mv2='nav']");
const toggle = (page: Page) => page.locator("[data-mv2='nav-toggle']");
const explore = (page: Page) => page.locator("[data-mv2='explore']");
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
// the old map's fixed bottom bar (shell.jsx BottomNav), not the sidebar's nav
const oldBar = (page: Page) => page.locator("nav.fixed.bottom-0");
const pinOf = (page: Page, id: string) => page.locator(`.maplibregl-marker[data-cc-id="${id}"]`);

async function open(page: Page, path = "/?map=v2") {
  const seed = seedOf();
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 0 });
  await openMap(page, path, 8);
  return seed;
}

/** The pins the person can actually see and press: above the Explore row and below the top bar. */
async function visiblePins(page: Page) {
  const box = await explore(page).boundingBox();
  const floor = box ? box.y : 9999;
  const ids = await page.evaluate((limit) => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(".maplibregl-marker").forEach((m) => {
      const r = m.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (m.style.display === "none" || cy < 180 || cy > limit - 30 || cx < 30 || cx > window.innerWidth - 30) return;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit.closest(".maplibregl-marker") === m) out.push(m.getAttribute("data-cc-id")!);
    });
    return out;
  }, floor);
  expect(ids.length, "a pin above the row").toBeGreaterThan(0);
  return ids;
}
const visiblePin = async (page: Page) => (await visiblePins(page))[0];
/** Of the pins in view, the one whose card sits furthest along the row (so the row has to move to show it). */
async function furthestPin(page: Page) {
  const order = await explore(page).locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")!));
  const seen = await visiblePins(page);
  return seen.reduce((best, id) => (order.indexOf(id) > order.indexOf(best) ? id : best), seen[0]);
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("the nav folds into one round, gold-ringed button at the bottom centre", async ({ page }) => {
    await open(page);
    await expect(oldBar(page)).toHaveCount(0); // the old bar is gone
    const b = (await toggle(page).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(Math.abs(b.width - b.height)).toBeLessThan(1);
    expect(Math.abs(b.x + b.width / 2 - 375 / 2)).toBeLessThan(2);
    expect(812 - (b.y + b.height)).toBeLessThan(40);
    await expect(toggle(page)).toHaveCSS("border-radius", /px/);
    await expect(toggle(page)).toHaveCSS("border-top-color", "rgb(201, 168, 76)"); // --accent, the one gold
    await expect(toggle(page)).toHaveAccessibleName("Open navigation");
  });

  test("it opens to Home, Explore, Map and Profile, each a thumb's size, the current one on gold; the map dims", async ({ page }) => {
    await open(page);
    await toggle(page).tap();
    const items = nav(page).locator("[data-mv2='nav-item']");
    await expect(items).toHaveText(["Home", "Explore", "Map", "Profile"]);
    for (let i = 0; i < 4; i++) {
      const b = (await items.nth(i).boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const home = nav(page).getByRole("button", { name: "Home" });
    await expect(home).toHaveAttribute("aria-current", "page");
    await expect(home).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator("[data-mv2='nav-dim']")).toBeVisible();
    // a tap on the dimmed map folds it again
    await page.locator("[data-mv2='nav-dim']").tap({ position: { x: 40, y: 300 } });
    await expect(items).toHaveCount(0);
    await expect(toggle(page)).toBeVisible();
  });

  test("it folds back by itself after a few seconds untouched", async ({ page }) => {
    await open(page);
    await toggle(page).tap();
    await expect(nav(page).locator("[data-mv2='nav-item']")).toHaveCount(4);
    await page.waitForTimeout(3000);
    await expect(nav(page).locator("[data-mv2='nav-item']")).toHaveCount(4);
    await expect(nav(page).locator("[data-mv2='nav-item']")).toHaveCount(0, { timeout: 4000 });
  });

  test("Map gives a clean map (no pills, no row; a pin opens the sheet there), Home brings them back", async ({ page }) => {
    const seed = await open(page);
    await toggle(page).tap();
    await nav(page).getByRole("button", { name: "Map" }).tap();
    await expect(page.locator("[data-mv2='pills']")).toHaveCount(0);
    await expect(explore(page)).toHaveCount(0);
    await toggle(page).tap();
    await expect(nav(page).getByRole("button", { name: "Map" })).toHaveAttribute("aria-current", "page");
    await page.locator("[data-mv2='nav-dim']").tap({ position: { x: 40, y: 300 } });
    await pinOf(page, seed.contributors[0].id).dispatchEvent("click");
    await expect(sheet(page)).toBeVisible();
    await page.getByRole("button", { name: "Close details" }).tap();
    await toggle(page).tap();
    await nav(page).getByRole("button", { name: "Home" }).tap();
    await expect(page.locator("[data-mv2='pills']")).toBeVisible();
    await expect(explore(page)).toBeVisible();
  });

  test("Profile opens the account menu with Projects, Messages and Alerts", async ({ page }) => {
    await open(page);
    await toggle(page).tap();
    const profile = nav(page).getByRole("button", { name: "Profile", exact: true });
    await profile.tap();
    await expect(profile).toHaveAttribute("aria-expanded", "true");
    for (const label of ["View Profile", "Projects", "Messages", "Alerts"]) await expect(page.getByRole("button", { name: label })).toBeVisible();
    await page.getByRole("button", { name: "Projects" }).tap();
    await expect(page).toHaveURL(/\/community$/);
  });

  test("the pills are one row: the chosen pill is a gold fill, it filters the row and dims the other pins", async ({ page }) => {
    const seed = await open(page);
    const pills = page.locator("[data-mv2='pill']");
    await expect(pills).toHaveText(["All", "Churches & worship", "Events", "Business", "Serve & care", "Culture & fun", "Learn & grow", "Audiences", "Ideas"]);
    const tops = await pills.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
    expect(tops.length).toBe(1);
    for (const b of await pills.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(b).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
    const events = page.getByRole("button", { name: "Events", exact: true });
    await events.tap();
    await expect(events).toHaveAttribute("aria-pressed", "true");
    await expect(events).toHaveCSS("background-color", "rgb(201, 168, 76)");
    // the row holds events only, and a Contributor's pin is dimmed
    const ids = await explore(page).locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")));
    const eventIds = new Set(seed.events.map((e) => e.id));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(eventIds.has(id!), id!).toBe(true);
    await expect.poll(() => pinOf(page, seed.contributors[0].id).locator(".mv2-pin").evaluate((e) => e.hasAttribute("data-dim"))).toBe(true);
  });

  test("Explore: large cards closest first, a category pill with its colour, the distance in km, and See all", async ({ page }) => {
    await open(page);
    await expect(explore(page).getByRole("heading", { name: "Explore" })).toBeVisible();
    const cards = explore(page).locator("[data-mv2='explore-card']");
    expect(await cards.count()).toBeGreaterThan(4);
    const first = cards.first();
    const w = (await first.boundingBox())!.width;
    expect(w).toBeGreaterThanOrEqual(260);
    await expect(first).toContainText(/\d+(\.\d)? km|\d+ m|Under 100 m/);
    await expect(explore(page)).not.toContainText(/\bmi\b|miles/);
    // a card with a group carries the group colour on its chip outline and top edge
    const withCat = explore(page).locator("[data-mv2='card2'][data-cat]").first();
    await expect(withCat).toBeVisible();
    const edge = await withCat.evaluate((e) => getComputedStyle(e).borderTopColor);
    expect(edge).not.toBe("rgb(201, 168, 76)");
    // #210 part 3: See all opens the Discover page (e2e/map-v2-discover.spec.ts)
    await explore(page).getByRole("button", { name: "See all listings" }).tap();
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("a real tap on a pin scrolls the row to its card and outlines it in gold; only the card opens the sheet", async ({ page }) => {
    await open(page);
    const id = await furthestPin(page);
    const b = (await pinOf(page, id).boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    const card = explore(page).locator(`[data-explore-id="${id}"]`);
    await expect(card).toHaveAttribute("data-selected", "");
    await expect(card.locator("[data-mv2='explore-badge']")).toHaveText("Selected");
    // the badge sits over the picture, so choosing a pin never changes the card's size
    const cardBox = (await card.locator("[data-mv2='card2']").boundingBox())!;
    const other = (await explore(page).locator("[data-explore-id]:not([data-selected]) [data-mv2='card2']").first().boundingBox())!;
    expect(Math.abs(cardBox.height - other.height)).toBeLessThan(1);
    await expect(card.locator("[data-mv2='card2']")).toHaveCSS("box-shadow", /rgb\(139, 105, 20\)/); // --accent-ink ring
    await expect(sheet(page)).toHaveCount(0);
    // the row brought it to the start, fully on screen
    await expect.poll(async () => { const c = (await card.boundingBox())!; return c.x >= 0 && c.x + c.width <= 375; }, { timeout: 8000 }).toBe(true);
    // the card opens the sheet, and the row steps aside: one bottom area
    await card.locator("[data-mv2='card2']").tap();
    await expect(sheet(page)).toBeVisible();
    await expect(explore(page)).toBeHidden();
    await page.getByRole("button", { name: "Close details" }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(explore(page)).toBeVisible();
    await expect(card).toHaveAttribute("data-selected", "");
  });

  test("data spread across the country: no drawn pin starts behind the row, and they are in the open map, tappable", async ({ page }) => {
    // the live data shape: a few listings in each city, so the map opens zoomed out to its gate
    const seed = makeSeed({ contributors: 10, places: 6, events: 2, now: FIXED_NOW, spread: 3, seed: 5 }) as unknown as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 0 });
    await openMap(page, "/?map=v2", 4);
    await page.waitForTimeout(800);
    const row = (await explore(page).boundingBox())!;
    const top = (await page.locator("[data-mv2='home-top']").boundingBox())!;
    const pins = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".maplibregl-marker")]
        .filter((m) => m.style.display !== "none")
        .map((m) => {
          const r = m.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return { y, mine: !!hit && hit.closest(".maplibregl-marker") === m, onScreen: x > 0 && x < window.innerWidth };
        })
        .filter((p) => p.onScreen),
    );
    expect(pins.length).toBeGreaterThan(0);
    // none starts behind the Explore row, and the middle of them sits in the open map between the bar and the row
    // (a pin hangs above its point, so one near the top edge may touch the pill row)
    for (const p of pins) expect(p.y).toBeLessThan(row.y);
    const ys = pins.map((p) => p.y).sort((a, b) => a - b);
    const mid = ys[Math.floor(ys.length / 2)];
    expect(mid).toBeGreaterThan(top.y + top.height);
    expect(mid).toBeLessThan(row.y);
    // at least one drawn pin takes a tap itself (nothing over it: not the zoom hint, the logo or the credit)
    expect(pins.some((p) => p.mine)).toBe(true);
    // the row measures from the middle of the OPEN map, so the nearest card is a listing the person can see there
    const firstId = await explore(page).locator("[data-explore-id]").first().getAttribute("data-explore-id");
    const firstPin = await page.evaluate((id) => {
      const m = document.querySelector<HTMLElement>(`.maplibregl-marker[data-cc-id="${id}"]`);
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { y: r.top + r.height / 2, x: r.left + r.width / 2 };
    }, firstId);
    expect(firstPin).not.toBeNull();
    expect(firstPin!.y).toBeLessThan(row.y);
    expect(firstPin!.y).toBeGreaterThan(top.y);
  });

  test("the row keeps one height when a pan refills it with other listings (nothing above it moves)", async ({ page }) => {
    const seed = makeSeed({ contributors: 12, places: 10, events: 4, now: FIXED_NOW, spread: 0.3, seed: 9 }) as unknown as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 0 });
    await openMap(page, "/?map=v2", 4);
    await page.waitForTimeout(600);
    const ids = () => explore(page).locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")).join());
    const before = { h: (await explore(page).boundingBox())!.height, ids: await ids() };
    for (const [dx, dy] of [[0.25, 0.2], [-0.3, -0.25]]) {
      await page.evaluate(([x, y]) => {
        const m = (window as unknown as { __ccMap: { getCenter: () => { lng: number; lat: number }; jumpTo: (o: object, d: object) => void } }).__ccMap;
        const c = m.getCenter();
        m.jumpTo({ center: [c.lng + x, c.lat + y] }, { originalEvent: {} });
      }, [dx, dy]);
      await page.waitForTimeout(500);
      expect((await explore(page).boundingBox())!.height).toBeCloseTo(before.h, 0);
    }
    expect(await ids()).not.toBe(before.ids); // it really did refill
  });

  test("the map's controls and the MapTiler logo sit above the row", async ({ page }) => {
    await open(page);
    const row = (await explore(page).boundingBox())!;
    const ctl = (await page.locator(".maplibregl-ctrl-bottom-right").boundingBox())!;
    expect(ctl.y + ctl.height).toBeLessThanOrEqual(row.y + 1);
    const corner = (await page.locator("[data-mv2='home-corner']").boundingBox())!;
    expect(corner.y + corner.height).toBeLessThanOrEqual(row.y + 1);
  });

  test("reduced motion: the nav opens with no animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await toggle(page).tap();
    await expect(nav(page).locator("[data-mv2='nav-bar']")).toHaveCSS("animation-duration", "0s");
    await expect(page.locator("[data-mv2='nav-dim']")).toHaveCSS("animation-duration", "0s");
  });

  test("the old map (?map=v1) keeps its bottom bar and has no folding nav or row", async ({ page }) => {
    await open(page, "/?map=v1");
    await expect(oldBar(page)).toBeVisible();
    await expect(toggle(page)).toHaveCount(0);
    await expect(explore(page)).toHaveCount(0);
  });
});

test.describe("on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the sidebar (no folding nav), and the Explore row and pills are there", async ({ page }) => {
    await open(page);
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.locator("aside")).toBeVisible();
    await expect(explore(page)).toBeVisible();
    await expect(page.locator("[data-mv2='pills']")).toBeVisible();
  });
});

// The screenshots for the pull request. Off unless NAV_SHOTS_DIR is set (docs/nav-refresh/ is where they are kept).
test.describe("screenshots (NAV_SHOTS_DIR)", () => {
  const dir = process.env.NAV_SHOTS_DIR;
  test.skip(!dir, "set NAV_SHOTS_DIR to write the screenshots");
  for (const look of ["light", "dark"] as const) {
    test(`375 x 812, ${look}`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: look, baseURL });
      const page = await ctx.newPage();
      await open(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/home-375-${look}.png` });
      const id = await visiblePin(page);
      await pinOf(page, id).dispatchEvent("click");
      await expect(explore(page).locator(`[data-explore-id="${id}"][data-selected]`)).toBeVisible();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/pin-selected-375-${look}.png` });
      await page.getByRole("button", { name: "Churches & worship" }).tap();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/pill-375-${look}.png` });
      await toggle(page).tap();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/nav-open-375-${look}.png` });
      await ctx.close();
    });
  }
});
