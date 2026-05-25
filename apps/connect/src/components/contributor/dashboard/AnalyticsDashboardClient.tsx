"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ANALYTICS_PERIOD_LABELS, type AnalyticsPeriod } from "@/types/db";

interface Props {
  slug: string;
  period: AnalyticsPeriod;
  entityType: string;
  entityId: string | null;
  byMetric: Record<string, { date: string; value: number }[]>;
  totals: Record<string, number>;
  events: { id: string; title: string }[];
  places: { id: string; name: string }[];
}

const PERIODS: AnalyticsPeriod[] = [7, 14, 30, 60, 90, 180, 365];

const METRIC_LABELS: Record<string, string> = {
  views: "Views",
  rsvps: "RSVPs",
  cancellations: "Cancellations",
  follows: "Follows",
  comments: "Comments",
  reports: "Reports",
  shares: "Shares",
  convinces: "Convinces",
  broadcasts: "Broadcasts",
};

export default function AnalyticsDashboardClient({
  slug,
  period,
  entityType,
  entityId,
  byMetric,
  totals,
  events,
  places,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(updates: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(`${pathname}?${sp.toString()}`);
  }

  function exportCsv() {
    const rows: string[] = ["date,metric,value"];
    for (const [metric, series] of Object.entries(byMetric)) {
      for (const { date, value } of series) {
        rows.push(`${date},${metric},${value}`);
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${slug}-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasData = Object.keys(byMetric).length > 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period selector */}
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => updateParams({ period: String(p) })}
              className={[
                "px-2 py-1 text-xs rounded-lg transition-colors",
                p === period
                  ? "bg-[--gold] text-white font-semibold"
                  : "text-[--foreground-soft] hover:text-[--foreground]",
              ].join(" ")}
            >
              {ANALYTICS_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Entity type selector */}
        <select
          value={entityType}
          onChange={(e) => updateParams({ entity_type: e.target.value, entity_id: "" })}
          className="text-sm border border-[--border] rounded-lg px-3 py-1.5 bg-[--surface]"
        >
          <option value="contributor">Contributor (all)</option>
          <option value="event">Specific event</option>
          <option value="place">Specific place</option>
        </select>

        {entityType === "event" && (
          <select
            value={entityId ?? ""}
            onChange={(e) => updateParams({ entity_id: e.target.value })}
            className="text-sm border border-[--border] rounded-lg px-3 py-1.5 bg-[--surface]"
          >
            <option value="">— Select event —</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        )}

        {entityType === "place" && (
          <select
            value={entityId ?? ""}
            onChange={(e) => updateParams({ entity_id: e.target.value })}
            className="text-sm border border-[--border] rounded-lg px-3 py-1.5 bg-[--surface]"
          >
            <option value="">— Select place —</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={exportCsv}
          disabled={!hasData}
          className="ml-auto text-sm px-3 py-1.5 rounded-xl border border-[--border] hover:border-[--gold] transition-colors disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      {hasData ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(totals).map(([metric, total]) => (
              <div key={metric} className="surface-card rounded-xl p-4">
                <div className="text-2xl font-bold">{total.toLocaleString()}</div>
                <div className="text-xs text-[--foreground-soft] mt-1">
                  {METRIC_LABELS[metric] ?? metric}
                </div>
              </div>
            ))}
          </div>

          {/* Per-metric tables */}
          <div className="space-y-6">
            {Object.entries(byMetric).map(([metric, series]) => (
              <section key={metric}>
                <h3 className="text-sm font-semibold mb-2">
                  {METRIC_LABELS[metric] ?? metric} over {ANALYTICS_PERIOD_LABELS[period]}
                </h3>
                <div className="surface-card rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[--border] bg-[--surface-muted]">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-[--foreground-soft]">
                          Date
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-[--foreground-soft]">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.map(({ date, value }) => (
                        <tr
                          key={date}
                          className="border-b border-[--border] last:border-0 hover:bg-[--surface-muted]/50"
                        >
                          <td className="px-4 py-2 text-[--foreground-soft]">{date}</td>
                          <td className="px-4 py-2 text-right font-medium">
                            {value.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-sm text-[--foreground-soft]">
          No analytics data for the selected period.
        </div>
      )}
    </div>
  );
}
