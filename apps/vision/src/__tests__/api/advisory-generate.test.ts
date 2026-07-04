import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { POST } = await import("@/app/api/advisory/generate/route");

const validOrg = "660e8400-e29b-41d4-a716-446655440000";

function createPost(body: Record<string, unknown>) {
  return new NextRequest(new URL("http://localhost/api/advisory/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/advisory/generate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(createPost({ org_id: validOrg }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing org_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(createPost({}));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin/manager", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }) };
    mockSupabase.from.mockReturnValue(chain);

    const res = await POST(createPost({ org_id: validOrg }));
    expect(res.status).toBe(403);
  });

  it("generates advisories from metrics and rules", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const roleChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }) };
    const rulesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            id: "rule-1",
            template_id: "tmpl-1",
            metric_slug: "goal_alignment_pct",
            operator: "<",
            threshold: 30,
            lookback_days: 30,
            cooldown_hours: 168,
            active: true,
            created_at: "2025-01-01",
            advisory_templates: {
              type: "alignment_gap",
              title_template: "Low alignment",
              body_template: "Score is {metric_value}%",
              severity: "warning",
            },
          },
        ],
        error: null,
      }),
    };
    const recentChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "out-1", title: "Low alignment", severity: "warning" },
        error: null,
      }),
    };

    let callCount = 0;
    mockSupabase.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleChain;
      if (callCount === 2) return rulesChain;
      if (callCount === 3) return recentChain;
      return insertChain;
    });

    const res = await POST(
      createPost({
        org_id: validOrg,
        metrics: { goal_alignment_pct: 15 },
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.generated).toBe(1);
    expect(body.advisories).toHaveLength(1);
  });
});
