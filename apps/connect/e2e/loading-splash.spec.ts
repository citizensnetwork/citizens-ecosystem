import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Loading splash (Wear's crown + spinner, ported): while a session that is
//  probably there is still resolving, Connect shows the crown and a spinner
//  instead of the sign-in landing, so a returning member never sees "sign in"
//  flash past. A first-time visitor has no session to wait for and must see the
//  landing at once, with no splash flash.
//
//  Hermetic like the other signed-in specs: a REAL-mode app against a fake
//  project (e2e/support/fake-project.ts); nothing reaches a real backend.
// ════════════════════════════════════════════════════════════════════

const MEMBER = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "returning.member@example.com", fullName: "Returning Member" };

const SPLASH = '[role="status"][aria-label="Loading Citizens Connect"]';
const LANDING = '[aria-label="Continue with Google"]';

/**
 * Records, from before the first paint, whether the splash or the landing was
 * ever in the DOM. Asserting on "never appeared" (rather than "not visible
 * right now") is what proves there was no flash.
 */
async function watchScreens(page: Page) {
  await page.addInitScript(
    ([splash, landing]) => {
      const w = window as unknown as { __seen: { splash: boolean; landing: boolean } };
      w.__seen = { splash: false, landing: false };
      const look = () => {
        if (document.querySelector(splash)) w.__seen.splash = true;
        if (document.querySelector(landing)) w.__seen.landing = true;
      };
      new MutationObserver(look).observe(document, { childList: true, subtree: true });
    },
    [SPLASH, LANDING],
  );
}

const seen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __seen: { splash: boolean; landing: boolean } }).__seen);

/**
 * A citizen with nothing to claim stays put. Without this the catch-all's 200
 * makes the existing claim path redirect to /dashboard, reloading the page
 * (and with it everything this spec recorded).
 */
async function nothingToClaim(page: Page) {
  await page.route("**/api/contributor/claim", (route: Route) =>
    route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }),
  );
}

/** Holds the profile lookup (the last thing loadSession waits for) until released. */
async function holdProfileLookup(page: Page) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`${FAKE_PROJECT}/rest/v1/profiles**`, async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    await gate;
    return route.fallback();
  });
  return release;
}

test.describe("Loading splash", () => {
  // The app's CSP connect-src allows only the REAL Supabase project host;
  // bypass it so the fake project stays fully separate from production.
  test.use({ bypassCSP: true });

  test("a returning member sees the crown splash, never the landing, until the session resolves", async ({ page }) => {
    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    await signInToFakeProject(page, {
      user: MEMBER,
      profile: { role: "citizen", contributor_status: "not_applied" },
    });
    await nothingToClaim(page);
    const release = await holdProfileLookup(page);
    await watchScreens(page);
    await page.goto("/");

    const splash = page.locator(SPLASH);
    await expect(splash).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(LANDING)).toHaveCount(0);
    // The crown asset is actually served (a wrong path or a build that skipped
    // src/frontend/assets/ would leave a broken image here).
    await expect
      .poll(() => splash.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);

    release();
    await expect(splash).toHaveCount(0, { timeout: 15_000 });
    // In the app now (its sidebar brand mark is the same crown), and the landing
    // was never in the DOM at any point.
    await expect(page.locator("aside img[src*='citizens-crown']")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(LANDING)).toHaveCount(0);
    expect((await seen(page)).landing).toBe(false);
    expect((await seen(page)).splash).toBe(true);
  });

  test("a first-time visitor sees the landing at once, with no splash flash", async ({ page }) => {
    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    // A real-mode app, but this browser has never signed in: no stored session.
    await page.route(`${FAKE_PROJECT}/**`, (route: Route) =>
      route.fulfill({ json: [], headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } }),
    );
    await page.routeWebSocket(/e2eproj\.supabase\.test/, () => {});
    await watchScreens(page);
    await page.goto("/");

    await expect(page.locator(LANDING)).toBeVisible({ timeout: 15_000 });
    // The landing carries the same crown, as an image.
    await expect(page.locator("img[src*='citizens-crown']").first()).toBeVisible();
    expect((await seen(page)).splash).toBe(false);
  });

  test("a hung session lookup falls back to the landing after the safety timeout", async ({ page }) => {
    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    await signInToFakeProject(page, {
      user: MEMBER,
      profile: { role: "citizen", contributor_status: "not_applied" },
    });
    await holdProfileLookup(page); // never released
    await page.goto("/");

    await expect(page.locator(SPLASH)).toBeVisible({ timeout: 15_000 });
    // 8 s in the app, so allow generous headroom for a slow CI runner.
    await expect(page.locator(LANDING)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(SPLASH)).toHaveCount(0);
  });
});
