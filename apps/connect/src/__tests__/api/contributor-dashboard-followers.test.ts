import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/rate-limit";

// The dashboard shows the exact follower count from follower_count_exact (migration 185), not from the follows table.

const CONTRIBUTOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

let tables: string[] = [];
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcAnswer: { data: unknown; error: unknown } = { data: null, error: null };

function from(table: string) {
  tables.push(table);
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "gte", "gt", "is", "order", "limit"]) chain[op] = () => chain;
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej);
  return chain;
}
function rpc(fn: string, args: unknown) {
  rpcCalls.push({ fn, args });
  return Promise.resolve(rpcAnswer);
}

vi.mock("@/lib/dashboard/access", () => ({
  checkDashboardAccess: vi.fn().mockResolvedValue({ hasAccess: true, contributorId: CONTRIBUTOR_ID }),
}));
vi.mock("@/lib/supabase/route", () => ({
  getRouteAuth: vi.fn().mockResolvedValue({ supabase: { from, rpc }, user: { id: USER_ID } }),
}));

const { GET } = await import("@/app/api/contributor/[handle]/dashboard/route");

const get = () =>
  GET(new NextRequest("http://localhost/api/contributor/test/dashboard"), { params: Promise.resolve({ handle: "test" }) });

beforeEach(() => {
  tables = [];
  rpcCalls = [];
  rpcAnswer = { data: null, error: null };
  resetRateLimitStore();
});

describe("GET /api/contributor/[handle]/dashboard: total_followers", () => {
  it("is the exact figure returned by follower_count_exact for this Contributor", async () => {
    rpcAnswer = { data: 321, error: null };
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).stats.total_followers).toBe(321);
    expect(rpcCalls).toEqual([{ fn: "follower_count_exact", args: { p_followee: CONTRIBUTOR_ID } }]);
  });

  it("does not read the follows table itself", async () => {
    rpcAnswer = { data: 5, error: null };
    await get();
    expect(tables).not.toContain("follows");
  });

  it("is 0 when the function returns nothing, and the rest of the dashboard still loads", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stats.total_followers).toBe(0);
    expect(j.stats.active_places).toBe(0);
  });
});
