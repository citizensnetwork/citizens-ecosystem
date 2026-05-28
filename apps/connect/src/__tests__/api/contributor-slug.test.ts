import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// `checkDashboardAccess` calls createClient internally — same mock client is
// returned so we can drive its responses per-test. We mock it directly to
// avoid stepping through the multi-step DB chain inside that helper for
// every test case.
const accessMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dashboard/access", () => ({
  checkDashboardAccess: accessMock,
}));

const activityMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dashboard/activity", () => ({
  recordContributorMutation: activityMock,
}));

const { PATCH } = await import("@/app/api/contributor/[handle]/slug/route");

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_ID = "22222222-2222-2222-2222-222222222222";
const CONTRIBUTOR_ID = "33333333-3333-3333-3333-333333333333";
const HANDLE = "old-handle";

function makeReq(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/contributor/old-handle/slug", {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function makeParams() {
  return { params: Promise.resolve({ handle: HANDLE }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("PATCH /api/contributor/[handle]/slug — owner path", () => {
  it("returns 403 when checkDashboardAccess denies", async () => {
    accessMock.mockResolvedValueOnce({ hasAccess: false });
    const res = await PATCH(makeReq({ new_slug: "new-handle" }), makeParams());
    expect(res.status).toBe(403);
  });

  it("rejects an invalid slug format", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
    const res = await PATCH(
      makeReq({ new_slug: "-bad-leading-hyphen" }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects unchanged slug", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
    const res = await PATCH(makeReq({ new_slug: HANDLE }), makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 429 when within 30-day cooldown", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
    // Set last change to 5 days ago
    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: {
        contributor_slug: HANDLE,
        handle_changed_at: fiveDaysAgo,
      },
      error: null,
    });
    const res = await PATCH(
      makeReq({ new_slug: "fresh-name" }),
      makeParams(),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.retry_after_days).toBeGreaterThan(0);
  });

  it("updates the slug and logs activity when cooldown expired", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
    // Last change > 30 days ago
    const longAgo = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { contributor_slug: HANDLE, handle_changed_at: longAgo },
      error: null,
    });
    // Subsequent UPDATE chain resolves with no error
    mockClient._chain._result.error = null;
    const res = await PATCH(
      makeReq({ new_slug: "fresh-name" }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("fresh-name");
    expect(body.admin_override).toBe(false);
    expect(activityMock).toHaveBeenCalledOnce();
  });

  it("translates 23505 duplicate-key to 409", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: true,
      isAdminWithAccess: false,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: OWNER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { contributor_slug: HANDLE, handle_changed_at: null },
      error: null,
    });
    // UPDATE returns a unique-violation
    mockClient._chain._result.error = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    };
    const res = await PATCH(
      makeReq({ new_slug: "taken-name" }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    // reset for next tests
    mockClient._chain._result.error = null;
  });
});

describe("PATCH /api/contributor/[handle]/slug — admin override path", () => {
  it("requires a reason from admin override callers", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: true,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    const res = await PATCH(
      makeReq({ new_slug: "forced-name" }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reason is required/i);
  });

  it("calls admin_change_contributor_slug RPC when reason provided", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: true,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: "forced-name",
      error: null,
    });
    const res = await PATCH(
      makeReq({
        new_slug: "forced-name",
        reason: "user requested support",
      }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("forced-name");
    expect(body.admin_override).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "admin_change_contributor_slug",
      {
        p_contributor_id: CONTRIBUTOR_ID,
        p_new_slug: "forced-name",
        p_reason: "user requested support",
      },
    );
  });

  it("maps RPC 23505 (slug_taken) to 409", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: true,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "slug_taken" },
    });
    const res = await PATCH(
      makeReq({
        new_slug: "taken-name",
        reason: "fixing typo",
      }),
      makeParams(),
    );
    expect(res.status).toBe(409);
  });

  it("maps RPC 42501 (admin_only) to 403", async () => {
    accessMock.mockResolvedValueOnce({
      hasAccess: true,
      isOwner: false,
      isAdminWithAccess: true,
      contributorId: CONTRIBUTOR_ID,
    });
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "admin_only" },
    });
    const res = await PATCH(
      makeReq({
        new_slug: "forced-name",
        reason: "test",
      }),
      makeParams(),
    );
    expect(res.status).toBe(403);
  });
});
