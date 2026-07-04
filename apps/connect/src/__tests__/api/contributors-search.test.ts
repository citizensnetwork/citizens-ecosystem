/**
 * Tests for GET /api/contributors/search — the typo-tolerant
 * (pg_trgm-backed) contributor directory endpoint that powers the
 * "Organisations" tab on the events map search bar (FEAT-03 / Batch 3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

// The route uses a bare anon client from @supabase/supabase-js (no
// cookies), so we mock that module directly. Required env vars are
// stubbed so the lazy singleton constructor doesn't throw.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockClient),
}));

const { GET } = await import("@/app/api/contributors/search/route");

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  mockClient.rpc.mockResolvedValue({ data: [], error: null });
});

function makeReq(qs: string) {
  return new Request(`http://localhost/api/contributors/search${qs}`) as never;
}

describe("GET /api/contributors/search", () => {
  it("returns 200 with empty data when no rows match", async () => {
    const res = await GET(makeReq("?q=zzz"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
    expect(json.meta.q).toBe("zzz");
    expect(json.meta.limit).toBe(25);
    expect(json.meta.sort).toBe("auto");
  });

  it("forwards typo-tolerant query, kinds, location and category to the RPC", async () => {
    mockClient.rpc.mockResolvedValue({
      data: [
        {
          id: "p1",
          full_name: "Every Nation Mooikloof",
          contributor_slug: "every-nation",
          contributor_kind: "ministry",
          similarity: 0.43,
        },
      ],
      error: null,
    });

    const res = await GET(
      makeReq(
        "?q=evry%20naton&kinds=ministry,business&location=Pretoria&category=worship&sort=similarity&limit=10",
      ),
    );
    expect(res.status).toBe(200);
    expect(mockClient.rpc).toHaveBeenCalledWith("search_contributors", {
      q: "evry naton",
      kinds: ["ministry", "business"],
      location_query: "Pretoria",
      category_slug: "worship",
      sort_by: "similarity",
      result_limit: 10,
    });
  });

  it("drops unknown kind values silently and falls back to null when none remain", async () => {
    await GET(makeReq("?kinds=hacker,wizard"));
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "search_contributors",
      expect.objectContaining({ kinds: null }),
    );
  });

  it("clamps the limit to [1, 50] and rejects garbage", async () => {
    await GET(makeReq("?limit=9999"));
    expect(mockClient.rpc).toHaveBeenLastCalledWith(
      "search_contributors",
      expect.objectContaining({ result_limit: 50 }),
    );

    await GET(makeReq("?limit=-3"));
    expect(mockClient.rpc).toHaveBeenLastCalledWith(
      "search_contributors",
      expect.objectContaining({ result_limit: 1 }),
    );

    await GET(makeReq("?limit=banana"));
    expect(mockClient.rpc).toHaveBeenLastCalledWith(
      "search_contributors",
      expect.objectContaining({ result_limit: 25 }),
    );
  });

  it("falls back to sort=auto for unknown sort values", async () => {
    await GET(makeReq("?sort=chaos"));
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "search_contributors",
      expect.objectContaining({ sort_by: "auto" }),
    );
  });

  it("truncates oversized q and location to their max lengths", async () => {
    const longQ = "a".repeat(500);
    const longLoc = "b".repeat(500);
    await GET(makeReq(`?q=${longQ}&location=${longLoc}`));
    const callArgs = mockClient.rpc.mock.calls[0][1] as {
      q: string;
      location_query: string;
    };
    expect(callArgs.q.length).toBe(100);
    expect(callArgs.location_query.length).toBe(100);
  });

  it("returns 500 when the RPC errors", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    // Silence the route's console.error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(makeReq("?q=x"));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });

  it("rate-limits per IP", async () => {
    // The read budget is 120/min — exhaust it deliberately.
    const req = (i: number) =>
      new Request("http://localhost/api/contributors/search", {
        headers: { "x-forwarded-for": `9.9.9.${i % 256}` },
      }) as never;
    // Send 121 from a single IP to trip the limiter.
    const same = () =>
      new Request("http://localhost/api/contributors/search", {
        headers: { "x-forwarded-for": "9.9.9.1" },
      }) as never;
    for (let i = 0; i < 120; i++) {
      await GET(same());
    }
    const res = await GET(same());
    expect(res.status).toBe(429);

    // Different IP is still allowed
    const res2 = await GET(req(2));
    expect(res2.status).toBe(200);
  });
});
