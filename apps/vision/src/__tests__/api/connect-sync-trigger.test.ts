import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  functions: { invoke: vi.fn() },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { POST } = await import("@/app/api/connect/sync/route");

const VALID_ORG = "550e8400-e29b-41d4-a716-446655440000";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/connect/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/connect/sync (manual trigger)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(postReq({ org_id: VALID_ORG }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await POST(postReq({ org_id: "not-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when caller is a viewer", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_viewer" } }),
    });
    const res = await POST(postReq({ org_id: VALID_ORG }));
    expect(res.status).toBe(403);
  });

  it("returns 502 when the edge function errors out", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }),
    });
    mockSupabase.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });

    const res = await POST(postReq({ org_id: VALID_ORG }));
    expect(res.status).toBe(502);
  });

  it("returns the edge function result for org_manager", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_manager" } }),
    });
    mockSupabase.functions.invoke.mockResolvedValueOnce({
      data: { ok: true, records_synced: 7 },
      error: null,
    });

    const res = await POST(postReq({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.records_synced).toBe(7);
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
      "sync-from-connect",
      { body: {} },
    );
  });
});
