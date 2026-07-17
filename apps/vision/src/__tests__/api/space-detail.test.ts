import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      update: () => ({ eq: () => ({ select: () => ({ single: () => mockUpdate() }) }) }),
      delete: () => ({ eq: () => mockDelete() }),
    }),
  }),
}));

const { PUT, DELETE } = await import("@/app/api/spaces/[id]/route");

const SP = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

function req(method: string, body?: unknown) {
  return new NextRequest(new URL("http://localhost/api/spaces/" + SP), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PUT /api/spaces/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockUpdate.mockResolvedValue({
      data: { id: SP, name: "Renamed", description: null, colour: "#4a90d9", icon: null, sort_order: 0 },
      error: null,
    });
  });

  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await PUT(req("PUT", { name: "X" }), ctx(SP))).status).toBe(401);
  });

  it("400 on invalid id", async () => {
    expect((await PUT(req("PUT", { name: "X" }), ctx("nope"))).status).toBe(400);
  });

  it("400 on empty patch", async () => {
    expect((await PUT(req("PUT", {}), ctx(SP))).status).toBe(400);
  });

  it("updates the space", async () => {
    const res = await PUT(req("PUT", { name: "Renamed" }), ctx(SP));
    expect(res.status).toBe(200);
    expect((await res.json()).data.name).toBe("Renamed");
  });

  it("404 when the row is hidden/absent (PGRST116)", async () => {
    mockUpdate.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    expect((await PUT(req("PUT", { name: "X" }), ctx(SP))).status).toBe(404);
  });

  it("403 on RLS denial", async () => {
    mockUpdate.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    expect((await PUT(req("PUT", { name: "X" }), ctx(SP))).status).toBe(403);
  });
});

describe("DELETE /api/spaces/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockDelete.mockResolvedValue({ error: null });
  });

  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await DELETE(req("DELETE"), ctx(SP))).status).toBe(401);
  });

  it("400 on invalid id", async () => {
    expect((await DELETE(req("DELETE"), ctx("nope"))).status).toBe(400);
  });

  it("deletes the space", async () => {
    const res = await DELETE(req("DELETE"), ctx(SP));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("403 on RLS denial", async () => {
    mockDelete.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    expect((await DELETE(req("DELETE"), ctx(SP))).status).toBe(403);
  });
});
