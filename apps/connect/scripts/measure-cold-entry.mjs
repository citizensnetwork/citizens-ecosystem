#!/usr/bin/env node
/**
 * Measure how long a first-time visitor waits for Connect's "Browse as Guest" button (QA 2026-11-25, CCQA-0001;
 * fix plan PR F0). Read-only: it loads the page like a visitor and signs nobody in.
 *
 *   node scripts/measure-cold-entry.mjs [url] [runs]
 *   default url https://219.co.za/citizens/connect, 3 runs; CHROMIUM_PATH=/path/to/chrome to pick a browser.
 *
 * Two profiles: desktop (1280x900, no throttling) and phone (Pixel 7 on Lighthouse's "Slow 4G": 150 ms RTT,
 * 1.6 Mbps down, 750 kbps up, CPU 4x slower). Each run is cold (a new browser context, empty cache), then warm
 * (a second visit in the same context). It times the button from a MutationObserver, so it works on builds with or
 * without the app's performance.mark('cc-guest-visible'), and prints first paint and the slowest critical files.
 * Results: docs/audit/cc-f0-cold-entry-2026-11-25.md.
 */
import { chromium, devices } from "@playwright/test";

const URL = process.argv[2] || "https://219.co.za/citizens/connect";
const RUNS = Number(process.argv[3]) || 3;
const PHONE_NET = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 };
const GUEST = "Browse as Guest";

function watchForGuest(label) {
  window.__ccEntry = {};
  const look = () => {
    if (window.__ccEntry.guest) return;
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === label);
    if (b && b.getBoundingClientRect().width > 0) window.__ccEntry.guest = performance.now();
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true });
}

async function visit(context, throttle) {
  const page = await context.newPage();
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", PHONE_NET);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.addInitScript(watchForGuest, GUEST);
  await page.goto(URL, { waitUntil: "commit", timeout: 120_000 });
  await page.waitForFunction(() => window.__ccEntry && window.__ccEntry.guest, null, { timeout: 120_000, polling: 50 });
  // Let the first-paint entry land (it can trail the button by a frame).
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    const nav = performance.getEntriesByType("navigation")[0];
    const slowest = performance
      .getEntriesByType("resource")
      .filter((e) => e.startTime < window.__ccEntry.guest)
      .sort((a, b) => b.responseEnd - a.responseEnd)
      .slice(0, 4)
      .map((e) => `${e.name.replace(/\?.*$/, "").split("/").slice(-2).join("/")} ${Math.round(e.responseEnd)} ms`);
    return {
      ttfbMs: Math.round(nav.responseStart),
      firstPaintMs: paint ? Math.round(paint.startTime) : null,
      guestMs: Math.round(window.__ccEntry.guest),
      slowest,
    };
  });
  await page.close();
  return r;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const profiles = [
  { name: "desktop", context: { viewport: { width: 1280, height: 900 } }, throttle: false },
  { name: "phone, Slow 4G, CPU 4x", context: { ...devices["Pixel 7"] }, throttle: true },
];
for (const p of profiles) {
  const cold = [];
  const warm = [];
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext(p.context);
    cold.push(await visit(context, p.throttle));
    warm.push(await visit(context, p.throttle));
    await context.close();
  }
  const sum = (rs, k) => `median ${median(rs.map((r) => r[k] ?? 0))} ms (${rs.map((r) => r[k] ?? "-").join(", ")})`;
  console.log(`\n${p.name}`);
  console.log(`  cold guest ${sum(cold, "guestMs")}; first paint ${sum(cold, "firstPaintMs")}`);
  console.log(`  warm guest ${sum(warm, "guestMs")}; first paint ${sum(warm, "firstPaintMs")}`);
  console.log(`  cold, last files in before the button: ${cold[cold.length - 1].slowest.join("; ")}`);
}
await browser.close();
