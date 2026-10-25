import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET, POST } = await import("@/app/api/contributor/claim/route");

const USER_ID = "11111111-2222-3333-4444-555555555555";

const getReq = () => new Request("http://localhost/api/contributor/claim", { method: "GET" });
const postReq = () => new Request("http://localhost/api/contributor/claim", { method: "POST" });
const signedIn = () => mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
const signedOut = () => mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
const rpcCalls = () => mockClient.rpc.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.rpc.mockReset();
  resetRateLimitStore();
});

describe("GET /api/contributor/claim — the read-only question (C10)", () => {
  it("401 when signed out, and asks the database nothing", async () => {
    signedOut();
    expect((await GET(getReq())).status).toBe(401);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("calls only the read-only peek, never a claim", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { found: false }, error: null });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false });
    expect(rpcCalls()).toEqual(["peek_claimable_listing"]);
  });

  it("passes on only the fields the confirm screen shows, never an address", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({
      data: {
        found: true, mode: "attach", eligible: true, name: "Grace Outreach", slug: "grace-outreach", kind: "ministry",
        category: "outreach-missions", logo_url: "https://cdn.test/l.png", created_at: "2026-10-21T00:00:00Z",
        claim_email: "o@example.com", placeholder_id: "p1",
      },
      error: null,
    });
    const json = await (await GET(getReq())).json();
    expect(json).toEqual({
      found: true, mode: "attach", eligible: true, name: "Grace Outreach", slug: "grace-outreach", kind: "ministry",
      category: "outreach-missions", logo_url: "https://cdn.test/l.png",
    });
    expect(JSON.stringify(json)).not.toContain("@");
  });

  it("a mode it does not know is treated as attach, and eligible only when exactly true", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { found: true, mode: "weird", eligible: "yes", name: "X" }, error: null });
    const json = await (await GET(getReq())).json();
    expect(json).toMatchObject({ mode: "attach", eligible: false });
  });

  it("an unverified address is answered like nothing waiting (found false)", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { found: false, reason: "email_not_verified" }, error: null });
    expect(await (await GET(getReq())).json()).toEqual({ found: false });
  });

  it("500 when the RPC errors", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await GET(getReq())).status).toBe(500);
  });
});

describe("POST /api/contributor/claim — Confirm", () => {
  it("returns 401 when unauthenticated", async () => {
    signedOut();
    expect((await POST(postReq())).status).toBe(401);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("attach: the owner has their own account, so the listing is copied onto it", async () => {
    signedIn();
    mockClient.rpc
      .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_mark" }, error: null })
      .mockResolvedValueOnce({ data: { success: true, slug: "grace-outreach" }, error: null });
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, mode: "attach", slug: "grace-outreach" });
    expect(rpcCalls()).toEqual(["mark_own_listing_claimed", "claim_admin_created_contributor"]);
  });

  it("self: the owner signed in AS the listing's account, so it is only recorded (and no attach runs)", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, slug: "grace-outreach" }, error: null });
    const json = await (await POST(postReq())).json();
    expect(json).toEqual({ success: true, mode: "self", slug: "grace-outreach" });
    expect(rpcCalls()).toEqual(["mark_own_listing_claimed"]);
  });

  it("404 nothing_to_claim when there is nothing for this person", async () => {
    signedIn();
    mockClient.rpc
      .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_mark" }, error: null })
      .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_claim" }, error: null });
    const res = await POST(postReq());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("nothing_to_claim");
  });

  it("403 email_not_verified, and the attach is never tried after the self check refused", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: { success: false, reason: "email_not_verified" }, error: null });
    const res = await POST(postReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("email_not_verified");
    expect(rpcCalls()).toEqual(["mark_own_listing_claimed"]);
  });

  it("403 when the attach itself says the address is unverified", async () => {
    signedIn();
    mockClient.rpc
      .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_mark" }, error: null })
      .mockResolvedValueOnce({ data: { success: false, reason: "email_not_verified" }, error: null });
    expect((await POST(postReq())).status).toBe(403);
  });

  it("409 when the caller is not eligible (already a Contributor)", async () => {
    signedIn();
    mockClient.rpc
      .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_mark" }, error: null })
      .mockResolvedValueOnce({ data: { success: false, reason: "not_eligible" }, error: null });
    const res = await POST(postReq());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("not_eligible");
  });

  it("returns 500 when either RPC errors", async () => {
    signedIn();
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await POST(postReq())).status).toBe(500);
    signedIn();
    mockClient.rpc
      .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_mark" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await POST(postReq())).status).toBe(500);
  });

  it("takes no input: nothing in the request can choose which listing is claimed", async () => {
    signedIn();
    mockClient.rpc
      .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_mark" }, error: null })
      .mockResolvedValueOnce({ data: { success: true, slug: "s" }, error: null });
    await POST(new Request("http://localhost/api/contributor/claim?id=victim&slug=other", { method: "POST", body: JSON.stringify({ placeholder_id: "victim", email: "v@example.com" }) }));
    for (const call of mockClient.rpc.mock.calls) expect(call).toHaveLength(1); // the name only: no arguments
  });

  it("is rate limited per user", async () => {
    let limited = false;
    for (let i = 0; i < 40 && !limited; i++) {
      signedIn();
      mockClient.rpc
        .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_mark" }, error: null })
        .mockResolvedValueOnce({ data: { success: false, reason: "nothing_to_claim" }, error: null });
      limited = (await POST(postReq())).status === 429;
    }
    expect(limited).toBe(true);
  });
});
