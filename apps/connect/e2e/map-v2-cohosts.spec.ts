import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, smallSeed, FIXED_NOW, type MapSeed, openListing } from "./support/map-v2";
import { touchSession, tapTouch } from "./support/touch";

// ════════════════════════════════════════════════════════════════════
//  Co-hosted events, the screens (tracker P2-09; migration 184, applied).
//    - an event with an ACCEPTED co-host is on BOTH Contributors' sheets, each naming the other ("With ..."), on the event's
//      card and on the full event page; an event nobody co-hosts looks exactly as before
//    - the organiser's panel (Dashboard): search, invite, withdraw/remove, the ceiling of 3, plain-words refusals
//    - the invited Contributor's Accept / Decline (shown only while the invitation is open)
//  The database half is covered by docs/audit/probes/184_event_cohosts.probe.sql (39 checks) and the route tests. The two
//  components are PURE ON THEIR PROPS, so the panel and the Accept / Decline are also mounted on their own against a stand-in
//  client and tapped with real touch. The SIGNED-IN wiring (the Notifications screen handing the right ids to Accept and
//  Decline, the Dashboard opening the panel on the organiser's own events) is in e2e/signed-in-save-cohosts.spec.ts.
// ════════════════════════════════════════════════════════════════════

type C = { id: string; contributor_slug: string; full_name: string; physical_longitude: number; physical_latitude: number };
type E = { id: string; title: string; created_by: string; latitude: number; longitude: number; co_host_ids?: string[] };
const seed0 = () => smallSeed(FIXED_NOW) as MapSeed & { contributors: C[]; events: E[] };
const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
type MapHook = { jumpTo: (o: object, d: object) => void };

async function openMapWith(page: Page, seed: ReturnType<typeof seed0>) {
  await mockMapNetwork(page, seed);
  await mockContributorDetail(page, seed);
  await openMap(page, "/?map=v2", 5);
}
async function pickMarker(page: Page, id: string, lng: number, lat: number) {
  await page.evaluate(([lo, la]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: 15.5 }, { originalEvent: {} }), [lng, lat]);
  await openListing(page, id);
  await expect(sheet(page)).toBeVisible();
}
const pickContributor = (page: Page, c: C) => pickMarker(page, c.id, c.physical_longitude, c.physical_latitude);
const pickEvent = (page: Page, e: E) => pickMarker(page, e.id, e.longitude, e.latitude);

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe("P2-09 an accepted co-host shows on both Contributors, the card and the event page", () => {
  /** events[0] is organised by contributor 1; contributor 3 accepted an invitation to co-host it. */
  const withCoHost = () => {
    const seed = seed0();
    seed.events[0].co_host_ids = [seed.contributors[2].id];
    return seed;
  };

  test("the co-host's Events tab lists it, naming the organiser; the organiser's names the co-host", async ({ page }) => {
    const seed = withCoHost();
    await openMapWith(page, seed);
    await pickContributor(page, seed.contributors[2]);   // the co-host: has no event of their own
    await expect(page.getByRole("tab", { name: "Events" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-mv2='panel'] [data-mv2='row-title']")).toHaveText(["Fixture Gathering 1"]);
    await expect(page.locator("[data-mv2='panel'] [data-host]")).toHaveText(["With Fixture Fellowship 1"]);

    await pickContributor(page, seed.contributors[0]);   // the organiser
    await expect(page.locator("[data-mv2='panel'] [data-mv2='row-title']")).toHaveText(["Fixture Gathering 1"]);
    await expect(page.locator("[data-mv2='panel'] [data-host]")).toHaveText(["With Fixture Fellowship 3"]);
  });

  test("control: a Contributor who neither organises nor co-hosts it does not list it, and an ordinary event names nobody", async ({ page }) => {
    const seed = withCoHost();
    await openMapWith(page, seed);
    await pickContributor(page, seed.contributors[1]);   // organiser of events[1] only
    await expect(page.locator("[data-mv2='panel'] [data-mv2='row-title']")).toHaveText(["Fixture Gathering 2"]);
    await expect(page.locator("[data-mv2='panel'] [data-host]")).toHaveCount(0);
  });

  test("the event's card names the co-host and the name opens their profile; an event without one has no line", async ({ page }) => {
    const seed = withCoHost();
    await openMapWith(page, seed);
    await pickEvent(page, seed.events[1]);
    await expect(page.locator("[data-mv2='card']")).toBeVisible();
    await expect(page.locator("[data-cohosts]")).toHaveCount(0);

    await pickEvent(page, seed.events[0]);
    const line = page.locator("[data-mv2='card'] [data-cohosts]");
    await expect(line).toHaveText("with Fixture Fellowship 3");
    await page.locator(`[data-cohost='${seed.contributors[2].id}']`).click();
    await expect(page).toHaveURL(new RegExp(`/c/${seed.contributors[2].contributor_slug}$`));
  });

  test("the full event page lists the co-host as a row under the organiser", async ({ page }) => {
    const seed = withCoHost();
    await openMapWith(page, seed);
    await pickEvent(page, seed.events[0]);
    await page.getByRole("button", { name: "View Full Profile" }).first().click();
    await expect(page.locator("[data-screen='event']")).toBeVisible();
    const row = page.locator(`[data-cohost-row='${seed.contributors[2].id}']`);
    await expect(row).toContainText("Fixture Fellowship 3");
    await expect(row).toContainText("Co-host");
  });
});

// ── the two components, mounted on their own against a stand-in client ─────────────────────────────────────────────────
type Stub = { calls: { fn: string; args: Record<string, unknown> }[]; toasts: [string, string][] };
declare global {
  interface Window {
    __stub: Stub & { rows: { contributor_id: string; status: string }[]; mine: { event_id: string; status: string }[]; answer: (fn: string, args: Record<string, unknown>) => unknown };
  }
}

/** Installs window.__stub and returns nothing; the stand-in `sb` is built inside the page so it can be a real object there. */
async function installStub(page: Page) {
  await page.evaluate(() => {
    const stub = { calls: [], toasts: [], rows: [], mine: [], answer: () => ({ success: true }) } as unknown as Window["__stub"];
    window.__stub = stub;
    (window as unknown as { __sb: unknown }).__sb = {
      rpc: async (fn: string, args: Record<string, unknown>) => { stub.calls.push({ fn, args }); return { data: stub.answer(fn, args), error: null }; },
      from: () => ({
        select: () => ({
          eq: (col: string) => Promise.resolve({ data: col === "event_id" ? stub.rows : stub.mine, error: null }),
        }),
      }),
    };
  });
}
async function mount(page: Page, component: "CohostPanel" | "CohostInviteActions", propsJs: string) {
  await page.evaluate(([name, src]) => {
    const host = document.createElement("div");
    host.id = "mount-point";
    host.style.cssText = "position:fixed;left:0;top:0;right:0;z-index:9999;background:#fff;padding:12px";
    document.body.appendChild(host);
    const props = new Function("stub", "sb", `return (${src});`)(window.__stub, (window as unknown as { __sb: unknown }).__sb);
    const R = (window as unknown as { React: typeof import("react"); ReactDOM: typeof import("react-dom/client") });
    R.ReactDOM.createRoot(host).render(R.React.createElement((window as unknown as Record<string, never>)[name], props));
  }, [component, propsJs] as const);
}

const PEOPLE = `[
  { id: 'self-1', name: 'Zed Organiser', profilePhoto: '' },
  { id: 'p-anna', name: 'Anna Fellowship', profilePhoto: '' },
  { id: 'p-anton', name: 'Anton Outreach', profilePhoto: '' },
  { id: 'p-bea', name: 'Bea Ministry', profilePhoto: '' },
  { id: 'p-cara', name: 'Cara Collective', profilePhoto: '' },
  { id: 'p-dan', name: 'Dan Community', profilePhoto: '' }
]`;
const panelProps = `{ sb, event: { id: 'ev-1', title: 'Night' }, contributors: ${PEOPLE}, selfId: 'self-1', toast: (m, k) => stub.toasts.push([m, k]) }`;

test.describe("P2-09 the organiser's panel (mounted on its own, real touch)", () => {
  test.beforeEach(async ({ page }) => {
    await mockMapNetwork(page, seed0());
    await openMap(page, "/?map=v2", 1);
    await installStub(page);
  });

  test("find by name (never yourself), a tap invites with the exact call, the list then shows Invited", async ({ page }) => {
    await mount(page, "CohostPanel", panelProps);
    const panel = page.locator("[data-cohosts-panel]");
    await expect(panel).toContainText("Co-hosts (0 of 3)");
    const search = page.locator("[data-cohost-search]");
    await search.fill("a");                                        // one letter: nothing yet
    await expect(page.locator("[data-cohost-results]")).toHaveCount(0);
    await search.fill("an");                                       // Anna, Anton and Dan all contain "an": name order
    await expect(page.locator("[data-cohost-results] li")).toHaveCount(3);
    await expect(page.locator("[data-cohost-results] li span:nth-child(2)")).toHaveText(["Anna Fellowship", "Anton Outreach", "Dan Community"]);
    await search.fill("zed");
    await expect(page.locator("[data-cohost-none]")).toBeVisible();          // yourself is never offered
    await search.fill("anna");

    // the stand-in remembers an invitation and the list shows it afterwards
    await page.evaluate(() => { window.__stub.answer = (fn, args) => { if (fn === "invite_event_cohost") window.__stub.rows.push({ contributor_id: String(args.p_contributor_id), status: "invited" }); return { success: true }; }; });
    const btn = page.locator("[data-cohost-invite='p-anna']");
    const box = (await btn.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await tapTouch(await touchSession(page), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(page.locator("[data-cohost-row='p-anna'] [data-cohost-status]")).toHaveText("Invited");
    expect(await page.evaluate(() => window.__stub.calls)).toEqual([{ fn: "invite_event_cohost", args: { p_event_id: "ev-1", p_contributor_id: "p-anna" } }]);
    expect(await page.evaluate(() => window.__stub.toasts)).toEqual([["Invitation sent to Anna Fellowship.", "gold"]]);
    await expect(panel).toContainText("Co-hosts (1 of 3)");
    // someone already invited is not offered again
    await search.fill("anna");
    await expect(page.locator("[data-cohost-none]")).toBeVisible();
  });

  test("the database's refusal is shown in plain words and nothing is added", async ({ page }) => {
    await mount(page, "CohostPanel", panelProps);
    await page.evaluate(() => { window.__stub.answer = () => ({ success: false, reason: "not_a_contributor" }); });
    await page.locator("[data-cohost-search]").fill("bea");
    await page.locator("[data-cohost-invite='p-bea']").click();
    await expect.poll(() => page.evaluate(() => window.__stub.toasts)).toEqual([["That person is not a Contributor on Citizens Connect.", "red"]]);
    await expect(page.locator("[data-cohost-row]")).toHaveCount(0);
  });

  test("at 3 live co-hosts the search is replaced by a plain note; a declined one does not count", async ({ page }) => {
    await page.evaluate(() => { window.__stub.rows.push({ contributor_id: "p-anna", status: "accepted" }, { contributor_id: "p-bea", status: "invited" }, { contributor_id: "p-cara", status: "declined" }); });
    await mount(page, "CohostPanel", panelProps);
    await expect(page.locator("[data-cohosts-panel]")).toContainText("Co-hosts (2 of 3)");   // the declined one is not counted
    await expect(page.locator("[data-cohost-search]")).toHaveCount(1);
    await expect(page.locator("[data-cohost-row='p-cara'] [data-cohost-status]")).toHaveText("Declined");
    await page.evaluate(() => { window.__stub.answer = (fn, args) => { if (fn === "invite_event_cohost") window.__stub.rows.push({ contributor_id: String(args.p_contributor_id), status: "invited" }); return { success: true }; }; });
    await page.locator("[data-cohost-search]").fill("dan");
    await page.locator("[data-cohost-invite='p-dan']").click();
    await expect(page.locator("[data-cohost-full]")).toHaveText("This event has all 3 co-hosts. Remove one to invite someone else.");
    await expect(page.locator("[data-cohost-search]")).toHaveCount(0);
  });

  test("Withdraw (a pending invitation) and Remove (an accepted co-host) call the right function and clear the row", async ({ page }) => {
    await page.evaluate(() => { window.__stub.rows.push({ contributor_id: "p-anna", status: "accepted" }, { contributor_id: "p-bea", status: "invited" });
      window.__stub.answer = (fn, args) => { if (fn === "remove_event_cohost") window.__stub.rows = window.__stub.rows.filter((r) => r.contributor_id !== args.p_contributor_id); return { success: true }; }; });
    await mount(page, "CohostPanel", panelProps);
    await expect(page.locator("[data-cohost-remove='p-bea']")).toHaveText("Withdraw");
    await expect(page.locator("[data-cohost-remove='p-anna']")).toHaveText("Remove");
    await expect(page.locator("[data-cohost-remove='p-bea']")).toHaveAttribute("aria-label", "Withdraw the invitation to Bea Ministry");
    await page.locator("[data-cohost-remove='p-bea']").click();
    await expect(page.locator("[data-cohost-row='p-bea']")).toHaveCount(0);
    await page.locator("[data-cohost-remove='p-anna']").click();
    await expect(page.locator("[data-cohost-row]")).toHaveCount(0);
    expect(await page.evaluate(() => window.__stub.calls.map((c) => [c.fn, c.args.p_contributor_id]))).toEqual([["remove_event_cohost", "p-bea"], ["remove_event_cohost", "p-anna"]]);
  });

  test("signed out (no client) it only says to sign in", async ({ page }) => {
    await mount(page, "CohostPanel", panelProps.replace("sb, event", "sb: null, event"));
    await expect(page.locator("[data-cohosts-panel]")).toHaveText("Sign in to invite a co-host.");
  });
});

test.describe("P2-09 the invited Contributor's Accept and Decline (mounted on their own, real touch)", () => {
  const props = `{ sb, me: 'me-1', eventId: 'ev-1', toast: (m, k) => stub.toasts.push([m, k]), onAnswered: () => stub.toasts.push(['answered', 'x']) }`;
  test.beforeEach(async ({ page }) => {
    await mockMapNetwork(page, seed0());
    await openMap(page, "/?map=v2", 1);
    await installStub(page);
  });

  test("an open invitation shows Accept and Decline (44 px); Accept sends the exact call and the buttons give way to a sentence", async ({ page }) => {
    await page.evaluate(() => { window.__stub.mine.push({ event_id: "ev-1", status: "invited" }); window.__stub.answer = () => ({ success: true, status: "accepted" }); });
    await mount(page, "CohostInviteActions", props);
    const accept = page.locator("[data-cohost-accept]");
    await expect(accept).toBeVisible();
    await expect(page.locator("[data-cohost-decline]")).toBeVisible();
    const box = (await accept.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await tapTouch(await touchSession(page), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(page.locator("[data-cohost-invite-state='accepted']")).toHaveText("You are co-hosting this event.");
    await expect(accept).toHaveCount(0);
    expect(await page.evaluate(() => window.__stub.calls)).toEqual([{ fn: "respond_event_cohost", args: { p_event_id: "ev-1", p_accept: true } }]);
    expect(await page.evaluate(() => window.__stub.toasts)).toEqual([["You are now a co-host.", "gold"], ["answered", "x"]]);
  });

  test("Decline sends accept=false", async ({ page }) => {
    await page.evaluate(() => { window.__stub.mine.push({ event_id: "ev-1", status: "invited" }); window.__stub.answer = () => ({ success: true, status: "declined" }); });
    await mount(page, "CohostInviteActions", props);
    await page.locator("[data-cohost-decline]").click();
    await expect(page.locator("[data-cohost-invite-state='declined']")).toHaveText("You declined this invitation.");
    expect(await page.evaluate(() => window.__stub.calls)).toEqual([{ fn: "respond_event_cohost", args: { p_event_id: "ev-1", p_accept: false } }]);
  });

  test("already answered or gone: no buttons, only what became of it (control for the open case)", async ({ page }) => {
    await page.evaluate(() => { window.__stub.mine.push({ event_id: "ev-1", status: "accepted" }); });
    await mount(page, "CohostInviteActions", props);
    await expect(page.locator("[data-cohost-invite-state='accepted']")).toBeVisible();
    await expect(page.locator("[data-cohost-accept]")).toHaveCount(0);
    await page.evaluate(() => document.getElementById("mount-point")!.remove());
    await page.evaluate(() => { window.__stub.mine.length = 0; });
    await mount(page, "CohostInviteActions", props);
    await expect(page.locator("[data-cohost-invite-state='closed']")).toHaveText("This invitation is no longer open.");
    await expect(page.locator("[data-cohost-accept]")).toHaveCount(0);
  });

  test("an answer that was already given elsewhere is refused in plain words and the buttons go", async ({ page }) => {
    await page.evaluate(() => { window.__stub.mine.push({ event_id: "ev-1", status: "invited" }); window.__stub.answer = () => ({ success: false, reason: "no_open_invitation" }); });
    await mount(page, "CohostInviteActions", props);
    await page.locator("[data-cohost-accept]").click();
    await expect.poll(() => page.evaluate(() => window.__stub.toasts)).toEqual([["This invitation has already been answered.", "red"]]);
    await expect(page.locator("[data-cohost-invite-state='closed']")).toBeVisible();
    await expect(page.locator("[data-cohost-accept]")).toHaveCount(0);
  });
});
