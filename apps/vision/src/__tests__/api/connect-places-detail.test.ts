import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const singleMock = vi.fn();
const selectMock = vi.fn(() => ({ single: singleMock }));
const eqChain = vi.fn().mockReturnThis();
const updateMock = vi.fn(() => ({ eq: eqChain, select: selectMock }));

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: singleMock,
        })),
      })),
    })),
    update: updateMock,
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

import { PATCH } from "@/app/api/connect/places/[id]/route";

const user = { id: "user-1", email: "test@example.com" };

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/connect/places/p1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("PATCH /api/connect/places/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
  });

  it("returns 401 when not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(makeReq({ org_id: "00000000-0000-4000-a000-000000000001", action: "claim" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-a000-000000000002" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid place ID", async () => {
    const res = await PATCH(makeReq({ org_id: "00000000-0000-4000-a000-000000000001", action: "claim" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing org_id", async () => {
    const res = await PATCH(makeReq({ action: "claim" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-a000-000000000002" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin users", async () => {
    singleMock.mockResolvedValueOnce({ data: { role: "org_member" } });
    const res = await PATCH(makeReq({ org_id: "00000000-0000-4000-a000-000000000001", action: "claim" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-a000-000000000002" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid action", async () => {
    singleMock.mockResolvedValueOnce({ data: { role: "org_admin" } });

    const res = await PATCH(makeReq({ org_id: "00000000-0000-4000-a000-000000000001", action: "invalid" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-a000-000000000002" }),
    });
    expect(res.status).toBe(400);
  });
});
