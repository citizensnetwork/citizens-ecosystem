import { test, expect, type Page, type Route } from "@playwright/test";
import { goTo } from "./support/app-hooks";
import { FAKE_PROJECT, mockAppShell, signInToFakeProject } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Admin → Create parity (#198): the public contact email, every social
//  the portal lists (including X, LinkedIn and WhatsApp) and one cover.
//  Hermetic: a signed-in admin, the create route mocked, and the listing
//  link answered with the fields the form just sent.
// ════════════════════════════════════════════════════════════════════

test.use({ bypassCSP: true });

const ADMIN = { id: "88888888-8888-4888-8888-888888888888", email: "admin@citizens.example", fullName: "Test Admin" };
const OWNER_EMAIL = "owner@grace.example";
const SLUG = "grace-outreach";
const COVER = "https://images.example.org/cover.jpg";

type CreateBody = Record<string, unknown>;

function profileFrom(body: CreateBody) {
  const covers = Array.isArray(body.cover_photo_urls) ? body.cover_photo_urls : [];
  return {
    id: "99999999-9999-4999-8999-999999999999",
    full_name: body.display_name,
    role: "contributor",
    contributor_kind: body.contributor_kind || "ministry",
    category: body.contributor_category,
    contributor_slug: SLUG,
    bio: body.bio || "",
    website_url: body.website_url || "",
    instagram_handle: body.instagram_handle ?? null,
    facebook_url: body.facebook_url ?? null,
    tiktok_handle: body.tiktok_handle ?? null,
    youtube_url: body.youtube_url ?? null,
    x_handle: body.x_handle ?? null,
    linkedin_url: body.linkedin_url ?? null,
    whatsapp_number: body.whatsapp_number ?? null,
    physical_address: body.physical_address || "",
    physical_latitude: null,
    physical_longitude: null,
    no_fixed_location: false,
    gallery_urls: [],
    cover_photo_urls: covers.map((url) => (typeof url === "string" ? { url, caption: null } : url)),
    contact_email: body.contact_email || "",
    created_at: new Date().toISOString(),
  };
}

async function openCreate(page: Page, reply: { status?: number; json?: Record<string, unknown> } = {}) {
  const requests: CreateBody[] = [];
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, { user: ADMIN, profile: { role: "admin", contributor_status: "not_applied" } });
  await page.route("**/api/contributor/claim", (route: Route) => route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
  await page.route("**/api/admin/contributor-applications", (route: Route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/admin/contributors/create", (route: Route) => {
    const body = route.request().postDataJSON() as CreateBody;
    requests.push(body);
    if (reply.status) return route.fulfill({ status: reply.status, json: reply.json || { error: "create_failed" } });
    return route.fulfill({
      json: {
        success: true,
        contributor_id: "99999999-9999-4999-8999-999999999999",
        slug: SLUG,
        claim_email: OWNER_EMAIL,
        email: "sent",
        onMap: false,
      },
    });
  });
  // A real cover loads. This host is fake, so answer with a tiny PNG or the
  // profile treats the image as broken and hides it.
  await page.route("https://images.example.org/**", (route: Route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.route(`**/api/v1/contributors/${SLUG}`, (route: Route) =>
    route.fulfill({
      json: {
        data: {
          profile: profileFrom(requests[0] || {}),
          upcoming_events: [],
          past_events: [],
          places: [],
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
  await goTo(page, "admin");
  await expect(page.locator('[data-screen="admin"]')).toBeVisible();
  await page.getByRole("button", { name: "Contributors", exact: true }).click();
  await page.getByRole("button", { name: "Create Contributor", exact: true }).click();
  await expect(page.getByTestId("admin-create-form")).toBeVisible();
  return requests;
}

async function fillRequired(page: Page) {
  await page.getByPlaceholder("e.g. New Wine Fellowship").fill("Grace Outreach");
  await page.getByPlaceholder("contact@ministry.org").fill(OWNER_EMAIL);
  await page.getByPlaceholder("e.g. Eastside, Central District").fill("Church Square, Pretoria");
  await page.getByRole("button", { name: "Retreat / Healing" }).click();
}

const SOCIAL_ORDER = ["Instagram", "Facebook", "YouTube", "TikTok", "X", "LinkedIn", "WhatsApp"];

test.describe("Admin → Create: contact, socials and cover", () => {
  test("shows contact email, every social and a cover after Website, with a visible label on each", async ({ page }) => {
    await openCreate(page);
    const form = page.getByTestId("admin-create-form");
    await expect(form.getByText("Public contact email")).toBeVisible();
    await expect(form.getByText("Shown to citizens — different from your sign-in email.")).toBeVisible();
    await expect(form.getByLabel("Public contact email")).toHaveAttribute("type", "email");
    await expect(form.getByText("Social media")).toBeVisible();
    await expect(form.getByTestId("social-hint")).toHaveText("A link or just the handle — either works. Shown publicly on your listing.");
    for (const name of SOCIAL_ORDER) {
      await expect(form.getByRole("textbox", { name, exact: true })).toBeVisible();
    }
    await expect(form.getByText("Cover photo", { exact: true })).toBeVisible();
    await expect(form.getByText("The first photo is the public cover image.")).toBeVisible();
    await expect(form.getByRole("button", { name: "Add cover photo" })).toBeVisible();

    const website = await form.getByLabel("Website").boundingBox();
    const contact = await form.getByLabel("Public contact email").boundingBox();
    const socials = await form.getByTestId("admin-create-socials").boundingBox();
    const cover = await form.getByRole("button", { name: "Add cover photo" }).boundingBox();
    expect(website && contact && socials && cover).toBeTruthy();
    expect(contact!.y).toBeGreaterThan(website!.y);
    expect(socials!.y).toBeGreaterThan(contact!.y);
    expect(cover!.y).toBeGreaterThan(socials!.y);
  });

  test("socials sit in two columns on a desktop and one column on a phone", async ({ page }) => {
    await openCreate(page);
    const boxes = () =>
      page.getByTestId("admin-create-socials").locator("[data-social]").evaluateAll((els) =>
        els.slice(0, 2).map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y };
        }),
      );

    await page.setViewportSize({ width: 1280, height: 900 });
    const wide = await boxes();
    expect(wide[1].x).toBeGreaterThan(wide[0].x + 40);
    expect(Math.abs(wide[1].y - wide[0].y)).toBeLessThan(8);

    await page.setViewportSize({ width: 375, height: 812 });
    const narrow = await boxes();
    expect(Math.abs(narrow[1].x - narrow[0].x)).toBeLessThan(8);
    expect(narrow[1].y).toBeGreaterThan(narrow[0].y + 20);
  });

  test("tab order runs from Website through contact, each social, then the cover", async ({ page }) => {
    await openCreate(page);
    await page.getByLabel("Website").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Public contact email")).toBeFocused();
    for (const name of SOCIAL_ORDER) {
      await page.keyboard.press("Tab");
      await expect(page.getByRole("textbox", { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Add cover photo" })).toBeFocused();
  });

  test("an unusable social shows the field hint in red and does not submit", async ({ page }) => {
    const requests = await openCreate(page);
    await fillRequired(page);
    await page.getByRole("textbox", { name: "X", exact: true }).fill("Grace Radio");
    const hint = page.getByTestId("social-hint");
    await expect(hint).toHaveClass(/text-destructive/);
    await expect(page.locator('[data-social="x"]')).toHaveAttribute("data-invalid", "true");
    await expect(page.getByRole("button", { name: "Create Contributor Listing" })).toBeDisabled();
    await page.getByRole("button", { name: "Create Contributor Listing" }).click({ force: true });
    expect(requests).toHaveLength(0);
  });

  test("the browser's email rule blocks a public contact address that is not an email", async ({ page }) => {
    const requests = await openCreate(page);
    await fillRequired(page);
    const email = page.getByLabel("Public contact email");
    await email.fill("not-an-email");
    await page.getByRole("button", { name: "Create Contributor Listing" }).click();
    expect(requests).toHaveLength(0);
    await expect(email).toHaveJSProperty("validity.valid", false);
    await expect(email).toHaveValue("not-an-email");
  });

  test("a refused create keeps what was typed and shows the reason", async ({ page }) => {
    await openCreate(page, { status: 400, json: { error: "invalid_whatsapp_number" } });
    await fillRequired(page);
    await page.getByLabel("Public contact email").fill("hello@example.org");
    await page.getByRole("textbox", { name: "WhatsApp", exact: true }).fill("hello");
    await page.getByRole("button", { name: "Create Contributor Listing" }).click();
    await expect(page.getByTestId("create-error")).toContainText("WhatsApp needs a phone number");
    await expect(page.getByLabel("Public contact email")).toHaveValue("hello@example.org");
    await expect(page.getByRole("textbox", { name: "WhatsApp", exact: true })).toHaveValue("hello");
    await expect(page.getByPlaceholder("e.g. New Wine Fellowship")).toHaveValue("Grace Outreach");
  });

  test("creating with the five fields sends them, then the profile shows the chips, the email and the cover", async ({ page }) => {
    const requests = await openCreate(page);
    await fillRequired(page);
    await page.getByLabel("Public contact email").fill("hello@example.org");
    await page.getByRole("textbox", { name: "X", exact: true }).fill("@graceexample");
    await page.getByRole("textbox", { name: "LinkedIn", exact: true }).fill("linkedin.com/company/example");
    await page.getByRole("textbox", { name: "WhatsApp", exact: true }).fill("+27 82 000 0000");
    await page.getByRole("button", { name: "Add cover photo" }).click();
    await page.getByPlaceholder("or paste an image URL…").fill(COVER);
    await page.getByPlaceholder("or paste an image URL…").press("Enter");
    await page.getByRole("button", { name: "Create Contributor Listing" }).click();

    await expect(page.getByTestId("admin-create-overlay")).toHaveCount(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      contact_email: "hello@example.org",
      x_handle: "@graceexample",
      linkedin_url: "linkedin.com/company/example",
      whatsapp_number: "+27 82 000 0000",
      cover_photo_urls: [COVER],
    });

    await page.goto(`/c/${SLUG}`);
    const profile = page.locator('[data-screen="profile"]');
    await expect(profile).toBeVisible({ timeout: 15_000 });
    await expect(profile.getByRole("heading", { name: "Grace Outreach" })).toBeVisible();
    await expect(profile.getByText("hello@example.org")).toBeVisible();
    await expect(profile.getByRole("link", { name: /X — @graceexample/ })).toBeVisible();
    await expect(profile.getByRole("link", { name: /LinkedIn — company\/example/ })).toBeVisible();
    await expect(profile.getByRole("link", { name: /WhatsApp/ })).toBeVisible();
    await expect(profile.locator(`img[src="${COVER}"]`)).toBeVisible();
  });
});
