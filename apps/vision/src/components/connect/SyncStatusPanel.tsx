"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CCSyncLog } from "@/types/db";
import { CC_SYNC_TYPE_LABELS } from "@/lib/constants";

interface SyncStatusPanelProps {
  logs: CCSyncLog[];
  stats: {
    claimed_events: number;
    claimed_places: number;
    last_sync: CCSyncLog | null;
  };
  orgId?: string;
  canTrigger?: boolean;
}

export function SyncStatusPanel({
  logs,
  stats,
  orgId,
  canTrigger = false,
}: SyncStatusPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function handleSyncNow() {
    if (!orgId || !canTrigger) return;
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/connect/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        result?: { records_synced?: number };
      };
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      setLastResult(
        `Synced ${json.result?.records_synced ?? 0} record(s) from Connect.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canTrigger && orgId && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Sync now"}
          </button>
          {lastResult && (
            <span className="text-xs text-text-secondary">{lastResult}</span>
          )}
          {error && (
            <span role="alert" className="text-xs text-red-300">
              {error}
            </span>
          )}
        </div>
      )}      {/* Stats summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Claimed Events</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {stats.claimed_events}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Claimed Places</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {stats.claimed_places}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Last Sync</p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {stats.last_sync
              ? new Date(stats.last_sync.started_at).toLocaleString()
              : "Never"}
          </p>
        </div>
      </div>

      {/* Sync logs */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-text-primary">
          Recent Sync Logs
        </h3>
        {logs.length === 0 ? (
          <p className="text-sm text-text-secondary">No sync logs yet.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      log.completed_at ? "bg-green-400" : "bg-yellow-400"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {CC_SYNC_TYPE_LABELS[log.sync_type] ?? log.sync_type}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {new Date(log.started_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-text-primary">
                    {log.records_synced} records
                  </p>
                  {log.errors && (log.errors as unknown[]).length > 0 && (
                    <p className="text-xs text-red-400">
                      {(log.errors as unknown[]).length} errors
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
