import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));
// No real email, ever: only the network send is faked.
const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const { POST } = await import("@/app/api/contributor/claim/decline/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";
const ADMIN_INBOX = "admin@citizens.example";
const req = () => new Request("http://localhost/api/contributor/claim/decline", { method: "POST" });
const signedIn = () => mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.rpc.mockReset();
  resetRateLimitStore();
  mockSendEmail.mockResolvedValue("sent");
  vi.stubEnv("ADMIN_NOTIFY_EMAIL", ADMIN_INBOX);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/contributor/claim/decline — Not me (C10)", () => {
  it("401 when signed out, and nothing is hidden or sent", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await POST(req())).status).toBe(401);
    expect(mockClient.rpc).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("hides the listing through the database function and tells the admin by email", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, name: "Grace Outreach", slug: "grace-outreach" }, error: null });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockClient.rpc).toHaveBeenCalledWith("decline_listing_claim");
    expect(mockClient.rpc).toHaveBeenCalledTimes(1);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const mail = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };
    expect(mail.to).toBe(ADMIN_INBOX);
    expect(mail.subject).toContain("Grace Outreach");
    expect(mail.text).toContain("grace-outreach");
    expect(mail.text).toContain("Nothing on their account was changed");
  });

  it("the admin email carries no address or id of the person who declined", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, name: "Grace Outreach", slug: "grace-outreach", claim_email: "o@example.com" }, error: null });
    await POST(req());
    const mail = mockSendEmail.mock.calls[0][0] as { text: string; html: string };
    expect(mail.text).not.toContain("o@example.com");
    expect(mail.html).not.toContain(USER_ID);
  });

  it("escapes a hostile listing name in the admin email's HTML", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, name: '<img src=x onerror="alert(1)">', slug: "s" }, error: null });
    await POST(req());
    const mail = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });

  it("the refusal stands even when the email cannot be sent, or no admin inbox is set", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, name: "X", slug: "x" }, error: null });
    mockSendEmail.mockResolvedValueOnce("failed");
    expect((await POST(req())).status).toBe(200);

    vi.stubEnv("ADMIN_NOTIFY_EMAIL", "");
    mockSendEmail.mockClear();
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, name: "X", slug: "x" }, error: null });
    expect((await POST(req())).status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("maps the database's refusals: nothing waiting 404, unverified 403, anything else 409; no email for any of them", async () => {
    const cases: Array<[string, number]> = [
      ["nothing_to_decline", 404],
      ["email_not_verified", 403],
      ["not_authenticated", 401],
      ["something_new", 409],
    ];
    for (const [reason, status] of cases) {
      signedIn();
      mockClient.rpc.mockResolvedValueOnce({ data: { success: false, reason }, error: null });
      const res = await POST(req());
      expect(res.status, reason).toBe(status);
      expect((await res.json()).error).toBe(reason);
    }
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("500 when the RPC errors", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await POST(req())).status).toBe(500);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("takes no input", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, name: "X", slug: "x" }, error: null });
    await POST(new Request("http://localhost/x?id=victim", { method: "POST", body: JSON.stringify({ placeholder_id: "victim" }) }));
    expect(mockClient.rpc.mock.calls[0]).toHaveLength(1);
  });
});
