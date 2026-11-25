import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";
import { touchSession, tapTouch } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Phone hierarchy (QA 2026-11-25, CCQA-0008; founder decisions of 2026-11-25):
//    · Where to…: the first tap on a card chooses it AND shows its quick details under the row (the map holds still),
//      the second zooms in to its pin, the third opens the full drawer; the details' own button opens the drawer at once.
//    · The Explore hero is a slim band on a phone, so results show above the fold.
//    · A long page title wraps instead of being cut, and the page's action takes its own row at 400 px or less.
// ════════════════════════════════════════════════════════════════════

type Seed = Parameters<typeof mockMapNetwork>[1];
const panel = (page: Page) => page.locator("[data-mv2='explore']");
const row = (page: Page) => panel(page).locator("[data-row='tile']").first();
const details = (page: Page) => panel(page).locator("[data-mv2='xdetails']");
type MapHook = { getZoom(): number; isMoving(): boolean };
const zoom = (page: Page) => page.evaluate(() => (window as unknown as { __ccMap: MapHook }).__ccMap.getZoom());
const still = (page: Page) => page.waitForFunction(() => !(window as unknown as { __ccMap: MapHook }).__ccMap.isMoving());

test.describe("Where to… quick details (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function openShop(page: Page) {
    await mockMapNetwork(page, makeSeed({ contributors: 10, places: 40, events: 20, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed);
    await openMap(page, "/", 5);
    await page.locator("[data-mv2='explore-nudge']").click();
    await page.getByRole("button", { name: "Shop", exact: true }).click();
    await expect(panel(page)).toHaveAttribute("data-mode", "focus");
    await page.waitForTimeout(500);
  }

  test("1st tap: chosen + details, map still; 2nd tap: zoom in; the details' button opens the full drawer", async ({ page }) => {
    await openShop(page);
    const cdp = await touchSession(page);
    const card = row(page).locator("[data-mv2='xcard']").nth(1);
    const title = ((await card.locator("b").first().textContent()) || "").trim();
    await expect(details(page)).toHaveCount(0);
    await still(page);
    const before = await zoom(page);

    const b = (await card.boundingBox())!;
    await tapTouch(cdp, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    await expect(card).toHaveAttribute("data-selected", "");
    await expect(details(page)).toBeVisible();
    await expect(details(page).locator("[data-mv2='xdetails-title']")).toHaveText(title);
    await expect(details(page).getByRole("button", { name: "View full details" })).toBeVisible();
    await still(page);
    expect(Math.abs((await zoom(page)) - before)).toBeLessThan(0.05); // the map held its distance

    // the chosen card glides to the middle of its row first: tap it where it comes to rest
    const id = (await card.getAttribute("data-explore-id"))!;
    await expect.poll(() => row(page).evaluate((el, cid) => {
      const k = (el.querySelector(`[data-explore-id="${cid}"]`) as HTMLElement).getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return Math.abs(k.left + k.width / 2 - (r.left + r.width / 2));
    }, id), { timeout: 3000 }).toBeLessThan(4);
    const c = (await card.boundingBox())!;
    await tapTouch(cdp, { x: c.x + c.width / 2, y: c.y + c.height / 2 });
    await expect.poll(() => zoom(page), { timeout: 5000 }).toBeGreaterThan(before + 1);
    await expect(details(page)).toBeVisible();

    await details(page).getByRole("button", { name: "View full details" }).click();
    await expect(page.locator("[data-mv2='pinpeek']:not([hidden])")).toBeVisible();
  });
});

test.describe("phone hierarchy", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the Explore hero is a slim band on a phone, and the first results are above the fold", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/", 1);
    await page.evaluate(() => (window as unknown as { __cc: { go: (p: string) => void } }).__cc.go("explore"));
    const hero = page.locator("[data-screen='explore'] .explore-hero");
    await expect(hero).toBeVisible();
    const h = (await hero.boundingBox())!.height;
    expect(h).toBeLessThanOrEqual(140);
    const firstTile = page.locator("[data-screen='explore'] .photo-tile").first();
    if (await firstTile.count()) {
      const t = (await firstTile.boundingBox())!;
      expect(t.y).toBeLessThan(844);
    }
  });

  for (const width of [360, 390]) {
    test(`a long page title wraps instead of being cut at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockMapNetwork(page);
      await openMap(page, "/", 1);
      await page.evaluate(() => (window as unknown as { __cc: { go: (p: string) => void } }).__cc.go("community"));
      const header = page.locator("[data-cc='page-header']").first();
      await expect(header).toBeVisible();
      const cut = await header.locator("h2").evaluate((el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth);
      expect(cut).toBe(false);
      const action = header.locator("[data-cc='page-header-action']");
      if (await action.count()) {
        const a = (await action.boundingBox())!;
        const t = (await header.locator("h2").boundingBox())!;
        expect(a.y).toBeGreaterThanOrEqual(t.y + t.height - 1); // its own row, under the title
      }
    });
  }
});
