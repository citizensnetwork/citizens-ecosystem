import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

// The admin's own session: requireAdmin reads the role from it and the review
// functions run on it (their is_admin() guard keys on auth.uid()).
const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// service_role: ONLY used to read the applicant's name + private email for the verdict email.
const adminClient = createMockSupabaseClient();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const { POST } = await import("@/app/api/admin/contributors/review/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const APPLICANT_ID = "22222222-2222-2222-2222-222222222222";
const APP_ID = "33333333-3333-3333-3333-333333333333";
const APPLICANT_EMAIL = "grace@applicant.example";
const URL_BASE = "http://localhost/api/admin/contributors/review";

const req = (body: unknown, raw = false) =>
  new NextRequest(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

function rpcReturns(data: unknown) {
  mockClient.rpc.mockResolvedValueOnce({ data, error: null });
}

describe("POST /api/admin/contributors/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: ADMIN_ID, email: "admin@citizens.example" } },
      error: null,
    });
    adminClient._chain.maybeSingle.mockResolvedValue({
      data: { display_name: "Grace Hub", profiles: { email: APPLICANT_EMAIL } },
      error: null,
    });
    mockSendEmail.mockResolvedValue("sent");
  });

  describe("who may call it", () => {
    it("returns 401 with no session", async () => {
      mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      const res = await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(res.status).toBe(401);
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("returns 403 for a non-admin and never reaches the database functions", async () => {
      mockClient._chain._result.data = { role: "citizen" };
      const res = await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(res.status).toBe(403);
      expect(mockClient.rpc).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("has no signature / deep-link mode any more: sig + exp do not skip the admin check", async () => {
      mockClient._chain._result.data = { role: "citizen" };
      const res = await POST(req({ application_id: APP_ID, action: "approve", sig: "abc", exp: "9999999999" }));
      expect(res.status).toBe(403);
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("does not call the legacy edge function", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      await POST(req({ application_id: APP_ID, action: "approve" }));
      expect((mockClient as unknown as { functions?: unknown }).functions).toBeUndefined();
    });
  });

  describe("input validation", () => {
    it.each([
      ["a missing id", { action: "approve" }],
      ["a malformed id", { application_id: "not-a-uuid", action: "approve" }],
      ["an unknown action", { application_id: APP_ID, action: "delete" }],
      ["no action", { application_id: APP_ID }],
    ])("rejects %s with 400", async (_label, body) => {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON", async () => {
      expect((await POST(req("{nope", true))).status).toBe(400);
    });

    it("requires a reason to reject, before touching the database", async () => {
      for (const reason of [undefined, "", "   ", 42]) {
        const res = await POST(req({ application_id: APP_ID, action: "reject", reason }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("reason_required");
      }
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("caps the reason", async () => {
      const res = await POST(req({ application_id: APP_ID, action: "reject", reason: "x".repeat(1001) }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("reason_too_long");
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });
  });

  describe("approve", () => {
    it("runs approve_contributor_application on the admin's session and returns the slug", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      const res = await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(res.status).toBe(200);
      expect(mockClient.rpc).toHaveBeenCalledWith("approve_contributor_application", { _application_id: APP_ID });
      expect(await res.json()).toEqual({ success: true, action: "approved", slug: "grace-hub", email: "sent" });
    });

    it("emails the applicant 'You're live' with their listing and portal links", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const mail = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; text: string };
      expect(mail.to).toBe(APPLICANT_EMAIL);
      expect(mail.subject).toContain("You're live");
      expect(mail.text).toContain("/c/grace-hub");
      expect(mail.text).toContain("/dashboard");
    });

    it("reads the applicant's private email with the service-role client, by application id", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(adminClient.from).toHaveBeenCalledWith("contributor_applications");
      expect(adminClient._chain.eq).toHaveBeenCalledWith("id", APP_ID);
    });

    it("writes an audit row (no PII in it)", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(mockClient.from).toHaveBeenCalledWith("admin_actions");
      const entry = mockClient._chain.insert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        actor_id: ADMIN_ID,
        action: "contributor_application_approved",
        target_type: "profile",
        target_id: APPLICANT_ID,
        metadata: { application_id: APP_ID, slug: "grace-hub" },
      });
      expect(JSON.stringify(entry)).not.toContain(APPLICANT_EMAIL);
    });
  });

  describe("reject", () => {
    it("runs reject_contributor_application with the trimmed reason", async () => {
      rpcReturns({ success: true, action: "rejected", user_id: APPLICANT_ID });
      const res = await POST(req({ application_id: APP_ID, action: "reject", reason: "  Please add a website  " }));
      expect(res.status).toBe(200);
      expect(mockClient.rpc).toHaveBeenCalledWith("reject_contributor_application", {
        _application_id: APP_ID,
        _reason: "Please add a website",
      });
      expect(await res.json()).toEqual({ success: true, action: "rejected", email: "sent" });
    });

    it("emails the applicant the reason and how to re-apply", async () => {
      rpcReturns({ success: true, action: "rejected", user_id: APPLICANT_ID });
      await POST(req({ application_id: APP_ID, action: "reject", reason: "Please add a website" }));
      const mail = mockSendEmail.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };
      expect(mail.to).toBe(APPLICANT_EMAIL);
      expect(mail.subject).toBe("About your Contributor application");
      expect(mail.text).toContain("Please add a website");
      expect(mail.text).toContain("apply again");
    });

    it("escapes an HTML-looking reason in the email", async () => {
      rpcReturns({ success: true, action: "rejected", user_id: APPLICANT_ID });
      await POST(req({ application_id: APP_ID, action: "reject", reason: "<script>alert(1)</script>" }));
      const mail = mockSendEmail.mock.calls[0][0] as { html: string };
      expect(mail.html).not.toContain("<script>");
      expect(mail.html).toContain("&lt;script&gt;");
    });

    it("audits the rejection without storing the reason", async () => {
      rpcReturns({ success: true, action: "rejected", user_id: APPLICANT_ID });
      await POST(req({ application_id: APP_ID, action: "reject", reason: "private words" }));
      const entry = mockClient._chain.insert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(entry).toMatchObject({ action: "contributor_application_rejected", target_id: APPLICANT_ID });
      expect(JSON.stringify(entry)).not.toContain("private words");
    });
  });

  describe("when the database refuses or fails", () => {
    it.each([
      ["not_found_or_not_pending", 409],
      ["not_admin", 403],
      ["reason_required", 400],
      ["reason_too_long", 400],
    ])("maps %s to HTTP %i and sends no email", async (reason, status) => {
      rpcReturns({ success: false, reason });
      const res = await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(reason);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("returns 500 for an unknown refusal and for an RPC error, with no email and no audit row", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      rpcReturns({ success: false, reason: "something_new" });
      expect((await POST(req({ application_id: APP_ID, action: "approve" }))).status).toBe(500);

      mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
      expect((await POST(req({ application_id: APP_ID, action: "approve" }))).status).toBe(500);

      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockClient._chain.insert).not.toHaveBeenCalled();
    });
  });

  describe("the email never undoes a decision", () => {
    it("still succeeds and reports email:'failed' when sending fails", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      mockSendEmail.mockResolvedValueOnce("failed");
      const res = await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(res.status).toBe(200);
      expect((await res.json()).email).toBe("failed");
    });

    it("reports email:'skipped' without sending when the applicant has no address on file", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      adminClient._chain.maybeSingle.mockResolvedValueOnce({
        data: { display_name: "Grace Hub", profiles: { email: null } },
        error: null,
      });
      const res = await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(res.status).toBe(200);
      expect((await res.json()).email).toBe("skipped");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("still succeeds when the applicant lookup itself throws", async () => {
      rpcReturns({ success: true, action: "rejected", user_id: APPLICANT_ID });
      adminClient._chain.maybeSingle.mockRejectedValueOnce(new Error("db down"));
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await POST(req({ application_id: APP_ID, action: "reject", reason: "Not yet" }));
      expect(res.status).toBe(200);
      expect((await res.json()).email).toBe("skipped");
    });

    it("never echoes the applicant's email address back to the browser", async () => {
      rpcReturns({ success: true, action: "approved", slug: "grace-hub", user_id: APPLICANT_ID });
      const res = await POST(req({ application_id: APP_ID, action: "approve" }));
      expect(JSON.stringify(await res.json())).not.toContain(APPLICANT_EMAIL);
    });
  });
});
