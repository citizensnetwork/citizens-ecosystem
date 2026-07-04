import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, PATCH, DELETE } = await import(
  "@/app/api/projects/[id]/route"
);

function createRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost"), init as never);
}

function chainMock(value: unknown) {
  const m: Record<string, ReturnType<typeof vi.fn>> = {};
  m.select = vi.fn(() => m);
  m.eq = vi.fn(() => m);
  m.in = vi.fn(() => m);
  m.order = vi.fn(() => m);
  m.single = vi.fn(() => m);
  m.maybeSingle = vi.fn(() => m);
  m.insert = vi.fn(() => m);
  m.update = vi.fn(() => m);
  m.delete = vi.fn(() => m);
  m.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(value).then(resolve)
  );
  return m;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/projects/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest("GET", `http://localhost/api/projects/${VALID_UUID}`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await GET(
      createRequest("GET", "http://localhost/api/projects/bad-id"),
      makeParams("bad-id")
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when project not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    mockSupabase.from.mockReturnValue(
      chainMock({ data: null, error: { code: "PGRST116" } })
    );

    const res = await GET(
      createRequest("GET", `http://localhost/api/projects/${VALID_UUID}`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(404);
  });

  it("returns project with aggregates", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    // First call: project query
    const projectChain = chainMock({
      data: { id: VALID_UUID, name: "Test Project", status: "active" },
      error: null,
    });
    // Subsequent calls: milestones, activities count, goals count
    const milestonesChain = chainMock({
      data: [{ id: "m1", title: "Milestone 1" }],
      error: null,
    });
    const activitiesChain = chainMock({
      data: null,
      count: 3,
      error: null,
    });
    const goalsChain = chainMock({
      data: null,
      count: 2,
      error: null,
    });

    mockSupabase.from
      .mockReturnValueOnce(projectChain)
      .mockReturnValueOnce(milestonesChain)
      .mockReturnValueOnce(activitiesChain)
      .mockReturnValueOnce(goalsChain);

    const res = await GET(
      createRequest("GET", `http://localhost/api/projects/${VALID_UUID}`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Test Project");
    expect(body.data.milestones).toHaveLength(1);
    expect(body.data.activity_count).toBe(3);
    expect(body.data.goal_count).toBe(2);
  });
});

describe("PATCH /api/projects/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/projects/${VALID_UUID}`, {
        name: "New Name",
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await PATCH(
      createRequest("PATCH", "http://localhost/api/projects/bad-id", {
        name: "New",
      }),
      makeParams("bad-id")
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/projects/${VALID_UUID}`, {
        name: "A", // too short
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });

  it("validates status transition for non-admin", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    // 1. Fetch current project (status, org_id)
    const currentProject = chainMock({
      data: { status: "completed", org_id: "org1" },
      error: null,
    });
    // 2. requireOrgRole → user_org_roles: role = org_member (non-admin)
    const roleCheck = chainMock({ data: { role: "org_member" }, error: null });

    mockSupabase.from
      .mockReturnValueOnce(currentProject)
      .mockReturnValueOnce(roleCheck);

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/projects/${VALID_UUID}`, {
        status: "planning", // backwards transition
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Cannot transition");
  });

  it("updates project successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    // 1. Fetch current project
    const currentProject = chainMock({
      data: { status: "active", org_id: "org1" },
      error: null,
    });
    // 2. requireOrgRole → org_admin
    const roleCheck = chainMock({ data: { role: "org_admin" }, error: null });
    // 3. Perform update
    const updateChain = chainMock({
      data: { id: VALID_UUID, name: "Updated Name" },
      error: null,
    });

    mockSupabase.from
      .mockReturnValueOnce(currentProject)
      .mockReturnValueOnce(roleCheck)
      .mockReturnValueOnce(updateChain);

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/projects/${VALID_UUID}`, {
        name: "Updated Name",
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated Name");
  });
});

describe("DELETE /api/projects/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(
      createRequest("DELETE", `http://localhost/api/projects/${VALID_UUID}`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await DELETE(
      createRequest("DELETE", "http://localhost/api/projects/bad-id"),
      makeParams("bad-id")
    );
    expect(res.status).toBe(400);
  });

  it("deletes project successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    // 1. Fetch project (org_id)
    const fetchChain = chainMock({ data: { org_id: "org1" }, error: null });
    // 2. requireOrgRole → org_admin
    const roleCheck = chainMock({ data: { role: "org_admin" }, error: null });
    // 3. Delete
    const deleteChain = chainMock({ error: null });

    mockSupabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(roleCheck)
      .mockReturnValueOnce(deleteChain);

    const res = await DELETE(
      createRequest("DELETE", `http://localhost/api/projects/${VALID_UUID}`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 500 on database error", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });

    // 1. Fetch project (org_id)
    const fetchChain = chainMock({ data: { org_id: "org1" }, error: null });
    // 2. requireOrgRole → org_admin
    const roleCheck = chainMock({ data: { role: "org_admin" }, error: null });
    // 3. Delete fails
    const deleteChain = chainMock({ error: { message: "DB error" } });

    mockSupabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(roleCheck)
      .mockReturnValueOnce(deleteChain);

    const res = await DELETE(
      createRequest("DELETE", `http://localhost/api/projects/${VALID_UUID}`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(500);
  });
});
