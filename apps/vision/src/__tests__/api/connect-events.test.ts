import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ConnectApiError } from "@/lib/connect/api";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const mockFeed = {
  getOrgConnectContributorId: vi.fn(),
  listOrgConnectEvents: vi.fn(),
  listOrgConnectPlaces: vi.fn(),
};
vi.mock("@/lib/connect/feed", () => mockFeed);

const { GET } = await import("@/app/api/connect/events/route");

const validOrg = "550e8400-e29b-41d4-a716-446655440000";

function req(query = `?org_id=${validOrg}`) {
  return new NextRequest(new URL(`/api/connect/events${query}`, "http://localhost"));
}

function membership(data: unknown) {
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data }),
  });
}

describe("GET /api/connect/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFeed.getOrgConnectContributorId.mockResolvedValue("contrib-1");
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(req())).status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    expect((await GET(req(""))).status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    expect((await GET(req("?org_id=bad"))).status).toBe(400);
  });

  it("returns 403 for non-members", async () => {
    membership(null);
    expect((await GET(req())).status).toBe(403);
  });

  it("returns the org's events for members", async () => {
    membership({ role: "org_member" });
    mockFeed.listOrgConnectEvents.mockResolvedValue({
      events: [{ cc_event_id: "e1", cv_org_id: null }],
      total: 1,
      linked: true,
    });
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.linked).toBe(true);
  });

  it("filters to claimed events with claimed=true", async () => {
    membership({ role: "org_member" });
    mockFeed.listOrgConnectEvents.mockResolvedValue({
      events: [
        { cc_event_id: "e1", cv_org_id: validOrg },
        { cc_event_id: "e2", cv_org_id: null },
      ],
      total: 2,
      linked: true,
    });
    const body = await (await GET(req(`?org_id=${validOrg}&claimed=true`))).json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].cc_event_id).toBe("e1");
  });

  it("returns 502 when the Connect API is unavailable", async () => {
    membership({ role: "org_member" });
    mockFeed.listOrgConnectEvents.mockRejectedValue(
      new ConnectApiError("down", 502)
    );
    expect((await GET(req())).status).toBe(502);
  });
});
