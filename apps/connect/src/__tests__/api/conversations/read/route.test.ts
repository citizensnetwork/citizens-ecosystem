import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { PATCH } = await import("@/app/api/conversations/[id]/read/route");

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const CONV_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makeRequest(convId: string) {
  return new NextRequest(`http://localhost:3000/api/conversations/${convId}/read`, {
    method: "PATCH",
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/conversations/[id]/read", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await PATCH(makeRequest(CONV_ID), makeParams(CONV_ID));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid conversation ID", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makeRequest("bad-id"), makeParams("bad-id"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid conversation ID" });
  });

  it("returns 200 on successful mark-read", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });

    const response = await PATCH(makeRequest(CONV_ID), makeParams(CONV_ID));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("returns 500 on database error", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain._result = { data: null, error: { message: "DB error" }, count: 0 };

    const response = await PATCH(makeRequest(CONV_ID), makeParams(CONV_ID));
    expect(response.status).toBe(500);

    mockClient._chain._result = { data: null, error: null, count: 0 };
  });
});
