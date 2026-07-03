import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// log_search_term is now a service-role-only RPC (migration 118), invoked
// through the admin client. Mock it so the fire-and-forget write resolves.
const mockAdminRpc = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: mockAdminRpc })),
}));

const { POST } = await import("@/app/api/ai-search/route");

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/ai-search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/ai-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty events + places datasets.
    mockClient._chain._result.data = [];
    mockClient._chain._result.error = null;
  });

  it("returns empty results for empty query", async () => {
    const res = await POST(req({ query: "" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toEqual([]);
    expect(json.places).toEqual([]);
    expect(json.intent).toBeNull();
  });

  it("returns 400 for non-JSON body", async () => {
    const bad = new NextRequest("http://localhost:3000/api/ai-search", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("returns 400 when query exceeds 500 chars", async () => {
    const res = await POST(req({ query: "a".repeat(501) }));
    expect(res.status).toBe(400);
  });

  it("echoes parsed intent tags for a signal query", async () => {
    mockClient._chain._result.data = [];
    const res = await POST(req({ query: "Homecells in my area" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.intent.needs).toContain("community");
    expect(json.intent.nearMe).toBe(true);
    expect(json.intent.hasSignal).toBe(true);
  });

  it("ranks candidates returned by Supabase", async () => {
    // First call (events), second call (places) both resolve to this list.
    mockClient._chain._result.data = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        title: "Homecell",
        description: "",
        date: "2030-01-01T00:00:00Z",
        end_time: null,
        location: "",
        category: "church-services",
        status: "published",
        visibility: "public",
        search_profile: { needs: ["community"] },
      },
    ];
    const res = await POST(req({ query: "homecells" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events.length).toBeGreaterThan(0);
    expect(json.events[0].id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("logs the search term via the service-role admin client, not the caller's client", async () => {
    const res = await POST(req({ query: "youth nights" }));
    expect(res.status).toBe(200);
    // Wait a microtask tick so the fire-and-forget logger runs.
    await Promise.resolve();
    expect(mockAdminRpc).toHaveBeenCalledWith("log_search_term", {
      p_term: "youth nights",
    });
    // The caller's (anon/authenticated) client must NOT be used for logging —
    // that was the pre-118 poisoning vector.
    expect(mockClient.rpc).not.toHaveBeenCalledWith(
      "log_search_term",
      expect.anything(),
    );
  });
});
