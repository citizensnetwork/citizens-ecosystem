import { test, expect, type Page, type Route } from "@playwright/test";
import {
  FAKE_PROJECT,
  FAKE_PROJECT_CORS,
  fakeSession,
  installFakeProject,
  mockAppShell,
  type FakeProjectOpts,
  type FakeUser,
} from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Email-code sign-in (RESUME C5): "Continue with email" → a 6-digit code →
//  in. For anyone without a Google account — e.g. the owner of a Form-created
//  listing on Outlook mail, who could not sign in at all before this.
//
//  Hermetic like the other signed-in specs: a REAL-mode app pointed at a fake
//  project (e2e/support/fake-project.ts), signed OUT to begin with, with the
//  project's /auth/v1/otp and /auth/v1/verify answered locally. Nothing here
//  can reach (or email) a real address.
// ════════════════════════════════════════════════════════════════════

const CODE = "482913";

// An address Connect has never seen: the account is created on verification.
const NEWBIE: FakeUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "new.citizen@example.com", fullName: "" };
// The owner of a Form-created listing (Harvest Radio, on Outlook): the code signs
// them in AS the listing account, so they land on their dashboard.
const OWNER: FakeUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "studio@harvestradio.example", fullName: "Harvest Radio" };

type Mocks = {
  /** What /auth/v1/otp received, in order. */
  otpRequests: { email: string; create_user: boolean }[];
  /** What /auth/v1/verify received, in order. */
  verifyAttempts: { email: string; token: string; type: string }[];
  rpcCalls: string[];
  /** How the next /auth/v1/otp request is answered. */
  otp: "ok" | "rate-limited" | "offline";
};

async function openSignedOut(
  page: Page,
  user: FakeUser,
  profile: FakeProjectOpts["profile"],
  rpc?: FakeProjectOpts["rpc"],
): Promise<Mocks> {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  const session = fakeSession(user);
  const rpcCalls = await installFakeProject(page, { user, profile, rpc }, session);
  const mocks: Mocks = { otpRequests: [], verifyAttempts: [], rpcCalls, otp: "ok" };

  // Registered after installFakeProject, so these win for their paths; a CORS
  // preflight is handed back (fallback) to the project's own handler.
  await page.route(`${FAKE_PROJECT}/auth/v1/otp**`, (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const body = route.request().postDataJSON() as { email: string; create_user: boolean };
    mocks.otpRequests.push({ email: body.email, create_user: body.create_user });
    if (mocks.otp === "offline") return route.abort("failed");
    if (mocks.otp === "rate-limited") {
      return route.fulfill({
        status: 429,
        headers: FAKE_PROJECT_CORS,
        json: {
          code: 429,
          error_code: "over_email_send_rate_limit",
          msg: "For security purposes, you can only request this after 56 seconds.",
        },
      });
    }
    return route.fulfill({ headers: FAKE_PROJECT_CORS, json: {} });
  });
  await page.route(`${FAKE_PROJECT}/auth/v1/verify**`, (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const body = route.request().postDataJSON() as { email: string; token: string; type: string };
    mocks.verifyAttempts.push({ email: body.email, token: body.token, type: body.type });
    if (body.token !== CODE) {
      return route.fulfill({
        status: 403,
        headers: FAKE_PROJECT_CORS,
        json: { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" },
      });
    }
    return route.fulfill({ headers: FAKE_PROJECT_CORS, json: session });
  });
  // A citizen with nothing to claim stays put (the existing claim path would
  // otherwise redirect to /dashboard on the catch-all's 200).
  await page.route("**/api/contributor/claim", (route: Route) =>
    route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }),
  );
  return mocks;
}

const continueWithEmail = (page: Page) => page.getByRole("button", { name: "Continue with email" });
const emailField = (page: Page) => page.getByLabel("Your email address");
const codeField = (page: Page) => page.getByLabel("6-digit code");
const sendCode = (page: Page) => page.getByRole("button", { name: "Send code" });
const signIn = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });

/** Simulates pasting `text` into the code box (what a phone's "paste" does). */
const pasteIntoCode = (page: Page, text: string) =>
  codeField(page).evaluate((el, t) => {
    const data = new DataTransfer();
    data.setData("text", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);

test.describe("Email-code sign-in", () => {
  // The app's CSP connect-src allows only the REAL Supabase project host;
  // bypass it so the fake project stays fully separate from production.
  test.use({ bypassCSP: true });

  test("a new address: validates, asks for a code, rejects a wrong one, accepts the right one", async ({ page }) => {
    const mocks = await openSignedOut(page, NEWBIE, {
      role: "citizen",
      contributor_status: "not_applied",
      full_name: "", // email sign-ups arrive with no name
    });
    await page.goto("/");

    // Google stays the primary button; email is the quiet second option.
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible({ timeout: 15_000 });
    await continueWithEmail(page).click();

    // Nothing is sent for something that isn't an address.
    await emailField(page).fill("not-an-email");
    await sendCode(page).click();
    await expect(page.getByRole("alert")).toHaveText("Please enter a valid email address.");
    expect(mocks.otpRequests).toHaveLength(0);

    // The address is trimmed and lower-cased; Connect asks GoTrue to create
    // the account if it is new (Wear's sign-in-only setting is deliberately not used).
    await emailField(page).fill("  New.Citizen@Example.COM ");
    await sendCode(page).click();
    await expect(page.getByText("We sent a 6-digit code to")).toBeVisible();
    await expect(page.getByText("new.citizen@example.com", { exact: true })).toBeVisible();
    expect(mocks.otpRequests).toEqual([{ email: "new.citizen@example.com", create_user: true }]);

    // A wrong code is explained in plain words and keeps the person on this screen.
    await codeField(page).fill("000000");
    await signIn(page).click();
    await expect(page.getByRole("alert")).toHaveText("That code didn't work or has expired — request a new one.");
    expect(mocks.verifyAttempts).toEqual([{ email: "new.citizen@example.com", token: "000000", type: "email" }]);
    await expect(page.locator('[data-screen="discover"]')).toHaveCount(0);

    // A pasted "482 913" (as some mail apps show it) arrives as 482913, not truncated to 6 characters.
    await pasteIntoCode(page, `${CODE.slice(0, 3)} ${CODE.slice(3)}`);
    await expect(codeField(page)).toHaveValue(CODE);
    await signIn(page).click();

    // In: a citizen lands on Discover, the landing screen is gone, and the
    // sidebar shows a readable name — not a blank, and never the raw address.
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });
    await expect(continueWithEmail(page)).toHaveCount(0);
    await expect(page.locator("aside").getByText("New Citizen", { exact: true })).toBeVisible();
    await expect(page.getByText("new.citizen@example.com")).toHaveCount(0);
    expect(mocks.rpcCalls).not.toContain("mark_own_listing_claimed");
  });

  test("an owner on Outlook mail signs in AS their listing and lands on its dashboard", async ({ page }) => {
    const mocks = await openSignedOut(
      page,
      OWNER,
      { role: "contributor", contributor_status: "approved" },
      (fn) => (fn === "mark_own_listing_claimed" ? { success: true, slug: "harvest-radio" } : []),
    );
    await page.goto("/");

    await continueWithEmail(page).click();
    await emailField(page).fill(OWNER.email);
    await sendCode(page).click();
    await codeField(page).fill(CODE);
    await signIn(page).click();

    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Your listing is live", { exact: false })).toBeVisible();
    expect(mocks.rpcCalls.filter((f) => f === "mark_own_listing_claimed")).toHaveLength(1);
    expect(mocks.verifyAttempts).toEqual([{ email: OWNER.email, token: CODE, type: "email" }]);
  });

  test("Resend is held for 60 seconds, then sends a fresh code", async ({ page }) => {
    // A fake clock makes the countdown deterministic (the page's timers and Date only).
    await page.clock.install();
    const mocks = await openSignedOut(page, NEWBIE, { role: "citizen", contributor_status: "not_applied" });
    await page.goto("/");

    await continueWithEmail(page).click();
    await emailField(page).fill(NEWBIE.email);
    await sendCode(page).click();
    await expect(page.getByText("We sent a 6-digit code to")).toBeVisible();

    const resend = page.getByRole("button", { name: /^Resend code/ });
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText(/^Resend code in \d+s$/);

    await page.clock.fastForward(61_000);
    await expect(resend).toBeEnabled();
    await expect(resend).toHaveText("Resend code");

    await resend.click();
    await expect(page.getByRole("status")).toHaveText("A new code is on its way.");
    expect(mocks.otpRequests.map((r) => r.email)).toEqual([NEWBIE.email, NEWBIE.email]);
    await expect(resend).toBeDisabled(); // held again
  });

  test("the person can change their mind: a different email, or back to the landing", async ({ page }) => {
    await openSignedOut(page, NEWBIE, { role: "citizen", contributor_status: "not_applied" });
    await page.goto("/");

    await continueWithEmail(page).click();
    await emailField(page).fill("typo@example.com");
    await sendCode(page).click();
    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect(emailField(page)).toBeVisible();
    await expect(emailField(page)).toHaveValue("typo@example.com"); // kept, ready to correct

    await page.getByRole("button", { name: "Back" }).click();
    await expect(continueWithEmail(page)).toBeVisible();
    await expect(emailField(page)).toHaveCount(0);
  });

  test("being rate limited, or offline, is explained — never raw error text", async ({ page }) => {
    const mocks = await openSignedOut(page, NEWBIE, { role: "citizen", contributor_status: "not_applied" });
    await page.goto("/");

    await continueWithEmail(page).click();
    await emailField(page).fill(NEWBIE.email);

    mocks.otp = "rate-limited";
    await sendCode(page).click();
    await expect(page.getByRole("alert")).toHaveText("Too many attempts — wait a minute and try again.");
    await expect(emailField(page)).toBeVisible(); // still on the email step

    mocks.otp = "offline";
    await sendCode(page).click();
    await expect(page.getByRole("alert")).toHaveText(
      "We couldn't reach Citizens — check your connection and try again.",
    );
  });

  test("a guest who taps Sign in is taken back to the screen that offers email", async ({ page }) => {
    await openSignedOut(page, NEWBIE, { role: "citizen", contributor_status: "not_applied" });
    await page.goto("/");

    await page.getByRole("button", { name: "Browse as Guest" }).click();
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Your account" }).first().click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(continueWithEmail(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });
});
