import type { Page, Route } from "@playwright/test";
// One fixture generator for the measurement scripts and these specs (a plain .mjs;
// `allowJs` lets the typecheck read it).
import { makeSeed, smallSeed } from "../../scripts/map-v2/fixtures.mjs";

export { makeSeed, smallSeed };

/** The clock every Map v2 spec freezes, so "starts in 2 h" and dates never depend on the day it runs. */
export const FIXED_NOW = Date.UTC(2026, 9, 10, 8, 0, 0); // 2026-10-10 10:00 in Pretoria

export type MapSeed = { contributors: unknown[]; places: unknown[]; events: unknown[] };

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

/** Open the map screen and wait until the MapLibre instance and `min` markers exist. */
export async function openMap(page: Page, path = "/", min = 1) {
  await page.goto(path);
  await page.waitForSelector('[data-screen="discover"]', { timeout: 20_000 });
  await page.waitForFunction(
    (n) => !!(window as unknown as { __ccMap?: unknown }).__ccMap && document.querySelectorAll(".maplibregl-marker").length >= n,
    min,
    { timeout: 20_000 },
  );
}

/**
 * Issue #210: a pin no longer opens the sheet. It scrolls the Explore row to its card and outlines it; the CARD opens
 * the sheet. This does both. The pin is pressed by a DOM click, because the row can cover a pin near the foot of the
 * screen (a spec that centres the map on a pin puts it right behind the row); the card is then pressed for real,
 * by a mouse or, with `how: "tap"`, by a touch tap, so the gesture that opens the sheet is a real one.
 */
export async function openListing(page: Page, id: string, how: "click" | "tap" = "click") {
  const card = page.locator(`[data-mv2='explore'] [data-explore-id="${id}"][data-selected] [data-mv2='card2']`);
  // a closed sheet leaves its card outlined; pressing the pin again would toggle that off, so press it only when needed
  if (!(await card.count())) await page.locator(`.maplibregl-marker[data-cc-id="${id}"]`).dispatchEvent("click");
  await card.waitFor({ state: "visible", timeout: 10_000 });
  // the row glides the card to its start; press it once it has stopped
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const w = window as unknown as { __mv2x?: number };
      const x = el.getBoundingClientRect().left;
      const still = w.__mv2x === x;
      w.__mv2x = x;
      return still;
    },
    `[data-mv2='explore'] [data-explore-id="${id}"] [data-mv2='card2']`,
    { polling: 100, timeout: 5_000 },
  );
  if (how === "tap") await card.tap();
  else await card.click();
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
