import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Issue #210, the map navigation refresh: the folding nav (app/map-v2-nav.jsx) and the Explore panel
//  (app/map-v2-explore.jsx). Covered: the nav folds into one round gold-ringed button and opens to four
//  thumb-sized items with the current one marked, dims the map, folds back on its own, and its Map item gives a
//  clean map; the categories live INSIDE the Explore panel (its title switches to a list of them, and a pick
//  filters the cards and dims the other pins; founder, 2026-10-30); a tap on a pin scrolls the row to that card and
//  outlines it in gold without opening anything; a tap on a card chooses it WITHOUT moving the row while the map eases
//  to its pin, and the second tap on it opens the full listing (one bottom area at a time), which returns to the same
//  panel and map; the map's zoom and locate buttons are hidden while the panel is up and come back when it is lowered;
//  distances are in km; reduced motion; the old map keeps its bar; a laptop keeps the sidebar. Set NAV_SHOTS_DIR to
//  also write the PR screenshots (375 x 812, light and dark).
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown> & { id: string; category?: string | null };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 6, places: 6, events: 4, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed;

const nav = (page: Page) => page.locator("[data-mv2='nav']");
const toggle = (page: Page) => page.locator("[data-mv2='nav-toggle']");
const explore = (page: Page) => page.locator("[data-mv2='explore']");
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
// the fixed bottom bar the old map had (deleted with it, issue #179): it must never come back
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
/**
 * The row ranks again when the map settles (and starts again at its first card): on a slow machine that happens a second or two
 * after the pins appear. Wait until the order has held still, and the fonts are in, before measuring or scrolling anything.
 */
async function settledPanel(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const order = () => explore(page).locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")).join());
  await expect.poll(async () => { const a = await order(); await page.waitForTimeout(700); return a === (await order()); }, { timeout: 15_000 }).toBe(true);
}

/** A pin in the open map while the panel is lowered (the strip is short, so most of the screen is map). */
async function visiblePinLowered(page: Page) {
  const ids = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(".maplibregl-marker").forEach((m) => {
      const r = m.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (m.style.display !== "none" && cy > 160 && cy < window.innerHeight - 140 && cx > 30 && cx < window.innerWidth - 30) out.push(m.getAttribute("data-cc-id")!);
    });
    return out;
  });
  expect(ids.length, "a pin in the open map").toBeGreaterThan(0);
  return ids[0];
}
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
    await expect(toggle(page)).toHaveCSS("border-top-color", "rgb(242, 189, 34)"); // --accent, the one gold
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
    // the clean map keeps its zoom and locate buttons, always
    await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();
    await toggle(page).tap();
    await expect(nav(page).getByRole("button", { name: "Map" })).toHaveAttribute("aria-current", "page");
    await page.locator("[data-mv2='nav-dim']").tap({ position: { x: 40, y: 300 } });
    await pinOf(page, seed.contributors[0].id).dispatchEvent("click");
    await expect(sheet(page)).toBeVisible();
    await page.getByRole("button", { name: "Close details" }).tap();
    await toggle(page).tap();
    await nav(page).getByRole("button", { name: "Home" }).tap();
    await expect(page.locator("[data-mv2='pills']")).toHaveCount(0);   // the categories moved inside the panel
    await expect(explore(page)).toBeVisible();
  });

  test("Profile opens the account menu with Let's, Messages and Alerts", async ({ page }) => {
    await open(page);
    await toggle(page).tap();
    const profile = nav(page).getByRole("button", { name: "Profile", exact: true });
    await profile.tap();
    await expect(profile).toHaveAttribute("aria-expanded", "true");
    for (const label of ["View Profile", "Let's…", "Messages", "Alerts"]) await expect(page.getByRole("button", { name: label })).toBeVisible();
    await page.getByRole("button", { name: "Let's…" }).tap();
    await expect(page).toHaveURL(/\/lets$/);
  });

  test("the categories are INSIDE the panel: its title switches to a list of the groups, a pick filters the cards, and the panel never changes height", async ({ page }) => {
    const seed = await open(page);
    await settledPanel(page);
    // nothing over the map any more: no pill row, just the search bar and the account button
    await expect(page.locator("[data-mv2='pills']")).toHaveCount(0);
    const heightOf = async () => Math.round((await explore(page).boundingBox())!.height);
    const cardsHeight = await heightOf();
    const same = async () => expect(Math.abs((await heightOf()) - cardsHeight)).toBeLessThanOrEqual(2);
    const sw = explore(page).getByRole("button", { name: "Explore", exact: true });
    await expect(sw).toHaveAttribute("aria-expanded", "false");
    await sw.tap();
    await expect(sw).toHaveAttribute("aria-expanded", "true");
    const cats = explore(page).locator("[data-mv2='cat']");
    await expect(cats).toHaveText(["All", "Churches & worship", "Events", "Business", "Serve & care", "Culture & fun", "Learn & grow", "Audiences", "Ideas"]);
    await same();   // the list fills the cards' box
    // compact rows, two across, each a thumb tall
    const boxes = await cats.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; }));
    for (const r of boxes) expect(r.h).toBeGreaterThanOrEqual(44);
    expect(new Set(boxes.slice(0, 4).map((r) => r.x)).size).toBe(2);
    await expect(explore(page).getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
    // Events: the cards hold events only, the title says what it is filtered to, and a Contributor's pin is dimmed
    const events = explore(page).getByRole("button", { name: "Events", exact: true });
    await events.tap();
    await expect(sw).toHaveAttribute("aria-expanded", "false");   // a pick goes back to the cards
    await expect(explore(page).locator("[data-mv2='explore-filter']")).toHaveText("Events");
    const ids = await explore(page).locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")));
    const eventIds = new Set(seed.events.map((e) => e.id));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(eventIds.has(id!), id!).toBe(true);
    await expect.poll(() => pinOf(page, seed.contributors[0].id).locator(".mv2-pin").evaluate((e) => e.hasAttribute("data-dim"))).toBe(true);
    await same();
    // Ideas is a switch beside the groups: the list stays open
    await sw.tap();
    await explore(page).getByRole("button", { name: "Ideas", exact: true }).tap();
    await expect(sw).toHaveAttribute("aria-expanded", "true");
    await expect(explore(page).getByRole("button", { name: "Ideas", exact: true })).toHaveAttribute("aria-pressed", "true");
    // Escape goes back to the cards
    await page.keyboard.press("Escape");
    await expect(sw).toHaveAttribute("aria-expanded", "false");
  });

  test("Explore: large cards closest first, a category pill with its colour, the distance in km, and See all", async ({ page }) => {
    await open(page);
    await expect(explore(page).getByRole("heading", { name: "Explore" })).toBeVisible();
    const cards = explore(page).locator("[data-mv2='explore-card']");
    expect(await cards.count()).toBeGreaterThan(4);
    const first = cards.first();
    const w = (await first.boundingBox())!.width;
    // founder, 2026-10-30: a little smaller than the 280 px they were, and the whole panel under a third of a phone screen
    expect(w).toBeGreaterThanOrEqual(220);
    expect(w).toBeLessThanOrEqual(250);
    expect((await explore(page).boundingBox())!.height).toBeLessThanOrEqual(812 * 0.34);
    await expect(first).toContainText(/\d+(\.\d)? km|\d+ m|Under 100 m/);
    await expect(explore(page)).not.toContainText(/\bmi\b|miles/);
    // a card with a group carries the group colour on its chip outline and top edge
    const withCat = explore(page).locator("[data-mv2='card2'][data-cat]").first();
    await expect(withCat).toBeVisible();
    const edge = await withCat.evaluate((e) => getComputedStyle(e).borderTopColor);
    expect(edge).not.toBe("rgb(242, 189, 34)");
    // #210 part 3: See all opens the Discover page (e2e/map-v2-discover.spec.ts)
    await explore(page).getByRole("button", { name: "See all listings" }).tap();
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("a real tap on a pin scrolls the row to its card and outlines it in gold; only a second tap on the card opens the listing", async ({ page }) => {
    await open(page);
    const id = await furthestPin(page);
    const b = (await pinOf(page, id).boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    const card = explore(page).locator(`[data-explore-id="${id}"]`);
    await expect(card).toHaveAttribute("data-selected", "");
    await expect(card.locator("[data-mv2='explore-badge']")).toHaveText("Tap again to open");
    // the badge sits over the picture, so choosing a pin never changes the card's size
    const cardBox = (await card.locator("[data-mv2='card2']").boundingBox())!;
    const other = (await explore(page).locator("[data-explore-id]:not([data-selected]) [data-mv2='card2']").first().boundingBox())!;
    expect(Math.abs(cardBox.height - other.height)).toBeLessThan(1);
    await expect(card.locator("[data-mv2='card2']")).toHaveCSS("box-shadow", /rgb\(131, 97, 0\)/); // --accent-ink ring
    await expect(sheet(page)).toHaveCount(0);
    // the row brought it to the start, fully on screen
    await expect.poll(async () => { const c = (await card.boundingBox())!; return c.x >= 0 && c.x + c.width <= 375; }, { timeout: 8000 }).toBe(true);
    // the card, tapped again, opens the full listing, and the row steps aside: one bottom area
    await card.locator("[data-mv2='card2']").tap();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-expanded", "");
    await expect(explore(page)).toBeHidden();
    await page.getByRole("button", { name: "Close details" }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(explore(page)).toBeVisible();
    await expect(card).toHaveAttribute("data-selected", "");
  });

  test("a card tap CHOOSES it: the row stays exactly in place while the map eases to its pin; the second tap opens it, and closing leaves both as they were", async ({ page }) => {
    await open(page);
    await settledPanel(page);
    const list = explore(page).locator("[data-mv2='list']");
    // scroll the row a little, so "exactly in place" is not just "at the start"
    await list.evaluate((el) => { el.scrollLeft = 300; });
    await page.waitForTimeout(300);
    const scroll0 = await list.evaluate((el) => el.scrollLeft);
    expect(scroll0).toBeGreaterThan(100);
    const ids = await explore(page).locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")!));
    // a card that is wholly on screen
    const target = await page.evaluate(() => {
      const hit = [...document.querySelectorAll<HTMLElement>("[data-mv2='explore'] [data-explore-id]")].find((el) => { const r = el.getBoundingClientRect(); return r.left >= 8 && r.right <= window.innerWidth - 8; });
      return hit ? hit.getAttribute("data-explore-id") : null;
    });
    expect(target).not.toBeNull();
    const card = explore(page).locator(`[data-explore-id="${target}"]`);
    const before = (await card.boundingBox())!;
    const centre0 = await page.evaluate(() => { const c = (window as unknown as { __ccMap: { getCenter: () => { lng: number; lat: number } } }).__ccMap.getCenter(); return [c.lng, c.lat]; });
    await card.locator("[data-mv2='card2']").tap();
    // chosen, outlined, in words; nothing opened; the row, and every card in it, did not move
    await expect(card).toHaveAttribute("data-selected", "");
    await expect(card.locator("[data-mv2='explore-badge']")).toHaveText("Tap again to open");
    await expect(sheet(page)).toHaveCount(0);
    await page.waitForTimeout(900);
    expect(await list.evaluate((el) => el.scrollLeft)).toBe(scroll0);
    const after = (await card.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(await explore(page).locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")!))).toEqual(ids);
    // the map moved to the pin, which sits in the open part of the map: below the search bar, above the panel
    await expect.poll(() => page.evaluate(() => { const c = (window as unknown as { __ccMap: { getCenter: () => { lng: number; lat: number } } }).__ccMap.getCenter(); return [c.lng, c.lat]; }), { timeout: 5000 }).not.toEqual(centre0);
    await expect.poll(async () => {
      const r = await page.evaluate((id) => { const m = document.querySelector<HTMLElement>(`.maplibregl-marker[data-cc-id="${id}"]`); if (!m) return null; const b = m.getBoundingClientRect(); return { y: b.top + b.height / 2, x: b.left + b.width / 2 }; }, target);
      const top = (await page.locator("[data-mv2='home-top']").boundingBox())!;
      const row = (await explore(page).boundingBox())!;
      return !!r && r.y > top.y + top.height && r.y < row.y && r.x > 0 && r.x < 375;
    }, { timeout: 5000 }).toBe(true);
    const centre1 = await page.evaluate(() => { const c = (window as unknown as { __ccMap: { getCenter: () => { lng: number; lat: number } } }).__ccMap.getCenter(); return [c.lng, c.lat]; });
    // a second tap on the same, chosen card opens the full listing over everything...
    await card.locator("[data-mv2='card2']").tap();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-expanded", "");
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");
    await page.waitForTimeout(700);
    // ...which did not move the map, and closing it brings back the very same panel and map
    expect(await page.evaluate(() => { const c = (window as unknown as { __ccMap: { getCenter: () => { lng: number; lat: number } } }).__ccMap.getCenter(); return [c.lng, c.lat]; })).toEqual(centre1);
    await page.getByRole("button", { name: "Close details" }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(explore(page)).toBeVisible();
    await expect(card).toHaveAttribute("data-selected", "");
    expect(await list.evaluate((el) => el.scrollLeft)).toBe(scroll0);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => { const c = (window as unknown as { __ccMap: { getCenter: () => { lng: number; lat: number } } }).__ccMap.getCenter(); return [c.lng, c.lat]; })).toEqual(centre1);
  });

  test("zoom, un-zoom and locate are hidden while the panel is up, come back when it is lowered by its handle, and go again when it is raised", async ({ page }) => {
    await open(page);
    const ctl = page.locator(".maplibregl-ctrl-group:has(.maplibregl-ctrl-zoom-in)");
    await expect(ctl).toBeHidden();
    // choosing a card hides them too (they were already hidden): still hidden
    const grab = explore(page).locator("[data-mv2='explore-grab']");
    const tall = (await explore(page).boundingBox())!.height;
    await grab.tap();
    await expect(explore(page)).toHaveAttribute("data-min", "");
    await expect(ctl).toBeVisible();
    // lowered: only the title strip, and the buttons sit above it, at the size the founder asked for (36 px)
    await expect.poll(async () => (await explore(page).boundingBox())!.height).toBeLessThan(tall / 2);
    const strip = (await explore(page).boundingBox())!;
    expect(strip.height).toBeLessThanOrEqual(90);
    const zoom = (await page.locator(".maplibregl-ctrl-zoom-in").boundingBox())!;
    expect(Math.round(zoom.width)).toBe(36);
    expect(zoom.y + zoom.height).toBeLessThanOrEqual(strip.y + 1);
    // a pin tap raises it again (its card has to be there to be chosen), and the buttons go
    const id = await visiblePinLowered(page);
    await pinOf(page, id).dispatchEvent("click");
    await expect(explore(page)).not.toHaveAttribute("data-min", "");
    await expect(ctl).toBeHidden();
    await expect(explore(page).locator(`[data-explore-id="${id}"][data-selected]`)).toBeVisible();
    // a swipe down on the handle lowers it, a swipe up raises it
    const g = (await grab.boundingBox())!;
    await page.touchscreen.tap(g.x + g.width / 2, g.y + g.height / 2);
    await expect(explore(page)).toHaveAttribute("data-min", "");
    await grab.tap();
    await expect(explore(page)).not.toHaveAttribute("data-min", "");
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
});

test.describe("on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the sidebar (no folding nav), and the Explore panel is there with its categories inside it", async ({ page }) => {
    await open(page);
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.locator("aside")).toBeVisible();
    await expect(explore(page)).toBeVisible();
    await expect(page.locator("[data-mv2='pills']")).toHaveCount(0);
    await explore(page).getByRole("button", { name: "Explore", exact: true }).click();
    await expect(explore(page).locator("[data-mv2='cat']")).toHaveCount(9);
  });

  test("keeps zoom, un-zoom and locate on screen (the hiding is for a phone: a laptop has room and a mouse)", async ({ page }) => {
    await open(page);
    await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-geolocate")).toBeVisible();
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
      await explore(page).getByRole("button", { name: "Explore", exact: true }).tap();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/categories-375-${look}.png` });
      await explore(page).getByRole("button", { name: "Churches & worship" }).tap();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/filtered-375-${look}.png` });
      await explore(page).locator("[data-mv2='explore-grab']").tap();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/lowered-375-${look}.png` });
      await explore(page).locator("[data-mv2='explore-grab']").tap();
      await page.waitForTimeout(400);
      // a card tap chooses it (the panel stays, the map eases to its pin); the second tap opens the full listing
      await explore(page).locator("[data-explore-id] [data-mv2='card2']").first().tap();
      await page.waitForTimeout(1300);
      await page.screenshot({ path: `${dir}/card-chosen-375-${look}.png` });
      await explore(page).locator("[data-selected] [data-mv2='card2']").tap();
      await expect(sheet(page)).toBeVisible();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${dir}/card-open-375-${look}.png` });
      await page.getByRole("button", { name: "Close details" }).tap();
      await page.waitForTimeout(500);
      await toggle(page).tap();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/nav-open-375-${look}.png` });
      await ctx.close();
    });
  }
});
