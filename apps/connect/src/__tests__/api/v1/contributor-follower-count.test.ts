import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * S13 (migration 185): the public follower number on GET /api/v1/contributors/<slug> comes from the
 * follower_count_public function, which returns a bucket (0 under 100, otherwise rounded down). The `follows` table
 * is readable only by the person who follows (migration s13c), so a route that goes back to counting its rows would
 * read 0 for every Contributor. The stand-in database records every call so a test can check WHAT WAS ASKED.
 */

const A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // the Contributor

type Call = { table: string; ops: [string, unknown[]][] };
let calls: Call[] = [];
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcAnswers: Record<string, { data: unknown; error: unknown }> = {};

function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { call.ops.push([op, args]); return chain; };
  for (const op of ["select", "eq", "gte", "lt", "lte", "in", "or", "not", "order", "range", "limit"]) chain[op] = record(op);
  chain.maybeSingle = () => Promise.resolve(table === "profiles" ? { data: { id: A, full_name: "Probe Org" }, error: null } : { data: null, error: null });
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej);
  return chain;
}
function rpc(fn: string, args: unknown) {
  rpcCalls.push({ fn, args });
  return Promise.resolve(rpcAnswers[fn] ?? { data: null, error: null });
}
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from, rpc }) }));
vi.mock("@/lib/v1Gate", () => ({ gateV1: vi.fn().mockResolvedValue({ key: null, identifier: "test" }) }));

const { GET } = await import("@/app/api/v1/contributors/[slug]/route");

const get = () => GET(new Request("http://localhost/api/v1/contributors/probe-org"), { params: Promise.resolve({ slug: "probe-org" }) });

beforeEach(() => {
  calls = [];
  rpcCalls = [];
  rpcAnswers = {};
});

describe("GET /api/v1/contributors/<slug>: counts.followers", () => {
  it("is the bucket returned by follower_count_public, asked for this Contributor", async () => {
    rpcAnswers.follower_count_public = { data: 250, error: null };
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data.counts.followers).toBe(250);
    expect(rpcCalls.filter((c) => c.fn === "follower_count_public")).toEqual([{ fn: "follower_count_public", args: { p_followee: A } }]);
  });

  it("never reads the follows table itself", async () => {
    rpcAnswers.follower_count_public = { data: 100, error: null };
    await get();
    // If this read comes back, the closed table answers nothing and every Contributor shows 0 followers.
    expect(calls.filter((c) => c.table === "follows")).toHaveLength(0);
    expect(calls.filter((c) => c.table === "place_follows")).toHaveLength(0);
  });

  it("is 0 when the function returns nothing or fails, and the profile still comes back", async () => {
    rpcAnswers.follower_count_public = { data: null, error: { message: "boom" } };
    const res = await get();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.counts.followers).toBe(0);
    expect(j.data.profile.id).toBe(A);
  });
});
