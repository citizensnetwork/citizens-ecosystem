import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

// Keep ConnectApiError real (route uses `instanceof`); stub the network calls.
vi.mock("@/lib/connect/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/connect/api")>();
  return { ...actual, connectApi: { ...actual.connectApi, getEvent: vi.fn() } };
});

const { connectApi, ConnectApiError } = await import("@/lib/connect/api");
const getEvent = connectApi.getEvent as ReturnType<typeof vi.fn>;
const { PATCH } = await import("@/app/api/connect/events/[id]/route");

const validId = "550e8400-e29b-41d4-a716-446655440000";
const validOrg = "660e8400-e29b-41d4-a716-446655440000";

function createPatch(body: Record<string, unknown>) {
  return new NextRequest(new URL(`/api/connect/events/${validId}`, "http://localhost"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chainFrom(impls: Array<Record<string, unknown>>) {
  let i = 0;
  mockSupabase.from.mockImplementation(() => impls[Math.min(i++, impls.length - 1)]);
}

const roleChain = (role: string) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { role } }),
});

describe("PATCH /api/connect/events/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(createPatch({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid event ID", async () => {
    const res = await PATCH(createPatch({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: "bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing org_id", async () => {
    const res = await PATCH(createPatch({ action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin/manager", async () => {
    chainFrom([roleChain("org_member")]);
    const res = await PATCH(createPatch({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid action", async () => {
    chainFrom([roleChain("org_admin")]);
    const res = await PATCH(createPatch({ org_id: validOrg, action: "nope" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(400);
  });

  it("claims an event by inserting a claim row", async () => {
    chainFrom([
      roleChain("org_admin"),
      { insert: vi.fn().mockResolvedValue({ error: null }) },
      {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { cc_event_id: validId, cv_org_id: validOrg } }),
      },
    ]);
    const res = await PATCH(createPatch({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).cv_org_id).toBe(validOrg);
  });

  it("returns 409 when the event is already claimed by another org", async () => {
    chainFrom([
      roleChain("org_admin"),
      { insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }) },
      {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { cv_org_id: "other-org" } }),
      },
    ]);
    const res = await PATCH(createPatch({ org_id: validOrg, action: "claim" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(409);
  });

  it("promotes an event into an activity", async () => {
    getEvent.mockResolvedValue({
      data: {
        id: validId,
        title: "CC Event",
        description: "Desc",
        date: "2026-03-15T10:00:00Z",
        end_time: null,
        location: "Park",
        latitude: 51.5,
        longitude: -0.1,
        stats: { going: 10 },
      },
    });
    chainFrom([
      roleChain("org_admin"),
      { insert: vi.fn().mockResolvedValue({ error: null }) }, // claim insert
      {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "new-act-id" }, error: null }),
      }, // activities insert
      { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }, // claim link update
    ]);
    const res = await PATCH(createPatch({ org_id: validOrg, action: "promote" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.promoted).toBe(true);
    expect(body.activity.id).toBe("new-act-id");
  });

  it("returns 404 when promoting a non-existent Connect event", async () => {
    getEvent.mockRejectedValue(new ConnectApiError("Event not found", 404));
    chainFrom([roleChain("org_admin")]);
    const res = await PATCH(createPatch({ org_id: validOrg, action: "promote" }), {
      params: Promise.resolve({ id: validId }),
    });
    expect(res.status).toBe(404);
  });
});
