import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

// The admin's own session: requireAdmin reads the profile role from it and the
// RPC runs on it (the function's admin guard keys on auth.uid()).
const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

// service_role is used for ONE thing here: Storage cleanup.
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
const { GET, POST } = await import("@/app/api/admin/contributors/delete-listing/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_ID = "22222222-2222-2222-2222-222222222222";
const URL_BASE = "http://localhost/api/admin/contributors/delete-listing";

const getReq = (qs = `?id=${TARGET_ID}`) => new NextRequest(`${URL_BASE}${qs}`, { method: "GET" });
const postReq = (body: unknown, raw = false) =>
  new NextRequest(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

const PREFLIGHT_PLACEHOLDER = {
  success: true,
  case: "placeholder",
  name: "Hope Harvest Outreach",
  slug: "hope-harvest-outreach",
  events: 2,
  places: 1,
  news_posts: 3,
  team_members: 0,
  moved_placeholder: false,
  blockers: [],
};

function rpcReturns(data: unknown) {
  mockClient.rpc.mockResolvedValueOnce({ data, error: null });
}

describe("/api/admin/contributors/delete-listing", () => {
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

  // ── GET: the preflight behind the confirm modal ─────────────────────────

  describe("GET (preflight)", () => {
    it("rejects non-admin callers without touching the database function", async () => {
      mockClient._chain._result.data = { role: "citizen" };
      const res = await GET(getReq());
      expect(res.status).toBe(403);
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("rejects a missing or malformed id", async () => {
      expect((await GET(getReq(""))).status).toBe(400);
      expect((await GET(getReq("?id=not-a-uuid"))).status).toBe(400);
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("is read-only: asks the function for a dry run, never _apply=true", async () => {
      rpcReturns(PREFLIGHT_PLACEHOLDER);
      await GET(getReq());
      expect(mockClient.rpc).toHaveBeenCalledWith("admin_remove_contributor_listing", {
        _user_id: TARGET_ID,
        _apply: false,
        _confirm_name: null,
      });
    });

    it("reports which outcome will happen and what it touches", async () => {
      rpcReturns(PREFLIGHT_PLACEHOLDER);
      const res = await GET(getReq());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        case: "placeholder",
        name: "Hope Harvest Outreach",
        slug: "hope-harvest-outreach",
        eventsAffected: 2,
        placesAffected: 1,
        newsPosts: 3,
        teamMembers: 0,
        movedPlaceholder: false,
        blockers: [],
      });
    });

    it("explains a blocked listing in plain words (200, so the modal can show why)", async () => {
      rpcReturns({ ...PREFLIGHT_PLACEHOLDER, case: "account", blockers: ["owns_wear_brand", "created_vision_organisation"] });
      const res = await GET(getReq());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.blockers).toEqual(["owns_wear_brand", "created_vision_organisation"]);
      expect(json.message).toMatch(/Citizens Wear brand/);
      expect(json.message).toMatch(/Citizens Vision/);
    });

    it.each([
      ["target_is_admin", 409],
      ["cannot_delete_self", 409],
      ["not_a_listing", 409],
      ["not_found", 404],
      ["not_admin", 403],
    ])("maps the refusal %s to HTTP %i", async (reason, status) => {
      rpcReturns({ success: false, reason });
      const res = await GET(getReq());
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(reason);
    });

    it("returns 500 (not a stack trace) when the database call itself fails", async () => {
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom", code: "XX000" } });
      const res = await GET(getReq());
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "preview_failed" });
    });

    it("is rate limited", async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ success: false, resetMs: 12_000 } as never);
      const res = await GET(getReq());
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("12");
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });
  });

  // ── POST: doing it ──────────────────────────────────────────────────────

  describe("POST (delete)", () => {
    it("rejects non-admin callers", async () => {
      mockClient._chain._result.data = { role: "citizen" };
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect(res.status).toBe(403);
      expect(mockClient.rpc).not.toHaveBeenCalled();
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it("rejects bad input before anything happens", async () => {
      expect((await POST(postReq("{not json", true))).status).toBe(400);
      expect((await POST(postReq({ id: "nope", confirmName: "x" }))).status).toBe(400);
      expect((await POST(postReq({ confirmName: "x" }))).status).toBe(400);
      expect((await POST(postReq({ id: TARGET_ID, confirmName: "x".repeat(201) }))).status).toBe(400);
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it("runs the function on the ADMIN'S session with the typed name, never on service_role", async () => {
      rpcReturns({ success: true, outcome: "deleted", events: 0, places: 0, moved_placeholder: false });
      await POST(postReq({ id: TARGET_ID, confirmName: "Hope Harvest Outreach" }));
      expect(mockClient.rpc).toHaveBeenCalledWith("admin_remove_contributor_listing", {
        _user_id: TARGET_ID,
        _apply: true,
        _confirm_name: "Hope Harvest Outreach",
      });
      // The only thing service_role is ever asked to do is Storage.
      expect(adminClient).not.toHaveProperty("rpc");
    });

    it("a missing confirmName is sent as '' so the database refuses it (the route trusts nothing)", async () => {
      rpcReturns({ success: false, reason: "name_mismatch" });
      const res = await POST(postReq({ id: TARGET_ID }));
      expect(mockClient.rpc).toHaveBeenCalledWith("admin_remove_contributor_listing", {
        _user_id: TARGET_ID,
        _apply: true,
        _confirm_name: "",
      });
      expect(res.status).toBe(400);
    });

    it("a placeholder is deleted: reports the counts and removes only the intake FILES", async () => {
      rpcReturns({ success: true, outcome: "deleted", events: 2, places: 1, moved_placeholder: false });
      storageApi.list.mockResolvedValueOnce({
        data: [
          { id: "f1", name: "logo-1.png" },
          { id: "f2", name: "cover-1.jpg" },
          { id: null, name: "a-subfolder" }, // folders come back with a null id
        ],
        error: null,
      });

      const res = await POST(postReq({ id: TARGET_ID, confirmName: "Hope Harvest Outreach" }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ outcome: "deleted", eventsAffected: 2, placesAffected: 1, warnings: [] });

      expect(adminClient.storage.from).toHaveBeenCalledWith("event-images");
      expect(storageApi.list).toHaveBeenCalledWith(`${TARGET_ID}/intake`, { limit: 1000 });
      expect(storageApi.remove).toHaveBeenCalledWith([`${TARGET_ID}/intake/logo-1.png`, `${TARGET_ID}/intake/cover-1.jpg`]);
    });

    it("a real account loses only its listing (outcome 'removed'); its intake files are still cleaned up", async () => {
      rpcReturns({ success: true, outcome: "removed", events: 3, places: 0, moved_placeholder: false });
      storageApi.list.mockResolvedValueOnce({ data: [{ id: "f1", name: "logo.png" }], error: null });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "Grace Point" }));
      expect(await res.json()).toMatchObject({ outcome: "removed", eventsAffected: 3, placesAffected: 0 });
      expect(storageApi.remove).toHaveBeenCalledWith([`${TARGET_ID}/intake/logo.png`]);
    });

    it("never touches Storage for a placeholder that was claimed from another account (its files are now the claimant's)", async () => {
      rpcReturns({ success: true, outcome: "deleted", events: 0, places: 0, moved_placeholder: true });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "Hope Harvest Outreach" }));
      expect(res.status).toBe(200);
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(storageApi.list).not.toHaveBeenCalled();
      expect(storageApi.remove).not.toHaveBeenCalled();
    });

    it("nothing to clean up is not an error", async () => {
      rpcReturns({ success: true, outcome: "deleted", events: 0, places: 0, moved_placeholder: false });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect((await res.json()).warnings).toEqual([]);
      expect(storageApi.remove).not.toHaveBeenCalled();
    });

    it("a Storage failure never fails the request: the database change already committed, so it is a warning", async () => {
      rpcReturns({ success: true, outcome: "deleted", events: 0, places: 0, moved_placeholder: false });
      storageApi.list.mockResolvedValueOnce({ data: null, error: { message: "storage down" } });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.outcome).toBe("deleted");
      expect(json.warnings).toHaveLength(1);
      expect(json.warnings[0]).toMatch(/images/);
    });

    it("a failed file removal is also only a warning", async () => {
      rpcReturns({ success: true, outcome: "deleted", events: 0, places: 0, moved_placeholder: false });
      storageApi.list.mockResolvedValueOnce({ data: [{ id: "f1", name: "logo.png" }], error: null });
      storageApi.remove.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect(res.status).toBe(200);
      expect((await res.json()).warnings).toHaveLength(1);
    });

    it.each([
      ["name_mismatch", 400],
      ["target_is_admin", 409],
      ["cannot_delete_self", 409],
      ["not_a_listing", 409],
      ["not_found", 404],
      ["blocked_by_related_data", 409],
      ["signed_in_meanwhile", 409],
      ["not_admin", 403],
    ])("maps the refusal %s to HTTP %i and leaves Storage alone", async (reason, status) => {
      rpcReturns({ success: false, reason });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(reason);
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it("a listing that owns a Wear brand or has Vision data is refused with the reasons", async () => {
      rpcReturns({ success: false, reason: "blocked", blockers: ["owns_wear_brand"] });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("blocked");
      expect(json.blockers).toEqual(["owns_wear_brand"]);
      expect(json.message).toMatch(/Citizens Wear brand/);
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it("an unexpected reason or a database error is a plain 500, never an echo of the raw error", async () => {
      rpcReturns({ success: false, reason: "something_new" });
      expect((await POST(postReq({ id: TARGET_ID, confirmName: "x" }))).status).toBe(500);

      mockClient.rpc.mockResolvedValueOnce({ data: null, error: { message: "secret detail", code: "XX000" } });
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toMatch(/secret detail/);
    });

    it("is rate limited, and does nothing when it is", async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ success: false, resetMs: 30_000 } as never);
      const res = await POST(postReq({ id: TARGET_ID, confirmName: "x" }));
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("30");
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });
  });
});
