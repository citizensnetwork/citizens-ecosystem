import { describe, it, expect, vi, beforeEach } from "vitest";
import { listProjectsCursor, listProjectsOffset } from "@/lib/queries/projects";
import { listGoalsCursor, listGoalsOffset } from "@/lib/queries/goals";
import { encodeCursor } from "@/lib/pagination/cursor";

const ORG = "11111111-1111-4111-8111-111111111111";

type ChainMock = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  then: (
    fn: (v: { data: unknown; error: unknown; count?: number }) => unknown,
  ) => Promise<unknown>;
};

function makeChain(
  response: { data: unknown; error: unknown; count?: number },
): ChainMock {
  const chain: Partial<ChainMock> = {};
  const thenable = {
    then: (
      fn: (v: { data: unknown; error: unknown; count?: number }) => unknown,
    ) => Promise.resolve(fn(response)),
  };
  const self = () => chain as ChainMock;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.ilike = vi.fn(self);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.or = vi.fn(self);
  chain.range = vi.fn(self);
  chain.then = thenable.then;
  return chain as ChainMock;
}

function makeClient(response: { data: unknown; error: unknown; count?: number }) {
  const chain = makeChain(response);
  return {
    chain,
    client: {
      from: vi.fn(() => chain),
    },
  };
}

describe("queries/projects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listProjectsCursor applies filters and limit=pageSize+1", async () => {
    const rows = [
      { id: "p1", created_at: "2025-01-10T00:00:00Z", name: "A" },
      { id: "p2", created_at: "2025-01-09T00:00:00Z", name: "B" },
      { id: "p3", created_at: "2025-01-08T00:00:00Z", name: "C" }, // sentinel
    ];
    const { chain, client } = makeClient({ data: rows, error: null });

    const page = await listProjectsCursor(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { orgId: ORG, status: "active", search: "foo" },
      { pageSize: 2 },
    );

    expect(chain.eq).toHaveBeenCalledWith("org_id", ORG);
    expect(chain.eq).toHaveBeenCalledWith("status", "active");
    expect(chain.ilike).toHaveBeenCalledWith("name", "%foo%");
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(page.data).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
  });

  it("listProjectsCursor applies cursor predicate when cursor supplied", async () => {
    const { chain, client } = makeClient({ data: [], error: null });
    const cursor = encodeCursor({ k: "2025-01-05T00:00:00Z", i: "p-5" });

    await listProjectsCursor(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { orgId: ORG },
      { cursor, pageSize: 10 },
    );

    expect(chain.or).toHaveBeenCalledTimes(1);
    const [expr] = chain.or.mock.calls[0];
    expect(expr).toContain("created_at.lt.2025-01-05T00:00:00Z");
    expect(expr).toContain("id.lt.p-5");
  });

  it("listProjectsOffset returns data + total", async () => {
    const rows = [{ id: "p1", created_at: "x", name: "A" }];
    const { client } = makeClient({ data: rows, error: null, count: 1 });

    const result = await listProjectsOffset(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { orgId: ORG },
      { page: 1, pageSize: 20 },
    );

    expect(result.total).toBe(1);
    expect(result.data).toEqual(rows);
  });
});

describe("queries/goals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listGoalsCursor filters by visionId when supplied", async () => {
    const VISION = "22222222-2222-4222-8222-222222222222";
    const { chain, client } = makeClient({ data: [], error: null });

    await listGoalsCursor(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { orgId: ORG, visionId: VISION },
      { pageSize: 20 },
    );

    expect(chain.eq).toHaveBeenCalledWith("vision_id", VISION);
  });

  it("listGoalsCursor ignores an invalid visionId", async () => {
    const { chain, client } = makeClient({ data: [], error: null });

    await listGoalsCursor(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { orgId: ORG, visionId: "not-a-uuid" },
      { pageSize: 20 },
    );

    const eqCalls = chain.eq.mock.calls.map((c: unknown[]) => c[0]);
    expect(eqCalls).not.toContain("vision_id");
  });

  it("listGoalsOffset returns an empty-safe response", async () => {
    const { client } = makeClient({ data: null, error: null, count: 0 });
    const result = await listGoalsOffset(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { orgId: ORG },
      { page: 1, pageSize: 20 },
    );
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("propagates errors from Supabase", async () => {
    const { client } = makeClient({ data: null, error: new Error("boom") });
    await expect(
      listGoalsCursor(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        { orgId: ORG },
        { pageSize: 20 },
      ),
    ).rejects.toThrow("boom");
  });
});
