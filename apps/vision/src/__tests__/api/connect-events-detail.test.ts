import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { PATCH } = await import("@/app/api/connect/events/[id]/route");

function createPatch(url: string, body: Record<string, unknown>) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validId = "550e8400-e29b-41d4-a716-446655440000";
const validOrg = "660e8400-e29b-41d4-a716-446655440000";

describe("PATCH /api/connect/events/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const req = createPatch(`http://localhost/api/connect/events/${validId}`, { org_id: validOrg, action: "claim" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = createPatch("http://localhost/api/connect/events/bad", { org_id: validOrg, action: "claim" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "bad" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = createPatch(`http://localhost/api/connect/events/${validId}`, { action: "claim" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin/manager", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }) };
    mockSupabase.from.mockReturnValue(chain);

    const req = createPatch(`http://localhost/api/connect/events/${validId}`, { org_id: validOrg, action: "claim" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid action", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }) };
    mockSupabase.from.mockReturnValue(chain);

    const req = createPatch(`http://localhost/api/connect/events/${validId}`, { org_id: validOrg, action: "invalid" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(400);
  });

  it("claims an event successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const roleChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }) };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { cc_event_id: validId, cv_org_id: validOrg }, error: null }),
    };

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? roleChain : updateChain;
    });

    const req = createPatch(`http://localhost/api/connect/events/${validId}`, { org_id: validOrg, action: "claim" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cv_org_id).toBe(validOrg);
  });

  it("promotes an event to activity", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const roleChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }) };
    const fetchChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          cc_event_id: validId, title: "CC Event", description: "Desc", date: "2025-03-15T10:00:00Z",
          end_time: null, location: "Park", latitude: 51.5, longitude: -0.1, rsvp_count: 10,
          cv_project_id: null,
        },
        error: null,
      }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "new-act-id", title: "CC Event" },
        error: null,
      }),
    };
    const mirrorUpdateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleChain;       // user_org_roles
      if (callCount === 2) return fetchChain;       // cc_events_mirror select
      if (callCount === 3) return insertChain;      // activities insert
      return mirrorUpdateChain;                      // cc_events_mirror update
    });

    const req = createPatch(`http://localhost/api/connect/events/${validId}`, { org_id: validOrg, action: "promote" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promoted).toBe(true);
    expect(body.activity.id).toBe("new-act-id");
  });

  it("returns 404 when promoting non-existent event", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const roleChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }) };
    const fetchChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? roleChain : fetchChain;
    });

    const req = createPatch(`http://localhost/api/connect/events/${validId}`, { org_id: validOrg, action: "promote" });
    const res = await PATCH(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(404);
  });
});
