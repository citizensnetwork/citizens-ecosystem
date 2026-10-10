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
