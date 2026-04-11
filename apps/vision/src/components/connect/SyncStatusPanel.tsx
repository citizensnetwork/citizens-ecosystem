"use client";

import type { CCSyncLog } from "@/types/db";
import { CC_SYNC_TYPE_LABELS } from "@/lib/constants";

interface SyncStatusPanelProps {
  logs: CCSyncLog[];
  stats: {
    claimed_events: number;
    claimed_places: number;
    last_sync: CCSyncLog | null;
  };
}

export function SyncStatusPanel({ logs, stats }: SyncStatusPanelProps) {
  return (
    <div className="space-y-6">
      {/* Stats summary */}
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
