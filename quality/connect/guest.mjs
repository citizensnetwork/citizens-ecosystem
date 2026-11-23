// Run from a clean, credential-free workstation or hosted test environment.
import { createRequire } from 'node:module';
import { basePath, handleGuestRoute, origin } from './guest-policy.mjs';

const viewports = {
  desktop: { width: 1280, height: 900 },
  narrow: { width: 390, height: 844 },
};

async function main() {
  const profile = process.argv[2];
  if (!Object.hasOwn(viewports, profile) || process.argv.length !== 3) {
    console.error('Usage: node quality/connect/guest.mjs desktop|narrow');
    return 2;
  }

  const appRequire = createRequire(new URL('../../apps/connect/package.json', import.meta.url));
  let browser;
  const counts = { blockedRequests: 0, blockedRedirects: 0, fetchFailures: 0 };
  try {
    const { chromium } = appRequire('@playwright/test');
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: viewports[profile],
      hasTouch: profile === 'narrow',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });

    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', (route) => handleGuestRoute(route, counts));

    const page = await context.newPage();
    const closed = new Promise((resolve) => page.once('close', resolve));
    await page.goto(origin + basePath, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log(
      `Fresh ${profile} guest browser open. Follow programme/COVERAGE.md and close the page when finished.`,
    );
    await closed;
    return 0;
  } catch {
    console.error(
      'Guest browser setup or navigation blocked. Check Chromium, display and read-only network access.',
    );
    return 2;
  } finally {
    if (browser) await browser.close();
    console.log(JSON.stringify(counts));
  }
}

process.exitCode = await main();
