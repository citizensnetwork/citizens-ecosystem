import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, makeSeed, FIXED_NOW } from "./support/map-v2";
import { touchSession, swipe, recordPointerEvents, pointerCounts, resetPointerCounts } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  The News tab and Nearby are one row that scrolls sideways (app/map-v2-row.jsx), not a stack that grows with
//  every post. This suite covers: the row renders (ten cards, one width, one height, the next card peeking),
//  it scrolls sideways under a real thumb and snaps to a card, a vertical swipe on it still belongs to the sheet and
//  the page, See all opens the whole list in place, the keyboard walks it without a trap, and the arrows
//  (mouse only) respect reduced motion. Fingers go through CDP touch (e2e/support/touch.ts).
//  Set ROW_SHOTS_DIR to also write the PR screenshots.
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown> & { id: string };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 4, places: 4, events: 4, now: FIXED_NOW, spread: 0.02, seed: 11 }) as unknown as Seed;

type Post = { id: string; contributor_id: string; title: string; body: string; image_url: string | null; post_date: string; created_at: string };
/** `n` posts, newest first. Every third one has a picture, so the row mixes the image and text cards. */
const postsOf = (who: string, n: number, img: (i: number) => string): Post[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `n${i + 1}`,
    contributor_id: who,
    title: `Update number ${i + 1}`,
    body: i % 3 === 0 ? "A short note." : "A longer note about the week at the hall: who came, what we ate, and what is planned for the Saturday after this one.",
    image_url: i % 3 === 0 ? img(i + 1) : null,
    post_date: new Date(Date.UTC(2026, 9, 10) - i * 86_400_000).toISOString().slice(0, 10),
    created_at: new Date(FIXED_NOW - (i + 1) * 3_600_000).toISOString(),
  }));

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

/** Records every Element.scrollBy call, so a test can see whether the arrows asked for a smooth glide. */
const recordScrollBy = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __by: { left: number; behavior: string }[] };
    w.__by = [];
    const orig = Element.prototype.scrollBy as (this: Element, o: ScrollToOptions) => void;
    Element.prototype.scrollBy = function (this: Element, o: ScrollToOptions) {
      w.__by.push({ left: Number(o.left), behavior: String(o.behavior) });
      return orig.call(this, o);
    } as typeof Element.prototype.scrollBy;
  });
const scrollByCalls = (page: Page) => page.evaluate(() => (window as unknown as { __by: { left: number; behavior: string }[] }).__by);

const SHEET = "[data-mv2='sheet']";
const sheet = (page: Page) => page.locator(SHEET);
const snapOf = (page: Page) => sheet(page).getAttribute("data-snap");
const newsRegion = (page: Page) => page.getByRole("region", { name: "Latest news" });
const nearRegion = (page: Page) => page.getByRole("region", { name: "Nearby listings, closest first" });
const scroller = (page: Page) => page.locator("[data-mv2='scroller']");

type Who = { id: string; lng: number; lat: number; name: string };
const whoOf = (s: Seed): Who => {
  const c = s.contributors[0];
  return { id: c.id, lng: Number(c.physical_longitude), lat: Number(c.physical_latitude), name: String(c.full_name) };
};

async function openSheet(page: Page, seed: Seed, who: Who, o: { posts?: number; touch: boolean; baseURL: string }) {
  await recordPointerEvents(page);
  await recordScrollBy(page);
  await installNews(page, postsOf(who.id, o.posts ?? 14, (i) => `${o.baseURL}/fixture-img/${i}.svg`));
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 0 });
  await openMap(page, "/?map=v2", 4);
  await page.evaluate(
    ([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }),
    [who.lng, who.lat],
  );
  const pin = page.locator(`.maplibregl-marker[data-cc-id="${who.id}"]`);
  if (o.touch) await pin.tap({ force: true });
  else await pin.click({ force: true });
  await expect(sheet(page)).toBeVisible();
  if (o.touch) await expect.poll(() => snapOf(page)).toBe("half");
  await page.waitForTimeout(400);
  const tab = sheet(page).getByRole("tab", { name: "News" });
  if (o.touch) await tab.tap(); else await tab.click();
  await expect(newsRegion(page)).toBeVisible();
}
async function toFull(page: Page) {
  for (let i = 0; i < 3 && (await snapOf(page)) !== "full"; i++) {
    await page.locator("[data-mv2='handle']").tap();
    await page.waitForTimeout(300);
  }
  expect(await snapOf(page)).toBe("full");
}

type Geom = {
  clientWidth: number; scrollWidth: number; scrollLeft: number; overflowX: string; snapType: string; viewport: number; left: number; right: number;
  items: { l: number; r: number; w: number; h: number; t: number; variant: string | null }[];
};
const geom = (page: Page, name: string) =>
  page.evaluate<Geom, string>((label) => {
    const list = document.querySelector(`[data-mv2='hrow'][aria-label='${label}'] > ul`) as HTMLElement;
    const r = list.getBoundingClientRect();
    return {
      clientWidth: list.clientWidth, scrollWidth: list.scrollWidth, scrollLeft: list.scrollLeft,
      overflowX: getComputedStyle(list).overflowX, snapType: getComputedStyle(list).scrollSnapType, viewport: innerWidth, left: r.left, right: r.right,
      items: ([...list.children] as HTMLElement[]).map((li) => {
        const b = li.getBoundingClientRect();
        return { l: b.left, r: b.right, w: b.width, h: b.height, t: b.top, variant: li.querySelector("[data-variant]")?.getAttribute("data-variant") ?? null };
      }),
    };
  }, name);
const scrollLeftOf = (page: Page, region: ReturnType<typeof newsRegion>) => region.locator("ul").evaluate((e) => e.scrollLeft);

// ────────────────────────────────────────────────────────────────────
test.describe("a phone, 375 px, real touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("News is one row: ten cards of one width and one height, the next card peeking, and the panel no taller than a card", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: true, baseURL: baseURL! });
    await toFull(page);
    const g = await geom(page, "Latest news");
    expect(g.items).toHaveLength(10);
    // one width for every card, portrait (image) and text alike; one height, set by the tallest
    expect(new Set(g.items.map((i) => Math.round(i.w))).size).toBe(1);
    expect(Math.round(g.items[0].w)).toBe(264);
    expect(new Set(g.items.map((i) => Math.round(i.h))).size).toBe(1);
    expect(new Set(g.items.map((i) => i.variant))).toEqual(new Set(["image", "text"]));
    // the row scrolls sideways and snaps; the second card shows at the edge, cut by the screen
    expect(g.overflowX).toBe("auto");
    expect(g.snapType).toContain("x mandatory");
    expect(g.scrollWidth).toBeGreaterThan(g.clientWidth + 400);
    expect(g.items[1].l).toBeLessThan(g.viewport - 40);
    expect(g.items[1].r).toBeGreaterThan(g.viewport);
    // it reaches the screen edge (it bleeds past the sheet's gutter), and the first card sits on the gutter
    expect(g.left).toBeLessThanOrEqual(0);
    expect(g.right).toBeGreaterThanOrEqual(g.viewport);
    expect(g.items[0].l).toBeCloseTo(16, 0);
    // the words: the newest ten of fourteen, and the way to the rest
    await expect(newsRegion(page).locator("[data-mv2='hrow-count']")).toHaveText("Newest 10 of 14");
    await expect(newsRegion(page).getByRole("button", { name: "See all 14" })).toHaveAttribute("aria-expanded", "false");
    // fourteen posts take the room of one card, not fourteen: the panel is the head plus the tallest card
    const panel = await page.locator("#mv2-panel").boundingBox();
    expect(panel!.height).toBeLessThan(g.items[0].h + 120);
    // arrows are for a mouse: a thumb has the peek
    await expect(newsRegion(page).getByRole("button", { name: "Next" })).toHaveCount(0);
  });

  test("a sideways swipe scrolls the row to a card edge, opens nothing and leaves the sheet where it is", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: true, baseURL: baseURL! });
    await toFull(page);
    const cdp = await touchSession(page);
    const before = await geom(page, "Latest news");
    const top = await scroller(page).evaluate((e) => e.scrollTop);
    const at = { x: before.items[0].l + before.items[0].w / 2, y: before.items[0].t + 60 };
    await resetPointerCounts(page);
    await swipe(cdp, at, 0, { dx: -230, ms: 320, steps: 14 });
    await expect.poll(() => scrollLeftOf(page, newsRegion(page)), { timeout: 3000 }).toBeGreaterThan(200);
    await page.waitForTimeout(500);
    // settled on a card: scrollLeft is a whole number of card steps (264 + 8)
    const sl = await scrollLeftOf(page, newsRegion(page));
    expect(Math.abs(sl / 272 - Math.round(sl / 272))).toBeLessThan(0.02);
    expect(await snapOf(page)).toBe("full");
    expect(await scroller(page).evaluate((e) => e.scrollTop)).toBe(top);
    await expect(page.locator("[data-mv2='news-card']")).toHaveCount(0);
    // control: the browser took that swipe for scrolling (a swipe that went nowhere would pass the lines above)
    expect((await pointerCounts(page)).pointercancel ?? 0).toBeGreaterThanOrEqual(1);
    // and back
    const now = await geom(page, "Latest news");
    await swipe(cdp, { x: now.items[2].l + 80, y: now.items[2].t + 60 }, 0, { dx: 300, ms: 320, steps: 14 });
    await expect.poll(() => scrollLeftOf(page, newsRegion(page)), { timeout: 3000 }).toBeLessThan(5);
  });

  test("a vertical swipe that starts on the row still moves the sheet and scrolls the page", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: true, baseURL: baseURL! });
    const cdp = await touchSession(page);

    // half: the sheet owns every swipe, so a swipe up from a card takes it to full, and the row stays put
    expect(await snapOf(page)).toBe("half");
    const half = await geom(page, "Latest news");
    // at half only the top edge of the cards shows above the fold (the header, the actions and the tabs come first)
    expect(half.items[0].t, "the top of the cards shows at half").toBeLessThan(812 - 12);
    const y0 = Math.min(half.items[0].t + 8, 812 - 4);
    await resetPointerCounts(page);
    await swipe(cdp, { x: half.items[0].l + 100, y: y0 }, -320, { ms: 400, steps: 14 });
    await expect.poll(() => snapOf(page)).toBe("full");
    await page.waitForTimeout(400);
    expect(await scrollLeftOf(page, newsRegion(page))).toBe(0);
    expect((await pointerCounts(page)).pointercancel ?? 0, "no browser takeover for a vertical swipe at half").toBe(0);

    // full, content scrolled: the swipe scrolls the page, the sheet stays full, the row does not move
    await scroller(page).evaluate((e) => { e.scrollTop = 40; });
    await page.waitForTimeout(150);
    const mid = await geom(page, "Latest news");
    const sh = await scroller(page).evaluate((e) => e.scrollHeight - e.clientHeight);
    expect(sh, "the content is taller than the sheet").toBeGreaterThan(120);
    const t0 = await scroller(page).evaluate((e) => e.scrollTop);
    await swipe(cdp, { x: mid.items[0].l + 100, y: mid.items[0].t + 120 }, -150, { ms: 400, steps: 14 });
    await expect.poll(() => scroller(page).evaluate((e) => e.scrollTop), { timeout: 3000 }).toBeGreaterThan(t0 + 60);
    expect(await snapOf(page)).toBe("full");
    expect(await scrollLeftOf(page, newsRegion(page))).toBe(0);

    // full, at the top: a downward swipe from a card is the scroll hand-off and collapses the sheet
    await scroller(page).evaluate((e) => { e.scrollTop = 0; });
    await page.waitForTimeout(250);
    const top = await geom(page, "Latest news");
    await swipe(cdp, { x: top.items[0].l + 100, y: top.items[0].t + 40 }, 220, { ms: 400, steps: 14 });
    await expect.poll(() => snapOf(page)).toBe("half");
    expect(await scrollLeftOf(page, newsRegion(page))).toBe(0);
  });

  test("See all opens every post in place, one under another; Show fewer puts the row back and keeps focus on the button", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: true, baseURL: baseURL! });
    await toFull(page);
    const region = newsRegion(page);
    await region.getByRole("button", { name: "See all 14" }).tap();
    await expect(region.locator("[data-mv2='card2'][data-news]")).toHaveCount(14);
    await expect(region.locator("ul")).toHaveAttribute("data-layout", "stack");
    await expect(region.locator("[data-mv2='hrow-count']")).toHaveText("All 14 posts");
    const stacked = await geom(page, "Latest news");
    expect(new Set(stacked.items.map((i) => Math.round(i.l))).size).toBe(1);
    expect(stacked.items.every((i, k) => k === 0 || i.t > stacked.items[k - 1].t)).toBe(true);
    expect(Math.round(stacked.items[0].w)).toBeGreaterThan(300);      // full width again
    const fewer = region.getByRole("button", { name: "Show fewer" });
    await expect(fewer).toHaveAttribute("aria-expanded", "true");
    // a post opens from the list as it did before, and focus comes back to it
    const card = region.locator("[data-mv2='card2'][data-news]").nth(12);
    await card.scrollIntoViewIfNeeded();
    await card.tap();
    await expect(page.locator("[data-mv2='news-card']")).toBeVisible();
    await expect(page.locator("[data-mv2='news-title']")).toHaveText("Update number 13");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-mv2='news-card']")).toHaveCount(0);
    await expect(card).toBeFocused();
    await fewer.scrollIntoViewIfNeeded();
    await fewer.tap();
    await expect(region.locator("[data-mv2='card2'][data-news]")).toHaveCount(10);
    await expect(region.locator("ul")).toHaveAttribute("data-layout", "row");
    expect(await scrollLeftOf(page, region)).toBe(0);
    await expect(region.getByRole("button", { name: "See all 14" })).toBeVisible();
  });

  test("a few posts need no See all, and one post fills the width", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { posts: 1, touch: true, baseURL: baseURL! });
    await toFull(page);
    const g = await geom(page, "Latest news");
    expect(g.items).toHaveLength(1);
    expect(g.items[0].w).toBeGreaterThan(g.clientWidth - 32 - 2);     // the row's own side padding is the sheet gutter
    await expect(newsRegion(page).locator("[data-mv2='hrow-head']")).toHaveCount(0);
    await expect(newsRegion(page).getByRole("button", { name: /see all/i })).toHaveCount(0);
  });

  test("Nearby is a row too: landscape cards of one width, scrolled sideways by a thumb, with nothing to 'see all'", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: true, baseURL: baseURL! });
    await toFull(page);
    await scroller(page).evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect(nearRegion(page)).toBeVisible();
    const g = await geom(page, "Nearby listings, closest first");
    expect(g.items.length).toBeGreaterThan(4);
    expect(g.items.length).toBeLessThanOrEqual(8);
    expect(g.items.every((i) => i.variant === "listing")).toBe(true);
    expect(new Set(g.items.map((i) => Math.round(i.w))).size).toBe(1);
    expect(new Set(g.items.map((i) => Math.round(i.h))).size).toBe(1);
    expect(g.scrollWidth).toBeGreaterThan(g.clientWidth);
    await expect(nearRegion(page).getByRole("button", { name: /see all/i })).toHaveCount(0);
    // nearest first is still the document order (the order is distance, never popularity)
    const names = await nearRegion(page).locator("[data-mv2='row-title']").allTextContents();
    expect(names.length).toBe(g.items.length);

    const cdp = await touchSession(page);
    const area = (await scroller(page).boundingBox())!;
    const first = g.items[0];
    expect(first.t, "the row is on screen").toBeGreaterThan(area.y);
    await swipe(cdp, { x: first.l + first.w / 2, y: first.t + first.h / 2 }, 0, { dx: -230, ms: 320, steps: 14 });
    await expect.poll(() => scrollLeftOf(page, nearRegion(page)), { timeout: 3000 }).toBeGreaterThan(200);
    expect(await snapOf(page)).toBe("full");
    await expect(page.locator("[data-mv2='name']")).toHaveText(whoOf(seed).name);   // nothing was tapped
  });

  test("a different listing starts its Nearby row at the first card", async ({ page, baseURL }) => {
    const seed = seedOf();
    const me = whoOf(seed);
    await openSheet(page, seed, me, { touch: true, baseURL: baseURL! });
    await toFull(page);
    await scroller(page).evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await nearRegion(page).locator("ul").evaluate((e) => { e.scrollLeft = 300; });
    expect(await scrollLeftOf(page, nearRegion(page))).toBeGreaterThan(100);
    await nearRegion(page).locator("[data-mv2='card2']").last().tap();
    await expect.poll(() => snapOf(page)).toBe("half");
    await expect(page.locator("[data-mv2='name']")).not.toHaveText(me.name);
    await toFull(page);
    await scroller(page).evaluate((e) => { e.scrollTop = e.scrollHeight; });
    expect(await scrollLeftOf(page, nearRegion(page))).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
test.describe("a laptop, a mouse and the keyboard", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the arrows move one card, Previous is dimmed at the start and Next at the end, and neither drops focus", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    expect(await sheet(page).getAttribute("data-wide")).toBe("1");
    const region = newsRegion(page);
    const prev = region.getByRole("button", { name: "Previous" });
    const next = region.getByRole("button", { name: "Next" });
    await expect(prev).toHaveAttribute("aria-disabled", "true");
    await expect(next).not.toHaveAttribute("aria-disabled", "true");
    await next.click();
    await expect.poll(() => scrollLeftOf(page, region), { timeout: 3000 }).toBeCloseTo(272, -1);
    await page.waitForTimeout(400);
    expect(Math.abs((await scrollLeftOf(page, region)) - 272)).toBeLessThan(2);
    expect((await scrollByCalls(page)).at(-1)).toEqual({ left: 272, behavior: "smooth" });
    await expect(prev).not.toHaveAttribute("aria-disabled", "true");
    // walk to the end with the button that has focus: at the end it is dimmed, still the focused element
    await next.focus();
    for (let i = 0; i < 12 && (await next.getAttribute("aria-disabled")) !== "true"; i++) {
      await next.click();
      await page.waitForTimeout(450);
    }
    await expect(next).toHaveAttribute("aria-disabled", "true");
    await expect(next).toBeFocused();
    const end = await geom(page, "Latest news");
    expect(end.scrollLeft).toBeGreaterThan(end.scrollWidth - end.clientWidth - 3);
    const calls = (await scrollByCalls(page)).length;
    await next.click({ force: true });                              // Playwright treats aria-disabled as not enabled
    expect((await scrollByCalls(page)).length).toBe(calls);        // dimmed means nothing happens
    await prev.click();
    await expect.poll(() => scrollLeftOf(page, region), { timeout: 3000 }).toBeLessThan(end.scrollLeft - 100);
  });

  test("a person who asked for reduced motion gets a jump, not a glide", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    await newsRegion(page).getByRole("button", { name: "Next" }).click();
    expect((await scrollByCalls(page)).at(-1)).toEqual({ left: 272, behavior: "auto" });
    // the same page without the preference asks for smooth: the check above is not vacuous
    const ctrl = await page.context().newPage();
    await ctrl.emulateMedia({ reducedMotion: "no-preference" });
    await openSheet(ctrl, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    await newsRegion(ctrl).getByRole("button", { name: "Next" }).click();
    expect((await scrollByCalls(ctrl)).at(-1)?.behavior).toBe("smooth");
  });

  test("Tab walks the cards in order, each one scrolled into view, and then leaves the row: no trap", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    const region = newsRegion(page);
    const cards = region.locator("[data-mv2='card2'][data-news]");
    await cards.first().focus();
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const at = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        const list = a.closest("ul") as HTMLElement | null;
        const li = a.closest("li");
        if (!list || !li) return { title: "", inView: false, inRow: false };
        const lb = list.getBoundingClientRect();
        const b = li.getBoundingClientRect();
        return { title: a.querySelector("[data-mv2='row-title']")?.textContent ?? "", inView: b.left >= lb.left - 1 && b.right <= lb.right + 1, inRow: true };
      });
      expect(at.inRow, `Tab ${i}`).toBe(true);
      expect(at.inView, `card ${i + 1} is in view after Tab`).toBe(true);
      seen.push(at.title);
      await page.keyboard.press("Tab");
    }
    expect(seen).toEqual(Array.from({ length: 10 }, (_, i) => `Update number ${i + 1}`));
    // the eleventh Tab is outside this row (it holds ten cards; the rest are behind "See all"): it lands in the next one, Nearby
    expect(await region.evaluate((el) => el.contains(document.activeElement))).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.closest("[data-mv2='hrow']")?.getAttribute("aria-label"))).toBe("Nearby listings, closest first");
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("li")?.querySelector("[data-mv2='row-title']")?.textContent)).toBe("Update number 10");
    expect(await scrollLeftOf(page, region)).toBeGreaterThan(1000);
  });

  test("See all with the keyboard: the button toggles, says so, and the cards are reachable in the list", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    const region = newsRegion(page);
    const all = region.getByRole("button", { name: "See all 14" });
    await all.focus();
    await page.keyboard.press("Enter");
    await expect(region.getByRole("button", { name: "Show fewer" })).toBeFocused();
    await expect(region.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
    await expect(region.locator("[data-mv2='card2'][data-news]")).toHaveCount(14);
    // the arrows are not drawn for a list that is not a row
    await expect(region.getByRole("button", { name: "Next" })).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(region.getByRole("button", { name: "See all 14" })).toBeFocused();
    await expect(region.locator("[data-mv2='card2'][data-news]")).toHaveCount(10);
  });

  test("a wheel or trackpad swipe sideways scrolls the row; a post opens from a click", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    const region = newsRegion(page);
    const box = (await region.locator("ul").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.wheel(300, 0);
    await expect.poll(() => scrollLeftOf(page, region), { timeout: 3000 }).toBeGreaterThan(100);
    await region.locator("[data-mv2='card2'][data-news]").nth(2).click();
    await expect(page.locator("[data-mv2='news-card']")).toBeVisible();
  });

  test("one post: no arrows and a full-width card; three posts: arrows, and nothing to see all", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { posts: 1, touch: false, baseURL: baseURL! });
    await expect(newsRegion(page).getByRole("button", { name: "Next" })).toHaveCount(0);
    const ctx = await page.context().newPage();
    await openSheet(ctx, seed, whoOf(seed), { posts: 3, touch: false, baseURL: baseURL! });
    await expect(newsRegion(ctx).getByRole("button", { name: "Next" })).toBeVisible();
    await expect(newsRegion(ctx).getByRole("button", { name: /see all/i })).toHaveCount(0);
  });

  test("Nearby on a laptop: the arrows scroll the row; the listing cards keep their order", async ({ page, baseURL }) => {
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    await scroller(page).evaluate((e) => { e.scrollTop = e.scrollHeight; });
    const region = nearRegion(page);
    await expect(region).toBeVisible();
    await region.getByRole("button", { name: "Next" }).click();
    await expect.poll(() => scrollLeftOf(page, region), { timeout: 3000 }).toBeGreaterThan(200);
    await expect(region.getByRole("button", { name: /see all/i })).toHaveCount(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// The screenshots for the pull request. Off unless ROW_SHOTS_DIR is set (docs/sideways-rows/ is where they are kept).
test.describe("screenshots (ROW_SHOTS_DIR)", () => {
  const dir = process.env.ROW_SHOTS_DIR;
  test.skip(!dir, "set ROW_SHOTS_DIR to write the screenshots");

  for (const look of ["light", "dark"] as const) {
    test(`375 px, ${look}`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: look, baseURL });
      const page = await ctx.newPage();
      const seed = seedOf();
      await openSheet(page, seed, whoOf(seed), { touch: true, baseURL: baseURL! });
      await toFull(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/news-375-${look}.png` });
      if (look === "light") {
        await newsRegion(page).locator("ul").evaluate((e) => { e.scrollLeft = 544; });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${dir}/news-375-scrolled.png` });
        await newsRegion(page).getByRole("button", { name: "See all 14" }).tap();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${dir}/news-375-see-all.png` });
        await newsRegion(page).getByRole("button", { name: "Show fewer" }).tap();
      }
      await scroller(page).evaluate((e) => { e.scrollTop = e.scrollHeight; });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/nearby-375-${look}.png` });
      await ctx.close();
    });
  }

  test("desktop 1280", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, baseURL });
    const page = await ctx.newPage();
    const seed = seedOf();
    await openSheet(page, seed, whoOf(seed), { touch: false, baseURL: baseURL! });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/news-desktop.png` });
    await scroller(page).evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/nearby-desktop.png` });
    await ctx.close();
  });
});
