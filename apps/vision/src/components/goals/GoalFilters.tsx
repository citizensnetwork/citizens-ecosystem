"use client";

import { useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GOAL_STATUS_LABELS } from "@/lib/constants";
import type { VisionStatement } from "@/types/db";

interface GoalFiltersProps {
  orgSlug: string;
  visions: VisionStatement[];
}

export function GoalFilters({ orgSlug, visions }: GoalFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/${orgSlug}/goals?${params.toString()}`);
  }

  const debouncedSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => updateFilter("search", value), 300);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, orgSlug]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        placeholder="Search goals…"
        aria-label="Search goals"
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => debouncedSearch(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:border-accent focus:outline-none"
      />

      <select
        value={searchParams.get("status") ?? ""}
        aria-label="Filter by status"
        onChange={(e) => updateFilter("status", e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
      >
        <option value="">All Statuses</option>
        {Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {visions.length > 0 && (
        <select
          value={searchParams.get("vision_id") ?? ""}
          aria-label="Filter by vision"
          onChange={(e) => updateFilter("vision_id", e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Visions</option>
          {visions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
