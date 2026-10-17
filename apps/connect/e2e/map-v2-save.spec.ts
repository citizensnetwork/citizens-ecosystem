import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";
import { touchSession, tapTouch } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Save on the sheet and the saved list in Settings (tracker P2-04; migration 183, applied).
//  Save is a PRIVATE bookmark of a Contributor or a Place (an Event keeps its Consider bookmark). It is not Follow.
//    - a real tap saves and unsaves; the label, the filled bookmark and the toast agree
//    - Save is independent of Follow (saving never follows, following never saves)
//    - a Place gets Save; an Event gets neither Save nor a second Follow
//    - a signed-out visitor on the real site is asked to sign in instead of seeing a bookmark that is gone on refresh
//    - Settings lists what the person saved, by name, and a row can be opened or removed
//  Hermetic demo mode: the saved sets live in the page. The database half is covered by savedLib.test.ts (what the app
//  sends) and docs/audit/probes/183_saved_items.probe.sql (what the database allows); the signed-in glue is NOT driven here.
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; full_name: string; physical_longitude: number; physical_latitude: number };
type P = { id: string; name: string; longitude: number; latitude: number };
type E = { id: string; title: string; longitude: number; latitude: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[]; places: P[]; events: E[] };
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
type MapHook = { jumpTo: (o: object, d: object) => void };
type Kind = "contributor" | "place" | "event";

async function pick(page: Page, seed: ReturnType<typeof seed0>, kind: Kind, index: number) {
  const t = kind === "contributor"
    ? { id: seed.contributors[index].id, lng: seed.contributors[index].physical_longitude, lat: seed.contributors[index].physical_latitude }
    : kind === "place"
      ? { id: seed.places[index].id, lng: seed.places[index].longitude, lat: seed.places[index].latitude }
      : { id: seed.events[index].id, lng: seed.events[index].longitude, lat: seed.events[index].latitude };
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [t.lng, t.lat]);
  await page.locator(`.maplibregl-marker[data-cc-id="${t.id}"]`).click({ force: true });
  await expect(sheet(page)).toBeVisible();
  return t;
}

async function open(page: Page, kind: Kind, index: number, tweak?: (seed: ReturnType<typeof seed0>) => void) {
  const seed = seed0();
  if (tweak) tweak(seed);
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed);
  await openMap(page, "/?map=v2", 8);
  return { seed, ...(await pick(page, seed, kind, index)) };
}

const actionBtn = (page: Page, re: RegExp) => page.locator("[data-mv2='actions'] [data-mv2='action']", { hasText: re });
const saveBtn = (page: Page) => actionBtn(page, /^Saved?$/);
const followBtn = (page: Page) => actionBtn(page, /^Follow(ing)?$/);
const goTo = (page: Page, p: string) => page.evaluate((x) => (window as unknown as { __cc: { go: (p: string) => void } }).__cc.go(x), p);

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe("P2-04 Save on the sheet", () => {
  test("a real tap saves, a second tap unsaves; label, filled bookmark and toast agree; the sheet stays put", async ({ page }) => {
    await open(page, "contributor", 0);
    const btn = saveBtn(page);
    await expect(btn).toHaveCount(1);
    await expect(btn).toHaveText("Save");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
    const box = (await btn.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    const histBefore = await page.evaluate(() => history.length);
    const cdp = await touchSession(page);
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await tapTouch(cdp, centre);
    await expect(btn).toHaveText("Saved");
    await expect(btn).toHaveAttribute("data-on", "");
    await expect(page.getByText("Saved Fixture Fellowship 1. Only you can see this.")).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    expect(await page.evaluate(() => history.length)).toBe(histBefore);

    await tapTouch(cdp, centre);
    await expect(btn).toHaveText("Save");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
    await expect(page.getByText("Removed Fixture Fellowship 1 from your saved list")).toBeVisible();
  });

  test("Save is not Follow: saving does not follow, following does not save (control for each direction)", async ({ page }) => {
    await open(page, "contributor", 0);
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Saved");
    await expect(followBtn(page)).toHaveText("Follow");
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Save");

    await followBtn(page).click();
    await expect(followBtn(page)).toHaveText("Following");
    await expect(saveBtn(page)).toHaveText("Save");
  });

  test("Save comes right after Follow on a Contributor and stays on screen at half", async ({ page }) => {
    await open(page, "contributor", 0);
    const labels = await page.locator("[data-mv2='actions'] [data-mv2='action']").allTextContents();
    expect(labels.indexOf("Follow")).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf("Save")).toBe(labels.indexOf("Follow") + 1);
    expect(labels.indexOf("Save")).toBeLessThan(labels.indexOf("Share"));
    const b = (await saveBtn(page).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });

  test("a Place gets Save in the action row (and keeps its card's Follow); an Event gets neither Save nor a second Follow", async ({ page }) => {
    await open(page, "place", 0);
    await expect(saveBtn(page)).toHaveCount(1);
    await expect(followBtn(page)).toHaveCount(0);
    await expect(page.locator("[data-mv2='card']").getByRole("button", { name: /^Follow$/ })).toHaveCount(1);
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Saved");
    await expect(page.getByText(/^Saved .*Only you can see this\.$/)).toBeVisible();

    // an Event: its bookmark is Consider, on the card
    await pick(page, seed0(), "event", 0);
    await expect(saveBtn(page)).toHaveCount(0);
    await expect(followBtn(page)).toHaveCount(0);
  });

  test("a signed-out visitor on the real site is asked to sign in, and nothing flips (control: demo mode flips)", async ({ page }) => {
    await open(page, "contributor", 0);
    await page.evaluate(() => { (window as unknown as { CC_AUTH: object }).CC_AUTH = {}; });
    await saveBtn(page).click();
    await expect(page.getByText("Sign in to save.")).toBeVisible();
    await expect(saveBtn(page)).toHaveText("Save");
    await expect(saveBtn(page)).not.toHaveAttribute("data-on", /.*/);
  });
});

test.describe("P2-04 the saved list in Settings", () => {
  test("empty at first, then lists what was saved by name (Contributors and Places together), and a row opens or removes", async ({ page }) => {
    // the Place sorts BEFORE the Contributor, while the directory lists Contributors first: only a real sort by name passes
    const { seed } = await open(page, "contributor", 0, (s) => { s.contributors[0].full_name = "Zeta Fellowship"; s.places[0].name = "Alpha Place"; });
    await goTo(page, "settings");
    await expect(page.locator("[data-screen='settings']")).toBeVisible();
    await expect(page.locator("[data-saved='empty']")).toHaveText(/Nothing saved yet/);
    await expect(page.getByText("Only you can see this list. A listing is never told you saved it.")).toBeVisible();

    // save one Contributor and one Place from the map, then look at the list
    await goTo(page, "home");
    await expect(page.locator(".maplibregl-marker").first()).toBeVisible();
    await pick(page, seed, "contributor", 0);
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Saved");
    await pick(page, seed, "place", 0);
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Saved");

    await goTo(page, "settings");
    const names = await page.locator("[data-saved='row'] [data-saved='name']").allInnerTexts();
    const want = [seed.contributors[0].full_name, seed.places[0].name].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(want); // in name order, never by how popular a listing is

    // remove the Place from the list
    await page.getByRole("button", { name: `Remove ${seed.places[0].name} from your saved list` }).click();
    await expect(page.locator("[data-saved='row']")).toHaveCount(1);
    // open the Contributor from the list
    await page.locator("[data-saved='open']").first().click();
    await expect(page).toHaveURL(new RegExp(`/c/${seed.contributors[0].contributor_slug}$`));
  });

  test("removing the last one brings the empty note back", async ({ page }) => {
    const { seed } = await open(page, "place", 0);
    await saveBtn(page).click();
    await goTo(page, "settings");
    await expect(page.locator("[data-saved='row']")).toHaveCount(1);
    await page.getByRole("button", { name: `Remove ${seed.places[0].name} from your saved list` }).click();
    await expect(page.locator("[data-saved='row']")).toHaveCount(0);
    await expect(page.locator("[data-saved='empty']")).toBeVisible();
  });
});
