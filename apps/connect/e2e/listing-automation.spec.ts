import { test, expect, type Page, type Route } from "@playwright/test";
import { FAKE_PROJECT, FAKE_PROJECT_CORS, mockAppShell, signInToFakeProject, type FakeUser } from "./support/fake-project";

// ════════════════════════════════════════════════════════════════════
//  Listing automation, owner side (mig 181): the Profile tab's "Automatic
//  updates" card and the Dashboard's "Suggestions" inbox.
//
//  The database is a small stateful fake of exactly what the migration adds:
//  get_my_automation_settings / set_my_automation_level / decide_listing_suggestion
//  and the listing_sources / listing_suggestions tables (plus the events and
//  news_posts inserts a "Publish" makes). The point is to check what the browser
//  SENDS, not just what it shows: the event row, the news row, the RPC arguments.
// ════════════════════════════════════════════════════════════════════

test.use({ bypassCSP: true });

const MEMBER: FakeUser = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  email: "owner@automation.example",
  fullName: "Automation Owner",
};
const SRC_WEB = "c0000000-0000-4000-8000-000000000001";
const SRC_FB = "c0000000-0000-4000-8000-000000000002";
const SUG_EVENT = "d0000000-0000-4000-8000-000000000001";
const SUG_NEWS = "d0000000-0000-4000-8000-000000000002";
const SUG_PROFILE = "d0000000-0000-4000-8000-000000000003";
const SUG_AUTO = "d0000000-0000-4000-8000-000000000004";
const AUTO_EVENT = "e0000000-0000-4000-8000-000000000009";

type Row = Record<string, unknown>;
type Db = {
  level: "off" | "suggest" | "events_auto";
  consentAt: string | null;
  consentSource: string | null;
  sources: Row[];
  suggestions: Row[];
  events: Row[];
  news: Row[];
  calls: { fn: string; body: Row }[];
  unavailable: boolean;
  /** Suggestion ids whose dismissal the fake database refuses. */
  failDismiss: string[];
  /** When set, the edit route answers 422 with this reason (or 409 for not_pending) and stores nothing. */
  editRefusal: string | null;
};

const inDays = (d: number) => {
  const t = new Date(Date.now() + d * 86_400_000);
  t.setMinutes(0, 0, 0);
  return t;
};

function seed(over: Partial<Db> = {}): Db {
  const start = inDays(5);
  return {
    level: "suggest",
    consentAt: "2026-10-01T10:00:00.000Z",
    consentSource: "google_form",
    sources: [
      {
        id: SRC_WEB,
        kind: "website",
        url: "https://www.church.example/",
        enabled: true,
        last_checked_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        last_status: "3 items read",
        created_at: "2026-10-01T10:00:00Z",
      },
      {
        id: SRC_FB,
        kind: "facebook",
        url: "https://www.facebook.com/gracechurch",
        enabled: false,
        last_checked_at: null,
        last_status: null,
        created_at: "2026-10-01T10:00:01Z",
      },
    ],
    suggestions: [
      {
        id: SUG_EVENT,
        kind: "event",
        status: "pending",
        published_ref: null,
        created_at: "2026-10-03T08:00:00Z",
        decided_at: null,
        source_url: "https://www.church.example/events",
        payload: {
          title: "Sunday Celebration",
          description: "Join us for worship.",
          start: start.toISOString(),
          end: null,
          location: "12 Church Street, Pretoria",
          category: "church-services",
          website_url: null,
        },
      },
      {
        id: SUG_NEWS,
        kind: "news",
        status: "pending",
        published_ref: null,
        created_at: "2026-10-03T08:01:00Z",
        decided_at: null,
        source_url: "https://www.church.example/news/1",
        payload: {
          title: "New building opens",
          body: "We open our doors on Sunday.",
          link: "https://www.church.example/news/1",
          post_date: "2026-10-03",
        },
      },
      {
        id: SUG_PROFILE,
        kind: "profile",
        status: "pending",
        published_ref: null,
        created_at: "2026-10-03T08:02:00Z",
        decided_at: null,
        source_url: "https://www.church.example/about",
        payload: { field: "bio", value: "We serve Pretoria with love." },
      },
      {
        id: SUG_AUTO,
        kind: "event",
        status: "auto_published",
        published_ref: AUTO_EVENT,
        created_at: "2026-10-02T08:00:00Z",
        decided_at: "2026-10-02T08:00:01Z",
        source_url: "https://www.church.example/youth",
        payload: {
          title: "Youth Night",
          description: "",
          start: inDays(9).toISOString(),
          end: null,
          location: "The Hall",
          category: "church-services",
          website_url: null,
        },
      },
    ],
    events: [],
    news: [],
    calls: [],
    unavailable: false,
    failDismiss: [],
    editRefusal: null,
    ...over,
  };
}

async function openOwner(page: Page, db: Db, path = "/dashboard/suggestions") {
  await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
  await page.route("**/api/contributor/claim", (r: Route) => r.fulfill({ status: 404, json: { error: "nothing_to_claim" } }));
  await signInToFakeProject(page, {
    user: MEMBER,
    profile: { role: "contributor", contributor_status: "approved" },
  });

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body, headers: FAKE_PROJECT_CORS });
  const empty = (route: Route, status = 204) => route.fulfill({ status, headers: FAKE_PROJECT_CORS, body: "" });
  const idOf = (route: Route) => new URL(route.request().url()).searchParams.get("id")?.replace(/^eq\./, "");
  const wantsObject = (route: Route) => (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
  const body = (route: Route) => (route.request().postDataJSON() ?? {}) as Row;
  let n = 0;

  await page.route(`${FAKE_PROJECT}/rest/v1/rpc/get_my_automation_settings`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    db.calls.push({ fn: "get_my_automation_settings", body: {} });
    if (db.unavailable) return json(route, { message: "function not found" }, 404);
    return json(route, {
      success: true,
      level: db.level,
      consent_at: db.consentAt,
      consent_source: db.consentSource,
    });
  });
  await page.route(`${FAKE_PROJECT}/rest/v1/rpc/set_my_automation_level`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const b = body(route);
    db.calls.push({ fn: "set_my_automation_level", body: b });
    const wasOff = db.level === "off";
    db.level = b._level as Db["level"];
    db.consentAt = new Date().toISOString();
    db.consentSource = "dashboard";
    if (db.level === "off") {
      db.sources.forEach((s) => (s.enabled = false));
      db.suggestions.filter((s) => s.status === "pending").forEach((s) => (s.status = "dismissed"));
    } else if (wasOff) {
      db.sources.filter((s) => ["website", "youtube", "calendar"].includes(s.kind as string)).forEach((s) => (s.enabled = true));
    }
    return json(route, { success: true, level: db.level });
  });
  await page.route(`${FAKE_PROJECT}/rest/v1/rpc/decide_listing_suggestion`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const b = body(route);
    db.calls.push({ fn: "decide_listing_suggestion", body: b });
    const s = db.suggestions.find((x) => x.id === b._id);
    if (!s) return json(route, { success: false, reason: "not_found" });
    if (b._action === "dismiss" && db.failDismiss.includes(String(b._id))) return json(route, { success: false, reason: "boom" });
    if (b._action === "dismiss" && s.status !== "pending") return json(route, { success: false, reason: "not_pending" });
    if (b._action === "dismiss") s.status = "dismissed";
    else if (b._action === "published") {
      s.status = "published";
      s.published_ref = b._ref ?? null;
    } else if (b._action === "unpublish") s.status = "dismissed";
    return json(route, { success: true });
  });

  // The edit route (PATCH /api/automation/suggestions/:id): the browser sends only what changed, with its own token.
  await page.route("**/api/automation/suggestions/*", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const id = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const edits = ((body(route).edits ?? {}) as Row);
    db.calls.push({ fn: "PATCH suggestion", body: { id, edits, authorization: route.request().headers().authorization ?? "" } });
    if (db.editRefusal) {
      return route.fulfill({ status: db.editRefusal === "not_pending" ? 409 : 422, json: { error: db.editRefusal } });
    }
    const s = db.suggestions.find((x) => x.id === id);
    if (!s) return route.fulfill({ status: 404, json: { error: "not_found" } });
    s.payload = { ...(s.payload as Row), ...edits };
    return route.fulfill({ json: { ok: true, payload: s.payload, warnings: [] } });
  });

  await page.route(`${FAKE_PROJECT}/rest/v1/listing_sources**`, (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fallback();
    if (db.unavailable) return json(route, { message: "relation does not exist" }, 404);
    if (method === "GET") return json(route, db.sources);
    if (method === "POST") {
      const row = {
        id: `c0000000-0000-4000-8000-0000000001${String(++n).padStart(2, "0")}`,
        last_checked_at: null,
        last_status: null,
        created_at: new Date().toISOString(),
        ...body(route),
      };
      db.calls.push({ fn: "insert listing_sources", body: row });
      db.sources.push(row);
      return empty(route, 201);
    }
    if (method === "PATCH") {
      db.calls.push({ fn: "update listing_sources", body: { id: idOf(route), ...body(route) } });
      Object.assign(db.sources.find((s) => s.id === idOf(route)) ?? {}, body(route));
      return empty(route);
    }
    if (method === "DELETE") {
      db.calls.push({ fn: "delete listing_sources", body: { id: idOf(route) } });
      db.sources = db.sources.filter((s) => s.id !== idOf(route));
      return empty(route);
    }
    return route.fallback();
  });
  await page.route(`${FAKE_PROJECT}/rest/v1/listing_suggestions**`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    if (db.unavailable) return json(route, { message: "relation does not exist" }, 404);
    return json(route, db.suggestions);
  });
  await page.route(`${FAKE_PROJECT}/rest/v1/events**`, (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fallback();
    if (method === "POST") {
      const row = {
        id: `e0000000-0000-4000-8000-0000000002${String(++n).padStart(2, "0")}`,
        created_at: new Date().toISOString(),
        status: "published",
        visibility: "public",
        ...body(route),
      };
      db.calls.push({ fn: "insert events", body: row });
      db.events.push(row);
      return json(route, wantsObject(route) ? row : [row], 201);
    }
    if (method === "PATCH") {
      db.calls.push({ fn: "update events", body: { id: idOf(route), ...body(route) } });
      return empty(route);
    }
    return json(route, wantsObject(route) ? {} : db.events);
  });
  await page.route(`${FAKE_PROJECT}/rest/v1/news_posts**`, (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fallback();
    if (method === "POST") {
      const row = {
        id: `f0000000-0000-4000-8000-0000000003${String(++n).padStart(2, "0")}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body(route),
      };
      db.calls.push({ fn: "insert news_posts", body: row });
      db.news.push(row);
      return json(route, wantsObject(route) ? row : [row], 201);
    }
    return json(route, wantsObject(route) ? {} : db.news);
  });

  await page.goto(path);
}

const callsTo = (db: Db, fn: string) => db.calls.filter((c) => c.fn === fn);
const card = (page: Page, kind: string) => page.locator(`[data-suggestion="${kind}"]`);

test.describe("Suggestions tab", () => {
  test("lists what is waiting, grouped, with the pending count on the tab and a link to where it came from", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await expect(page.getByRole("button", { name: "suggestions (3)", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/dashboard\/suggestions$/);

    // (the stat cards above also say "Events", so look at the group headings)
    await expect(page.locator("p.uppercase").filter({ hasText: /^Events$/ })).toBeVisible();
    await expect(page.getByText("News posts", { exact: true })).toBeVisible();
    await expect(page.getByText("Profile updates", { exact: true })).toBeVisible();
    await expect(card(page, "event").getByText("Sunday Celebration")).toBeVisible();
    await expect(card(page, "news").getByText("New building opens")).toBeVisible();
    await expect(card(page, "profile").getByText("We serve Pretoria with love.")).toBeVisible();

    // Every suggestion says where it came from, and the link is safe to follow.
    const link = card(page, "event").getByRole("link", { name: "From church.example" });
    await expect(link).toHaveAttribute("href", "https://www.church.example/events");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
  });

  test("suggested text is shown as TEXT, never as markup", async ({ page }) => {
    const db = seed();
    (db.suggestions[0].payload as Row).title = "<img src=x onerror=window.__pwned=1>";
    await openOwner(page, db);
    await expect(card(page, "event").getByText("<img src=x onerror=window.__pwned=1>")).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test("Publish creates the event exactly as written, then links the suggestion to it and removes the card", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await card(page, "event").getByRole("button", { name: "Publish" }).click();

    await expect.poll(() => callsTo(db, "insert events").length).toBe(1);
    const row = callsTo(db, "insert events")[0].body;
    expect(row).toMatchObject({
      title: "Sunday Celebration",
      description: "Join us for worship.",
      category: "church-services",
      created_by: MEMBER.id,
    });
    expect(String(row.location)).toContain("12 Church Street, Pretoria");
    const start = (db.suggestions[0].payload as { start: string }).start;
    expect(new Date(String(row.date)).getTime()).toBe(new Date(start).getTime());

    await expect.poll(() => callsTo(db, "decide_listing_suggestion").length).toBe(1);
    expect(callsTo(db, "decide_listing_suggestion")[0].body).toEqual({
      _id: SUG_EVENT,
      _action: "published",
      _ref: db.events[0].id,
    });
    await expect(card(page, "event")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "suggestions (2)", exact: true })).toBeVisible();
  });

  test("Edit changes what is published, and only what is published", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await card(page, "event").getByRole("button", { name: "Edit" }).click();
    await card(page, "event").getByLabel("Title").fill("Sunday Celebration (new venue)");
    await card(page, "event").getByRole("button", { name: "Publish" }).click();

    await expect.poll(() => callsTo(db, "insert events").length).toBe(1);
    expect(callsTo(db, "insert events")[0].body).toMatchObject({
      title: "Sunday Celebration (new venue)",
    });
    // the stored suggestion itself was not rewritten
    expect((db.suggestions[0].payload as { title: string }).title).toBe("Sunday Celebration");
  });

  test("Publish on a news post creates the post with its source line, then clears the suggestion", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await card(page, "news").getByRole("button", { name: "Publish" }).click();
    await expect.poll(() => callsTo(db, "insert news_posts").length).toBe(1);
    const row = callsTo(db, "insert news_posts")[0].body;
    expect(row).toMatchObject({ contributor_id: MEMBER.id, title: "New building opens" });
    expect(String(row.body)).toBe("We open our doors on Sunday.\n\nSource: https://www.church.example/news/1");
    await expect.poll(() => callsTo(db, "decide_listing_suggestion").length).toBe(1);
    expect(callsTo(db, "decide_listing_suggestion")[0].body).toMatchObject({
      _id: SUG_NEWS,
      _action: "published",
      _ref: db.news[0].id,
    });
  });

  test("Dismiss asks the database to dismiss it, and the card goes", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await card(page, "news").getByRole("button", { name: "Dismiss" }).click();
    await expect.poll(() => callsTo(db, "decide_listing_suggestion").length).toBe(1);
    expect(callsTo(db, "decide_listing_suggestion")[0].body).toEqual({
      _id: SUG_NEWS,
      _action: "dismiss",
      _ref: null,
    });
    await expect(card(page, "news")).toHaveCount(0);
    expect(callsTo(db, "insert news_posts")).toHaveLength(0);
  });

  test("an event published automatically is listed with its source and can be unpublished in one tap", async ({ page }) => {
    const db = seed({ level: "events_auto" });
    await openOwner(page, db);
    await expect(page.getByText("Published automatically", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(card(page, "auto").getByText("Youth Night")).toBeVisible();
    await expect(card(page, "auto").getByRole("link", { name: "From church.example" })).toHaveAttribute("href", "https://www.church.example/youth");

    await card(page, "auto").getByRole("button", { name: "Unpublish" }).click();
    await expect.poll(() => callsTo(db, "decide_listing_suggestion").length).toBe(1);
    expect(callsTo(db, "decide_listing_suggestion")[0].body).toEqual({
      _id: SUG_AUTO,
      _action: "unpublish",
      _ref: null,
    });
    // the dashboard's own copy of the event is cancelled too
    await expect.poll(() => callsTo(db, "update events").length).toBe(1);
    expect(callsTo(db, "update events")[0].body).toMatchObject({
      id: AUTO_EVENT,
      status: "cancelled",
    });
    await expect(card(page, "auto")).toHaveCount(0);
  });

  test("with automation off the tab says so and points to the switch; with nothing waiting it explains itself", async ({ page }) => {
    const db = seed({ level: "off", suggestions: [] });
    await openOwner(page, db);
    await expect(page.getByText("Automatic updates are off, so nothing new will arrive.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Nothing is waiting for you")).toBeVisible();
    await page.getByRole("button", { name: "Change your automatic updates" }).click();
    await expect(page).toHaveURL(/\/dashboard\/profile$/);
    await expect(page.locator('[data-card="automatic-updates"]')).toBeVisible();
  });

  test("if the feature is not available yet (the tables are missing) the dashboard still works and says so", async ({ page }) => {
    const db = seed({ unavailable: true });
    await openOwner(page, db);
    await expect(page.getByText("Suggestions are not available right now")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "suggestions", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "events", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible();
  });
});

test.describe("Suggestions tab: choosing several at once", () => {
  const bar = (page: Page) => page.locator('[data-bar="selection"]');
  const count = (page: Page) => bar(page).getByRole("status");
  const confirmBox = (page: Page) => page.locator('[data-confirm="dismiss"]');
  const pick = (page: Page, title: string) => page.getByRole("checkbox", { name: `Select ${title}`, exact: true });
  const dismissCalls = (db: Db) => callsTo(db, "decide_listing_suggestion").filter((c) => c.body._action === "dismiss");

  test("Select all, then Dismiss selected asks first and says how many, then dismisses every one", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await expect(card(page, "event")).toBeVisible({ timeout: 15_000 });
    await expect(count(page)).toHaveText("None selected");
    await expect(bar(page).getByRole("button", { name: /Dismiss selected/ })).toHaveCount(0);

    await page.getByRole("checkbox", { name: "Select all (3)" }).check();
    await expect(count(page)).toHaveText("3 of 3 selected");
    for (const t of ["Sunday Celebration", "New building opens", "Update your About text"]) await expect(pick(page, t)).toBeChecked();

    await bar(page).getByRole("button", { name: "Dismiss selected (3)" }).click();
    await expect(confirmBox(page)).toBeVisible();
    await expect(confirmBox(page).getByText("Dismiss 3 suggestions?", { exact: true })).toBeVisible();
    expect(callsTo(db, "decide_listing_suggestion")).toHaveLength(0); // asking is not doing

    await confirmBox(page).getByRole("button", { name: "Keep them" }).click();
    await expect(confirmBox(page)).toHaveCount(0);
    await expect(count(page)).toHaveText("3 of 3 selected"); // nothing was lost
    expect(callsTo(db, "decide_listing_suggestion")).toHaveLength(0);

    await bar(page).getByRole("button", { name: "Dismiss selected (3)" }).click();
    await confirmBox(page).getByRole("button", { name: "Yes, dismiss 3" }).click();
    await expect.poll(() => dismissCalls(db).length).toBe(3);
    expect(dismissCalls(db).map((c) => c.body)).toEqual(
      expect.arrayContaining([
        { _id: SUG_EVENT, _action: "dismiss", _ref: null },
        { _id: SUG_NEWS, _action: "dismiss", _ref: null },
        { _id: SUG_PROFILE, _action: "dismiss", _ref: null },
      ]),
    );
    await expect(page.getByText("Nothing is waiting for you")).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByText("Dismissed 3 suggestions.")).toBeVisible();
    // Nothing was published or deleted: the rows stay (as dismissed), so their fingerprints still say "already known".
    expect(callsTo(db, "insert events")).toHaveLength(0);
    expect(callsTo(db, "insert news_posts")).toHaveLength(0);
    expect(db.suggestions.filter((s) => s.status === "dismissed").map((s) => s.id).sort()).toEqual([SUG_EVENT, SUG_NEWS, SUG_PROFILE].sort());
    expect(db.suggestions).toHaveLength(4);
  });

  test("a partial selection dismisses only what is ticked, and Select all shows the half-way state", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await pick(page, "Sunday Celebration").check({ timeout: 15_000 });
    await pick(page, "New building opens").check();
    await expect(count(page)).toHaveText("2 of 3 selected");
    await expect(card(page, "event")).toHaveAttribute("data-selected", "true");
    await expect(card(page, "profile")).not.toHaveAttribute("data-selected", "true");
    const all = page.getByRole("checkbox", { name: "Select all (3)" });
    await expect(all).not.toBeChecked();
    expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);

    await bar(page).getByRole("button", { name: "Dismiss selected (2)" }).click();
    await expect(confirmBox(page).getByText("Dismiss 2 suggestions?", { exact: true })).toBeVisible();
    await confirmBox(page).getByRole("button", { name: "Yes, dismiss 2" }).click();
    await expect.poll(() => dismissCalls(db).length).toBe(2);
    expect(dismissCalls(db).map((c) => c.body._id).sort()).toEqual([SUG_EVENT, SUG_NEWS].sort());
    await expect(card(page, "event")).toHaveCount(0);
    await expect(card(page, "news")).toHaveCount(0);
    await expect(card(page, "profile")).toBeVisible();
    await expect(count(page)).toHaveText("None selected");
    expect(db.suggestions.find((s) => s.id === SUG_PROFILE)?.status).toBe("pending");
  });

  test("unticking Select all, or Clear, empties the selection; a changed selection closes an open confirm", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    const all = page.getByRole("checkbox", { name: "Select all (3)" });
    await all.check({ timeout: 15_000 });
    await all.uncheck();
    await expect(count(page)).toHaveText("None selected");

    await pick(page, "Sunday Celebration").check();
    await bar(page).getByRole("button", { name: "Dismiss selected (1)" }).click();
    await expect(confirmBox(page)).toBeVisible();
    await pick(page, "New building opens").check(); // a different question now
    await expect(confirmBox(page)).toHaveCount(0);
    await expect(count(page)).toHaveText("2 of 3 selected");

    await bar(page).getByRole("button", { name: "Clear" }).click();
    await expect(count(page)).toHaveText("None selected");
    expect(callsTo(db, "decide_listing_suggestion")).toHaveLength(0);
  });

  test("a card dismissed on its own drops out of the selection, so the count never mentions it", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await pick(page, "New building opens").check({ timeout: 15_000 });
    await pick(page, "Update your About text").check();
    await expect(count(page)).toHaveText("2 of 3 selected");
    await card(page, "news").getByRole("button", { name: "Dismiss" }).click();
    await expect(card(page, "news")).toHaveCount(0);
    await expect(count(page)).toHaveText("1 of 2 selected");
    await expect(bar(page).getByRole("button", { name: "Dismiss selected (1)" })).toBeVisible();
  });

  test("when one dismissal fails, the others still go and only the failed one stays selected", async ({ page }) => {
    const db = seed({ failDismiss: [SUG_NEWS] });
    await openOwner(page, db);
    await page.getByRole("checkbox", { name: "Select all (3)" }).check({ timeout: 15_000 });
    await bar(page).getByRole("button", { name: "Dismiss selected (3)" }).click();
    await confirmBox(page).getByRole("button", { name: "Yes, dismiss 3" }).click();
    await expect.poll(() => dismissCalls(db).length).toBe(3);
    await expect(page.getByText("Dismissed 2 of 3. 1 is still selected. Please try again.")).toBeVisible();
    await expect(card(page, "event")).toHaveCount(0);
    await expect(card(page, "news")).toBeVisible();
    await expect(pick(page, "New building opens")).toBeChecked();
    await expect(count(page)).toHaveText("1 of 1 selected");
  });

  test("a suggestion already decided somewhere else counts as gone, not as a failure", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await page.getByRole("checkbox", { name: "Select all (3)" }).check({ timeout: 15_000 });
    // another tab or an editor dismisses one while this tab still lists it
    db.suggestions.find((s) => s.id === SUG_PROFILE)!.status = "dismissed";
    await bar(page).getByRole("button", { name: "Dismiss selected (3)" }).click();
    await confirmBox(page).getByRole("button", { name: "Yes, dismiss 3" }).click();
    await expect(page.getByText("Dismissed 3 suggestions.")).toBeVisible();
    await expect(page.getByText("Nothing is waiting for you")).toBeVisible();
  });

  test("works from the keyboard alone, with the count announced politely and Escape to back out", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    await expect(card(page, "event")).toBeVisible({ timeout: 15_000 });
    await expect(count(page)).toHaveAttribute("aria-live", "polite");

    await pick(page, "Sunday Celebration").focus();
    await page.keyboard.press("Space");
    await expect(pick(page, "Sunday Celebration")).toBeChecked();
    await expect(count(page)).toHaveText("1 of 3 selected");

    const open = bar(page).getByRole("button", { name: "Dismiss selected (1)" });
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(confirmBox(page).getByRole("button", { name: "Yes, dismiss 1" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmBox(page)).toHaveCount(0);
    await expect(open).toBeFocused();
    expect(callsTo(db, "decide_listing_suggestion")).toHaveLength(0);

    await page.keyboard.press("Enter");
    await expect(confirmBox(page).getByText("Dismiss 1 suggestion?", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter"); // the focused confirm button
    await expect.poll(() => dismissCalls(db).length).toBe(1);
    await expect(card(page, "event")).toHaveCount(0);
  });

  test("on a 375 px phone every control is at least 44 px square and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const db = seed();
    await openOwner(page, db);
    await pick(page, "Sunday Celebration").check({ timeout: 15_000 });
    await bar(page).getByRole("button", { name: "Dismiss selected (1)" }).click();

    const targets = {
      "card checkbox": pick(page, "Sunday Celebration").locator("xpath=ancestor::label[1]"),
      "select all": page.getByRole("checkbox", { name: "Select all (3)" }).locator("xpath=ancestor::label[1]"),
      "dismiss selected": bar(page).getByRole("button", { name: "Dismiss selected (1)" }),
      clear: bar(page).getByRole("button", { name: "Clear" }),
      "yes, dismiss": confirmBox(page).getByRole("button", { name: "Yes, dismiss 1" }),
      "keep them": confirmBox(page).getByRole("button", { name: "Keep them" }),
      publish: card(page, "event").getByRole("button", { name: "Publish" }),
      edit: card(page, "event").getByRole("button", { name: "Edit" }),
      dismiss: card(page, "event").getByRole("button", { name: "Dismiss" }),
    };
    for (const [name, loc] of Object.entries(targets)) {
      const box = await loc.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(43.5);
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(43.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("Suggestions tab: editing before publishing", () => {
  const patches = (db: Db) => callsTo(db, "PATCH suggestion");
  const inputs = (page: Page, kind: string) => card(page, kind);

  test("Save changes keeps the edit on the card without publishing it, and the server is asked with the owner's own token", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    const c = card(page, "event");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await expect(c.getByRole("button", { name: "Save changes" })).toBeDisabled(); // nothing changed yet
    await expect(c.getByLabel("Title")).toBeFocused();

    await c.getByLabel("Title").fill("Sunday Celebration (new venue)");
    await c.getByLabel("Where").fill("The Hall, 4 Main Road");
    await c.getByLabel("Date").fill("2026-11-01");
    await c.getByLabel("Time").fill("18:30");
    await c.getByRole("button", { name: "Save changes" }).click();

    await expect.poll(() => patches(db).length).toBe(1);
    expect(patches(db)[0].body).toMatchObject({
      id: SUG_EVENT,
      authorization: expect.stringMatching(/^Bearer .{10,}/),
      edits: {
        title: "Sunday Celebration (new venue)",
        location: "The Hall, 4 Main Road",
        start: new Date(2026, 10, 1, 18, 30).toISOString(),
      },
    });
    // nothing else was sent: not the description (unchanged), not the category
    expect(Object.keys((patches(db)[0].body.edits as Row) ?? {}).sort()).toEqual(["location", "start", "title"]);

    // still waiting, still on the card, form closed, focus back on Edit
    await expect(c.getByText("Sunday Celebration (new venue)")).toBeVisible();
    await expect(c.getByLabel("Title")).toHaveCount(0);
    await expect(c.getByRole("button", { name: "Edit" })).toBeFocused();
    await expect(page.getByText("Saved. It is still waiting for you to publish or dismiss.")).toBeVisible();
    expect(callsTo(db, "insert events")).toHaveLength(0);
    expect(callsTo(db, "decide_listing_suggestion")).toHaveLength(0);
    expect(db.suggestions.find((s) => s.id === SUG_EVENT)?.status).toBe("pending");
    await expect(page.getByRole("button", { name: "suggestions (3)", exact: true })).toBeVisible();
  });

  test("a saved edit can be published later, exactly as saved", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    const c = card(page, "event");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await c.getByLabel("Title").fill("Sunday Celebration (new venue)");
    await c.getByLabel("Date").fill("2026-11-01");
    await c.getByLabel("Time").fill("18:30");
    await c.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved. It is still waiting")).toBeVisible();

    await c.getByRole("button", { name: "Publish" }).click();
    await expect.poll(() => callsTo(db, "insert events").length).toBe(1);
    const row = callsTo(db, "insert events")[0].body;
    expect(row).toMatchObject({ title: "Sunday Celebration (new venue)", created_by: MEMBER.id });
    expect(new Date(String(row.date)).getTime()).toBe(new Date(2026, 10, 1, 18, 30).getTime());
    await expect.poll(() => callsTo(db, "decide_listing_suggestion").length).toBe(1);
    expect(callsTo(db, "decide_listing_suggestion")[0].body).toMatchObject({ _id: SUG_EVENT, _action: "published" });
  });

  test("a saved edit can be dismissed later too", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    const c = card(page, "news");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await c.getByLabel("Post").fill("We open our doors on Sunday at nine.");
    await c.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => patches(db).length).toBe(1);
    expect(patches(db)[0].body.edits).toEqual({ body: "We open our doors on Sunday at nine." });
    await expect(c.getByText("We open our doors on Sunday at nine.")).toBeVisible();

    await c.getByRole("button", { name: "Dismiss" }).click();
    await expect.poll(() => callsTo(db, "decide_listing_suggestion").length).toBe(1);
    expect(callsTo(db, "decide_listing_suggestion")[0].body).toEqual({ _id: SUG_NEWS, _action: "dismiss", _ref: null });
    await expect(c).toHaveCount(0);
  });

  test("Publish from the open form publishes what is typed, even before it is saved (a new time moves the end with it)", async ({ page }) => {
    const db = seed();
    const start = new Date(2026, 10, 1, 9, 0);
    const payload = db.suggestions[0].payload as Row;
    payload.start = start.toISOString();
    payload.end = new Date(2026, 10, 1, 11, 0).toISOString();
    await openOwner(page, db);
    const c = card(page, "event");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await c.getByLabel("Time").fill("18:00");
    await c.getByRole("button", { name: "Publish" }).click();
    await expect.poll(() => callsTo(db, "insert events").length).toBe(1);
    const row = callsTo(db, "insert events")[0].body;
    expect(new Date(String(row.date)).getTime()).toBe(new Date(2026, 10, 1, 18, 0).getTime());
    expect(new Date(String(row.end_time)).getTime()).toBe(new Date(2026, 10, 1, 20, 0).getTime());
    expect(patches(db)).toHaveLength(0);
  });

  test("Cancel (or Escape) throws the draft away and sends nothing", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    const c = card(page, "event");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await c.getByLabel("Title").fill("Something else entirely");
    await c.getByRole("button", { name: "Cancel" }).click();
    await expect(c.getByText("Sunday Celebration")).toBeVisible();
    await expect(c.getByLabel("Title")).toHaveCount(0);
    await expect(c.getByRole("button", { name: "Edit" })).toBeFocused();

    await c.getByRole("button", { name: "Edit" }).click();
    await expect(c.getByLabel("Title")).toHaveValue("Sunday Celebration"); // the draft did not survive
    await c.getByLabel("Title").fill("Another try");
    await page.keyboard.press("Escape");
    await expect(c.getByLabel("Title")).toHaveCount(0);
    expect(patches(db)).toHaveLength(0);
  });

  test("a refusal from the server is shown on the card, in words, and nothing changes", async ({ page }) => {
    const db = seed({ editRefusal: "event_title_required" });
    await openOwner(page, db);
    const c = card(page, "event");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await c.getByLabel("Title").fill("ab");
    await c.getByRole("button", { name: "Save changes" }).click();
    await expect(c.getByRole("alert")).toHaveText("Please give it a title of at least 3 letters.");
    await expect(c.getByLabel("Title")).toHaveValue("ab"); // what was typed is kept for another try
    expect((db.suggestions[0].payload as Row).title).toBe("Sunday Celebration");
    // typing again clears the message
    await c.getByLabel("Title").fill("abc");
    await expect(c.getByRole("alert")).toHaveCount(0);
  });

  test("if it was dealt with elsewhere, the card says so and leaves the list", async ({ page }) => {
    const db = seed({ editRefusal: "not_pending" });
    await openOwner(page, db);
    const c = card(page, "news");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await c.getByLabel("Title").fill("A better headline");
    db.suggestions.find((s) => s.id === SUG_NEWS)!.status = "dismissed";
    await c.getByRole("button", { name: "Save changes" }).click();
    await expect(card(page, "news")).toHaveCount(0);
  });

  test("a profile suggestion's text can be edited and saved too", async ({ page }) => {
    const db = seed();
    await openOwner(page, db);
    const c = card(page, "profile");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    await c.getByLabel("About text", { exact: true }).fill("We serve the whole city with love.");
    await c.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => patches(db).length).toBe(1);
    expect(patches(db)[0].body).toMatchObject({ id: SUG_PROFILE, edits: { value: "We serve the whole city with love." } });
    await expect(c.getByText("We serve the whole city with love.")).toBeVisible();
  });

  test("on a 375 px phone the form fits, with 44 px fields and buttons", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const db = seed();
    await openOwner(page, db);
    const c = card(page, "event");
    await c.getByRole("button", { name: "Edit" }).click({ timeout: 15_000 });
    for (const [name, loc] of Object.entries({
      title: c.getByLabel("Title"),
      date: c.getByLabel("Date"),
      time: c.getByLabel("Time"),
      where: c.getByLabel("Where"),
      save: c.getByRole("button", { name: "Save changes" }),
      cancel: c.getByRole("button", { name: "Cancel" }),
      publish: c.getByRole("button", { name: "Publish" }),
    })) {
      const box = await loc.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(43.5);
      expect(box!.x + box!.width, `${name} inside the screen`).toBeLessThanOrEqual(375);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("Automatic updates card (Profile tab)", () => {
  const cardLoc = (page: Page) => page.locator('[data-card="automatic-updates"]');

  test("shows the owner's choice, when it was made and where, and what we will never import", async ({ page }) => {
    const db = seed();
    await openOwner(page, db, "/dashboard/profile");
    await expect(cardLoc(page)).toBeVisible({ timeout: 15_000 });
    await expect(cardLoc(page).getByRole("radio", { name: /Suggest updates for my approval/ })).toHaveAttribute("aria-checked", "true");
    await expect(cardLoc(page).getByRole("radio", { name: /^Off/ })).toHaveAttribute("aria-checked", "false");
    await expect(cardLoc(page).getByText(/Your choice was recorded on 1 Oct 2026 \(from the sign-up form\)/)).toBeVisible();
    await expect(cardLoc(page).getByText(/never import personal phone numbers or email addresses/)).toBeVisible();
  });

  test("changing the level goes through the server function, and the card follows", async ({ page }) => {
    const db = seed();
    await openOwner(page, db, "/dashboard/profile");
    await cardLoc(page)
      .getByRole("radio", { name: /Publish events automatically/ })
      .click();
    await expect.poll(() => callsTo(db, "set_my_automation_level").length).toBe(1);
    expect(callsTo(db, "set_my_automation_level")[0].body).toEqual({ _level: "events_auto" });
    await expect(cardLoc(page).getByRole("radio", { name: /Publish events automatically/ })).toHaveAttribute("aria-checked", "true");
    await expect(cardLoc(page).getByText(/from your dashboard/)).toBeVisible();
  });

  test("Pause everything asks first, explains what it clears, then switches automation off and clears the inbox", async ({ page }) => {
    const db = seed({ level: "events_auto" });
    await openOwner(page, db, "/dashboard/profile");
    await cardLoc(page).getByRole("button", { name: "Pause everything" }).click();
    await expect(cardLoc(page).getByText(/switches off every source and clears the suggestions waiting for you/)).toBeVisible();
    expect(callsTo(db, "set_my_automation_level")).toHaveLength(0);

    await cardLoc(page).getByRole("button", { name: "Pause everything" }).click(); // the confirm button
    await expect.poll(() => callsTo(db, "set_my_automation_level").length).toBe(1);
    expect(callsTo(db, "set_my_automation_level")[0].body).toEqual({ _level: "off" });
    await expect(cardLoc(page).getByRole("radio", { name: /^Off/ })).toHaveAttribute("aria-checked", "true");
    expect(db.suggestions.filter((s) => s.status === "pending")).toHaveLength(0);
    // nothing left to pause
    await expect(cardLoc(page).getByRole("button", { name: "Pause everything" })).toHaveCount(0);
  });

  test("'Keep it on' backs out without changing anything", async ({ page }) => {
    const db = seed();
    await openOwner(page, db, "/dashboard/profile");
    await cardLoc(page).getByRole("button", { name: "Pause everything" }).click();
    await cardLoc(page).getByRole("button", { name: "Keep it on" }).click();
    expect(callsTo(db, "set_my_automation_level")).toHaveLength(0);
    await expect(cardLoc(page).getByRole("button", { name: "Pause everything" })).toBeVisible();
  });

  test("lists the sources with when they were last checked; Facebook, Instagram and TikTok are 'coming soon' and cannot be switched on", async ({ page }) => {
    const db = seed();
    await openOwner(page, db, "/dashboard/profile");
    const web = cardLoc(page).locator('[data-source="website"]');
    await expect(web.getByText("Website")).toBeVisible({ timeout: 15_000 });
    await expect(web.getByText("church.example")).toBeVisible();
    await expect(web.getByText("Checked 3 hours ago · 3 items read")).toBeVisible();

    const fb = cardLoc(page).locator('[data-source="facebook"]');
    await expect(fb.getByText("Coming soon — needs a page connection")).toBeVisible();
    // its only button is Remove: there is no switch to turn it on
    await expect(fb.getByRole("button")).toHaveCount(1);
    await expect(fb.getByRole("button", { name: "Remove Facebook page" })).toBeVisible();
  });

  test("a source can be switched off and on", async ({ page }) => {
    const db = seed();
    await openOwner(page, db, "/dashboard/profile");
    await cardLoc(page).locator('[data-source="website"] button').first().click(); // the switch
    await expect.poll(() => callsTo(db, "update listing_sources").length).toBe(1);
    expect(callsTo(db, "update listing_sources")[0].body).toEqual({ id: SRC_WEB, enabled: false });
  });

  test("adds a source from what a person types, and refuses something that is not a web link", async ({ page }) => {
    const db = seed();
    await openOwner(page, db, "/dashboard/profile");
    await cardLoc(page).getByLabel("Source type").selectOption("youtube");
    await cardLoc(page).getByLabel("Source link").fill("javascript:alert(1)");
    await cardLoc(page).getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("That does not look like a web link")).toBeVisible();
    expect(callsTo(db, "insert listing_sources")).toHaveLength(0);

    await cardLoc(page).getByLabel("Source link").fill("www.youtube.com/@gracechurch");
    await cardLoc(page).getByRole("button", { name: "Add" }).click();
    await expect.poll(() => callsTo(db, "insert listing_sources").length).toBe(1);
    expect(callsTo(db, "insert listing_sources")[0].body).toMatchObject({
      contributor_id: MEMBER.id,
      kind: "youtube",
      url: "https://www.youtube.com/@gracechurch",
      enabled: true,
    });
    await expect(cardLoc(page).locator('[data-source="youtube"]')).toBeVisible();
  });

  test("a source added while automation is off is saved switched off", async ({ page }) => {
    const db = seed({ level: "off" });
    await openOwner(page, db, "/dashboard/profile");
    await cardLoc(page).getByLabel("Source link").fill("https://church.example/events.ics");
    await cardLoc(page).getByLabel("Source type").selectOption("calendar");
    await cardLoc(page).getByRole("button", { name: "Add" }).click();
    await expect.poll(() => callsTo(db, "insert listing_sources").length).toBe(1);
    expect(callsTo(db, "insert listing_sources")[0].body).toMatchObject({
      kind: "calendar",
      enabled: false,
    });
  });

  test("a source can be removed", async ({ page }) => {
    const db = seed();
    await openOwner(page, db, "/dashboard/profile");
    await cardLoc(page).getByRole("button", { name: "Remove Facebook page" }).click();
    await expect.poll(() => callsTo(db, "delete listing_sources").length).toBe(1);
    expect(callsTo(db, "delete listing_sources")[0].body).toEqual({ id: SRC_FB });
    await expect(cardLoc(page).locator('[data-source="facebook"]')).toHaveCount(0);
  });
});

test.describe("Admin → Listings shows each listing's automation", () => {
  const ADMIN: FakeUser = { id: "55555555-5555-4555-8555-555555555555", email: "admin@automation.example", fullName: "Admin" };
  const row = (over: Row) => ({
    avatar_url: null,
    role: "contributor",
    contributor_kind: "organization",
    contributor_status: "approved",
    contributor_hidden: false,
    contributor_claim_email: null,
    contributor_claimed_at: "2026-09-20T10:00:00Z",
    created_at: "2026-09-19T08:00:00Z",
    ...over,
  });

  test("the level and the number of suggestions waiting, and nothing for a row the server could not look up", async ({ page }) => {
    await mockAppShell(page, { supabaseUrl: FAKE_PROJECT, anonKey: "e2e-anon-key" });
    await signInToFakeProject(page, { user: ADMIN, profile: { role: "admin", contributor_status: "not_applied" } });
    await page.route("**/api/admin/users**", (route: Route) => {
      const params = new URL(route.request().url()).searchParams;
      const data =
        params.get("role") !== "contributor"
          ? []
          : [
              row({ id: "a1000000-0000-4000-8000-000000000001", full_name: "Auto Org", contributor_slug: "auto-org", auto_update_level: "events_auto", pending_suggestions: 3 }),
              row({ id: "a1000000-0000-4000-8000-000000000002", full_name: "Quiet Org", contributor_slug: "quiet-org", auto_update_level: "off", pending_suggestions: 0 }),
              row({ id: "a1000000-0000-4000-8000-000000000003", full_name: "Suggest Org", contributor_slug: "suggest-org", auto_update_level: "suggest", pending_suggestions: 1 }),
              row({ id: "a1000000-0000-4000-8000-000000000004", full_name: "Unknown Org", contributor_slug: "unknown-org" }),
            ];
      return route.fulfill({ json: { data, meta: { page: 1, pageSize: 20, total: data.length } } });
    });

    await page.goto("/admin/contributors");
    await expect(page.locator('[data-listing="auto-org"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-listing="auto-org"]').getByText("Automatic updates: Auto events · 3 pending")).toBeVisible();
    await expect(page.locator('[data-listing="quiet-org"]').getByText("Automatic updates: Off", { exact: true })).toBeVisible();
    await expect(page.locator('[data-listing="suggest-org"]').getByText("Automatic updates: Suggest · 1 pending")).toBeVisible();
    await expect(page.locator('[data-listing="unknown-org"]').locator("[data-automation]")).toHaveCount(0);
  });
});
