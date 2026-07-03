import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET, POST } = await import("@/app/api/tags/route");

const USER_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("GET /api/tags", () => {
  it("returns tag list (empty)", async () => {
    mockClient._chain._result.data = [];
    const res = await GET(new Request("http://localhost/api/tags") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tags).toEqual([]);
  });

  it("clamps limit to a safe upper bound", async () => {
    mockClient._chain._result.data = [];
    const limitSpy = mockClient._chain.limit as ReturnType<typeof vi.fn>;
    await GET(new Request("http://localhost/api/tags?limit=999") as never);
    // The handler clamps to 25.
    expect(limitSpy).toHaveBeenCalledWith(25);
  });

  it("escapes ilike wildcards in the query string", async () => {
    mockClient._chain._result.data = [];
    const ilikeSpy = vi.fn().mockReturnValue(mockClient._chain);
    (mockClient._chain as unknown as Record<string, unknown>).ilike = ilikeSpy;
    await GET(new Request("http://localhost/api/tags?q=foo%25bar") as never);
    expect(ilikeSpy).toHaveBeenCalledWith("label", "foo\\%bar%");
  });
});

describe("POST /api/tags", () => {
  function makeReq(body: unknown) {
    return new Request("http://localhost/api/tags", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns 401 when not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeReq({ label: "worship" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid label", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(makeReq({ label: "" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when label can't be slugified", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(makeReq({ label: "!!!" }) as never);
    expect(res.status).toBe(400);
  });
});
