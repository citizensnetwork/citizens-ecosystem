"use client";

import { useState } from "react";

interface ExportPanelProps {
  orgId: string;
}

export function ExportPanel({ orgId }: ExportPanelProps) {
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().split("T")[0]
  );

  async function handleExport(
    exportType: "csv" | "pdf" | "png",
    resource: "activities" | "metrics"
  ) {
    setExporting(true);
    setExportResult(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          export_type: exportType,
          resource,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });

      if (exportType === "csv" && res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${resource}-export-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportResult("CSV downloaded successfully");
      } else if (res.ok) {
        const data = await res.json();
        setExportResult(data.message);
      } else {
        setExportResult("Export failed");
      }
    } catch (err) {
      console.error(err);
      setExportResult("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4 space-y-4">
      <h3 className="text-sm font-medium text-text-primary">Export Data</h3>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label htmlFor="export-from" className="block text-xs text-text-secondary mb-1">
            From
          </label>
          <input
            id="export-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded bg-background px-2 py-1 text-xs text-white border border-border"
          />
        </div>
        <div>
          <label htmlFor="export-to" className="block text-xs text-text-secondary mb-1">
            To
          </label>
          <input
            id="export-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded bg-background px-2 py-1 text-xs text-white border border-border"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleExport("csv", "activities")}
          disabled={exporting}
          className="rounded bg-accent px-3 py-1.5 text-xs text-white font-medium hover:bg-accent-hover disabled:opacity-50"
          aria-label="Export activities as CSV"
        >
          {exporting ? "Exporting…" : "📄 Activities CSV"}
        </button>
        <button
          onClick={() => handleExport("csv", "metrics")}
          disabled={exporting}
          className="rounded bg-accent px-3 py-1.5 text-xs text-white font-medium hover:bg-accent-hover disabled:opacity-50"
          aria-label="Export metrics as CSV"
        >
          {exporting ? "Exporting…" : "📊 Metrics CSV"}
        </button>
      </div>

      {exportResult && (
        <p className="text-xs text-text-secondary">{exportResult}</p>
      )}
    </div>
  );
}
