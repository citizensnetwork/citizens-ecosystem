import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Google Form → map Contributor intake, the parts a browser sees
//  (build brief: docs/handoffs/CONTRIBUTOR_FORM_INTAKE_HANDOFF.md §4.5):
//
//  1. The shareable listing link /c/<slug> (in the welcome email and the
//     Sheet) opens that Contributor's profile — for a signed-out visitor
//     too, as a guest — with Discover beneath it so Back stays in Connect.
//  2. An owner who signs in AS their form-created listing account (Supabase
//     auto-links the same-email Google sign-in) lands on their dashboard.
//
//  Hermetic like the other specs: every backend call is mocked with
//  page.route(), nothing touches the real Supabase project. (2) needs a
//  REAL-mode session against a fake project (e2e/support/fake-project.ts).
// ════════════════════════════════════════════════════════════════════

const OWNER_ID = "44444444-4444-4444-8444-444444444444";
const SLUG = "grace-point-community-church";

const LISTING = {
  id: OWNER_ID,
  full_name: "Grace Point Community Church",
  role: "contributor",
  contributor_kind: "ministry",
  category: "churches-ministries",
  contributor_slug: SLUG,
  bio: "A local Christian community committed to helping people encounter Jesus.",
  avatar_url: null,
  logo_url: null,
  website_url: "https://gracepointchurch.org.za/",
  instagram_handle: "@gracepointchurch",
  facebook_url: null,
  tiktok_handle: null,
  youtube_url: null,
  x_handle: null,
  linkedin_url: null,
  whatsapp_number: null,
  physical_address: "18 Oak Avenue, Randpark Ridge, Randburg",
  physical_latitude: -26.0948,
  physical_longitude: 27.9591,
  no_fixed_location: false,
  gallery_urls: [],
  cover_photo_urls: [],
  contact_email: "hello@gracepointchurch.org.za",
  created_at: new Date().toISOString(),
};

async function mockApp(page: Page, env: { supabaseUrl: string; anonKey: string }) {
  await mockAppShell(page, env);
  await page.route(`**/api/v1/contributors/${SLUG}`, (route: Route) =>
    route.fulfill({ json: { data: { profile: LISTING, upcoming_events: [], past_events: [], places: [] } } }),
  );
  await page.route("**/api/v1/contributors/no-such-listing", (route: Route) =>
    route.fulfill({ status: 404, json: { error: "Contributor not found" } }),
  );
}

const screenName = (page: Page) =>
  page.evaluate(() => document.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null);

test.describe("Listing link /c/<slug>", () => {
  test("opens the Contributor's profile for a signed-out visitor, with Back into Discover", async ({ page }) => {
    await mockApp(page, { supabaseUrl: "", anonKey: "" });
    await page.goto(`/c/${SLUG}`);

    await expect(page).toHaveURL(new RegExp(`/index\\.html\\?c=${SLUG}$`));
    const profile = page.locator('[data-screen="profile"]');
    await expect(profile).toBeVisible({ timeout: 15_000 });
    await expect(profile.getByRole("heading", { name: "Grace Point Community Church" })).toBeVisible();
    // The contributor-type label (not the place category's) for a reused slug.
    await expect(profile.getByText("Church", { exact: true }).first()).toBeVisible();

    await page.goBack();
    await expect.poll(() => screenName(page)).toBe("discover");
  });

  test("an unknown slug says so instead of opening a wrong profile", async ({ page }) => {
    await mockApp(page, { supabaseUrl: "", anonKey: "" });
    await page.addInitScript(() => {
      localStorage.setItem("cc_session_v1", JSON.stringify({ authed: true, role: "citizen" }));
    });
    await page.goto("/c/no-such-listing");
    await expect(page.getByText("That Contributor listing could not be found.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-screen="profile"]')).toHaveCount(0);
  });
});

// ── Real-mode session against a fake Supabase project ─────────────────

async function signedInAs(page: Page, profile: { role: string; contributor_status: string }) {
  const claimCalls: number[] = [];
  await mockApp(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  const rpcCalls = await signInToFakeProject(page, {
    user: { id: OWNER_ID, email: "daniel@gracepointchurch.org.za", fullName: LISTING.full_name },
    profile,
    rpc: (fn) =>
      fn !== "mark_own_listing_claimed"
        ? []
        : profile.role === "contributor"
          ? { success: true, slug: SLUG }
          : { success: false, reason: "nothing_to_mark" },
  });
  // Registered after the /api/** catch-all, so it wins for this path.
  await page.route("**/api/contributor/claim", (route: Route) => {
    claimCalls.push(Date.now());
    return route.fulfill({ status: 404, json: { error: "nothing_to_claim" } });
  });
  return { rpcCalls, claimCalls };
}

test.describe("Sign-in landing for a form-created listing", () => {
  // The app's CSP connect-src allows only the REAL Supabase project host;
  // bypass it so the fake project stays fully separate from production.
  test.use({ bypassCSP: true });

  test("an owner signed in AS their unclaimed listing lands on their dashboard", async ({ page }) => {
    const { rpcCalls } = await signedInAs(page, { role: "contributor", contributor_status: "approved" });
    await page.goto("/");

    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Your listing is live", { exact: false })).toBeVisible();
    expect(rpcCalls.filter((f) => f === "mark_own_listing_claimed")).toHaveLength(1);

    // Once per browser session: a reload doesn't stamp or redirect again.
    await page.reload();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    expect(rpcCalls.filter((f) => f === "mark_own_listing_claimed")).toHaveLength(1);
  });

  test("a citizen with nothing to claim is left where they are, silently", async ({ page }) => {
    const { claimCalls, rpcCalls } = await signedInAs(page, { role: "citizen", contributor_status: "not_applied" });
    await page.goto("/");

    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => claimCalls.length).toBe(1);
    expect(rpcCalls).not.toContain("mark_own_listing_claimed");
    await expect(page.getByText(/No pending listing|could not claim/i)).toHaveCount(0);
    await expect(page.locator('[data-screen="dashboard"]')).toHaveCount(0);
  });
});
