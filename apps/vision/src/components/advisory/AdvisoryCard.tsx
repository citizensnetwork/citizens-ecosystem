"use client";

import type { AdvisoryOutput } from "@/types/db";
import { ADVISORY_SEVERITY_COLOURS } from "@/lib/constants";

interface AdvisoryCardProps {
  advisory: AdvisoryOutput;
  onDismiss?: (id: string) => void;
}

export function AdvisoryCard({ advisory, onDismiss }: AdvisoryCardProps) {
  const severityColour =
    ADVISORY_SEVERITY_COLOURS[advisory.severity] ?? "bg-surface-alt";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${severityColour}`}
          />
          <div>
            <h3 className="font-medium text-text-primary">{advisory.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{advisory.body}</p>
            <p className="mt-2 text-xs text-text-secondary">
              {new Date(advisory.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              advisory.severity === "critical"
                ? "bg-red-900/30 text-red-400"
                : advisory.severity === "warning"
                  ? "bg-yellow-900/30 text-yellow-400"
                  : "bg-blue-900/30 text-blue-400"
            }`}
          >
            {advisory.severity}
          </span>

          {!advisory.dismissed && onDismiss && (
            <button
              onClick={() => onDismiss(advisory.id)}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary"
              title="Dismiss advisory"
            >
              Dismiss
            </button>
          )}

          {advisory.dismissed && (
            <span className="text-xs text-text-secondary">Dismissed</span>
          )}
        </div>
      </div>
    </div>
  );
}
