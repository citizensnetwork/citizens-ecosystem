import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, openPinSheet, smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";

// ════════════════════════════════════════════════════════════════════
//  Guest mode (issue #201). Nobody signed in, Supabase configured (window.CC_AUTH set): Follow, Save, Consider and Connect
//  have nowhere to keep anything, so none of them may flip. Each shows ONE toast with a "Sign in" button; the button leads
//  to the sign-in screen (every way in), not to a Google-only prompt. The hermetic page has no CC_AUTH, so each test sets it,
//  which is how the real site looks to a guest (control: without it, demo mode still flips, see map-v2-follow.spec.ts).
// ════════════════════════════════════════════════════════════════════

type Row = { id: string; longitude?: number; latitude?: number; physical_longitude?: number; physical_latitude?: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: Row[]; places: Row[]; events: Row[] };
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
type MapHook = { jumpTo: (o: object, d: object) => void };
type Kind = "contributor" | "place" | "event";

async function openAsGuest(page: Page, kind: Kind) {
  const seed = seed0();
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed);
  await openMap(page, "/?map=v2", 8);
  const row = (kind === "contributor" ? seed.contributors : kind === "place" ? seed.places : seed.events)[0];
  const lng = Number(row.physical_longitude ?? row.longitude);
  const lat = Number(row.physical_latitude ?? row.latitude);
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [lng, lat]);
  // #210: on the home map a pin picks a card; the half sheet (with the action row these tests press) is what a pin opens on the clean map
  await openPinSheet(page, row.id);
  await expect(sheet(page)).toBeVisible();
  // the real site has Supabase configured and nobody signed in; the hermetic page has neither
  await page.evaluate(() => { (window as unknown as { CC_AUTH: object }).CC_AUTH = {}; });
}

const toastWith = (page: Page, text: string) => page.locator("[role='status']").filter({ hasText: text });
const signInButton = (page: Page) => page.locator("[data-toast-action]");
const actionBtn = (page: Page, re: RegExp) => page.locator("[data-mv2='actions'] [data-mv2='action']", { hasText: re });

test.describe("#201 a guest's Follow, Save, Consider and Connect never flip, and say why", () => {
  test("Follow on a Contributor", async ({ page }) => {
    await openAsGuest(page, "contributor");
    const btn = actionBtn(page, /^Follow(ing)?$/);
    await btn.click();
    await expect(toastWith(page, "Sign in to follow.")).toBeVisible();
    await expect(signInButton(page)).toHaveText("Sign in");
    await expect(btn).toHaveText("Follow");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
  });

  test("Save on a Contributor", async ({ page }) => {
    await openAsGuest(page, "contributor");
    const btn = actionBtn(page, /^Save(d)?$/);
    await btn.click();
    await expect(toastWith(page, "Sign in to save.")).toBeVisible();
    await expect(signInButton(page)).toHaveText("Sign in");
    await expect(btn).toHaveText("Save");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
  });

  test("Follow on a Place", async ({ page }) => {
    await openAsGuest(page, "place");
    const btn = actionBtn(page, /^Follow(ing)?$/);
    await btn.click();
    await expect(toastWith(page, "Sign in to follow.")).toBeVisible();
    await expect(btn).toHaveText("Follow");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
  });

  test("Consider on an Event", async ({ page }) => {
    await openAsGuest(page, "event");
    const btn = actionBtn(page, /^Consider(ing)?$/);
    await btn.click();
    await expect(toastWith(page, "Sign in to show you're considering it.")).toBeVisible();
    await expect(signInButton(page)).toHaveText("Sign in");
    await expect(btn).toHaveText("Consider");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
  });

  test("Connect on an Event", async ({ page }) => {
    await openAsGuest(page, "event");
    const btn = actionBtn(page, /^Connect(ed)?$/);
    await btn.click();
    await expect(toastWith(page, "Sign in to connect.")).toBeVisible();
    await expect(signInButton(page)).toHaveText("Sign in");
    await expect(btn).toHaveText("Connect");
    await expect(btn).not.toHaveAttribute("data-on", /.*/);
  });

  test("the Sign in button is a real, reachable 44 px button that goes to sign-in and clears the toast", async ({ page }) => {
    await openAsGuest(page, "event");
    await actionBtn(page, /^Connect(ed)?$/).click();
    const btn = signInButton(page);
    await expect(btn).toBeVisible();
    // layout height, not the drawn box: the toast slides in with a transform that would read 43.99
    expect(await btn.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
    // the stack announces politely and the button can be reached from the keyboard
    await expect(page.locator("[role='status'][aria-live='polite']").filter({ has: btn })).toHaveCount(1);
    // showSignIn() is the one way back to the sign-in screen: it clears the "browsing as a guest" flag. (The hermetic page is
    // seeded as signed in, so the screen itself cannot show here; the flag going is what is observable.)
    await page.evaluate(() => sessionStorage.setItem("cc_guest_browse_v1", "1"));
    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("cc_guest_browse_v1"))).toBeNull();
    await expect(btn).toHaveCount(0);
  });

  test("the toast with a button stays about 6 s; an ordinary toast does not outlive 3.2 s", async ({ page }) => {
    await openAsGuest(page, "event");
    await actionBtn(page, /^Connect(ed)?$/).click();
    await expect(signInButton(page)).toBeVisible();
    await page.waitForTimeout(4000);
    await expect(signInButton(page)).toBeVisible(); // longer than the 3.2 s of a plain toast
    await expect(signInButton(page)).toHaveCount(0, { timeout: 4000 }); // gone by ~6 s
  });
});
