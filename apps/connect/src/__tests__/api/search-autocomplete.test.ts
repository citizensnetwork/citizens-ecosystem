import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET } = await import("@/app/api/search/autocomplete/route");

function makeReq(q: string, extra = "") {
  return new NextRequest(
    `http://localhost/api/search/autocomplete?q=${encodeURIComponent(q)}${extra}`,
    { headers: { "x-forwarded-for": "5.5.5.5" } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("GET /api/search/autocomplete", () => {
  it("returns an empty list for a prefix shorter than 2 chars without hitting the RPC", async () => {
    const res = await GET(makeReq("a"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestions).toEqual([]);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects an over-long prefix", async () => {
    const res = await GET(makeReq("x".repeat(81)));
    expect(res.status).toBe(400);
  });

  it("returns merged suggestions from the RPC", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: [
        { suggestion: "healing rooms", source: "keyword" },
        { suggestion: "healing service", source: "popular" },
      ],
      error: null,
    });
    const res = await GET(makeReq("heal"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestions).toHaveLength(2);
    expect(json.suggestions[0].source).toBe("keyword");
    // RPC called with the sanitised prefix + a clamped limit.
    const [fn, args] = mockClient.rpc.mock.calls[0]!;
    expect(fn).toBe("get_search_autocomplete");
    expect((args as { p_prefix: string }).p_prefix).toBe("heal");
  });

  it("degrades gracefully to an empty list when the RPC errors", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const res = await GET(makeReq("market"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestions).toEqual([]);
  });
});
