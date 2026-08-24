import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit",
  );
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }),
  };
});

const { POST } = await import("@/app/api/admin/contributors/hide/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_ID = "22222222-2222-2222-2222-222222222222";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/contributors/hide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/contributors/hide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: ADMIN_ID, email: "admin@example.com" } },
      error: null,
    });
  });

  it("rejects non-admin callers", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    const res = await POST(makeReq({ user_id: TARGET_ID, hidden: true }));
    expect(res.status).toBe(403);
  });

  it("rejects an invalid user_id", async () => {
    const res = await POST(makeReq({ user_id: "not-a-uuid", hidden: true }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean hidden value", async () => {
    const res = await POST(makeReq({ user_id: TARGET_ID, hidden: "yes" }));
    expect(res.status).toBe(400);
  });

  it("hides a contributor on success", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, user_id: TARGET_ID, hidden: true },
      error: null,
    });
    const res = await POST(makeReq({ user_id: TARGET_ID, hidden: true }));
    expect(mockClient.rpc).toHaveBeenCalledWith("set_contributor_hidden", {
      _user_id: TARGET_ID,
      _hidden: true,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.hidden).toBe(true);
  });

  it("returns 404 when the RPC reports not_found (not an approved contributor)", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: false, reason: "not_found" },
      error: null,
    });
    const res = await POST(makeReq({ user_id: TARGET_ID, hidden: false }));
    expect(res.status).toBe(404);
  });
});
