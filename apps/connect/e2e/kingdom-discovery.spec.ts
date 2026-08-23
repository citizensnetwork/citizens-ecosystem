import { test, expect, type Page, type Route } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════
//  Connect v1 golden path: self-serve Contributor go-live → appears in
//  Kingdom Discovery → appears on the map → opens on click.
//
//  Auth: Connect has no demo/guest sign-in and no separate test Supabase
//  project (see V1_SCOPE.md / RESUME_HERE.md — org is on the Free plan,
//  no branching). Real Google OAuth can't be automated headlessly, so
//  this suite runs the app in its own "no Supabase configured" fallback
//  (auth-client.js: an empty SUPABASE_ANON_KEY leaves window.CC_AUTH
//  null, which store.jsx's session-bootstrap effect already treats as a
//  no-op). Combined with seeding the same localStorage flag the app
//  itself persists on sign-in (`cc_session_v1`), this reaches the exact
//  `authed && !realUser` state store.jsx's own code calls "demo mode" —
//  not a test-only backdoor, just the app's own documented fallback
//  driven from outside instead of via a real Google session.
//
//  Everything else (contributor/place/event reads, MapTiler geocoding +
//  map style) is mocked via page.route() so this suite makes zero
//  writes to the real Supabase project and has no external dependency
//  beyond the CDN scripts the app itself loads (React/MapLibre/etc. —
//  inherent to this no-build architecture, not mocked).
// ════════════════════════════════════════════════════════════════════

const CHURCH_SQUARE = { lat: -25.7479, lng: 28.2293 }; // matches map.jsx's PRETORIA constant

async function mockNetwork(page: Page) {
  // Force CC_AUTH = null (empty SUPABASE_ANON_KEY) while giving the map a
  // key that isn't the "unset" empty string or "REPLACE_WITH…" placeholder,
  // so map.jsx's styleUrl() doesn't bail out.
  await page.route("**/config.js", (route: Route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__CC_ENV = ${JSON.stringify({
        SUPABASE_URL: "",
        SUPABASE_ANON_KEY: "",
        API_BASE_URL: "",
        MAPTILER_KEY: "e2e-test-key",
        MAPTILER_STYLE: "streets-v2",
      })};`,
    }),
  );

  // Deterministic forward-geocode — always resolves to Church Square,
  // regardless of the address text (store.jsx's geocodeAddress()).
  await page.route("**/api.maptiler.com/geocoding/**", (route: Route) =>
    route.fulfill({
      json: { features: [{ center: [CHURCH_SQUARE.lng, CHURCH_SQUARE.lat] }] },
    }),
  );

  // Minimal valid MapLibre style — lets the Map instance construct (and
  // markers attach) without depending on real map tiles.
  await page.route("**/api.maptiler.com/maps/**/style.json**", (route: Route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
  );

  // Empty starting dataset for determinism — the only contributor that
  // will ever appear is the one this test creates.
  for (const path of ["contributors", "places", "events"]) {
    await page.route(`**/api/v1/${path}**`, (route: Route) =>
      route.fulfill({ json: { data: [], meta: { count: 0, limit: 100, offset: 0 } } }),
    );
  }

  // Seed the exact same session flag store.jsx writes on real sign-in
  // (SESSION_KEY = 'cc_session_v1' in store.jsx) before any app script runs.
  await page.addInitScript(() => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: "citizen" }));
  });
}

test.describe("Kingdom Discovery — v1 self-serve go-live", () => {
  test("adding a Contributor makes it appear in Kingdom Discovery, on the map, and its profile opens on click", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");

    // Boots straight to the map (Discover) — no sign-in screen, since
    // authed is seeded and CC_AUTH is null (no session bootstrap to fight it).
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    // ── Apply ──
    await page.getByRole("button", { name: "Apply Now" }).click();
    await expect(page.getByRole("heading", { name: "Become a Contributor" })).toBeVisible();

    const orgName = "Grace Test Ministry";
    await page.getByPlaceholder("e.g. New Wine Fellowship").fill(orgName);
    await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
    await page.getByRole("button", { name: "Worship & Prayer" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // "Your story" step — bio/website are optional, skip straight through.
    await expect(page.getByText("Your story")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Review & submit — v1 copy asserts the no-admin-wait promise directly.
    await expect(page.getByText(/go live immediately/i)).toBeVisible();
    await page.getByRole("button", { name: "Submit & Go Live" }).click();

    // ── Onboarding (no admin wait — submitting already approved it) ──
    await expect(page.getByRole("heading", { name: "You're approved!" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Continue" }).click(); // Brand your profile
    await page.getByRole("button", { name: "Continue" }).click(); // About & contact
    await page.getByRole("button", { name: "Go Live", exact: true }).click(); // Team & socials → submit

    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 10_000 });

    // ── Kingdom Discovery — the new Contributor is listed ──
    await page.evaluate(() => (window as any).__cc.go("kingdom-discovery"));
    const discoveryScreen = page.locator('[data-screen="kingdom-discovery"]');
    await expect(discoveryScreen).toBeVisible();
    await expect(discoveryScreen.getByText(orgName)).toBeVisible({ timeout: 10_000 });

    // ── Map — the new Contributor has a pin (this is the exact gap fixed:
    //     Contributors previously never appeared on the map at all) ──
    await page.evaluate(() => (window as any).__cc.go("home"));
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    const marker = page.locator(".maplibregl-marker");
    await expect(marker).toHaveCount(1, { timeout: 15_000 });

    // ── Click the pin → lands on the Contributor's profile ──
    await marker.click();
    await expect(page.locator('[data-screen="profile"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(orgName).first()).toBeVisible();
  });
});
