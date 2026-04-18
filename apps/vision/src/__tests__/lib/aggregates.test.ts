import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  readDailyAggregates,
  collapseByDay,
  refreshOrgAggregates,
  refreshActivityDay,
  type DailyAggregateRow,
} from "@/lib/queries/aggregates";

function makeSupabase(response: { data?: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(response),
  };
  return {
    chain,
    client: {
      from: vi.fn(() => chain),
      rpc: vi.fn().mockResolvedValue(response),
    },
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";

describe("aggregates query helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("readDailyAggregates", () => {
    it("passes org + date window to the query", async () => {
      const sample: DailyAggregateRow[] = [
        {
          org_id: ORG,
          day: "2025-01-10",
          activity_type: "event",
          activity_count: 3,
          participant_total: 30,
          hours_total: 9,
          refreshed_at: "2025-01-10T12:00:00Z",
        },
      ];
      const { chain, client } = makeSupabase({ data: sample, error: null });

      const result = await readDailyAggregates(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        ORG,
        { from: "2025-01-01", to: "2025-01-31" },
      );

      expect(client.from).toHaveBeenCalledWith("activity_daily_aggregates");
      expect(chain.eq).toHaveBeenCalledWith("org_id", ORG);
      expect(chain.gte).toHaveBeenCalledWith("day", "2025-01-01");
      expect(chain.lte).toHaveBeenCalledWith("day", "2025-01-31");
      expect(chain.in).not.toHaveBeenCalled();
      expect(result).toEqual(sample);
    });

    it("applies activity_type filter when types supplied", async () => {
      const { chain, client } = makeSupabase({ data: [], error: null });

      await readDailyAggregates(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        ORG,
        { from: "2025-01-01", to: "2025-01-31", types: ["event", "meeting"] },
      );

      expect(chain.in).toHaveBeenCalledWith("activity_type", [
        "event",
        "meeting",
      ]);
    });

    it("throws when Supabase returns an error", async () => {
      const { client } = makeSupabase({
        data: null,
        error: new Error("boom"),
      });
      await expect(
        readDailyAggregates(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          client as any,
          ORG,
          { from: "2025-01-01", to: "2025-01-31" },
        ),
      ).rejects.toThrow("boom");
    });
  });

  describe("collapseByDay", () => {
    it("sums per-type rows into a single daily trend point", () => {
      const rows: DailyAggregateRow[] = [
        {
          org_id: ORG,
          day: "2025-01-10",
          activity_type: "event",
          activity_count: 2,
          participant_total: 20,
          hours_total: 4,
          refreshed_at: "",
        },
        {
          org_id: ORG,
          day: "2025-01-10",
          activity_type: "meeting",
          activity_count: 1,
          participant_total: 8,
          hours_total: 2,
          refreshed_at: "",
        },
        {
          org_id: ORG,
          day: "2025-01-11",
          activity_type: "event",
          activity_count: 3,
          participant_total: 45,
          hours_total: 6,
          refreshed_at: "",
        },
      ];

      const trend = collapseByDay(rows);
      expect(trend).toHaveLength(2);
      expect(trend[0]).toEqual({
        day: "2025-01-10",
        activity_count: 3,
        participant_total: 28,
        hours_total: 6,
      });
      expect(trend[1]).toEqual({
        day: "2025-01-11",
        activity_count: 3,
        participant_total: 45,
        hours_total: 6,
      });
    });

    it("returns days in ascending order even when input is shuffled", () => {
      const rows: DailyAggregateRow[] = [
        {
          org_id: ORG,
          day: "2025-02-01",
          activity_type: "event",
          activity_count: 1,
          participant_total: 0,
          hours_total: 0,
          refreshed_at: "",
        },
        {
          org_id: ORG,
          day: "2025-01-10",
          activity_type: "event",
          activity_count: 1,
          participant_total: 0,
          hours_total: 0,
          refreshed_at: "",
        },
      ];
      const trend = collapseByDay(rows);
      expect(trend.map((p) => p.day)).toEqual(["2025-01-10", "2025-02-01"]);
    });

    it("handles an empty input", () => {
      expect(collapseByDay([])).toEqual([]);
    });
  });

  describe("refresh RPCs", () => {
    it("refreshOrgAggregates calls refresh_activity_daily_aggregates", async () => {
      const { client } = makeSupabase({ error: null });
      await refreshOrgAggregates(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        ORG,
      );
      expect(client.rpc).toHaveBeenCalledWith(
        "refresh_activity_daily_aggregates",
        { p_org_id: ORG },
      );
    });

    it("refreshActivityDay calls refresh_activity_day with org+day", async () => {
      const { client } = makeSupabase({ error: null });
      await refreshActivityDay(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        ORG,
        "2025-01-15",
      );
      expect(client.rpc).toHaveBeenCalledWith("refresh_activity_day", {
        p_org_id: ORG,
        p_day: "2025-01-15",
      });
    });

    it("refresh RPCs throw when the function returns an error", async () => {
      const { client } = makeSupabase({ error: new Error("rpc failed") });
      await expect(
        refreshOrgAggregates(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          client as any,
          ORG,
        ),
      ).rejects.toThrow("rpc failed");
    });
  });
});
