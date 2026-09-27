import { test, expect, type Route } from "@playwright/test";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Admin → Listings: the moderation safety net for listings that go live
//  without a review step (Google Form intake, admin Create, self-serve
//  apply). An admin sees every Contributor listing with its live/hidden and
//  owner-sign-in state, and can Hide / Unhide one (two-step, reversible).
//  Hermetic: a real-mode admin session against the fake project, with the
//  admin API routes answered locally.
// ════════════════════════════════════════════════════════════════════

const ADMIN_ID = "55555555-5555-4555-8555-555555555555";

const FORM_LISTING = {
  id: "66666666-6666-4666-8666-666666666666",
  full_name: "Hope Harvest Outreach",
  avatar_url: null,
  role: "contributor",
  contributor_kind: "organization",
  contributor_status: "approved",
  contributor_slug: "hope-harvest-outreach",
  contributor_hidden: false,
  contributor_claim_email: "lerato@hopeharvest.org.za",
  contributor_claimed_at: null,
  created_at: "2026-09-27T08:00:00Z",
};
const HIDDEN_LISTING = {
  id: "77777777-7777-4777-8777-777777777777",
  full_name: "Kingdom Table Coffee",
  avatar_url: null,
  role: "contributor",
  contributor_kind: "business",
  contributor_status: "approved",
  contributor_slug: "kingdom-table-coffee",
  contributor_hidden: true,
  contributor_claim_email: null,
  contributor_claimed_at: "2026-09-20T10:00:00Z",
  created_at: "2026-09-19T08:00:00Z",
};

// Claimed from a different account: the listing now lives on the owner's row;
// this hidden, slug-less placeholder must not be unhidden into a duplicate.
const MOVED_PLACEHOLDER = {
  id: "88888888-8888-4888-8888-888888888888",
  full_name: "Hope Harvest Outreach",
  avatar_url: null,
  role: "contributor",
  contributor_kind: "organization",
  contributor_status: "approved",
  contributor_slug: null,
  contributor_hidden: true,
  contributor_claim_email: null,
  contributor_claimed_at: "2026-09-21T09:00:00Z",
  created_at: "2026-09-18T08:00:00Z",
};

test.describe("Admin → Listings", () => {
  test.use({ bypassCSP: true });

  test("shows every listing's state and hides / unhides one, reversibly", async ({ page }) => {
    const listQueries: URLSearchParams[] = [];
    const hideBodies: unknown[] = [];

    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    await signInToFakeProject(page, {
      user: { id: ADMIN_ID, email: "admin@citizens.test", fullName: "Admin" },
      profile: { role: "admin", contributor_status: "not_applied" },
    });
    // Registered after the shell's /api/** catch-all, so these win.
    await page.route("**/api/admin/users**", (route: Route) => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get("role") !== "contributor") {
        return route.fulfill({ json: { data: [], meta: { page: 1, pageSize: 20, total: 3 } } });
      }
      listQueries.push(params);
      return route.fulfill({
        json: { data: [FORM_LISTING, HIDDEN_LISTING, MOVED_PLACEHOLDER], meta: { page: 1, pageSize: 20, total: 3 } },
      });
    });
    await page.route("**/api/admin/contributors/hide", (route: Route) => {
      const body = route.request().postDataJSON() as { user_id: string; hidden: boolean };
      hideBodies.push(body);
      return route.fulfill({ json: { success: true, user_id: body.user_id, hidden: body.hidden } });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /Admin Panel/ }).first().click({ timeout: 15_000 });
    await expect(page.locator('[data-screen="admin"]')).toBeVisible();
    await page.getByRole("button", { name: "Listings", exact: true }).click();

    const form = page.locator('[data-listing="hope-harvest-outreach"]');
    const hidden = page.locator('[data-listing="kingdom-table-coffee"]');
    await expect(form).toBeVisible();
    await expect(form.getByText("LIVE", { exact: true })).toBeVisible();
    await expect(form.getByText("Awaiting owner sign-in · lerato@hopeharvest.org.za")).toBeVisible();
    await expect(form.getByRole("link", { name: "/c/hope-harvest-outreach" })).toHaveAttribute(
      "href",
      "/c/hope-harvest-outreach",
    );
    await expect(hidden.getByText("HIDDEN", { exact: true })).toBeVisible();
    await expect(hidden.getByText(/Owner signed in/)).toBeVisible();
    expect(listQueries[0]?.get("page")).toBe("1");
    const moved = page.locator(`[data-listing="${MOVED_PLACEHOLDER.id}"]`);
    await expect(moved.getByText(/Moved to its owner's account/)).toBeVisible();
    await expect(moved.getByRole("button")).toHaveCount(0);

    // Hide is two-step: nothing is sent until it's confirmed.
    await form.getByRole("button", { name: "Hide" }).click();
    await expect(form.getByText(/Nothing is deleted/)).toBeVisible();
    await form.getByRole("button", { name: "Cancel" }).click();
    expect(hideBodies).toHaveLength(0);

    await form.getByRole("button", { name: "Hide" }).click();
    await form.getByRole("button", { name: "Confirm hide" }).click();
    await expect(form.getByText("HIDDEN", { exact: true })).toBeVisible();
    await expect(page.getByText("Hope Harvest Outreach is hidden", { exact: false })).toBeVisible();
    expect(hideBodies).toEqual([{ user_id: FORM_LISTING.id, hidden: true }]);

    await hidden.getByRole("button", { name: "Unhide" }).click();
    await hidden.getByRole("button", { name: "Confirm unhide" }).click();
    await expect(hidden.getByText("LIVE", { exact: true })).toBeVisible();
    expect(hideBodies[1]).toEqual({ user_id: HIDDEN_LISTING.id, hidden: false });

    // Search goes to the server (name or email), debounced.
    await page.getByLabel("Search listings").fill("hope");
    await expect.poll(() => listQueries.at(-1)?.get("q")).toBe("hope");
  });
});
