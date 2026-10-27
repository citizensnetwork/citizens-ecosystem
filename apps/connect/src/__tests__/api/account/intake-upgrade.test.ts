import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";

const USER_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "ab".repeat(32);
const HASH = createHash("sha256").update(TOKEN, "utf8").digest("hex");

const mockRpc = vi.fn();
const mockRemove = vi.fn().mockResolvedValue({ error: null });
const mockAdminRpc = vi.fn().mockResolvedValue({ error: null });
const mockGetRouteAuth = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/lib/supabase/route", () => ({
  getRouteAuth: (...args: unknown[]) => mockGetRouteAuth(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockAdminRpc,
    storage: { from: () => ({ remove: mockRemove }) },
  }),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const { POST } = await import("@/app/api/account/intake-upgrade/route");

function req(body: unknown) {
  return new Request("http://localhost/api/account/intake-upgrade", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  vi.stubEnv("ADMIN_NOTIFY_EMAIL", "admin@example.test");
  mockSendEmail.mockResolvedValue("sent");
  mockGetRouteAuth.mockResolvedValue({
    supabase: { rpc: mockRpc },
    user: { id: USER_ID, email: "owner@example.test" },
  });
});

describe("POST /api/account/intake-upgrade", () => {
  it("returns 401 when nobody is signed in", async () => {
    mockGetRouteAuth.mockResolvedValueOnce({ supabase: { rpc: mockRpc }, user: null });
    const res = await POST(req({ token: TOKEN, action: "preview" }));
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("previews the public fields and does not consume the token", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        status: "pending",
        display_name: "Example Fellowship",
        contributor_kind: "ministry",
        contributor_category: "churches-ministries",
        bio: "A neighbourhood fellowship.",
        no_fixed_location: false,
        physical_address: "1 Example Road",
        expires_at: "2026-11-01T00:00:00.000Z",
        logo_storage_path: "should-not-leak",
        request_id: "should-not-leak",
      },
      error: null,
    });
    const res = await POST(req({ token: TOKEN.toUpperCase(), action: "preview" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      status: "pending",
      display_name: "Example Fellowship",
      contributor_kind: "ministry",
      contributor_category: "churches-ministries",
      bio: "A neighbourhood fellowship.",
      no_fixed_location: false,
      physical_address: "1 Example Road",
      expires_at: "2026-11-01T00:00:00.000Z",
    });
    expect(JSON.stringify(json)).not.toContain("should-not-leak");
    expect(mockRpc).toHaveBeenCalledWith("preview_intake_upgrade", { _token_hash: HASH });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("confirms and sends the welcome email to the signed-in account", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        slug: "example-fellowship",
        display_name: "Example Fellowship",
        no_fixed_location: false,
        physical_latitude: -26.1,
        physical_longitude: 28.0,
      },
      error: null,
    });
    const res = await POST(req({ token: TOKEN, action: "confirm" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      status: "confirmed",
      slug: "example-fellowship",
      url: "http://localhost/c/example-fellowship",
      on_map: true,
      email: "sent",
    });
    expect(mockRpc).toHaveBeenCalledWith("confirm_intake_upgrade", { _token_hash: HASH });
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.test" }));
    const mail = mockSendEmail.mock.calls[0][0] as { text: string };
    expect(mail.text).toContain("http://localhost/c/example-fellowship");
  });

  it("declines without changing the account and flags the admin once", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        status: "declined",
        request_id: "55555555-5555-4555-8555-555555555555",
        notify_admin: true,
        display_name: "Example Fellowship",
        logo_storage_path: `${USER_ID}/intake-upgrade/66666666-6666-4666-8666-666666666666.png`,
      },
      error: null,
    });
    const res = await POST(req({ token: TOKEN, action: "decline" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "declined" });
    expect(mockRemove).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringMatching(/declined/i) }));
  });

  it("refuses the wrong account and an expired link", async () => {
    mockRpc.mockResolvedValueOnce({ data: { reason: "wrong_account" }, error: null });
    expect((await POST(req({ token: TOKEN, action: "confirm" }))).status).toBe(403);

    mockRpc.mockResolvedValueOnce({
      data: { reason: "expired", request_id: "55555555-5555-4555-8555-555555555555", notify_admin: true, display_name: "Example Fellowship" },
      error: null,
    });
    const expired = await POST(req({ token: TOKEN, action: "preview" }));
    expect(expired.status).toBe(410);
    expect((await expired.json()).error).toBe("expired");
  });

  it("rejects a token that is not 64 hex", async () => {
    const res = await POST(req({ token: "abc", action: "preview" }));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
