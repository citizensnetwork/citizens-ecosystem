import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  }),
}));

const { GET } = await import("@/app/api/search/route");

const VALID_ORG = "11111111-1111-4111-8111-111111111111";
const VALID_USER = { id: "22222222-2222-4222-8222-222222222222" };

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/search");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest({ org_id: VALID_ORG, q: "town" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org_id is missing", async () => {
    const res = await GET(makeRequest({ q: "town" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when org_id is invalid UUID", async () => {
    const res = await GET(makeRequest({ org_id: "not-a-uuid", q: "town" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is shorter than 2 chars", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG, q: "x" }));
    expect(res.status).toBe(400);
  });

  it("queries all three entity types by default", async () => {
    const res = await GET(makeRequest({ org_id: VALID_ORG, q: "town" }));
    expect(res.status).toBe(200);
    const calls = mockRpc.mock.calls.map((c) => c[0]);
    expect(calls).toContain("search_activities_similar");
    expect(calls).toContain("search_projects_similar");
    expect(calls).toContain("search_goals_similar");
  });

  it("filters to a single type when types= is supplied", async () => {
    await GET(
      makeRequest({ org_id: VALID_ORG, q: "town", types: "activities" }),
    );
    const calls = mockRpc.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["search_activities_similar"]);
  });

  it("returns hits grouped by entity type", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "search_activities_similar") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              title: "Town Hall",
              description: null,
              date: "2026-01-10",
              type: "event",
              similarity_score: 0.5,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    const res = await GET(
      makeRequest({ org_id: VALID_ORG, q: "town", types: "activities" }),
    );
    const body = await res.json();
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].id).toBe("a1");
    expect(body.q).toBe("town");
  });

  it("returns 500 when an RPC fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("db down") });
    const res = await GET(makeRequest({ org_id: VALID_ORG, q: "town" }));
    expect(res.status).toBe(500);
  });
});
