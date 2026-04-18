import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOrgDashboardStats,
  refreshDashboardStats,
} from "@/lib/queries/dashboard-stats";

const ORG = "11111111-1111-4111-8111-111111111111";

function makeClient(rpcResponse: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResponse),
  };
}

describe("dashboard-stats query helper", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls get_org_dashboard_stats(p_org_id)", async () => {
    const client = makeClient({
      data: [
        {
          org_id: ORG,
          total_activities: 42,
          activities_last_30d: 5,
          total_participants: 100,
          total_projects: 3,
          active_projects: 2,
          completed_projects: 1,
          total_goals: 8,
          achieved_goals: 2,
          active_goals: 5,
          total_departments: 4,
          total_members: 12,
          latest_activity_at: "2025-01-10",
          refreshed_at: "2025-01-10T12:00:00Z",
        },
      ],
      error: null,
    });

    const stats = await getOrgDashboardStats(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
    );

    expect(client.rpc).toHaveBeenCalledWith("get_org_dashboard_stats", {
      p_org_id: ORG,
    });
    expect(stats?.total_activities).toBe(42);
  });

  it("returns null when the RPC returns no rows", async () => {
    const client = makeClient({ data: [], error: null });
    const stats = await getOrgDashboardStats(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
    );
    expect(stats).toBeNull();
  });

  it("returns null when data is null (e.g. empty RPC response)", async () => {
    const client = makeClient({ data: null, error: null });
    const stats = await getOrgDashboardStats(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
    );
    expect(stats).toBeNull();
  });

  it("throws when the RPC returns an error", async () => {
    const client = makeClient({ data: null, error: new Error("forbidden") });
    await expect(
      getOrgDashboardStats(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        ORG,
      ),
    ).rejects.toThrow("forbidden");
  });

  it("refreshDashboardStats calls refresh_org_dashboard_stats", async () => {
    const client = makeClient({ error: null });
    await refreshDashboardStats(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
    );
    expect(client.rpc).toHaveBeenCalledWith("refresh_org_dashboard_stats");
  });
});
