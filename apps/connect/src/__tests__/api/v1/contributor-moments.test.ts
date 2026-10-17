import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Moments on the public read surface (tracker P2-05, migration 188): GET /api/v1/contributors/<slug> carries the notes
 * that are still live, newest first, at most 5. The stand-in database records every call, so a test can check WHAT WAS
 * ASKED (live only, this Contributor only, newest first) as well as what comes back.
 */

const A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // the Contributor
const NOW = Date.parse("2026-10-17T20:00:00Z");

type Call = { table: string; ops: [string, unknown[]][] };
let calls: Call[] = [];
let answers: Record<string, { data: unknown; error: unknown }> = {};

function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { call.ops.push([op, args]); return chain; };
  for (const op of ["select", "eq", "gt", "gte", "lt", "lte", "in", "or", "not", "order", "range", "limit"]) chain[op] = record(op);
  chain.maybeSingle = () => Promise.resolve(table === "profiles" ? { data: { id: A, full_name: "Probe Org" }, error: null } : { data: null, error: null });
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(answers[table] ?? { data: [], error: null, count: 0 }).then(res, rej);
  return chain;
}
const rpc = () => Promise.resolve({ data: 0, error: null });
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({ from, rpc }) }));
vi.mock("@/lib/v1Gate", () => ({ gateV1: vi.fn().mockResolvedValue({ key: null, identifier: "test" }) }));

const { GET } = await import("@/app/api/v1/contributors/[slug]/route");
const get = () => GET(new Request("http://localhost/api/v1/contributors/probe-org"), { params: Promise.resolve({ slug: "probe-org" }) });
const momentCalls = () => calls.filter((c) => c.table === "moments");
const op = (c: Call, name: string) => c.ops.filter(([n]) => n === name).map(([, a]) => a);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  calls = [];
  answers = {};
});

describe("GET /api/v1/contributors/<slug>: moments", () => {
  it("returns the live notes as the database gave them", async () => {
    const rows = [
      { id: "m2", body: "Second", image_url: null, created_at: "2026-10-17T19:00:00Z", expires_at: "2026-10-18T19:00:00Z" },
      { id: "m1", body: "First", image_url: "https://example.test/a.jpg", created_at: "2026-10-17T18:00:00Z", expires_at: "2026-10-18T18:00:00Z" },
    ];
    answers.moments = { data: rows, error: null };
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data.moments).toEqual(rows);
  });

  it("asks only for THIS Contributor's notes that have not ended, newest first, at most 5", async () => {
    await get();
    const c = momentCalls();
    expect(c).toHaveLength(1);
    expect(op(c[0], "eq")).toEqual([["contributor_id", A]]);
    expect(op(c[0], "gt")).toEqual([["expires_at", new Date(NOW).toISOString()]]);
    expect(op(c[0], "order")).toEqual([["created_at", { ascending: false }]]);
    expect(op(c[0], "limit")).toEqual([[5]]);
  });

  it("is an empty list when there are none", async () => {
    expect((await (await get()).json()).data.moments).toEqual([]);
  });

  it("a failed read of the notes never fails the profile: the rest still comes back", async () => {
    answers.moments = { data: null, error: { message: "boom" } };
    const res = await get();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.moments).toEqual([]);
    expect(j.data.profile.id).toBe(A);
  });
});
