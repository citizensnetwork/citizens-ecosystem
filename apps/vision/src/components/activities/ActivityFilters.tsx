"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import type { Department } from "@/types/db";

interface ActivityFiltersProps {
  orgSlug: string;
  departments: Department[];
}

export function ActivityFilters({ orgSlug, departments }: ActivityFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // reset to page 1
    router.push(`/${orgSlug}/activities?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      {/* Search */}
      <input
        type="text"
        placeholder="Search activities..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => {
          // debounce would be ideal; simple onChange for now
          const val = e.target.value;
          if (val.length === 0 || val.length >= 2) {
            updateFilter("search", val);
          }
        }}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {/* Type filter */}
      <select
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) => updateFilter("type", e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
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
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
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
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
      />
      <span className="self-center text-text-secondary">to</span>
      <input
        type="date"
        defaultValue={searchParams.get("date_to") ?? ""}
        onChange={(e) => updateFilter("date_to", e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
      />
    </div>
  );
}
