"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import type { Department } from "@/types/db";

interface MapFiltersProps {
  orgSlug: string;
  departments: Department[];
}

export function MapFilters({ orgSlug, departments }: MapFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/${orgSlug}/map?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Type filter */}
      <select
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) => updateFilter("type", e.target.value)}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        aria-label="Filter by activity type"
      >
        <option value="">All types</option>
        {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Department filter */}
      <select
        defaultValue={searchParams.get("department_id") ?? ""}
        onChange={(e) => updateFilter("department_id", e.target.value)}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        aria-label="Filter by department"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      {/* Date range */}
      <input
        type="date"
        defaultValue={searchParams.get("date_from") ?? ""}
        onChange={(e) => updateFilter("date_from", e.target.value)}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        aria-label="From date"
      />
      <span className="text-xs text-text-secondary">to</span>
      <input
        type="date"
        defaultValue={searchParams.get("date_to") ?? ""}
        onChange={(e) => updateFilter("date_to", e.target.value)}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        aria-label="To date"
      />
    </div>
  );
}
