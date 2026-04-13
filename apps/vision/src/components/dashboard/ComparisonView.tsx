"use client";

import { useState, useEffect, useCallback } from "react";
import type { ComparisonResult } from "@/types/analytics";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";

interface ComparisonViewProps {
  orgId: string;
  departments: { id: string; name: string }[];
}

export function ComparisonView({ orgId, departments }: ComparisonViewProps) {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string>("");

  // Default: last 30 days vs previous 30 days
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000)
    .toISOString()
    .split("T")[0];

  const [periodAFrom, setPeriodAFrom] = useState(sixtyDaysAgo);
  const [periodATo, setPeriodATo] = useState(thirtyDaysAgo);
  const [periodBFrom, setPeriodBFrom] = useState(thirtyDaysAgo);
  const [periodBTo, setPeriodBTo] = useState(today);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      org_id: orgId,
      period_a_from: periodAFrom,
      period_a_to: periodATo,
      period_b_from: periodBFrom,
      period_b_to: periodBTo,
    });
    if (departmentId) params.set("department_id", departmentId);

    try {
      const res = await fetch(`/api/metrics/comparison?${params}`);
      if (!res.ok) throw new Error("Failed to fetch comparison");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load comparison data");
    } finally {
      setLoading(false);
    }
  }, [orgId, periodAFrom, periodATo, periodBFrom, periodBTo, departmentId]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg bg-surface p-4">
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Period A</h3>
          <div className="flex gap-2">
            <input
              type="date"
              value={periodAFrom}
              onChange={(e) => setPeriodAFrom(e.target.value)}
              aria-label="Period A start date"
              className="rounded bg-background px-2 py-1 text-sm text-white border border-border"
            />
            <input
              type="date"
              value={periodATo}
              onChange={(e) => setPeriodATo(e.target.value)}
              aria-label="Period A end date"
              className="rounded bg-background px-2 py-1 text-sm text-white border border-border"
            />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Period B</h3>
          <div className="flex gap-2">
            <input
              type="date"
              value={periodBFrom}
              onChange={(e) => setPeriodBFrom(e.target.value)}
              aria-label="Period B start date"
              className="rounded bg-background px-2 py-1 text-sm text-white border border-border"
            />
            <input
              type="date"
              value={periodBTo}
              onChange={(e) => setPeriodBTo(e.target.value)}
              aria-label="Period B end date"
              className="rounded bg-background px-2 py-1 text-sm text-white border border-border"
            />
          </div>
        </div>
        <div>
          <label htmlFor="comp-dept" className="block text-sm text-text-secondary mb-1">
            Department Filter
          </label>
          <select
            id="comp-dept"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded bg-background px-2 py-1 text-sm text-white border border-border"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8 text-text-secondary">Loading comparison…</div>
      )}

      {error && (
        <div className="text-center py-8 text-red-400">{error}</div>
      )}

      {result && !loading && (
        <>
          {/* KPI Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ComparisonCard
              label="Total Activities"
              valueA={result.metrics.total_activities.a}
              valueB={result.metrics.total_activities.b}
              changePct={result.metrics.total_activities.change_pct}
            />
            <ComparisonCard
              label="Participants Reached"
              valueA={result.metrics.participants_reached.a}
              valueB={result.metrics.participants_reached.b}
              changePct={result.metrics.participants_reached.change_pct}
            />
            <ComparisonCard
              label="Active Departments"
              valueA={result.metrics.active_departments.a}
              valueB={result.metrics.active_departments.b}
              changePct={result.metrics.active_departments.change_pct}
            />
          </div>

          {/* Type Breakdown */}
          {result.metrics.type_breakdown.length > 0 && (
            <div className="rounded-lg bg-surface p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                Activity Type Comparison
              </h3>
              <div className="space-y-2">
                {result.metrics.type_breakdown.map((t) => (
                  <div
                    key={t.type}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-text-primary">
                      {ACTIVITY_TYPE_LABELS[t.type] ?? t.type}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="text-text-secondary w-12 text-right">
                        {t.count_a}
                      </span>
                      <span className="text-white w-12 text-right">
                        {t.count_b}
                      </span>
                      <ChangeIndicator changePct={t.change_pct} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department Breakdown */}
          {result.metrics.department_breakdown.length > 0 && (
            <div className="rounded-lg bg-surface p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                Department Comparison
              </h3>
              <div className="space-y-2">
                {result.metrics.department_breakdown.map((d) => (
                  <div
                    key={d.department_id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-text-primary">{d.department_name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-text-secondary w-12 text-right">
                        {d.count_a}
                      </span>
                      <span className="text-white w-12 text-right">
                        {d.count_b}
                      </span>
                      <ChangeIndicator changePct={d.change_pct} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ComparisonCard({
  label,
  valueA,
  valueB,
  changePct,
}: {
  label: string;
  valueA: number;
  valueB: number;
  changePct: number;
}) {
  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-text-secondary text-sm mr-2">A: {valueA.toLocaleString()}</span>
          <span className="text-white text-lg font-semibold">
            B: {valueB.toLocaleString()}
          </span>
        </div>
        <ChangeIndicator changePct={changePct} />
      </div>
    </div>
  );
}

function ChangeIndicator({ changePct }: { changePct: number }) {
  const colour =
    changePct > 0 ? "text-green-400" : changePct < 0 ? "text-red-400" : "text-text-secondary";
  const arrow = changePct > 0 ? "↑" : changePct < 0 ? "↓" : "→";
  return (
    <span className={`${colour} text-sm font-medium w-16 text-right`}>
      {arrow} {Math.abs(changePct)}%
    </span>
  );
}
