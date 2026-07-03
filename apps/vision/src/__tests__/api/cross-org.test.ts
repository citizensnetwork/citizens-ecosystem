import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  function makeChain() {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.or = () => chain;
    chain.gte = () => chain;
    chain.lte = () => chain;
    chain.order = () => chain;
    chain.then = (cb: (v: { data: unknown[]; error: null }) => unknown) =>
      cb({ data: [], error: null });
    chain.catch = () => chain;
    chain.finally = () => chain;
    return chain;
  }

  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: () => mockGetUser() },
      from: () => ({
        select: () => makeChain(),
      }),
    }),
  };
});

const { GET } = await import("@/app/api/metrics/cross-org/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/cross-org");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("GET /api/metrics/cross-org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org_id is missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    const res = await GET(makeRequest({ org_id: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with cross-org metrics", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("partner_count");
    expect(data).toHaveProperty("total_activities");
    expect(data).toHaveProperty("partners");
  });
});
