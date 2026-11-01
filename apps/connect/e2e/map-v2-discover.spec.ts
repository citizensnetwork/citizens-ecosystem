import { test, expect, type Page, type Locator } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";
import { touchSession, swipe } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Issue #210 part 3, the Discover page (app/map-v2-discover.jsx) that the Explore row's "See all" and the folding
//  nav's Explore open, at /explore. Covered: both ways in and Back out; the rows in order (Near you, Popular, one
//  per group) with no empty row; a real sideways swipe scrolls one row and it snaps, a vertical one from a card
//  scrolls the page; the pills filter every row; each card carries its group colour and a km distance; a card opens
//  the listing over the page and Back returns to the same scroll; leaving and coming Back restores the pill and the
//  scroll; the laptop's sidebar keeps Kingdom Exploration. Set DISCOVER_SHOTS_DIR to also write the PR
//  screenshots (375 x 812, light and dark).
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown> & { id: string; category?: string | null };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 8, places: 8, events: 6, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed;

const page$ = (page: Page) => page.locator("[data-mv2='discover']");
const scroller = (page: Page) => page.locator("[data-mv2='discover-scroll']");
const rowOf = (page: Page, id: string) => page.locator(`[data-mv2='discover-row'][data-row='${id}']`);
const listOf = (page: Page, id: string) => rowOf(page, id).locator("[data-mv2='list']");
const titles = (page: Page) => page.locator("[data-mv2='discover-row-title']").allTextContents();
const toggle = (page: Page) => page.locator("[data-mv2='nav-toggle']");
const nav = (page: Page) => page.locator("[data-mv2='nav']");
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
const GROUP_TITLES = ["Churches & worship", "Serve & care", "Culture & fun", "Learn & grow", "Audiences", "Business"];

async function network(page: Page) {
  const seed = seedOf();
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 0 });
  return seed;
}

/** Open the Discover page straight from its address, once the listings have arrived. */
async function openDiscover(page: Page, path = "/explore") {
  const seed = await network(page);
  await page.goto(path);
  await page.waitForSelector('[data-screen="explore"]', { timeout: 20_000 });
  await expect.poll(() => page.locator("[data-mv2='discover-row']").count(), { timeout: 20_000 }).toBeGreaterThan(2);
  return seed;
}

const scrollLeftOf = (l: Locator) => l.evaluate((e) => Math.round(e.scrollLeft));
const scrollTopOf = (page: Page) => scroller(page).evaluate((e) => Math.round(e.scrollTop));

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("See all on the Explore row opens the Discover page at /explore; Back returns to the map", async ({ page }) => {
    await network(page);
    await openMap(page, "/", 8);
    await page.locator("[data-mv2='explore']").getByRole("button", { name: "See all listings" }).tap();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page$(page)).toBeVisible();
    await expect.poll(() => page.title()).toBe("Explore · Citizens Connect");
    await page.goBack();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the nav's Explore opens it too, marked as the current item; Back returns to the map", async ({ page }) => {
    await network(page);
    await openMap(page, "/", 8);
    await toggle(page).tap();
    await nav(page).getByRole("button", { name: "Explore" }).tap();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page$(page)).toBeVisible();
    await toggle(page).tap();
    await expect(nav(page).getByRole("button", { name: "Explore" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await page.goBack();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
  });

  test("rows in order: Near you, Popular, then one per group; none empty", async ({ page }) => {
    await openDiscover(page);
    const t = await titles(page);
    expect(t.slice(0, 2)).toEqual(["Near you", "Popular"]);
    const groups = t.slice(2);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups).toEqual(GROUP_TITLES.filter((g) => groups.includes(g))); // in the groups' own order
    for (const sec of await page.locator("[data-mv2='discover-row']").all()) {
      expect(await sec.locator("[data-mv2='explore-card']").count()).toBeGreaterThan(0);
    }
    await expect(rowOf(page, "popular").locator("[data-mv2='discover-hint']")).toHaveText("Busy this month with events or news, in fair turns");
    // Near you is closest first: the distances never go down along the row
    const km = await rowOf(page, "near").locator("[data-mv2='card-meta']").allTextContents();
    const metres = km.map((s) => (/Under 100 m/.test(s) ? 0 : /([\d.]+) km/.test(s) ? Number(RegExp.$1) * 1000 : Number((/(\d+) m/.exec(s) || [])[1])));
    for (let i = 1; i < metres.length; i++) expect(metres[i]).toBeGreaterThanOrEqual(metres[i - 1]);
  });

  test("a real sideways swipe scrolls one row and it snaps to a card; a vertical swipe from a card scrolls the page", async ({ page }) => {
    await openDiscover(page);
    const cdp = await touchSession(page);
    const list = listOf(page, "near");
    const box = (await list.boundingBox())!;
    const y = box.y + box.height / 2;
    await swipe(cdp, { x: 300, y }, 0, { dx: -170, ms: 300, steps: 12 });
    await expect.poll(() => scrollLeftOf(list), { timeout: 4000 }).toBeGreaterThan(40);
    await page.waitForTimeout(700); // the snap settles
    // snapped: some card starts exactly at the row's gutter (16 px)
    const lefts = await list.locator("[data-mv2='hrow-item']").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(lefts.some((l) => Math.abs(l - 16) <= 2), lefts.join(",")).toBe(true);
    // only that row moved
    expect(await scrollLeftOf(listOf(page, "popular"))).toBe(0);
    // a vertical swipe that starts on a card scrolls the page, not the row
    const before = await scrollLeftOf(list);
    await swipe(cdp, { x: 120, y }, -260, { ms: 300, steps: 12 });
    await expect.poll(() => scrollTopOf(page), { timeout: 4000 }).toBeGreaterThan(60);
    expect(Math.abs((await scrollLeftOf(list)) - before)).toBeLessThanOrEqual(2);
  });

  test("the pills filter every row: Events keeps only events, a group keeps its own row; the chosen one is gold", async ({ page }) => {
    const seed = await openDiscover(page);
    const pills = page.locator("[data-mv2='discover'] [data-mv2='pill']");
    await expect(pills).toHaveText(["All", "Churches & worship", "Events", "Business", "Serve & care", "Culture & fun", "Learn & grow", "Audiences"]);
    for (const h of await pills.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");

    const events = page.getByRole("button", { name: "Events", exact: true });
    await events.tap();
    await expect(events).toHaveAttribute("aria-pressed", "true");
    await expect(events).toHaveCSS("background-color", "rgb(242, 189, 34)");
    const eventIds = new Set(seed.events.map((e) => e.id));
    const shown = await page.locator("[data-explore-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-explore-id")!));
    expect(shown.length).toBeGreaterThan(0);
    for (const id of shown) expect(eventIds.has(id), id).toBe(true);

    const worship = page.getByRole("button", { name: "Churches & worship" });
    await worship.tap();
    await expect(worship).toHaveAttribute("aria-pressed", "true");
    const t = await titles(page);
    expect(t.filter((x) => GROUP_TITLES.includes(x))).toEqual(["Churches & worship"]);
    for (const c of await page.locator("[data-mv2='explore-card'] [data-mv2='card2']").all()) await expect(c).toHaveAttribute("data-cat", "worship");
  });

  test("every card shows its category in its group colour (chip and top edge, never the gold), with the distance in km", async ({ page }) => {
    await openDiscover(page);
    const cards = page.locator("[data-mv2='explore-card'] [data-mv2='card2']");
    const n = await cards.count();
    expect(n).toBeGreaterThan(6);
    let coloured = 0;
    for (let i = 0; i < n; i += 3) {
      const c = cards.nth(i);
      const cat = await c.getAttribute("data-cat");
      const [edge, chip, label] = await c.evaluate((e) => {
        const ch = e.querySelector("[data-mv2='card-chip']")!;
        return [getComputedStyle(e).borderTopColor, getComputedStyle(ch).borderTopColor, ch.textContent || ""];
      });
      // a listing with a category carries its group's colour; one with none (a Contributor that never chose one)
      // names its kind instead, on a neutral edge. Either way the words are there and the edge is never the gold.
      if (cat) {
        expect(cat).toMatch(/^(worship|serve|culture|learn|audiences|business)$/);
        coloured += 1;
      }
      expect(label.trim().length, "a category or kind label").toBeGreaterThan(0);
      expect(edge).toBe(chip);
      expect(edge).not.toBe("rgb(242, 189, 34)");
      await expect(c).toContainText(/\d+(\.\d)? km|\d+ m|Under 100 m/);
    }
    expect(coloured).toBeGreaterThan(2);
    // every card in a group's own row is in that group's colour
    for (const sec of await page.locator("[data-mv2='discover-row'][data-cat]").all()) {
      const g = await sec.getAttribute("data-cat");
      for (const c of await sec.locator("[data-mv2='card2']").all()) await expect(c).toHaveAttribute("data-cat", g!);
    }
    await expect(page$(page)).not.toContainText(/\bmiles?\b|\bmi\b/);
    const b = (await cards.first().boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(260);
  });

  test("a card opens that listing's full page at once; Back brings the page back exactly where it was", async ({ page }) => {
    await openDiscover(page);
    await scroller(page).evaluate((e) => { e.scrollTop = 220; });
    const second = rowOf(page, "popular");
    await second.scrollIntoViewIfNeeded();
    await listOf(page, "popular").evaluate((e) => { e.scrollLeft = 300; });
    await page.waitForTimeout(700);
    const top = await scrollTopOf(page);
    const left = await scrollLeftOf(listOf(page, "popular"));
    expect(left).toBeGreaterThan(100);
    // the card in view at the row's start
    const card = await listOf(page, "popular").locator("[data-mv2='hrow-item']").evaluateAll((els) => {
      const i = els.findIndex((e) => e.getBoundingClientRect().left >= 0);
      return i;
    });
    const target = listOf(page, "popular").locator("[data-mv2='hrow-item']").nth(card).locator("[data-mv2='card2']");
    const id = await target.evaluate((e) => e.closest("[data-explore-id]")!.getAttribute("data-explore-id"));
    await target.tap();
    expect(id).toBeTruthy();
    // founder, 2026-10-30: no summary sheet, the listing's own page (an event, a place or a Contributor's profile)
    await expect(page).toHaveURL(/\/(e|p|c)\/[^/]+$|\/me$/);
    await expect(sheet(page)).toHaveCount(0);
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/explore$/);
    expect(await scrollTopOf(page)).toBe(top);
    expect(await scrollLeftOf(listOf(page, "popular"))).toBe(left);
  });

  test("leaving the page and coming Back restores the pill and every scroll", async ({ page }) => {
    await network(page);
    await openMap(page, "/", 8);
    await page.locator("[data-mv2='explore']").getByRole("button", { name: "See all listings" }).tap();
    await expect.poll(() => page.locator("[data-mv2='discover-row']").count(), { timeout: 20_000 }).toBeGreaterThan(2);
    await page.getByRole("button", { name: "Events", exact: true }).tap();
    await listOf(page, "near").evaluate((e) => { e.scrollLeft = 280; });
    await scroller(page).evaluate((e) => { e.scrollTop = 150; });
    await page.waitForTimeout(700); // the positions are written once the scrolling stops
    const top = await scrollTopOf(page);
    const left = await scrollLeftOf(listOf(page, "near"));
    await toggle(page).tap();
    await nav(page).getByRole("button", { name: "Home" }).tap();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await page.goBack();
    await expect(page$(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => scrollTopOf(page)).toBe(top);
    await expect.poll(() => scrollLeftOf(listOf(page, "near"))).toBe(left);
    // a fresh visit starts at the top, on All
    await toggle(page).tap();
    await nav(page).getByRole("button", { name: "Home" }).tap();
    await toggle(page).tap();
    await nav(page).getByRole("button", { name: "Explore" }).tap();
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await scrollTopOf(page)).toBe(0);
  });

  test("reduced motion: pills and rows move with no animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDiscover(page);
    await expect(page.locator("[data-mv2='discover'] [data-mv2='pill']").first()).toHaveCSS("transition-duration", "0s");
  });
});

test.describe("on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the sidebar keeps Kingdom Exploration at /discover; See all opens the Discover page", async ({ page }) => {
    await network(page);
    await openMap(page, "/", 8);
    await page.locator("[data-mv2='explore']").getByRole("button", { name: "See all listings" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page$(page)).toBeVisible();
    await page.locator("aside").getByRole("button", { name: "Kingdom Exploration" }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
  });
});

// The screenshots for the pull request. Off unless DISCOVER_SHOTS_DIR is set (docs/discover-page/ is where they are kept).
test.describe("screenshots (DISCOVER_SHOTS_DIR)", () => {
  const dir = process.env.DISCOVER_SHOTS_DIR;
  test.skip(!dir, "set DISCOVER_SHOTS_DIR to write the screenshots");
  for (const look of ["light", "dark"] as const) {
    test(`375 x 812, ${look}`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: look, baseURL });
      const page = await ctx.newPage();
      await openDiscover(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/discover-375-${look}.png` });
      await listOf(page, "near").evaluate((e) => { e.scrollLeft = 296; });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/row-scrolled-375-${look}.png` });
      await page.getByRole("button", { name: "Serve & care" }).tap();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/pill-375-${look}.png` });
      await ctx.close();
    });
  }
});
