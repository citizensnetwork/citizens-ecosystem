import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { GET, POST } from "@/app/api/shared-metrics/route";

function buildChain(data: unknown = [], error: unknown = null) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

describe("GET /api/shared-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = new NextRequest("http://localhost/api/shared-metrics?partnership_id=00000000-0000-4000-a000-000000000001");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when partnership_id is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const req = new NextRequest("http://localhost/api/shared-metrics");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const req = new NextRequest("http://localhost/api/shared-metrics?partnership_id=not-a-uuid");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with shared metrics", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const chain = buildChain([{ id: "sm1", metric_slug: "total_activities", visible: true }]);
    mockFrom.mockReturnValue(chain);

    const req = new NextRequest(
      "http://localhost/api/shared-metrics?partnership_id=00000000-0000-4000-a000-000000000001"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shared_metrics).toHaveLength(1);
  });
});

describe("POST /api/shared-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = new NextRequest("http://localhost/api/shared-metrics", {
      method: "POST",
      body: JSON.stringify({ partnership_id: "00000000-0000-4000-a000-000000000001", metric_slug: "total" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid partnership_id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const req = new NextRequest("http://localhost/api/shared-metrics", {
      method: "POST",
      body: JSON.stringify({ partnership_id: "bad", metric_slug: "total" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing metric_slug", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const req = new NextRequest("http://localhost/api/shared-metrics", {
      method: "POST",
      body: JSON.stringify({ partnership_id: "00000000-0000-4000-a000-000000000001" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful create", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const chain = buildChain({ id: "sm1", metric_slug: "total", visible: true });
    mockFrom.mockReturnValue(chain);

    const req = new NextRequest("http://localhost/api/shared-metrics", {
      method: "POST",
      body: JSON.stringify({
        partnership_id: "00000000-0000-4000-a000-000000000001",
        metric_slug: "total_activities",
        visible: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const req = new NextRequest("http://localhost/api/shared-metrics", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
