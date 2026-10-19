import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

// The admin's own session: requireAdmin reads the profile role from it and the
// RPC runs on it (the function raises unless auth.uid() is an admin).
const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const storageApi = { list: vi.fn(), remove: vi.fn() };
const adminClient = { storage: { from: vi.fn(() => storageApi) } };
const createAdminClient = vi.fn(() => adminClient);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }) };
});

const { checkRateLimit } = await import("@/lib/rate-limit");
const { GET, POST } = await import("@/app/api/admin/citizens/delete/route");

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const URL_BASE = "http://localhost/api/admin/citizens/delete";

const getReq = (qs = `?id=${TARGET_ID}`) => new NextRequest(`${URL_BASE}${qs}`, { method: "GET" });
const postReq = (body: unknown, raw = false) =>
  new NextRequest(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

const PREFLIGHT = {
  success: true,
  name: "Ada Citizen",
  follows: 2,
  place_follows: 0,
  saves: 1,
  rsvps: 1,
  comments: 0,
  moments: 0,
  messages: 3,
  notifications: 1,
  blockers: [],
};

function rpcReturns(data: unknown) {
  mockClient.rpc.mockResolvedValueOnce({ data, error: null });
}

describe("/api/admin/citizens/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: ADMIN_ID, email: "admin@example.com" } },
      error: null,
    });
    vi.mocked(checkRateLimit).mockReturnValue({ success: true, resetMs: 0 } as never);
    storageApi.list.mockResolvedValue({ data: [], error: null });
    storageApi.remove.mockResolvedValue({ data: [], error: null });
  });

  it("GET is 401 without a session", async () => {
    // getRouteAuth and requireAdmin each call getUser.
    mockClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(getReq())).status).toBe(401);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("GET and POST reject a non-admin before the function runs", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    expect((await GET(getReq())).status).toBe(403);
    expect((await POST(postReq({ id: TARGET_ID, confirmName: "Ada Citizen" }))).status).toBe(403);
    expect(mockClient.rpc).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("GET is a read-only preflight and never returns an email", async () => {
    rpcReturns({ ...PREFLIGHT, email: "ada@example.com" });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(mockClient.rpc).toHaveBeenCalledWith("admin_delete_citizen_account", {
      _user_id: TARGET_ID,
      _apply: false,
      _confirm: null,
    });
    const json = await res.json();
    expect(json).toEqual({
      name: "Ada Citizen",
      follows: 2,
      placeFollows: 0,
      saves: 1,
      rsvps: 1,
      comments: 0,
      moments: 0,
      messages: 3,
      notifications: 1,
      blockers: [],
    });
    expect(JSON.stringify(json)).not.toMatch(/email/i);
  });

  it.each([
    ["cannot_delete_self", 409],
    ["target_is_admin", 409],
    ["not_a_citizen", 409],
    ["not_found", 404],
    ["blocked_by_related_data", 409],
  ])("GET maps %s to HTTP %i", async (reason, status) => {
    rpcReturns({ success: false, reason });
    const res = await GET(getReq());
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(reason);
  });

  it("GET explains a blocker and hides nothing the modal needs to refuse", async () => {
    rpcReturns({ ...PREFLIGHT, blockers: ["owns_wear_brand"] });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.blockers).toEqual(["owns_wear_brand"]);
    expect(json.message).toMatch(/Citizens Wear brand/);
  });

  it("a raised not_admin from the function is 403", async () => {
    mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "not_admin", code: "42501" } });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("not_admin");
  });

  it("POST runs the delete on the admin session and cleans storage only after success", async () => {
    rpcReturns({ success: true, outcome: "deleted", follows: 2, messages: 3 });
    storageApi.list
      .mockResolvedValueOnce({ data: [{ id: "a", name: "photo.png" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const res = await POST(postReq({ id: TARGET_ID, confirmName: "Ada Citizen" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "deleted", warnings: [] });
    expect(mockClient.rpc).toHaveBeenCalledWith("admin_delete_citizen_account", {
      _user_id: TARGET_ID,
      _apply: true,
      _confirm: "Ada Citizen",
    });
    expect(storageApi.remove).toHaveBeenCalledWith([`${TARGET_ID}/avatars/photo.png`]);
    expect(adminClient).not.toHaveProperty("rpc");
  });

  it("POST name mismatch is 409-or-400 and does not touch storage", async () => {
    rpcReturns({ success: false, reason: "name_mismatch" });
    const res = await POST(postReq({ id: TARGET_ID, confirmName: "wrong" }));
    expect(res.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("POST rejects a bad id and a missing name before the function", async () => {
    expect((await POST(postReq("{", true))).status).toBe(400);
    expect((await POST(postReq({ id: "nope", confirmName: "Ada" }))).status).toBe(400);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("POST is rate limited", async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ success: false, resetMs: 5000 } as never);
    const res = await POST(postReq({ id: TARGET_ID, confirmName: "Ada Citizen" }));
    expect(res.status).toBe(429);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });
});
