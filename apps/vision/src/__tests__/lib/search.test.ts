import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchActivitiesSimilar,
  searchProjectsSimilar,
  searchGoalsSimilar,
} from "@/lib/queries/search";

const ORG = "11111111-1111-4111-8111-111111111111";

function makeClient(rpcResponse: { data?: unknown; error?: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResponse) };
}

describe("queries/search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("searchActivitiesSimilar passes orgId, query, and limit", async () => {
    const client = makeClient({
      data: [
        {
          id: "a1",
          title: "Town Hall",
          description: null,
          date: "2026-01-10",
          type: "event",
          similarity_score: 0.42,
        },
      ],
      error: null,
    });

    const hits = await searchActivitiesSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "town",
      10,
    );

    expect(client.rpc).toHaveBeenCalledWith("search_activities_similar", {
      p_org_id: ORG,
      p_query: "town",
      p_limit: 10,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].similarity_score).toBe(0.42);
  });

  it("clamps limit to MAX_LIMIT=100", async () => {
    const client = makeClient({ data: [], error: null });
    await searchActivitiesSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "x",
      9999,
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "search_activities_similar",
      expect.objectContaining({ p_limit: 100 }),
    );
  });

  it("falls back to DEFAULT_LIMIT=20 when limit is undefined", async () => {
    const client = makeClient({ data: [], error: null });
    await searchActivitiesSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "x",
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "search_activities_similar",
      expect.objectContaining({ p_limit: 20 }),
    );
  });

  it("falls back to DEFAULT_LIMIT when limit is 0 or negative", async () => {
    const client = makeClient({ data: [], error: null });
    await searchActivitiesSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "x",
      0,
    );
    await searchActivitiesSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "x",
      -5,
    );
    const calls = client.rpc.mock.calls.map((c: unknown[]) => c[1]);
    expect(calls.every((c) => (c as { p_limit: number }).p_limit === 20)).toBe(
      true,
    );
  });

  it("searchProjectsSimilar dispatches to correct RPC", async () => {
    const client = makeClient({ data: [], error: null });
    await searchProjectsSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "build",
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "search_projects_similar",
      expect.any(Object),
    );
  });

  it("searchGoalsSimilar dispatches to correct RPC", async () => {
    const client = makeClient({ data: [], error: null });
    await searchGoalsSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "alignment",
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "search_goals_similar",
      expect.any(Object),
    );
  });

  it("returns [] when RPC returns null data", async () => {
    const client = makeClient({ data: null, error: null });
    const hits = await searchActivitiesSimilar(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ORG,
      "x",
    );
    expect(hits).toEqual([]);
  });

  it("propagates RPC errors", async () => {
    const client = makeClient({ data: null, error: new Error("boom") });
    await expect(
      searchProjectsSimilar(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        ORG,
        "x",
      ),
    ).rejects.toThrow("boom");
  });
});
