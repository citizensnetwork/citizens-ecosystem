"use client";

import { useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import type { Department } from "@/types/db";

interface ProjectFiltersProps {
  orgSlug: string;
  departments: Department[];
}

export function ProjectFilters({ orgSlug, departments }: ProjectFiltersProps) {
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
    router.push(`/${orgSlug}/projects?${params.toString()}`);
  }

  const debouncedSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => updateFilter("search", value),
        300
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, orgSlug]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        placeholder="Search projects…"
        aria-label="Search projects"
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
        {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {departments.length > 0 && (
        <select
          value={searchParams.get("department_id") ?? ""}
          aria-label="Filter by department"
          onChange={(e) => updateFilter("department_id", e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
