"use client";

import { useState, useEffect, useCallback } from "react";
import type { PartnerOrgSummary } from "@/types/federation";
import { MetricCard } from "./MetricCard";

interface CrossOrgDashboardProps {
  orgId: string;
}

export function CrossOrgDashboard({ orgId }: CrossOrgDashboardProps) {
  const [partners, setPartners] = useState<PartnerOrgSummary[]>([]);
  const [totalActivities, setTotalActivities] = useState(0);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCrossOrg = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics/cross-org?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setPartners(data.partners);
        setTotalActivities(data.total_activities);
        setTotalParticipants(data.total_participants);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchCrossOrg();
  }, [fetchCrossOrg]);

  if (loading) {
    return <p className="text-sm text-text-secondary">Loading cross-org metrics…</p>;
  }

  if (partners.length === 0) {
    return (
      <div className="rounded-lg bg-surface p-4">
        <p className="text-sm text-text-secondary">
          No active partnerships. Partner with other organisations to see cross-org insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="Active Partners"
          value={partners.length}
        />
        <MetricCard
          label="Combined Activities"
          value={totalActivities}
        />
        <MetricCard
          label="Combined Participants"
          value={totalParticipants}
        />
      </div>

      <div className="rounded-lg bg-surface p-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">Partner Metrics</h3>
        <div className="space-y-2">
          {partners.map((p) => (
            <div
              key={p.org_id}
              className="flex items-center justify-between border-b border-border pb-2 last:border-b-0"
            >
              <div>
                <p className="text-sm text-white">{p.org_name}</p>
                <p className="text-xs text-text-secondary">
                  Sharing: {p.sharing_level}
                </p>
              </div>
              <div className="text-right">
                {p.kpis ? (
                  <>
                    <p className="text-sm text-white">
                      {p.kpis.total_activities ?? 0} activities
                    </p>
                    <p className="text-xs text-text-secondary">
                      {p.kpis.participants_reached ?? 0} participants ·{" "}
                      {p.kpis.active_departments ?? 0} depts
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-text-secondary">No metrics shared</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
