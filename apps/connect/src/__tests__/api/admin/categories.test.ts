import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit",
  );
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }),
  };
});

const { POST } = await import("@/app/api/admin/categories/route");
const { PATCH, DELETE } = await import(
  "@/app/api/admin/categories/[id]/route"
);

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const CATEGORY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchReq(body: unknown, id = CATEGORY_ID) {
  return new NextRequest(`http://localhost/api/admin/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(id = CATEGORY_ID) {
  return new NextRequest(`http://localhost/api/admin/categories/${id}`, {
    method: "DELETE",
  });
}

function ctx(id = CATEGORY_ID) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/admin/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient._chain._result.data = { role: "admin" };
    mockClient._chain._result.error = null;
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: ADMIN_ID, email: "a@example.com" } },
      error: null,
    });
  });

  describe("POST", () => {
    it("rejects unauthenticated", async () => {
      mockClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });
      const res = await POST(
        postReq({
          name: "Worship",
          slug: "worship",
          applies_to: "events",
          sort_order: 1,
        }),
      );
      expect(res.status).toBe(401);
    });

    it("rejects non-admin", async () => {
      mockClient._chain._result.data = { role: "citizen" };
      const res = await POST(
        postReq({
          name: "Worship",
          slug: "worship",
          applies_to: "events",
          sort_order: 1,
        }),
      );
      expect(res.status).toBe(403);
    });

    it("rejects empty name", async () => {
      const res = await POST(
        postReq({ name: "", slug: "x", applies_to: "events", sort_order: 0 }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects bad slug", async () => {
      const res = await POST(
        postReq({
          name: "Worship",
          slug: "Bad Slug!",
          applies_to: "events",
          sort_order: 0,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid applies_to", async () => {
      const res = await POST(
        postReq({
          name: "Worship",
          slug: "worship",
          applies_to: "nonsense",
          sort_order: 0,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("creates a category on success", async () => {
      mockClient._chain._result.data = {
        role: "admin",
        id: CATEGORY_ID,
        name: "Worship",
        slug: "worship",
        applies_to: "events",
        sort_order: 1,
        emoji: "",
        color: "#6b7280",
        created_at: new Date().toISOString(),
      };
      const res = await POST(
        postReq({
          name: "Worship",
          slug: "worship",
          applies_to: "events",
          sort_order: 1,
        }),
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.category?.slug).toBe("worship");
    });
  });

  describe("PATCH", () => {
    it("rejects invalid id", async () => {
      const res = await PATCH(patchReq({ name: "X" }, "not-a-uuid"), {
        params: Promise.resolve({ id: "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects empty patch", async () => {
      const res = await PATCH(patchReq({}), ctx());
      expect(res.status).toBe(400);
    });

    it("updates fields on success", async () => {
      mockClient._chain._result.data = {
        role: "admin",
        id: CATEGORY_ID,
        name: "Worship & Prayer",
        slug: "worship-prayer",
        applies_to: "events",
        sort_order: 1,
        emoji: "",
        color: "#6b7280",
      };
      const res = await PATCH(
        patchReq({ name: "Worship & Prayer" }),
        ctx(),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE", () => {
    it("rejects invalid id", async () => {
      const res = await DELETE(deleteReq("not-a-uuid"), {
        params: Promise.resolve({ id: "not-a-uuid" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 when category is gone", async () => {
      // adminGuard uses .single(); the route's delete query uses
      // .select().maybeSingle(). Override each terminal once so the role
      // check passes and the not-found branch fires.
      mockClient._chain.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });
      mockClient._chain.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      const res = await DELETE(deleteReq(), ctx());
      expect(res.status).toBe(404);
    });

    it("returns success on delete", async () => {
      mockClient._chain._result.data = {
        role: "admin",
        id: CATEGORY_ID,
        slug: "worship",
      };
      const res = await DELETE(deleteReq(), ctx());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
