import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { signIntake } from "@/lib/intake/googleForm";

const SECRET = "b".repeat(64);
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const PROFILE_ID = "44444444-4444-4444-8444-444444444444";

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();
const mockRemove = vi.fn().mockResolvedValue({ error: null });
const mockSendEmail = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
    storage: { from: () => ({ remove: mockRemove }) },
  }),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const statusRoute = await import("@/app/api/intake/google-form/status/route");
const resendRoute = await import("@/app/api/intake/google-form/resend/route");

function signed(path: string, body: unknown) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Intake-Timestamp": ts,
      "X-Intake-Signature": signIntake(SECRET, ts, raw),
    },
    body: raw,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
  vi.stubEnv("INTAKE_WEBHOOK_SECRET", SECRET);
  mockSendEmail.mockResolvedValue("sent");
  mockMaybeSingle.mockResolvedValue({ data: { email: "owner@example.test" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/intake/google-form/status", () => {
  it("rejects a missing signature", async () => {
    const res = await statusRoute.POST(new Request("http://localhost/api/intake/google-form/status", {
      method: "POST",
      body: JSON.stringify({ ids: [REQUEST_ID] }),
    }));
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns sheet fields only", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        results: [{
          id: REQUEST_ID,
          status: "confirmed",
          url_slug: "example-fellowship",
          on_map: false,
          display_name: "Example Fellowship",
          logo_storage_path: `${PROFILE_ID}/intake-upgrade/secret.png`,
        }],
      },
      error: null,
    });
    const res = await statusRoute.POST(signed("/api/intake/google-form/status", { ids: [REQUEST_ID, "not-a-uuid"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      results: [{ id: REQUEST_ID, status: "confirmed", url: "http://localhost/c/example-fellowship", on_map: false }],
    });
    expect(JSON.stringify(json)).not.toContain("secret");
    expect(JSON.stringify(json)).not.toContain("@");
    expect(mockRpc).toHaveBeenCalledWith("intake_upgrade_statuses", { _ids: [REQUEST_ID] });
  });

  it("rejects a body that is not a list of ids", async () => {
    const res = await statusRoute.POST(signed("/api/intake/google-form/status", { ids: "nope" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/intake/google-form/resend", () => {
  it("rotates the link and emails the account without returning the address", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        request_id: REQUEST_ID,
        profile_id: PROFILE_ID,
        display_name: "Example Fellowship",
        expires_at: "2026-11-01T00:00:00.000Z",
      },
      error: null,
    });
    const res = await resendRoute.POST(signed("/api/intake/google-form/resend", { id: REQUEST_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, status: "awaiting_confirmation", email: "sent" });
    expect(JSON.stringify(json)).not.toContain("owner@example.test");
    expect(JSON.stringify(json)).not.toContain(PROFILE_ID);
    const mail = mockSendEmail.mock.calls[0][0] as { to: string; text: string };
    expect(mail.to).toBe("owner@example.test");
    expect(mail.text).toMatch(/\/upgrade\/[a-f0-9]{64}/);
    expect(mockRpc).toHaveBeenCalledWith("resend_intake_upgrade", expect.objectContaining({ _id: REQUEST_ID, _token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it("limits resends of the same request", async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, profile_id: PROFILE_ID, display_name: "Example Fellowship", expires_at: "2026-11-01T00:00:00.000Z" },
      error: null,
    });
    for (let i = 0; i < 3; i++) {
      expect((await resendRoute.POST(signed("/api/intake/google-form/resend", { id: REQUEST_ID }))).status).toBe(200);
    }
    const limited = await resendRoute.POST(signed("/api/intake/google-form/resend", { id: REQUEST_ID }));
    expect(limited.status).toBe(429);
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it("rejects an id that is not a uuid", async () => {
    const res = await resendRoute.POST(signed("/api/intake/google-form/resend", { id: "nope" }));
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
