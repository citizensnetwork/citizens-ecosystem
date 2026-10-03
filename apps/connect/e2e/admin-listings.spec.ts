import { test, expect, type Page, type Route } from "@playwright/test";
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
    // It must never be un-hidden into a duplicate, but its empty shell can be cleared.
    await expect(moved.getByRole("button", { name: /Hide|Unhide/ })).toHaveCount(0);
    await expect(moved.getByRole("button", { name: /^Delete/ })).toHaveCount(1);

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

  // ── Delete ──────────────────────────────────────────────────────────────
  // POST /api/admin/contributors/delete-listing (migration 178). The server
  // decides what "delete" means from whether the owner ever signed in, so the
  // modal asks it first (a read-only GET) and says which will happen.

  const PLACEHOLDER_PREVIEW = {
    case: "placeholder",
    name: "Hope Harvest Outreach",
    slug: "hope-harvest-outreach",
    eventsAffected: 2,
    placesAffected: 0,
    newsPosts: 1,
    teamMembers: 0,
    movedPlaceholder: false,
    blockers: [],
  };
  const ACCOUNT_PREVIEW = {
    case: "account",
    name: "Kingdom Table Coffee",
    slug: "kingdom-table-coffee",
    eventsAffected: 1,
    placesAffected: 1,
    newsPosts: 0,
    teamMembers: 2,
    movedPlaceholder: false,
    blockers: [],
  };

  async function openListings(page: Page, rows: unknown[]) {
    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    await signInToFakeProject(page, {
      user: { id: ADMIN_ID, email: "admin@citizens.test", fullName: "Admin" },
      profile: { role: "admin", contributor_status: "not_applied" },
    });
    await page.route("**/api/admin/users**", (route: Route) =>
      route.fulfill({ json: { data: rows, meta: { page: 1, pageSize: 20, total: rows.length } } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /Admin Panel/ }).first().click({ timeout: 15_000 });
    await expect(page.locator('[data-screen="admin"]')).toBeVisible();
    await page.getByRole("button", { name: "Listings", exact: true }).click();
  }

  type Answer = { status?: number; json: unknown };
  async function mockDeleteRoute(page: Page, answers: { preview: (id: string) => Answer; post?: () => Answer }) {
    const previews: string[] = [];
    const posts: { id: string; confirmName: string }[] = [];
    await page.route("**/api/admin/contributors/delete-listing**", (route: Route) => {
      const request = route.request();
      if (request.method() === "GET") {
        const id = new URL(request.url()).searchParams.get("id") ?? "";
        previews.push(id);
        const a = answers.preview(id);
        return route.fulfill({ status: a.status ?? 200, json: a.json });
      }
      posts.push(request.postDataJSON() as { id: string; confirmName: string });
      const a: Answer = (answers.post ?? (() => ({ json: {} })))();
      return route.fulfill({ status: a.status ?? 200, json: a.json });
    });
    return { previews, posts };
  }

  test("Delete: the server says what will happen, the name must be typed, and the row only leaves after success", async ({
    page,
  }) => {
    await openListings(page, [FORM_LISTING, HIDDEN_LISTING]);
    const del = await mockDeleteRoute(page, {
      preview: (id) => ({ json: id === FORM_LISTING.id ? PLACEHOLDER_PREVIEW : ACCOUNT_PREVIEW }),
      post: () => ({ json: { outcome: "deleted", eventsAffected: 2, placesAffected: 0, warnings: [] } }),
    });
    const form = page.locator('[data-listing="hope-harvest-outreach"]');
    const modal = page.locator('[data-delete-listing="hope-harvest-outreach"]');
    const typed = modal.getByLabel("Type the listing name to confirm");
    const confirm = modal.getByRole("button", { name: "Delete listing" });

    // A never-signed-in placeholder: the modal says it goes for good, and what it takes with it.
    await form.getByRole("button", { name: /^Delete/ }).click();
    await expect(modal.getByText("has never been signed into", { exact: false })).toBeVisible();
    await expect(modal.getByText("permanently")).toBeVisible();
    await expect(modal.getByText("Removes: 2 live events, 1 news post.")).toBeVisible();
    expect(del.previews).toEqual([FORM_LISTING.id]);

    // Nothing can be sent until the name is typed.
    await expect(confirm).toBeDisabled();
    await typed.fill("Hope Harvest");
    await expect(confirm).toBeDisabled();

    // Cancel changes nothing.
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toHaveCount(0);
    expect(del.posts).toHaveLength(0);
    await expect(form).toBeVisible();

    // Typing the name (any case / spacing) enables it; the row leaves only after the server says OK.
    await form.getByRole("button", { name: /^Delete/ }).click();
    await typed.fill("  hope   HARVEST outreach ");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText("Hope Harvest Outreach was deleted.")).toBeVisible();
    expect(del.posts).toEqual([{ id: FORM_LISTING.id, confirmName: "  hope   HARVEST outreach " }]);
    await expect(page.locator('[data-listing="kingdom-table-coffee"]')).toBeVisible();
  });

  test("Delete on someone with an account removes only the listing and says the person stays", async ({ page }) => {
    await openListings(page, [FORM_LISTING, HIDDEN_LISTING]);
    const del = await mockDeleteRoute(page, {
      preview: () => ({ json: ACCOUNT_PREVIEW }),
      post: () => ({ json: { outcome: "removed", eventsAffected: 1, placesAffected: 1, warnings: [] } }),
    });
    const hidden = page.locator('[data-listing="kingdom-table-coffee"]');
    const modal = page.locator('[data-delete-listing="kingdom-table-coffee"]');

    await hidden.getByRole("button", { name: /^Delete/ }).click();
    await expect(modal.getByText("keeps their citizen account", { exact: false })).toBeVisible();
    await expect(modal.getByText("Takes down: 1 live event, 1 place, 2 team members.")).toBeVisible();
    await expect(modal.getByText(/apply again/)).toBeVisible();
    await expect(modal.getByText("permanently")).toHaveCount(0); // not the hard-delete wording

    await modal.getByLabel("Type the listing name to confirm").fill("Kingdom Table Coffee");
    await modal.getByRole("button", { name: "Delete listing" }).click();
    await expect(hidden).toHaveCount(0);
    await expect(page.getByText("Kingdom Table Coffee’s listing was removed. They keep their citizen account.")).toBeVisible();
    expect(del.posts).toEqual([{ id: HIDDEN_LISTING.id, confirmName: "Kingdom Table Coffee" }]);
  });

  test("Delete refuses a blocked listing, and keeps the row when the server says no", async ({ page }) => {
    await openListings(page, [FORM_LISTING, HIDDEN_LISTING]);
    const del = await mockDeleteRoute(page, {
      preview: (id) =>
        id === FORM_LISTING.id
          ? {
              json: {
                ...PLACEHOLDER_PREVIEW,
                blockers: ["owns_wear_brand"],
                message: "This account owns a Citizens Wear brand, so it can't be deleted or demoted here.",
              },
            }
          : { json: ACCOUNT_PREVIEW },
      post: () => ({
        status: 409,
        json: { error: "signed_in_meanwhile", message: "The owner signed in a moment ago, so this is no longer an empty placeholder." },
      }),
    });

    // A Wear brand owner: the reason is shown and there is nothing to confirm.
    const form = page.locator('[data-listing="hope-harvest-outreach"]');
    const blockedModal = page.locator('[data-delete-listing="hope-harvest-outreach"]');
    await form.getByRole("button", { name: /^Delete/ }).click();
    await expect(blockedModal.getByRole("alert")).toContainText("owns a Citizens Wear brand");
    await expect(blockedModal.getByLabel("Type the listing name to confirm")).toHaveCount(0);
    await blockedModal.getByRole("button", { name: "Close" }).click();
    await expect(blockedModal).toHaveCount(0);
    await expect(form).toBeVisible();

    // The server refuses at the last moment: the modal stays open with the reason, and the row stays.
    const hidden = page.locator('[data-listing="kingdom-table-coffee"]');
    const modal = page.locator('[data-delete-listing="kingdom-table-coffee"]');
    await hidden.getByRole("button", { name: /^Delete/ }).click();
    await modal.getByLabel("Type the listing name to confirm").fill("Kingdom Table Coffee");
    await modal.getByRole("button", { name: "Delete listing" }).click();
    await expect(modal.getByRole("alert")).toContainText("The owner signed in a moment ago");
    await expect(hidden).toBeVisible();
    await expect(modal.getByRole("button", { name: "Delete listing" })).toBeEnabled(); // not stuck on "Deleting…"
    expect(del.posts).toHaveLength(1);
  });
});
