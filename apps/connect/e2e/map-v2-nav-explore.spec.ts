import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";

// Pack 08 and the founder's adjustments of 2026-11-17: the crown, the Explore panel's four looks (rest, strip, focus,
// open), the filter chip, the Search button where the account button was, the nav beside the search bar on a wide
// screen, and the pin mix on the live map. The folding nav remains on every screen that is not the map home.

type Row = Record<string, unknown> & { id: string };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 6, places: 6, events: 4, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed;

async function open(page: Page) {
  const seed = seedOf();
  await mockMapNetwork(page, seed);
  await openMap(page, "/", 5);
  return seed;
}

const crown = (page: Page) => page.locator("[data-mv2='explore-crown']");
const sheet = (page: Page) => page.locator("[data-mv2='explore']");
const zoom = (page: Page) => page.evaluate(() => (window as unknown as { __ccMap: { getZoom(): number } }).__ccMap.getZoom());
/** How much of the panel is on screen (it slides by transform, so its box runs past the bottom edge). */
const shown = (page: Page) => sheet(page).evaluate((e) => Math.round(window.innerHeight - e.getBoundingClientRect().top));
/** Wait until the panel stops moving (its slide is a transform transition). */
async function settled(page: Page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const now = await shown(page);
    if (now === last) return now;
    last = now;
    await page.waitForTimeout(60);
  }
  return last;
}
async function mapIdle(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as unknown as { __ccMap: { isMoving(): boolean; isZooming(): boolean } }).__ccMap;
    return !m.isMoving() && !m.isZooming();
  });
}

test.describe("the map home on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("rests on the gold-ringed crown alone, with a Search button where the account button was", async ({ page }) => {
    await open(page);
    await expect(crown(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    expect(await settled(page)).toBeLessThanOrEqual(0);
    await expect(page.locator("[data-mv2='nav-toggle']")).toHaveCount(0);
    await expect(page.locator("button.gold-gradient")).toHaveCount(0);
    // no person button on the map home: its actions are in Me
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(0);
    // the search bar is folded into its button until it is tapped
    await expect(page.locator("[data-mv2='home-search']")).toHaveCount(0);
    const box = (await crown(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(48);
    expect(box.width).toBeLessThan(56);
    const border = await crown(page).evaluate((e) => getComputedStyle(e).borderTopColor);
    const [r, g, b] = border.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(150);
    expect(b).toBeLessThan(90);

    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Search events, places, people…" })).toBeFocused();
    await page.getByRole("button", { name: "Close search" }).click();
    await expect(page.locator("[data-mv2='home-search']")).toHaveCount(0);
  });

  test("the crown shows only the Where to… tiles under a bare handle, and hides them again", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    expect(await settled(page)).toBe(124);
    await expect(page.getByRole("button", { name: "Coffee", exact: true })).toBeVisible();
    // no "Explore", "Where to…", "Near you" or count line: only the handle above the tiles
    await expect(sheet(page).getByRole("heading")).toHaveCount(0);
    await expect(sheet(page).getByText(/near you/i)).toHaveCount(0);
    await expect(page.locator("[data-mv2='explore-handle']")).toBeVisible();
    // the crown rides just above the strip
    const c = (await crown(page).boundingBox())!;
    expect(844 - (c.y + c.height)).toBeGreaterThan(124);
    await crown(page).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
  });

  test("a tile settles the panel at one height: tabs, its cards, the town around it, glowing pins and a chip", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await page.getByRole("button", { name: "Coffee", exact: true }).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "focus");
    const height = await settled(page);
    expect(height).toBeGreaterThan(240);
    expect(height).toBeLessThan(360);
    const tab = page.getByRole("tab", { name: "Coffee" });
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const plate = await tab.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(plate).not.toMatch(/212,\s*175,\s*55|242,\s*189,\s*34/);
    await mapIdle(page);
    expect(Math.round(await zoom(page))).toBe(11);
    // the chip at the top says what is on, in the filter's colour, and clears it
    const chip = page.locator("[data-mv2='filter-chip']");
    await expect(chip).toContainText("Coffee");
    // every pin inside the filter glows
    await expect(page.locator(".mv2-pin[data-match]").first()).toBeAttached();

    // other tabs and card taps never move the panel
    await page.getByRole("tab", { name: "Market" }).click();
    expect(await settled(page)).toBe(height);
    await page.getByRole("tab", { name: "Worship" }).click();
    expect(await settled(page)).toBe(height);
    // Focus chrome Back (Close) is plain words, not a plate
    const reset = page.locator("[data-mv2='xfocus-back']");
    await expect(reset).toBeVisible();
    const look = await reset.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderTopWidth }));
    expect(look.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(look.border).toBe("0px");
    await chip.getByRole("button", { name: /^Clear / }).click();
    await expect(chip).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
  });

  test("a card's first tap glows its pin 25% above the middle; the second opens its preview", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await page.getByRole("button", { name: "Market", exact: true }).click();
    const height = await settled(page);
    const card = page.locator("[data-row='tile'] [data-mv2='xcard']").first();
    const id = await card.getAttribute("data-explore-id");
    await card.click();
    await expect(card).toHaveAttribute("data-selected", "");
    await expect(page.locator("[data-mv2='sheet']")).toHaveCount(0);
    expect(await settled(page)).toBe(height);
    await mapIdle(page);
    await expect(page.locator(`[data-cc-id='${id}'] .mv2-pin.is-lit`)).toBeAttached();
    const point = await page.evaluate((pid) => {
      const m = (window as unknown as { __ccMap: { getContainer(): HTMLElement } }).__ccMap;
      const el = document.querySelector(`[data-cc-id='${pid}']`) as HTMLElement;
      const rect = m.getContainer().getBoundingClientRect();
      const pin = el.getBoundingClientRect();
      return { pinY: pin.bottom - rect.top, h: rect.height };
    }, id);
    // an event pin hangs from its point (its bottom edge); a place's sits on it: either way within 6% of the height
    expect(Math.abs(point.pinY - point.h * 0.25)).toBeLessThan(point.h * 0.06);
    await card.click();
    await expect(page.locator("[data-mv2='sheet']")).toBeVisible();
  });

  test("with a filter on, the crown clears it and comes back to rest", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await page.getByRole("button", { name: "Coffee", exact: true }).click();
    await expect(page.locator("[data-mv2='filter-chip']")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("[data-mv2='filter-chip']")).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await expect(page.locator(".mv2-pin[data-match]")).toHaveCount(0);
  });

  test("the handle opens every row; a row's title takes it over; the sticky nav is Explore, Map, Me", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await page.getByRole("button", { name: "Show all rows" }).click();
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    await expect(crown(page)).toHaveCount(0);
    const dock = page.locator("[data-mv2='explore-dock']");
    await expect(dock.locator("[data-nav]")).toHaveText(["Explore", "Map", "Me"]);
    await expect(page.locator("[data-nav='do'], [data-nav='central']")).toHaveCount(0);

    await dock.locator("[data-nav='me']").click();
    await expect(page.getByRole("button", { name: "View Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await dock.locator("[data-nav='me']").click();
    await expect(page.getByRole("button", { name: "View Profile" })).toHaveCount(0);

    await page.getByRole("button", { name: "Near & now" }).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "focus");
    await expect(page.getByRole("tab", { name: "Near & now" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-mv2='filter-chip']")).toContainText("Near & now");

    await page.getByRole("button", { name: "Show all rows" }).click();
    await page.getByRole("button", { name: "Explore more" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.locator("[data-screen='explore']")).toBeVisible();
  });

  test("Map in the sticky nav goes back to the crown", async ({ page }) => {
    await open(page);
    await crown(page).click();
    await page.getByRole("button", { name: "Show all rows" }).click();
    await page.locator("[data-mv2='explore-dock'] [data-nav='map']").click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await expect(crown(page)).toBeVisible();
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the nav sits beside the search bar, the crown's width, with no Do or Central; the sheet stays centred", async ({ page }) => {
    await open(page);
    await expect(page.locator("[data-mv2='desktop-nav']")).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("[data-mv2='nav-toggle']")).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    const crownBox = (await page.locator("[data-mv2='desktop-crown']").boundingBox())!;
    const items = (await page.locator("[data-mv2='desktop-items']").boundingBox())!;
    const search = (await page.locator("[data-mv2='home-search']").boundingBox())!;
    expect(Math.round(items.width)).toBe(Math.round(crownBox.width));
    expect(crownBox.y).toBeLessThan(20);
    expect(search.x).toBeGreaterThan(crownBox.x + crownBox.width);
    // the bar's middle is level with the crown's
    expect(Math.abs(search.y + search.height / 2 - (crownBox.y + crownBox.height / 2))).toBeLessThan(4);
    const radius = await page.locator("[data-mv2='desktop-items']").evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius));
    expect(radius).toBeGreaterThanOrEqual(crownBox.width / 2);
    await expect(page.locator("[data-mv2='desktop-item']")).toHaveText(["Map", "Explore", "Me"]);
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(0);

    await page.locator("[data-mv2='desktop-item'][data-nav='me']").click();
    await expect(page.getByRole("button", { name: "View Profile" })).toBeVisible();
    await page.locator("[data-mv2='desktop-item'][data-nav='me']").click();

    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Search events, places, people…" })).toBeFocused();

    await page.locator("[data-mv2='desktop-item'][data-nav='explore']").click();
    const box = (await sheet(page).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(724);
    expect(box.width).toBeGreaterThan(480);
  });
});

test.describe("pin mix", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("events wear the disc, places wear the filled circle, and contributors are not pinned", async ({ page }) => {
    await open(page);
    await expect(page.locator(".mv2-pin--event [data-mv2='disc']").first()).toBeAttached();
    await expect(page.locator(".mv2-pin--event [data-mv2='tail']").first()).toBeAttached();
    await expect(page.locator("[data-cc-pin='place']").first()).toBeAttached();
    await expect(page.locator(".mv2-pin--place [data-mv2='ink']")).toHaveCount(0);
    await expect(page.locator("[data-cc-pin='contributor']")).toHaveCount(0);
    const ring = await page.locator(".mv2-pin--event [data-mv2='disc']").first().evaluate((e) => parseFloat(getComputedStyle(e).borderTopWidth));
    const placeRing = await page.locator("[data-cc-pin='place'] [data-mv2='shape']").first().evaluate((e) => parseFloat(getComputedStyle(e).strokeWidth));
    expect(ring).toBeGreaterThan(2);
    expect(ring).toBeLessThan(4);
    expect(placeRing).toBeGreaterThan(0.5);
    expect(placeRing).toBeLessThan(2);
  });
});
