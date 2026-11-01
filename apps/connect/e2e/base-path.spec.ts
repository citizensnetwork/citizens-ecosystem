import { test, expect, type Page, type Route } from "@playwright/test";
import { openListing } from "./support/map-v2";
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
//  C39, PR B: Connect served under /citizens/connect (NEXT_PUBLIC_BASE_PATH).
//
//  Run by playwright.base-path.config.ts only (`pnpm test:e2e:base-path`): the app is built and
//  served WITH the prefix on its own port, and the root-mode suite never sees this file. Hermetic like
//  the rest: config.js's Supabase values, MapTiler and /api/** are answered locally; the built
//  config.js's BASE_PATH and API_BASE_URL are kept (they are what the build wrote), so the page
//  really runs the way a prefixed deployment would.
//
//  What it pins down, in a real browser:
//   • every kind of screen opens directly and survives a reload, with the prefix in the address bar
//   • in-app taps, Back and Forward never leave the prefix (every history write is recorded)
//   • a copied share link carries the prefix
//   • sign-in returns to the right screen (Google's redirect, the stashed screen, the emailed code)
//   • no request fails (no 404 for an asset or an API call) and nothing is requested outside the prefix
// ════════════════════════════════════════════════════════════════════

const BASE = "/citizens/connect";
const EVENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
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

const CITIZEN: FakeUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "citizen@route.example", fullName: "Route Citizen" };
const MEMBER: FakeUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "contributor@route.example", fullName: "Route Contributor" };
const CODE = "482913";
/** realShell answers this with a 404 on purpose ("nothing to claim"), as the root-mode specs do. */
const NOTHING_TO_CLAIM = [`404 ${BASE}/api/contributor/claim`];

const path = (page: Page) => new URL(page.url()).pathname;
const screen = (page: Page) => page.evaluate(() => document.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null);
const go = (page: Page, name: string, params?: Record<string, unknown>) =>
  page.evaluate(([n, p]) => (window as unknown as { __cc: { go: (n: string, p?: unknown) => void } }).__cc.go(n as string, p), [name, params]);
const underBase = (p: string) => p === BASE || p.startsWith(`${BASE}/`);

// ── what the page asked for, and what the server answered ─────────────

/** Records every same-origin request that failed or answered 4xx/5xx, and every one outside the prefix. */
function watch(page: Page, origin: string) {
  const failed: string[] = [];
  const outside: string[] = [];
  const api: string[] = [];
  const own = (url: string) => new URL(url).origin === origin;
  page.on("request", (r) => {
    if (!own(r.url())) return;
    const p = new URL(r.url()).pathname;
    if (!underBase(p)) outside.push(p);
    if (p.includes("/api/")) api.push(p);
  });
  page.on("response", (r) => {
    if (own(r.url()) && r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on("requestfailed", (r) => {
    if (own(r.url())) failed.push(`${r.failure()?.errorText ?? "failed"} ${new URL(r.url()).pathname}`);
  });
  return {
    /** `expected` names a failure a test provokes on purpose (a mocked 404), so nothing else can hide behind it. */
    expectClean: (expected: string[] = []) => {
      expect(failed.filter((f) => !expected.includes(f)), "same-origin requests that failed or answered 4xx/5xx").toEqual([]);
      expect(outside, "same-origin requests outside the prefix").toEqual([]);
    },
    api: () => api,
  };
}

/** Every pushState / replaceState address the page writes: none may leave the prefix. */
async function recordHistory(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __writes: string[] };
    w.__writes = [];
    for (const name of ["pushState", "replaceState"] as const) {
      const orig = History.prototype[name];
      History.prototype[name] = function (this: History, state: unknown, title: string, url?: string | URL | null) {
        w.__writes.push(url == null ? "" : String(url));
        return orig.call(this, state, title, url);
      };
    }
  });
}
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __writes: string[] }).__writes);

// ── the hermetic shell ────────────────────────────────────────────────

/** The public API, answered locally, at the prefixed address the page must use. */
async function mockData(page: Page) {
  await page.route("**/api/v1/events**", (route: Route) => route.fulfill({ json: { data: [EVENT], meta: {} } }));
  await page.route(`**/api/v1/events/${EVENT_ID}`, (route: Route) => route.fulfill({ json: { data: { ...EVENT, stats: {} }, meta: {} } }));
  await page.route("**/api/v1/places**", (route: Route) => route.fulfill({ json: { data: [PLACE], meta: {} } }));
  await page.route("**/api/v1/contributors**", (route: Route) => route.fulfill({ json: { data: [CONTRIBUTOR], meta: {} } }));
  await page.route(`**/api/v1/contributors/${SLUG}`, (route: Route) =>
    route.fulfill({ json: { data: { profile: CONTRIBUTOR, upcoming_events: [], past_events: [], places: [] } } }),
  );
}

/**
 * mockAppShell's answers, except config.js: Supabase and MapTiler are the test values, but API_BASE_URL and
 * BASE_PATH are what the real build wrote (fetched from the running server inside the route), so a missing or
 * wrong prefix there makes the page fail here instead of being papered over. The "server" tests below also
 * check the served file itself.
 */
async function shell(page: Page, supabaseUrl = "", anonKey = "") {
  await mockAppShell(page, { supabaseUrl, anonKey });
  await page.route("**/config.js", async (route: Route) => {
    const real = await route.fetch();
    const match = /window\.__CC_ENV\s*=\s*(\{[\s\S]*?\});/.exec(await real.text());
    const built = (match ? JSON.parse(match[1]) : {}) as Record<string, string | undefined>;
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.__CC_ENV = ${JSON.stringify({
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: anonKey,
        API_BASE_URL: built.API_BASE_URL ?? "",
        BASE_PATH: built.BASE_PATH,
        MAPTILER_KEY: "e2e-test-key",
        MAPTILER_STYLE: "streets-v2",
      })};`,
    });
  });
  await mockData(page);
}

/** "No Supabase configured": the app's own demo fallback, signed in as `role`. */
async function openDemo(page: Page, role: "citizen" | "contributor" | "admin" = "citizen") {
  await shell(page);
  await page.addInitScript((r) => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: r }));
  }, role);
}

/** A real-mode shell against the fake Supabase project (needs `bypassCSP`). */
async function realShell(page: Page) {
  await shell(page, FAKE_PROJECT, "e2e-anon-key");
  // a citizen with nothing to claim stays put (a 200 would reload to /dashboard)
  await page.route("**/api/contributor/claim", (route: Route) => route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
}

// ── the tests ─────────────────────────────────────────────────────────

test.describe("Every kind of screen opens directly and survives a reload, under the prefix", () => {
  const routes: [string, string, string][] = [
    ["", "discover", "the front door, the map"],
    ["/", "discover", "the front door with a slash"],
    ["/discover", "kingdom-discovery", "Kingdom Exploration"],
    ["/community", "community", "Kingdom Projects"],
    [`/e/${EVENT_ID}`, "event", "an event"],
    [`/p/${PLACE_ID}`, "place", "a place"],
    [`/c/${SLUG}`, "profile", "a Contributor"],
  ];
  for (const [suffix, name, label] of routes) {
    test(`${BASE}${suffix} (${label})`, async ({ page, baseURL }) => {
      const seen = watch(page, new URL(baseURL!).origin);
      await openDemo(page);
      await page.goto(`${BASE}${suffix}`);
      await expect(page.locator(`[data-screen="${name}"]`)).toBeVisible({ timeout: 15_000 });
      expect(underBase(path(page)), path(page)).toBe(true);
      const before = path(page);

      await page.reload();
      await expect(page.locator(`[data-screen="${name}"]`)).toBeVisible({ timeout: 15_000 });
      expect(path(page)).toBe(before);
      seen.expectClean();
    });
  }

  test("a contributor's /dashboard/events opens directly and keeps its tab after a reload", async ({ page, baseURL }) => {
    const seen = watch(page, new URL(baseURL!).origin);
    await openDemo(page, "contributor");
    await page.goto(`${BASE}/dashboard/events`);
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe(`${BASE}/dashboard/events`);

    await page.reload();
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe(`${BASE}/dashboard/events`);

    // a tab switch rewrites the address inside the prefix
    await page.getByRole("button", { name: "news", exact: true }).click();
    await expect(page.getByRole("button", { name: "+ New post" })).toBeVisible();
    expect(path(page)).toBe(`${BASE}/dashboard/news`);
    seen.expectClean();
  });

  test("an admin's /admin/<tab> keeps its tab", async ({ page, baseURL }) => {
    const seen = watch(page, new URL(baseURL!).origin);
    await openDemo(page, "admin");
    await page.goto(`${BASE}/admin/reports`);
    await expect(page.locator('[data-screen="admin"]')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.locator('[data-screen="admin"]')).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe(`${BASE}/admin/reports`);
    seen.expectClean();
  });

  test("the old /index.html?c=<slug> link works under the prefix and is tidied to /c/<slug>", async ({ page }) => {
    await openDemo(page);
    await page.goto(`${BASE}/index.html?c=${SLUG}`);
    await expect(page.locator('[data-screen="profile"]').getByRole("heading", { name: "Anchor Community Church" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe(`${BASE}/c/${SLUG}`);
    expect(new URL(page.url()).search).toBe("");
  });

  test("a trailing slash and an unknown tab are tidied inside the prefix", async ({ page }) => {
    await openDemo(page, "contributor");
    await page.goto(`${BASE}/dashboard/nonsense`);
    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe(`${BASE}/dashboard`);
  });

  test("a malformed link falls back to the map and the bar stays under the prefix", async ({ page }) => {
    await openDemo(page);
    await page.goto(`${BASE}/e/not-a-uuid`);
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("doesn't match anything in Connect")).toBeVisible();
    await expect.poll(() => path(page)).toBe(BASE);
  });
});

test.describe("In-app navigation, Back and Forward never leave the prefix", () => {
  test("map → Kingdom Exploration → event → Contributor → settings, and back again", async ({ page, baseURL }) => {
    const seen = watch(page, new URL(baseURL!).origin);
    await recordHistory(page);
    await openDemo(page);
    await page.goto(`${BASE}/`);
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });

    const steps: [() => Promise<unknown>, string, string][] = [
      [() => go(page, "kingdom-discovery"), `${BASE}/discover`, "kingdom-discovery"],
      [() => go(page, "event", { id: EVENT_ID }), `${BASE}/e/${EVENT_ID}`, "event"],
      [() => go(page, "profile", { id: ORG_ID }), `${BASE}/c/${SLUG}`, "profile"],
      [() => go(page, "settings"), `${BASE}/settings`, "settings"],
    ];
    for (const [act, url, name] of steps) {
      await act();
      await expect(page.locator(`[data-screen="${name}"]`)).toBeVisible();
      expect(path(page)).toBe(url);
    }

    for (const [url, name] of [[`${BASE}/c/${SLUG}`, "profile"], [`${BASE}/e/${EVENT_ID}`, "event"], [`${BASE}/discover`, "kingdom-discovery"], [BASE, "discover"]] as const) {
      await page.goBack();
      await expect.poll(() => screen(page)).toBe(name);
      expect(path(page)).toBe(url);
    }
    for (const [url, name] of [[`${BASE}/discover`, "kingdom-discovery"], [`${BASE}/e/${EVENT_ID}`, "event"]] as const) {
      await page.goForward();
      await expect.poll(() => screen(page)).toBe(name);
      expect(path(page)).toBe(url);
    }

    // every address the app wrote into history, on every step, stayed inside the prefix
    const written = await writes(page);
    expect(written.length).toBeGreaterThan(4);
    expect(written.filter((u) => u !== "" && !underBase(new URL(u, page.url()).pathname)), `history writes: ${written.join(" ")}`).toEqual([]);
    seen.expectClean();
  });

  test("a real tap on a screen's own button keeps the bar under the prefix, and its Back returns", async ({ page }) => {
    await openDemo(page);
    await page.goto(`${BASE}/c/${SLUG}`);
    await expect(page.locator('[data-screen="profile"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Kingdom Exploration" }).first().click();
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
    expect(path(page)).toBe(`${BASE}/discover`);
    await page.goBack();
    await expect.poll(() => screen(page)).toBe("profile");
    expect(path(page)).toBe(`${BASE}/c/${SLUG}`);
  });

  test("a shared listing: after the visitor's first tap the map goes under it, at the prefixed front door", async ({ page }) => {
    await recordHistory(page);
    await openDemo(page);
    await page.goto("about:blank");
    await page.goto(`${BASE}/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-screen="event"]').getByRole("heading", { name: "Hatfield Sunday Celebration" }).click();

    await page.goBack();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(path(page)).toBe(BASE);
    await page.goForward();
    await expect.poll(() => screen(page)).toBe("event");
    expect(path(page)).toBe(`${BASE}/e/${EVENT_ID}`);
    const written = await writes(page);
    expect(written.filter((u) => u !== "" && !underBase(new URL(u, page.url()).pathname)), written.join(" ")).toEqual([]);
  });

  test("Back with a preview card open closes the card and keeps the URL", async ({ page }) => {
    await openDemo(page);
    await page.goto("about:blank");
    await page.goto(`${BASE}/`);
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    await openListing(page, EVENT_ID);
    await expect(page.locator('[data-entity-card="event"]')).toBeVisible();

    await page.goBack();
    await expect(page.locator('[data-entity-card="event"]')).toBeHidden();
    await expect.poll(() => screen(page)).toBe("discover");
    expect(underBase(path(page))).toBe(true);
  });
});

test.describe("Share links carry the prefix", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("Share on an event copies origin + prefix + /e/<id>", async ({ page, baseURL }) => {
    await openDemo(page);
    await page.goto(`${BASE}/e/${EVENT_ID}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-screen="event"]').getByRole("button", { name: "Share" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(baseURL!).origin}${BASE}/e/${EVENT_ID}`);
  });

  test("a pasted share link opens the same screen", async ({ page, baseURL }) => {
    await openDemo(page);
    const link = `${new URL(baseURL!).origin}${BASE}/c/${SLUG}`;
    await page.goto(link);
    await expect(page.locator('[data-screen="profile"]').getByRole("heading", { name: "Anchor Community Church" })).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toBe(link);
  });
});

test.describe("Sign-in comes back to the right screen", () => {
  test.use({ bypassCSP: true });

  test("Google's redirect is the app's front door, and the screen travels app-relative", async ({ page, baseURL }) => {
    await realShell(page);
    await installFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } });
    let authorize = "";
    await page.route(`${FAKE_PROJECT}/auth/v1/authorize**`, (route: Route) => {
      authorize = route.request().url();
      return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Google</body></html>" });
    });

    await page.goto(`${BASE}/settings`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => authorize).not.toBe("");
    expect(new URL(authorize).searchParams.get("redirect_to")).toBe(`${new URL(baseURL!).origin}${BASE}/`);

    // the stash is the route table's own path, with no prefix: it is read back through the same table
    await page.goto(`${BASE}/`);
    const stash = await page.evaluate(() => sessionStorage.getItem("cc_return_to"));
    expect(JSON.parse(stash!).p).toBe("/settings");
  });

  test("coming back to the front door carries on to the stashed screen, inside the prefix", async ({ page, baseURL }) => {
    const seen = watch(page, new URL(baseURL!).origin);
    await realShell(page);
    await page.addInitScript(() => {
      sessionStorage.setItem("cc_return_to", JSON.stringify({ p: "/dashboard/events", t: Date.now() }));
    });
    await signInToFakeProject(page, { user: MEMBER, profile: { role: "contributor", contributor_status: "approved" } });
    await page.goto(`${BASE}/`);
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe(`${BASE}/dashboard/events`);
    expect(await page.evaluate(() => sessionStorage.getItem("cc_return_to"))).toBeNull(); // single-use
    seen.expectClean(NOTHING_TO_CLAIM);
  });

  for (const [label, stash] of [
    ["a stash that carries the prefix (it is not an app path)", `${BASE}/dashboard/events`],
    ["a protocol-relative host", "//evil.example/steal"],
    ["an absolute URL", "https://evil.example/"],
    ["an unknown path", "/api/v1/events"],
  ] as const) {
    test(`ignores ${label}`, async ({ page, baseURL }) => {
      await realShell(page);
      await page.addInitScript((p) => {
        sessionStorage.setItem("cc_return_to", JSON.stringify({ p, t: Date.now() }));
      }, stash);
      await signInToFakeProject(page, { user: MEMBER, profile: { role: "contributor", contributor_status: "approved" } });
      await page.goto(`${BASE}/`);
      await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
      expect(path(page)).toBe(BASE);
    });
  }

  test("a signed-out visitor to a signed-in screen: sign-in screen, emailed code, then that screen, inside the prefix", async ({ page, baseURL }) => {
    const seen = watch(page, new URL(baseURL!).origin);
    await realShell(page);
    const session = fakeSession(CITIZEN);
    await installFakeProject(page, { user: CITIZEN, profile: { role: "citizen", contributor_status: "not_applied" } }, session);
    let magicLinkTarget = "";
    await page.route(`${FAKE_PROJECT}/auth/v1/otp**`, (route: Route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      magicLinkTarget = new URL(route.request().url()).searchParams.get("redirect_to") ?? "";
      return route.fulfill({ headers: FAKE_PROJECT_CORS, json: {} });
    });
    await page.route(`${FAKE_PROJECT}/auth/v1/verify**`, (route: Route) =>
      route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ headers: FAKE_PROJECT_CORS, json: session }),
    );

    await page.goto(`${BASE}/settings`);
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-screen="settings"]')).toHaveCount(0);
    expect(path(page)).toBe(`${BASE}/settings`);

    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.getByLabel("Your email address").fill(CITIZEN.email);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("6-digit code").fill(CODE);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.locator('[data-screen="settings"]')).toBeVisible({ timeout: 15_000 });
    expect(path(page)).toBe(`${BASE}/settings`);
    // the emailed magic link would come back to the front door of the app, not the site root
    expect(magicLinkTarget).toBe(`${new URL(baseURL!).origin}${BASE}/`);
    seen.expectClean(NOTHING_TO_CLAIM);
  });
});

test.describe("Assets and API calls all live under the prefix", () => {
  test("the app's own stylesheet, crown and API reads are requested at the prefixed address and none fail", async ({ page, baseURL }) => {
    const seen = watch(page, new URL(baseURL!).origin);
    await openDemo(page);
    await page.goto(`${BASE}/`);
    await expect(page.locator('[data-cc-pin="event"]')).toHaveCount(1, { timeout: 15_000 });
    await go(page, "kingdom-discovery");
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();

    // map-v2.css is injected by script (a root-absolute href once): it must be the prefixed one and must have loaded
    const css = await page.evaluate(() => document.querySelector('link[href*="map-v2.css"]')?.getAttribute("href") ?? "");
    expect(css.startsWith(`${BASE}/assets/map-v2.css`), css).toBe(true);
    await expect
      .poll(() => page.evaluate(() => !!(document.querySelector('link[href*="map-v2.css"]') as HTMLLinkElement | null)?.sheet))
      .toBe(true);

    // the data came through the prefixed API: every /api/ request, with no exception, starts at the prefix
    const api = seen.api();
    expect(api.some((p) => p.startsWith(`${BASE}/api/v1/events`)), api.join(" ")).toBe(true);
    expect(api.filter((p) => !p.startsWith(`${BASE}/api/`)), "API requests without the prefix").toEqual([]);
    seen.expectClean();
  });

  test("the sign-in screen's crown image is the prefixed asset and it loads", async ({ page, baseURL }) => {
    const seen = watch(page, new URL(baseURL!).origin);
    await shell(page);
    await page.goto(`${BASE}/settings`);
    const crown = page.locator('img[src*="citizens-crown"]').first();
    await expect(crown).toBeVisible({ timeout: 15_000 });
    expect(await crown.getAttribute("src")).toContain(`${BASE}/assets/citizens-crown.png`);
    expect(await crown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    seen.expectClean();
  });
});

test.describe("The server serves the app under the prefix and nowhere else", () => {
  test("every route returns the app shell with the prefixed <base>, with security headers, and unknown paths keep Next's 404", async ({ request }) => {
    for (const p of ["", "/", "/discover", "/map", "/community", "/me", "/messages", `/messages/${EVENT_ID}`, "/notifications", "/settings", "/apply", "/onboarding", "/dashboard", "/dashboard/events", "/admin", "/admin/contributors", `/e/${EVENT_ID}`, `/p/${PLACE_ID}`, `/c/${SLUG}`]) {
      const res = await request.get(`${BASE}${p}`);
      expect(res.status(), p).toBe(200);
      expect(await res.text(), p).toContain(`<base href="${BASE}/"`);
      expect(res.headers()["x-frame-options"], p).toBe("DENY");
      expect(res.headers()["content-security-policy"], p).toContain("default-src 'self'");
    }
    expect((await request.get(`${BASE}/index.html`)).status()).toBe(200);
    for (const p of ["/foo", "/dashboard/a/b", "/e/x/y"]) expect((await request.get(`${BASE}${p}`)).status(), p).toBe(404);
    expect((await request.get(`${BASE}/api/v1/does-not-exist`)).status()).toBe(404);
  });

  test("the site root is not the app: the old root addresses are 404 here (the front door and old-address rules are PR C)", async ({ request }) => {
    for (const p of ["/", "/discover", `/e/${EVENT_ID}`, `/c/${SLUG}`, "/dashboard", "/config.js", "/assets/map-v2.css", "/api/v1/events"]) {
      expect((await request.get(p)).status(), p).toBe(404);
    }
  });

  test("the generated config.js says where the app lives, and the app's static files are under the prefix", async ({ request }) => {
    const config = await request.get(`${BASE}/config.js`);
    expect(config.status()).toBe(200);
    const body = await config.text();
    expect(body).toContain(`"BASE_PATH": "${BASE}"`);
    expect(body).toContain(`"API_BASE_URL": "${BASE}"`);
    expect((await request.get(`${BASE}/assets/map-v2.css`)).status()).toBe(200);
    expect((await request.get(`${BASE}/assets/citizens-crown.png`)).status()).toBe(200);
    expect((await request.get(`${BASE}/vendor/maplibre-gl/maplibre-gl.css`)).status()).toBe(200);
  });
});
