import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCursor, validateCentralApp, validateFeedItemInput } from "@citizens/central";

/**
 * GET /api/v1/central/feed and /apps. The database is a stand-in that records every query, so the
 * tests can prove the visibility filters and the selected columns, not only the answer.
 */
type Answer = { data: unknown; error: unknown };
let answers: Record<string, Answer>;
let calls: Record<string, unknown[][]>;

const client = {
  from: (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lte", "order", "limit"]) {
      builder[method] = (...args: unknown[]) => {
        (calls[table] ||= []).push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(answers[table]).then(resolve, reject);
    return builder;
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(client) }));
const gateV1 = vi.fn();
vi.mock("@/lib/v1Gate", () => ({ gateV1: (...a: unknown[]) => gateV1(...a) }));
let base = "https://example.test/citizens/connect";
vi.mock("@/lib/siteUrl", () => ({ siteBase: () => base }));

const { GET } = await import("@/app/api/v1/central/feed/route");
const { GET: GET_APPS } = await import("@/app/api/v1/central/apps/route");
const ask = (qs = "") => GET(new Request(`http://localhost/api/v1/central/feed${qs}`));

// Saturday 21 November 2026, 10:00 in South Africa. The edition began at 04:00 (02:00 UTC).
const NOW = new Date("2026-11-21T08:00:00Z");
const BEFORE = "2026-11-10T09:00:00Z";
vi.useFakeTimers({ toFake: ["Date"], now: NOW });
afterAll(() => vi.useRealTimers());

const event = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Event ${id}`,
  date: "2026-11-21T16:00:00Z",
  end_time: null,
  location: "Community Park, 1 Sample Road",
  image_url: "https://images.example/e.jpg",
  latitude: -25.771234,
  longitude: 28.236789,
  created_at: BEFORE,
  ...over,
});
const place = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Place ${id}`,
  address: "Hatfield, Pretoria",
  image_url: null,
  latitude: -25.75,
  longitude: 28.24,
  created_at: BEFORE,
  ...over,
});
const contributor = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  full_name: `Contributor ${id}`,
  contributor_slug: `slug-${id}`,
  logo_url: null,
  avatar_url: null,
  physical_address: null,
  physical_latitude: null,
  physical_longitude: null,
  created_at: BEFORE,
  ...over,
});

beforeEach(() => {
  calls = {};
  base = "https://example.test/citizens/connect";
  gateV1.mockReset();
  gateV1.mockResolvedValue({ key: null, identifier: "t" });
  answers = {
    events: { data: [event("e1")], error: null },
    places: { data: [place("p1")], error: null },
    profiles: { data: [contributor("c1")], error: null },
  };
});

const filters = (table: string) => (calls[table] ?? []).filter((c) => c[0] === "eq").map((c) => c.slice(1));
const selected = (table: string) => String((calls[table] ?? []).find((c) => c[0] === "select")?.[1]);

describe("GET /api/v1/central/feed", () => {
  it("is rate limited, and a 429 reads nothing", async () => {
    gateV1.mockResolvedValue({ key: null, identifier: "t", deny: new Response("{}", { status: 429 }) });
    expect((await ask()).status).toBe(429);
    expect(gateV1).toHaveBeenCalledWith(expect.anything(), { bucket: "v1-central-feed" });
    expect(calls).toEqual({});
  });

  it("refuses a broken cursor before reading anything", async () => {
    const res = await ask("?cursor=not-a-cursor");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_cursor" });
    expect(calls).toEqual({});
  });

  it("reads only public content, with the same filters as the public v1 routes", async () => {
    await ask();
    expect(filters("events")).toEqual([
      ["status", "published"],
      ["visibility", "public"],
    ]);
    expect(filters("places")).toEqual([["status", "published"]]);
    expect(filters("profiles")).toEqual([
      ["role", "contributor"],
      ["contributor_status", "approved"],
      ["contributor_hidden", false],
    ]);
    // Events are bounded to the edition's horizon; every read is capped.
    expect(calls.events).toContainEqual(["gte", "date", "2026-11-20T08:00:00.000Z"]);
    expect(calls.events).toContainEqual(["lte", "date", "2026-12-12T08:00:00.000Z"]);
    for (const table of ["events", "places", "profiles"]) expect(calls[table]).toContainEqual(["limit", 300]);
    // No private column is ever selected.
    for (const table of ["events", "places", "profiles"]) {
      expect(selected(table)).not.toMatch(/email|phone|whatsapp|billing|home_|gender|notification|created_by/);
    }
  });

  it("serves valid feed items from Connect's real rows, and says it is caught up", async () => {
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    const body = await res.json();
    expect(body.meta).toEqual({ status: "ok", source: "connect-live" });
    expect(body.data.edition).toEqual({ day: "2026-11-21", cell: "none", size: 3 });
    expect(body.data.lead).toEqual({ encouragement: null });
    expect(body.data).toMatchObject({ caughtUp: true, nextCursor: null, nextEditionAt: "2026-11-22T02:00:00.000Z" });
    const ids = body.data.items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual(["connect:contributor:c1", "connect:event:e1", "connect:place:p1"]);
    for (const item of body.data.items) {
      const { app, publishedAt, ...input } = item;
      delete input.id;
      expect(app).toBe("connect");
      expect(publishedAt).toBe(BEFORE);
      expect(validateFeedItemInput(input)).toMatchObject({ ok: true });
    }
    const e1 = body.data.items.find((i: { id: string }) => i.id === "connect:event:e1");
    expect(e1).toMatchObject({
      href: "https://example.test/citizens/connect/e/e1",
      kicker: "Happening today",
      shape: "landscape",
      place: { label: "Community Park", lat: -25.77, lng: 28.24 },
    });
  });

  it("keeps only one decimal of the viewer's place, and ranks what is near first", async () => {
    answers.places = {
      data: [place("far", { latitude: -33.92, longitude: 18.42, address: "Cape Town" }), place("near")],
      error: null,
    };
    answers.events = { data: [], error: null };
    answers.profiles = { data: [], error: null };
    const body = await (await ask("?near=-25.74861,28.22931")).json();
    expect(body.data.edition.cell).toBe("-25.7,28.2");
    expect(body.data.items.map((i: { sourceId: string }) => i.sourceId)).toEqual(["near", "far"]);
    expect((await (await ask("?near=somewhere")).json()).data.edition.cell).toBe("none");
  });

  it("pages through a finite edition and ends caught up", async () => {
    answers.places = { data: Array.from({ length: 30 }, (_, n) => place(`p${n}`)), error: null };
    answers.events = { data: [], error: null };
    answers.profiles = { data: [], error: null };
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const body = await (await ask(`?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)).json();
      seen.push(...body.data.items.map((i: { id: string }) => i.id));
      expect(body.data.caughtUp).toBe(body.data.nextCursor === null);
      cursor = body.data.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(30);
  });

  it("holds back what was published after today's edition began", async () => {
    answers.places = { data: [place("old"), place("new", { created_at: "2026-11-21T06:00:00Z" })], error: null };
    answers.events = { data: [], error: null };
    answers.profiles = { data: [], error: null };
    const body = await (await ask()).json();
    expect(body.data.items.map((i: { sourceId: string }) => i.sourceId)).toEqual(["old"]);
  });

  it("answers 409 for a cursor from another day", async () => {
    const stale = encodeCursor({ day: "2026-11-20", cell: "none", offset: 12 });
    const res = await ask(`?cursor=${encodeURIComponent(stale)}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "edition_changed" });
  });

  it("never serves sample content: nothing to show is an empty, caught-up page", async () => {
    answers = {
      events: { data: [], error: null },
      places: { data: null, error: null },
      profiles: { data: [contributor("c2", { contributor_slug: null })], error: null },
    };
    const body = await (await ask()).json();
    expect(body.data).toMatchObject({ items: [], caughtUp: true, nextCursor: null });
  });

  it("serves the rest when one read fails, and 503 when all fail", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    answers.events = { data: null, error: { message: "boom" } };
    const partial = await ask("?near=-25.7,28.2");
    expect(partial.status).toBe(200);
    const body = await partial.json();
    expect(body.meta.status).toBe("partial");
    expect(body.data.items).toHaveLength(2);
    // The viewer's place is never written to the log.
    expect(JSON.stringify(quiet.mock.calls)).not.toMatch(/25\.7|near/);

    answers.places = { data: null, error: { message: "boom" } };
    answers.profiles = { data: null, error: { message: "boom" } };
    const down = await ask();
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ error: "feed_unavailable" });
    quiet.mockRestore();
  });

  it("uses the shared-domain path for links when the origin is not https", async () => {
    base = "http://localhost:3100";
    const body = await (await ask()).json();
    const e1 = body.data.items.find((i: { id: string }) => i.id === "connect:event:e1");
    expect(e1.href).toBe("/citizens/connect/e/e1");
  });
});

describe("GET /api/v1/central/apps", () => {
  it("serves a valid registry, rate limited, with Connect's kinds", async () => {
    const res = await GET_APPS(new Request("http://localhost/api/v1/central/apps"));
    expect(gateV1).toHaveBeenCalledWith(expect.anything(), { bucket: "v1-central-apps" });
    const body = await res.json();
    expect(body.meta).toEqual({ status: "ok", source: "transitional" });
    for (const app of body.data) expect(validateCentralApp(app)).toEqual({ ok: true, value: app });
    const connect = body.data.find((a: { slug: string }) => a.slug === "connect");
    expect(connect).toMatchObject({ name: "Connect", accent: "#f2bd22", status: "live" });
    expect(connect.kinds.map((k: { kind: string }) => k.kind)).toEqual(["contributor", "event", "place"]);
    expect(body.data.find((a: { slug: string }) => a.slug === "central").accent).toBeNull();

    gateV1.mockResolvedValue({ key: null, identifier: "t", deny: new Response("{}", { status: 429 }) });
    expect((await GET_APPS(new Request("http://localhost/api/v1/central/apps"))).status).toBe(429);
  });
});
