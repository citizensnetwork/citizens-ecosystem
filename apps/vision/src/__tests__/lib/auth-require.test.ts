import { describe, it, expect, vi, beforeEach } from "vitest";

// Build a chainable supabase mock whose terminating .single() call is
// controlled per test via `singleMock`. This mirrors the pattern used
// by project-detail.test.ts and goals-authz-hardening.test.ts so we
// exercise the real `requireOrgRole` implementation end-to-end.
const { getUserMock, singleMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  singleMock: vi.fn(),
}));

function makeSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: singleMock,
  };
  return {
    auth: { getUser: getUserMock },
    from: vi.fn(() => chain),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeSupabase()),
}));

import {
  requireUser,
  requireOrgMember,
  requireOrgRoleForRequest,
  validateOrgId,
} from "@/lib/auth/require";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("auth/require helpers", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    singleMock.mockReset();
  });

  describe("validateOrgId", () => {
    it("rejects missing orgId with 400", () => {
      const result = validateOrgId(null);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(400);
    });

    it("rejects non-UUID strings with 400", () => {
      const result = validateOrgId("not-a-uuid");
      expect(result.ok).toBe(false);
    });

    it("accepts valid UUIDs", () => {
      const result = validateOrgId(VALID_UUID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.orgId).toBe(VALID_UUID);
    });
  });

  describe("requireUser", () => {
    it("returns 401 when no session", async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await requireUser();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    });

    it("returns supabase + user when authenticated", async () => {
      getUserMock.mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
      });
      const result = await requireUser();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user.id).toBe("user-1");
        expect(result.supabase).toBeDefined();
      }
    });
  });

  describe("requireOrgMember", () => {
    it("returns 400 for invalid orgId before touching auth", async () => {
      const result = await requireOrgMember("bad");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(400);
      expect(getUserMock).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      getUserMock.mockResolvedValueOnce({ data: { user: null } });
      const result = await requireOrgMember(VALID_UUID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    });

    it("returns 403 when user_org_roles row is missing", async () => {
      getUserMock.mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
      });
      // requireOrgRole reads user_org_roles via .single() — no row = 403.
      singleMock.mockResolvedValueOnce({ data: null, error: null });
      const result = await requireOrgMember(VALID_UUID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    });

    it("returns success + role when membership exists", async () => {
      getUserMock.mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
      });
      singleMock.mockResolvedValueOnce({
        data: { role: "org_member" },
        error: null,
      });
      const result = await requireOrgMember(VALID_UUID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.role).toBe("org_member");
        expect(result.user.id).toBe("user-1");
      }
    });
  });

  describe("requireOrgRoleForRequest", () => {
    it("returns 403 when role is not in allowedRoles", async () => {
      getUserMock.mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
      });
      singleMock.mockResolvedValueOnce({
        data: { role: "org_viewer" },
        error: null,
      });

      const result = await requireOrgRoleForRequest(VALID_UUID, ["org_admin"]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    });

    it("returns success with resolved role when user has permission", async () => {
      getUserMock.mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
      });
      singleMock.mockResolvedValueOnce({
        data: { role: "org_admin" },
        error: null,
      });

      const result = await requireOrgRoleForRequest(VALID_UUID, ["org_admin"]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.role).toBe("org_admin");
    });
  });
});
