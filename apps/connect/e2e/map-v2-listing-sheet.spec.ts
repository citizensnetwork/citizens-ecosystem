import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, openListing, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";
import { touchSession, swipe, tapTouch, type Pt } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Issue #210 part 2: the expanded listing sheet. An Explore card opens the sheet at FULL with a header of
//  cover, name, category chip (group colour) and distance; then Events, News, Gallery (only those with content);
//  a sideways swipe switches tab, a swipe on the News row scrolls the row; X, a swipe down or Back returns to
//  the Explore row with the card still outlined and focused. Hermetic, clock frozen, real touch through CDP.
//  Set LISTING_SHOTS_DIR to also write the PR screenshots (docs/listing-sheet/ is where they are kept).
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; physical_longitude: number; physical_latitude: number; full_name: string; cover_photo_urls: unknown };
type Seed = MapSeed & { contributors: C[] };
type Post = { id: string; contributor_id: string; title: string; body: string; image_url: string | null; post_date: string; created_at: string };

const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
const head = (page: Page) => sheet(page).locator("[data-mv2='xhead']");
const explore = (page: Page) => page.locator("[data-mv2='explore']");
const cardOf = (page: Page, id: string) => explore(page).locator(`[data-explore-id="${id}"]`);
const tabNames = (page: Page) => sheet(page).getByRole("tab").allInnerTexts();
const selectedTab = (page: Page) => sheet(page).locator("[role='tab'][aria-selected='true']").innerText();
const newsRow = (page: Page) => sheet(page).locator("[data-mv2='panel'] [data-mv2='hrow'] [data-layout='row']");

type MapHook = { jumpTo: (o: object, d: object) => void };
const jump = (page: Page, lng: number, lat: number) =>
  page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [lng, lat]);

/** The app reads news_posts with the anon client: a stand-in client answers that table and nothing else. */
async function installNews(page: Page, posts: Post[]) {
  await page.addInitScript((rows) => {
    const chain = (table: string): unknown =>
      new Proxy(function () {}, {
        get: (_t, p) => (p === "then" ? (res: (v: unknown) => void) => res({ data: table === "news_posts" ? rows : [], error: null }) : () => chain(table)),
        apply: () => chain(table),
      });
    (window as unknown as { CC_SUPABASE: unknown }).CC_SUPABASE = {
      from: chain,
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
    };
  }, posts);
}
const postsFor = (contributorId: string, n: number): Post[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${contributorId.slice(-2)}${i}`,
    contributor_id: contributorId,
    title: `Update ${i + 1}`,
    body: "A short note for the fixture.",
    image_url: null,
    post_date: "2026-10-09",
    created_at: new Date(FIXED_NOW - (i + 1) * 3_600_000).toISOString(),
  }));

/**
 * Contributor 0 hosts Fixture Gathering 1 (Events), has 6 posts (News) and gallery photos (Gallery), and a cover;
 * Contributor 2 has posts only, no cover. The seed's own cover URL is same-origin, so the app's CSP lets it draw.
 */
async function setUp(page: Page, baseURL: string, o: { gallery?: number } = {}) {
  const seed = smallSeed(FIXED_NOW) as Seed;
  seed.contributors[0].cover_photo_urls = [{ url: `${baseURL}/fixture-img/200.svg`, caption: "" }];
  await installNews(page, [...postsFor(seed.contributors[0].id, 6), ...postsFor(seed.contributors[2].id, 2)]);
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: o.gallery ?? 6 });
  await openMap(page, "/?map=v2", 8);
  return seed;
}

/** Open a listing the #210 way (pin outlines the card, the card opens the sheet) and wait for it to settle at full. */
async function openCard(page: Page, c: C, how: "click" | "tap" = "click") {
  await jump(page, c.physical_longitude, c.physical_latitude);
  await openListing(page, c.id, how);
  await expect(sheet(page)).toHaveAttribute("data-expanded", "");
  await expect.poll(() => sheet(page).evaluate((e) => Math.round(e.getBoundingClientRect().top)), { timeout: 3000 })
    .toBeLessThan(await page.evaluate(() => window.innerHeight * 0.2));
}

const centreOf = async (page: Page, sel: string): Promise<Pt> => {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test.describe("#210 the expanded listing sheet (375 x 812, touch)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("a card opens the sheet at full, higher than half: cover, name, the group-coloured chip and km", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    const c = seed.contributors[0];
    await jump(page, c.physical_longitude, c.physical_latitude);
    await openListing(page, c.id);
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");
    await expect(sheet(page)).toHaveAttribute("data-expanded", "");
    const h = await page.evaluate(() => window.innerHeight);
    await expect.poll(() => sheet(page).evaluate((e) => e.getBoundingClientRect().top), { timeout: 3000 }).toBeLessThan(h * 0.54 - 100);

    // cover: the seed's photo, 16:9, at the top of the content
    const cover = head(page).locator("[data-mv2='card-media'][data-cover]");
    await expect(cover.locator("img")).toHaveAttribute("src", /fixture-img\/200\.svg$/);
    const box = (await cover.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
    await expect(head(page).locator("[data-mv2='name']")).toHaveText("Fixture Fellowship 1");

    // the chip is the card's: same words, the group's dot and outline (--cat-<group>)
    const chip = head(page).locator("[data-mv2='card-chip']");
    const cardChip = cardOf(page, c.id).locator("[data-mv2='card-chip-label']");
    await expect(chip.locator("[data-mv2='card-chip-label']")).toHaveText(await cardChip.innerText());
    const group = await head(page).getAttribute("data-cat");
    expect(group).toBeTruthy();
    const colours = await chip.evaluate((el, g) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--cat-${g})`;
      el.appendChild(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return { dot: getComputedStyle(el.querySelector("[data-mv2='card-dot']")!).backgroundColor, edge: getComputedStyle(el).borderTopColor, want };
    }, group);
    expect(colours.dot).toBe(colours.want);
    expect(colours.edge).toBe(colours.want);

    // km, in the row's own words (nobody shared a position: measured from the map centre)
    await expect(head(page).locator("[data-mv2='distance']")).toHaveText(/^(Under 100 m|\d+ m|\d+(\.\d)? km) from the map centre$/);
  });

  test("the distance on the sheet is the one on the card", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    const c = seed.contributors[1];
    await jump(page, seed.contributors[0].physical_longitude, seed.contributors[0].physical_latitude);
    await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).dispatchEvent("click");
    const meta = cardOf(page, c.id).locator("[data-mv2='row-meta']").first();
    await expect(meta).toHaveText(/from the map centre$/);
    // the map settles, the row ranks again; then the card itself is pressed (a second pin press would deselect it)
    let last = "";
    await expect.poll(async () => { const now = await meta.innerText(); const still = now === last; last = now; return still; }, { intervals: [300] }).toBe(true);
    const onCard = last;
    await cardOf(page, c.id).locator("[data-mv2='card2']").click();
    await expect(head(page).locator("[data-mv2='distance']")).toHaveText(onCard);
  });

  test("a listing without a cover gets the neutral tile with its category icon", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    await openCard(page, seed.contributors[2]);
    const tile = head(page).locator("[data-mv2='card-media'][data-tile]");
    await expect(tile).toBeVisible();
    await expect(tile.locator("svg")).toHaveCount(1);
    await expect(tile).toHaveAttribute("aria-hidden", "true");
  });

  test("tabs are exactly the ones with content, in the order Events, News, Gallery; only News shows only News", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!, { gallery: 0 });
    await openCard(page, seed.contributors[2]);
    await expect.poll(() => tabNames(page)).toEqual(["News"]);
    await page.getByRole("button", { name: "Close details" }).click();
    await expect(sheet(page)).toHaveCount(0);

    await openCard(page, seed.contributors[0]);
    // the cover counts as a photo, so the Gallery tab is there even with an empty gallery
    await expect.poll(() => tabNames(page)).toEqual(["Events", "News", "Gallery"]);
  });

  test("the first item of the default tab is in view as the sheet opens", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    for (const [c, sel] of [
      [seed.contributors[0], "[data-mv2='panel'] li"],
      [seed.contributors[2], "[data-mv2='panel'] [data-mv2='hrow-item']"],
    ] as const) {
      await openCard(page, c);
      const first = sheet(page).locator(sel).first();
      await expect(first).toBeVisible();
      const b = (await first.boundingBox())!;
      const h = await page.evaluate(() => window.innerHeight);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(h);
      expect(await sheet(page).locator("[data-mv2='scroller']").evaluate((e) => e.scrollTop)).toBe(0);
      await page.getByRole("button", { name: "Close details" }).click();
      await expect(sheet(page)).toHaveCount(0);
    }
  });

  test("real touch: a sideways swipe switches tab, a swipe on the News row scrolls the row, a tap on a tab switches", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    await openCard(page, seed.contributors[0], "tap");
    await expect.poll(() => tabNames(page)).toEqual(["Events", "News", "Gallery"]);
    const cdp = await touchSession(page);
    expect(await selectedTab(page)).toBe("Events");

    // finger to the left on the Events list: the next tab
    const onList = await centreOf(page, "[data-mv2='panel'] li");
    await swipe(cdp, { x: 300, y: onList.y }, 0, { dx: -200, steps: 10, ms: 200 });
    await expect.poll(() => selectedTab(page)).toBe("News");
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");

    // on the News row the same swipe is the row's: it scrolls, the tab stays
    await expect(newsRow(page)).toBeVisible();
    const onRow = await centreOf(page, "[data-mv2='panel'] [data-mv2='hrow-item']");
    await swipe(cdp, { x: 320, y: onRow.y }, 0, { dx: -220, steps: 10, ms: 200 });
    await expect.poll(() => newsRow(page).evaluate((e) => e.scrollLeft), { timeout: 3000 }).toBeGreaterThan(50);
    // let the row's momentum settle on its card edge (a tap during a fling only stops the fling)
    let x = -1;
    await expect.poll(async () => { const now = await newsRow(page).evaluate((e) => e.scrollLeft); const still = now === x; x = now; return still; }, { intervals: [250] }).toBe(true);
    expect(await selectedTab(page)).toBe("News");

    // a tap on Gallery
    await tapTouch(cdp, await centreOf(page, "[role='tab']:has-text('Gallery')"));
    await expect.poll(() => selectedTab(page)).toBe("Gallery");

    // finger to the right on the grid: back one tab (no wrap past the first)
    const onGrid = await centreOf(page, "[data-mv2='panel'] [data-mv2='grid']");
    await swipe(cdp, { x: 60, y: onGrid.y }, 0, { dx: 220, steps: 10, ms: 200 });
    await expect.poll(() => selectedTab(page)).toBe("News");
    await expect(page.locator("[data-mv2='viewer']")).toHaveCount(0); // the swipe opened no photo
    await expect(sheet(page)).toBeVisible();
  });

  test("X closes to the Explore row: the card is still outlined and has focus", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    const c = seed.contributors[0];
    await openCard(page, c, "tap");
    await page.getByRole("button", { name: "Close details" }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(explore(page)).toBeVisible();
    await expect(cardOf(page, c.id)).toHaveAttribute("data-selected", "");
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-explore-id]")?.getAttribute("data-explore-id"))).toBe(c.id);
  });

  test("a swipe down at the top closes to the Explore row; a short one springs back", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    const c = seed.contributors[0];
    await openCard(page, c, "tap");
    const cdp = await touchSession(page);
    const top = () => sheet(page).evaluate((e) => Math.round(e.getBoundingClientRect().top));
    const rest = await top();

    // 60 px, slowly: not far enough (a quarter of the sheet), back to full
    const onCover = await centreOf(page, "[data-mv2='xhead'] [data-mv2='card-media']");
    await swipe(cdp, onCover, 60, { steps: 12, ms: 600 });
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");
    await expect.poll(top, { timeout: 3000 }).toBe(rest);

    // from the cover (content at its top: the scroll hand-off), a long way down
    await swipe(cdp, onCover, 320, { steps: 16, ms: 640 });
    await expect(sheet(page)).toHaveCount(0);
    await expect(cardOf(page, c.id)).toHaveAttribute("data-selected", "");
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-explore-id]")?.getAttribute("data-explore-id"))).toBe(c.id);
  });

  test("a swipe up on the content scrolls it; the sheet does not move", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!, { gallery: 30 });
    await openCard(page, seed.contributors[0], "tap");
    const cdp = await touchSession(page);
    const scroller = sheet(page).locator("[data-mv2='scroller']");
    await swipe(cdp, await centreOf(page, "[data-mv2='xhead'] [data-mv2='name']"), -300, { steps: 12, ms: 300 });
    await expect.poll(() => scroller.evaluate((e) => e.scrollTop), { timeout: 3000 }).toBeGreaterThan(100);
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");
  });

  test("Back closes it to the row; it added exactly one history entry", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    const c = seed.contributors[0];
    await jump(page, c.physical_longitude, c.physical_latitude);
    const before = await page.evaluate(() => history.length);
    await openListing(page, c.id);
    await expect(sheet(page)).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await page.getByRole("tab", { name: "News" }).click();
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    await expect(explore(page)).toBeVisible();
    await expect(cardOf(page, c.id)).toHaveAttribute("data-selected", "");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("keyboard: Enter on the card opens it, the arrows move between tabs, Escape returns focus to the card", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    const c = seed.contributors[0];
    await jump(page, c.physical_longitude, c.physical_latitude);
    await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).dispatchEvent("click");
    await cardOf(page, c.id).locator("[data-mv2='card2']").focus();
    await page.keyboard.press("Enter");
    await expect(sheet(page)).toHaveAttribute("data-expanded", "");
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-mv2"))).toBe("name");
    await page.getByRole("tab", { name: "Events" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedTab(page)).toBe("News");
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-explore-id]")?.getAttribute("data-explore-id"))).toBe(c.id);
  });

  test("every control in the header bar and the tab bar is at least 44 px", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    await openCard(page, seed.contributors[0]);
    await expect.poll(() => tabNames(page)).toEqual(["Events", "News", "Gallery"]);
    const sizes = await sheet(page).locator("[data-mv2='xbar'] button, [role='tab']").evaluateAll((els) =>
      els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    expect(sizes.length).toBe(4);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(44);
  });

  test("reduced motion: the sheet and a newly chosen tab's panel arrive at once", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const seed = await setUp(page, baseURL!);
    await openCard(page, seed.contributors[0]);
    await page.getByRole("tab", { name: "News" }).click();
    const panel = sheet(page).locator("[data-mv2='panel']");
    await expect(panel).toHaveAttribute("data-enter", "next");
    expect(await panel.evaluate((e) => getComputedStyle(e).animationDuration)).toBe("0s");
    expect(await sheet(page).evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
  });
});

test.describe("#210 the clean map keeps the half sheet", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("on the nav's Map a pin still opens the sheet at half, with the avatar header and the handle", async ({ page, baseURL }) => {
    const seed = await setUp(page, baseURL!);
    const c = seed.contributors[0];
    await page.evaluate(() => (window as unknown as { __cc: { go: (p: string, q: object) => void } }).__cc.go("home", { view: "map" }));
    await expect(explore(page)).toHaveCount(0);
    await jump(page, c.physical_longitude, c.physical_latitude);
    await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).click({ force: true });
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    await expect(sheet(page)).not.toHaveAttribute("data-expanded", "");
    await expect(sheet(page).locator("[data-mv2='handle']")).toBeVisible();
    await expect(sheet(page).locator("[data-mv2='xhead']")).toHaveCount(0);
    await expect.poll(() => tabNames(page)).toEqual(["Events", "News", "Gallery"]);
  });
});

// ────────────────────────────────────────────────────────────────────
// The screenshots for the pull request. Off unless LISTING_SHOTS_DIR is set.
test.describe("screenshots (LISTING_SHOTS_DIR)", () => {
  const dir = process.env.LISTING_SHOTS_DIR;
  test.skip(!dir, "set LISTING_SHOTS_DIR to write the screenshots");

  for (const look of ["light", "dark"] as const) {
    test(`375 px, ${look}`, async ({ browser, baseURL }) => {
      const ctx: BrowserContext = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: look, baseURL });
      const page = await ctx.newPage();
      const seed = await setUp(page, baseURL!);
      await openCard(page, seed.contributors[0], "tap");
      await expect.poll(() => tabNames(page)).toEqual(["Events", "News", "Gallery"]);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/open-events-375-${look}.png` });
      const cdp = await touchSession(page);
      const onList = await centreOf(page, "[data-mv2='panel'] li");
      await swipe(cdp, { x: 300, y: onList.y }, 0, { dx: -200, steps: 10, ms: 200 });
      await expect.poll(() => selectedTab(page)).toBe("News");
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/after-swipe-news-375-${look}.png` });
      await page.getByRole("tab", { name: "Gallery" }).tap();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/gallery-375-${look}.png` });
      await page.getByRole("button", { name: "Close details" }).tap();
      await expect(sheet(page)).toHaveCount(0);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/closed-row-375-${look}.png` });
      await openCard(page, seed.contributors[2], "tap");
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/news-only-no-cover-375-${look}.png` });
      await ctx.close();
    });
  }
});
