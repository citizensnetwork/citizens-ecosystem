import { describe, it, expect, vi, beforeEach } from "vitest";

/** GET /api/v1/serving?area=<uuid>: the globe's list. The database is a stand-in; the rules live in SQL (probe 195) and shapeServing. */
const AREA = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const C1 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21";
const C2 = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

let areaAnswer: { data: unknown; error: unknown };
let rpcAnswer: { data: unknown; error: unknown };
const rpc = vi.fn();
const eq = vi.fn();
const client = {
  from: (t: string) => ({
    select: () => ({
      eq: (...a: unknown[]) => {
        eq(t, ...a);
        return { maybeSingle: () => Promise.resolve(areaAnswer) };
      },
    }),
  }),
  rpc: (...a: unknown[]) => {
    rpc(...a);
    return Promise.resolve(rpcAnswer);
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(client) }));
const gateV1 = vi.fn();
vi.mock("@/lib/v1Gate", () => ({ gateV1: (...a: unknown[]) => gateV1(...a) }));

const { GET } = await import("@/app/api/v1/serving/route");
const ask = (qs: string) => GET(new Request(`http://localhost/api/v1/serving${qs}`));

const mainRow = (id: string, name: string, level: string) => ({
  section: "main", contributor_id: id, full_name: name, contributor_slug: null, contributor_kind: null, contributor_category: null,
  avatar_url: null, logo_url: null, matched_area_id: AREA, matched_area_name: "Pretoria", matched_level: level,
  centre_area_name: null, radius_km: null, distance_km: null, presence: "online",
});

beforeEach(() => {
  rpc.mockReset(); eq.mockReset(); gateV1.mockReset();
  gateV1.mockResolvedValue({ key: null, identifier: "t" });
  areaAnswer = { data: { id: AREA, name: "Pretoria", slug: "pretoria", level: "place" }, error: null };
  rpcAnswer = { data: [], error: null };
});

describe("GET /api/v1/serving", () => {
  it("needs a uuid area, and never accepts coordinates", async () => {
    for (const qs of ["", "?area=", "?area=gauteng", "?lat=-25.7&lng=28.2", "?area=" + encodeURIComponent(AREA + " or 1=1")]) {
      expect((await ask(qs)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(gateV1).not.toHaveBeenCalled();
  });

  it("is rate limited per IP and per area, and a 429 reads nothing", async () => {
    gateV1.mockResolvedValue({ key: null, identifier: "t", deny: new Response("{}", { status: 429 }) });
    expect((await ask(`?area=${AREA.toUpperCase()}`)).status).toBe(429);
    expect(gateV1).toHaveBeenCalledWith(expect.anything(), { bucket: "v1-serving", resourceId: AREA });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks the database for this area with the cap of 5, and shapes the answer", async () => {
    rpcAnswer = {
      data: [
        mainRow(C1, "Zed", "place"),
        mainRow(C2, "Alpha", "suburb"),
        { ...mainRow(C1, "ignored", "place"), section: "also", radius_km: 50, distance_km: "22.4", centre_area_name: "Midrand", matched_area_id: null },
      ],
      error: null,
    };
    const res = await ask(`?area=${AREA}`);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("serving_area_listings", { p_area_id: AREA, p_also_limit: 5 });
    const j = await res.json();
    expect(j.data.area).toEqual({ id: AREA, name: "Pretoria", slug: "pretoria", level: "place" });
    expect(j.data.main.map((m: { name: string }) => m.name)).toEqual(["Alpha", "Zed"]); // suburb group first
    expect(j.data.also_served_by).toEqual([expect.objectContaining({ centre_name: "Midrand", radius_km: 50, distance_km: 22.4 })]);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=120");
  });

  it("carries the tag so a mobile ministry is never labelled Online", async () => {
    rpcAnswer = { data: [{ ...mainRow(C1, "Mobile Food Outreach", "place"), presence: "no_fixed_place" }, mainRow(C2, "Daily Word", "place")], error: null };
    const j = await (await ask(`?area=${AREA}`)).json();
    expect(j.data.main.map((m: { name: string; presence: string }) => [m.name, m.presence])).toEqual([["Daily Word", "online"], ["Mobile Food Outreach", "no_fixed_place"]]);
  });

  it("an area nobody serves is an empty list, not an error (the globe simply does not appear)", async () => {
    const j = await (await ask(`?area=${AREA}`)).json();
    expect(j.data.main).toEqual([]);
    expect(j.data.also_served_by).toEqual([]);
  });

  it("an unknown area is 404", async () => {
    areaAnswer = { data: null, error: null };
    expect((await ask(`?area=${AREA}`)).status).toBe(404);
  });

  it("a database error on either read is a generic 500", async () => {
    rpcAnswer = { data: null, error: { message: "secret detail" } };
    let res = await ask(`?area=${AREA}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
    rpcAnswer = { data: [], error: null };
    areaAnswer = { data: null, error: { message: "secret detail" } };
    res = await ask(`?area=${AREA}`);
    expect(res.status).toBe(500);
  });

  it("a malformed rpc payload (not an array) degrades to an empty list", async () => {
    rpcAnswer = { data: { oops: true }, error: null };
    const j = await (await ask(`?area=${AREA}`)).json();
    expect(j.data.main).toEqual([]);
  });
});
