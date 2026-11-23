import { test, expect, type Page, type Route } from "@playwright/test";
import { openListing, openMe } from "./support/map-v2";

declare global {
  interface Window {
    __cc: { go: (page: string, params?: Record<string, unknown>) => void };
    // The map's inspection hook (map.jsx) — lets a spec jump to an exact zoom.
    __ccMap: {
      jumpTo: (o: { center: [number, number]; zoom: number }, eventData?: Record<string, unknown>) => void;
    };
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

// An event that finished months ago — it must not sit on the map or in the
// discovery list, only on its organiser's profile under "Past events".
const PAST_EVENT = {
  ...EVENT,
  id: "e2e-event-past",
  title: "Last Summer's Beach Camp",
  date: new Date(Date.now() - 120 * 86_400_000).toISOString(),
  end_time: new Date(Date.now() - 120 * 86_400_000 + 7_200_000).toISOString(),
  latitude: PRETORIA.lat + 0.01,
  longitude: PRETORIA.lng - 0.01,
};

async function mockNetwork(
  page: Page,
  seedOverride: Partial<Record<"events" | "places" | "contributors", unknown[]>> = {},
) {
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
    ...seedOverride,
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
    // so the account panel, the app's one profile entry point, stands in: on the map home it is the nav's Me.)
    await openMe(page);
    await expect(page.locator(".me-page")).toBeVisible();
    await page.goBack();
    await expect(page.locator(".me-page")).toHaveCount(0);
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

    // Open the pin preview. The Map v2 sheet renders window.EntityCard at layout='sheet' —
    // the SAME component the list renders at layout='grid'.
    await openListing(page, (await page.locator('.maplibregl-marker:has([data-cc-pin="event"])').first().getAttribute("data-cc-id"))!);
    const panel = page.locator('[data-entity-card="event"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Raised profile: circular handles live in handle-row under the category (not inside the lead card body).
    const handles = page.locator("[data-mv2='handle-row']");
    await expect(handles.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href", "https://instagram.com/hatfieldsunday",
    );
    await expect(handles.getByRole("link", { name: "YouTube" })).toBeVisible();
    await expect(page.locator("[data-mv2='view-full']")).toBeVisible();
    await expect(page.locator("[data-map-sheet-header]")).toContainText("Hatfield Sunday Celebration");

    // And it opens the same screen a card does.
    await page.locator("[data-mv2='view-full']").click();
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

test.describe("Every pin opens the same small card", () => {
  test("tapping a Place pin opens the sheet on the map — not the full page — and names its owner", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    // A place and an event. The contributor is not a pin.
    await expect(page.locator(".maplibregl-marker")).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('[data-cc-pin="contributor"]')).toHaveCount(0);

    await openListing(page, (await page.locator('.maplibregl-marker:has([data-cc-pin="place"])').first().getAttribute("data-cc-id"))!);
    const sheet = page.locator("[data-mv2='sheet']");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-screen="discover"]')).toBeVisible();
    await expect(page.locator('[data-screen="place"]')).toHaveCount(0);

    await expect(page.locator("[data-map-sheet-header]")).toContainText("Brooklyn Anchor Campus");
    await expect(sheet).toContainText("by Anchor Community Church");
    await expect(page.locator("[data-mv2='view-full']")).toBeVisible();

    await page.locator("[data-mv2='view-full']").click();
    await expect(page.locator('[data-screen="place"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Brooklyn Anchor Campus" })).toBeVisible();
  });
});

test.describe("Finished events", () => {
  test("a past event is not on the map or in Kingdom Discovery, and stays on its organiser's profile under Past events", async ({ page }) => {
    await mockNetwork(page, { events: [EVENT, PAST_EVENT] });
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    // Place + the ONE upcoming event. The contributor is not pinned, and the finished event is absent.
    await expect(page.locator(".maplibregl-marker")).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1);

    await page.evaluate(() => window.__cc.go("kingdom-discovery"));
    const list = page.locator('[data-screen="kingdom-discovery"]');
    await expect(list.locator('[data-entity-card="event"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(list.getByText("Hatfield Sunday Celebration").first()).toBeVisible();
    await expect(list.getByText("Last Summer's Beach Camp")).toHaveCount(0);

    // The organiser's own profile keeps it, under its own heading.
    await page.evaluate((id) => window.__cc.go("profile", { id }), ORG_ID);
    const profile = page.locator('[data-screen="profile"]');
    await expect(profile.getByText("Events (1)", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(profile.getByText("Past events (1)", { exact: true })).toBeVisible();
    await expect(profile.getByText("Last Summer's Beach Camp")).toBeVisible();
  });

  test("with no upcoming events the Events tab says so plainly instead of showing a blank list", async ({ page }) => {
    await mockNetwork(page, { events: [PAST_EVENT] });
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    // Map: only the place. The contributor is not a pin, and the finished event is absent.
    await expect(page.locator(".maplibregl-marker")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(0);

    await page.evaluate(() => window.__cc.go("kingdom-discovery"));
    const list = page.locator('[data-screen="kingdom-discovery"]');
    await expect(list).toBeVisible();
    await page.getByRole("button", { name: "Events", exact: true }).click();
    await expect(list.getByText("No upcoming events yet")).toBeVisible();
    await expect(list.getByText("Follow organisations to hear when they post.")).toBeVisible();
    await expect(list.locator("[data-entity-card]")).toHaveCount(0);
  });
});

test.describe("Map density gates and pin labels", () => {
  test("pins peel away as you zoom out — places, then events — and the hint says what is hidden", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".maplibregl-marker")).toHaveCount(2, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => !!window.__ccMap)).toBe(true);

    const pin = (shape: string) =>
      page.locator(`.maplibregl-marker:has([data-cc-pin="${shape}"])`).first();
    // `originalEvent` marks the jump as the user's own, so the map's
    // "frame the data" fallback doesn't undo it on the next re-render.
    const zoomTo = (z: number) =>
      page.evaluate(
        (zoom) => window.__ccMap.jumpTo({ center: [28.2293, -25.7479], zoom }, { originalEvent: {} }),
        z,
      );
    const hint = page.locator("[data-zoom-hint]");

    // City zoom: places and events are on the map. Contributors are not pins.
    await zoomTo(11);
    await expect(pin("place")).toBeVisible();
    await expect(pin("event")).toBeVisible();
    await expect(pin("contributor")).toHaveCount(0);
    await expect(hint).toHaveCount(0);

    // Provincial (below 9.5): places go; events stay.
    await zoomTo(8.5);
    await expect(pin("place")).toBeHidden();
    await expect(pin("event")).toBeVisible();
    await expect(hint).toHaveAttribute("data-zoom-hint", "places");

    // Wider (below 7.5): events go too. Nothing is left to pin.
    await zoomTo(6.5);
    await expect(pin("event")).toBeHidden();
    await expect(page.locator(".maplibregl-marker:visible")).toHaveCount(0);
    await expect(hint).toHaveAttribute("data-zoom-hint", "none");
    await expect(hint).toContainText("events and places");

    await zoomTo(7.5);
    await expect(pin("event")).toBeVisible();
  });

  test("guest landing is the country overview; pins appear once the person zooms into a town", async ({ page }) => {
    // Founder 2026-11-23: no fitBounds-to-data (a Cape Town outlier must not steal the first paint).
    // Country zoom gates every pin out; zooming into Pretoria reveals the local event, then places.
    const capeTownPlace = { ...PLACE, id: "e2e-place-ct", name: "Table Bay Chapel", latitude: -33.92, longitude: 18.42 };
    await mockNetwork(page, { places: [capeTownPlace] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".maplibregl-marker")).toHaveCount(2, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => !!window.__ccMap)).toBe(true);

    const event = page.locator('.maplibregl-marker:has([data-cc-pin="event"])');
    const place = page.locator('.maplibregl-marker:has([data-cc-pin="place"])');
    await expect(page.locator("[data-zoom-hint]")).toHaveAttribute("data-zoom-hint", "none");
    await expect(event).toBeHidden();
    await expect(place).toBeHidden();

    await page.evaluate(() => {
      window.__ccMap.jumpTo({ center: [28.2293, -25.7479], zoom: 8 }, { originalEvent: {} });
    });
    await expect(event).toBeVisible();
    await expect(event).toBeInViewport({ ratio: 1 });
    await expect(page.locator("[data-zoom-hint]")).toHaveAttribute("data-zoom-hint", "places");
  });

  test("a pin's name appears from neighbourhood zoom (15), not before", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.locator(".maplibregl-marker")).toHaveCount(2, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => !!window.__ccMap)).toBe(true);

    const zoomTo = (z: number) =>
      page.evaluate(
        (zoom) => window.__ccMap.jumpTo({ center: [28.2293, -25.7479], zoom }, { originalEvent: {} }),
        z,
      );
    const labelsOn = () => page.locator(".cc-map").getAttribute("data-cc-labels");

    await zoomTo(14.9);
    await expect.poll(labelsOn).toBe("0");
    await zoomTo(15);
    await expect.poll(labelsOn).toBe("1");
  });
});

test.describe("One profile entry point", () => {
  test("the account control is top-right on every screen and the bottom bar has no profile tab", async ({ page }) => {
    await mockNetwork(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    // Founder, 2026-11-17: no account button on the map home; the open panel's sticky nav (Explore, Map, Me) holds it in Me.
    // There is no "You" tab.
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(0);
    await openMe(page);
    await expect(page.locator(".me-page")).toBeVisible();
    const me = await page.locator(".me-page").boundingBox();
    const vp = page.viewportSize()!;
    expect(me).not.toBeNull();
    expect(me!.y).toBeGreaterThanOrEqual(0);
    expect(me!.height).toBeGreaterThan(200);
    expect(me!.y + 40).toBeLessThanOrEqual(vp.height);
    await page.locator("[data-rail-item='explore']").click();
    await expect(page.locator('[data-screen="explore"]')).toBeVisible();
  });

  test("the map's top bar is search only, and the categories are inside the Explore panel", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    const screen = page.locator('[data-screen="discover"]');
    await expect(screen).toBeVisible({ timeout: 15_000 });

    // The duplicate controls are gone: no category sheet trigger, no list button.
    await expect(page.getByRole("button", { name: "Filter by category" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kingdom Discovery" })).toHaveCount(0);

    // #210 (founder, 2026-10-26 and 2026-10-30): the choices are the category GROUPS, which between them cover every event
    // category, place category and Contributor type (mapV2Explore.test.tsx checks the mapping). They are no longer a pill row
    // over the map: they are a list inside the Explore panel, behind its title, starting with All.
    await expect(screen.getByRole("group", { name: "Show on the map" })).toHaveCount(0);
    await expect(screen.getByRole("button", { name: "Your account" })).toHaveCount(0);
    await expect(screen.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    // a phone rests on the crown, which shows the Where to… tiles; a wide screen shows them from the start
    const crown = screen.locator("[data-mv2='explore-crown']");
    if (await crown.isVisible()) await crown.click();
    const tiles = screen.locator("[data-mv2='explore-tiles']");
    await expect(tiles.getByRole("button", { name: "Coffee", exact: true })).toBeVisible();
    await expect(tiles.getByRole("button", { name: "Church", exact: true })).toBeVisible();
    await expect(tiles.getByRole("button", { name: "Worship", exact: true })).toBeVisible();
  });
});
