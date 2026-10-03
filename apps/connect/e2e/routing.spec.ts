import { test, expect, type Page, type Route } from "@playwright/test";
import {
  FAKE_PROJECT,
  FAKE_PROJECT_CORS,
  fakeSession,
  installFakeProject,
  mockAppShell,
  signInToFakeProject,
  type FakeUser,
} from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  C15: a real URL for every screen. "The URL stays on index the entire time. I
//  want a URL for every page I go to, so refreshes work on each move."
//
//  What these pin down, in a real browser:
//   • every public route opens directly and SURVIVES A RELOAD, with its path in the bar
//   • the old /index.html?c=<slug>, /index.html and /map links still work and are tidied
//   • browser Back / Forward walk the screens; Back closes an open card first, URL unchanged
//   • /dashboard/<tab> and /admin/<tab> keep their tab across a reload
//   • a signed-in-only screen reached by link while signed out → the sign-in screen →
//     (email code) → lands on that screen; Google's redirect is the site root and the
//     screen travels through a validated return path (never a host, never an open redirect)
//   • the Capacitor hardware Back button: close an overlay, step back, exit from the first screen
//   • the server rewrites the explicit route list and nothing else
// ════════════════════════════════════════════════════════════════════

const ORIGIN = "http://localhost:3100";
const EVENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const FAR_EVENT_ID = "2c1f0e5a-6d3b-4f7a-9c8e-1a2b3c4d5e6f"; // published, but not in the first page of the feed
const PLACE_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const ORG_ID = "11111111-1111-4111-8111-000000000001";
const SLUG = "anchor-community-church";
const PRETORIA = { lat: -25.7479, lng: 28.2293 };

const EVENT = {
  id: EVENT_ID,
  title: "Hatfield Sunday Celebration",
  description: "A weekly gathering open to everyone in the city.",
  date: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  end_time: new Date(Date.now() + 3 * 86_400_000 + 7_200_000).toISOString(),
  location: "1186 Burnett Street, Hatfield, Pretoria",
  category: "church-services",
  image_url: null,
  latitude: PRETORIA.lat,
  longitude: PRETORIA.lng,
  created_by: ORG_ID,
  created_at: new Date().toISOString(),
  volunteer_openings: false,
};
const FAR_EVENT = { ...EVENT, id: FAR_EVENT_ID, title: "Winter Camp Reunion", latitude: PRETORIA.lat + 0.05 };
const PLACE = {
  id: PLACE_ID,
  name: "Brooklyn Anchor Campus",
  description: "Open through the week for prayer, coffee and community.",
  address: "212 Justice Mahomed Street, Brooklyn, Pretoria",
  category: "churches-ministries",
  custom_category: null,
  image_url: null,
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
  category: "churches-ministries",
  contributor_slug: SLUG,
  bio: "A church family serving Pretoria.",
  logo_url: null,
  avatar_url: null,
  physical_address: "212 Justice Mahomed Street, Brooklyn, Pretoria",
  physical_latitude: PRETORIA.lat + 0.03,
  physical_longitude: PRETORIA.lng - 0.03,
  no_fixed_location: false,
  gallery_urls: [],
  cover_photo_urls: [],
};

const path = (page: Page) => new URL(page.url()).pathname;
const screen = (page: Page) => page.evaluate(() => document.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null);
const go = (page: Page, name: string, params?: Record<string, unknown>) =>
  page.evaluate(([n, p]) => (window as unknown as { __cc: { go: (n: string, p?: unknown) => void } }).__cc.go(n as string, p), [name, params]);

/** The public API, answered locally. `extra` lets a test add what a route needs. */
async function mockData(page: Page) {
  await page.route("**/api/v1/events**", (route: Route) => route.fulfill({ json: { data: [EVENT], meta: {} } }));
  await page.route(`**/api/v1/events/${EVENT_ID}`, (route: Route) => route.fulfill({ json: { data: { ...EVENT, stats: {} }, meta: {} } }));
  await page.route(`**/api/v1/events/${FAR_EVENT_ID}`, (route: Route) => route.fulfill({ json: { data: { ...FAR_EVENT, stats: {} }, meta: {} } }));
  await page.route("**/api/v1/places**", (route: Route) => route.fulfill({ json: { data: [PLACE], meta: {} } }));
  await page.route("**/api/v1/contributors**", (route: Route) => route.fulfill({ json: { data: [CONTRIBUTOR], meta: {} } }));
  await page.route(`**/api/v1/contributors/${SLUG}`, (route: Route) =>
    route.fulfill({ json: { data: { profile: CONTRIBUTOR, upcoming_events: [], past_events: [], places: [] } } }),
  );
  await page.route("**/api/v1/contributors/no-such-listing", (route: Route) =>
    route.fulfill({ status: 404, json: { error: "Contributor not found" } }),
  );
}

/** "No Supabase configured" mode: the app's own demo fallback, signed in as `role`. */
async function openDemo(page: Page, role: "citizen" | "contributor" | "admin" = "citizen") {
  await mockAppShell(page, { supabaseUrl: "", anonKey: "" });
  await mockData(page);
  await page.addInitScript((r) => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: r }));
  }, role);
}

test.describe("Every public screen has its own URL and survives a reload", () => {
  const routes: [string, string, string][] = [
    ["/", "discover", "the map"],
    ["/discover", "kingdom-discovery", "Kingdom Exploration"],
    ["/community", "community", "Kingdom Projects"],
    [`/e/${EVENT_ID}`, "event", "an event"],
    [`/p/${PLACE_ID}`, "place", "a place"],
    [`/c/${SLUG}`, "profile", "a Contributor"],
  ];
  for (const [url, name, label] of routes) {
    test(`${url} (${label}) opens directly and stays put after a reload`, async ({ page }) => {
      await openDemo(page);
      await page.goto(url);
      await expect(page.locator(`[data-screen="${name}"]`)).toBeVisible({ timeout: 15_000 });
      expect(path(page)).toBe(url);

      await page.reload();
      await expect(page.locator(`[data-screen="${name}"]`)).toBeVisible({ timeout: 15_000 });
      expect(path(page)).toBe(url);
    });
  }

  test("a link to something the first page of the feed does not hold is fetched by id, with a loading state, not 'not found'", async ({ page }) => {
    await openDemo(page);
    await page.goto(`/e/${FAR_EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]').getByRole("heading", { name: "Winter Camp Reunion" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Event not found")).toHaveCount(0);
    expect(path(page)).toBe(`/e/${FAR_EVENT_ID}`);
  });

  test("something that does not exist says so plainly", async ({ page }) => {
    await openDemo(page);
    await page.route("**/api/v1/events/3d3d3d3d-3d3d-4d3d-8d3d-3d3d3d3d3d3d", (route: Route) =>
      route.fulfill({ status: 404, json: { error: "Not found" } }),
    );
    await page.goto("/e/3d3d3d3d-3d3d-4d3d-8d3d-3d3d3d3d3d3d");
    await expect(page.getByText("Event not found")).toBeVisible({ timeout: 15_000 });
  });

  test("the tab title names the screen", async ({ page }) => {
    await openDemo(page);
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => page.title()).toBe("Hatfield Sunday Celebration · Citizens Connect");
    await go(page, "kingdom-discovery");
    await expect.poll(() => page.title()).toBe("Kingdom Exploration · Citizens Connect");
    await go(page, "home");
    await expect.poll(() => page.title()).toBe("Citizens Connect");
  });
});

test.describe("Old links and aliases keep working, and are tidied", () => {
  test("/index.html?c=<slug> and /c/<slug> both open the listing, and the bar shows /c/<slug>", async ({ page }) => {
    await openDemo(page);
    await page.goto(`/index.html?c=${SLUG}`);
    await expect(page.locator('[data-screen="profile"]').getByRole("heading", { name: "Anchor Community Church" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe(`/c/${SLUG}`);
    expect(new URL(page.url()).search).toBe("");

    await page.goto(`/c/${SLUG}`);
    await expect(page.locator('[data-screen="profile"]').getByRole("heading", { name: "Anchor Community Church" })).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe(`/c/${SLUG}`);
  });

  test("/index.html and /map become /", async ({ page }) => {
    await openDemo(page);
    for (const old of ["/index.html", "/map"]) {
      await page.goto(old);
      await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => path(page), old).toBe("/");
    }
  });

  test("/dashboard/overview and an unknown tab become /dashboard", async ({ page }) => {
    await openDemo(page, "contributor");
    for (const old of ["/dashboard/overview", "/dashboard/nonsense"]) {
      await page.goto(old);
      await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => path(page), old).toBe("/dashboard");
    }
  });

  test("a malformed link falls back to the map and says so", async ({ page }) => {
    await openDemo(page);
    await page.goto("/e/not-a-uuid");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("doesn't match anything in Connect")).toBeVisible();
    await expect.poll(() => path(page)).toBe("/");
  });

  test("an unknown listing says so and lands on the map", async ({ page }) => {
    await openDemo(page);
    await page.goto("/c/no-such-listing");
    await expect(page.getByText("That Contributor listing could not be found.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-screen="profile"]')).toHaveCount(0);
    await expect.poll(() => path(page)).toBe("/");
  });
});

test.describe("Browser Back and Forward", () => {
  test("walk map → Kingdom Exploration → event → Contributor → settings, and back again", async ({ page }) => {
    await openDemo(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    // wait for the directory so the Contributor has its /c/<slug> address
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });

    const steps: [() => Promise<unknown>, string, string][] = [
      [() => go(page, "kingdom-discovery"), "/discover", "kingdom-discovery"],
      [() => go(page, "event", { id: EVENT_ID }), `/e/${EVENT_ID}`, "event"],
      [() => go(page, "profile", { id: ORG_ID }), `/c/${SLUG}`, "profile"],
      [() => go(page, "settings"), "/settings", "settings"],
    ];
    for (const [act, url, name] of steps) {
      await act();
      await expect(page.locator(`[data-screen="${name}"]`)).toBeVisible();
      expect(path(page)).toBe(url);
    }

    for (const [url, name] of [[`/c/${SLUG}`, "profile"], [`/e/${EVENT_ID}`, "event"], ["/discover", "kingdom-discovery"], ["/", "discover"]] as const) {
      await page.goBack();
      await expect.poll(() => screen(page)).toBe(name);
      expect(path(page)).toBe(url);
    }
    for (const [url, name] of [["/discover", "kingdom-discovery"], [`/e/${EVENT_ID}`, "event"]] as const) {
      await page.goForward();
      await expect.poll(() => screen(page)).toBe(name);
      expect(path(page)).toBe(url);
    }
  });

  test("a shared listing: Back before the visitor has done anything leaves, as on any web page", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json"); // where the link "came from"
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("a shared listing: after the visitor's first tap the map is under it, so Back stays in Connect", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-screen="event"]').getByRole("heading", { name: "Hatfield Sunday Celebration" }).click();

    await page.goBack();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(path(page)).toBe("/");
    await page.goForward();
    await expect.poll(() => screen(page)).toBe("event");
    expect(path(page)).toBe(`/e/${EVENT_ID}`);
    await page.goBack();
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("a link that turns out to be nothing lands on the map with no duplicate map entry after the first tap", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto("/c/no-such-listing");
    await expect(page.getByText("That Contributor listing could not be found.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe("/");
    await page.keyboard.press("Tab");
    await page.goBack(); // one entry only: this leaves
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("a screen opened from a shared listing steps back to the listing, then the map, then leaves", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto(`/c/${SLUG}`);
    await expect(page.locator('[data-screen="profile"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Kingdom Exploration" }).first().click();
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();

    await page.goBack();
    await expect.poll(() => screen(page)).toBe("profile");
    expect(path(page)).toBe(`/c/${SLUG}`);
    await page.goBack();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(path(page)).toBe("/");
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("Back with a preview card open closes the card and keeps the URL", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto("/");
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    await page.locator('[data-cc-pin="event"]').first().click();
    await expect(page.locator('[data-entity-card="event"]')).toBeVisible();

    await page.goBack();
    await expect(page.locator('[data-entity-card="event"]')).toBeHidden();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(path(page)).toBe("/");
    // and Back is not now stuck: the second press leaves, it does not open the card again
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("history.state is not trusted: a forged slug never reaches the network", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await openDemo(page);
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    // an entry whose saved screen names a slug the route table would never allow
    await page.evaluate(() => {
      history.pushState({ cc: 1, idx: 1, nav: { page: "profile", params: { slug: "../../api/admin" } } }, "", "/discover");
      history.back();
    });
    await expect.poll(() => path(page)).toBe("/");
    await page.goForward(); // onto the forged entry: the handler restores its nav
    await expect.poll(() => path(page)).toBe("/discover");
    await page.waitForTimeout(500);
    expect(requested.filter((u) => u.includes("/api/admin") || u.includes(".."))).toEqual([]);
  });

  test("from the first screen, Back really leaves", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json"); // a real previous entry
    await page.goto("/discover");
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });
});

// Chrome on Android skips every history entry a page added WITHOUT a user gesture when
// Back is pressed, which is how Back used to leave Connect altogether (founder, 2026-10-03).
// Playwright's page.goBack() is programmatic, so it can never show that. What it CAN show
// is the cause: record each pushState with navigator.userActivation.isActive at that moment.
test.describe("Back is built from taps only (Chrome's history-manipulation intervention)", () => {
  type Push = { active: boolean; guard: boolean; url: string };
  async function recordPushes(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { __pushes: Push[] };
      w.__pushes = [];
      const orig = History.prototype.pushState;
      History.prototype.pushState = function (this: History, state: unknown, title: string, url?: string | URL | null) {
        w.__pushes.push({
          active: navigator.userActivation.isActive,
          guard: !!(state && (state as { guard?: boolean }).guard),
          url: String(url),
        });
        return orig.call(this, state, title, url);
      };
    });
  }
  const pushes = (page: Page) => page.evaluate(() => (window as unknown as { __pushes: Push[] }).__pushes);

  for (const url of ["/", "/discover", `/e/${EVENT_ID}`, `/p/${PLACE_ID}`, `/c/${SLUG}`, "/index.html?c=" + SLUG]) {
    test(`opening ${url} adds no history entry on its own`, async ({ page }) => {
      await recordPushes(page);
      await openDemo(page);
      await page.goto(url);
      await expect(page.locator("[data-screen]").first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(600); // let every boot effect and the async resolvers settle
      expect(await pushes(page)).toEqual([]);
    });
  }

  test("the map goes under a shared listing inside the visitor's first key press or tap, once, and not before", async ({ page }) => {
    await recordPushes(page);
    await openDemo(page);
    await page.goto(`/c/${SLUG}`);
    await expect(page.locator('[data-screen="profile"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500); // idle: still nothing
    expect(await pushes(page)).toEqual([]);

    await page.keyboard.press("Tab");
    await expect.poll(async () => (await pushes(page)).length).toBe(1);
    expect((await pushes(page))[0]).toEqual({ active: true, guard: false, url: `/c/${SLUG}` });

    // later taps add nothing of their own: it is armed once
    await page.locator('[data-screen="profile"]').getByRole("heading", { name: "Anchor Community Church" }).click();
    await page.keyboard.press("Tab");
    expect(await pushes(page)).toHaveLength(1);
  });

  test("a card and a screen opened by real taps push inside the tap, one entry per screen", async ({ page }) => {
    await recordPushes(page);
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto("/");
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    expect(await pushes(page)).toEqual([]);

    // tap a pin: one guard entry, pushed while the tap's user activation is live
    await page.locator('[data-cc-pin="event"]').first().click();
    await expect(page.locator('[data-entity-card="event"]')).toBeVisible();
    await expect.poll(async () => (await pushes(page)).length).toBe(1);
    expect((await pushes(page))[0]).toMatchObject({ active: true, guard: true });

    // "View Full Profile" moves on: the card's guard entry becomes the event's entry (no 2nd push)
    await page.locator('[data-entity-card="event"]').getByRole("button", { name: "View Full Profile" }).click();
    await expect(page.locator('[data-screen="event"]')).toBeVisible();
    expect(path(page)).toBe(`/e/${EVENT_ID}`);
    expect(await pushes(page)).toHaveLength(1);

    // one Back = the map again with the card closed; a second leaves Connect
    await page.goBack();
    await expect.poll(() => screen(page)).toBe("discover");
    await expect(page.locator('[data-entity-card="event"]')).toBeHidden();
    expect(path(page)).toBe("/");
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("a screen opened from the menu pushes one entry inside the tap, and Back is one press", async ({ page }) => {
    await recordPushes(page);
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto("/");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Kingdom Exploration" }).first().click();
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
    expect(path(page)).toBe("/discover");
    expect(await pushes(page)).toEqual([{ active: true, guard: false, url: "/discover" }]);

    await page.goBack();
    await expect.poll(() => screen(page)).toBe("discover");
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("closing a card with its own button leaves no extra entry behind", async ({ page }) => {
    await recordPushes(page);
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto("/");
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });

    await page.locator('[data-cc-pin="event"]').first().click();
    await expect(page.locator('[data-entity-card="event"]')).toBeVisible();
    await page.locator('[data-entity-card="event"]').getByRole("button", { name: "Close" }).click();
    await expect(page.locator('[data-entity-card="event"]')).toBeHidden();
    // the card's own entry is taken back off the stack (async), so one Back leaves
    await page.waitForTimeout(300);
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("closing a panel by a tap outside it leaves the screen exactly where it was scrolled", async ({ page }) => {
    // Closing pops the panel's own history entry; that popstate must not be mistaken for a
    // screen change (which would reset the scroll to the top).
    await openDemo(page);
    await page.goto("/discover");
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible({ timeout: 15_000 });
    const scrolled = () => page.evaluate(() => document.getElementById("main-scroll")?.scrollTop ?? -1);
    await page.evaluate(() => {
      const main = document.getElementById("main-scroll") as HTMLElement;
      const pad = document.createElement("div"); // the demo list is short: make the screen tall enough to scroll
      pad.style.height = "4000px";
      main.appendChild(pad);
      main.scrollTop = 600;
    });
    expect(await scrolled()).toBeGreaterThan(500);

    await page.getByRole("button", { name: "Your account" }).click();
    await expect(page.getByRole("button", { name: /View Profile/ })).toBeVisible();
    await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))); // a tap outside
    await expect(page.getByRole("button", { name: /View Profile/ })).toBeHidden();
    await page.waitForTimeout(400); // the panel's own history.back() settles
    expect(await scrolled()).toBeGreaterThan(500);
    expect(path(page)).toBe("/discover");
  });

  test("opening and closing a card twice never stacks entries or traps Back", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto("/");
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    const pin = page.locator('[data-cc-pin="event"]').first();
    const card = page.locator('[data-entity-card="event"]');

    await pin.click();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Close" }).click(); // closed by its button
    await expect(card).toBeHidden();
    await page.waitForTimeout(300);
    await pin.click();
    await expect(card).toBeVisible();
    await page.goBack(); // closed by Back
    await expect(card).toBeHidden();
    await pin.click();
    await expect(card).toBeVisible();
    await page.goBack();
    await expect(card).toBeHidden();
    expect(path(page)).toBe("/");

    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("two overlays closed out of order leave nothing for Back to stall on", async ({ page }) => {
    await openDemo(page);
    await page.goto("/manifest.json");
    await page.goto("/");
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    const card = page.locator('[data-entity-card="event"]');
    const sheet = page.getByRole("heading", { name: "Create Event" });

    await page.locator('[data-cc-pin="event"]').first().click();
    await expect(card).toBeVisible();
    await page.evaluate(() => (window as unknown as { __cc: { openCreate: (k: string) => void } }).__cc.openCreate("event"));
    await expect(sheet).toBeVisible();

    // the LOWER overlay (the card) closes first, so its history entry is left under the sheet's
    await card.getByRole("button", { name: "Close" }).evaluate((el: HTMLElement) => el.click());
    await expect(card).toBeHidden();
    await expect(sheet).toBeVisible();

    // one Back closes the sheet and steps over the card's leftover entry: still on the map…
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(path(page)).toBe("/");
    // …so the very next Back leaves Connect (it used to need one more press)
    await page.goBack();
    await expect.poll(() => page.url()).toContain("manifest.json");
  });

  test("Forward onto a closed card's entry keeps the map, with the card closed", async ({ page }) => {
    await openDemo(page);
    await page.goto("/");
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    const card = page.locator('[data-entity-card="event"]');
    await page.locator('[data-cc-pin="event"]').first().click();
    await expect(card).toBeVisible();
    await page.goBack();
    await expect(card).toBeHidden();

    await page.goForward();
    await page.waitForTimeout(300);
    await expect(card).toBeHidden();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(path(page)).toBe("/");
  });
});

test.describe("Dashboard and Admin tabs live in the URL", () => {
  test("/dashboard/<tab> keeps its tab across a reload, and switching tabs updates the address without piling up history", async ({ page }) => {
    await openDemo(page, "contributor");
    await page.goto("/dashboard/events");
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe("/dashboard/events");

    await page.reload();
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe("/dashboard/events");

    await page.getByRole("button", { name: "news", exact: true }).click();
    await expect(page.getByRole("button", { name: "+ New post" })).toBeVisible();
    expect(path(page)).toBe("/dashboard/news");
    await page.reload();
    await expect(page.getByRole("button", { name: "+ New post" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "overview", exact: true }).click();
    await expect.poll(() => path(page)).toBe("/dashboard");

    // tabs are views of one screen: Back leaves the Dashboard, it does not replay every tab
    await go(page, "kingdom-discovery");
    await page.goBack();
    await expect.poll(() => screen(page)).toBe("dashboard");
    expect(path(page)).toBe("/dashboard");
  });

  test("/admin/<tab> keeps its tab", async ({ page }) => {
    await openDemo(page, "admin");
    await page.goto("/admin/reports");
    await expect(page.locator('[data-screen="admin"]')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.locator('[data-screen="admin"]')).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe("/admin/reports");
    await page.getByRole("button", { name: "Listings", exact: true }).click();
    await expect.poll(() => path(page)).toBe("/admin/listings");
  });
});

// ── Real-mode sessions against a fake Supabase project ────────────────

const CITIZEN: FakeUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "citizen@route.example", fullName: "Route Citizen" };
const MEMBER: FakeUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "contributor@route.example", fullName: "Route Contributor" };
const ADMIN: FakeUser = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "admin@route.example", fullName: "Route Admin" };
const CODE = "482913";

async function realShell(page: Page) {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await mockData(page);
  // a citizen with nothing to claim stays put (a 200 would reload to /dashboard)
  await page.route("**/api/contributor/claim", (route: Route) => route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
}

test.describe("Signed-in-only screens reached by link", () => {
  test.use({ bypassCSP: true });

  test("signed out → the sign-in screen → an emailed code → lands on the screen the link named", async ({ page }) => {
    await realShell(page);
    const session = fakeSession(CITIZEN);
    await installFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } }, session);
    await page.route(`${FAKE_PROJECT}/auth/v1/otp**`, (route: Route) =>
      route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ headers: FAKE_PROJECT_CORS, json: {} }),
    );
    await page.route(`${FAKE_PROJECT}/auth/v1/verify**`, (route: Route) =>
      route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ headers: FAKE_PROJECT_CORS, json: session }),
    );

    await page.goto("/settings");
    // not the settings page: the sign-in screen
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-screen="settings"]')).toHaveCount(0);
    expect(path(page)).toBe("/settings");

    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.getByLabel("Your email address").fill(CITIZEN.email);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("6-digit code").fill(CODE);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.locator('[data-screen="settings"]')).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe("/settings");
  });

  test("a signed-out visitor following a PUBLIC link sees it as a guest, not the sign-in screen", async ({ page }) => {
    await realShell(page);
    await installFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe(`/e/${EVENT_ID}`);
  });

  test("choosing 'browse as guest' on a link to a signed-in-only screen lands on the map, not that screen", async ({ page }) => {
    await realShell(page);
    await installFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
    await page.goto("/messages");
    await page.getByRole("button", { name: /browse as (a )?guest/i }).click();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe("/");
  });

  test("a signed-in citizen who opens /dashboard is nudged to become a Contributor", async ({ page }) => {
    await realShell(page);
    await signInToFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
    await page.goto("/dashboard/events");
    await expect(page.locator('[data-screen="apply"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Become a Contributor to unlock your portal.")).toBeVisible();
    await expect.poll(() => path(page)).toBe("/apply");
  });

  test("a signed-in non-admin who opens /admin lands on the map", async ({ page }) => {
    await realShell(page);
    await signInToFakeProject(page, { user: MEMBER, profile: { role: "contributor", contributor_status: "approved" } });
    await page.goto("/admin/listings");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("That page is for admins.")).toBeVisible();
    await expect.poll(() => path(page)).toBe("/");
  });

  test("a Contributor reloads on /dashboard/events and stays there", async ({ page }) => {
    await realShell(page);
    await signInToFakeProject(page, { user: MEMBER, profile: { role: "contributor", contributor_status: "approved" } });
    await page.goto("/dashboard/events");
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe("/dashboard/events");
  });

  test("an admin can open /admin directly", async ({ page }) => {
    await realShell(page);
    await signInToFakeProject(page, { user: ADMIN, profile: { role: "admin", contributor_status: "not_applied" } });
    await page.goto("/admin/listings");
    await expect(page.locator('[data-screen="admin"]')).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe("/admin/listings");
  });
});

test.describe("Sign-in redirects are fixed and safe", () => {
  test.use({ bypassCSP: true });

  test("Google returns to the site ROOT, and the screen travels in a validated return path", async ({ page }) => {
    await realShell(page);
    await installFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
    let authorize = "";
    await page.route(`${FAKE_PROJECT}/auth/v1/authorize**`, (route: Route) => {
      authorize = route.request().url();
      return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Google</body></html>" });
    });

    await page.goto("/settings");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => authorize).not.toBe("");

    // the redirect target is the fixed root, never the deep path
    expect(new URL(authorize).searchParams.get("redirect_to")).toBe(`${ORIGIN}/`);

    // the screen to return to was stashed, as a canonical same-origin path only
    await page.goto("/");
    const stash = await page.evaluate(() => sessionStorage.getItem("cc_return_to"));
    expect(JSON.parse(stash!).p).toBe("/settings");
  });

  test("coming back from sign-in carries on to the stashed screen", async ({ page }) => {
    await realShell(page);
    await page.addInitScript(() => {
      sessionStorage.setItem("cc_return_to", JSON.stringify({ p: "/dashboard/events", t: Date.now() }));
    });
    await signInToFakeProject(page, { user: MEMBER, profile: { role: "contributor", contributor_status: "approved" } });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe("/dashboard/events");
    // it is single-use
    expect(await page.evaluate(() => sessionStorage.getItem("cc_return_to"))).toBeNull();
  });

  for (const [label, stash] of [
    ["a protocol-relative host", "//evil.example/steal"],
    ["an absolute URL", "https://evil.example/"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a backslash trick", "/\\evil.example"],
    ["an unknown path", "/api/v1/events"],
    ["a stale stash", "/dashboard/events"],
  ] as const) {
    test(`ignores ${label}`, async ({ page }) => {
      await realShell(page);
      const old = label === "a stale stash";
      await page.addInitScript(
        ([p, stale]) => {
          sessionStorage.setItem("cc_return_to", JSON.stringify({ p, t: stale ? Date.now() - 2 * 3_600_000 : Date.now() }));
        },
        [stash, old] as const,
      );
      await signInToFakeProject(page, { user: MEMBER, profile: { role: "contributor", contributor_status: "approved" } });
      await page.goto("/");
      await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).origin).toBe(ORIGIN);
      expect(path(page)).toBe("/");
    });
  }
});

test.describe("The Capacitor hardware Back button", () => {
  test("closes an open card, then steps back through the screens, then exits from the first", async ({ page }) => {
    await openDemo(page);
    // stand in for the native bridge: capture the listener, record the exit
    await page.route("**/capacitor-bridge*.js", (route: Route) =>
      route.fulfill({
        contentType: "application/javascript",
        body:
          "window.CapCore={isNativePlatform:function(){return true;}};" +
          "window.CapApp={addListener:function(e,cb){if(e==='backButton')window.__capBack=cb;return Promise.resolve({remove:function(){}});}," +
          "exitApp:function(){window.__exited=true;}};",
      }),
    );
    const back = () => page.evaluate(() => (window as unknown as { __capBack: () => void }).__capBack());
    const exited = () => page.evaluate(() => !!(window as unknown as { __exited?: boolean }).__exited);

    await page.goto("/");
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __capBack?: unknown }).__capBack)).toBe("function");

    await go(page, "kingdom-discovery");
    await go(page, "event", { id: EVENT_ID });
    await expect(page.locator('[data-screen="event"]')).toBeVisible();

    // an open overlay is dismissed before the screen changes
    await go(page, "home");
    await page.locator('[data-cc-pin="event"]').first().click();
    await expect(page.locator('[data-entity-card="event"]')).toBeVisible();
    await back();
    await expect(page.locator('[data-entity-card="event"]')).toBeHidden();
    expect(await exited()).toBe(false);

    // then back through the screens
    await back();
    await expect.poll(() => screen(page)).toBe("event");
    await back();
    await expect.poll(() => screen(page)).toBe("kingdom-discovery");
    expect(path(page)).toBe("/discover");
    await back();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(path(page)).toBe("/");
    expect(await exited()).toBe(false);

    // and from the first screen, the app exits
    await back();
    expect(await exited()).toBe(true);
  });
});

test.describe("Sharing a link", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("Share copies the real address of the screen", async ({ page }) => {
    await openDemo(page);
    await page.goto(`/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-screen="event"]').getByRole("button", { name: "Share" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${ORIGIN}/e/${EVENT_ID}`);
  });
});

test.describe("The server serves exactly the route table", () => {
  test("every route returns the app shell with <base href>, and unknown paths keep Next's 404", async ({ request }) => {
    for (const p of ["/", "/discover", "/map", "/community", "/me", "/messages", `/messages/${EVENT_ID}`, "/notifications", "/settings", "/apply", "/onboarding", "/dashboard", "/dashboard/events", "/admin", "/admin/listings", `/e/${EVENT_ID}`, `/p/${PLACE_ID}`, `/c/${SLUG}`]) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      expect(await res.text(), p).toContain('<base href="/"');
    }
    // the legacy file is still served as it was, so old bookmarks keep working
    expect((await request.get("/index.html")).status()).toBe(200);
    // not in the table: not the app
    for (const p of ["/foo", "/dashboard/a/b", "/e/x/y"]) {
      expect((await request.get(p)).status(), p).toBe(404);
    }
    // the API and static files are untouched
    expect((await request.get("/manifest.json")).status()).toBe(200);
    expect((await request.get("/api/v1/does-not-exist")).status()).toBe(404);
  });
});
