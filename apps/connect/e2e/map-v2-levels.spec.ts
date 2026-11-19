import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, mapSettled, makeSeed, FIXED_NOW } from "./support/map-v2";

// The map home's levels (founder, 2026-11-18): 0 the crown alone; 1 the search bar open with ONE row of small category
// chips; 2 a pin tapped, its card and its neighbours in the pin carousel; 3 the chosen card tapped again, the carousel
// raised with its details. Each level is one history entry: Back steps back one level and puts the map, the pin and the
// card back. The crown, the carousel's Close and a tap on empty map go straight to level 0 and leave no entry behind.
// PP_SHOTS=<dir> also saves a screenshot of each level (for the pull request).

type Row = Record<string, unknown> & { id: string };
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };
const seedOf = () => makeSeed({ contributors: 6, places: 8, events: 6, now: FIXED_NOW, spread: 0.02, seed: 23 }) as unknown as Seed;

type Cam = { lng: number; lat: number; zoom: number };
type MapLike = {
  getCenter(): { lng: number; lat: number }; getZoom(): number; isMoving(): boolean;
  jumpTo(o: object, d: object): void; getContainer(): HTMLElement;
};

async function open(page: Page) {
  const seed = seedOf();
  await mockMapNetwork(page, seed);
  await openMap(page, "/", 5);
  await mapSettled(page);
  // over the middle of the listings, close enough that every pin is drawn, and still for the rest of the test
  const pts = [...seed.places, ...seed.events].filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number");
  const lat = pts.reduce((t, r) => t + (r.latitude as number), 0) / pts.length;
  const lng = pts.reduce((t, r) => t + (r.longitude as number), 0) / pts.length;
  await page.evaluate(([x, y]) => {
    const m = (window as unknown as { __ccMap: MapLike }).__ccMap;
    m.jumpTo({ center: [x, y], zoom: 13.6 }, { originalEvent: {} });
  }, [lng, lat]);
  await idle(page);
}
/**
 * The map has settled: not moving, and its camera unchanged for 300 ms. A carousel choice eases the map one frame later
 * (requestAnimationFrame), so "not moving" alone can be read in the frame before an ease begins (CI saw that).
 */
async function idle(page: Page) {
  await page.waitForFunction(() => {
    const w = window as unknown as { __ccMap: MapLike; __idle?: { sig: string; at: number } };
    const m = w.__ccMap;
    if (m.isMoving()) { w.__idle = undefined; return false; }
    const c = m.getCenter();
    const sig = `${c.lng.toFixed(9)},${c.lat.toFixed(9)},${m.getZoom().toFixed(6)}`;
    const now = performance.now();
    if (!w.__idle || w.__idle.sig !== sig) { w.__idle = { sig, at: now }; return false; }
    return now - w.__idle.at > 300;
  }, undefined, { polling: 50, timeout: 15_000 });
}
const cam = (page: Page) => page.evaluate(() => {
  const m = (window as unknown as { __ccMap: MapLike }).__ccMap;
  const c = m.getCenter();
  return { lng: c.lng, lat: c.lat, zoom: m.getZoom() } as Cam;
});
const sameCam = (a: Cam, b: Cam) => {
  expect(Math.abs(a.lng - b.lng)).toBeLessThan(1e-6);
  expect(Math.abs(a.lat - b.lat)).toBeLessThan(1e-6);
  expect(Math.abs(a.zoom - b.zoom)).toBeLessThan(1e-3);
};
/** Our own depth in history (store.jsx writes { cc, idx, guard } into history.state). */
const depth = (page: Page) => page.evaluate(() => {
  const st = window.history.state as { idx?: number; guard?: boolean } | null;
  return { idx: st && typeof st.idx === "number" ? st.idx : 0, guard: !!(st && st.guard), length: window.history.length };
});
/** The pins on screen, clear of the top bar and of the foot (where the crown or the carousel sits). */
async function visiblePins(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(".maplibregl-marker[data-cc-id]").forEach((el) => {
      if (el.style.display === "none") return;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 30 || x > window.innerWidth - 30 || y < 120 || y > window.innerHeight - 280) return;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit)) out.push(el.getAttribute("data-cc-id")!);
    });
    return out;
  });
}
async function tapPin(page: Page, id: string) {
  const box = (await page.locator(`.maplibregl-marker[data-cc-id="${id}"]`).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
/** A point on bare map (no pin, no control, no panel), in the open part of the map. */
async function bareMap(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".maplibregl-canvas");
    for (let y = 140; y < window.innerHeight / 2; y += 23) {
      for (let x = 40; x < window.innerWidth - 40; x += 31) {
        const hit = document.elementFromPoint(x, y);
        if (hit !== canvas) continue;
        // and no pin within reach of a fingertip
        const near = [...document.querySelectorAll<HTMLElement>(".maplibregl-marker")].some((el) => {
          const r = el.getBoundingClientRect();
          return el.style.display !== "none" && x > r.left - 30 && x < r.right + 30 && y > r.top - 30 && y < r.bottom + 30;
        });
        if (!near) return { x, y };
      }
    }
    return null;
  });
}
const peek = (page: Page) => page.locator("[data-mv2='pinpeek']");
const cards = (page: Page) => page.locator("[data-mv2='pinpeek'] [data-mv2='xcard']");
const chosenCard = (page: Page) => page.locator("[data-mv2='pinpeek'] [data-mv2='xcard'][data-selected]");
const pinSelected = (page: Page, id: string) => page.locator(`.maplibregl-marker[data-cc-id="${id}"] .mv2-pin.is-selected`);
async function shot(page: Page, name: string) {
  const dir = process.env.PP_SHOTS;
  if (!dir) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${dir}/${name}.png` });
}
/** Wait for the carousel to stop sliding (it moves by a transform transition). */
async function still(page: Page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const top = await peek(page).evaluate((e) => Math.round(e.getBoundingClientRect().top));
    if (top === last) return top;
    last = top;
    await page.waitForTimeout(60);
  }
  return last;
}

for (const size of [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1280, height: 800 }]) {
  test.describe(`map home levels (${size.name})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("level 1: the search bar's categories are one row of small chips that scrolls sideways", async ({ page }) => {
      await open(page);
      await shot(page, `${size.name}-0-rest`);
      if (size.name === "phone") await page.getByRole("button", { name: "Search", exact: true }).click();
      else await page.getByRole("textbox", { name: "Search events, places, people…" }).click();
      const row = page.getByRole("radiogroup", { name: "Filter the map by category" });
      await expect(row).toBeVisible();
      const chips = row.getByRole("radio");
      expect(await chips.count()).toBeGreaterThanOrEqual(6);
      const boxes = await chips.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: r.height }; }));
      // one row, all the same height, and small (32px to the eye)
      expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
      for (const b of boxes) expect(b.h).toBeLessThanOrEqual(34);
      // the tap target still reaches 44px: the middle of the strip just above a chip is that chip's
      const reach = await chips.first().evaluate((e) => {
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top - 5);
        return !!hit && (hit === e || e.contains(hit));
      });
      expect(reach).toBe(true);
      expect(await row.evaluate((e) => getComputedStyle(e).touchAction)).toBe("pan-x");
      if (size.name === "phone") {
        // sideways: more chips than fit, and the row scrolls (a swipe, or a trackpad's sideways wheel)
        expect(await row.evaluate((e) => e.scrollWidth > e.clientWidth + 20)).toBe(true);
        const box = (await row.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(240, 0);
        await expect.poll(() => row.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
      }
      await shot(page, `${size.name}-1-search`);
      // choosing a chip filters the map; Back closes the search (one level) and the chip says what is on
      const last = chips.last();
      await last.scrollIntoViewIfNeeded();
      await last.click();
      await expect(last).toHaveAttribute("aria-checked", "true");
      await page.goBack();
      await expect(row).toHaveCount(0);
      await expect(page.locator("[data-mv2='filter-chip']")).toBeVisible();
    });

    test("level 2: a pin opens the carousel at that pin; arrows and swipes choose its neighbours", async ({ page }) => {
      await open(page);
      const before = await depth(page);
      const pins = await visiblePins(page);
      expect(pins.length).toBeGreaterThanOrEqual(3);
      await tapPin(page, pins[0]);
      await expect(peek(page)).toBeVisible();
      await expect(cards(page).first()).toHaveAttribute("data-explore-id", pins[0]);
      await expect(chosenCard(page)).toHaveAttribute("data-explore-id", pins[0]);
      await expect(pinSelected(page, pins[0])).toBeAttached();
      expect(await cards(page).count()).toBeGreaterThanOrEqual(3);
      // one history entry for the level
      expect((await depth(page)).idx).toBe(before.idx + 1);
      await still(page);
      await shot(page, `${size.name}-2-carousel`);

      // the arrow chooses the next card, and its pin lights instead
      await page.getByRole("button", { name: "Next on the map" }).click();
      const second = await cards(page).nth(1).getAttribute("data-explore-id");
      await expect(chosenCard(page)).toHaveAttribute("data-explore-id", second!);
      await expect(pinSelected(page, second!)).toBeAttached();
      await expect(pinSelected(page, pins[0])).toHaveCount(0);
      await expect(page.locator("[data-mv2='pinpeek-count']")).toContainText("2 of");
      await page.getByRole("button", { name: "Previous on the map" }).click();
      await expect(chosenCard(page)).toHaveAttribute("data-explore-id", pins[0]);
      // no arrow points past either end
      await expect(page.getByRole("button", { name: "Previous on the map" })).toHaveCount(0);

      // a sideways swipe (a trackpad's sideways wheel here) chooses the card it settles on
      const row = page.locator("[data-row='peek']");
      const box = (await row.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(400, 0);
      await expect.poll(async () => (await chosenCard(page).getAttribute("data-explore-id")) !== pins[0], { timeout: 5_000 }).toBe(true);
      const swiped = await chosenCard(page).getAttribute("data-explore-id");
      await expect(pinSelected(page, swiped!)).toBeAttached();
      // the swipe stays on the same level: no new history entry
      expect((await depth(page)).idx).toBe(before.idx + 1);
    });

    test("level 3: a second tap raises the carousel with the card's details; Back restores the camera, pin and card", async ({ page }) => {
      await open(page);
      const start = await depth(page);
      const pins = await visiblePins(page);
      const atTap = await cam(page);
      await tapPin(page, pins[0]);
      await expect(peek(page)).toBeVisible();
      await page.getByRole("button", { name: "Next on the map" }).click();
      const second = (await chosenCard(page).getAttribute("data-explore-id"))!;
      await idle(page);
      const atRaise = await cam(page);
      // the chosen card says what its next tap does; that tap raises the panel
      await expect(chosenCard(page)).toContainText("Tap again for details");
      await chosenCard(page).click();
      await expect(peek(page)).toHaveAttribute("data-raised", "");
      const details = page.locator("[data-mv2='pinpeek-details'] [data-mv2='sheet'][data-inline]");
      await expect(details).toBeVisible();
      await expect(details.locator("[data-mv2='name']")).toBeFocused();
      await expect(page.locator("[data-mv2='pinpeek-bar']").getByRole("button", { name: "Back", exact: true })).toBeVisible();
      expect((await depth(page)).idx).toBe(start.idx + 2);
      // the raised panel is most of the screen, the cards above the details
      const raisedTop = await still(page);
      expect(raisedTop).toBeLessThan(size.height * 0.2);
      await shot(page, `${size.name}-3-details`);

      // the person moves the map while reading; Back puts it, the card and the pin back as they were when it rose
      await page.evaluate(() => {
        const m = (window as unknown as { __ccMap: MapLike }).__ccMap;
        const c = m.getCenter();
        m.jumpTo({ center: [c.lng + 0.01, c.lat - 0.01], zoom: m.getZoom() - 1 }, { originalEvent: {} });
      });
      await page.goBack();
      await expect(peek(page)).not.toHaveAttribute("data-raised", "");
      await expect(chosenCard(page)).toHaveAttribute("data-explore-id", second);
      await expect(pinSelected(page, second)).toBeAttached();
      await idle(page);
      sameCam(await cam(page), atRaise);
      // and once more: the carousel closes, nothing is chosen, and the map is where the pin was tapped
      await page.goBack();
      await expect(peek(page)).toHaveCount(0);
      await expect(page.locator(".mv2-pin.is-selected")).toHaveCount(0);
      await idle(page);
      sameCam(await cam(page), atTap);
      expect((await depth(page)).idx).toBe(start.idx);
    });

    test("the raised panel's Back button and a pull down each step back one level", async ({ page }) => {
      await open(page);
      const start = await depth(page);
      const pins = await visiblePins(page);
      await tapPin(page, pins[1]);
      await chosenCard(page).click();
      await expect(peek(page)).toHaveAttribute("data-raised", "");
      await page.locator("[data-mv2='pinpeek-bar']").getByRole("button", { name: "Back", exact: true }).click();
      await expect(peek(page)).not.toHaveAttribute("data-raised", "");
      await expect(chosenCard(page)).toHaveAttribute("data-explore-id", pins[1]);
      await expect.poll(async () => (await depth(page)).idx).toBe(start.idx + 1);
      // a pull down on the lowered carousel closes it
      await still(page);
      const bar = (await page.locator("[data-mv2='pinpeek-count']").boundingBox())!;
      await page.mouse.move(bar.x + 10, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(bar.x + 10, bar.y + 90, { steps: 6 });
      await page.mouse.up();
      await expect(peek(page)).toHaveCount(0);
      await expect.poll(async () => (await depth(page)).idx).toBe(start.idx);
    });

    test("the crown and a tap on empty map go straight back to the crown alone, leaving no history behind", async ({ page }) => {
      await open(page);
      const start = await depth(page);
      const pins = await visiblePins(page);
      const reset = async () => {
        await expect(peek(page)).toHaveCount(0);
        await expect(page.getByRole("radiogroup", { name: "Filter the map by category" })).toHaveCount(0);
        await expect(page.locator("[data-mv2='explore-host']")).toHaveAttribute("data-mode", size.name === "phone" ? "rest" : "strip");
        if (size.name === "phone") await expect(page.locator("[data-mv2='home-search']")).toHaveCount(0);
        await expect(page.locator(".mv2-pin.is-selected")).toHaveCount(0);
        // every level's entry is gone: Back from here would leave the map home, not walk through dead entries
        await expect.poll(async () => depth(page)).toEqual(expect.objectContaining({ idx: start.idx, guard: false }));
      };
      const climb = async () => {
        if (size.name === "phone") await page.getByRole("button", { name: "Search", exact: true }).click();
        else await page.getByRole("textbox", { name: "Search events, places, people…" }).click();
        await expect(page.getByRole("radiogroup", { name: "Filter the map by category" })).toBeVisible();
        await tapPin(page, pins[0]);
        await chosenCard(page).click();
        await expect(peek(page)).toHaveAttribute("data-raised", "");
        expect((await depth(page)).idx).toBe(start.idx + 3);
      };

      await climb();
      // raised, the crown is out of the way: the bar's Close goes home
      await peek(page).getByRole("button", { name: "Close and go back to the map" }).click();
      await reset();

      await climb();
      await page.locator("[data-mv2='pinpeek-bar']").getByRole("button", { name: "Back", exact: true }).click();
      await expect(peek(page)).not.toHaveAttribute("data-raised", "");
      // lowered, the crown rides the carousel's top edge (a phone) or heads the nav beside the search bar (desktop)
      const crown = size.name === "phone" ? page.locator("[data-mv2='explore-crown']") : page.locator("[data-mv2='desktop-crown']");
      if (size.name === "phone") {
        // both slide by transform: measure once neither moves
        await expect.poll(async () => {
          const top = await still(page);
          const c = (await crown.boundingBox())!;
          return Math.abs(c.y + c.height / 2 - top);
        }, { timeout: 5_000 }).toBeLessThan(6);
      }
      await crown.click();
      await reset();

      // a tap on bare map, from the carousel
      await tapPin(page, pins[0]);
      await expect(peek(page)).toBeVisible();
      const spot = await bareMap(page);
      expect(spot).not.toBeNull();
      await page.mouse.click(spot!.x, spot!.y);
      await reset();
      // from the Where to… strip too (a phone: a wide screen rests on its strip)
      if (size.name === "phone") {
        await page.locator("[data-mv2='explore-crown']").click();
        await expect(page.locator("[data-mv2='explore-host']")).toHaveAttribute("data-mode", "strip");
        const spot1 = (await bareMap(page))!;
        await page.mouse.click(spot1.x, spot1.y);
        await expect(page.locator("[data-mv2='explore-host']")).toHaveAttribute("data-mode", "rest");
      }
      // a pan is not a tap: it leaves the carousel where it is
      await tapPin(page, pins[0]);
      await expect(peek(page)).toBeVisible();
      const spot2 = (await bareMap(page))!;
      await page.mouse.move(spot2.x, spot2.y);
      await page.mouse.down();
      await page.mouse.move(spot2.x + 60, spot2.y + 40, { steps: 8 });
      await page.mouse.up();
      await expect(peek(page)).toBeVisible();
    });
  });
}
