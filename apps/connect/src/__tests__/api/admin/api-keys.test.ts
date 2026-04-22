import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// Disable the real rate limiter so heavy-bucket doesn't trip during tests.
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit",
  );
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }),
  };
});

const { POST, DELETE } = await import("@/app/api/admin/api-keys/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";

function jsonReq(body: unknown, method: "POST" | "DELETE" = "POST", qs = "") {
  return new NextRequest(`http://localhost/api/admin/api-keys${qs}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

describe("/api/admin/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the default `from()` chain result to an admin profile so
    // requireAdmin() passes unless a test overrides.
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: ADMIN_ID, email: "a@example.com" } },
      error: null,
    });
  });

  it("POST rejects unauthenticated users", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await POST(jsonReq({ name: "x" }));
    expect(res.status).toBe(401);
  });

  it("POST rejects non-admin users", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    const res = await POST(jsonReq({ name: "x" }));
    expect(res.status).toBe(403);
  });

  it("POST validates name is required", async () => {
    const res = await POST(jsonReq({ name: "", owner_email: "x@y.com" }));
    expect(res.status).toBe(400);
  });

  it("POST validates name length <= 80", async () => {
    const res = await POST(
      jsonReq({ name: "n".repeat(81), owner_email: "x@y.com" }),
    );
    expect(res.status).toBe(400);
  });

  it("POST rejects invalid scope pattern", async () => {
    const res = await POST(
      jsonReq({
        name: "test",
        owner_email: "x@y.com",
        scopes: ["INVALID SCOPE!!"],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("DELETE rejects missing id param", async () => {
    const res = await DELETE(jsonReq(null, "DELETE"));
    expect(res.status).toBe(400);
  });

  it("DELETE rejects non-admin", async () => {
    mockClient._chain._result.data = { role: "contributor" };
    const res = await DELETE(jsonReq(null, "DELETE", "?id=abc"));
    expect(res.status).toBe(403);
  });
});
