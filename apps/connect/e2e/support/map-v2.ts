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

/** An SVG that stands in for a contributor photo (same origin, so the app's CSP draws it). */
export const fixtureImageUrl = (n: number) => `http://localhost:3100/fixture-img/${n}.svg`;
const fixtureSvg = (n: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${(n * 53) % 360} 45% 45%)"/><text x="150" y="215" text-anchor="middle" font-size="64" font-family="Arial" fill="#fff">${n}</text></svg>`;

/**
 * Answers GET /api/v1/contributors/<slug> (the per-slug detail the sheet fetches for its photos) and
 * the fixture images. `failFirst` makes the first N detail requests fail with a 500; `delayMs` holds
 * every detail response back, so the skeleton can be seen and measured.
 */
export async function mockContributorDetail(
  page: Page,
  seed: MapSeed,
  o: { gallery?: number; delayMs?: number; failFirst?: number; covers?: number } = {},
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
      json: { data: { profile: { ...profile, gallery_urls: gallery, cover_photo_urls: covers }, upcoming_events: [], past_events: [], places: [], counts: {} } },
    });
  });
  return { calls: () => calls };
}
