import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET, POST, PATCH } = await import(
  "@/app/api/contributor/[handle]/access-requests/route"
);

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const CONTRIBUTOR_ID = "22222222-2222-2222-2222-222222222222";
const REQUEST_ID = "33333333-3333-3333-3333-333333333333";
const HANDLE = "kingdom-hub";

function makeParams() {
  return { params: Promise.resolve({ handle: HANDLE }) };
}

function makeReq(method: string = "GET", body?: Record<string, unknown>) {
  return new NextRequest("http://localhost", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function makeJsonReq(body: Record<string, unknown>) {
  return makeReq("PATCH", body);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("GET /api/contributor/[handle]/access-requests", () => {
  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-owner non-admin viewer", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "other-user" } },
      error: null,
    });
    mockClient._chain.maybeSingle
      // contributor lookup
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID, role: "contributor" }, error: null })
      // viewer profile
      .mockResolvedValueOnce({ data: { role: "citizen" }, error: null });
    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 404 when contributor handle does not exist", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/contributor/[handle]/access-requests", () => {
  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await POST(makeReq("POST"), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin viewer", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "citizen-user" } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "citizen" },
      error: null,
    });
    const res = await POST(makeReq("POST"), makeParams());
    expect(res.status).toBe(403);
  });

  it("returns 409 when a pending request already exists", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      // viewer profile (admin)
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null })
      // contributor lookup
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID }, error: null })
      // existing pending
      .mockResolvedValueOnce({
        data: { id: REQUEST_ID, status: "pending", expires_at: null, revoked_at: null },
        error: null,
      });
    const res = await POST(makeReq("POST"), makeParams());
    expect(res.status).toBe(409);
  });

  it("creates request and notifies the contributor on success", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null })
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: REQUEST_ID },
      error: null,
    });
    const insertSpy = mockClient._chain.insert as ReturnType<typeof vi.fn>;
    const res = await POST(makeReq("POST"), makeParams());
    expect(res.status).toBe(201);
    // The second insert call is the notification with data.url for the deep link
    const notifInsert = insertSpy.mock.calls.find((call) => {
      const arg = call[0] as Record<string, unknown> | undefined;
      return arg && arg.type === "admin_elevation_request";
    });
    expect(notifInsert).toBeTruthy();
    const notifArg = notifInsert?.[0] as { data: { url: string } };
    expect(notifArg.data.url).toBe(`/c/${HANDLE}/dashboard/settings`);
  });
});

describe("PATCH /api/contributor/[handle]/access-requests", () => {
  it("returns 400 for invalid request_id", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: CONTRIBUTOR_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID }, error: null })
      .mockResolvedValueOnce({ data: { role: "contributor" }, error: null });
    const res = await PATCH(makeJsonReq({ request_id: "not-a-uuid", action: "approve" }), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 400 on deny with too-short reason", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: CONTRIBUTOR_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID }, error: null })
      .mockResolvedValueOnce({ data: { role: "contributor" }, error: null });
    const res = await PATCH(
      makeJsonReq({ request_id: REQUEST_ID, action: "deny", reason: "no" }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("approve calls approve_dashboard_access RPC", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: CONTRIBUTOR_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID }, error: null })
      .mockResolvedValueOnce({ data: { role: "contributor" }, error: null });
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { admin_id: ADMIN_ID },
      error: null,
    });
    const res = await PATCH(
      makeJsonReq({ request_id: REQUEST_ID, action: "approve" }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    expect(mockClient.rpc).toHaveBeenCalledWith("approve_dashboard_access", {
      p_request_id: REQUEST_ID,
    });
  });

  it("admin revoke writes actor_role=admin to activity_log and notifies contributor", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID }, error: null })
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null });
    const insertSpy = mockClient._chain.insert as ReturnType<typeof vi.fn>;
    const res = await PATCH(
      makeJsonReq({ request_id: REQUEST_ID, action: "revoke" }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const activityLogCall = insertSpy.mock.calls.find((call) => {
      const arg = call[0] as Record<string, unknown> | undefined;
      return arg && arg.action === "dashboard_access_revoked";
    });
    expect(activityLogCall).toBeTruthy();
    const activityArg = activityLogCall?.[0] as { actor_role: string };
    expect(activityArg.actor_role).toBe("admin");

    const notifCall = insertSpy.mock.calls.find((call) => {
      const arg = call[0] as Record<string, unknown> | undefined;
      return arg && arg.type === "admin_on_behalf_action";
    });
    expect(notifCall).toBeTruthy();
    const notifArg = notifCall?.[0] as { user_id: string; data: { url: string } };
    expect(notifArg.user_id).toBe(CONTRIBUTOR_ID);
    expect(notifArg.data.url).toBe(`/c/${HANDLE}/dashboard/settings`);
  });

  it("returns 400 for unknown action", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: CONTRIBUTOR_ID }, error: null })
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null });
    const res = await PATCH(
      makeJsonReq({ request_id: REQUEST_ID, action: "noop" }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });
});
