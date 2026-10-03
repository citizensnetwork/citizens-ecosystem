import { test, expect, type Page, type Route } from "@playwright/test";
import { goTo, mapReady, setRoleAndGo } from "./support/app-hooks";

// ════════════════════════════════════════════════════════════════════
//  Connect v1 golden path (founder decision D-12): a self-serve Contributor
//  application WAITS for an admin. Apply → pending Dashboard ("being
//  reviewed") → NOT in Kingdom Discovery, NOT on the map → an admin approves
//  → appears in Kingdom Discovery → appears on the map → opens on click.
//  And the other branch: a rejection keeps them a citizen and lets them
//  apply again.
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
//  driven from outside instead of via a real Google session. In that
//  mode the same person is both the applicant and (after `setRole`) the
//  admin, which is what lets one test walk the whole approval.
//
//  Everything else (contributor/place/event reads, MapTiler geocoding +
//  map style) is mocked via page.route() so this suite makes zero
//  writes to the real Supabase project and has no external dependency
//  beyond the CDN scripts the app itself loads (React/MapLibre/etc. —
//  inherent to this no-build architecture, not mocked).
//
//  The signed-in version of this flow (real session, real routes against a
//  fake Supabase project) is e2e/contributor-approval.spec.ts.
// ════════════════════════════════════════════════════════════════════

const CHURCH_SQUARE = { lat: -25.7479, lng: 28.2293 }; // matches map.jsx's PRETORIA constant
const ORG_NAME = "Grace Test Ministry";

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

/** Boots to the map, walks the Apply wizard and submits. Leaves you on the pending Dashboard. */
async function applyAsContributor(page: Page) {
  await page.goto("/");

  // Boots straight to the map (Discover) — no sign-in screen, since
  // authed is seeded and CC_AUTH is null (no session bootstrap to fight it).
  await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

  // ── Apply — reached via Settings. "Become a Contributor" was moved out
  //     of the always-visible sidebar/account-menu and now lives only
  //     under a citizen's own profile management (Settings). ──
  await goTo(page, "settings");
  await page.getByRole("button", { name: "Apply to become a Contributor" }).click();
  await expect(page.getByRole("heading", { name: "Become a Contributor" })).toBeVisible();

  await page.getByPlaceholder("e.g. New Wine Fellowship").fill(ORG_NAME);
  await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
  // One of the 12 Contributor types (not an event category) — a NEW slug,
  // so the whole path below runs on it.
  await page.getByRole("button", { name: "Retreat / Healing" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // "Your story" step — bio/website are optional, skip straight through.
  await expect(page.getByText("Your story")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Review & submit — the copy must NOT promise an instant go-live any more.
  await expect(page.getByText(/admin reviews every application/i)).toBeVisible();
  await expect(page.getByText(/go live immediately/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Submit application" }).click();

  // ── The pending Dashboard: the applicant has it at once, with the banner ──
  await expect(page.locator('[data-screen="pending-application"]')).toBeVisible({ timeout: 10_000 });
  const banner = page.getByTestId("pending-banner");
  await expect(banner).toContainText("Your listing is being reviewed");
  await expect(banner).toContainText("it goes on the map once approved");
}

/** Switches the demo person to the admin and opens their application card. */
async function openApplicationAsAdmin(page: Page) {
  await setRoleAndGo(page, "admin", "admin");
  await expect(page.locator('[data-screen="admin"]')).toBeVisible();
  const card = page.locator('[data-application="app-mine"]');
  await expect(card).toBeVisible();
  await expect(card.getByText(ORG_NAME)).toBeVisible();
  return card;
}

test.describe("Kingdom Discovery — self-serve Contributor, admin approval (D-12)", () => {
  test("an application is invisible until an admin approves it, then appears in Kingdom Discovery and on the map", async ({ page }) => {
    await mockNetwork(page);
    await applyAsContributor(page);

    // ── Pending: nothing of theirs is public ──
    await goTo(page, "kingdom-discovery");
    const discoveryScreen = page.locator('[data-screen="kingdom-discovery"]');
    await expect(discoveryScreen).toBeVisible();
    await expect(discoveryScreen.getByText(ORG_NAME)).toHaveCount(0);

    await goTo(page, "home");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    // The map exists, so "no pin" is a real result and not a page that never loaded.
    await mapReady(page);
    await expect(page.locator(".maplibregl-marker")).toHaveCount(0);

    // ── They can finish their profile while they wait ──
    await goTo(page, "dashboard");
    await expect(page.locator('[data-screen="pending-application"]')).toBeVisible();
    await page.getByPlaceholder("Tell citizens who you are…").fill("A quiet retreat in the heart of the city.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/goes live once your application is approved/i)).toBeVisible();

    // ── The admin approves ──
    const card = await openApplicationAsAdmin(page);
    await expect(card.getByText("Pending Review", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Approve" }).click();
    await card.getByRole("button", { name: "Confirm" }).click();
    await expect(card.getByText(/Approved — contributor access granted/)).toBeVisible();

    // ── Kingdom Discovery — the new Contributor is listed ──
    await goTo(page, "kingdom-discovery");
    await expect(discoveryScreen).toBeVisible();
    await expect(discoveryScreen.getByText(ORG_NAME)).toBeVisible({ timeout: 10_000 });

    // ── Map — the new Contributor has a pin (this is the exact gap fixed:
    //     Contributors previously never appeared on the map at all) ──
    await goTo(page, "home");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    const marker = page.locator(".maplibregl-marker");
    await expect(marker).toHaveCount(1, { timeout: 15_000 });

    // ── Click the pin → the same small preview card every pin opens (it used
    //     to jump straight to the full page), and its "View Full Profile"
    //     button is the way in to the Contributor's profile ──
    await marker.click();
    const preview = page.locator('[data-entity-card="contributor"]');
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview.getByText(ORG_NAME)).toBeVisible();
    await preview.getByRole("button", { name: "View Full Profile" }).click();
    await expect(page.locator('[data-screen="profile"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ORG_NAME).first()).toBeVisible();

    // ── And as the Contributor they now have the full Dashboard ──
    await setRoleAndGo(page, "contributor", "dashboard");
    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 10_000 });
  });

  test("a rejection needs a reason, keeps them a citizen, and they can apply again", async ({ page }) => {
    await mockNetwork(page);
    await applyAsContributor(page);

    const card = await openApplicationAsAdmin(page);
    await card.getByRole("button", { name: "Reject" }).click();

    // The applicant reads this, so a rejection cannot be confirmed without one.
    const confirm = card.getByRole("button", { name: "Confirm" });
    await expect(confirm).toBeDisabled();
    await card.getByLabel("Reason for the applicant").fill("Please add a website or a social page so we can see who you are.");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(card.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(card.getByText(/add a website or a social page/)).toBeVisible();

    // Still a citizen, never on the map…
    await setRoleAndGo(page, "citizen", "home");
    await mapReady(page);
    await expect(page.locator(".maplibregl-marker")).toHaveCount(0);

    // …and Settings now offers to apply again.
    await goTo(page, "settings");
    await page.getByRole("button", { name: "Apply again" }).click();
    await expect(page.getByRole("heading", { name: "Become a Contributor" })).toBeVisible();
  });
});
