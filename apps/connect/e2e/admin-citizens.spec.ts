import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Admin → Contributors and Citizens (#218).
//  Tabs, the old Listings / Create addresses (replaced, not pushed), the
//  citizen list (names and dates only), and the delete-account confirm.
//  Hermetic: a signed-in admin against the fake project.
// ════════════════════════════════════════════════════════════════════

test.use({ bypassCSP: true });

const ADMIN = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "admin@citizens.example",
  fullName: "Test Admin",
};

const ADA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  full_name: "Ada Citizen",
  avatar_url: null,
  role: "citizen",
  contributor_status: "not_applied",
  created_at: "2026-10-12T08:00:00.000Z",
  last_sign_in_at: "2026-10-16T08:00:00.000Z",
  email: "ada@secret.example",
};
const BEN = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  full_name: "Ben Neighbour",
  avatar_url: null,
  role: "citizen",
  contributor_status: "pending",
  created_at: "2026-09-01T08:00:00.000Z",
  last_sign_in_at: null,
  email: "ben@secret.example",
};
const CARA = {
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  full_name: "Cara Neighbour",
  avatar_url: null,
  role: "citizen",
  contributor_status: "rejected",
  created_at: "2026-07-01T08:00:00.000Z",
  last_sign_in_at: "2026-10-01T08:00:00.000Z",
  email: "cara@secret.example",
};
const NO_NAME = {
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
  full_name: null,
  avatar_url: null,
  role: "citizen",
  contributor_status: "not_applied",
  created_at: "2026-08-01T08:00:00.000Z",
  last_sign_in_at: null,
  email: "noname@secret.example",
};

function path(page: Page) {
  return new URL(page.url()).pathname;
}

async function signInAdmin(page: Page) {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, {
    user: ADMIN,
    profile: { role: "admin", contributor_status: "not_applied" },
  });
  await page.route("**/api/admin/contributor-applications", (route: Route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/contributor/claim", (route: Route) =>
    route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }),
  );
}

test.describe("Admin tabs and old addresses", () => {
  test("the bar is Applications, Overview, Contributors, Citizens, Reports", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin");
    const bar = page.locator('[data-screen="admin"]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const labels = await bar.locator("button").evaluateAll((els) => {
      const names = ["Applications", "Overview", "Contributors", "Citizens", "Reports"];
      return els
        .map((el) => (el.textContent || "").trim())
        .map((t) => names.find((n) => t === n || t.startsWith(n + " ")))
        .filter((n): n is string => !!n);
    });
    expect(labels).toEqual(["Applications", "Overview", "Contributors", "Citizens", "Reports"]);
    await expect(bar.getByRole("button", { name: "Listings", exact: true })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Create Contributor", exact: true })).toHaveCount(0);
  });

  test("/admin/listings and /admin/create replace onto Contributors, and Back does not return to them", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/reports");
    await expect(page.locator('[data-screen="admin"]')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe("/admin/reports");

    await page.goto("/admin/listings");
    await expect(page.locator("[data-admin-contributors]")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe("/admin/contributors");
    await page.goBack();
    await expect.poll(() => path(page)).toBe("/admin/reports");
    await page.goForward();
    await expect.poll(() => path(page)).toBe("/admin/contributors");

    await page.goto("/admin/create");
    await expect(page.getByTestId("admin-create-form")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => path(page)).toBe("/admin/contributors");
    await page.goBack();
    await expect(page.getByTestId("admin-create-form")).toHaveCount(0);
    expect(path(page)).not.toBe("/admin/create");
    expect(path(page)).not.toBe("/admin/listings");
  });
});

test.describe("Admin → Citizens", () => {
  async function openCitizens(page: Page, rows: unknown[] = [ADA, BEN]) {
    const queries: URLSearchParams[] = [];
    await signInAdmin(page);
    await page.route("**/api/admin/users**", (route: Route) => {
      const params = new URL(route.request().url()).searchParams;
      queries.push(params);
      const data = params.get("role") === "citizen" ? rows : [];
      return route.fulfill({
        json: { data, meta: { page: 1, pageSize: 20, total: data.length } },
      });
    });
    await page.goto("/admin/citizens");
    await expect(page.locator("[data-admin-citizens]")).toBeVisible({ timeout: 15_000 });
    return queries;
  }

  test("lists names and dates, filters on the server, and never shows an email", async ({ page }) => {
    const queries = await openCitizens(page, [ADA, BEN, CARA]);
    const ada = page.locator(`[data-citizen="${ADA.id}"]`);
    const ben = page.locator(`[data-citizen="${BEN.id}"]`);
    const cara = page.locator(`[data-citizen="${CARA.id}"]`);
    await expect(ada.getByText("Ada Citizen")).toBeVisible();
    await expect(ada).toContainText("joined 12 Oct");
    await expect(ada).toContainText(/last active \d+ days ago/);
    await expect(ada.locator("[data-status-chip]")).toHaveCount(0);
    await expect(ben).toContainText("Never signed in");
    await expect(ben.locator("[data-status-chip]")).toHaveText("Pending application");
    await expect(cara.locator("[data-status-chip]")).toHaveText("Application rejected");
    await expect(page.getByLabel("Search citizens")).toHaveAttribute("placeholder", "Search name or email…");
    await expect(page.locator("[data-admin-citizens]")).not.toContainText("@");
    await expect(page.locator("[data-admin-citizens]")).not.toContainText("ada@secret.example");
    await expect(page.locator("[data-admin-citizens]")).not.toContainText("ben@secret.example");
    await expect(page.locator("[data-admin-citizens]")).not.toContainText("cara@secret.example");
    expect(queries.some((q) => q.get("role") === "citizen")).toBe(true);

    await page.getByLabel("Signed in").selectOption("never");
    await expect.poll(() => queries.at(-1)?.get("signedIn")).toBe("never");
    await page.getByLabel("Joined").selectOption("30d");
    await expect.poll(() => queries.at(-1)?.get("joined")).toBe("30d");
    await page.getByLabel("Application").selectOption("none");
    await expect.poll(() => queries.at(-1)?.get("application")).toBe("none");
    await page.getByLabel("Search citizens").fill("Ada");
    await expect.poll(() => queries.at(-1)?.get("q")).toBe("Ada");
  });

  test("an empty filter result and a failed load say so, and Try again asks again", async ({ page }) => {
    let fail = true;
    await signInAdmin(page);
    let hits = 0;
    await page.route("**/api/admin/users**", (route: Route) => {
      hits += 1;
      if (fail) return route.fulfill({ status: 500, json: { error: "nope" } });
      return route.fulfill({ json: { data: [], meta: { page: 1, pageSize: 20, total: 0 } } });
    });
    await page.goto("/admin/citizens");
    const panel = page.locator("[data-admin-citizens]");
    await expect(panel.getByRole("alert")).toContainText("Could not load citizens", { timeout: 15_000 });
    fail = false;
    await panel.getByRole("button", { name: "Try again" }).click();
    await expect(panel.getByText("No citizens match these filters")).toBeVisible();
    expect(hits).toBeGreaterThan(1);
  });

  test("Delete account stays disabled until the name is typed, then the row leaves", async ({ page }) => {
    await openCitizens(page);
    const posts: { id: string; confirmName: string }[] = [];
    await page.route("**/api/admin/citizens/delete**", async (route: Route) => {
      const request = route.request();
      if (request.method() === "GET") {
        const id = new URL(request.url()).searchParams.get("id");
        if (id === BEN.id) {
          return route.fulfill({
            json: {
              name: BEN.full_name,
              blockers: ["owns_wear_brand"],
              message: "This account owns a Citizens Wear brand, so it can't be deleted here.",
            },
          });
        }
        return route.fulfill({
          json: {
            name: ADA.full_name,
            follows: 2,
            placeFollows: 1,
            saves: 1,
            rsvps: 0,
            comments: 0,
            moments: 0,
            messages: 0,
            notifications: 0,
            blockers: [],
          },
        });
      }
      posts.push(request.postDataJSON() as { id: string; confirmName: string });
      await new Promise((r) => setTimeout(r, 400));
      return route.fulfill({ json: { outcome: "deleted", warnings: [] } });
    });

    const ada = page.locator(`[data-citizen="${ADA.id}"]`);
    await ada.getByRole("button", { name: "Delete Ada Citizen" }).click();
    const modal = page.locator(`[data-delete-citizen="${ADA.id}"]`);
    await expect(modal.getByText("This permanently removes")).toBeVisible();
    await expect(modal.getByText("Ada Citizen")).toBeVisible();
    await expect(modal.getByText("Removes: 2 follows, 1 place follow, 1 save.")).toBeVisible();
    const confirm = modal.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();
    await modal.getByLabel("Type the display name to confirm").fill("Ada");
    await expect(confirm).toBeDisabled();
    await modal.getByLabel("Type the display name to confirm").fill("Ada Citizen");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(modal.getByRole("button", { name: "Deleting…" })).toBeVisible();
    await expect(ada).toHaveCount(0);
    await expect(page.getByText("Account deleted")).toBeVisible();
    await expect(page.locator(`[data-citizen="${BEN.id}"] [data-citizen-delete]`)).toBeFocused();
    expect(posts).toEqual([{ id: ADA.id, confirmName: "Ada Citizen" }]);

    await page.locator(`[data-citizen="${BEN.id}"]`).getByRole("button", { name: "Delete Ben Neighbour" }).click();
    const blocked = page.locator(`[data-delete-citizen="${BEN.id}"]`);
    await expect(blocked.getByRole("alert")).toContainText("Citizens Wear brand");
    await expect(blocked.getByRole("button", { name: "Delete account" })).toHaveCount(0);
    await expect(page.locator(`[data-citizen="${BEN.id}"]`)).toBeVisible();
  });

  test("a citizen with no display name is confirmed by typing delete, in any case, ignoring surrounding spaces", async ({
    page,
  }) => {
    await openCitizens(page, [NO_NAME]);
    const posts: { id: string; confirmName: string }[] = [];
    await page.route("**/api/admin/citizens/delete**", async (route: Route) => {
      const request = route.request();
      if (request.method() === "GET") {
        return route.fulfill({
          json: {
            name: "",
            follows: 0,
            placeFollows: 0,
            saves: 0,
            rsvps: 0,
            comments: 0,
            moments: 0,
            messages: 0,
            notifications: 0,
            blockers: [],
          },
        });
      }
      posts.push(request.postDataJSON() as { id: string; confirmName: string });
      return route.fulfill({ json: { outcome: "deleted", warnings: [] } });
    });

    const row = page.locator(`[data-citizen="${NO_NAME.id}"]`);
    await expect(row).not.toContainText("noname@secret.example");
    await row.getByRole("button", { name: "Delete Unnamed citizen" }).click();
    const modal = page.locator(`[data-delete-citizen="${NO_NAME.id}"]`);
    const typed = modal.getByLabel("Type the display name to confirm");
    const confirm = modal.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();
    await typed.fill("deleted");
    await expect(confirm).toBeDisabled();
    await typed.fill(" DELETE ");
    await expect(confirm).toBeEnabled();
    await typed.fill("Delete");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(row).toHaveCount(0);
    expect(posts).toEqual([{ id: NO_NAME.id, confirmName: "Delete" }]);
  });

  test("overview counts are buttons whose accessible names include the count", async ({ page }) => {
    await signInAdmin(page);
    await page.route("**/api/admin/users**", (route: Route) => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get("role") === "citizen") {
        return route.fulfill({ json: { data: [ADA], meta: { page: 1, pageSize: 20, total: 1 } } });
      }
      return route.fulfill({ json: { data: [], meta: { page: 1, pageSize: 20, total: 12 } } });
    });
    await page.goto("/admin");
    await expect(page.locator('[data-screen="admin"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Overview", exact: true }).click();

    const members = page.getByRole("button", { name: "View 12 members" });
    await expect(members).toBeVisible();
    await expect(members).toHaveAccessibleName("View 12 members");
    const contributors = page.getByRole("button", { name: /^View \d+ contributors?$/ });
    await expect(contributors).toBeVisible();
    const contributorCount = ((await contributors.innerText()).match(/\d+/) || [""])[0];
    await expect(contributors).toHaveAccessibleName(
      `View ${contributorCount} contributor${contributorCount === "1" ? "" : "s"}`,
    );

    await members.click();
    await expect(page.locator("[data-admin-citizens]")).toBeVisible();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: /^View \d+ contributors?$/ }).click();
    await expect(page.locator("[data-admin-contributors]")).toBeVisible();
  });
});
