import { defineConfig, devices } from "@playwright/test";

// Mirrors apps/vision/playwright.config.ts (same standalone-HTML-frontend +
// Next.js-API-only architecture). Runs against a dedicated port so it never
// collides with a developer's own `next dev` on 3000. The frontend build is
// generated output (public/**, gitignored) — chained into webServer.command
// so a fresh checkout doesn't need a manual pre-build step.
// Port 3100 by default (CI). A session running next to another one sets E2E_PORT, so the suite never reuses
// (and silently tests) somebody else's dev server.
const PORT = Number(process.env.E2E_PORT) || 3100;

export default defineConfig({
  testDir: "./e2e",
  // The prefix-mode smoke run needs the app built and served under /citizens/connect: it has its own config
  // (playwright.base-path.config.ts, `pnpm test:e2e:base-path`) and would only fail against this root-mode server.
  testIgnore: "base-path.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `node scripts/build-frontend.js && next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
