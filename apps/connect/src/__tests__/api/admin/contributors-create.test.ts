import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();
const mockAdmin = {
  auth: {
    admin: {
      createUser: vi.fn(),
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
    },
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

const { POST } = await import("@/app/api/admin/contributors/create/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const NEW_USER_ID = "22222222-2222-2222-2222-222222222222";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/contributors/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  display_name: "Grace Outreach",
  claim_email: "org@example.com",
  contributor_kind: "ministry",
  contributor_category: "outreach-missions",
  bio: "We serve the community.",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  mockClient._chain._result.data = { role: "admin" };
  mockClient._chain._result.error = null;
  mockClient.auth.getUser.mockResolvedValue({
    data: { user: { id: ADMIN_ID, email: "admin@example.com" } },
    error: null,
  });
  mockAdmin.auth.admin.createUser.mockResolvedValue({
    data: { user: { id: NEW_USER_ID } },
    error: null,
  });
});

describe("POST /api/admin/contributors/create", () => {
  it("rejects non-admins", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(mockAdmin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rejects a missing display_name", async () => {
    const res = await POST(req({ ...validBody, display_name: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid claim_email", async () => {
    const res = await POST(req({ ...validBody, claim_email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown contributor_category", async () => {
    const res = await POST(req({ ...validBody, contributor_category: "not-real" }));
    expect(res.status).toBe(400);
  });

  it("creates the auth user then calls the profile RPC as the admin's own session", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.contributor_id).toBe(NEW_USER_ID);
    expect(json.slug).toBe("grace-outreach");

    expect(mockAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "org@example.com", email_confirm: true }),
    );
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "admin_create_contributor_profile",
      expect.objectContaining({
        _target_id: NEW_USER_ID,
        _display_name: "Grace Outreach",
        _claim_email: "org@example.com",
        _contributor_kind: "ministry",
        _contributor_category: "outreach-missions",
      }),
    );
  });

  it("nulls physical_address/lat/lng when no_fixed_location is set", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: true, slug: "grace-outreach" },
      error: null,
    });
    await POST(
      req({
        ...validBody,
        no_fixed_location: true,
        physical_address: "123 Main St",
        physical_latitude: -25.7,
        physical_longitude: 28.2,
      }),
    );
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "admin_create_contributor_profile",
      expect.objectContaining({
        _no_fixed_location: true,
        _physical_address: null,
        _physical_latitude: null,
        _physical_longitude: null,
      }),
    );
  });

  it("cleans up the auth user when the profile RPC fails", async () => {
    mockClient.rpc.mockResolvedValueOnce({
      data: { success: false, reason: "target_not_found" },
      error: null,
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
  });

  it("returns 409 when the email is already registered", async () => {
    mockAdmin.auth.admin.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Email address has already been registered" },
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(409);
  });
});
