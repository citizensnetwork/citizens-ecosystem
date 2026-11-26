import { test, expect, type Page } from "@playwright/test";
import { mockAppShell } from "./support/fake-project";
import { mockMapNetwork, mockContributorDetail, openMap, openListing, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  The strict CSP (QA fix plan PR F3, 2026-11-25). next.config.ts sends it as Content-Security-Policy-Report-Only for
//  a week before it is enforced (founder): scripts and stylesheets from this origin only, no inline script, no eval.
//  A browser fires `securitypolicyviolation` for a report-only violation too, so this walks the main screens as a
//  citizen, a contributor and an admin and fails on any violation of either policy: what real visitors' browsers
//  would otherwise report to /api/csp-report is caught here first.
//
//  Demo mode (no Supabase configured), like icons.spec.ts: the specs that talk to a fake Supabase host bypass the
//  CSP, because that host is not in connect-src.
// ════════════════════════════════════════════════════════════════════

type Row = { id: string };
type Violation = { directive: string; blocked: string; disposition: string; sample: string };

/** Record every CSP violation from the first byte of every page this test opens. */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: Violation[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__csp.push({ directive: e.effectiveDirective, blocked: e.blockedURI, disposition: e.disposition, sample: e.sample });
    });
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp?: Violation[] }).__csp ?? []);

async function asRole(page: Page, role: "citizen" | "contributor" | "admin") {
  await page.addInitScript((r) => {
    localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: r }));
  }, role);
}

async function visit(page: Page, path: string, screen: string) {
  await page.goto(path);
  await expect(page.locator(`[data-screen="${screen}"]`).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => !!(window as unknown as { maplibregl?: unknown }).maplibregl, null, { timeout: 15_000 });
  await page.waitForTimeout(300);
}

test.describe("no screen breaks the strict CSP (report-only now, enforced after a week)", () => {
  test("the page is served with the strict Report-Only policy beside the enforced one", async ({ request }) => {
    const res = await request.get("/");
    const strict = res.headers()["content-security-policy-report-only"] ?? "";
    const scriptSrc = /(?:^|;)\s*script-src ([^;]*)/.exec(strict)?.[1] ?? "";
    expect(scriptSrc.trim()).toBe("'self'");
    expect(strict).toMatch(/report-uri \S*\/api\/csp-report/);
    expect(res.headers()["content-security-policy"]).toBeTruthy();
  });

  test("a citizen: the map, a listing of each kind, Discover, Let's, Kingdom Projects, Me", async ({ page }) => {
    test.setTimeout(120_000);
    await watchViolations(page);
    const seed = smallSeed(FIXED_NOW) as MapSeed & { places: Row[]; events: Row[]; contributors: Row[] };
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed);
    await asRole(page, "citizen");
    await openMap(page, "/", 3);
    for (const id of [seed.places[0].id, seed.events[0].id, seed.contributors[0].id]) {
      await openListing(page, id);
      await expect(page.locator("[data-mv2='sheet']")).toBeVisible();
    }
    expect(await violations(page), "on the map").toEqual([]);
    for (const [path, screen] of [
      ["/explore", "explore"],
      ["/lets", "lets"],
      ["/community", "community"],
      ["/me", "profile"],
    ] as const) {
      await visit(page, path, screen);
      expect(await violations(page), path).toEqual([]);
    }
  });

  for (const [role, base, tabs] of [
    ["contributor", "/dashboard", ["overview", "events", "news", "profile", "tools"]],
    ["admin", "/admin", ["applications", "overview", "contributors", "reports"]],
  ] as const) {
    test(`a ${role}: ${base} tabs`, async ({ page }) => {
      test.setTimeout(120_000);
      await watchViolations(page);
      await mockMapNetwork(page);
      await asRole(page, role);
      for (const tab of tabs) {
        await visit(page, `${base}/${tab}`, base.slice(1));
        expect(await violations(page), `${base}/${tab}`).toEqual([]);
      }
    });
  }

  test("the sign-in landing, as a first-time visitor sees it", async ({ page }) => {
    // A real-mode page needs a Supabase host the CSP allows: the project's own host name, with every request to it
    // answered here, so nothing reaches the real backend.
    const host = "https://xyiajtrvhlxaeplsiajj.supabase.co";
    await page.route(`${host}/**`, (route) =>
      route.fulfill({ json: [], headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } }),
    );
    await page.routeWebSocket(/xyiajtrvhlxaeplsiajj\.supabase\.co/, () => {});
    await mockAppShell(page, { supabaseUrl: host, anonKey: "e2e-anon-key" });
    await watchViolations(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Browse as Guest" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Browse as Guest" }).click();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await violations(page)).toEqual([]);
  });
});
