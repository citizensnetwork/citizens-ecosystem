"use client";

import { useState, useCallback } from "react";
import { AdvisoryCard } from "./AdvisoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AdvisoryOutput } from "@/types/db";

interface AdvisoryFeedProps {
  initialAdvisories: AdvisoryOutput[];
  orgId: string;
  orgSlug: string;
  total: number;
  page: number;
  perPage: number;
  summary: { info: number; warning: number; critical: number };
}

export function AdvisoryFeed({
  initialAdvisories,
  orgId,
  orgSlug,
  total,
  page,
  perPage,
  summary,
}: AdvisoryFeedProps) {
  const [advisories, setAdvisories] = useState(initialAdvisories);
  const totalPages = Math.ceil(total / perPage);

  const handleDismiss = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/advisory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, action: "dismiss" }),
      });
      if (res.ok) {
        setAdvisories((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, dismissed: true, dismissed_at: new Date().toISOString() }
              : a
          )
        );
      }
    },
    [orgId]
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <p className="text-xs text-text-secondary">Critical</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {summary.critical}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <p className="text-xs text-text-secondary">Warning</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {summary.warning}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            <p className="text-xs text-text-secondary">Info</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {summary.info}
          </p>
        </div>
      </div>

      {/* Advisory list */}
      {advisories.length === 0 ? (
        <EmptyState
          title="No active advisories"
          description="All clear! No advisories to review at this time."
        />
      ) : (
        <div className="space-y-3">
          {advisories.map((advisory) => (
            <AdvisoryCard
              key={advisory.id}
              advisory={advisory}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm text-text-secondary">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/${orgSlug}/advisory?page=${page - 1}`}
                className="rounded-md border border-border px-3 py-1 hover:bg-surface-alt"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/${orgSlug}/advisory?page=${page + 1}`}
                className="rounded-md border border-border px-3 py-1 hover:bg-surface-alt"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
