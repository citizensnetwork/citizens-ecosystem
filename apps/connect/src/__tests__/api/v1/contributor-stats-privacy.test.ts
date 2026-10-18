import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Q3: GET /api/v1/contributors/<slug>/stats must not describe a hidden listing,
 * and it must return the bucket the RPC already computed (migration 192).
 * A route that drops contributor_hidden, or that counts follows itself, fails here.
 */

const ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

type Call = { table: string; ops: [string, unknown[]][] };
let calls: Call[] = [];
let rpcCalls: { fn: string; args: unknown }[] = [];
let profile: { id: string } | null = { id: ORG };
let rpcAnswer: { data: unknown; error: unknown } = {
  data: {
    total_events: 2,
    upcoming_events: 1,
    total_rsvps: 4,
    followers: 100,
  },
  error: null,
};

function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => {
    call.ops.push([op, args]);
    return chain;
  };
  for (const op of ["select", "eq", "is", "gt", "gte", "lt", "lte", "in", "or", "not", "order", "limit"]) {
    chain[op] = record(op);
  }
  chain.maybeSingle = () => Promise.resolve({ data: profile, error: null });
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(res, rej);
  return chain;
}

function rpc(fn: string, args: unknown) {
  rpcCalls.push({ fn, args });
  return Promise.resolve(rpcAnswer);
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from, rpc }) }));
vi.mock("@/lib/v1Gate", () => ({ gateV1: vi.fn().mockResolvedValue({ key: null, identifier: "test" }) }));

const { GET } = await import("@/app/api/v1/contributors/[slug]/stats/route");

const get = (slug = "probe-org") =>
  GET(new Request(`http://localhost/api/v1/contributors/${slug}/stats`), {
    params: Promise.resolve({ slug }),
  });

const eqs = () => calls.flatMap((c) => c.ops.filter(([op]) => op === "eq").map(([, args]) => args));

beforeEach(() => {
  calls = [];
  rpcCalls = [];
  profile = { id: ORG };
  rpcAnswer = {
    data: { total_events: 2, upcoming_events: 1, total_rsvps: 4, followers: 100 },
    error: null,
  };
});

describe("GET /api/v1/contributors/<slug>/stats", () => {
  it("asks only for an approved, visible, living Contributor and returns the RPC bucket", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.followers).toBe(100);
    expect(eqs()).toEqual(
      expect.arrayContaining([
        ["contributor_slug", "probe-org"],
        ["role", "contributor"],
        ["contributor_status", "approved"],
        ["contributor_hidden", false],
      ]),
    );
    expect(calls[0].ops).toContainEqual(["is", ["deleted_at", null]]);
    expect(rpcCalls).toEqual([{ fn: "get_contributor_public_stats", args: { p_org_id: ORG } }]);
    expect(calls.filter((c) => c.table === "follows")).toHaveLength(0);
  });

  it("answers 404 when the listing is hidden or otherwise not public, and does not call the RPC", async () => {
    profile = null;
    const res = await get("hidden-org");
    expect(res.status).toBe(404);
    expect(rpcCalls).toHaveLength(0);
    expect(eqs()).toContainEqual(["contributor_hidden", false]);
  });

  it("answers 404 when the RPC returns null, the same answer as a missing slug", async () => {
    rpcAnswer = { data: null, error: null };
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Contributor not found" });
  });

  it("answers 400 for an empty slug", async () => {
    const res = await get("   ");
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
