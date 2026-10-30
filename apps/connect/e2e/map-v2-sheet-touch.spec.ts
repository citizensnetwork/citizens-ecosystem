import { test, expect, type Page, type Locator } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed, openPinSheet } from "./support/map-v2";
import {
  touchSession, swipe, flickTouch, swipeThenCancel, tapTouch, recordPointerEvents, pointerCounts, resetPointerCounts, type Pt,
} from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Map v2 sheet with REAL touch (tracker R7 / RESUME C22).
//  The founder's report (Android, 2026-10-14): after tapping a Contributor's pin
//  the card opens but "cannot be swiped up, nor swiped back down after seen".
//  map-v2-sheet.spec.ts drives the sheet with synthetic PointerEvents and
//  page.mouse, which skip the touch pipeline (touch-action, pointercancel).
//  Everything here goes through CDP Input.dispatchTouchEvent in a context with
//  hasTouch + isMobile, so Chrome decides what is a scroll exactly as on a phone.
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; physical_longitude: number; physical_latitude: number; full_name: string };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[] };

const SHEET = "[data-mv2='sheet']";
const sheet = (page: Page) => page.locator(SHEET);
const scroller = (page: Page) => page.locator("[data-mv2='scroller']");
const snapOf = (page: Page) => sheet(page).getAttribute("data-snap");
const top = (page: Page) => sheet(page).evaluate((e) => e.getBoundingClientRect().top);
const innerH = (page: Page) => page.evaluate(() => window.innerHeight);
const scrollTopOf = (page: Page) => scroller(page).evaluate((e) => e.scrollTop);

type MapHook = { jumpTo: (o: object, d: object) => void };
const jump = (page: Page, lng: number, lat: number, zoom: number) =>
  page.evaluate(([lo, la, z]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: z }, { originalEvent: {} }), [lng, lat, zoom]);

/** The point a thumb would press on an element (its visible centre). */
async function at(loc: Locator): Promise<Pt> {
  const b = await loc.boundingBox();
  if (!b) throw new Error("element has no box");
  return { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 24) };
}

/** A phone with a thumb: the sheet opens by a real tap on the pin's card in the Explore row (#210). */
async function openSheet(page: Page, kind: "contributor" | "place" | "event" = "contributor", size?: { width: number; height: number }) {
  if (size) await page.setViewportSize(size);
  const seed = seed0();
  await recordPointerEvents(page);
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed, { gallery: 40, covers: 2 });
  await openMap(page, "/?map=v2", 8);
  const pick = kind === "contributor" ? seed.contributors[0] : (seed[kind === "place" ? "places" : "events"][0] as unknown as C);
  const lng = (pick as unknown as { physical_longitude?: number; longitude?: number }).physical_longitude ?? (pick as unknown as { longitude: number }).longitude;
  const lat = (pick as unknown as { physical_latitude?: number; latitude?: number }).physical_latitude ?? (pick as unknown as { latitude: number }).latitude;
  await jump(page, lng, lat, 15.5);
  await openPinSheet(page, pick.id, "tap");
  await expect(sheet(page)).toBeVisible();
  // a Contributor's photos arrive from the per-slug fetch: wait for the Gallery panel so the content has its real height
  if (kind === "contributor") await expect(page.getByRole("tab", { name: "Gallery" })).toBeVisible();
  const h = await innerH(page);
  await expect.poll(() => top(page), { timeout: 3000 }).toBeCloseTo(h * 0.6, -1);
  const cdp = await touchSession(page);
  return { cdp, h, seed };
}
/** Open the Gallery tab (42 photos): enough content that the sheet has something to scroll at full. */
async function showGallery(page: Page) {
  await page.getByRole("tab", { name: "Gallery" }).tap();
  await expect(page.locator("[data-mv2='panel'] img").first()).toBeVisible();
}
/** A short phone (the sheet is 90 % of it, so the Gallery's 12 tiles overflow it and the content can scroll). */
const SHORT = { width: 360, height: 600 };
const settledAt = (page: Page, y: number) => expect.poll(() => top(page), { timeout: 3000 }).toBeCloseTo(y, -1);
/** Put the sheet on a state through the handle (a button: its click is not a swipe). */
async function goTo(page: Page, want: "peek" | "half" | "full") {
  for (let i = 0; i < 4 && (await snapOf(page)) !== want; i++) {
    if (want === "full") await page.locator("[data-mv2='handle']").tap();
    else if (want === "half") await page.locator("[data-mv2='handle']").tap();
    else await page.locator("[data-mv2='icon-btn'][aria-label]").first().tap();
    await page.waitForTimeout(260);
  }
}

test.describe("R7 swipes with real touch (phone, portrait)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("at half, a swipe UP that starts on the header, on the action row or on the content moves the sheet to full", async ({ page }) => {
    const { cdp, h } = await openSheet(page);
    const starts: Record<string, Locator> = {
      header: page.locator("[data-mv2='name']"),
      actions: page.locator("[data-mv2='actions'] [data-mv2='action']").first(),
      // (the bio is not drawn at half: under the actions there is the tab bar, the facts, or the empty note)
      content: scroller(page).locator("[data-mv2='tabs'], [data-mv2='panel'], [data-mv2='facts'], [data-mv2='empty']").first(),
    };
    for (const [label, loc] of Object.entries(starts)) {
      await goTo(page, "half");
      await settledAt(page, h * 0.6);
      const p = await at(loc);
      await swipe(cdp, p, -260, { ms: 520, steps: 16 });
      await expect.poll(() => snapOf(page), { message: `swipe up from the ${label} (${Math.round(p.y)}px)`, timeout: 3000 }).toBe("full");
    }
  });

  test("at full with the content at the top, a swipe DOWN moves it to half; from half to peek; from peek it closes", async ({ page }) => {
    const { cdp, h } = await openSheet(page);
    await goTo(page, "full");
    await settledAt(page, h * 0.1);
    expect(await scrollTopOf(page)).toBe(0);

    // slow drag down on the content: nearest state is half
    let p = await at(scroller(page).locator("[data-mv2='actions']"));
    await swipe(cdp, p, 260, { ms: 900, steps: 18 });
    await expect.poll(() => snapOf(page), { message: "full -> half", timeout: 3000 }).toBe("half");
    await settledAt(page, h * 0.6);

    // half -> peek: a long slow drag starting on the content
    p = await at(scroller(page).locator("[data-mv2='actions']"));
    await swipe(cdp, p, Math.round(h * 0.4 - 108), { ms: 1000, steps: 20 });   // from half to the peek line, not past it (that closes)
    await expect.poll(() => snapOf(page), { message: "half -> peek", timeout: 3000 }).toBe("peek");

    // peek -> closed: a flick down on the header
    p = await at(page.locator("[data-mv2='name']"));
    await flickTouch(cdp, p, 140);
    await expect(sheet(page)).toHaveCount(0);
  });

  test("at full with the content scrolled, a swipe down SCROLLS the content and does not collapse the sheet; a swipe up scrolls it further", async ({ page }) => {
    const { cdp, h } = await openSheet(page, "contributor", SHORT);
    await goTo(page, "full");
    await settledAt(page, h * 0.1);
    await showGallery(page);
    const room = await scroller(page).evaluate((e) => e.scrollHeight - e.clientHeight);
    expect(room, "fixture must have content to scroll").toBeGreaterThan(150);

    const p = await at(page.locator("[data-mv2='tabs'], [data-mv2='panel']").first());
    // swipe up: the content scrolls, the sheet stays at full
    await swipe(cdp, { x: p.x, y: 500 }, -200, { ms: 400, steps: 14 });
    await expect.poll(() => scrollTopOf(page), { message: "swipe up scrolls", timeout: 3000 }).toBeGreaterThan(60);
    expect(await snapOf(page)).toBe("full");
    const before = await scrollTopOf(page);

    // swipe down a little: the content scrolls back, the sheet does NOT collapse
    await swipe(cdp, { x: p.x, y: 300 }, 90, { ms: 400, steps: 14 });
    await expect.poll(() => scrollTopOf(page), { message: "swipe down scrolls back", timeout: 3000 }).toBeLessThan(before - 30);
    expect(await snapOf(page)).toBe("full");
    await settledAt(page, h * 0.1);
  });

  test("once the content is back at the top, the next swipe down collapses the sheet to half", async ({ page }) => {
    const { cdp, h } = await openSheet(page, "contributor", SHORT);
    await goTo(page, "full");
    await showGallery(page);
    await scroller(page).evaluate((e) => { e.scrollTop = 80; });
    // a swipe down scrolls to the top (no collapse); the NEXT one collapses
    const p = await at(scroller(page).locator("[data-mv2='actions']"));
    await swipe(cdp, { x: p.x, y: 300 }, 200, { ms: 500, steps: 14 });
    await expect.poll(() => scrollTopOf(page)).toBe(0);
    expect(await snapOf(page)).toBe("full");
    await swipe(cdp, { x: p.x, y: 300 }, 260, { ms: 900, steps: 18 });
    await expect.poll(() => snapOf(page), { message: "second swipe down collapses", timeout: 3000 }).toBe("half");
    await settledAt(page, h * 0.6);
  });

  test("a quick flick moves ONE state in its direction, from the header and from the content", async ({ page }) => {
    const { cdp, h } = await openSheet(page);
    // each snap is a 200 ms slide: wait for it to arrive so the next flick starts where the element really is
    await flickTouch(cdp, await at(scroller(page).locator("[data-mv2='actions']")), -140);
    await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("full");
    await settledAt(page, h * 0.1);
    await flickTouch(cdp, await at(page.locator("[data-mv2='name']")), 160);
    await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("half");
    await settledAt(page, h * 0.6);
    await flickTouch(cdp, await at(scroller(page).locator("[data-mv2='actions']")), 160);
    await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("peek");
    await settledAt(page, h - 88);
  });

  test("a swipe that starts on a button drags the sheet and presses nothing; a tap on it still works", async ({ page }) => {
    const { cdp } = await openSheet(page);
    const dir = page.locator("[data-mv2='action']").first();
    const label = (await dir.textContent())?.trim();
    expect(label).toBeTruthy();
    const popups: string[] = [];
    page.on("popup", (pg) => popups.push(pg.url()));
    await swipe(cdp, await at(dir), -260, { ms: 520, steps: 16 });
    await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("full");
    expect(popups, "a swipe must not click the button it started on").toHaveLength(0);
    // a tap on the Share button (it is a button, not a link, so nothing leaves the page) still reaches its handler
    await goTo(page, "half");
    const share = page.locator("[data-mv2='action']").nth(1);
    await tapTouch(cdp, await at(share));
    await expect(sheet(page)).toBeVisible();
    expect(await snapOf(page)).toBe("half");
  });

  test("a touch the system cancels mid-drag always leaves the sheet on a snap state", async ({ page }) => {
    const { cdp, h } = await openSheet(page);
    await swipeThenCancel(cdp, await at(page.locator("[data-mv2='name']")), -120, { ms: 300, steps: 10 });
    await page.waitForTimeout(300);
    const snap = await snapOf(page);
    expect(["peek", "half", "full"]).toContain(snap);
    const y = await top(page);
    const want = { peek: h - 88, half: h * 0.6, full: h * 0.1 }[snap as "peek" | "half" | "full"];
    expect(y).toBeCloseTo(want, -1);
    // the inline transform from the abandoned drag is gone
    expect(await sheet(page).evaluate((e) => (e as HTMLElement).style.transform)).toBe("");
  });

  test("the browser never takes a swipe from the sheet at half or peek (no pointercancel from a drag that starts on it)", async ({ page }) => {
    const { cdp } = await openSheet(page);
    await resetPointerCounts(page);
    await swipe(cdp, await at(scroller(page).locator("[data-mv2='actions']")), -200, { ms: 400, steps: 14 });
    const c = await pointerCounts(page);
    expect(c.pointercancel ?? 0, `pointer events: ${JSON.stringify(c)}`).toBe(0);
    expect(c.pointerup ?? 0).toBe(1);
  });

  test("a finger that presses content at the top and moves UP is left to the browser: the sheet is never picked up", async ({ page }) => {
    // Chrome claims this swipe for scrolling (no pointer events reach the page), so a real swipe cannot show the
    // difference; synthetic touch pointer events can: the same press-and-move must not start a drag.
    await openSheet(page);
    await goTo(page, "full");
    await settledAt(page, (await innerH(page)) * 0.1);
    const probe = await page.evaluate(() => {
      const root = document.querySelector("[data-mv2='sheet']") as HTMLElement;
      const target = document.querySelector("[data-mv2='scroller'] [data-mv2='actions']") as HTMLElement;
      const r = target.getBoundingClientRect();
      const ev = (type: string, y: number) => new PointerEvent(type, { pointerId: 11, pointerType: "touch", isPrimary: true, clientX: r.x + 20, clientY: y, bubbles: true, cancelable: true });
      target.dispatchEvent(ev("pointerdown", r.y + 10));
      for (let i = 1; i <= 4; i++) document.dispatchEvent(ev("pointermove", r.y + 10 - 12 * i));
      const during = { transition: root.style.transition, transform: root.style.transform };
      document.dispatchEvent(ev("pointerup", r.y - 38));
      return during;
    });
    expect(probe).toEqual({ transition: "", transform: "" });
    expect(await snapOf(page)).toBe("full");
  });

  test("one history entry for the whole life of the sheet, however many swipes (Back behaviour unchanged)", async ({ page }) => {
    const { cdp } = await openSheet(page);
    const len0 = await page.evaluate(() => history.length);
    await swipe(cdp, await at(page.locator("[data-mv2='name']")), -260, { ms: 520, steps: 16 });
    await expect.poll(() => snapOf(page)).toBe("full");
    await swipe(cdp, await at(page.locator("[data-mv2='name']")), 260, { ms: 520, steps: 16 });
    await expect.poll(() => snapOf(page)).toBe("half");
    expect(await page.evaluate(() => history.length)).toBe(len0);
  });
});

test.describe("R7 content position and the mouse (phone width)", () => {
  test.describe("touch", () => {
    test.use({ viewport: { width: 360, height: 600 }, hasTouch: true, isMobile: true });
    test("leaving full puts the content back at the top (a collapsed sheet never shows scrolled content)", async ({ page }) => {
      const { h } = await openSheet(page, "contributor", SHORT);
      await goTo(page, "full");
      await settledAt(page, h * 0.1);
      await showGallery(page);
      await scroller(page).evaluate((e) => { e.scrollTop = 120; });
      expect(await scrollTopOf(page)).toBeGreaterThan(100);
      await page.locator("[data-mv2='handle']").tap();
      await expect.poll(() => snapOf(page)).toBe("half");
      expect(await scrollTopOf(page)).toBe(0);
      // and going back up, the hand-off is armed again (data-top is back)
      await page.locator("[data-mv2='handle']").tap();
      await expect.poll(() => snapOf(page)).toBe("full");
      await expect(scroller(page)).toHaveAttribute("data-top", "");
    });
  });
  test.describe("mouse", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("a mouse drag on the content at full selects text; it never hands off to the sheet", async ({ page }) => {
      const seed = seed0();
      await mockMapNetwork(page, seed);
      await mockContributorDetail(page, seed, { gallery: 3 });
      await openMap(page, "/?map=v2", 8);
      const c = seed.contributors[0];
      await jump(page, c.physical_longitude, c.physical_latitude, 15.5);
      await openPinSheet(page, c.id);
      await expect(sheet(page)).toBeVisible();
      await page.locator("[data-mv2='handle']").click();
      await expect.poll(() => snapOf(page)).toBe("full");
      const p = await at(scroller(page).locator("[data-mv2='actions']"));
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(p.x, p.y + 40 * i); await page.waitForTimeout(40); }
      await page.mouse.up();
      expect(await snapOf(page)).toBe("full");
    });
  });
});

// The photo grid's tiles hide their overflow, which ends the touch-action chain: a swipe that starts on a tile must still drag.
test.describe("R7 swipes that start on a photo tile (phone)", () => {
  test.use({ viewport: { width: 360, height: 600 }, hasTouch: true, isMobile: true });

  test("at full with the content at the top, a swipe down that starts on a tile collapses the sheet to half", async ({ page }) => {
    const { cdp, h } = await openSheet(page);
    await goTo(page, "full");
    await settledAt(page, h * 0.1);
    await showGallery(page);
    const tile = page.locator("[data-mv2='panel'] img").first();
    await swipe(cdp, await at(tile), 330, { ms: 1200, steps: 20 });
    await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("half");
  });

  test("a swipe up that starts on a tile scrolls the content, it does not collapse or lose the swipe", async ({ page }) => {
    const { cdp, h } = await openSheet(page);
    await goTo(page, "full");
    await settledAt(page, h * 0.1);
    await showGallery(page);
    await swipe(cdp, await at(page.locator("[data-mv2='panel'] img").nth(4)), -200, { ms: 400, steps: 14 });
    await expect.poll(() => scrollTopOf(page), { timeout: 3000 }).toBeGreaterThan(40);
    expect(await snapOf(page)).toBe("full");
  });
});

// Place and Event sheets share the container and the rules (their body is an EntityCard).
for (const kind of ["place", "event"] as const) {
  test.describe(`R7 swipes on a ${kind} sheet (phone)`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test(`a swipe up from the content opens it to full; a swipe down at the top collapses it again`, async ({ page }) => {
      const { cdp, h } = await openSheet(page, kind);
      const body = scroller(page).locator("[data-mv2='card']");
      await swipe(cdp, await at(body), -260, { ms: 520, steps: 16 });
      await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("full");
      await settledAt(page, h * 0.1);
      await swipe(cdp, await at(scroller(page).locator("[data-mv2='card']")), 260, { ms: 900, steps: 18 });
      await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("half");
      await settledAt(page, h * 0.6);
    });
  });
}

// D16: a touch screen of any width keeps the swipe sheet; only a wide screen with a fine pointer gets the side panel.
for (const [label, vp] of [["a phone on its side", { width: 844, height: 390 }], ["a tablet in portrait", { width: 768, height: 1024 }], ["a tablet in landscape", { width: 1024, height: 768 }]] as const) {
  test.describe(`D16 ${label} (${vp.width} x ${vp.height}, touch)`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test("gets the swipe sheet (snap points, a handle, a readable width) and the swipes work", async ({ page }) => {
      const { cdp, h } = await openSheet(page);
      await expect(sheet(page)).not.toHaveAttribute("data-wide", "1");
      await expect(page.locator("[data-mv2='handle']")).toBeVisible();
      // the map area sits right of the app's sidebar at this width: "centred" means centred in the map area
      const { box, area } = await sheet(page).evaluate((e) => {
        const r = e.getBoundingClientRect();
        const a = ((e as HTMLElement).offsetParent as HTMLElement).getBoundingClientRect();
        return { box: { x: r.x, width: r.width }, area: { x: a.x, width: a.width } };
      });
      expect(box.width, "kept to 640 px").toBeLessThanOrEqual(641);
      expect(box.x + box.width / 2, "centred in the map area").toBeCloseTo(area.x + area.width / 2, -1);
      await swipe(cdp, await at(page.locator("[data-mv2='name']")), -Math.round(h * 0.5), { ms: 700, steps: 18 });
      await expect.poll(() => snapOf(page), { timeout: 3000 }).toBe("full");
      await swipe(cdp, await at(page.locator("[data-mv2='name']")), Math.round(h * 0.5), { ms: 700, steps: 18 });
      await expect.poll(() => snapOf(page), { timeout: 3000 }).not.toBe("full");
    });
  });
}

test.describe("D16 a desktop with a mouse (1280 x 900)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("still gets the side panel, with no snap points", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 3 });
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[0];
    await jump(page, c.physical_longitude, c.physical_latitude, 15.5);
    await openPinSheet(page, c.id);
    await expect(sheet(page)).toHaveAttribute("data-wide", "1");
    await expect(sheet(page)).toHaveAttribute("data-snap", "panel");
    await expect(page.locator("[data-mv2='handle']")).toHaveCount(0);
  });
});
