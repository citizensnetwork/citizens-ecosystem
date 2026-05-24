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
});
