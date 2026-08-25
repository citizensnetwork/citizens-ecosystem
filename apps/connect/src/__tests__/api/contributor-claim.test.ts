import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/contributor/claim/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";

function req() {
  return new Request("http://localhost/api/contributor/claim", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("POST /api/contributor/claim", () => {
  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("returns 200 with the slug when a listing is claimed", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.slug).toBe("grace-outreach");
    expect(mockClient.rpc).toHaveBeenCalledWith("claim_admin_created_contributor");
  });

  it("returns 404 when there is nothing to claim", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: false, reason: "nothing_to_claim" },
      error: null,
    });
    const res = await POST(req());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("nothing_to_claim");
  });

  it("returns 409 when the caller is not eligible (already a contributor)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: false, reason: "not_eligible" },
      error: null,
    });
    const res = await POST(req());
    expect(res.status).toBe(409);
  });

  it("returns 500 when the RPC errors", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});
