import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, fixtureImageUrl, FIXED_NOW, type MapSeed, openPinSheet } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Moments on the Contributor sheet (tracker P2-05, ADAPTED; migration 188). Hermetic, clock frozen.
//  A short note that clears itself after a day shows under a "Today" tab, only while a live note exists.
//  The attention test (tracker Q4): no ring, no countdown, no time left, no view count: only "Posted 3 h ago".
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; full_name: string; physical_longitude: number; physical_latitude: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[] };
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
type MapHook = { jumpTo: (o: object, d: object) => void };
const H = 3_600_000;

const note = (id: string, body: string, o: { ageH?: number; leftH?: number; image?: string | null } = {}) => ({
  id,
  body,
  image_url: o.image ?? null,
  created_at: new Date(FIXED_NOW - (o.ageH ?? 3) * H).toISOString(),
  expires_at: new Date(FIXED_NOW + (o.leftH ?? 21) * H).toISOString(),
});

async function openContributor(page: Page, index: number, detail: Parameters<typeof mockContributorDetail>[2] = {}) {
  const seed = seed0();
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, detail);
  await openMap(page, "/?map=v2", 8);
  const c = seed.contributors[index];
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
  await openPinSheet(page, c.id);
  await expect(sheet(page)).toBeVisible();
  return { seed, c };
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Moments: the Today tab", () => {
  test("a live note adds a Today tab after Events, News and Gallery (#210: their order is fixed); it shows the note and when it was posted", async ({ page }) => {
    await openContributor(page, 0, { gallery: 2, moments: [note("m1", "Prayer walk tonight at the north gate.")] });
    await expect(sheet(page).getByRole("tab")).toHaveText(["Events", "Gallery", "Today"]);
    await sheet(page).getByRole("tab", { name: "Today" }).click();
    const row = page.locator("[data-mv2='panel'] [data-moment]");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Prayer walk tonight at the north gate.");
    await expect(row).toContainText("3 h ago");
  });

  test("a Contributor with no live note has no Today tab", async ({ page }) => {
    await openContributor(page, 0, { gallery: 2, moments: [] });
    await expect(sheet(page).getByRole("tab")).toHaveText(["Events", "Gallery"]);
  });

  test("a note that has already ended (a cached page) is not shown, and with only ended notes there is no tab", async ({ page }) => {
    await openContributor(page, 0, { gallery: 2, moments: [note("old", "Yesterday's note", { ageH: 30, leftH: -6 })] });
    await expect(sheet(page).getByRole("tab")).toHaveText(["Events", "Gallery"]);
  });

  test("newest first; an ended one among live ones is dropped", async ({ page }) => {
    await openContributor(page, 0, { moments: [note("a", "Older note", { ageH: 10 }), note("b", "Newest note", { ageH: 1 }), note("c", "Ended note", { ageH: 40, leftH: -16 })] });
    await sheet(page).getByRole("tab", { name: "Today" }).click();
    await expect(page.locator("[data-mv2='panel'] [data-moment] [data-mv2='post-body']")).toHaveText(["Newest note", "Older note"]);
  });

  test("line breaks are kept and a long note is shown in full", async ({ page }) => {
    const long = "x".repeat(279) + "!";
    await openContributor(page, 0, { moments: [note("m1", "Line one\nLine two"), note("m2", long, { ageH: 5 })] });
    await sheet(page).getByRole("tab", { name: "Today" }).click();
    const bodies = page.locator("[data-mv2='panel'] [data-moment] [data-mv2='post-body']");
    expect(await bodies.first().evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-line");
    await expect(bodies.nth(1)).toHaveText(long);
    const clipped = await bodies.nth(1).evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clipped).toBe(false);          // not cut at three lines like a news summary
  });

  test("a picture is shown only for a safe link", async ({ page }) => {
    await openContributor(page, 0, { moments: [note("m1", "With a picture", { image: fixtureImageUrl(1) }), note("m2", "Bad link", { ageH: 4, image: "javascript:alert(1)" })] });
    await sheet(page).getByRole("tab", { name: "Today" }).click();
    await expect(page.locator("[data-mv2='panel'] [data-moment] img")).toHaveCount(1);
    await expect(page.locator("[data-mv2='panel'] [data-moment] img")).toHaveAttribute("src", fixtureImageUrl(1));
  });

  test("the attention test: no ring, no countdown, no time left, no seen or view count anywhere in the panel", async ({ page }) => {
    await openContributor(page, 0, { moments: [note("m1", "Short note", { leftH: 2 })] });     // only 2 hours left: still nothing about it
    await sheet(page).getByRole("tab", { name: "Today" }).click();
    const panel = page.locator("[data-mv2='panel']");
    const text = (await panel.innerText()).toLowerCase();
    expect(text).not.toMatch(/left|expire|ends|ending|countdown|remaining|seen|view|watch|hurry|miss|last chance/);
    await expect(panel.locator("[role='progressbar'], progress, time, [data-mv2='ring'], [data-mv2='countdown']")).toHaveCount(0);
    await expect(page.locator("[data-mv2='avatar']").first()).not.toHaveCSS("box-shadow", /rgb\(.*\) 0px 0px 0px [2-9]px/);   // no story-style ring on the avatar
  });

  test("the first tab is still the one that was there before (Today never steals the opening tab)", async ({ page }) => {
    await openContributor(page, 0, { moments: [note("m1", "A note")] });
    await expect(sheet(page).getByRole("tab", { name: "Events" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Moments: four tabs fit on a narrow phone", () => {
  for (const width of [360, 320]) {
    test(`Events, News, Gallery and Today fit in ${width} px without scrolling sideways`, async ({ page }) => {
      const seed = seed0();
      const c = seed.contributors[0];
      const posts = [{ id: "n1", contributor_id: c.id, title: "An update", body: "Doors open at nine.", image_url: null, post_date: "2026-10-10", created_at: new Date(FIXED_NOW - 3 * H).toISOString() }];
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript((rows) => {
        const chain = (table: string): unknown =>
          new Proxy(function () {}, {
            get: (_t, p) => (p === "then" ? (res: (v: unknown) => void) => res({ data: table === "news_posts" ? rows : [], error: null }) : () => chain(table)),
            apply: () => chain(table),
          });
        (window as unknown as { CC_SUPABASE: unknown }).CC_SUPABASE = { from: chain, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
      }, posts);
      await mockMapNetwork(page, seed);
      await mockContributorDetail(page, seed, { gallery: 2, moments: [note("m1", "A note")] });
      await openMap(page, "/?map=v2", 8);
      await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [c.physical_longitude, c.physical_latitude]);
      await openPinSheet(page, c.id);
      await expect(sheet(page).getByRole("tab")).toHaveText(["Events", "News", "Gallery", "Today"]);
      const fits = await page.locator("[data-mv2='tabs']").evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(fits.scroll).toBeLessThanOrEqual(fits.client);
      // each tab keeps the size the existing tabs have (43 px tall inside the 44 px row, as map-v2-sheet-devices pins) and is not squeezed
      for (const t of await sheet(page).getByRole("tab").all()) {
        const b = (await t.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(43);
        expect(b.width).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
