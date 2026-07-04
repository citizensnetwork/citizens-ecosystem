import { describe, it, expect, vi } from "vitest";
import { requireOrgRole } from "@/lib/supabase/rbac";
import type { SupabaseClient } from "@supabase/supabase-js";

function makeSupabase(role: string | null | undefined) {
  const single = vi.fn().mockResolvedValue({
    data: role === undefined ? null : role === null ? null : { role },
    error: null,
  });
  const eq2 = vi.fn(() => ({ single }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  return {
    client: { from } as unknown as SupabaseClient,
    spies: { from, select, eq1, eq2, single },
  };
}

describe("requireOrgRole", () => {
  const userId = "u1";
  const orgId = "o1";

  it("returns ok when the user has one of the allowed roles", async () => {
    const { client, spies } = makeSupabase("org_admin");
    const result = await requireOrgRole(client, userId, orgId, [
      "org_admin",
      "org_manager",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.membership.role).toBe("org_admin");
    }
    expect(spies.from).toHaveBeenCalledWith("user_org_roles");
    expect(spies.select).toHaveBeenCalledWith("role");
    expect(spies.eq1).toHaveBeenCalledWith("user_id", userId);
    expect(spies.eq2).toHaveBeenCalledWith("org_id", orgId);
  });

  it("returns a 403 response when the user is not a member", async () => {
    const { client } = makeSupabase(null);
    const result = await requireOrgRole(client, userId, orgId, ["org_admin"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body).toEqual({ error: "Insufficient permissions" });
    }
  });

  it("returns a 403 response when the role is not allowed", async () => {
    const { client } = makeSupabase("org_viewer");
    const result = await requireOrgRole(client, userId, orgId, [
      "org_admin",
      "org_manager",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("allows narrowing to a single role", async () => {
    const { client } = makeSupabase("org_manager");
    const result = await requireOrgRole(client, userId, orgId, ["org_admin"]);
    expect(result.ok).toBe(false);
  });
});
