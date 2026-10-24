import { describe, it, expect, vi, beforeEach } from "vitest";

/** GET /api/v1/service-areas: the public hierarchy. The database is a recording stand-in (what was asked matters as much as the answer). */
type Call = { table: string; ops: [string, unknown[]][] };
let calls: Call[] = [];
let answer: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 };

function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { call.ops.push([op, args]); return chain; };
  for (const op of ["select", "eq", "in", "order", "range"]) chain[op] = record(op);
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(answer).then(res, rej);
  return chain;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from }) }));
const gateV1 = vi.fn();
vi.mock("@/lib/v1Gate", () => ({ gateV1: (...a: unknown[]) => gateV1(...a) }));

const { GET } = await import("@/app/api/v1/service-areas/route");
const ask = (qs = "") => GET(new Request(`http://localhost/api/v1/service-areas${qs}`));
const op = (name: string) => calls[0]!.ops.filter(([n]) => n === name).map(([, a]) => a);
const P = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

beforeEach(() => {
  calls = [];
  answer = { data: [{ id: P, level: "place", name: "Pretoria" }], error: null, count: 1 };
  gateV1.mockReset();
  gateV1.mockResolvedValue({ key: null, identifier: "t" });
});

describe("GET /api/v1/service-areas", () => {
  it("defaults to provinces and cities/towns only (suburbs are opt-in), read through the rate-limit gate", async () => {
    const res = await ask();
    expect(res.status).toBe(200);
    expect(gateV1).toHaveBeenCalledWith(expect.anything(), { bucket: "v1-service-areas" });
    expect(calls[0]!.table).toBe("service_areas");
    expect(op("in")).toEqual([["level", ["province", "place"]]]);
    expect(await res.json()).toEqual({ data: answer.data, meta: { count: 1, limit: 500, offset: 0 } });
  });

  it("is cacheable at the edge for an hour and sets no cookie", async () => {
    const res = await ask();
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=3600, stale-while-revalidate=86400");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("selects only hierarchy columns: nothing about any Contributor", async () => {
    await ask();
    const cols = String(op("select")[0]![0]);
    expect(cols).toContain("centroid_lat");
    expect(cols).not.toMatch(/contributor|email|profile/i);
    expect(gateV1).toHaveBeenCalledTimes(1);
  });

  it("?parent= asks for that area's children and not the default level filter", async () => {
    await ask(`?parent=${P.toUpperCase()}`);
    expect(op("eq")).toEqual([["parent_id", P]]);
    expect(op("in")).toEqual([]);
  });

  it("?level= filters to one level", async () => {
    await ask("?level=suburb");
    expect(op("eq")).toEqual([["level", "suburb"]]);
    expect(op("in")).toEqual([]);
  });

  it("rejects a bad parent or level before touching the database", async () => {
    expect((await ask("?parent=gauteng")).status).toBe(400);
    expect((await ask("?level=galaxy")).status).toBe(400);
    expect((await ask("?parent=%27%3Bdrop%20table")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("clamps limit and offset", async () => {
    await ask("?limit=999999&offset=-4");
    expect(op("range")).toEqual([[0, 999]]);
    calls = [];
    await ask("?limit=abc");
    expect(op("range")).toEqual([[0, 499]]);
  });

  it("answers 429 from the gate without reading anything", async () => {
    gateV1.mockResolvedValue({ key: null, identifier: "t", deny: new Response("{}", { status: 429 }) });
    expect((await ask()).status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it("a database error is a generic 500 that leaks nothing", async () => {
    answer = { data: null, error: { message: "relation \"secret\" exploded" } };
    const res = await ask();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret|exploded/);
  });
});
