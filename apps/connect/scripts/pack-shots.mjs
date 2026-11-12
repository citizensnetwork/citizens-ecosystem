// Side-by-side shots for packs 02, 03 and 07. The VM cannot reach Supabase, so
// every /api route is answered here. Run against the Connect dev server:
//   node scripts/pack-shots.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { smallSeed } from "./map-v2/fixtures.mjs";

const PORT = Number(process.env.E2E_PORT) || 3100;
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.PACK_SHOTS_DIR || "/opt/cursor/artifacts/pack-shots";
const NOW = Date.UTC(2026, 9, 10, 8, 0, 0);

function svg(n) {
  const hue = (n * 53) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="hsl(${hue} 42% 42%)"/><circle cx="400" cy="230" r="90" fill="hsl(${hue} 30% 70%)"/><text x="400" y="250" text-anchor="middle" font-size="42" font-family="sans-serif" fill="#fffdf8">${n}</text></svg>`;
}

function withPhotos(seed) {
  seed.events.forEach((row, i) => { row.image_url = `${BASE}/fixture-img/${i + 1}.svg`; });
  seed.places.forEach((row, i) => { row.image_url = `${BASE}/fixture-img/${i + 10}.svg`; });
  seed.contributors.forEach((row, i) => { row.logo_url = `${BASE}/fixture-img/${i + 20}.svg`; });
  return seed;
}

async function mock(page, seed) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/config.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.__CC_ENV = ${JSON.stringify({
      SUPABASE_URL: "", SUPABASE_ANON_KEY: "", API_BASE_URL: "",
      MAPTILER_KEY: "e2e-test-key", MAPTILER_STYLE: "streets-v2",
    })};`,
  }));
  await page.route("**/api.maptiler.com/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  await page.route("**/fixture-img/*.svg", (route) => {
    const n = Number(/(\d+)\.svg/.exec(route.request().url())?.[1] ?? 1);
    return route.fulfill({ contentType: "image/svg+xml", body: svg(n) });
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: { data: [], conversations: [] } }));
  for (const key of ["contributors", "places", "events"]) {
    const rows = seed[key];
    await page.route(`**/api/v1/${key}**`, (route) => route.fulfill({
      json: { data: rows, meta: { count: rows.length, limit: 100, offset: 0 } },
    }));
  }
  await page.addInitScript(() => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: "citizen" }));
  });
}

async function theme(page, mode) {
  await page.evaluate((mode) => {
    if (mode === "dark") localStorage.setItem("citizens-theme", "Dark");
    else localStorage.removeItem("citizens-theme");
    if (window.MapV2 && window.MapV2.setThemePref) window.MapV2.setThemePref(mode === "dark" ? "Dark" : "System");
    document.documentElement.setAttribute("data-theme", mode === "dark" ? "dark" : "light");
  }, mode);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("wrote", name);
}

async function openPin(page) {
  await page.goto(BASE + "/");
  await page.waitForSelector("[data-screen='discover']", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".maplibregl-marker").length >= 1, null, { timeout: 20000 });
  const pin = page.locator(".maplibregl-marker").first();
  await pin.evaluate((el) => {
    const hit = el.querySelector(".marker-hit");
    (hit instanceof HTMLElement ? hit : el).click();
  });
  await page.locator(".cn-conveyor").waitFor({ state: "visible", timeout: 10000 });
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const seed = withPhotos(smallSeed(NOW));
  const browser = await chromium.launch();
  const sizes = [
    ["390", { width: 390, height: 844 }],
    ["1280", { width: 1280, height: 900 }],
  ];
  for (const mode of ["light", "dark"]) {
    for (const [label, viewport] of sizes) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await mock(page, seed);
      if (mode === "dark") {
        await page.addInitScript(() => localStorage.setItem("citizens-theme", "Dark"));
      }
      await openPin(page);
      await theme(page, mode);
      await page.waitForTimeout(400);
      await shot(page, `${mode}-02-conveyor-${label}`);
      await page.locator(".cn-preview.selected .preview-tap").click();
      await page.locator(".cn-big").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(250);
      await shot(page, `${mode}-02-big-${label}`);
      await page.locator(".full-profile-button").click();
      await page.locator(".listing-profile").waitFor({ state: "visible", timeout: 10000 });
      await shot(page, `${mode}-02-profile-${label}`);
      await page.locator(".listing-profile").getByRole("button", { name: "Share" }).click({ force: true });
      await page.locator(".cn-modal").waitFor({ state: "visible", timeout: 8000 });
      await shot(page, `${mode}-02-action-share-${label}`);
      await page.goto(BASE + "/explore");
      await page.locator(".explore-page").waitFor({ state: "visible", timeout: 10000 });
      await theme(page, mode);
      await page.waitForTimeout(300);
      await shot(page, `${mode}-07-explore-${label}`);
      await page.goto(BASE + "/me");
      await page.locator(".me-page").waitFor({ state: "visible", timeout: 10000 });
      await theme(page, mode);
      await page.waitForTimeout(300);
      await shot(page, `${mode}-03-me-${label}`);
      await page.goto(BASE + "/settings");
      await page.locator(".ps-appearance, .ps-settings").first().waitFor({ state: "visible", timeout: 10000 });
      await theme(page, mode);
      await page.waitForTimeout(200);
      await shot(page, `${mode}-03-settings-${label}`);
      await page.close();
    }
  }
  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
