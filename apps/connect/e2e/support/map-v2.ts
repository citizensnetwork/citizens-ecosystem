import { expect, type Locator, type Page, type Route } from "@playwright/test";
// One fixture generator for the measurement scripts and these specs (a plain .mjs;
// `allowJs` lets the typecheck read it).
import { makeSeed, smallSeed } from "../../scripts/map-v2/fixtures.mjs";

export { makeSeed, smallSeed };

/** The clock every Map v2 spec freezes, so "starts in 2 h" and dates never depend on the day it runs. */
export const FIXED_NOW = Date.UTC(2026, 9, 10, 8, 0, 0); // 2026-10-10 10:00 in Pretoria

export type MapSeed = { contributors: unknown[]; places: unknown[]; events: unknown[] };

// The seed each page is served, so the helpers below can find what a Contributor owns (a Contributor has no pin and no
// Explore card since PR 365: the map reaches them through the owner line of a place or an event they run).
const seeds = new WeakMap<Page, MapSeed>();
/** For a spec that serves its own directories: tell the helpers which seed the page shows. */
export function rememberSeed(page: Page, seed: MapSeed) {
  seeds.set(page, seed);
}
type Row = { id: string; created_by?: string | null; latitude?: number; longitude?: number; date?: string };
/** The place (else the upcoming event) a Contributor in this page's seed owns, or null when `id` is not a Contributor. */
export function ownedBy(page: Page, id: string): { id: string; lng: number; lat: number } | null {
  const seed = seeds.get(page);
  if (!seed || !(seed.contributors as Row[]).some((c) => c.id === id)) return null;
  const own = (seed.places as Row[]).find((r) => r.created_by === id)
    ?? (seed.events as Row[]).find((r) => r.created_by === id && Date.parse(r.date ?? "") >= FIXED_NOW);
  if (!own || typeof own.latitude !== "number" || typeof own.longitude !== "number") {
    throw new Error(`Contributor ${id} owns no place or upcoming event with a position in this seed: nothing on the map opens their sheet`);
  }
  return { id: own.id, lng: own.longitude, lat: own.latitude };
}
/** Bring a listing's point into the middle of the map (no animation), keeping a zoom at which its pin is drawn. */
async function centreOn(page: Page, to: { lng: number; lat: number }) {
  await page.evaluate(([lng, lat]) => {
    const m = (window as unknown as { __ccMap: { getZoom(): number; jumpTo(o: object, d: object): void } }).__ccMap;
    m.jumpTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 14) }, { originalEvent: {} });
  }, [to.lng, to.lat]);
}
/** On an open place or event sheet, the owner line opens the owner's own sheet in its place. */
async function throughOwner(page: Page, ownerId: string, how: "click" | "tap") {
  const line = page.locator(`[data-mv2='sheet'] [data-owner="${ownerId}"]`);
  await line.waitFor({ state: "visible", timeout: 10_000 });
  if (how === "tap") await line.tap();
  else await line.click();
  await expect(line).toHaveCount(0, { timeout: 5_000 });
}

/**
 * Hermetic network for the map screen: config.js, MapTiler and /api/** answered locally, the
 * three public directories served from `seed`, a guest session so the landing is skipped, and
 * `Date.now()` frozen. Nothing reaches the real Supabase project or MapTiler.
 */
export async function mockMapNetwork(
  page: Page,
  seed: MapSeed = smallSeed(FIXED_NOW),
  extra?: (page: Page) => Promise<void>,
) {
  seeds.set(page, seed);
  await page.clock.setFixedTime(FIXED_NOW);
  await page.route("**/config.js", (route: Route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__CC_ENV = ${JSON.stringify({
        SUPABASE_URL: "",
        SUPABASE_ANON_KEY: "",
        API_BASE_URL: "",
        MAPTILER_KEY: "e2e-test-key",
        MAPTILER_STYLE: "streets-v2",
      })};`,
    }),
  );
  await page.route("**/api.maptiler.com/**", (route: Route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [], features: [] } }),
  );
  await page.route("**/api/**", (route: Route) => route.fulfill({ json: { data: [] } }));
  for (const key of ["contributors", "places", "events"] as const) {
    const rows = seed[key];
    await page.route(`**/api/v1/${key}?**`, (route: Route) =>
      route.fulfill({ json: { data: rows, meta: { count: rows.length, limit: 100, offset: 0 } } }),
    );
  }
  if (extra) await extra(page);
  await page.addInitScript(() => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: "citizen" }));
  });
}

/**
 * Open the map screen and wait until the MapLibre instance and `min` markers exist, and map-v2.css has painted (the
 * app turns motion on only then, data-mv2-motion: before it, panels still sit where an unstyled page puts them).
 */
export async function openMap(page: Page, path = "/", min = 1) {
  await page.goto(path);
  await page.waitForSelector('[data-screen="discover"]', { timeout: 20_000 });
  await page.waitForFunction(
    (n) => !!(window as unknown as { __ccMap?: unknown }).__ccMap && document.querySelectorAll(".maplibregl-marker").length >= n
      && document.documentElement.hasAttribute("data-mv2-motion"),
    min,
    { timeout: 20_000 },
  );
}

/**
 * Wait until the home screen has stopped rearranging itself: the map is not moving, every pin sits where it will stay, and the
 * Explore row has ranked its cards and shown their distances (it ranks once, when the map first says where it is). A slow
 * machine (CI) does all of this AFTER the pins first appear, so a spec that measures a point on bare map, or presses a card,
 * straight after openMap() can find a pin or a different card under its finger. Call this before measuring or pressing.
 */
export async function mapSettled(page: Page) {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __ccMap?: { isMoving(): boolean }; __settle?: { sig: string; at: number } };
      if (!w.__ccMap || w.__ccMap.isMoving()) return false;
      const pins = [...document.querySelectorAll(".maplibregl-marker")]
        .map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; })
        .join("|");
      const explore = document.querySelector("[data-mv2='explore']");
      const cards = explore ? [...explore.querySelectorAll("[data-explore-id]")].map((e) => e.getAttribute("data-explore-id")).join(",") : "";
      // the row shows a distance on every card once it knows where the map is
      if (explore && cards && !/\d\s?(km|m)\b/.test(explore.textContent ?? "")) return false;
      // the panel's own height and the first card's width too: web fonts arriving late (a slow runner) resize the text, and with it the
      // panel and the open map above it, which moves the pins a moment after everything looked still
      const panel = Math.round(explore ? explore.getBoundingClientRect().height : 0);
      const card1 = Math.round(explore?.querySelector("[data-explore-id]")?.getBoundingClientRect().width ?? 0);
      const sig = `${pins}#${cards}#${panel}#${card1}#${document.fonts ? document.fonts.status : ""}`;
      const now = performance.now();
      if (!w.__settle || w.__settle.sig !== sig) { w.__settle = { sig, at: now }; return false; }
      return now - w.__settle.at > 500;
    },
    undefined,
    { polling: 100, timeout: 20_000 },
  );
}

/**
 * Founder, 2026-11-17: a phone's Explore panel rests on the crown (a wide screen's on the Where to… strip), and only the
 * OPEN panel lists every row and shows the sticky nav. The crown shows the strip; the handle opens the rest.
 */
export async function openExploreAll(page: Page, how: "click" | "tap" = "click") {
  // Raised pinpeek covers Explore; Close it before opening the panel (2nd-tap surface, 2026-11-22).
  const peek = page.locator("[data-mv2='pinpeek']:not([hidden])");
  if (await peek.count()) {
    const close = page.locator("[data-mv2='pinpeek-close']");
    if (how === "tap") await close.tap();
    else await close.click();
    await expect(peek).toHaveCount(0, { timeout: 5_000 });
  }
  const explore = page.locator("[data-mv2='explore']");
  if ((await explore.getAttribute("data-open")) !== null) return;
  const press = (l: Locator) => (how === "tap" ? l.tap() : l.click());
  // Minimize-with-filter (founder, 2026-11-22): grab only toggles rest↔focus while a chip is on.
  // Clear it so the handle can raise the full open panel again.
  const chipX = page.locator("[data-mv2='filter-chip-x']");
  if (await chipX.count()) {
    if (how === "tap") await chipX.tap();
    else await chipX.click();
    await expect(page.locator("[data-mv2='filter-chip']")).toHaveCount(0, { timeout: 5_000 });
  }
  if ((await explore.getAttribute("data-mode")) === "rest") {
    await press(page.locator("[data-mv2='explore-crown']"));
    await expect(explore).not.toHaveAttribute("data-mode", "rest", { timeout: 5_000 });
  }
  await press(page.locator("[data-mv2='explore-grab']"));
  await expect(explore).toHaveAttribute("data-open", "", { timeout: 5_000 });
}

/**
 * Issue #210: a pin no longer opens the sheet; a CARD in the Explore panel does. Its first tap chooses it (its row takes
 * the panel over and its pin glows, founder 2026-11-17); the second tap opens the preview. Both taps are real ones, by a
 * mouse or, with `how: "tap"`, by touch. Without a panel (the clean map), the pin is pressed by a DOM click.
 */
export async function openListing(page: Page, id: string, how: "click" | "tap" = "click") {
  // the Explore panel hides behind an open listing: close it first (Escape closes the sheet at once and gives its entry back)
  const open = page.locator("[data-mv2='sheet']");
  if (await page.locator("[data-mv2='explore']").count() && await open.count()) {
    await page.keyboard.press("Escape");
    await expect(open).toHaveCount(0, { timeout: 5_000 });
  }
  // a Contributor: open the place (or event) they own, then its owner line
  const own = ownedBy(page, id);
  if (own) {
    await centreOn(page, own);
    await openListing(page, own.id, how);
    await throughOwner(page, id, how);
    return;
  }
  await mapSettled(page);
  const explore = page.locator("[data-mv2='explore']");
  if (await explore.count()) {
    await openExploreAll(page, how);
    const card = () => page.locator(`[data-mv2='explore'] [data-explore-id="${id}"]`).first();
    await card().waitFor({ state: "visible", timeout: 10_000 });
    // a card still chosen from an earlier opening says "Tap again to open": one tap does it
    const chosen = (await card().getAttribute("data-selected")) !== null;
    if (!chosen) {
      if (how === "tap") await card().tap();
      else await card().click();
      await expect(card()).toHaveAttribute("data-selected", "", { timeout: 5_000 });
    }
    if (how === "tap") await card().tap();
    else await card().click();
    return;
  }
  const pin = page.locator(`.maplibregl-marker[data-cc-id="${id}"]`);
  if (how === "tap") await pin.tap({ force: true });
  else await pin.click({ force: true });
}

/**
 * Founder, 2026-11-17: the map home has no account button; its actions are in the nav's Me. On a wide screen Me is in
 * the nav beside the search bar; on a phone it is in the sticky nav of the open Explore panel. This opens that menu.
 */
export async function openMe(page: Page) {
  // already open (Me toggles, so pressing it again would close it)
  if (await page.getByRole("button", { name: "View Profile" }).isVisible()) return;
  const rail = page.locator("[data-mv2='desktop-item'][data-nav='me']");
  if (await rail.isVisible()) {
    await rail.click();
    return;
  }
  await openExploreAll(page);
  await page.locator("[data-mv2='explore-dock'] [data-nav='me']").click();
}

/**
 * #210 part 2: a card opens the EXPANDED sheet (full only; swipe down goes back to the row). The half / peek sheet is
 * what a pin opens on the clean map (the nav's Map), so a spec about snap states, the handle or the scroll hand-off
 * switches to that map first (no Explore row, no pills; the map and its pins stay as they are) and presses the pin.
 * The switch is an in-app navigation: call toCleanMap before measuring history.length.
 */
export async function toCleanMap(page: Page) {
  await page.evaluate(() => (window as unknown as { __cc: { go: (p: string, q: object) => void } }).__cc.go("home", { view: "map" }));
  await page.locator("[data-mv2='explore']").waitFor({ state: "detached", timeout: 10_000 });
}
export async function openPinSheet(page: Page, id: string, how: "click" | "tap" = "click") {
  if (await page.locator("[data-mv2='explore']").count()) await toCleanMap(page);
  // a Contributor has no pin: open the place (or event) they own, then its owner line
  const own = ownedBy(page, id);
  if (own) {
    await centreOn(page, own);
    await openPinSheet(page, own.id, how);
    await throughOwner(page, id, how);
    return;
  }
  const pin = page.locator(`.maplibregl-marker[data-cc-id="${id}"]`);
  if (how === "tap") await pin.tap({ force: true });
  else await pin.click({ force: true });
}

/**
 * A point on BARE map for a two-finger gesture: in the open map between the top bar and the Explore row (#210), on a
 * line where nothing but the map canvas sits for `span` px either side of the centre. A touch that starts on a pin or
 * an overlay is not the map's, and the home now frames its pins in exactly that open middle.
 */
export async function bareMapPoint(page: Page, span = 120): Promise<{ x: number; y: number }> {
  await mapSettled(page);
  const pt = await page.evaluate((half) => {
    const x = window.innerWidth / 2;
    const top = document.querySelector("[data-mv2='home-top']")?.getBoundingClientRect().bottom ?? 0;
    const row = document.querySelector("[data-mv2='explore']")?.getBoundingClientRect().top ?? window.innerHeight;
    const bare = (px: number, py: number) => !!document.elementFromPoint(px, py)?.classList.contains("maplibregl-canvas");
    for (let y = Math.round(top + 30); y < row - 30; y += 6) {
      let ok = true;
      for (let dx = -half; dx <= half && ok; dx += 10) ok = bare(x + dx, y) && bare(x + dx, y - 22) && bare(x + dx, y + 22);
      if (ok) return { x, y };
    }
    return null;
  }, span);
  if (!pt) throw new Error("no bare stretch of map for a two-finger gesture");
  return pt;
}

/** An SVG that stands in for a contributor photo (same origin, so the app's CSP draws it). */
export const fixtureImageUrl = (n: number) => `http://localhost:3100/fixture-img/${n}.svg`;
const fixtureSvg = (n: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${(n * 53) % 360} 45% 45%)"/><text x="150" y="215" text-anchor="middle" font-size="64" font-family="Arial" fill="#fff">${n}</text></svg>`;

/**
 * Answers GET /api/v1/contributors/<slug> (the per-slug detail the sheet fetches for its photos) and
 * the fixture images. `failFirst` makes the first N detail requests fail with a 500; `delayMs` holds
 * every detail response back, so the skeleton can be seen and measured. `past` adds that many past events
 * (newest first, as the API sorts them), `followers` sets `counts.followers` and `moments` is the list of live notes.
 */
export async function mockContributorDetail(
  page: Page,
  seed: MapSeed,
  o: { gallery?: number; delayMs?: number; failFirst?: number; covers?: number; past?: number; followers?: number; moments?: Record<string, unknown>[] } = {},
) {
  let calls = 0;
  await page.route("**/fixture-img/*.svg", (route: Route) => {
    const n = Number(/(\d+)\.svg/.exec(route.request().url())?.[1] ?? 0);
    return route.fulfill({ contentType: "image/svg+xml", body: fixtureSvg(n) });
  });
  await page.route("**/api/v1/contributors/*", async (route: Route) => {
    const slug = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const profile = (seed.contributors as { contributor_slug: string }[]).find((c) => c.contributor_slug === slug);
    calls++;
    if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
    if (o.failFirst && calls <= o.failFirst) return route.fulfill({ status: 500, json: { error: "boom" } });
    if (!profile) return route.fulfill({ status: 404, json: { error: "Contributor not found" } });
    const gallery = Array.from({ length: o.gallery ?? 0 }, (_, i) => fixtureImageUrl(i + 1));
    const covers = Array.from({ length: o.covers ?? 0 }, (_, i) => ({ url: fixtureImageUrl(100 + i), caption: `Cover ${i + 1}` }));
    return route.fulfill({
      json: {
        data: {
          profile: { ...profile, gallery_urls: gallery, cover_photo_urls: covers },
          upcoming_events: [],
          past_events: Array.from({ length: o.past ?? 0 }, (_, i) => ({
            id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
            title: `Past gathering ${i + 1}`,
            date: new Date(FIXED_NOW - (i + 1) * 3 * 86_400_000).toISOString(),
            end_time: null,
            location: `${i + 1} Example Road, Pretoria`,
          })),
          places: [],
          moments: o.moments ?? [],
          counts: o.followers === undefined ? {} : { followers: o.followers },
        },
      },
    });
  });
  return { calls: () => calls };
}

/**
 * Wait until `locator` (a control inside the Map v2 sheet) has stopped moving, then return its box.
 * The sheet slides up, and its content (the detail request, the gallery, the follower count) can still change the layout
 * after it is visible; a tap aimed at a box measured mid-move lands beside the button. So the sheet must have no running
 * animation or transition, and the box must agree with itself over `samples` consecutive looks `gapMs` apart. On a slow
 * machine the first quiet moment can be a pause before the next frame, hence several looks and not two. Measure again
 * right before EVERY tap: a toast or a label change can move things between two taps.
 */
export async function stillBox(page: Page, locator: Locator, { samples = 4, gapMs = 60 } = {}) {
  const sheet = page.locator("[data-mv2='sheet']");
  await expect
    .poll(
      async () => {
        const running = await sheet.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length);
        if (running > 0) return 99;
        let prev = await locator.boundingBox();
        let worst = 0;
        for (let i = 0; i < samples; i++) {
          await page.waitForTimeout(gapMs);
          const next = await locator.boundingBox();
          if (!prev || !next) return 99;
          worst = Math.max(worst, Math.abs(prev.x - next.x) + Math.abs(prev.y - next.y) + Math.abs(prev.width - next.width) + Math.abs(prev.height - next.height));
          prev = next;
        }
        return worst;
      },
      { message: "the control never stopped moving", timeout: 20_000 },
    )
    .toBeLessThan(0.5);
  return (await locator.boundingBox())!;
}
