import { defineConfig, devices } from "@playwright/test";

// Hermetic Vision browser suite. The app is a standalone HTML frontend plus
// an API-only Next server (src/proxy.ts). A reserved .test host is not a real
// Supabase project and does not resolve; the browser never sees a real key
// because e2e/support/app-shell.ts replaces config.js.
//
// Port 3200 stays off a developer's own `next dev` (3000) and off Connect's
// suite (3100). The frontend build is generated output (public/**, gitignored)
// and is chained into webServer.command so a fresh checkout needs no manual
// pre-build.
//
// CSP connect-src allows only the real *.supabase.co host. Every spec here
// points the page at the .test host, so CSP is bypassed for the suite.
const FAKE_SUPABASE_URL = "https://vision-e2e.supabase.test";
const FAKE_ANON_KEY = "e2e-anon-key";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    bypassCSP: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: "node scripts/build-frontend.js && next dev -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Already-set process env wins over .env.local, so a developer's real
      // keys cannot leak into this server. The anon value is not a JWT and
      // not a credential. No auth cookie is set, so proxy.ts getUser() does
      // not call this host.
      NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
      NEXT_PUBLIC_API_BASE_URL: "",
      NEXT_PUBLIC_MAPTILER_KEY: "",
    },
  },
});
