import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, FAKE_PROJECT_CORS, mockAppShell, signInToFakeProject, type FakeUser } from "./support/fake-project";
import { mockMapNetwork, smallSeed, FIXED_NOW, type MapSeed, openListing, openPinSheet } from "./support/map-v2";
import { goTo } from "./support/app-hooks";

// ════════════════════════════════════════════════════════════════════
//  Convince (FEAT-04): the entry point that did not exist. A signed-in person opens an event, sees which of their mutual friends are
//  considering it, and sends (or undoes) a gentle nudge; and is told under Consider that those friends can see theirs, with a switch
//  in Settings. Everything is hermetic: the app runs against a fake Supabase project (e2e/support/fake-project.ts) and a stand-in
//  for the app's own /api, so nothing reaches a real backend. The DATABASE side (who may be nudged, who is hidden) is proved by
//  docs/audit/probes/friends_considering.probe.sql; here the database is a stand-in that answers what that probe proved.
//  Names are fictional; no real person, organisation or id appears.
// ════════════════════════════════════════════════════════════════════

test.use({ viewport: { width: 390, height: 844 }, bypassCSP: true });

type E = { id: string; title: string; latitude: number; longitude: number };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { events: E[] };
type Friend = { id: string; full_name: string; avatar_url: string | null };
const ANN: Friend = { id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", full_name: "Ann Probe", avatar_url: null };
const BEA: Friend = { id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2", full_name: "Bea Probe", avatar_url: null };

type Db = {
  friends: Friend[];
  nudged: Set<string>;
  /** the status the next /api/convince POST answers (201 stores the nudge, 409 knows it already) */
  postStatus: number;
  rpcMissing: boolean;
  rpcBodies: unknown[];
  posts: { event_id: string; to_user_id: string }[];
  deletes: { event_id: string; to_user_id: string }[];
  prefs: unknown[];
};
const newDb = (friends: Friend[] = [ANN, BEA]): Db => ({ friends, nudged: new Set(), postStatus: 201, rpcMissing: false, rpcBodies: [], posts: [], deletes: [], prefs: [] });

const CITIZEN: FakeUser = { id: "77777777-7777-4777-8777-777777777777", email: "citizen@signedin.example", fullName: "Sam Test" };

/** Opens the app as a signed-in citizen against the stand-ins. `notificationPrefs` is what get_my_profile_private answers. */
async function openAs(page: Page, db: Db, notificationPrefs: Record<string, boolean> = {}, seed = seed0()) {
  await page.clock.setFixedTime(FIXED_NOW);
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, {
    user: CITIZEN,
    profile: { role: "citizen", contributor_status: "not_applied" },
    rpc: (fn) => (fn === "get_my_profile_private" ? { notification_prefs: notificationPrefs } : []),
  });
  for (const key of ["contributors", "places", "events"] as const) {
    const rows = seed[key];
    await page.route(`**/api/v1/${key}?**`, (route: Route) => route.fulfill({ json: { data: rows, meta: { count: rows.length, limit: 100, offset: 0 } } }));
  }
  // the own-row meta the Settings screen reads (bio, discoverable); the shared fake project answers [] for it, which leaves Settings with no row to edit
  await page.route((url) => url.href.startsWith(FAKE_PROJECT + "/rest/v1/profiles") && (url.searchParams.get("select") ?? "").includes("bio"), (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    return route.fulfill({ json: [{ bio: "", discoverable: true }], headers: FAKE_PROJECT_CORS });
  });
  await page.route("**/api/contributor/claim", (route: Route) => route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
  await page.route("**/api/notifications/preferences", (route: Route) => {
    db.prefs.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true } });
  });

  // the reader (registered after the fake project's catch-all, so matched first)
  await page.route(`${FAKE_PROJECT}/rest/v1/rpc/friends_considering_event`, async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    db.rpcBodies.push(route.request().postDataJSON());
    if (db.rpcMissing) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "Could not find the function public.friends_considering_event" }, headers: FAKE_PROJECT_CORS });
    return route.fulfill({ json: db.friends.map((f) => ({ ...f, nudged: db.nudged.has(f.id) })), headers: FAKE_PROJECT_CORS });
  });
  // the app's own door
  await page.route("**/api/convince", async (route: Route) => {
    const m = route.request().method();
    const body = route.request().postDataJSON() as { event_id: string; to_user_id: string };
    if (m === "POST") {
      db.posts.push(body);
      if (db.postStatus === 201 || db.postStatus === 409) db.nudged.add(body.to_user_id);
      return route.fulfill({ status: db.postStatus, json: { error: "SECRET-SERVER-TEXT", code: "x", success: db.postStatus === 201 } });
    }
    if (m === "DELETE") {
      db.deletes.push(body);
      db.nudged.delete(body.to_user_id);
      return route.fulfill({ json: { success: true } });
    }
    return route.fallback();
  });
  return seed;
}

const row = (page: Page) => page.locator('[data-convince="row"]');
const friend = (page: Page, id: string) => page.locator(`[data-convince-friend="${id}"]`);
const send = (page: Page, id: string) => page.locator(`[data-convince-send="${id}"]`);
const undo = (page: Page, id: string) => page.locator(`[data-convince-undo="${id}"]`);

async function openEvent(page: Page, seed: { events: E[] }) {
  await page.goto(`/e/${seed.events[0].id}`);
  await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 20_000 });
}

test.describe("Friends considering, on the event page", () => {
  test("lists my friends, a tap sends ONE nudge, it survives a reload, and Undo takes it back", async ({ page }) => {
    const db = newDb();
    const seed = await openAs(page, db);
    const ev = seed.events[0];
    await openEvent(page, seed);

    await expect(row(page)).toBeVisible();
    await expect(row(page).getByText("Friends considering")).toBeVisible();
    await expect(page.locator("[data-convince-name]")).toHaveText(["Ann Probe", "Bea Probe"]);
    expect(db.rpcBodies[0]).toEqual({ p_event: ev.id });
    await expect(page.locator('[data-convince="preview"]')).toHaveText(`They will read: “Sam Test thinks you should go to ${ev.title}”.`);

    await send(page, ANN.id).click();
    await expect(friend(page, ANN.id)).toHaveAttribute("data-state", "nudged");
    await expect(page.getByText("Nudge sent to Ann Probe.")).toBeVisible();
    await expect(friend(page, BEA.id)).toHaveAttribute("data-state", "idle");
    expect(db.posts).toEqual([{ event_id: ev.id, to_user_id: ANN.id }]);

    await page.reload();                                         // the state comes back from the database, not from memory
    await expect(friend(page, ANN.id)).toHaveAttribute("data-state", "nudged");
    await expect(friend(page, BEA.id)).toHaveAttribute("data-state", "idle");

    await undo(page, ANN.id).click();
    await expect(friend(page, ANN.id)).toHaveAttribute("data-state", "idle");
    await expect(page.getByText("Nudge withdrawn. Anything they already saw stays in their notifications.")).toBeVisible();
    expect(db.deletes).toEqual([{ event_id: ev.id, to_user_id: ANN.id }]);
    expect(db.posts).toHaveLength(1);
  });

  test("409 shows Nudged; 403 is one neutral sentence and never names a reason; 429 asks for a moment", async ({ page }) => {
    const db = newDb();
    const seed = await openAs(page, db);
    await openEvent(page, seed);
    await expect(row(page)).toBeVisible();

    db.postStatus = 409;
    await send(page, ANN.id).click();
    await expect(friend(page, ANN.id)).toHaveAttribute("data-state", "nudged");
    await expect(page.getByText("You have already nudged Ann Probe about this event.")).toBeVisible();

    db.postStatus = 403;
    await send(page, BEA.id).click();
    await expect(page.getByText("That nudge cannot be sent right now.")).toBeVisible();
    await expect(friend(page, BEA.id)).toHaveAttribute("data-state", "idle");

    db.postStatus = 429;
    await page.waitForTimeout(100);
    await send(page, BEA.id).click();
    await expect(page.getByText("That is a lot of nudges at once. Please try again in a moment.")).toBeVisible();
    await expect(send(page, BEA.id)).toBeEnabled();

    const text = await page.locator("body").innerText();
    expect(text).not.toContain("SECRET-SERVER-TEXT");
    expect(text).not.toMatch(/blocked|hidden from|private/i);
  });

  test("no friend considering, or the function not there yet: no row, no error, no toast", async ({ page }) => {
    const db = newDb([]);
    const seed = await openAs(page, db);
    await openEvent(page, seed);
    await expect.poll(() => db.rpcBodies.length).toBeGreaterThan(0);
    await expect(row(page)).toHaveCount(0);

    db.rpcMissing = true;
    db.friends = [ANN];
    await page.reload();
    await expect(page.locator('[data-screen="event"]')).toBeVisible();
    await expect.poll(() => db.rpcBodies.length).toBeGreaterThan(1);
    await expect(row(page)).toHaveCount(0);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test("on a phone: no sideways scroll with a long name, and every button is a full-size tap target", async ({ page }) => {
    const db = newDb([{ id: ANN.id, full_name: "Annabelle-Marguerite Probe-Wellington the Third of the Long Names", avatar_url: null }, BEA]);
    const seed = await openAs(page, db);
    await openEvent(page, seed);
    await expect(row(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const id of [ANN.id, BEA.id]) {
      const box = await send(page, id).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await send(page, ANN.id).click();
    await expect(undo(page, ANN.id)).toBeVisible();
    expect((await undo(page, ANN.id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("the note under Consider and the switch in Settings", () => {
  test("the note is there by default; its link opens Settings; switching off sends exactly one preference and silences the note", async ({ page }) => {
    const db = newDb([]);
    const seed = await openAs(page, db);
    await openEvent(page, seed);
    const note = page.locator("[data-consider-note]");
    await expect(note).toHaveText("Friends you follow, who follow you back, can see you’re considering this. Change in Settings");

    await page.locator("[data-consider-note-link]").click();
    await expect(page.locator('[data-screen="settings"]')).toBeVisible();
    const toggle = page.locator('[data-setting="share-considering"] button');
    await expect(toggle).toContainText("Friends can see what I’m considering");
    const knob = toggle.locator("span > span").first();
    await expect(knob).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 20, 0\)/);          // on by default
    await toggle.click();
    await expect.poll(() => db.prefs).toEqual([{ notification_prefs: { share_considering: false } }]);
    await expect(knob).not.toHaveCSS("transform", /matrix\(1, 0, 0, 1, 20, 0\)/);

    await page.goBack();                                                               // the event again: the note has gone quiet
    await expect(page.locator('[data-screen="event"]')).toBeVisible();
    await expect(page.locator("[data-consider-note]")).toHaveCount(0);
  });

  test("a person who already switched sharing off sees no note, and the switch shows off", async ({ page }) => {
    const db = newDb([]);
    const seed = await openAs(page, db, { share_considering: false });
    await openEvent(page, seed);
    await expect.poll(() => db.rpcBodies.length).toBeGreaterThan(0);
    await expect(page.locator('[data-screen="event"]')).toBeVisible();
    await expect(page.locator("[data-consider-note]")).toHaveCount(0);

    await goTo(page, "settings");
    await expect(page.locator('[data-screen="settings"]')).toBeVisible();
    const knob = page.locator('[data-setting="share-considering"] button span > span').first();
    await expect(knob).not.toHaveCSS("transform", /matrix(1, 0, 0, 1, 20, 0)/);                 // the switch shows OFF
  });
});

test.describe("on the Map v2 sheet", () => {
  test("an event's sheet shows the note and the row, and a tap there sends the same nudge", async ({ page }) => {
    const db = newDb();
    const seed = await openAs(page, db);
    const ev = seed.events[0];
    await page.goto("/?map=v2");
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => !!(window as unknown as { __ccMap?: unknown }).__ccMap && document.querySelectorAll(".maplibregl-marker").length >= 3, undefined, { timeout: 20_000 });
    await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [ev.longitude, ev.latitude]);
    await openListing(page, ev.id);
    const sheet = page.locator("[data-mv2='sheet']");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("[data-consider-note]")).toBeVisible();
    await expect(sheet.locator('[data-convince="row"]')).toBeVisible();
    await send(page, BEA.id).click();
    await expect(friend(page, BEA.id)).toHaveAttribute("data-state", "nudged");
    expect(db.posts).toEqual([{ event_id: ev.id, to_user_id: BEA.id }]);
  });
});

test.describe("#183 the half sheet with the Convince row, on two phones", () => {
  // The header, the action row and the Convince row must be fully on screen at half snap. If they are not, that is a bug to
  // report with these numbers (the sheet's own height is NOT changed in issue #183). The numbers are attached to the test.
  for (const vp of [{ width: 360, height: 740 }, { width: 412, height: 915 }]) {
    test(`header and action row are fully visible at half snap (Convince row measured), ${vp.width} x ${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      const db = newDb();
      const seed = await openAs(page, db);
      const ev = seed.events[0];
      await page.goto("/?map=v2");
      await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 20_000 });
      await page.waitForFunction(() => !!(window as unknown as { __ccMap?: unknown }).__ccMap && document.querySelectorAll(".maplibregl-marker").length >= 3, undefined, { timeout: 20_000 });
      await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: { jumpTo: (o: object, d: object) => void } }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [ev.longitude, ev.latitude]);
      await openPinSheet(page, ev.id); // #210: the half sheet is what a pin opens on the clean map; a card opens the full one
      const sheet = page.locator("[data-mv2='sheet']");
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute("data-snap", "half");
      const row = sheet.locator('[data-convince="row"]');
      await expect(row).toBeVisible();
      await page.waitForFunction(() => document.querySelector("[data-mv2='sheet']")?.getAnimations({ subtree: true }).every((a) => a.playState !== "running"));
      const parts: Record<string, string> = { sheet: "[data-mv2='sheet']", header: "[data-mv2='head']", actions: "[data-mv2='actions']", convince: '[data-convince="row"]' };
      const boxes: Record<string, { top: number; bottom: number } | null> = {};
      for (const [name, sel] of Object.entries(parts)) {
        const b = await page.locator(sel).first().boundingBox();
        boxes[name] = b ? { top: Math.round(b.y), bottom: Math.round(b.y + b.height) } : null;
      }
      test.info().annotations.push({ type: `half-sheet ${vp.width}x${vp.height}`, description: JSON.stringify(boxes) });
      console.log(`half sheet ${vp.width}x${vp.height}: ${JSON.stringify(boxes)}`);
      for (const name of ["header", "actions"]) {
        expect(boxes[name], `${name} exists`).not.toBeNull();
        expect(boxes[name]!.top, `${name} starts on screen`).toBeGreaterThanOrEqual(0);
        expect(boxes[name]!.bottom, `${name} ends on screen`).toBeLessThanOrEqual(vp.height);
      }
      // The Convince row is MEASURED, not asserted: on both phones it sits below the half-snap fold (numbers in the pull request
      // for #183). Per the issue that is a finding to report; the sheet's half height is not changed here.
      expect(boxes.convince, "convince exists").not.toBeNull();
    });
  }
});

test.describe("nothing for people who cannot use it", () => {
  test("in the signed-out demo the event page has neither the note nor the row, and asks the database nothing", async ({ page }) => {
    const seed = seed0();
    await mockMapNetwork(page, seed);
    let asked = 0;
    await page.route("**/rpc/friends_considering_event", (route: Route) => { asked++; return route.fulfill({ json: [] }); });
    await page.goto(`/e/${seed.events[0].id}`);
    await expect(page.locator('[data-screen="event"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-consider-note]")).toHaveCount(0);
    await expect(page.locator('[data-convince="row"]')).toHaveCount(0);
    expect(asked).toBe(0);
  });
});
