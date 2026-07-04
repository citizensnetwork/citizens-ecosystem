import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  function makeChain() {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.gte = () => chain;
    chain.lte = () => chain;
    chain.not = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
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

const { GET } = await import("@/app/api/metrics/comparison/route");

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/metrics/comparison");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("GET /api/metrics/comparison", () => {
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

  it("returns 400 when org_id is invalid", async () => {
    const res = await GET(makeRequest({ org_id: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when period dates are missing", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when department_id is invalid UUID", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        period_a_from: "2026-01-01",
        period_a_to: "2026-01-31",
        period_b_from: "2026-02-01",
        period_b_to: "2026-02-28",
        department_id: "not-uuid",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with comparison data", async () => {
    const res = await GET(
      makeRequest({
        org_id: VALID_ORG,
        period_a_from: "2026-01-01",
        period_a_to: "2026-01-31",
        period_b_from: "2026-02-01",
        period_b_to: "2026-02-28",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("period_a");
    expect(data).toHaveProperty("period_b");
    expect(data).toHaveProperty("metrics");
  });
});
