import type { Page, Route } from "@playwright/test";

// Vision counterpart of Connect's mockAppShell (apps/connect/e2e/support/fake-project.ts).
// Copied as an idea, not imported: apps do not share e2e helpers.
//
// The page's config global is window.__CV_ENV (config.js), not __CC_ENV.
// Nothing here sets an auth cookie. src/proxy.ts calls supabase.auth.getUser()
// on every request, and with no cookie that call stays inside the server.

/** Reserved .test host. It does not resolve, so a missed mock cannot reach a real project. */
export const FAKE_PROJECT = "https://vision-e2e.supabase.test";

/** Not a JWT and not a credential. Present only so the sign-in screen offers Google. */
export const FAKE_ANON_KEY = "e2e-anon-key";

const FAKE_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

export type MockAppShellOptions = {
  /** When set, the Timeline Map requests MapTiler and the suite can refuse the key. */
  maptilerKey?: string;
  /** Status MapTiler answers with. 401 and 403 are a refused key. */
  maptilerStatus?: number;
};

/**
 * Answers config.js, MapTiler, the app's own /api and the fake project locally.
 */
export async function mockAppShell(page: Page, options: MockAppShellOptions = {}) {
  const env = {
    SUPABASE_URL: FAKE_PROJECT,
    SUPABASE_ANON_KEY: FAKE_ANON_KEY,
    API_BASE_URL: "",
    MAPTILER_KEY: options.maptilerKey ?? "",
  };

  // Registered first, matched last: a catch-all so an incidental API read
  // never leaves the machine. More specific routes below win.
  await page.route("**/api/**", (route: Route) => route.fulfill({ json: { data: [] } }));

  await page.route("**/config.js", (route: Route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__CV_ENV = ${JSON.stringify(env)};`,
    }),
  );

  const maptilerStatus = options.maptilerStatus ?? 200;
  await page.route("**/api.maptiler.com/**", (route: Route) => {
    if (maptilerStatus === 401 || maptilerStatus === 403) {
      return route.fulfill({
        status: maptilerStatus,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid key" }),
      });
    }
    return route.fulfill({ json: { version: 8, sources: {}, layers: [], features: [] } });
  });

  // The browser client may touch the fake project while resolving "no session".
  // Answer it here. No session is seeded, so the screen stays signed out.
  await page.routeWebSocket(/vision-e2e\.supabase\.test/, () => {});
  await page.route(`${FAKE_PROJECT}/**`, (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: FAKE_CORS });
    }
    return route.fulfill({
      status: 200,
      headers: FAKE_CORS,
      json: { data: { session: null, user: null }, error: null },
    });
  });
}

/** Script errors and console.error lines, in order. Attach before navigation. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
