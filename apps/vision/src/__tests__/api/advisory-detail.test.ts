import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { PATCH } = await import("@/app/api/advisory/[id]/route");

function createPatch(url: string, body: Record<string, unknown>) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validId = "550e8400-e29b-41d4-a716-446655440000";
const validOrg = "660e8400-e29b-41d4-a716-446655440000";

describe("PATCH /api/advisory/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const req = createPatch(`http://localhost/api/advisory/${validId}`, { org_id: validOrg, action: "dismiss" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = createPatch("http://localhost/api/advisory/bad", { org_id: validOrg, action: "dismiss" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "bad" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = createPatch(`http://localhost/api/advisory/${validId}`, { action: "dismiss" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin/manager", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }) };
    mockSupabase.from.mockReturnValue(chain);

    const req = createPatch(`http://localhost/api/advisory/${validId}`, { org_id: validOrg, action: "dismiss" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid action", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }) };
    mockSupabase.from.mockReturnValue(chain);

    const req = createPatch(`http://localhost/api/advisory/${validId}`, { org_id: validOrg, action: "invalid" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(400);
  });

  it("dismisses advisory successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const roleChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }) };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: validId, dismissed: true, dismissed_notes: "resolved" },
        error: null,
      }),
    };

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? roleChain : updateChain;
    });

    const req = createPatch(`http://localhost/api/advisory/${validId}`, { org_id: validOrg, action: "dismiss", notes: "resolved" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dismissed).toBe(true);
  });
});
