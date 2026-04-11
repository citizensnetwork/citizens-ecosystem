import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET } = await import("@/app/api/connect/events/route");

function createRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

describe("GET /api/connect/events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(createRequest("http://localhost/api/connect/events?org_id=550e8400-e29b-41d4-a716-446655440000"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(createRequest("http://localhost/api/connect/events"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(createRequest("http://localhost/api/connect/events?org_id=bad"));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-members", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const memberChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }) };
    mockSupabase.from.mockReturnValue(memberChain);

    const res = await GET(createRequest("http://localhost/api/connect/events?org_id=550e8400-e29b-41d4-a716-446655440000"));
    expect(res.status).toBe(403);
  });

  it("returns events for members", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const memberChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }) };
    const eventChain = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ cc_event_id: "e1", title: "CC Event" }],
        count: 1,
        error: null,
      }),
    };

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount++;
      return fromCallCount === 1 ? memberChain : eventChain;
    });

    const res = await GET(createRequest("http://localhost/api/connect/events?org_id=550e8400-e29b-41d4-a716-446655440000"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});
