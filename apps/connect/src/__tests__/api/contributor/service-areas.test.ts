import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** /api/contributor/service-areas: the owner's read and write. The RPC decides who may write; the route validates, maps refusals and rate limits. */
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const A1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const A2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";

let user: { id: string } | null = { id: ME };
let tableAnswers: Record<string, { data: unknown; error: unknown }> = {};
const eqCalls: [string, string, unknown][] = [];
const rpc = vi.fn();
const client = {
  auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) },
  from: (t: string) => {
    const chain = {
      select: () => chain,
      eq: (col: string, v: unknown) => { eqCalls.push([t, col, v]); return chain; },
      maybeSingle: () => Promise.resolve(tableAnswers[t] ?? { data: null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(tableAnswers[t] ?? { data: [], error: null }).then(res, rej),
    };
    return chain;
  },
  rpc: (...a: unknown[]) => rpc(...a),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(client) }));
const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) };
});

const { GET, PUT } = await import("@/app/api/contributor/service-areas/route");
const URL_BASE = "http://localhost/api/contributor/service-areas";
const put = (body: unknown, raw = false) =>
  PUT(new NextRequest(URL_BASE, { method: "PUT", headers: { "Content-Type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) }));
const get = (qs = "") => GET(new NextRequest(`${URL_BASE}${qs}`));

beforeEach(() => {
  user = { id: ME };
  tableAnswers = {};
  eqCalls.length = 0;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { success: true, area_ids: [A1], radius_km: null, radius_centre_area_id: null }, error: null });
  checkRateLimit.mockReset();
  checkRateLimit.mockResolvedValue({ success: true, resetMs: 0 });
});

describe("PUT /api/contributor/service-areas", () => {
  it("is 401 without a session and never reaches the database", async () => {
    user = null;
    expect((await put({ area_ids: [A1] })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is rate limited per user", async () => {
    checkRateLimit.mockResolvedValue({ success: false, resetMs: 12_000 });
    const res = await put({ area_ids: [A1] });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
    expect(checkRateLimit).toHaveBeenCalledWith(`service-areas-write:${ME}`, expect.objectContaining({ limit: expect.any(Number) }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects bad JSON and invalid bodies with a precise 400, before the RPC", async () => {
    expect((await put("{nope", true)).status).toBe(400);
    expect(await (await put({ area_ids: ["gauteng"] })).json()).toEqual({ error: "invalid_area_ids" });
    expect(await (await put({ area_ids: [A1], radius_km: 500 })).json()).toEqual({ error: "radius_out_of_range" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves the caller's own listing when no contributor_id is given, and passes exactly what was chosen (no upward additions)", async () => {
    rpc.mockResolvedValue({ data: { success: true, area_ids: [A1, A2], radius_km: 25, radius_centre_area_id: A2 }, error: null });
    const res = await put({ area_ids: [A1, A2], radius_km: 25, radius_centre_area_id: A2 });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_service_areas", {
      p_contributor_id: ME,
      p_area_ids: [A1, A2],
      p_radius_km: 25,
      p_radius_centre_area_id: A2,
      p_presence: "online",
    });
    expect(await res.json()).toEqual({ area_ids: [A1, A2], radius_km: 25, radius_centre_area_id: A2, presence: "online" });
  });

  it("an editor or admin names the listing; the database, not the route, decides if they may", async () => {
    await put({ contributor_id: OTHER, area_ids: [A1] });
    expect(rpc).toHaveBeenCalledWith("set_service_areas", expect.objectContaining({ p_contributor_id: OTHER }));
  });

  it("passes the owner's tag through and echoes what was saved", async () => {
    rpc.mockResolvedValue({ data: { success: true, area_ids: [A1], radius_km: null, radius_centre_area_id: null, presence: "no_fixed_place" }, error: null });
    const res = await put({ area_ids: [A1], presence: "no_fixed_place" });
    expect(rpc).toHaveBeenCalledWith("set_service_areas", expect.objectContaining({ p_presence: "no_fixed_place" }));
    expect((await res.json()).presence).toBe("no_fixed_place");
    expect(await (await put({ area_ids: [A1], presence: "travelling" })).json()).toEqual({ error: "invalid_presence" });
  });

  it("clearing everything is a valid save", async () => {
    rpc.mockResolvedValue({ data: { success: true, area_ids: [], radius_km: null, radius_centre_area_id: null }, error: null });
    const res = await put({ area_ids: [] });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_service_areas", { p_contributor_id: ME, p_area_ids: [], p_radius_km: null, p_radius_centre_area_id: null, p_presence: "online" });
  });

  it.each([
    ["not_authenticated", 401],
    ["not_allowed", 403],
    ["not_found", 404],
    ["not_a_contributor", 403],
    ["too_many_areas", 400],
    ["unknown_area", 400],
    ["radius_out_of_range", 400],
    ["centre_not_ticked", 400],
    ["radius_needs_centre", 400],
    ["invalid_presence", 400],
    ["something_new", 400],
  ])("maps the database refusal %s to HTTP %i", async (reason, status) => {
    rpc.mockResolvedValue({ data: { success: false, reason }, error: null });
    const res = await put({ area_ids: [A1] });
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBeTruthy();
  });

  it("a database error is a generic 500 that leaks nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "relation secret_table missing" } });
    const res = await put({ area_ids: [A1] });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });
});

describe("GET /api/contributor/service-areas", () => {
  it("is 401 without a session", async () => {
    user = null;
    expect((await get()).status).toBe(401);
  });

  it("returns the caller's own selection by default, sorted, read on the caller's own session", async () => {
    tableAnswers.contributor_service_areas = { data: [{ area_id: A2 }, { area_id: A1 }], error: null };
    tableAnswers.contributor_service_radius = { data: { radius_km: 50, centre_area_id: A1 }, error: null };
    tableAnswers.contributor_service_presence = { data: { presence: "no_fixed_place" }, error: null };
    const j = await (await get()).json();
    expect(j).toEqual({ area_ids: [A1, A2], radius_km: 50, radius_centre_area_id: A1, presence: "no_fixed_place" });
    expect(eqCalls).toContainEqual(["contributor_service_areas", "contributor_id", ME]);
  });

  it("an empty selection is empty, with no radius", async () => {
    expect(await (await get()).json()).toEqual({ area_ids: [], radius_km: null, radius_centre_area_id: null, presence: "online" });
  });

  it("can ask for another listing (RLS decides what comes back) and rejects a bad id", async () => {
    await get(`?contributor_id=${OTHER}`);
    expect(eqCalls).toContainEqual(["contributor_service_areas", "contributor_id", OTHER]);
    expect((await get("?contributor_id=me")).status).toBe(400);
  });

  it("a read error is a generic 500", async () => {
    tableAnswers.contributor_service_areas = { data: null, error: { message: "secret" } };
    const res = await get();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });
});
