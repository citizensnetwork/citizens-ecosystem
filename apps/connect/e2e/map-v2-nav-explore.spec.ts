import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";
import { touchSession, swipe, flickTouch } from "./support/touch";

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
// A phone (founder, 2026-11-25): no rail; the crown floats top-left (home and reset), and the nav stands where the crown
// stood, over a nudge that shows Where to…
const topCrown = (page: Page) => page.locator(".cn-phone-crown-btn");
const nudge = (page: Page) => page.locator("[data-mv2='explore-nudge']");
const dock = (page: Page) => page.locator("[data-mv2='explore-dock']");
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

  test("rests on the nav over the nudge, the gold-ringed crown top-left, and a Search button top-right; no rail", async ({ page }) => {
    await open(page);
    await expect(crown(page)).toHaveCount(0);
    await expect(page.locator(".cn-rail")).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await expect(dock(page)).toBeVisible();
    await expect(dock(page)).toHaveAttribute("data-rest", "");
    await expect(dock(page).locator("[data-nav]")).toHaveCount(4);
    const d = (await dock(page).boundingBox())!;
    const n = (await nudge(page).boundingBox())!;
    expect(n.y).toBeGreaterThanOrEqual(d.y + d.height - 2);
    expect(844 - (n.y + n.height)).toBeLessThan(16);
    expect(await settled(page)).toBeLessThanOrEqual(0);
    await expect(page.locator("[data-mv2='nav-toggle']")).toHaveCount(0);
    await expect(page.locator("button.gold-gradient")).toHaveCount(0);
    // no person button on the map home: its actions are in Me
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(0);
    // the search bar is folded into its button until it is tapped
    await expect(page.locator("[data-mv2='home-search']")).toHaveCount(0);
    const box = (await topCrown(page).boundingBox())!;
    expect(box.x).toBeLessThan(20);
    expect(box.y).toBeLessThan(30);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeLessThan(56);
    // the map keeps the crown alone: the Citizens · Connect words are for the other screens
    await expect(page.locator(".cn-phone-word")).toHaveCount(0);
    const border = await page.locator(".cn-phone-crown").evaluate((e) => getComputedStyle(e).borderTopColor);
    const [r, g, b] = border.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(150);
    expect(b).toBeLessThan(90);

    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Search events, places, people…" })).toBeFocused();
    await page.getByRole("button", { name: "Close search" }).click();
    await expect(page.locator("[data-mv2='home-search']")).toHaveCount(0);
  });

  test("the nudge shows only the Where to… tiles under a bare handle; the nav rides above them; Map hides them", async ({ page }) => {
    await open(page);
    await nudge(page).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    expect(await settled(page)).toBe(152);
    await expect(page.getByRole("button", { name: "Coffee", exact: true })).toBeVisible();
    // strip lead above the tiles (founder, 2026-11-22); no old "Explore" / count / "Near you" line
    await expect(sheet(page).getByRole("heading", { name: "Where Christians…" })).toBeVisible();
    await expect(sheet(page).getByText(/near you/i)).toHaveCount(0);
    await expect(page.locator("[data-mv2='explore-handle']")).toBeVisible();
    // the nav rides just above the strip, and the nudge has gone
    await expect(nudge(page)).toHaveCount(0);
    await page.waitForTimeout(400);
    const c = (await dock(page).boundingBox())!;
    expect(844 - (c.y + c.height)).toBeGreaterThan(152);
    await dock(page).locator("[data-nav='map']").click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await expect(nudge(page)).toBeVisible();
  });

  test("a tile settles the panel at one height: tabs, its cards, the town around it, glowing pins and a chip", async ({ page }) => {
    await open(page);
    await nudge(page).click();
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
    // openMap leaves us at suburb zoom; Where-to keeps zoom when already ≥ town (founder, 2026-11-23).
    expect(Math.round(await zoom(page))).toBeGreaterThanOrEqual(11);
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
    await nudge(page).click();
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

  test("with a filter on, the top-left crown clears it and comes back to rest", async ({ page }) => {
    await open(page);
    await nudge(page).click();
    await page.getByRole("button", { name: "Coffee", exact: true }).click();
    await expect(page.locator("[data-mv2='filter-chip']")).toBeVisible();
    await topCrown(page).click();
    await expect(page.locator("[data-mv2='filter-chip']")).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await expect(page.locator(".mv2-pin[data-match]")).toHaveCount(0);
  });

  test("the handle opens every row and the nav glides to the foot; Me, then the crown, comes home", async ({ page }) => {
    await open(page);
    await nudge(page).click();
    await page.getByRole("button", { name: "Show all rows" }).click();
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    await expect(dock(page)).toBeVisible();
    await expect(dock(page)).not.toHaveAttribute("data-ride", "");
    await dock(page).locator("[data-nav='me']").click();
    await expect(page.locator(".me-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Messages" })).toBeVisible();
    // off the map: the same nav, and the crown with its words
    await expect(page.locator(".cn-phone-dock [data-nav='me']")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".cn-phone-word")).toBeVisible();
    await topCrown(page).click();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await nudge(page).click();
    await page.getByRole("button", { name: "Show all rows" }).click();

    await page.getByRole("button", { name: "Near & now" }).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "focus");
    await expect(page.getByRole("tab", { name: "Near & now" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-mv2='filter-chip']")).toContainText("Near & now");

    // Clear the filter (grab would only minimize while a chip is on), then open every row again.
    await page.locator("[data-mv2='filter-chip-x']").click();
    await expect(page.locator("[data-mv2='filter-chip']")).toHaveCount(0);
    await page.getByRole("button", { name: "Show all rows" }).click();
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    await page.getByRole("button", { name: "Explore more" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.locator("[data-screen='explore']")).toBeVisible();
  });

  test("Map in the nav goes back to rest, over the nudge", async ({ page }) => {
    await open(page);
    await nudge(page).click();
    await page.getByRole("button", { name: "Show all rows" }).click();
    await dock(page).locator("[data-nav='map']").click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await expect(nudge(page)).toBeVisible();
    await expect(dock(page)).toHaveAttribute("data-rest", "");
  });

  test("Do opens Let's… and Kingdom Projects from the nav", async ({ page }) => {
    await open(page);
    await dock(page).locator("[data-nav='do']").click();
    await page.getByRole("menuitem", { name: "Kingdom Projects" }).click();
    await expect(page.locator(".cn-phone-dock [data-nav='do']")).toHaveAttribute("aria-current", "page");
  });
});

test.describe("strokes, pulls and the province lift on a phone (founder, 2026-11-25)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mode = (page: Page) => sheet(page).getAttribute("data-mode");
  const centreOf = async (page: Page, sel: string) => {
    const b = (await page.locator(sel).first().boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  test("a stroke up on the nav or under it steps the panel up; a stroke down steps it back; a tap is still a tap", async ({ page }) => {
    await open(page);
    const cdp = await touchSession(page);
    await swipe(cdp, await centreOf(page, "[data-mv2='explore-nudge']"), -90);
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    await page.waitForTimeout(400);
    await swipe(cdp, await centreOf(page, "[data-mv2='explore-dock'] [data-nav='map']"), -90);
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    // the stroke did not press Map (which would have lowered it again)
    await page.waitForTimeout(300);
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    await page.getByRole("button", { name: "Lower panel" }).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    await page.waitForTimeout(400);
    await swipe(cdp, await centreOf(page, "[data-mv2='explore-dock'] [data-nav='explore']"), 90);
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
    await expect(page).not.toHaveURL(/\/explore$/);
  });

  test("the open panel follows a finger pulled down from the top of its rows; a flick lowers it; a scrolled panel scrolls", async ({ page }) => {
    await open(page);
    await nudge(page).click();
    await page.getByRole("button", { name: "Show all rows" }).click();
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    await page.waitForTimeout(500);
    const cdp = await touchSession(page);
    const scroll = page.locator("[data-mv2='explore-scroll']");
    const box = (await scroll.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + 140 };
    // scrolled down: the same stroke scrolls the rows back, and the panel stays open
    await scroll.evaluate((e) => { e.scrollTop = 300; });
    await swipe(cdp, at, 120);
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    await scroll.evaluate((e) => { e.scrollTop = 0; });
    // at the top: the panel moves with the finger while it is held
    const top0 = (await sheet(page).boundingBox())!.y;
    await swipe(cdp, at, 70, { hold: true });
    const held = (await sheet(page).boundingBox())!.y;
    expect(held - top0).toBeGreaterThan(50);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] } as never);
    // a short slow pull springs back
    await expect(sheet(page)).toHaveAttribute("data-open", "");
    // a flick lowers it
    await page.waitForTimeout(400);
    await flickTouch(cdp, at, 60);
    await expect(sheet(page)).not.toHaveAttribute("data-open", "");
  });

  test("coming in from the country view to province scale lifts Where to…; it stays as the map zooms in; empty map folds it", async ({ page }) => {
    await open(page);
    expect(await mode(page)).toBe("rest");
    const jump = (z: number) => page.evaluate((zoom) => {
      const m = (window as unknown as { __ccMap: { getCenter(): { lng: number; lat: number }; jumpTo(o: object, d: object): void } }).__ccMap;
      const c = m.getCenter();
      m.jumpTo({ center: [c.lng, c.lat], zoom }, { originalEvent: {} });
    }, z);
    await jump(5);
    await expect(page.locator("[data-zoom-hint='none']")).toBeVisible();
    expect(await mode(page)).toBe("rest");
    await jump(8.5);
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    await jump(12.5);
    await page.waitForTimeout(300);
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    // a tap on bare map (no pin under it) folds it
    const spot = await page.evaluate(() => {
      for (let y = 140; y < 520; y += 20) for (let x = 40; x < 350; x += 30) {
        const el = document.elementFromPoint(x, y);
        if (el && el.classList.contains("maplibregl-canvas")) return { x, y };
      }
      return null;
    });
    expect(spot).not.toBeNull();
    await page.mouse.click(spot!.x, spot!.y);
    await expect(sheet(page)).toHaveAttribute("data-mode", "rest");
  });

  test("in a focus row, the chosen card comes to the middle: by a card tap and by a pin tap", async ({ page }) => {
    await open(page);
    await nudge(page).click();
    await page.getByRole("button", { name: "Show all rows" }).click();
    await page.getByRole("button", { name: "Near & now" }).click();
    await expect(sheet(page)).toHaveAttribute("data-mode", "focus");
    const row = page.locator("[data-mv2='explore'] [data-mv2='xrow']").first();
    const cards = row.locator("[data-mv2='xcard']");
    expect(await cards.count()).toBeGreaterThan(4);
    const centred = (id: string) => row.evaluate((el, cid) => {
      // the card's middle against the row's middle
      const card = (el.querySelector(`[data-explore-id="${cid}"]`) as HTMLElement).getBoundingClientRect();
      const row = el.getBoundingClientRect();
      return Math.abs(card.left + card.width / 2 - (row.left + row.width / 2));
    }, id);
    const third = cards.nth(3);
    const id3 = (await third.getAttribute("data-explore-id"))!;
    await third.click();
    await expect(third).toHaveAttribute("data-selected", "");
    await expect.poll(() => centred(id3), { timeout: 3_000 }).toBeLessThan(4);
    const id1 = (await cards.nth(1).getAttribute("data-explore-id"))!;
    // press the pin itself (it may sit under the panel on a small screen)
    await page.locator(`.maplibregl-marker[data-cc-id="${id1}"]`).evaluate((el) => (el as HTMLElement).click());
    await expect(cards.nth(1)).toHaveAttribute("data-selected", "");
    await expect.poll(() => centred(id1), { timeout: 3_000 }).toBeLessThan(4);
  });
});

test.describe("Me on a phone (founder, 2026-11-25)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one column that fits the screen, and a Me / Calendar switch with a month calendar", async ({ page }) => {
    await open(page);
    await dock(page).locator("[data-nav='me']").click();
    await expect(page.locator(".me-page")).toBeVisible();
    const fits = await page.locator(".connect-scroll").evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
    expect(fits).toBe(true);
    // the crown has a band of its own: the cover starts under it with the same space below as above, and the page
    // scrolls below the band, so nothing ever slides beneath the crown (founder, 2026-11-25)
    const crownBox = (await page.locator(".cn-phone-crown").boundingBox())!;
    const cover = (await page.locator(".me-page .cn-cover").boundingBox())!;
    expect(Math.round(cover.y - (crownBox.y + crownBox.height))).toBe(Math.round(crownBox.y));
    const scroller = (await page.locator(".connect-scroll").boundingBox())!;
    expect(scroller.y).toBeGreaterThanOrEqual(crownBox.y + crownBox.height);
    // the calendar card is behind the switch, not squeezed beside the profile
    await expect(page.locator(".me-calendar")).toBeHidden();
    const tiles = page.locator(".me-space-links button");
    const first = (await tiles.first().boundingBox())!;
    const last = (await tiles.last().boundingBox())!;
    expect(Math.abs(first.y - last.y)).toBeLessThan(2);
    expect(last.x + last.width).toBeLessThanOrEqual(390);

    await page.getByRole("tab", { name: "Calendar" }).click();
    await expect(page.locator(".me-space-links")).toBeHidden();
    await expect(page.locator(".mc-cal-month")).toHaveCount(12);
    await expect(page.locator(".mc-cal-month h3").first()).toHaveText("October");
    await expect(page.locator(".mc-cal-day[aria-current='date']")).toHaveAttribute("data-day", "2026-10-10");
    await page.getByRole("tab", { name: "Me" }).click();
    await expect(page.locator(".me-space-links")).toBeVisible();
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the nav sits beside the search bar, the crown's width, with no Do or Central; the sheet stays centred", async ({ page }) => {
    await open(page);
    await expect(page.locator(".cn-rail")).toHaveAttribute("data-open", "false");
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("[data-mv2='nav-toggle']")).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-mode", "strip");
    const rail = (await page.locator(".cn-rail").boundingBox())!;
    const mark = (await page.locator(".cn-rail-brand").boundingBox())!;
    expect(rail.width).toBeLessThan(80);
    expect(mark.x).toBeGreaterThanOrEqual(rail.x - 2);
    expect(mark.x + mark.width).toBeLessThanOrEqual(rail.x + rail.width + 8);
    await expect(page.locator("[data-rail-item]")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(0);

    await page.locator("[data-rail-item='me']").click();
    await expect(page.locator(".me-page")).toBeVisible();
    await expect(page.locator(".cn-rail")).toHaveAttribute("data-open", "true");

    await page.locator("[data-rail-item='map']").click();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Search events, places, people…" })).toBeFocused();

    await page.locator("[data-rail-item='explore']").click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.locator("[data-screen='explore']")).toBeVisible();
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
