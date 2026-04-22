import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

// Extend mock chain with methods used by v1 routes but not in the
// default helper (`range`, `is`, `not`, `or`, `maybeSingle`).
const chain = mockClient._chain as unknown as Record<string, unknown>;
for (const m of ["range", "is", "not", "or"]) {
  chain[m] = vi.fn().mockReturnValue(chain);
}
chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// Bypass the v1 gate (rate limits, API-key resolution).
vi.mock("@/lib/v1Gate", () => ({
  gateV1: vi.fn().mockResolvedValue({ key: null, identifier: "test" }),
}));

const eventsMod = await import("@/app/api/v1/events/route");
const eventDetailMod = await import("@/app/api/v1/events/[id]/route");
const categoriesMod = await import("@/app/api/v1/categories/route");
const analyticsMod = await import("@/app/api/v1/analytics/community/route");

describe("/api/v1/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result = { data: [], error: null, count: 0 };
  });

  it("returns 200 with envelope + meta", async () => {
    const res = await eventsMod.GET(
      new Request("http://localhost/api/v1/events"),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toHaveProperty("data");
    expect(j).toHaveProperty("meta");
    expect(j.meta.limit).toBe(50);
    expect(j.meta.offset).toBe(0);
  });

  it("clamps oversized limit to 100", async () => {
    const res = await eventsMod.GET(
      new Request("http://localhost/api/v1/events?limit=10000"),
    );
    const j = await res.json();
    expect(j.meta.limit).toBe(100);
  });

  it("ignores invalid category silently", async () => {
    const res = await eventsMod.GET(
      new Request("http://localhost/api/v1/events?category=BAD CAT!!"),
    );
    expect(res.status).toBe(200);
  });

  it("ignores invalid created_by silently", async () => {
    const res = await eventsMod.GET(
      new Request("http://localhost/api/v1/events?created_by=not-a-uuid"),
    );
    expect(res.status).toBe(200);
  });
});

describe("/api/v1/events/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result = { data: null, error: null };
  });

  it("returns 400 on invalid UUID", async () => {
    const res = await eventDetailMod.GET(
      new Request("http://localhost/api/v1/events/abc"),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when event not found", async () => {
    mockClient._chain._result = { data: null, error: null };
    const VALID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    // Override maybeSingle + Promise.all of stats to be safe.
    mockClient._chain.single.mockResolvedValue({ data: null, error: null });
    // Extend with a no-op maybeSingle
    (mockClient._chain as unknown as Record<string, unknown>).maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });

    const res = await eventDetailMod.GET(
      new Request(`http://localhost/api/v1/events/${VALID}`),
      { params: Promise.resolve({ id: VALID }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("/api/v1/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result = { data: [], error: null, count: 0 };
  });

  it("returns 200 with data array", async () => {
    const res = await categoriesMod.GET(
      new Request("http://localhost/api/v1/categories"),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(Array.isArray(j.data)).toBe(true);
    expect(j.meta).toHaveProperty("count");
  });
});

describe("/api/v1/analytics/community", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result = { data: [], error: null, count: 0 };
  });

  it("clamps days to 365", async () => {
    const res = await analyticsMod.GET(
      new Request("http://localhost/api/v1/analytics/community?days=10000"),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.meta.days).toBe(365);
  });

  it("silently drops invalid metric filter", async () => {
    const res = await analyticsMod.GET(
      new Request(
        "http://localhost/api/v1/analytics/community?metric=DROP%20TABLE",
      ),
    );
    expect(res.status).toBe(200);
  });
});
