import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/contributor/apply/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/contributor/apply", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("POST /api/contributor/apply", () => {
  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await POST(makeReq({ display_name: "Hope" }));
    expect(res.status).toBe(401);
  });

  it("returns 409 when already approved contributor", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // first maybySingle → profile.contributor_status = "approved", role = "contributor"
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { contributor_status: "approved", role: "contributor" },
      error: null,
    });
    const res = await POST(makeReq({ display_name: "Hope Ministries" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("already_approved");
  });

  it("returns 409 when pending application already exists", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      // profiles.contributor_status
      .mockResolvedValueOnce({ data: { contributor_status: "pending" }, error: null })
      // existing pending
      .mockResolvedValueOnce({ data: { id: "app-1" }, error: null });
    const res = await POST(makeReq({ display_name: "Kingdom Hub" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("already_pending");
  });

  it("returns 400 when display_name is too short", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { contributor_status: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(makeReq({ display_name: "H" }));
    expect(res.status).toBe(400);
  });

  it("inserts and returns success on valid payload", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { contributor_status: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: "new-app-id" },
      error: null,
    });
    const res = await POST(
      makeReq({
        display_name: "Kingdom Hub",
        contributor_kind: "ministry",
        motivation_text: "We host weekly community meals and outreach.",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.application_id).toBe("new-app-id");
  });

  it("rejects invalid contributor_kind by coercing to null", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { contributor_status: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: "id-2" },
      error: null,
    });
    const insertSpy = mockClient._chain.insert as ReturnType<typeof vi.fn>;
    await POST(
      makeReq({
        display_name: "Valid Name",
        contributor_kind: "admin", // not in allow-list
      }),
    );
    const insertedRow = insertSpy.mock.calls.at(-1)?.[0];
    expect(insertedRow?.contributor_kind).toBeNull();
  });

  it("accepts a known contributor_category and coerces an unknown one to null", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { contributor_status: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: "id-3" },
      error: null,
    });
    const insertSpy = mockClient._chain.insert as ReturnType<typeof vi.fn>;
    await POST(
      makeReq({
        display_name: "Grace Hub",
        contributor_category: "worship-prayer",
        physical_latitude: -25.7479,
        physical_longitude: 28.2293,
      }),
    );
    const insertedRow = insertSpy.mock.calls.at(-1)?.[0];
    expect(insertedRow?.contributor_category).toBe("worship-prayer");
    expect(insertedRow?.physical_latitude).toBe(-25.7479);
    expect(insertedRow?.physical_longitude).toBe(28.2293);

    resetRateLimitStore();
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { contributor_status: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: "id-4" },
      error: null,
    });
    await POST(
      makeReq({
        display_name: "Grace Hub Two",
        contributor_category: "not-a-real-category",
        physical_latitude: "not-a-number",
      }),
    );
    const secondRow = insertSpy.mock.calls.at(-1)?.[0];
    expect(secondRow?.contributor_category).toBeNull();
    expect(secondRow?.physical_latitude).toBeNull();
  });

  it("v1 self-serve: calls self_approve_contributor_application after insert and surfaces the result", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { contributor_status: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: "new-app-id" },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, action: "approved", slug: "grace-hub", user_id: USER_ID },
      error: null,
    });
    const res = await POST(makeReq({ display_name: "Grace Hub" }));
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "self_approve_contributor_application",
      { _application_id: "new-app-id" },
    );
    const json = await res.json();
    expect(json.approved).toBe(true);
    expect(json.slug).toBe("grace-hub");
  });

  it("v1 self-serve: a failed self-approve RPC still returns 200 with approved:false (non-fatal, matches the applications-audit-trail precedent)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { contributor_status: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: "new-app-id-2" },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const res = await POST(makeReq({ display_name: "Grace Hub Two" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.approved).toBe(false);
    expect(json.slug).toBeNull();
  });
});
