import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, stillBox, FIXED_NOW, type MapSeed, openPinSheet } from "./support/map-v2";
import { touchSession, tapTouch, throttleCpu } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Follow on the Contributor sheet (tracker P2-04, front end only: no migration).
//  The sheet's Follow calls the SAME toggleFollow the profile page and the card use.
//    - a real tap (CDP touch) follows and unfollows; the label, the heart and the toast say so
//    - the target is at least 44 px, and the sheet neither moves nor adds a history entry
//    - a Place or an Event sheet gets no second Follow (their card already has one)
//    - a signed-out visitor on the real site is told to sign in instead of seeing a heart that is gone on refresh
//    - the follower count stays bucketed: following never prints a low number
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; full_name: string; physical_longitude: number; physical_latitude: number };
type P = { id: string; name: string; longitude: number; latitude: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[]; places: P[] };
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
type MapHook = { jumpTo: (o: object, d: object) => void };

async function open(page: Page, kind: "contributor" | "place", index: number, followers?: number) {
  const seed = seed0();
  await throttleCpu(page);
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { followers });
  await openMap(page, "/?map=v2", 8);
  const t = kind === "contributor"
    ? { id: seed.contributors[index].id, lng: seed.contributors[index].physical_longitude, lat: seed.contributors[index].physical_latitude }
    : { id: seed.places[index].id, lng: seed.places[index].longitude, lat: seed.places[index].latitude };
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [t.lng, t.lat]);
  await openPinSheet(page, t.id);
  await expect(sheet(page)).toBeVisible();
  return { seed, t };
}

const followBtn = (page: Page) => page.locator("[data-mv2='actions'] [data-mv2='action']", { hasText: /^Follow(ing)?$/ });

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe("P2-04 Follow on the Contributor sheet", () => {
  test("a real tap follows, a second tap unfollows; label, filled heart and toast agree; the sheet stays put", async ({ page }) => {
    await open(page, "contributor", 0);
    const btn = followBtn(page);
    await expect(btn).toHaveCount(1);
    await expect(btn).toHaveText("Follow");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
    const box = await stillBox(page, btn);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    const histBefore = await page.evaluate(() => history.length);
    const cdp = await touchSession(page);
    const centreOf = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

    await tapTouch(cdp, centreOf(await stillBox(page, btn)));
    await expect(btn).toHaveText("Following");
    await expect(btn).toHaveAttribute("data-on", "");
    await expect(page.getByText("Now following Fixture Fellowship 1")).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    expect(await page.evaluate(() => history.length)).toBe(histBefore);

    await tapTouch(cdp, centreOf(await stillBox(page, btn)));
    await expect(btn).toHaveText("Follow");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
    await expect(page.getByText("Unfollowed Fixture Fellowship 1")).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
  });

  test("Follow sits next to Directions and Share in the action row, and half still shows the header and the row", async ({ page }) => {
    await open(page, "contributor", 0);
    const labels = await page.locator("[data-mv2='actions'] [data-mv2='action']").allTextContents();
    expect(labels).toContain("Follow");
    expect(labels.indexOf("Follow")).toBeLessThan(labels.indexOf("Share"));
    const vh = page.viewportSize()!.height;
    const b = (await followBtn(page).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(vh); // on screen at half, without scrolling
  });

  test("following a Contributor never prints a low follower count", async ({ page }) => {
    await open(page, "contributor", 0, 42);
    const header = page.locator("[data-map-sheet-header]");
    await followBtn(page).click();
    await expect(followBtn(page)).toHaveText("Following");
    await expect(header).not.toContainText("followers");
    await expect(header).not.toContainText("42");
  });

  test("control: from 100 the bucket does show, and following does not turn it into the exact figure", async ({ page }) => {
    await open(page, "contributor", 0, 137);
    const header = page.locator("[data-map-sheet-header]");
    await expect(header).toContainText("100+ followers");
    await followBtn(page).click();
    await expect(followBtn(page)).toHaveText("Following");
    await expect(header).toContainText("100+ followers");
    await expect(header).not.toContainText("137");
    await expect(header).not.toContainText("138");
  });

  // founder, 2026-10-30: a Place follows the Contributor's rules, so its ONE Follow is a pill in the action row
  // (the card's own gradient button, and the white box it sat in, are gone)
  test("a Place sheet has one Follow, in its action row, and the body has none of its own", async ({ page }) => {
    await open(page, "place", 0);
    await expect(followBtn(page)).toHaveCount(1);
    await expect(page.locator("[data-mv2='card']").getByRole("button", { name: /^Follow(ing)?$/ })).toHaveCount(0);
  });

  // Real listings do not carry a follower count, so the card and the profile used to print "0 followers" under every
  // small ministry and place (the very thing P2-08 exists to prevent). They now show the bucket, or nothing.
  test("a Place card and the profile pages never print '0 followers'; the helper still shows the bucket from 100", async ({ page }) => {
    const { seed, t } = await open(page, "place", 0);
    await expect(page.locator("[data-mv2='card']")).toBeVisible();
    await expect(page.locator("[data-mv2='card']")).not.toContainText("followers");

    // control: the shared helper maps 0, 99 and nothing to "nothing", and 137 to the bucket
    const mapped = await page.evaluate(() => {
      const f = (window as unknown as { UI: { followerBucket: (n: unknown) => string } }).UI.followerBucket;
      return [f(0), f(99), f(undefined), f(null), f("x"), f(137), f(26_000)];
    });
    expect(mapped).toEqual(["", "", "", "", "", "100+", "25,000+"]);

    // the Place page and a Contributor's page (opened from its sheet)
    await page.getByRole("button", { name: "View Full Profile" }).first().click();
    await expect(page.getByText(seed.places[0].name).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("0 followers");
    expect(t.id).toBeTruthy();
  });

  test("a Contributor's full profile does not say '0 followers' either", async ({ page }) => {
    await open(page, "contributor", 0);
    await page.getByRole("button", { name: "View Full Profile" }).click();
    await expect(page.getByRole("heading", { name: "Fixture Fellowship 1" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("followers");
  });

  test("a signed-out visitor on the real site is asked to sign in, and nothing flips (control: demo mode flips)", async ({ page }) => {
    await open(page, "contributor", 0);
    // the real site has Supabase configured (window.CC_AUTH) and nobody signed in; the hermetic page has neither
    await page.evaluate(() => { (window as unknown as { CC_AUTH: object }).CC_AUTH = {}; });
    const btn = followBtn(page);
    await btn.click();
    await expect(page.getByText("Sign in to follow.")).toBeVisible();
    await expect(btn).toHaveText("Follow");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
    await expect(page.getByText("Now following Fixture Fellowship 1")).toHaveCount(0);
  });

  test("the same guard holds for a Place's own Follow, which had the same fake success", async ({ page }) => {
    await open(page, "place", 0);
    await page.evaluate(() => { (window as unknown as { CC_AUTH: object }).CC_AUTH = {}; });
    await followBtn(page).click();
    await expect(page.getByText("Sign in to follow.")).toBeVisible();
    await expect(followBtn(page)).toHaveText("Follow");
  });
});
