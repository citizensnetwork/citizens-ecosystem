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
  website_url: "https://example.org/event",
  // A handle, a scheme-less link and a full URL — the three shapes a real
  // contributor actually types, all of which must become working links.
  instagram_url: "@hatfieldsunday",
  facebook_url: "facebook.com/hatfieldsunday",
  tiktok_url: null,
  youtube_url: "https://youtube.com/@hatfieldsunday",
  x_url: null,
  linkedin_url: null,
  whatsapp_url: null,
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
  instagram_url: "@brooklynanchor",
  facebook_url: null,
  tiktok_url: null,
  youtube_url: null,
  x_url: null,
  linkedin_url: null,
  whatsapp_url: null,
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

    // Tapping the card opens it, so band + title are one <button>; the card
    // itself is the [data-entity-card] box, which is what must have height.
    const tapTarget = screen.getByRole("button", { name: /Hatfield Sunday Celebration/ }).first();
    await expect(tapTarget).toBeVisible({ timeout: 15_000 });
    const card = screen.locator('[data-entity-card="event"]').first();

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
    await expect(screen.getByRole("button", { name: "View Full Profile" }).first()).toBeVisible();
    await expect(screen.getByRole("button", { name: /Consider|Remove from considering/ }).first()).toBeVisible();
    await expect(screen.getByRole("button", { name: "Share" }).first()).toBeVisible();

    // Socials on the card itself — one link per handle the row carries, each
    // pointing at the real platform URL whether the value was stored as a
    // handle, a scheme-less link or a full URL.
    const eventCard = card;
    await expect(eventCard.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href", "https://instagram.com/hatfieldsunday",
    );
    await expect(eventCard.getByRole("link", { name: "Facebook" })).toHaveAttribute(
      "href", "https://facebook.com/hatfieldsunday",
    );
    await expect(eventCard.getByRole("link", { name: "YouTube" })).toHaveAttribute(
      "href", "https://youtube.com/@hatfieldsunday",
    );
    // …and a brand mark beside each, not the empty <svg> lucide 1.x leaves
    // behind for a name it no longer ships.
    await expect(eventCard.getByRole("link", { name: "Instagram" }).locator("svg path")).toHaveCount(1);

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

    // An open overlay is dismissed BEFORE the screen changes. (The category
    // sheet this used to open no longer exists — it duplicated the pill row —
    // so the account panel, the app's one profile entry point, stands in.)
    await page.getByRole("button", { name: "Your account" }).click();
    await expect(page.getByRole("button", { name: /View Profile/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("button", { name: /View Profile/ })).toBeHidden();
    await expect.poll(() => screenName(page)).toBe("discover");

    // At the root with nothing open, Back really does leave — never a trap.
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });
});

test.describe("One card, both surfaces", () => {
  test("a map pin's preview and the Kingdom Exploration card are the same component with the same socials", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    // Open the pin preview. It renders window.EntityCard at layout='panel' —
    // the SAME component the list renders at layout='grid'.
    await page.locator('[data-cc-pin="event"]').first().click();
    const panel = page.locator('[data-entity-card="event"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Everything the founder asked to see on a listing, on the MAP side too:
    // the socials (which the preview never had), a real website control (it
    // used to be a toast that opened nothing) and the route to the profile.
    await expect(panel.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href", "https://instagram.com/hatfieldsunday",
    );
    await expect(panel.getByRole("link", { name: "YouTube" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "View Full Profile" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Website" })).toBeVisible();
    await expect(panel.getByText("Hatfield Sunday Celebration")).toBeVisible();

    // And it opens the same screen a card does.
    await panel.getByRole("button", { name: "View Full Profile" }).click();
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 10_000 });
    // The full profile lists every handle, with its brand mark. The chip shows
    // the handle as text, so its accessible name is "<Platform> — <handle>"
    // (the compact row on a card is icon-only and is named by the platform
    // alone) — a logo is not a label a screen reader can read.
    await expect(page.getByRole("link", { name: /^Instagram/ })).toHaveAttribute(
      "href", "https://instagram.com/hatfieldsunday",
    );
    await expect(page.getByRole("link", { name: /^Instagram/ })).toHaveAccessibleName(
      "Instagram — @hatfieldsunday",
    );
    await expect(page.getByRole("link", { name: /^Facebook/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^YouTube/ })).toBeVisible();
  });
});

test.describe("Map density gates and pin labels", () => {
  test("places drop out at provincial zoom, events at national, contributors never", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".maplibregl-marker")).toHaveCount(3, { timeout: 15_000 });

    const pin = (shape: string) =>
      page.locator(`.maplibregl-marker:has([data-cc-pin="${shape}"])`).first();
    // City zoom (the default framing): everything is on the map.
    await expect(pin("place")).toBeVisible();
    await expect(pin("event")).toBeVisible();
    await expect(pin("contributor")).toBeVisible();

    // Zoom out to provincial scale — MapLibre's own wheel/keyboard zoom, so
    // the gate is exercised through the same path a real user takes.
    await page.locator(".cc-map").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Shift+Minus");
    await page.waitForTimeout(1200);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Minus");
      await page.waitForTimeout(250);
    }
    await expect(pin("place")).toBeHidden({ timeout: 10_000 });
    await expect(pin("contributor")).toBeVisible();
    await expect(page.locator("[data-zoom-hint]")).toBeVisible();
  });

  test("pin names float on a mist, with no capsule around them", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".maplibregl-marker")).toHaveCount(3, { timeout: 15_000 });

    // Selecting a pin names it at ANY zoom.
    await page.locator('[data-cc-pin="place"]').first().click();
    const label = page.locator(".cc-pin-label.is-selected").first();
    await expect(label).toBeVisible();
    await expect(label.locator(".cc-pin-label-text")).toHaveText("Brooklyn Anchor Campus");

    const style = await label.locator(".cc-pin-label-mist").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { filter: cs.filter, background: cs.backgroundColor };
    });
    // The mist is a real blur, not a bordered white pill.
    expect(style.filter).toContain("blur");

    const text = await label.locator(".cc-pin-label-text").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { weight: cs.fontWeight, size: parseFloat(cs.fontSize), shadow: cs.textShadow };
    });
    expect(Number(text.weight)).toBeGreaterThanOrEqual(700);
    expect(text.size).toBeGreaterThanOrEqual(12);
    expect(text.shadow).not.toBe("none");
  });
});

test.describe("One profile entry point", () => {
  test("the account control is top-right on every screen and the bottom bar has no profile tab", async ({ page }) => {
    await mockNetwork(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    // The bottom bar's fifth slot is Kingdom Exploration now, not "You" —
    // whose panel opened past the bottom edge of the screen and was unusable.
    const bottomNav = page.locator("nav.md\\:hidden");
    await expect(bottomNav.getByRole("button", { name: "You" })).toHaveCount(0);
    await expect(bottomNav.getByRole("button", { name: "Explore" })).toBeVisible();

    // Exactly one account control, and its panel opens inside the viewport.
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(1);
    await page.getByRole("button", { name: "Your account" }).click();
    const panel = page.getByRole("button", { name: /View Profile/ });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    await page.keyboard.press("Escape");

    // Same control, same corner, on the list screen.
    await bottomNav.getByRole("button", { name: "Explore" }).click();
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(1);
  });

  test("the map's top bar is search + account only, and categories are one scrollable row", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    const screen = page.locator('[data-screen="discover"]');
    await expect(screen).toBeVisible({ timeout: 15_000 });

    // The duplicate controls are gone: no category sheet trigger, no list button.
    await expect(page.getByRole("button", { name: "Filter by category" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kingdom Discovery" })).toHaveCount(0);

    // One row, starting with All, carrying BOTH category sets (the only thing
    // the removed sheet offered that the row did not).
    await expect(page.getByRole("button", { name: "All categories" })).toBeVisible();
    await expect(screen.getByRole("button", { name: /Church$/ }).first()).toBeVisible();
    await expect(screen.getByRole("button", { name: /Cafés/ }).first()).toBeAttached();
  });
});
