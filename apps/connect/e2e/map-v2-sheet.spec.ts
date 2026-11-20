import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed, openPinSheet, openListing, toCleanMap } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Map v2 bottom sheet (tracker P1-06 to P1-11); Map v2 is on by default since D15.
//  Hermetic, clock frozen at Saturday 2026-10-10 10:00 in Pretoria.
//  Playwright cannot reproduce Chrome's Back intervention, so the Back
//  behaviour here is the EMULATED half; the founder's real-phone check is
//  the other half (docs/audit/phase1-qa.md, "Needs a real phone").
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>;
type C = { id: string; contributor_slug: string; physical_longitude: number; physical_latitude: number; website_url: string | null; full_name: string };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[] };

const SHEET = "[data-mv2='sheet']";
const sheet = (page: Page) => page.locator(SHEET);
const pinOf = (page: Page, id: string) => page.locator(`.maplibregl-marker[data-cc-id="${id}"]`);

type MapHook = { jumpTo: (o: object, d: object) => void; once: (e: string, f: () => void) => void; isMoving: () => boolean; loaded: () => boolean };
const jump = (page: Page, lng: number, lat: number, zoom: number) =>
  page.evaluate(([lo, la, z]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: z }, { originalEvent: {} }), [lng, lat, zoom]);

type PlacePin = { id: string; longitude: number; latitude: number; name: string };
/** Open the sheet on a place or event pin (a real click, so it counts as a user gesture). */
async function openOn(page: Page, id: string, lng: number, lat: number) {
  await jump(page, lng, lat, 15.5);
  await openPinSheet(page, id);
  await expect(sheet(page)).toBeVisible();
}
/** #210: the same listing opened from its Explore card (the expanded sheet): the history rules hold there too. */
async function openCardOn(page: Page, id: string, lng: number, lat: number) {
  await jump(page, lng, lat, 15.5);
  await openListing(page, id);
  await expect(sheet(page)).toBeVisible();
}
const top = (page: Page) => sheet(page).evaluate((e) => e.getBoundingClientRect().top);
const innerH = (page: Page) => page.evaluate(() => window.innerHeight);
const settled = async (page: Page, want: number) => {
  // a snap is a 200 ms transform transition: wait for the top edge to arrive, not for a fixed time
  await expect.poll(() => top(page), { timeout: 3000 }).toBeCloseTo(want, -1);
};
// A flick: the pointer travels `dy` px within a few milliseconds. The events are dispatched inside the page with a
// 2 ms gap between them, so the speed (well over 0.5 px/ms) does not depend on how busy the test machine is.
const flick = (page: Page, from: { x: number; y: number }, dy: number) =>
  page.evaluate(
    ([x, y, d]) => {
      const grab = document.querySelector("[data-mv2='handle']") as HTMLElement;
      const ev = (type: string, yy: number) => new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: yy, bubbles: true, cancelable: true });
      const gap = () => { const t = performance.now(); while (performance.now() - t < 2); };
      grab.dispatchEvent(ev("pointerdown", y));
      for (let i = 1; i <= 4; i++) { gap(); document.dispatchEvent(ev("pointermove", y + (d * i) / 4)); }
      gap();
      document.dispatchEvent(ev("pointerup", y + d));
    },
    [from.x, from.y, dy],
  );
const drag = async (page: Page, from: { x: number; y: number }, dy: number, ms: number) => {
  const steps = 10;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x, from.y + (dy * i) / steps);
    await page.waitForTimeout(ms / steps);
  }
  await page.mouse.up();
};

test.describe("P1-06 bottom sheet (phone width)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("tapping a Place pin opens a labelled, non-modal dialog at HALF and names its owner", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);

    await expect(sheet(page)).toHaveAttribute("role", "dialog");
    await expect(sheet(page)).toHaveAttribute("aria-modal", "false");
    await expect(sheet(page)).toHaveAttribute("aria-label", "Fixture Place 1, details");
    await expect(page.locator("[data-map-sheet-header]")).toContainText("Fixture Place 1");
    await expect(sheet(page)).toContainText("by Fixture Fellowship 1");
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
    const h = await innerH(page);
    await settled(page, h * 0.6); // half = 40 % of the viewport
  });

  test("the handle steps half -> full -> half; the chevron at peek opens it; snap positions are 40 % / 90 % / peek", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);
    const h = await innerH(page);

    await page.locator("[data-mv2='handle']").click();
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");
    await settled(page, h * 0.1); // full = 90 % of the viewport (no safe area in this browser)

    await page.locator("[data-mv2='handle']").click();
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");
  });

  test("a slow drag follows the finger and snaps to the nearest state; a flick moves one state; a flick down from peek closes", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const place = seed.places[0] as PlacePin;
    await openOn(page, place.id, place.longitude, place.latitude);
    const h = await innerH(page);
    const handle = async () => {
      const b = (await page.locator("[data-mv2='handle']").boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };

    // 1:1: halfway through a slow drag the sheet is where the pointer is (inline transform, no transition).
    // Start from rest: a drag that begins during the opening slide picks the sheet up where it visibly is,
    // so on a slow machine an unsettled start would shift every number below.
    await settled(page, h * 0.6);
    const p = await handle();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) { await page.mouse.move(p.x, p.y - 20 * i); await page.waitForTimeout(120); } // 0.17 px/ms: well under a flick
    const mid = await top(page);
    expect(mid).toBeCloseTo(h * 0.6 - 100, -1);
    await page.mouse.up(); // released after only 100 px: nearest is still half
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");

    // slow drag up past the middle: nearest is full
    await drag(page, await handle(), -250, 1000); // 0.25 px/ms
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");

    // a quick flick down moves ONE state (full -> half), however short
    await flick(page, await handle(), 200);
    await expect(sheet(page)).toHaveAttribute("data-snap", "half");

    // slow drag a long way down: nearest is peek
    await drag(page, await handle(), Math.round(h * 0.4 - 88 + 10), 1200); // from half to just past the peek line: about 0.2 px/ms, well under a flick
    await expect(sheet(page)).toHaveAttribute("data-snap", "peek");
    await settled(page, h - 88);

    // a flick down from peek closes it
    await flick(page, await handle(), 120);
    await expect(sheet(page)).toHaveCount(0);
  });

  test("while the sheet is open, only transform animates: no layout property transitions", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);
    expect(await sheet(page).evaluate((e) => getComputedStyle(e).transitionProperty)).toBe("transform");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await sheet(page).evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
  });

  test("content scrolls only at full, and a scroll does not chain into the map", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 14 });
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);
    const overflow = () => page.locator("[data-mv2='scroller']").evaluate((e) => ({ y: getComputedStyle(e).overflowY, chain: getComputedStyle(e).overscrollBehaviorY }));
    expect((await overflow()).y).toBe("hidden");
    await page.locator("[data-mv2='handle']").click();
    await expect.poll(async () => (await overflow()).y).toBe("auto");
    expect((await overflow()).chain).toBe("contain");
  });

  test("the first Back closes the sheet and stays on the map; moving between snap states adds no history entry", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await toCleanMap(page); // an in-app navigation: measure from here
    const before = await page.evaluate(() => history.length);
    await openOn(page, p.id, p.longitude, p.latitude);
    const open = await page.evaluate(() => history.length);
    expect(open).toBe(before + 2); // the preview and its listing actions each own one Back step

    await page.locator("[data-mv2='handle']").click(); // half -> full
    await page.locator("[data-mv2='handle']").click(); // full -> half
    expect(await page.evaluate(() => history.length)).toBe(open);

    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  // The C15 rule (RESUME section 3), on the map everyone gets since D15: Chrome on Android skips every history
  // entry a page added WITHOUT a user gesture, which is how Back once left Connect. Playwright's goBack() is
  // programmatic, so it cannot show that; what it CAN show is the cause: each pushState with
  // navigator.userActivation.isActive at that moment. (routing.spec.ts runs the same rule on the sheet's View Full Profile and Close paths.)
  test("every history entry the sheet adds is pushed inside a tap, one per opening, and Back never gets trapped", async ({ page }) => {
    type Push = { active: boolean; guard: boolean; url: string };
    await page.addInitScript(() => {
      const w = window as unknown as { __pushes: Push[] };
      w.__pushes = [];
      const orig = History.prototype.pushState;
      History.prototype.pushState = function (this: History, state: unknown, title: string, url?: string | URL | null) {
        w.__pushes.push({ active: navigator.userActivation.isActive, guard: !!(state && (state as { guard?: boolean }).guard), url: String(url) });
        return orig.call(this, state, title, url);
      };
    });
    const pushes = () => page.evaluate(() => (window as unknown as { __pushes: Push[] }).__pushes);
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await page.goto("/manifest.json"); // a real previous entry, so "Back leaves Connect" is observable
    await openMap(page, "/", 5);
    await page.waitForTimeout(600); // let every boot effect settle: the map itself pushes nothing
    expect(await pushes()).toEqual([]);

    const p = seed.places[0] as PlacePin;
    await openCardOn(page, p.id, p.longitude, p.latitude);
    expect(await pushes()).toEqual([{ active: true, guard: true, url: expect.any(String) }]);

    // closed by its own button, reopened, closed by Back, reopened, closed by Back
    await page.getByRole("button", { name: "Close details" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await page.waitForTimeout(300); // the guard's own entry is taken back off the stack (async)
    await openCardOn(page, p.id, p.longitude, p.latitude);
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    await openCardOn(page, p.id, p.longitude, p.latitude);
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/");

    // three openings = three pushes, every one inside a tap and none a screen change
    const all = await pushes();
    expect(all).toHaveLength(3);
    expect(all.every((p) => p.active && p.guard)).toBe(true);

    // nothing stacked under the map: the next Back leaves Connect
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("Escape and the close button close it at once and give the entry back", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openCardOn(page, p.id, p.longitude, p.latitude);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await openCardOn(page, p.id, p.longitude, p.latitude);
    await page.getByRole("button", { name: "Close details" }).click();
    await expect(sheet(page)).toHaveCount(0);
    // the guard's own entry is taken back off the stack once the sheet is gone: we are on the arrival entry again
    await expect.poll(() => page.evaluate(() => (history.state as { idx?: number } | null)?.idx)).toBe(0);
    expect(new URL(page.url()).pathname).toBe("/"); // never left the app
  });

  test("keyboard: Enter on a pin moves focus to its Explore card, Enter there into the sheet; Escape returns it to the card", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await jump(page, p.longitude, p.latitude, 15.5);
    const pin = pinOf(page, p.id);
    await pin.focus();
    await page.keyboard.press("Enter");
    // #210: the pin outlines its card in the row and the keyboard follows it there
    const card = () => page.evaluate(() => document.activeElement?.closest("[data-explore-id]")?.getAttribute("data-explore-id"));
    await expect.poll(card).toBe(p.id);
    await expect(sheet(page)).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-mv2='pinpeek-details']")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect.poll(card).toBe(p.id);
  });

  test("a screen reader hears the state change", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);
    const live = sheet(page).locator("[data-mv2='sr']");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveText("Showing details");
    await page.locator("[data-mv2='handle']").click();
    await expect(live).toHaveText("Showing everything");
  });

  test("the selected pin clears the sheet: it sits above the half-height sheet, near 27 % from the top", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);
    // The pin starts at the centre (50 %) and the map eases it up above the sheet: wait for it to arrive
    // (on a slow machine the ease is still running when the sheet appears), then check where it stopped.
    const pct = async () => {
      const b = (await pinOf(page, p.id).locator("[data-mv2='body']").boundingBox())!;
      return Math.round(((b.y + b.height / 2) / 844) * 100);
    };
    await expect.poll(pct, { timeout: 6000 }).toBeLessThan(35);
    await settled(page, (await innerH(page)) * 0.6);
    expect(await pct()).toBeGreaterThanOrEqual(20);
    const b = (await pinOf(page, p.id).locator("[data-mv2='body']").boundingBox())!;
    expect(b.y + b.height).toBeLessThan(await top(page)); // not hidden behind the sheet
  });
});

test.describe("P1-07 header, actions, tabs", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("actions: Directions (a real maps link), Share (copies the real link), Website; never an action without its data", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const e = seed.events[0] as { id: string; longitude: number; latitude: number };
    await openOn(page, e.id, e.longitude, e.latitude);

    const dir = sheet(page).getByRole("link", { name: "Directions" });
    await expect(dir).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-25\.\d+%2C28\.\d+$/);
    await expect(dir).toHaveAttribute("target", "_blank");
    await expect(dir).toHaveAttribute("rel", /noopener/);
    await expect(sheet(page).getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://fixture.example/event");
    await expect(sheet(page).getByRole("link", { name: "Call" })).toHaveCount(0);

    await sheet(page).getByRole("button", { name: "Share" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3100/e/${e.id}`);
    await expect(page.getByText("Link copied")).toBeVisible();
  });

  test("a Place with no website shows Directions and not Website", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[1] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);
    await expect(sheet(page).getByRole("link", { name: "Website" })).toHaveCount(0);
    await expect(sheet(page).getByRole("link", { name: "Directions" })).toHaveCount(1);
  });

  test("a Place shows its opening state from real hours, and Call from its phone", async ({ page }) => {
    const seed = seed0();
    // place 1 has 'Mon-Fri 08:00-17:00'; the clock is Saturday 10:00
    (seed.places[0] as Row).phone = "+27 12 345 6789";
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as { id: string; longitude: number; latitude: number };
    await openOn(page, p.id, p.longitude, p.latitude);
    await expect(page.locator("[data-map-sheet-header]")).toContainText("Closed today");
    await expect(sheet(page).getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+27123456789");
    // the card body is the Place's own EntityCard, with no second View Full Profile
    await expect(sheet(page).locator("[data-entity-card='place']")).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "View Full Profile" })).toHaveCount(1);
  });

  test("a Place without hours shows NO open state at all (unknown is silent)", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[1] as { id: string; longitude: number; latitude: number }; // no open_hours
    await openOn(page, p.id, p.longitude, p.latitude);
    // This place stays silent. A nearby listing may still say its own hours (issue #222).
    await expect(page.locator("[data-map-sheet-header] [data-mv2='state']")).toHaveCount(0);
    await expect(page.locator("[data-map-sheet-header]")).not.toContainText(/Open|Closed/);
  });

  test("an Event shows 'Starts in 2 h' and its own EntityCard body", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 5);
    const e = seed.events[0] as { id: string; longitude: number; latitude: number };
    await openOn(page, e.id, e.longitude, e.latitude);
    await expect(page.locator("[data-map-sheet-header]")).toContainText("Starts in 2 h");
    await expect(sheet(page).locator("[data-entity-card='event']")).toBeVisible();
  });

  test("a contributor is not a pin; the profile is the way in", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 5);
    await expect(page.locator("[data-cc-pin='contributor']")).toHaveCount(0);
    await expect(page.locator(".maplibregl-marker")).toHaveCount(5);
    const c = seed.contributors[0];
    await page.evaluate((id) => (window as unknown as { __cc: { go: (p: string, q: object) => void } }).__cc.go("profile", { id }), c.id);
    await expect(page.locator('[data-screen="profile"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(c.full_name).first()).toBeVisible();
  });

});

test.describe("P1-06 side panel (wide screens)", () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test("at 768 px and above it is a 380 px panel beside the sidebar, with no snap points or handle", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await openMap(page, "/?map=v2", 5);
    const p = seed.places[0] as PlacePin;
    await openOn(page, p.id, p.longitude, p.latitude);
    await expect(sheet(page)).toHaveAttribute("data-wide", "1");
    const b = (await sheet(page).boundingBox())!;
    expect(Math.round(b.width)).toBe(380);
    expect(b.x).toBeGreaterThanOrEqual(256); // right of the sidebar
    await expect(page.locator("[data-mv2='handle']")).toHaveCount(0);
    // the selected pin is pushed clear of the panel, into the visible part of the map
    await expect
      .poll(async () => (await pinOf(page, p.id).locator("[data-mv2='body']").boundingBox())!.x, { timeout: 4000 })
      .toBeGreaterThan(b.x + b.width);
  });
});
