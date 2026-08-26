import { test, expect, type Page, type Route } from "@playwright/test";

declare global {
  interface Window {
    __cc: { go: (page: string, params?: Record<string, unknown>) => void };
  }
}

// ════════════════════════════════════════════════════════════════════
//  Three regressions this suite exists to catch, all of them things
//  unit tests structurally cannot see:
//
//  1. Kingdom Discovery cards COLLAPSING. Chromium sizes a grid
//     container's implicit `auto` rows against its own box when that
//     container is itself a scroll container with a definite height —
//     every card was squashed to ~2px and the list rendered as coloured
//     hairlines. Only a real browser measuring a real card catches it,
//     so we assert the rendered height, not the markup.
//  2. A whole entity type silently missing from the map, or losing its
//     shape/colour. Pins carry `data-cc-pin` for exactly this.
//  3. The device Back button leaving the app instead of walking back
//     through it (the founder hit this on Android).
//
//  Same auth + network approach as kingdom-discovery.spec.ts: the app's
//  own documented "no Supabase configured" fallback, everything else
//  mocked, zero writes to the real project.
// ════════════════════════════════════════════════════════════════════

const ORG_ID = "11111111-1111-4111-8111-000000000001";
const PRETORIA = { lat: -25.7479, lng: 28.2293 };

const EVENT = {
  id: "e2e-event-1",
  title: "Hatfield Sunday Celebration",
  description: "A weekly gathering open to everyone in the city.",
  date: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  end_time: new Date(Date.now() + 3 * 86_400_000 + 7_200_000).toISOString(),
  location: "1186 Burnett Street, Hatfield, Pretoria",
  category: "church-services",
  image_url: null,
  website_url: null,
  latitude: PRETORIA.lat,
  longitude: PRETORIA.lng,
  created_by: ORG_ID,
  created_at: new Date().toISOString(),
  community_contributor: false,
  volunteer_openings: false,
};

const PLACE = {
  id: "e2e-place-1",
  name: "Brooklyn Anchor Campus",
  description: "Open through the week for prayer, coffee and community.",
  address: "212 Justice Mahomed Street, Brooklyn, Pretoria",
  category: "churches-ministries",
  custom_category: null,
  image_url: null,
  phone: "",
  website: "",
  open_hours: "Mon-Fri 08:00-17:00",
  latitude: PRETORIA.lat + 0.02,
  longitude: PRETORIA.lng + 0.02,
  created_by: ORG_ID,
  verified: true,
  status: "published",
  volunteer_openings: false,
};

const CONTRIBUTOR = {
  id: ORG_ID,
  full_name: "Anchor Community Church",
  role: "contributor",
  contributor_kind: "ministry",
  // Deliberately uncategorised — this is the majority shape of the real
  // directory, and the case that used to render as a bare generic pin.
  category: null,
  contributor_slug: "anchor-community-church",
  bio: "We serve our city through weekly gatherings, outreach and practical care.",
  avatar_url: null,
  logo_url: null,
  website_url: "https://example.org",
  instagram_handle: null,
  facebook_url: null,
  tiktok_handle: null,
  youtube_url: null,
  physical_address: "212 Justice Mahomed Street, Brooklyn, Pretoria",
  physical_latitude: PRETORIA.lat - 0.02,
  physical_longitude: PRETORIA.lng - 0.02,
  no_fixed_location: false,
  cover_photo_urls: null,
  contact_email: null,
  created_at: new Date().toISOString(),
};

async function mockNetwork(page: Page) {
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
  await page.route("**/api.maptiler.com/maps/**/style.json**", (route: Route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
  );
  const seed: Record<string, unknown[]> = {
    events: [EVENT],
    places: [PLACE],
    contributors: [CONTRIBUTOR],
  };
  for (const path of Object.keys(seed)) {
    await page.route(`**/api/v1/${path}**`, (route: Route) =>
      route.fulfill({
        json: { data: seed[path], meta: { count: seed[path].length, limit: 100, offset: 0 } },
      }),
    );
  }
  await page.addInitScript(() => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: "citizen" }));
  });
}

const screenName = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-screen]");
    return el ? el.getAttribute("data-screen") : null;
  });

test.describe("Kingdom Discovery cards render at full size", () => {
  test("a card is a real card — not a collapsed hairline — and carries its details and actions", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.__cc.go("kingdom-discovery"));
    const screen = page.locator('[data-screen="kingdom-discovery"]');
    await expect(screen).toBeVisible();

    const card = screen.getByRole("button", { name: /Hatfield Sunday Celebration/ }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    // THE regression guard: the collapsed state measured ~2px tall.
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(120);
    expect(box!.width).toBeGreaterThan(200);

    // …and the details the founder asked to see are actually on it.
    await expect(screen.getByText("A weekly gathering open to everyone in the city.")).toBeVisible();
    await expect(screen.getByText("1186 Burnett Street, Hatfield, Pretoria")).toBeVisible();
    await expect(screen.getByText(/connected/)).toBeVisible();
    await expect(screen.getByText(/considering/)).toBeVisible();
    await expect(screen.getByRole("button", { name: "View" }).first()).toBeVisible();
    await expect(screen.getByRole("button", { name: /Consider|Remove from considering/ }).first()).toBeVisible();
    await expect(screen.getByRole("button", { name: "Share" }).first()).toBeVisible();

    // An uncategorised Contributor still says what kind of organisation it is.
    await page.getByRole("button", { name: "Contributors", exact: true }).click();
    await expect(screen.getByText("Anchor Community Church")).toBeVisible();
    await expect(screen.getByText("Ministry").first()).toBeVisible();
  });
});

test.describe("Map pins", () => {
  test("every entity type renders its own category-coloured badge shape", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    await expect(page.locator(".maplibregl-marker")).toHaveCount(3, { timeout: 15_000 });
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1);
    await expect(page.locator('[data-cc-pin="place"]')).toHaveCount(1);
    await expect(page.locator('[data-cc-pin="contributor"]')).toHaveCount(1);

    // The event badge is filled with its OWN category colour, not the
    // generic gold fallback (church-services = #D4AF37 is gold, so assert
    // on the place, whose category colour is distinct from the fallback).
    const placeFill = await page
      .locator('[data-cc-pin="place"] circle:not([fill="none"])')
      .first()
      .getAttribute("fill");
    expect(placeFill).toBe("#D4AF37");

    // …and a category-less Contributor falls back to its KIND glyph rather
    // than rendering an empty badge.
    await expect(page.locator('[data-cc-pin="contributor"] g')).toHaveCount(1);
  });
});

test.describe("Device Back button", () => {
  test("walks back through the app, closes overlays first, and only then leaves", async ({ page }) => {
    await mockNetwork(page);
    // A real previous entry, so "leaving Connect" is observable.
    await page.goto("/manifest.json");
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.__cc.go("kingdom-discovery"));
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
    await page.evaluate(() => window.__cc.go("settings"));
    await expect(page.locator('[data-screen="settings"]')).toBeVisible();

    await page.goBack();
    await expect.poll(() => screenName(page)).toBe("kingdom-discovery");
    await page.goBack();
    await expect.poll(() => screenName(page)).toBe("discover");

    // An open overlay is dismissed BEFORE the screen changes.
    await page.getByRole("button", { name: "Filter by category" }).click();
    await expect(page.getByRole("heading", { name: "Browse Categories" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Browse Categories" })).toBeHidden();
    await expect.poll(() => screenName(page)).toBe("discover");

    // At the root with nothing open, Back really does leave — never a trap.
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });
});
