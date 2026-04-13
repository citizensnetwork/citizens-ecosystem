"use client";

import { useState, useEffect, useCallback } from "react";
import type { CommunityAggregate } from "@/types/federation";

interface CommunityViewProps {
  orgId: string;
}

export function CommunityView({ orgId }: CommunityViewProps) {
  const [data, setData] = useState<CommunityAggregate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCommunity = useCallback(async () => {
    setLoading(true);
    try {
      // Community view uses cross-org data in an anonymized format
      const res = await fetch(
        `/api/metrics/cross-org?org_id=${orgId}&community=true`
      );
      if (res.ok) {
        const result = await res.json();
        // Transform partner data into anonymized community aggregates
        const aggregate: CommunityAggregate = {
          region: "Network",
          org_count: result.partner_count + 1,
          total_activities: result.total_activities,
          total_participants: result.total_participants,
          avg_alignment_score: 0,
          period: {
            from: new Date(Date.now() - 30 * 86400000)
              .toISOString()
              .split("T")[0],
            to: new Date().toISOString().split("T")[0],
          },
        };
        setData([aggregate]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchCommunity();
  }, [fetchCommunity]);

  if (loading) {
    return <p className="text-sm text-text-secondary">Loading community data…</p>;
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg bg-surface p-4">
        <p className="text-sm text-text-secondary">
          Community data requires active partnerships. Anonymized aggregate
          metrics will appear once you have partners.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-surface p-4 space-y-4">
      <h3 className="text-sm font-medium text-text-primary">Community Overview</h3>
      <p className="text-xs text-text-secondary">
        Anonymized aggregate metrics from your partnership network.
      </p>
      {data.map((agg, i) => (
        <div
          key={i}
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          <div className="rounded bg-background p-3 text-center">
            <p className="text-lg font-bold text-white">{agg.org_count}</p>
            <p className="text-xs text-text-secondary">Organisations</p>
          </div>
          <div className="rounded bg-background p-3 text-center">
            <p className="text-lg font-bold text-white">
              {agg.total_activities}
            </p>
            <p className="text-xs text-text-secondary">Total Activities</p>
          </div>
          <div className="rounded bg-background p-3 text-center">
            <p className="text-lg font-bold text-white">
              {agg.total_participants}
            </p>
            <p className="text-xs text-text-secondary">Participants Reached</p>
          </div>
          <div className="rounded bg-background p-3 text-center">
            <p className="text-xs text-text-secondary mt-1">
              {agg.period.from} — {agg.period.to}
            </p>
            <p className="text-xs text-text-secondary">Period</p>
          </div>
        </div>
      ))}
    </div>
  );
}
