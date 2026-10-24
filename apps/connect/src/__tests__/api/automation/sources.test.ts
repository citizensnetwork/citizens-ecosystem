import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeTables, type Row } from "../../helpers/fake-tables";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const fake = createFakeTables(["profiles", "listing_sources", "listing_suggestions", "events"]);
const state = fake.state as {
  profiles: Row[];
  listing_sources: Row[];
  listing_suggestions: Row[];
  events: Row[];
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => fake.from(table) })),
}));

const gate = vi.fn();
vi.mock("@/lib/v1Gate", () => ({ gateV1: (...a: unknown[]) => gate(...a) }));

const { GET } = await import("@/app/api/automation/sources/route");

const KEY = {
  id: "key-1",
  owner_id: "admin-1",
  scopes: ["automation:suggest"],
  rate_limit_per_minute: null,
  raw_prefix: "cck_live_abcd1234",
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const req = () =>
  new Request("http://localhost/api/automation/sources", {
    headers: { Authorization: "Bearer cck_live_x" },
  });
const profile = (id: string, over: Row = {}) => ({
  id,
  role: "contributor",
  contributor_status: "approved",
  contributor_hidden: false,
  deleted_at: null,
  auto_update_level: "suggest",
  ...over,
});
const source = (id: string, contributor_id: string, over: Row = {}) => ({
  id,
  contributor_id,
  kind: "website",
  url: `https://${id}.example/`,
  enabled: true,
  last_checked_at: null,
  last_status: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.profiles = [profile(A)];
  state.listing_sources = [source("s1", A)];
  state.listing_suggestions = [];
  state.events = [];
  gate.mockResolvedValue({ key: KEY, identifier: "key:1" });
});

describe("GET /api/automation/sources: who may call it", () => {
  it("401 with no API key, and reads nothing", async () => {
    gate.mockResolvedValue({ key: null, identifier: "ip" });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
  it("403 for a key without the automation:suggest scope (the digest key cannot list sources)", async () => {
    for (const scopes of [["automation:digest"], ["read:public"], []]) {
      gate.mockResolvedValue({ key: { ...KEY, scopes }, identifier: "key:1" });
      const res = await GET(req());
      expect(res.status, scopes.join()).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    }
  });
  it("passes the shared limiter's refusal straight through, using its own bucket", async () => {
    const { NextResponse } = await import("next/server");
    gate.mockResolvedValue({
      key: null,
      deny: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
      identifier: "ip",
    });
    expect((await GET(req())).status).toBe(429);
    expect(gate).toHaveBeenCalledWith(expect.anything(), { bucket: "automation-sources" });
  });
});

describe("GET /api/automation/sources: what it returns", () => {
  it("is harmless when nobody has opted in: an empty list, 200", async () => {
    state.profiles = [profile(A, { auto_update_level: "off" })];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sources: [], count: 0 });
  });

  it("lists an enabled, never-checked source of an opted-in Contributor with only the five public fields", async () => {
    state.listing_sources = [source("s1", A, { last_status: "3 events" })];
    const body = await (await GET(req())).json();
    expect(body.count).toBe(1);
    expect(body.sources).toEqual([
      {
        source_id: "s1",
        contributor_id: A,
        kind: "website",
        url: "https://s1.example/",
        last_status: "3 events",
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/email|phone|consent|level|name/i);
  });

  it("sends no-store so a proxy never serves yesterday's list", async () => {
    expect((await GET(req())).headers.get("cache-control")).toBe("no-store");
  });

  it("includes both opted-in levels and nobody else: off, unapproved, hidden, deleted and non-Contributor profiles are skipped", async () => {
    const others = ["c-off", "c-pending", "c-hidden", "c-deleted", "c-citizen"];
    state.profiles = [
      profile(A),
      profile(B, { auto_update_level: "events_auto" }),
      profile("c-off", { auto_update_level: "off" }),
      profile("c-pending", { contributor_status: "pending" }),
      profile("c-hidden", { contributor_hidden: true }),
      profile("c-deleted", { deleted_at: "2026-09-01T00:00:00Z" }),
      profile("c-citizen", { role: "citizen" }),
    ];
    state.listing_sources = [source("sa", A), source("sb", B), ...others.map((c, i) => source(`x${i}`, c))];
    const body = await (await GET(req())).json();
    expect(body.sources.map((s: { source_id: string }) => s.source_id).sort()).toEqual(["sa", "sb"]);
  });

  it("skips switched-off sources, recently checked ones, and kinds the Reader cannot read", async () => {
    state.listing_sources = [
      source("ok", A),
      source("off", A, { enabled: false }),
      source("fresh", A, { last_checked_at: hoursAgo(2) }),
      source("stale", A, { last_checked_at: hoursAgo(26) }),
      source("fb", A, { kind: "facebook", url: "https://www.facebook.com/example" }),
      source("ig", A, { kind: "instagram", url: "https://www.instagram.com/example/" }),
      source("tt", A, { kind: "tiktok", url: "https://www.tiktok.com/@example" }),
    ];
    const body = await (await GET(req())).json();
    expect(body.sources.map((s: { source_id: string }) => s.source_id).sort()).toEqual(["ok", "stale"]);
  });

  it("orders the oldest check first and caps the list at 200", async () => {
    state.listing_sources = Array.from({ length: 230 }, (_, i) => source(`s${String(i).padStart(3, "0")}`, A, { last_checked_at: hoursAgo(40 + i) }));
    const body = await (await GET(req())).json();
    expect(body.count).toBe(200);
    expect(body.sources[0].source_id).toBe("s229");
  });

  it("is read-only: it writes no row of any table", async () => {
    const before = JSON.stringify(state);
    await GET(req());
    expect(JSON.stringify(state)).toBe(before);
  });

  it("500s without leaking the database error when a read fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      ...fake,
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                limit: async () => ({ data: null, error: { message: "secret db detail" } }),
              }),
            }),
          }),
        }),
      }),
    };
    const mod = await import("@/lib/supabase/admin");
    vi.mocked(mod.createAdminClient).mockReturnValueOnce(failing as never);
    const res = await GET(req());
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toBe(JSON.stringify({ error: "read_failed" }));
    expect(text).not.toContain("secret");
    spy.mockRestore();
  });
});
