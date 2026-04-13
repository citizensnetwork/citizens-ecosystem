"use client";

import { useState, useEffect, useCallback } from "react";
import type { ScheduledReport } from "@/types/analytics";

interface ScheduledReportsProps {
  orgId: string;
  isAdmin: boolean;
}

export function ScheduledReports({ orgId, isAdmin }: ScheduledReportsProps) {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formFrequency, setFormFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [formRecipients, setFormRecipients] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function handleCreate() {
    setFormError(null);
    const recipients = formRecipients
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (!formName) {
      setFormError("Name is required");
      return;
    }
    if (recipients.length === 0) {
      setFormError("At least one recipient email is required");
      return;
    }

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name: formName,
          frequency: formFrequency,
          recipients,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormName("");
        setFormRecipients("");
        fetchReports();
      } else {
        const data = await res.json();
        setFormError(data.error);
      }
    } catch (err) {
      console.error(err);
      setFormError("Failed to create report");
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      fetchReports();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      fetchReports();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Scheduled Reports</h3>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover"
            aria-label="Create scheduled report"
          >
            {showForm ? "Cancel" : "+ New Report"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-2 border border-border rounded p-3">
          <input
            type="text"
            placeholder="Report name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            aria-label="Report name"
            className="w-full rounded bg-background px-2 py-1 text-sm text-white border border-border"
          />
          <select
            value={formFrequency}
            onChange={(e) =>
              setFormFrequency(e.target.value as "daily" | "weekly" | "monthly")
            }
            aria-label="Report frequency"
            className="w-full rounded bg-background px-2 py-1 text-sm text-white border border-border"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input
            type="text"
            placeholder="Recipients (comma-separated emails)"
            value={formRecipients}
            onChange={(e) => setFormRecipients(e.target.value)}
            aria-label="Recipients"
            className="w-full rounded bg-background px-2 py-1 text-sm text-white border border-border"
          />
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <button
            onClick={handleCreate}
            className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
            aria-label="Save scheduled report"
          >
            Create Report
          </button>
        </div>
      )}

      {loading && (
        <p className="text-sm text-text-secondary">Loading reports…</p>
      )}

      {!loading && reports.length === 0 && (
        <p className="text-sm text-text-secondary">No scheduled reports configured.</p>
      )}

      {reports.map((report) => (
        <div
          key={report.id}
          className="flex items-center justify-between border-b border-border pb-2 last:border-b-0"
        >
          <div>
            <p className="text-sm text-white">{report.name}</p>
            <p className="text-xs text-text-secondary">
              {report.frequency} · {report.recipients.length} recipient
              {report.recipients.length !== 1 ? "s" : ""}
              {report.last_sent_at
                ? ` · Last sent: ${new Date(report.last_sent_at).toLocaleDateString()}`
                : ""}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => handleToggle(report.id, report.active)}
                className={`rounded px-2 py-1 text-xs ${
                  report.active
                    ? "bg-green-600 text-white"
                    : "bg-surface-alt text-text-primary"
                }`}
                aria-label={
                  report.active ? "Pause report" : "Activate report"
                }
              >
                {report.active ? "Active" : "Paused"}
              </button>
              <button
                onClick={() => handleDelete(report.id)}
                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                aria-label="Delete report"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
