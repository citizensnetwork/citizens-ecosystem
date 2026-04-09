"use client";

import { useState, useEffect, useRef, useReducer } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDefaultDateRange } from "@/lib/metrics/utils";
import type { Department } from "@/types/db";
import type { OrgKPIs, TrendDataPoint, DepartmentMetric } from "@/types/metrics";
import {
  MetricCard,
  DateRangePicker,
  DashboardFilterBar,
  TrendChart,
  DepartmentBarChart,
  TypePieChart,
} from "@/components/dashboard";

interface DashboardClientProps {
  orgId: string;
  orgName: string;
  departments: Department[];
}

interface OverviewData {
  kpis: OrgKPIs;
  departments: DepartmentMetric[];
  type_distribution: Array<{ type: string; count: number }>;
}

interface TrendData {
  trend: TrendDataPoint[];
  granularity: string;
}

async function fetchDashboardData(
  orgId: string,
  dateFrom: string,
  dateTo: string,
  signal: AbortSignal
): Promise<{ overview: OverviewData | null; trend: TrendData | null }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { overview: null, trend: null };

  const params = new URLSearchParams({
    org_id: orgId,
    date_from: dateFrom,
    date_to: dateTo,
  });

  const [overviewRes, trendRes] = await Promise.all([
    fetch(`/api/metrics/overview?${params}`, { signal }),
    fetch(`/api/metrics/trends?${params}`, { signal }),
  ]);

  return {
    overview: overviewRes.ok ? await overviewRes.json() : null,
    trend: trendRes.ok ? await trendRes.json() : null,
  };
}

export function DashboardClient({
  orgId,
  orgName,
  departments,
}: DashboardClientProps) {
  const defaultRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [fetchCount, bumpFetch] = useReducer((c: number) => c + 1, 0);
  const loading = fetchCount === 0 || overview === null;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    fetchDashboardData(orgId, dateFrom, dateTo, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setOverview(result.overview);
          setTrendData(result.trend);
          bumpFetch();
        }
      })
      .catch(() => {
        if (!cancelled) bumpFetch();
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [orgId, dateFrom, dateTo]);

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  };

  // Client-side filtering of overview data for department/type
  const filteredDepartments = overview?.departments.filter((d) =>
    deptFilter ? d.department_id === deptFilter : true
  ) ?? [];

  const filteredTypes = overview?.type_distribution.filter((t) =>
    typeFilter ? t.type === typeFilter : true
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          {orgName} Dashboard
        </h1>
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />
      </div>

      <DashboardFilterBar
        departments={departments}
        selectedDepartmentId={deptFilter}
        selectedType={typeFilter}
        onDepartmentChange={setDeptFilter}
        onTypeChange={setTypeFilter}
      />

      {loading ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="status"
          aria-busy="true"
          aria-label="Loading dashboard data"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-border bg-surface"
            />
          ))}
        </div>
      ) : overview ? (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Activities"
              value={overview.kpis.total_activities}
              growthPct={overview.kpis.activity_growth_pct}
            />
            <MetricCard
              label="Active Departments"
              value={overview.kpis.active_departments}
            />
            <MetricCard
              label="Participants Reached"
              value={overview.kpis.participants_reached}
            />
            <MetricCard
              label="Activity Growth"
              value={overview.kpis.activity_growth_pct}
              suffix="%"
            />
          </div>

          {/* Charts — 2-column layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TrendChart data={trendData?.trend ?? []} />
            <DepartmentBarChart data={filteredDepartments} />
          </div>

          {/* Full-width type distribution */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TypePieChart data={filteredTypes} />
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-text-primary">
                Period Summary
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Date Range</dt>
                  <dd className="text-text-primary">
                    {dateFrom} → {dateTo}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Period</dt>
                  <dd className="text-text-primary">
                    {overview.kpis.period_days} days
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Previous Period Activities</dt>
                  <dd className="text-text-primary">
                    {overview.kpis.previous_period_count}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Department Count</dt>
                  <dd className="text-text-primary">
                    {overview.departments.length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Activity Types</dt>
                  <dd className="text-text-primary">
                    {overview.type_distribution.length}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-text-secondary">
          Failed to load dashboard data. Please try again.
        </div>
      )}
    </div>
  );
}
