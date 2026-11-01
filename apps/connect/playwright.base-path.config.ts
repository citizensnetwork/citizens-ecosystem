import { defineConfig, devices } from "@playwright/test";

// The prefix-mode smoke run (C39 PR B): the SAME app, built and served with
// NEXT_PUBLIC_BASE_PATH=/citizens/connect, driven by e2e/base-path.spec.ts only.
//
// It is a second config, not a second project of playwright.config.ts, because the two modes cannot run
// side by side: `node scripts/build-frontend.js` writes ONE generated public/ (index.html's <base>, config.js's
// BASE_PATH) and `next dev` serves it, so a prefix server and a root server in the same app directory would
// overwrite each other's files. Run them one after the other: `pnpm test:e2e` (the root, unchanged), then
// `pnpm test:e2e:base-path`. Whichever ran last leaves its own public/ behind; the next webServer start
// regenerates it, so nothing carries over. e2e/base-path.spec.ts is ignored by the root config.
//
// Port 3101 by default (the root run keeps 3100); E2E_PORT overrides it. A server that is already running on
// the port is NEVER reused (it could be another session's, or a root-mode one), so a clash fails loudly.
const PORT = Number(process.env.E2E_PORT) || 3101;
const BASE_PATH = "/citizens/connect";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "base-path.spec.ts",
  outputDir: "test-results-base-path",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report-base-path" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-base-path",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `node scripts/build-frontend.js && next dev -p ${PORT}`,
    // Under a basePath the site root is a 404, so wait on the app's own front door.
    url: `http://localhost:${PORT}${BASE_PATH}`,
    // HUB_ORIGIN_CONNECT: the old-address rule rewrites /api/* to the app's OWN production address (Next refuses a
    // path destination), so a test must point it at this very server or it would call the live site.
    env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH, HUB_ORIGIN_CONNECT: `http://localhost:${PORT}` },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
