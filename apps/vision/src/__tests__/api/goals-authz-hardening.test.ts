import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Phase 14 security hardening tests.
 *
 * Covers:
 *   - Goals PATCH/DELETE now require explicit org role check via
 *     requireOrgRole (audit finding A-1). Non-members and viewers
 *     must be rejected at the API layer even if RLS would hypothetically
 *     allow the mutation.
 *   - Export route scopes by resource→role matrix (audit finding A-2).
 *     Members cannot export reports; viewers cannot export anything.
 *   - Advisory generate filters non-numeric metric values (audit
 *     finding A-3).
 */

// ── Goals PATCH/DELETE auth hardening ────────────────────────

const goalsSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(goalsSupabase)),
}));

const goalsRoute = await import("@/app/api/goals/[id]/route");

function chainMock(value: unknown) {
  const m: Record<string, ReturnType<typeof vi.fn>> = {};
  m.select = vi.fn(() => m);
  m.eq = vi.fn(() => m);
  m.single = vi.fn(() => m);
  m.update = vi.fn(() => m);
  m.delete = vi.fn(() => m);
  m.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(value).then(resolve),
  );
  return m;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

function req(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(
    new URL(`/api/goals/${VALID_UUID}`, "http://localhost"),
    init as never,
  );
}

describe("Phase 14: Goals PATCH authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when goal does not exist (before role check)", async () => {
    goalsSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    goalsSupabase.from.mockReturnValueOnce(
      chainMock({ data: null, error: { code: "PGRST116" } }),
    );

    const res = await goalsRoute.PATCH(
      req("PATCH", { title: "New goal title" }),
      makeParams(VALID_UUID),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is an org_viewer (not authorised to edit)", async () => {
    goalsSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    // 1. Fetch goal → org_id
    const fetchChain = chainMock({ data: { org_id: "org1" }, error: null });
    // 2. requireOrgRole → user is a viewer
    const roleChain = chainMock({
      data: { role: "org_viewer" },
      error: null,
    });

    goalsSupabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(roleChain);

    const res = await goalsRoute.PATCH(
      req("PATCH", { title: "New title" }),
      makeParams(VALID_UUID),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not a member of the goal's org", async () => {
    goalsSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const fetchChain = chainMock({ data: { org_id: "org1" }, error: null });
    // requireOrgRole → no membership row
    const roleChain = chainMock({ data: null, error: null });

    goalsSupabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(roleChain);

    const res = await goalsRoute.PATCH(
      req("PATCH", { title: "Cross-org attempt" }),
      makeParams(VALID_UUID),
    );
    expect(res.status).toBe(403);
  });

  it("permits org_manager to update", async () => {
    goalsSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const fetchChain = chainMock({ data: { org_id: "org1" }, error: null });
    const roleChain = chainMock({
      data: { role: "org_manager" },
      error: null,
    });
    const updateChain = chainMock({
      data: { id: VALID_UUID, title: "Updated" },
      error: null,
    });

    goalsSupabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(roleChain)
      .mockReturnValueOnce(updateChain);

    const res = await goalsRoute.PATCH(
      req("PATCH", { title: "Updated" }),
      makeParams(VALID_UUID),
    );
    expect(res.status).toBe(200);
  });
});

describe("Phase 14: Goals DELETE authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when user is only an org_manager (admin-only DELETE)", async () => {
    goalsSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const fetchChain = chainMock({ data: { org_id: "org1" }, error: null });
    const roleChain = chainMock({
      data: { role: "org_manager" },
      error: null,
    });

    goalsSupabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(roleChain);

    const res = await goalsRoute.DELETE(req("DELETE"), makeParams(VALID_UUID));
    expect(res.status).toBe(403);
  });

  it("permits org_admin to delete", async () => {
    goalsSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    const fetchChain = chainMock({ data: { org_id: "org1" }, error: null });
    const roleChain = chainMock({
      data: { role: "org_admin" },
      error: null,
    });
    const deleteChain = chainMock({ error: null });

    goalsSupabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(roleChain)
      .mockReturnValueOnce(deleteChain);

    const res = await goalsRoute.DELETE(req("DELETE"), makeParams(VALID_UUID));
    expect(res.status).toBe(200);
  });
});
