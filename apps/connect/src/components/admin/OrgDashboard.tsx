"use client";

// Dashboard for contributors (own org) and admins (own org + community
// health + category trends). Consumes /api/dashboard/stats which
// delegates to SECURITY DEFINER RPCs with enforced auth gates.
//
// Rendered inside /dashboard/page.tsx which performs the role check
// before ever mounting this component — but we still guard against
// an unexpected 401/403 from the API in case session expires
// mid-session.

import { useEffect, useMemo, useState } from "react";

type DayPoint = { day: string; count: number };

type OrgStats = {
  total_events: number;
  upcoming: number;
  past: number;
  total_rsvps: number;
  avg_rsvps_per_event: number;
  views_total: number;
  new_followers_30d: number;
};

type Audience = {
  rsvps_30d: DayPoint[];
  new_followers_30d: DayPoint[];
};

type CommunityHealth = {
  active_contributors: number;
  new_contributors_30d: number;
  events_30d: number;
  rsvps_30d: number;
  unique_rsvpers_30d: number;
  total_citizens: number;
  total_events_all_time: number;
};

type CategoryTrend = {
  category: string;
  current_30d: number;
  prior_30d: number;
  growth_pct: number | null;
};

type DashboardPayload = {
  role: "admin" | "contributor";
  org_id: string;
  stats: OrgStats | null;
  audience: Audience | null;
  community_health?: CommunityHealth | null;
  category_trends?: CategoryTrend[] | null;
};

export default function OrgDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
        // If session expired mid-session / role changed under us, bounce
        // to the appropriate destination instead of showing a raw error.
        if (res.status === 401) {
          if (!cancelled) window.location.href = "/login?redirect=/dashboard";
          return;
        }
        if (res.status === 403) {
          if (!cancelled) window.location.href = "/profile";
          return;
        }
        if (!res.ok) {
          throw new Error(`Couldn't load dashboard (HTTP ${res.status}).`);
        }
        const json = (await res.json()) as { data: DashboardPayload };
        if (!cancelled) setData(json.data);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Couldn't load dashboard.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton mt-6 h-64 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stats = data.stats;
  const audience = data.audience;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {data.role === "admin" ? "Platform dashboard" : "Your dashboard"}
        </h1>
        <p className="mt-1 text-sm text-black/60">
          {data.role === "admin"
            ? "Community health + your own contributor stats."
            : "Your events, RSVPs, followers at a glance."}
        </p>
      </div>

      {/* Org-scoped KPI grid */}
      {stats && (
        <section aria-labelledby="your-stats" className="mb-10">
          <h2 id="your-stats" className="mb-3 text-sm font-semibold text-black/60">
            {data.role === "admin" ? "Your contributor activity" : "Your activity"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Events published" value={stats.total_events} />
            <StatCard label="Upcoming" value={stats.upcoming} />
            <StatCard label="Total RSVPs" value={stats.total_rsvps} />
            <StatCard
              label="Avg RSVPs / event"
              value={stats.avg_rsvps_per_event}
            />
            <StatCard label="Views" value={stats.views_total} />
            <StatCard
              label="New followers (30d)"
              value={stats.new_followers_30d}
            />
            <StatCard label="Past events" value={stats.past} />
          </div>
        </section>
      )}

      {/* 30-day audience sparklines */}
      {audience && (
        <section aria-labelledby="audience" className="mb-10">
          <h2 id="audience" className="mb-3 text-sm font-semibold text-black/60">
            Last 30 days
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Sparkline
              title="RSVPs received"
              points={audience.rsvps_30d}
              color="var(--gold)"
            />
            <Sparkline
              title="New followers"
              points={audience.new_followers_30d}
              color="#7c3aed"
            />
          </div>
        </section>
      )}

      {/* Admin-only: community health + category trends */}
      {data.role === "admin" && data.community_health && (
        <section aria-labelledby="community" className="mb-10">
          <h2 id="community" className="mb-3 text-sm font-semibold text-black/60">
            Community health
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active contributors"
              value={data.community_health.active_contributors}
            />
            <StatCard
              label="New contributors (30d)"
              value={data.community_health.new_contributors_30d}
            />
            <StatCard
              label="Events (30d)"
              value={data.community_health.events_30d}
            />
            <StatCard
              label="RSVPs (30d)"
              value={data.community_health.rsvps_30d}
            />
            <StatCard
              label="Unique RSVPers (30d)"
              value={data.community_health.unique_rsvpers_30d}
            />
            <StatCard
              label="Total citizens"
              value={data.community_health.total_citizens}
            />
            <StatCard
              label="Events all-time"
              value={data.community_health.total_events_all_time}
            />
          </div>
        </section>
      )}

      {data.role === "admin" &&
        data.category_trends &&
        data.category_trends.length > 0 && (
          <section aria-labelledby="trends" className="mb-10">
            <h2
              id="trends"
              className="mb-3 text-sm font-semibold text-black/60"
            >
              Category trends — last 30 days vs prior 30 days
            </h2>
            <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-black/3 text-left text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2 text-right">Last 30d</th>
                    <th className="px-4 py-2 text-right">Prior 30d</th>
                    <th className="px-4 py-2 text-right">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {data.category_trends.map((t) => (
                    <tr key={t.category} className="border-t border-black/5">
                      <td className="px-4 py-2 font-medium">{t.category}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {t.current_30d}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-black/60">
                        {t.prior_30d}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          t.growth_pct == null
                            ? "text-black/40"
                            : t.growth_pct >= 0
                              ? "text-green-700"
                              : "text-red-700"
                        }`}
                      >
                        {t.growth_pct == null ? "—" : `${t.growth_pct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-black/50">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {Number.isFinite(value) ? value.toLocaleString() : "—"}
      </div>
    </div>
  );
}

/** Pure-SVG sparkline — no chart lib, no client JS beyond the render.
 *  Points are expected in chronological order. */
function Sparkline({
  title,
  points,
  color,
}: {
  title: string;
  points: DayPoint[];
  color: string;
}) {
  const total = useMemo(
    () => points.reduce((s, p) => s + (p.count ?? 0), 0),
    [points],
  );
  const max = useMemo(
    () => Math.max(1, ...points.map((p) => p.count ?? 0)),
    [points],
  );
  const W = 320;
  const H = 80;
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = H - ((p.count ?? 0) / max) * (H - 6) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="text-xs text-black/50">{total} in 30 days</div>
      </div>
      <svg
        role="img"
        aria-label={`${title} over the last 30 days`}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-20 w-full"
      >
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
