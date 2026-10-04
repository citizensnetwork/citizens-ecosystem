import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { createFakeTables, type Row } from "../../helpers/fake-tables";

const CONTRIB = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SRC_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_SRC = "44444444-4444-4444-8444-444444444444";

const fake = createFakeTables(["profiles", "listing_sources", "listing_suggestions", "events"]);
const state = fake.state as { profiles: Row[]; listing_sources: Row[]; listing_suggestions: Row[]; events: Row[] };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ from: (table: string) => fake.from(table) })) }));

const gate = vi.fn();
vi.mock("@/lib/v1Gate", () => ({ gateV1: (...a: unknown[]) => gate(...a) }));

const geocode = vi.fn();
vi.mock("@/lib/intake/googleForm", async (orig) => ({ ...(await orig<object>()), geocodeWithMapTiler: (...a: unknown[]) => geocode(...a) }));

const { POST } = await import("@/app/api/automation/suggestions/route");

const KEY = { id: "key-1", owner_id: "admin-1", scopes: ["automation:suggest"], rate_limit_per_minute: null, raw_prefix: "cck_live_abcd1234" };
const future = () => new Date(Date.now() + 5 * 86_400_000).toISOString();
const past = () => new Date(Date.now() - 5 * 86_400_000).toISOString();

const event = (over: Row = {}) => ({
  kind: "event",
  contributor_id: CONTRIB,
  source_url: "https://www.church.example/events",
  payload: { title: "Sunday Celebration", description: "Worship together.", start: future(), location: "12 Church Street, Pretoria", category: "church-services", ...over },
});

const req = (body: unknown, raw?: string) =>
  new Request("http://localhost/api/automation/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer cck_live_x" },
    body: raw ?? JSON.stringify(body),
  });

const profile = (over: Row = {}) => ({ id: CONTRIB, role: "contributor", contributor_status: "approved", contributor_hidden: false, deleted_at: null, auto_update_level: "suggest", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  state.profiles = [profile()];
  state.listing_sources = [{ id: SRC_ID, contributor_id: CONTRIB, kind: "website", url: "https://www.church.example/", enabled: true, last_checked_at: null, last_status: null }];
  state.listing_suggestions = [];
  state.events = [];
  fake.failInsert.clear();
  gate.mockResolvedValue({ key: KEY, identifier: "key:1" });
  geocode.mockResolvedValue({ lat: -25.75, lng: 28.19 });
});

describe("POST /api/automation/suggestions: who may call it", () => {
  it("401 with no API key, and reads nothing", async () => {
    gate.mockResolvedValue({ key: null, identifier: "ip" });
    const res = await POST(req(event()));
    expect(res.status).toBe(401);
    expect(state.listing_suggestions).toHaveLength(0);
  });
  it("403 for a key that lacks the automation:suggest scope", async () => {
    gate.mockResolvedValue({ key: { ...KEY, scopes: ["read:public"] }, identifier: "key:1" });
    const res = await POST(req(event()));
    expect(res.status).toBe(403);
    expect(state.listing_suggestions).toHaveLength(0);
  });
  it("passes a rate-limit refusal straight through", async () => {
    const { NextResponse } = await import("next/server");
    gate.mockResolvedValue({ key: null, deny: NextResponse.json({ error: "Too many requests" }, { status: 429 }), identifier: "ip" });
    expect((await POST(req(event()))).status).toBe(429);
  });
  it("400 for a body that is not a JSON object, a batch over 50, and 413 for an oversized body", async () => {
    expect((await POST(req(null, "not json"))).status).toBe(400);
    expect((await POST(req(null, "[1,2]"))).status).toBe(400);
    const big = { items: Array.from({ length: 51 }, () => event()) };
    const tooMany = await POST(req(big));
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).error).toBe("too_many_items");
    expect((await POST(req(null, "x".repeat(1_000_001)))).status).toBe(413);
  });
});

describe("POST /api/automation/suggestions: the rules, in order", () => {
  it("refuses a Contributor who is not approved, is hidden, deleted, not a Contributor, or unknown (409)", async () => {
    for (const over of [{ contributor_status: "pending" }, { contributor_hidden: true }, { deleted_at: "2026-01-01" }, { role: "citizen" }]) {
      state.profiles = [profile(over)];
      const res = await POST(req(event()));
      expect(res.status, JSON.stringify(over)).toBe(409);
      expect((await res.json()).error).toBe("contributor_not_eligible");
    }
    state.profiles = [];
    expect((await POST(req(event()))).status).toBe(409);
    expect(state.listing_suggestions).toHaveLength(0);
  });

  it("consent_off: a Contributor at level 'off' receives nothing (409), and an unknown level counts as off", async () => {
    for (const level of ["off", "yes", null]) {
      state.profiles = [profile({ auto_update_level: level })];
      const res = await POST(req(event()));
      expect(res.status, String(level)).toBe(409);
      expect((await res.json()).error).toBe("consent_off");
    }
    expect(state.listing_suggestions).toHaveLength(0);
    expect(state.events).toHaveLength(0);
  });

  it("source_disabled: a switched-off source, someone else's source and an unknown source are all refused", async () => {
    state.listing_sources = [
      { id: SRC_ID, contributor_id: CONTRIB, kind: "website", url: "https://a.example/", enabled: false },
      { id: OTHER_SRC, contributor_id: OTHER, kind: "website", url: "https://b.example/", enabled: true },
    ];
    for (const source_id of [SRC_ID, OTHER_SRC, "55555555-5555-4555-8555-555555555555"]) {
      const res = await POST(req({ ...event(), source_id }));
      expect(res.status, source_id).toBe(409);
      expect((await res.json()).error).toBe("source_disabled");
    }
    expect(state.listing_suggestions).toHaveLength(0);
  });

  it("rejects a malformed contributor or source id before touching the database", async () => {
    expect((await (await POST(req({ ...event(), contributor_id: "nope" }))).json()).error).toBe("invalid_contributor_id");
    expect((await (await POST(req({ ...event(), source_id: "nope" }))).json()).error).toBe("invalid_source_id");
  });

  it("422 for a payload the rules refuse (named reason), and nothing is stored", async () => {
    for (const [body, reason] of [
      [{ ...event(), kind: "poll" }, "unknown_kind"],
      [{ ...event(), source_url: "http://insecure.example" }, "source_url_must_be_https"],
      [{ ...event(), payload: { ...event().payload, title: "" } }, "event_title_required"],
      [{ kind: "profile", contributor_id: CONTRIB, source_url: "https://x.example/", payload: { field: "whatsapp_number", value: "0821234567" } }, "profile_field_not_allowed"],
    ] as const) {
      const res = await POST(req(body));
      expect(res.status, reason).toBe(422);
      expect((await res.json()).error).toBe(reason);
    }
    expect(state.listing_suggestions).toHaveLength(0);
  });
});

describe("POST /api/automation/suggestions: storing", () => {
  it("stores a pending suggestion (level 'suggest') with its source link and fingerprint, and records the check on the source", async () => {
    const res = await POST(req({ ...event(), source_id: SRC_ID, source_status: "3 items read" }));
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results).toEqual([{ index: 0, status: "pending", id: expect.any(String) }]);
    expect(state.listing_suggestions).toHaveLength(1);
    expect(state.listing_suggestions[0]).toMatchObject({ contributor_id: CONTRIB, source_id: SRC_ID, kind: "event", status: "pending", source_url: "https://www.church.example/events" });
    expect(String(state.listing_suggestions[0].fingerprint)).toMatch(/^[0-9a-f]{64}$/);
    expect(state.events).toHaveLength(0);
    expect(state.listing_sources[0]).toMatchObject({ last_status: "3 items read" });
    expect(state.listing_sources[0].last_checked_at).toEqual(expect.any(String));
  });

  it("the same item sent again (another day's run) is a duplicate and inserts nothing", async () => {
    await POST(req(event()));
    const res = await POST(req(event({ description: "A rewritten blurb" })));
    expect((await res.json()).results[0].status).toBe("duplicate");
    expect(state.listing_suggestions).toHaveLength(1);
  });

  it("stores only the allow-listed fields and scrubs personal contact details, with a warning", async () => {
    const res = await POST(req(event({ description: "Call 082 123 4567 or mail me@home.example", created_by: "x", status: "cancelled", attendees: ["a"] })));
    const body = await res.json();
    expect(body.results[0].warnings.join(" ")).toMatch(/removed/);
    const stored = state.listing_suggestions[0].payload as Row;
    expect(Object.keys(stored).sort()).toEqual(["category", "description", "end", "location", "start", "title", "website_url"]);
    expect(String(stored.description)).toBe("Call [removed] or mail [removed]");
  });

  it("a batch reports per item and is always 200", async () => {
    const res = await POST(req({ items: [event(), { ...event(), kind: "poll" }, event(), { ...event(), contributor_id: OTHER }] }));
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results.map((r: { status: string }) => r.status)).toEqual(["pending", "rejected", "duplicate", "rejected"]);
    expect(results[1].reason).toBe("unknown_kind");
    expect(results[3].reason).toBe("contributor_not_eligible");
  });

  it("request-level contributor_id, source_id and source_url are defaults for each item", async () => {
    const e = event();
    const res = await POST(req({ contributor_id: CONTRIB, source_id: SRC_ID, source_url: e.source_url, items: [{ kind: e.kind, payload: e.payload }] }));
    expect((await res.json()).results[0].status).toBe("pending");
    expect(state.listing_suggestions[0]).toMatchObject({ contributor_id: CONTRIB, source_id: SRC_ID });
  });

  it("an empty batch with a source_id records a check that found nothing", async () => {
    const res = await POST(req({ source_id: SRC_ID, source_status: "nothing new", items: [] }));
    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([]);
    expect(state.listing_sources[0]).toMatchObject({ last_status: "nothing new" });
  });

  it("caps new items per Contributor per hour", async () => {
    let refused = 0;
    for (let i = 0; i < 105; i++) {
      const r = await POST(req(event({ title: `Event number ${i}`, start: new Date(Date.now() + (i + 1) * 3_600_000 * 24).toISOString() })));
      if (r.status === 429) refused++;
    }
    expect(state.listing_suggestions).toHaveLength(100);
    expect(refused).toBe(5);
  });
});

describe("POST /api/automation/suggestions: automatic publishing is for future events at 'events_auto' only", () => {
  beforeEach(() => {
    state.profiles = [profile({ auto_update_level: "events_auto" })];
  });

  it("publishes a future event now, labelled with its source, and stores the suggestion as auto_published", async () => {
    const res = await POST(req(event()));
    const { results } = await res.json();
    expect(results[0].status).toBe("auto_published");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      title: "Sunday Celebration",
      created_by: CONTRIB,
      category: "church-services",
      source_url: "https://www.church.example/events",
      latitude: -25.75,
      longitude: 28.19,
    });
    expect(state.listing_suggestions[0]).toMatchObject({ status: "auto_published", published_ref: state.events[0].id });
    expect(state.listing_suggestions[0].decided_at).toEqual(expect.any(String));
  });

  it("an event MapTiler cannot place is still published, just off the map", async () => {
    geocode.mockResolvedValue(null);
    await POST(req(event()));
    expect(state.events[0]).toMatchObject({ latitude: null, longitude: null });
  });

  it("a PAST event never auto-publishes: it waits for approval", async () => {
    const res = await POST(req(event({ start: past() })));
    expect((await res.json()).results[0].status).toBe("pending");
    expect(state.events).toHaveLength(0);
  });

  it("news and profile suggestions always wait, even at events_auto", async () => {
    await POST(req({ kind: "news", contributor_id: CONTRIB, source_url: "https://www.church.example/news", payload: { title: "New building", body: "We open on Sunday." } }));
    await POST(req({ kind: "profile", contributor_id: CONTRIB, source_url: "https://www.church.example/about", payload: { field: "bio", value: "We serve Pretoria." } }));
    expect(state.listing_suggestions.map((s) => s.status)).toEqual(["pending", "pending"]);
    expect(state.events).toHaveLength(0);
  });

  it("at level 'suggest' a future event is only a suggestion", async () => {
    state.profiles = [profile({ auto_update_level: "suggest" })];
    await POST(req(event()));
    expect(state.events).toHaveLength(0);
    expect(state.listing_suggestions[0].status).toBe("pending");
  });

  it("if the event cannot be created the suggestion stays pending, with a warning, rather than being lost", async () => {
    fake.failInsert.add("events");
    const res = await POST(req(event()));
    const r = (await res.json()).results[0];
    expect(r.status).toBe("pending");
    expect(r.warnings.join(" ")).toMatch(/waiting for the owner/);
    expect(state.listing_suggestions[0].status).toBe("pending");
  });

  it("a duplicate of an already auto-published event does not publish it twice", async () => {
    await POST(req(event()));
    const second = await POST(req(event()));
    expect((await second.json()).results[0].status).toBe("duplicate");
    expect(state.events).toHaveLength(1);
  });
});
