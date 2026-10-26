import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, fixtureImageUrl, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  The News tab (tracker P1-07 / P1-05). The app reads `news_posts` straight
//  from Supabase with the anon client (public SELECT policy), and this suite
//  has no Supabase, so a stand-in client answers that one table: every query
//  chain resolves to the rows below, every other table to an empty list.
// ════════════════════════════════════════════════════════════════════

type Seed = MapSeed & { contributors: { id: string; physical_longitude: number; physical_latitude: number; contributor_slug: string; full_name: string }[] };

type Post = { id: string; contributor_id: string; title: string; body: string | null; image_url: string | null; post_date: string; created_at: string };

const BODY = [
  "Intro paragraph.",
  "",
  "• Item, 06:00–09:00",
  "See the full line-up: https://example.org/line-up.",
  "http://insecure.example/stay stays plain.",
  "javascript:alert(1) stays plain.",
  "**not markdown**",
].join("\n");

// Older notes, so the list is tall enough to scroll under the reader. Closing must not move that scroll.
const filler = (): Partial<Post>[] => Array.from({ length: 8 }, (_, i) => ({
  id: `pad${i}`,
  title: `Extra note ${i + 1}`,
  body: "Padding so the list can scroll.",
  image_url: null,
  post_date: "2026-09-01",
  created_at: new Date(FIXED_NOW - (20 + i) * 86_400_000).toISOString(),
}));

function postsFor(contributorId: string, extra: Partial<Post>[] = []): Post[] {
  const base = (over: Partial<Post>, i: number): Post => ({
    id: over.id || `n${i}`,
    contributor_id: contributorId,
    title: over.title || `Update ${i}`,
    body: over.body === undefined ? "A short note." : over.body,
    image_url: over.image_url === undefined ? null : over.image_url,
    post_date: over.post_date || "2026-10-10",
    created_at: over.created_at || new Date(FIXED_NOW - 3 * 3_600_000).toISOString(),
  });
  return extra.map((over, i) => base(over, i + 1));
}

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

const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
const reader = (page: Page) => page.locator("[data-mv2='news-card']");
const card = (page: Page) => sheet(page).locator("[data-mv2='card2'][data-news]").first();

async function openSheetNews(page: Page, seed: Seed, posts: Post[]) {
  const c = seed.contributors[2];
  await installNews(page, posts);
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 0 });
  await openMap(page, "/?map=v2", 8);
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
  await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).click({ force: true });
  await expect(sheet(page)).toBeVisible();
  // Half clips the list (the scroller does not scroll there). Full shows the card.
  if (await sheet(page).getAttribute("data-wide") !== "1") {
    await sheet(page).locator("[data-mv2='handle']").click();
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");
  }
  return c;
}

test.use({ viewport: { width: 390, height: 844 } });

test("News tab: newest first, with a plain 'posted' time, and the tab appears only because there are posts", async ({ page }) => {
  const seed = smallSeed(FIXED_NOW) as Seed;
  const c = seed.contributors[2]; // no events of its own
  const posts = [
    { id: "n1", contributor_id: c.id, title: "Older update", body: "Last week we cleaned the park.", image_url: null, post_date: "2026-10-03", created_at: new Date(FIXED_NOW - 7 * 86_400_000).toISOString() },
    { id: "n2", contributor_id: c.id, title: "Fresh update", body: "Doors open at nine.", image_url: null, post_date: "2026-10-10", created_at: new Date(FIXED_NOW - 3 * 3_600_000).toISOString() },
  ];
  await page.addInitScript((rows) => {
    const chain = (table: string): unknown =>
      new Proxy(function () {}, {
        get: (_t, p) => (p === "then" ? (res: (v: unknown) => void) => res({ data: table === "news_posts" ? rows : [], error: null }) : () => chain(table)),
        apply: () => chain(table),
      });
    (window as unknown as { CC_SUPABASE: unknown }).CC_SUPABASE = { from: chain, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
  }, posts);
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 0 });
  await openMap(page, "/?map=v2", 8);
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
  await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).click({ force: true });
  const sheet = page.locator("[data-mv2='sheet']");
  await expect(sheet).toBeVisible();

  await expect(sheet.getByRole("tab")).toHaveText(["News"]);
  const titles = await sheet.locator("[data-mv2='card2'][data-news] [data-mv2='row-title']").allTextContents();
  expect(titles).toEqual(["Fresh update", "Older update"]);
  await expect(sheet.locator("[data-mv2='card2'][data-news]").first()).toContainText("3 h ago");
  await expect(sheet.locator("[data-mv2='card2'][data-news]").last()).toContainText("3 Oct");
  await expect(sheet.locator("[data-mv2='post-more']").first()).toHaveText("Read more");
});

const rich = (): Partial<Post>[] => [{
  id: "fresh",
  title: "Fresh update",
  body: BODY,
  image_url: fixtureImageUrl(1),
  post_date: "2026-10-10",
  created_at: new Date(FIXED_NOW - 3 * 3_600_000).toISOString(),
}, {
  id: "older",
  title: "Older update",
  body: "Last week we cleaned the park.",
  image_url: null,
  post_date: "2026-10-03",
  created_at: new Date(FIXED_NOW - 7 * 86_400_000).toISOString(),
}];

const histIdx = (page: Page) => page.evaluate(() => {
  const s = history.state as { idx?: number } | null;
  return s && typeof s.idx === "number" ? s.idx : -1;
});

async function openReader(page: Page) {
  const url = page.url();
  const snap = await sheet(page).getAttribute("data-snap");
  const idx = await histIdx(page);
  await card(page).click();
  await expect(reader(page)).toBeVisible();
  expect(page.url()).toBe(url);
  // Scroll while the reader is open. Closing must put nothing back and take nothing away.
  const scroll = await sheet(page).locator("[data-mv2='scroller']").evaluate((el) => {
    el.scrollTop = 48;
    return el.scrollTop;
  });
  return { snap, scroll, url, idx };
}

async function sheetUnchanged(page: Page, snap: string | null, scroll: number, url: string, idx: number) {
  await expect(reader(page)).toHaveCount(0);
  // A button or Escape close pops its own history entry on the next task. Wait for that
  // before opening the reader again, or the new guard adopts an entry that is about to disappear.
  await expect.poll(() => histIdx(page)).toBe(idx);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page)).toHaveAttribute("data-snap", snap || "");
  await expect(sheet(page).getByRole("tab", { name: "News" })).toHaveAttribute("aria-selected", "true");
  expect(await sheet(page).locator("[data-mv2='scroller']").evaluate((el) => el.scrollTop)).toBe(scroll);
  expect(scroll).toBeGreaterThan(0);
  expect(page.url()).toBe(url);
  await expect(card(page)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  expect(await page.evaluate(() => document.getElementById("root")?.hasAttribute("inert"))).toBe(false);
}

test("tapping a news card opens the reader, and every close leaves the sheet where it was", async ({ page }) => {
  const seed = smallSeed(FIXED_NOW) as Seed;
  const c = seed.contributors[2];
  await openSheetNews(page, seed, postsFor(c.id, rich().concat(filler())));
  await expect(card(page)).toHaveAttribute("aria-haspopup", "dialog");

  const opened = await openReader(page);
  const dialog = reader(page);
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-labelledby", "mv2-news-title");
  await expect(page.locator("#mv2-news-title")).toBeFocused();
  await expect(page.locator("[data-mv2='news-from']")).toHaveText(c.full_name);
  const body = await page.locator("[data-mv2='news-body']").innerText();
  expect(body).toContain("\n\n");
  expect(body).toContain("• Item, 06:00–09:00");
  const link = page.locator("[data-mv2='news-link']");
  await expect(link).toHaveAttribute("href", "https://example.org/line-up");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("rel", /noreferrer/);
  expect(body).toContain("http://insecure.example/stay stays plain.");
  expect(body).toContain("javascript:alert(1) stays plain.");
  expect(body).toContain("**not markdown**");
  await expect(page.locator("[data-mv2='news-body'] a")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  expect(await page.evaluate(() => document.getElementById("root")?.inert)).toBe(true);

  // Tab starts at the title, then the close button, then the link, then wraps.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close news post" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close news post" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();

  // A drag that starts on the scrim must not move the sheet.
  const scrim = page.locator("[data-mv2='news']");
  const box = await scrim.boundingBox();
  if (!box) throw new Error("no scrim");
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 6, box.y + 160, { steps: 6 });
  await page.mouse.up();
  await expect(sheet(page)).toHaveAttribute("data-snap", opened.snap || "");
  await expect(dialog).toBeVisible();

  await page.getByRole("button", { name: "Close news post" }).click();
  await sheetUnchanged(page, opened.snap, opened.scroll, opened.url, opened.idx);

  const again = await openReader(page);
  await page.locator("[data-mv2='news']").click({ position: { x: 4, y: 4 } });
  await sheetUnchanged(page, again.snap, again.scroll, again.url, again.idx);

  const third = await openReader(page);
  await page.keyboard.press("Escape");
  await sheetUnchanged(page, third.snap, third.scroll, third.url, third.idx);

  const fourth = await openReader(page);
  await page.goBack();
  await sheetUnchanged(page, fourth.snap, fourth.scroll, fourth.url, fourth.idx);
});

test.describe("the same reader on the profile page", () => {
  test("opens from a profile news card, which keeps its line breaks in the card", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    const c = seed.contributors[2];
    await installNews(page, postsFor(c.id, rich()));
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 0 });
    await page.goto(`/c/${c.contributor_slug}?map=v2`);
    const profile = page.locator("[data-screen='profile']");
    await expect(profile.getByRole("heading", { level: 1, name: c.full_name })).toBeVisible({ timeout: 15_000 });
    const button = profile.getByRole("button", { name: /Fresh update/ });
    await expect(button).toBeVisible();
    await expect(button.locator("p").last()).toHaveClass(/line-clamp-3/);
    await expect(button.locator("p").last()).toHaveClass(/whitespace-pre-line/);
    await button.click();
    await expect(reader(page)).toBeVisible();
    await expect(page.locator("#mv2-news-title")).toBeFocused();
    const body = await page.locator("[data-mv2='news-body']").innerText();
    expect(body).toContain("\n\n");
    await expect(page.locator("[data-mv2='news-link']")).toHaveAttribute("href", "https://example.org/line-up");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect(reader(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(page.url()).toContain(`/c/${c.contributor_slug}`);
  });
});

test.describe("a wide screen with a fine pointer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the same centred card opens over the side panel", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    const c = seed.contributors[2];
    await openSheetNews(page, seed, postsFor(c.id, rich()));
    await expect(sheet(page)).toHaveAttribute("data-wide", "1");
    await card(page).click();
    await expect(reader(page)).toBeVisible();
    const geom = await page.locator("[data-mv2='news-card']").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: window.innerWidth - r.right, width: r.width };
    });
    expect(Math.abs(geom.left - geom.right)).toBeLessThan(2);
    expect(geom.width).toBeLessThanOrEqual(560);
    await page.keyboard.press("Escape");
    await expect(reader(page)).toHaveCount(0);
    await expect(sheet(page)).toHaveAttribute("data-wide", "1");
    await expect(card(page)).toBeFocused();
  });
});

test.describe("awkward posts at a phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("no image, a broken image, an empty body and a 5,000-character body stay inside the card", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    const c = seed.contributors[2];
    const long = ("Line of the weekly note. ".repeat(250)).slice(0, 5000);
    await page.route("**/broken-news.png", (route) => route.abort());
    await openSheetNews(page, seed, postsFor(c.id, [
      { id: "empty", title: "Empty body", body: "", image_url: null },
      { id: "plain", title: "No picture", body: "Just the words.", image_url: null },
      { id: "broken", title: "Broken picture", body: "The picture failed.", image_url: "http://localhost:3100/broken-news.png" },
      { id: "long", title: "A very long note", body: long, image_url: null },
    ]));

    const openNamed = async (title: string) => {
      await sheet(page).locator("[data-mv2='card2'][data-news]", { hasText: title }).click();
      await expect(reader(page)).toBeVisible();
    };

    await openNamed("Empty body");
    await expect(page.locator("[data-mv2='news-body']")).toHaveCount(0);
    await expect(page.locator("[data-mv2='news-img']")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await openNamed("No picture");
    await expect(page.locator("[data-mv2='news-img']")).toHaveCount(0);
    await expect(page.locator("[data-mv2='news-body']")).toHaveText("Just the words.");
    await page.keyboard.press("Escape");

    await openNamed("Broken picture");
    await expect(page.locator("[data-mv2='news-img']")).toHaveCount(0);
    await expect(page.locator("#mv2-news-title")).toBeVisible();
    await page.keyboard.press("Escape");

    await openNamed("A very long note");
    const fit = await page.evaluate(() => {
      const card = document.querySelector("[data-mv2='news-card']") as HTMLElement;
      const scroll = document.querySelector("[data-mv2='news-scroll']") as HTMLElement;
      const head = document.querySelector("[data-mv2='news-head']") as HTMLElement;
      const cr = card.getBoundingClientRect();
      return {
        cardBottom: cr.bottom,
        view: window.innerHeight,
        scrolls: scroll.scrollHeight > scroll.clientHeight + 1,
        headTop: head.getBoundingClientRect().top,
        scrollTop: scroll.getBoundingClientRect().top,
        body: (document.querySelector("[data-mv2='news-body']") as HTMLElement).textContent || "",
      };
    });
    expect(fit.cardBottom).toBeLessThanOrEqual(fit.view + 1);
    expect(fit.scrolls).toBe(true);
    expect(fit.headTop).toBeLessThan(fit.scrollTop);
    expect(fit.body).toHaveLength(5000);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeVisible();
  });
});
