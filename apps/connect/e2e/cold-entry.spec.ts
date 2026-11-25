import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, mockAppShell } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Cold entry (QA 2026-11-25, CCQA-0001; fix plan PR F0). How long a first-time visitor on a phone waits before
//  "Browse as Guest" is on screen. The landing sets performance.mark('cc-guest-visible') when it mounts; this spec
//  reads it under the Lighthouse "Slow 4G" mobile profile (150 ms RTT, 1.6 Mbps down, 750 kbps up, CPU 4x slower),
//  once cold (empty cache) and once warm (same browser, second visit), and attaches the numbers to the report.
//
//  The numbers are a regression signal, not the live figure: here the app's own files come from the local dev
//  server, while the CDN scripts come from the real internet (CI has it). The live measure is
//  docs/audit/cc-f0-cold-entry-2026-11-25.md (re-run it with scripts/measure-cold-entry.mjs).
//
//  Budget (founder, 2026-11-25): cold, on this profile, the first paint within 1.5 s and the guest button within 3 s.
//  Both are enforced: first paint since PR F1 (the boot screen paints with the HTML: about 0.6 s here, was 3.9 s), the
//  guest button since PR F2 (the libraries served from our own origin and lucide trimmed: about 2.65 s here, was 3.9 s).
//  What is left is mostly CPU, not network: a warm load is about as slow, parsing the app bundle on a 4x slower CPU.
//
//  It also guards what F1 took off the critical path: no Tailwind Play CDN, no Google Fonts, and no MapLibre module
//  before the guest button (maplibre-loader.js fetches it on demand or after the page has loaded).
// ════════════════════════════════════════════════════════════════════

const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: 1.6e6 / 8,
  uploadThroughput: 750e3 / 8,
};
const CPU_SLOWDOWN = 4;
const BUDGET = { firstPaintMs: 1500, guestMs: 3000 };
const ENFORCE = { firstPaintMs: true, guestMs: true };
const GUEST = "Browse as Guest";

/** A real-mode app whose browser has never signed in, with nothing reaching a real backend. */
async function firstVisit(page: Page) {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await page.route(`${FAKE_PROJECT}/**`, (route: Route) =>
    route.fulfill({
      json: [],
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    }),
  );
  await page.routeWebSocket(/e2eproj\.supabase\.test/, () => {});
}

/** Every URL the page asks for, from now on. */
function recordRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => seen.push(r.url()));
  return seen;
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
}

/** Loads the landing; returns the first paint and the guest mark, in ms since navigation start. */
async function entryTimes(page: Page): Promise<{ firstPaintMs: number; guestMs: number }> {
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: GUEST })).toBeVisible({ timeout: 60_000 });
  const times = await page.waitForFunction(
    () => {
      const guest = performance.getEntriesByName("cc-guest-visible", "mark")[0];
      const paint = performance.getEntriesByName("first-contentful-paint")[0];
      return guest && paint
        ? { firstPaintMs: Math.round(paint.startTime), guestMs: Math.round(guest.startTime) }
        : null;
    },
    null,
    { timeout: 10_000 },
  );
  return (await times.jsonValue()) as { firstPaintMs: number; guestMs: number };
}

test.describe("Cold entry: the guest button on a throttled 4G phone", () => {
  // Alone and in order: a parallel worker would steal the CPU this spec is timing.
  test.describe.configure({ mode: "serial" });
  test.use({
    bypassCSP: true,
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  test.setTimeout(180_000);

  test("records cc-guest-visible, cold and warm", async ({ page, context }, testInfo) => {
    await firstVisit(page);
    await throttle(page);
    const requests = recordRequests(page);
    const cold = await entryTimes(page);
    const beforeGuest = await page.evaluate(() => {
      const guest = performance.getEntriesByName("cc-guest-visible", "mark")[0]?.startTime ?? 0;
      return performance
        .getEntriesByType("resource")
        .filter((e) => e.startTime < guest)
        .map((e) => e.name);
    });

    // Warm: a second visit in the same browser, so the HTTP cache holds every script.
    const again = await context.newPage();
    await firstVisit(again);
    await throttle(again);
    const warm = await entryTimes(again);

    const result = {
      profile: "Slow 4G, CPU 4x, 412x915",
      cold,
      warm,
      budget: BUDGET,
      enforced: ENFORCE,
    };
    await testInfo.attach("cc-guest-visible.json", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    const line = `cold: paint ${cold.firstPaintMs} ms, guest ${cold.guestMs} ms; warm: paint ${warm.firstPaintMs} ms, guest ${warm.guestMs} ms`;
    testInfo.annotations.push({ type: "cc-guest-visible", description: line });
    console.log(
      `[cold-entry] ${line} (budget paint ${BUDGET.firstPaintMs} ms, guest ${BUDGET.guestMs} ms, enforced ${JSON.stringify(ENFORCE)})`,
    );

    expect(cold.guestMs).toBeGreaterThan(0);
    expect(warm.guestMs).toBeGreaterThan(0);
    if (ENFORCE.firstPaintMs)
      expect(cold.firstPaintMs, "cold first paint over budget").toBeLessThanOrEqual(BUDGET.firstPaintMs);
    if (ENFORCE.guestMs) expect(cold.guestMs, "cold guest button over budget").toBeLessThanOrEqual(BUDGET.guestMs);

    // PR F1: nothing asks for the Play CDN or Google Fonts, and MapLibre waits until the guest button is up.
    // PR F2: nor unpkg or jsDelivr; React, supabase-js and lucide come from our own origin
    const gone = new Set(["cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com", "unpkg.com", "cdn.jsdelivr.net"]);
    expect(requests.filter((u) => gone.has(new URL(u).hostname))).toEqual([]);
    expect(
      beforeGuest.filter((u) => u.includes("maplibre-gl.mjs")),
      "MapLibre fetched before the guest button",
    ).toEqual([]);
  });
});
