import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Phase 14 audit A-2: the /api/export route must enforce a
 * resource→role matrix. Viewers cannot export anything. Members
 * cannot export reports or aggregated metrics. Admins can export
 * anything. Platform admins bypass via their role.
 */

const mockGetUser = vi.fn();
let currentRole: string | null = "org_admin";

vi.mock("@/lib/supabase/server", () => {
  function makeDataChain() {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.gte = () => chain;
    chain.lte = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.then = (cb: (v: { data: unknown[]; error: null }) => unknown) =>
      cb({ data: [], error: null });
    return chain;
  }

  function makeRoleChain() {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.single = () =>
      Promise.resolve({
        data: currentRole ? { role: currentRole } : null,
        error: null,
      });
    return chain;
  }

  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: () => mockGetUser() },
      from: (table: string) => {
        if (table === "export_logs") {
          return { insert: () => ({ error: null }) };
        }
        if (table === "user_org_roles") {
          return makeRoleChain();
        }
        return { select: () => makeDataChain() };
      },
    }),
  };
});

const { POST } = await import("@/app/api/export/route");

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/export", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("Phase 14: Export role-scoping (A-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
  });

  it("rejects org_viewer from exporting activities", async () => {
    currentRole = "org_viewer";
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "csv",
        resource: "activities",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects org_member from exporting metrics (manager+ only)", async () => {
    currentRole = "org_member";
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "csv",
        resource: "metrics",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects org_manager from exporting reports (admin+ only)", async () => {
    currentRole = "org_manager";
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "pdf",
        resource: "report",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects non-members (no role row)", async () => {
    currentRole = null;
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "csv",
        resource: "activities",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("allows org_member to export activities", async () => {
    currentRole = "org_member";
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "csv",
        resource: "activities",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("allows org_admin to export reports", async () => {
    currentRole = "org_admin";
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "pdf",
        resource: "report",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("allows platform_admin to export reports", async () => {
    currentRole = "platform_admin";
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "pdf",
        resource: "report",
      }),
    );
    expect(res.status).toBe(200);
  });
});
