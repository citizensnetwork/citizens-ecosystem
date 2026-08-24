import { defineConfig, devices } from "@playwright/test";

// Mirrors apps/vision/playwright.config.ts (same standalone-HTML-frontend +
// Next.js-API-only architecture). Runs against a dedicated port so it never
// collides with a developer's own `next dev` on 3000. The frontend build is
// generated output (public/**, gitignored) — chained into webServer.command
// so a fresh checkout doesn't need a manual pre-build step.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3100",
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
    command: "node scripts/build-frontend.js && next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
