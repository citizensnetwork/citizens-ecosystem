import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/contributor/profile/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";

function req(body: unknown) {
  return new Request("http://localhost/api/contributor/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockApprovedContributor() {
  mockClient.auth.getUser.mockResolvedValueOnce({
    data: { user: { id: USER_ID } },
    error: null,
  });
  mockClient._chain.single.mockResolvedValueOnce({
    data: { role: "contributor", contributor_status: "approved" },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("POST /api/contributor/profile", () => {
  it("401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ bio: "Hello" }));
    expect(res.status).toBe(401);
  });

  it("403 when not an approved contributor", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { role: "citizen", contributor_status: null },
      error: null,
    });
    const res = await POST(req({ bio: "Hello" }));
    expect(res.status).toBe(403);
  });

  it("400 when contributor_contact_email is not a valid email", async () => {
    mockApprovedContributor();
    const res = await POST(req({ contributor_contact_email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("400 when contributor_contact_email exceeds the max length", async () => {
    mockApprovedContributor();
    const longLocal = "a".repeat(250);
    const res = await POST(req({ contributor_contact_email: `${longLocal}@example.com` }));
    expect(res.status).toBe(400);
  });

  it("200 and persists a trimmed, lower-cased contact email", async () => {
    mockApprovedContributor();
    const res = await POST(req({ contributor_contact_email: "  Hello@ExampleChurch.ORG  " }));
    expect(res.status).toBe(200);
    expect(mockClient._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ contributor_contact_email: "hello@examplechurch.org" }),
    );
  });

  it("200 and clears the contact email when sent empty", async () => {
    mockApprovedContributor();
    const res = await POST(req({ contributor_contact_email: "" }));
    expect(res.status).toBe(200);
    expect(mockClient._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ contributor_contact_email: null }),
    );
  });

  it("rejects a request payload trying to smuggle a disallowed key", async () => {
    mockApprovedContributor();
    const res = await POST(req({ role: "admin", bio: "Hi" }));
    expect(res.status).toBe(200);
    expect(mockClient._chain.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ role: expect.anything() }),
    );
  });
});
