import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, FAKE_PROJECT_CORS, mockAppShell, signInToFakeProject, type FakeUser } from "./support/fake-project";
import { smallSeed, FIXED_NOW, type MapSeed } from "./support/map-v2";
import { goTo } from "./support/app-hooks";

// ════════════════════════════════════════════════════════════════════
//  The SIGNED-IN halves of Save (migration 183) and co-hosted events (migration 184), against a stateful fake Supabase project
//  (e2e/support/fake-project.ts): the real store code, with a real session, talking to REST and RPC endpoints we control.
//  What the unit tests cannot see and the demo-mode specs skip: the exact requests the app makes (table, columns, filters),
//  what it does with each kind of failure, that a saved heart survives a reload, that your own listing has no Follow or Save,
//  and that the Notifications screen hands the right ids to Accept and Decline.
//  (What the DATABASE allows is proved by docs/audit/probes/183_* and 184_*; here the database is a stand-in.)
// ════════════════════════════════════════════════════════════════════

test.use({ viewport: { width: 390, height: 844 }, bypassCSP: true });

type C = { id: string; contributor_slug: string; full_name: string; physical_longitude: number; physical_latitude: number };
type P = { id: string; name: string; longitude: number; latitude: number };
type E = { id: string; title: string; created_by: string; longitude: number; latitude: number; date: string };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[]; places: P[]; events: E[] };
type MapHook = { jumpTo: (o: object, d: object) => void };

type SavedRow = { user_id: string; contributor_id?: string; place_id?: string };
type MomentRow = { id: string; contributor_id: string; body: string; image_url: string | null; created_at: string; expires_at: string };
type Db = {
  saved: SavedRow[];
  cohosts: { event_id: string; contributor_id: string; status: string }[];
  /** what the next saved_items POST answers: undefined = success */
  savedFail?: { status: number; body: Record<string, unknown> };
  ownEvents: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  /** the moments table (migration 188); the stand-in answers like RLS would: live rows of the asked-for Contributor */
  moments: MomentRow[];
  /** what the next moments POST answers: undefined = success */
  momentsFail?: { status: number; body: Record<string, unknown> };
  log: string[];
  bodies: { fn: string; body: Record<string, unknown> }[];
  patches: unknown[];
};
const newDb = (): Db => ({ saved: [], cohosts: [], ownEvents: [], notifications: [], moments: [], log: [], bodies: [], patches: [] });

/** Answers the fake project's REST tables like RLS would: the caller's own rows only. */
async function openAs(page: Page, user: FakeUser, profile: { role: string; contributor_status: string }, db: Db, seed = seed0()) {
  await page.clock.setFixedTime(FIXED_NOW);
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await signInToFakeProject(page, { user, profile });
  await page.route("**/api/contributor/claim", (route: Route) => route.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
  for (const key of ["contributors", "places", "events"] as const) {
    const rows = seed[key];
    await page.route(`**/api/v1/${key}?**`, (route: Route) => route.fulfill({ json: { data: rows, meta: { count: rows.length, limit: 100, offset: 0 } } }));
  }
  await page.route("**/api/v1/contributors/*", (route: Route) => route.fulfill({ status: 404, json: { error: "Contributor not found" } }));
  await page.route("**/api/notifications", (route: Route) => {
    if (route.request().method() === "PATCH") { db.patches.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true } }); }
    return route.fulfill({ json: { notifications: db.notifications } });
  });

  const rest = (table: string, handler: (r: Route, url: URL, method: string) => Promise<unknown> | unknown) => page.route(`${FAKE_PROJECT}/rest/v1/${table}**`, async (route: Route) => {
    const m = route.request().method();
    if (m === "OPTIONS") return route.fallback();
    return handler(route, new URL(route.request().url()), m);
  });
  const ok = (route: Route, json: unknown, status = 200) => route.fulfill({ status, json, headers: FAKE_PROJECT_CORS });

  await rest("saved_items", async (route, url, m) => {
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
    if (m === "GET") {
      db.log.push(`GET saved_items user=${eq("user_id")}`);
      return ok(route, db.saved.filter((r) => r.user_id === eq("user_id")).map((r) => ({ contributor_id: r.contributor_id ?? null, place_id: r.place_id ?? null })));
    }
    if (m === "POST") {
      const body = route.request().postDataJSON() as SavedRow;
      db.log.push(`POST saved_items ${JSON.stringify(body)}`);
      if (db.savedFail) return ok(route, db.savedFail.body, db.savedFail.status);
      db.saved.push(body);
      return route.fulfill({ status: 201, headers: FAKE_PROJECT_CORS });
    }
    if (m === "DELETE") {
      db.log.push(`DELETE saved_items ${url.search}`);
      db.saved = db.saved.filter((r) => !(r.user_id === eq("user_id") && (eq("contributor_id") ? r.contributor_id === eq("contributor_id") : r.place_id === eq("place_id"))));
      return route.fulfill({ status: 204, headers: FAKE_PROJECT_CORS });
    }
    return route.fallback();
  });
  await rest("moments", async (route, url, m) => {
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
    if (m === "GET") {
      db.log.push(`GET moments ${url.search}`);
      const live = db.moments.filter((r) => r.contributor_id === eq("contributor_id") && Date.parse(r.expires_at) > FIXED_NOW);
      return ok(route, live.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }
    if (m === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      db.log.push(`POST moments ${JSON.stringify(body)}`);
      if (db.momentsFail) return ok(route, db.momentsFail.body, db.momentsFail.status);
      const n = db.moments.length + 1;
      const row = { id: `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, image_url: null, ...body, created_at: new Date(FIXED_NOW + n * 1000).toISOString(), expires_at: new Date(FIXED_NOW + 24 * 3_600_000).toISOString() } as MomentRow;
      db.moments.push(row);
      return ok(route, row, 201);
    }
    if (m === "DELETE") {
      db.log.push(`DELETE moments ${url.search}`);
      db.moments = db.moments.filter((r) => r.id !== eq("id"));
      return route.fulfill({ status: 204, headers: FAKE_PROJECT_CORS });
    }
    return route.fallback();
  });
  await rest("event_cohosts", async (route, url, m) => {
    if (m !== "GET") return route.fallback();
    const eq = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
    db.log.push(`GET event_cohosts ${url.search}`);
    const rows = db.cohosts.filter((r) => (eq("contributor_id") ? r.contributor_id === eq("contributor_id") : true) && (eq("event_id") ? r.event_id === eq("event_id") : true));
    return ok(route, rows);
  });
  await rest("events", async (route, url, m) => {
    if (m !== "GET") return route.fallback();
    const owner = url.searchParams.get("created_by")?.replace(/^eq\./, "");
    return ok(route, owner === user.id ? db.ownEvents : []);
  });
  // RPCs: record the exact body, answer by name (registered last = matched first)
  await page.route(`${FAKE_PROJECT}/rest/v1/rpc/*_event_cohost`, async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const fn = new URL(route.request().url()).pathname.split("/").pop()!;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    db.bodies.push({ fn, body });
    if (fn === "invite_event_cohost") db.cohosts.push({ event_id: String(body.p_event_id), contributor_id: String(body.p_contributor_id), status: "invited" });
    if (fn === "remove_event_cohost") db.cohosts = db.cohosts.filter((r) => r.contributor_id !== body.p_contributor_id);
    if (fn === "respond_event_cohost") for (const r of db.cohosts) if (r.event_id === body.p_event_id && r.contributor_id === user.id) r.status = body.p_accept ? "accepted" : "declined";
    return ok(route, fn === "respond_event_cohost" ? { success: true, status: body.p_accept ? "accepted" : "declined" } : { success: true });
  });
  return seed;
}

async function openMapSignedIn(page: Page, min = 5) {
  await page.goto("/?map=v2");
  await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction((n) => !!(window as unknown as { __ccMap?: unknown }).__ccMap && document.querySelectorAll(".maplibregl-marker").length >= n, min, { timeout: 20_000 });
}
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
async function pick(page: Page, id: string, lng: number, lat: number) {
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [lng, lat]);
  await page.locator(`.maplibregl-marker[data-cc-id="${id}"]`).click({ force: true });
  await expect(sheet(page)).toBeVisible();
}
const act = (page: Page, re: RegExp) => page.locator("[data-mv2='actions'] [data-mv2='action']", { hasText: re });
const saveBtn = (page: Page) => act(page, /^Saved?$/);
const followBtn = (page: Page) => act(page, /^Follow(ing)?$/);

const CITIZEN: FakeUser = { id: "77777777-7777-4777-8777-777777777777", email: "citizen@signedin.example", fullName: "Test Citizen" };
const CITIZEN_PROFILE = { role: "citizen", contributor_status: "not_applied" };

test.describe("Save, signed in", () => {
  test("a tap writes ONE row (my id, one target), it survives a reload, and a second tap deletes exactly that row", async ({ page }) => {
    const db = newDb();
    const seed = await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page);
    const c = seed.contributors[0];
    await pick(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(saveBtn(page)).toHaveText("Save");
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Saved");
    await expect.poll(() => db.saved).toEqual([{ user_id: CITIZEN.id, contributor_id: c.id }]);
    expect(db.log.filter((l) => l.startsWith("POST"))).toEqual([`POST saved_items ${JSON.stringify({ user_id: CITIZEN.id, contributor_id: c.id })}`]);

    await page.reload();                                           // the heart comes back from the database, not from memory
    await expect(page.locator('[data-screen="discover"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll(".maplibregl-marker").length >= 5);
    expect(db.log).toContain(`GET saved_items user=${CITIZEN.id}`);
    await pick(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(saveBtn(page)).toHaveText("Saved");

    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Save");
    await expect.poll(() => db.saved).toEqual([]);
    expect(db.log.some((l) => l.startsWith("DELETE saved_items") && l.includes(`user_id=eq.${CITIZEN.id}`) && l.includes(`contributor_id=eq.${c.id}`))).toBe(true);
  });

  test("a Place is saved with place_id, not contributor_id", async ({ page }) => {
    const db = newDb();
    const seed = await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page);
    const p = seed.places[0];
    await pick(page, p.id, p.longitude, p.latitude);
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Saved");
    await expect.poll(() => db.saved).toEqual([{ user_id: CITIZEN.id, place_id: p.id }]);
  });

  test("the 500 ceiling: the heart goes back and the reason is said", async ({ page }) => {
    const db = newDb();
    db.savedFail = { status: 400, body: { code: "P0001", message: "saved_items_limit", details: null, hint: null } };
    const seed = await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page);
    const c = seed.contributors[0];
    await pick(page, c.id, c.physical_longitude, c.physical_latitude);
    await saveBtn(page).click();
    await expect(page.getByText("You can save up to 500 listings. Remove one to save another.")).toBeVisible();
    await expect(saveBtn(page)).toHaveText("Save");
    expect(db.saved).toEqual([]);
  });

  test("any other failure rolls the heart back with a plain message; saving what was already saved stays saved and quiet", async ({ page }) => {
    const db = newDb();
    db.savedFail = { status: 500, body: { code: "XX000", message: "boom" } };
    const seed = await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page);
    const c = seed.contributors[0];
    await pick(page, c.id, c.physical_longitude, c.physical_latitude);
    await saveBtn(page).click();
    await expect(page.getByText("Could not save — please try again.")).toBeVisible();
    await expect(saveBtn(page)).toHaveText("Save");

    db.savedFail = { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint" } };
    await saveBtn(page).click();
    await expect(saveBtn(page)).toHaveText("Saved");
    await page.waitForTimeout(600);
    await expect(saveBtn(page)).toHaveText("Saved");               // a repeat is success: nothing rolled back
  });

  test("Settings lists what the database holds for ME, by name, and removing deletes that row", async ({ page }) => {
    const db = newDb();
    const seed = seed0();
    seed.contributors[0].full_name = "Zeta Fellowship"; seed.places[0].name = "Alpha Place";
    db.saved = [{ user_id: CITIZEN.id, contributor_id: seed.contributors[0].id }, { user_id: CITIZEN.id, place_id: seed.places[0].id }, { user_id: "someone-else", contributor_id: seed.contributors[1].id }];
    await openAs(page, CITIZEN, CITIZEN_PROFILE, db, seed);
    await openMapSignedIn(page);
    await goTo(page, "settings");
    await expect(page.locator("[data-saved='row'] [data-saved='name']")).toHaveText(["Alpha Place", "Zeta Fellowship"]);   // someone else's save is never mine
    await page.getByRole("button", { name: "Remove Alpha Place from your saved list" }).click();
    await expect(page.locator("[data-saved='row']")).toHaveCount(1);
    await expect.poll(() => db.saved.filter((r) => r.user_id === CITIZEN.id)).toEqual([{ user_id: CITIZEN.id, contributor_id: seed.contributors[0].id }]);
  });

  test("your OWN listing has no Follow and no Save; another Contributor's has both", async ({ page }) => {
    const db = newDb();
    const seed = seed0();
    const me = seed.contributors[0];
    await openAs(page, { id: me.id, email: "owner@signedin.example", fullName: me.full_name }, { role: "contributor", contributor_status: "approved" }, db, seed);
    await openMapSignedIn(page);
    await pick(page, me.id, me.physical_longitude, me.physical_latitude);
    await expect(sheet(page)).toContainText(me.full_name);
    await expect(followBtn(page)).toHaveCount(0);
    await expect(saveBtn(page)).toHaveCount(0);
    const other = seed.contributors[1];
    await pick(page, other.id, other.physical_longitude, other.physical_latitude);
    await expect(sheet(page)).toContainText(other.full_name);
    await expect(followBtn(page)).toHaveCount(1);
    await expect(saveBtn(page)).toHaveCount(1);
  });
});

test.describe("Co-hosted events, signed in", () => {
  const EV = "e0000000-0000-4000-8000-0000000000aa";
  const invite = (n: Record<string, unknown> = {}) => ({ id: "b1000000-0000-4000-8000-000000000001", type: "cohost_invite", title: "Co-host invitation", body: "You are invited to co-host: Night of Worship", data: { event_id: EV, invited_by: "x" }, read: false, created_at: new Date(FIXED_NOW - 3_600_000).toISOString(), ...n });

  test("the invitation shows Accept and Decline; Accept sends my event id, shows the sentence and marks the notification read", async ({ page }) => {
    const db = newDb();
    db.notifications = [invite()];
    db.cohosts = [{ event_id: EV, contributor_id: CITIZEN.id, status: "invited" }];
    await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page, 1);
    await goTo(page, "notifications");
    const accept = page.locator("[data-cohost-accept]");
    await expect(accept).toBeVisible({ timeout: 15_000 });
    expect(db.log.some((l) => l.startsWith("GET event_cohosts") && l.includes(`contributor_id=eq.${CITIZEN.id}`))).toBe(true);
    await accept.click();
    await expect(page.locator("[data-cohost-invite-state='accepted']")).toHaveText("You are co-hosting this event.");
    expect(db.bodies).toEqual([{ fn: "respond_event_cohost", body: { p_event_id: EV, p_accept: true } }]);
    await expect.poll(() => db.patches.length).toBeGreaterThan(0);
    expect(db.patches[0]).toEqual({ id: "b1000000-0000-4000-8000-000000000001" });
  });

  test("Decline sends accept=false", async ({ page }) => {
    const db = newDb();
    db.notifications = [invite()];
    db.cohosts = [{ event_id: EV, contributor_id: CITIZEN.id, status: "invited" }];
    await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page, 1);
    await goTo(page, "notifications");
    await page.locator("[data-cohost-decline]").click({ timeout: 15_000 });
    await expect(page.locator("[data-cohost-invite-state='declined']")).toBeVisible();
    expect(db.bodies).toEqual([{ fn: "respond_event_cohost", body: { p_event_id: EV, p_accept: false } }]);
  });

  test("control: an invitation already answered, and an ordinary notification, have no buttons", async ({ page }) => {
    const db = newDb();
    db.notifications = [invite(), invite({ id: "b1000000-0000-4000-8000-000000000002", type: "event_update", title: "Event updated", body: "The time changed", data: { event_id: EV } })];
    db.cohosts = [{ event_id: EV, contributor_id: CITIZEN.id, status: "accepted" }];
    await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page, 1);
    await goTo(page, "notifications");
    await expect(page.locator("[data-cohost-invite-state='accepted']")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Event updated")).toBeVisible();
    await expect(page.locator("[data-cohost-accept]")).toHaveCount(0);
    await expect(page.locator("[data-cohost-invite-actions]")).toHaveCount(0);
  });

  test("the organiser: Co-hosts on a live event opens the panel, a search finds another Contributor, Invite sends the exact call, Withdraw takes it back", async ({ page }) => {
    const db = newDb();
    const seed = seed0();
    const me = seed.contributors[0];
    const ev = { id: EV, title: "Night of Worship", description: "x", date: new Date(FIXED_NOW + 5 * 86_400_000).toISOString(), end_time: new Date(FIXED_NOW + 5 * 86_400_000 + 7_200_000).toISOString(), location: "Hatfield", category: "church-services", image_url: null, latitude: -25.74, longitude: 28.22, created_by: me.id, created_at: new Date(FIXED_NOW).toISOString(), status: "published", visibility: "public" };
    db.ownEvents = [ev];
    seed.events = [ev as unknown as E];
    await openAs(page, { id: me.id, email: "owner@signedin.example", fullName: me.full_name }, { role: "contributor", contributor_status: "approved" }, db, seed);
    await openMapSignedIn(page, 1);
    await goTo(page, "dashboard");
    await page.getByRole("button", { name: /^events$/i }).click();
    const toggle = page.locator(`[data-cohosts-toggle="${EV}"]`);
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const panel = page.locator(`[data-cohosts-panel="${EV}"]`);
    await expect(panel).toContainText("Co-hosts (0 of 3)");
    const other = seed.contributors[1];
    await panel.locator("[data-cohost-search]").fill("fellowship 2");
    await expect(panel.locator("[data-cohost-results] li")).toHaveCount(1);
    await panel.locator(`[data-cohost-invite="${other.id}"]`).click();
    await expect(panel.locator(`[data-cohost-row="${other.id}"] [data-cohost-status]`)).toHaveText("Invited");
    expect(db.bodies).toEqual([{ fn: "invite_event_cohost", body: { p_event_id: EV, p_contributor_id: other.id } }]);
    await panel.locator(`[data-cohost-remove="${other.id}"]`).click();
    await expect(panel.locator("[data-cohost-row]")).toHaveCount(0);
    expect(db.bodies[1]).toEqual({ fn: "remove_event_cohost", body: { p_event_id: EV, p_contributor_id: other.id } });
    await toggle.click();
    await expect(panel).toHaveCount(0);
  });
});

// P2-05 (migration 188): the Contributor's own "Post a note" box. What the DATABASE allows is proved by
// docs/audit/probes/188_moments.probe.sql; here the stand-in checks what the app sends and how it reads each answer.
test.describe("Moments, signed in: Post a note", () => {
  const OWNER = { role: "contributor", contributor_status: "approved" };
  const live = (n: number, body: string, contributorId: string): MomentRow => ({
    id: `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, contributor_id: contributorId, body, image_url: null,
    created_at: new Date(FIXED_NOW - n * 600_000).toISOString(), expires_at: new Date(FIXED_NOW + 20 * 3_600_000).toISOString(),
  });
  async function openBox(page: Page, db: Db) {
    const seed = seed0();
    const me = seed.contributors[0];
    await openAs(page, { id: me.id, email: "owner@signedin.example", fullName: me.full_name }, OWNER, db, seed);
    await openMapSignedIn(page, 1);
    await goTo(page, "dashboard");
    await page.getByRole("button", { name: /^news$/i }).click();
    await expect(page.locator("[data-moments-box]")).toBeVisible({ timeout: 15_000 });
    return me;
  }

  test("the box is on the News tab, counts what is left, and Post stays off for an empty or too-long note", async ({ page }) => {
    await openBox(page, newDb());
    const text = page.locator("[data-moments-text]");
    const post = page.locator("[data-moments-post]");
    await expect(page.locator("[data-moments-count]")).toHaveText("280 left");
    await expect(post).toBeDisabled();
    await text.fill("   ");
    await expect(post).toBeDisabled();
    await text.fill("x".repeat(100));
    await expect(page.locator("[data-moments-count]")).toHaveText("180 left");
    await expect(post).toBeEnabled();
    await text.fill("x".repeat(280));
    await expect(page.locator("[data-moments-count]")).toHaveText("0 left");
    await expect(post).toBeEnabled();
    await text.fill("x".repeat(285));
    await expect(page.locator("[data-moments-count]")).toHaveText("5 too many");
    await expect(page.locator("[data-moments-count]")).toHaveAttribute("data-moments-count", "over");
    await expect(post).toBeDisabled();
  });

  test("Post sends ONE row (my id, the text, no picture, no expiry), clears the box, lists the note and says it clears itself after a day", async ({ page }) => {
    const db = newDb();
    const me = await openBox(page, db);
    await page.locator("[data-moments-text]").fill("  Prayer walk tonight at the north gate.  ");
    await page.locator("[data-moments-post]").click();
    await expect(page.locator("[data-moments-list] [data-moment-body]")).toHaveText(["Prayer walk tonight at the north gate."]);
    await expect(page.locator("[data-moments-text]")).toHaveValue("");
    expect(db.log.filter((l) => l.startsWith("POST moments"))).toEqual([`POST moments ${JSON.stringify({ contributor_id: me.id, body: "Prayer walk tonight at the north gate.", image_url: null })}`]);
    await expect(page.getByText("Your note is up. It clears itself after a day.")).toBeVisible();
  });

  test("my own live notes are listed (only mine, only live), and Take down deletes exactly that one", async ({ page }) => {
    const db = newDb();
    const seed = seed0();
    const me = seed.contributors[0];
    db.moments = [
      live(1, "Mine, newest", me.id), live(2, "Mine, older", me.id),
      { ...live(3, "Mine, ended", me.id), expires_at: new Date(FIXED_NOW - 1000).toISOString() },
      live(4, "Someone else's", seed.contributors[1].id),
    ];
    await openAs(page, { id: me.id, email: "owner@signedin.example", fullName: me.full_name }, OWNER, db, seed);
    await openMapSignedIn(page, 1);
    await goTo(page, "dashboard");
    await page.getByRole("button", { name: /^news$/i }).click();
    await expect(page.locator("[data-moments-list] [data-moment-body]")).toHaveText(["Mine, newest", "Mine, older"]);
    expect(db.log.some((l) => l.startsWith("GET moments") && l.includes(`contributor_id=eq.${me.id}`) && l.includes("expires_at=gt."))).toBe(true);
    await page.locator(`[data-moment-takedown="${live(2, "", me.id).id}"]`).click();
    await expect(page.locator("[data-moments-list] [data-moment-body]")).toHaveText(["Mine, newest"]);
    expect(db.log.filter((l) => l.startsWith("DELETE moments"))).toEqual([`DELETE moments ?id=eq.${live(2, "", me.id).id}`]);
    expect(db.moments.map((r) => r.id)).toContain(live(4, "", me.id).id);   // nobody else's note was touched
  });

  test("the ceiling: with five notes up the box is replaced by the reason; if the database refuses a sixth the person is told", async ({ page }) => {
    const db = newDb();
    const seed = seed0();
    const me = seed.contributors[0];
    db.moments = [1, 2, 3, 4].map((n) => live(n, `Note ${n}`, me.id));
    await openAs(page, { id: me.id, email: "owner@signedin.example", fullName: me.full_name }, OWNER, db, seed);
    await openMapSignedIn(page, 1);
    await goTo(page, "dashboard");
    await page.getByRole("button", { name: /^news$/i }).click();
    await expect(page.locator("[data-moments-list] li")).toHaveCount(4);
    db.momentsFail = { status: 400, body: { code: "P0001", message: "moments_limit", details: null, hint: null } };   // another device filled the fifth slot meanwhile
    await page.locator("[data-moments-text]").fill("A fifth note");
    await page.locator("[data-moments-post]").click();
    await expect(page.getByText("You already have 5 notes up. Take one down to post another.")).toBeVisible();
    db.momentsFail = undefined;
    db.moments.push(live(5, "Note 5", me.id));
    await page.reload();                                         // the address is /dashboard/news: the Dashboard comes back
    await expect(page.locator('[data-screen="dashboard"]')).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^news$/i }).click();
    await expect(page.locator("[data-moments-full]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-moments-text]")).toHaveCount(0);
  });

  test("any other failure is said plainly and the typed note is kept", async ({ page }) => {
    const db = newDb();
    await openBox(page, db);
    db.momentsFail = { status: 500, body: { message: "boom" } };
    await page.locator("[data-moments-text]").fill("Keep me");
    await page.locator("[data-moments-post]").click();
    await expect(page.getByText("We could not post your note. Please try again.")).toBeVisible();
    await expect(page.locator("[data-moments-text]")).toHaveValue("Keep me");
  });

  test("the attention test: the box never shows a time left, a countdown, a view count or who saw a note", async ({ page }) => {
    const db = newDb();
    const seed = seed0();
    const me = seed.contributors[0];
    db.moments = [live(1, "Doors open at nine", me.id)];     // 20 hours of life left in the data; the screen must not say so
    await openAs(page, { id: me.id, email: "owner@signedin.example", fullName: me.full_name }, OWNER, db, seed);
    await openMapSignedIn(page, 1);
    await goTo(page, "dashboard");
    await page.getByRole("button", { name: /^news$/i }).click();
    const box = page.locator("[data-moments-box]");
    await expect(box).toContainText("This clears itself after a day.");
    const text = (await box.innerText()).toLowerCase().replace(/\d+ (left|too many)/g, "");   // the character counter is the one "left"
    expect(text).not.toMatch(/expire|countdown|remaining|\bseen\b|\bviews?\b|viewed|reach|hours? (left|to go)|ends in/);
    await expect(box.locator("[role='progressbar'], progress, time")).toHaveCount(0);
  });
});

// P2-04 (migration 187): a Contributor you follow published an event or a news post. The rows are written by the database
// (probe docs/audit/probes/187_*); this is the screen that reads them. No count, no streak, no "you missed".
test.describe("Follower notifications, signed in", () => {
  const note = (n: Record<string, unknown>) => ({ id: "b2000000-0000-4000-8000-000000000001", read: false, created_at: new Date(FIXED_NOW - 3_600_000).toISOString(), ...n });

  test("a followed event opens that event; a followed news post opens that Contributor; both are tappable rows", async ({ page }) => {
    const db = newDb();
    const seed = seed0();
    const ev = seed.events[0];
    const c = seed.contributors[0];
    db.notifications = [
      note({ type: "followed_new_event", title: "New event from Alpha", body: ev.title, data: { event_id: ev.id, post_id: ev.id, contributor_id: c.id } }),
      note({ id: "b2000000-0000-4000-8000-000000000002", type: "followed_new_news", title: "New update from Alpha", body: "A news title", data: { post_id: "p1", contributor_id: c.id } }),
    ];
    await openAs(page, CITIZEN, CITIZEN_PROFILE, db, seed);
    await openMapSignedIn(page, 1);
    await goTo(page, "notifications");
    const rows = page.locator("[data-screen='notifications'] [role='button']");
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator("[data-notif='news']")).toHaveCount(1);   // each kind lands in its own display bucket (icon)
    await expect(page.locator("[data-notif='event']")).toHaveCount(1);
    await page.getByText("New update from Alpha").click();
    await expect(page).toHaveURL(new RegExp(`/c/${c.contributor_slug}`), { timeout: 15_000 });
    await goTo(page, "notifications");
    await page.getByText("New event from Alpha").click();
    await expect(page).toHaveURL(new RegExp(`/e/${ev.id}`), { timeout: 15_000 });
    expect(db.patches.length).toBeGreaterThan(0);       // opening a row marks it read
  });

  test("control: a news notification with a bad Contributor id is shown but not a button, and nothing else changes", async ({ page }) => {
    const db = newDb();
    db.notifications = [note({ type: "followed_new_news", title: "New update from Beta", body: "x", data: { post_id: "p2", contributor_id: "not-a-uuid" } })];
    await openAs(page, CITIZEN, CITIZEN_PROFILE, db);
    await openMapSignedIn(page, 1);
    await goTo(page, "notifications");
    await expect(page.getByText("New update from Beta")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-screen='notifications'] [role='button']")).toHaveCount(0);
  });

  test("Settings says the switch also covers new events and news from Contributors you follow", async ({ page }) => {
    await openAs(page, CITIZEN, CITIZEN_PROFILE, newDb());
    await openMapSignedIn(page, 1);
    await goTo(page, "settings");
    await expect(page.getByText("New events and news from Contributors you follow")).toBeVisible({ timeout: 15_000 });
  });
});
