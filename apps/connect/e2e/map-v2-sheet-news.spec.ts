import { test, expect } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  The News tab (tracker P1-07 / P1-05). The app reads `news_posts` straight
//  from Supabase with the anon client (public SELECT policy), and this suite
//  has no Supabase, so a stand-in client answers that one table: every query
//  chain resolves to the rows below, every other table to an empty list.
// ════════════════════════════════════════════════════════════════════

type Seed = MapSeed & { contributors: { id: string; physical_longitude: number; physical_latitude: number }[] };

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
  const titles = await sheet.locator("[data-mv2='post'] [data-mv2='row-title']").allTextContents();
  expect(titles).toEqual(["Fresh update", "Older update"]);
  await expect(sheet.locator("[data-mv2='post']").first()).toContainText("3 h ago");
  await expect(sheet.locator("[data-mv2='post']").last()).toContainText("3 Oct");
});
