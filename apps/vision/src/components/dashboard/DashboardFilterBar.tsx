"use client";

import type { Department } from "@/types/db";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS } from "@/lib/constants";

interface DashboardFilterBarProps {
  departments: Department[];
  selectedDepartmentId: string | null;
  selectedType: string | null;
  onDepartmentChange: (id: string | null) => void;
  onTypeChange: (type: string | null) => void;
}

export function DashboardFilterBar({
  departments,
  selectedDepartmentId,
  selectedType,
  onDepartmentChange,
  onTypeChange,
}: DashboardFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selectedDepartmentId ?? ""}
        onChange={(e) => onDepartmentChange(e.target.value || null)}
        className="rounded border border-border bg-surface-alt px-3 py-1.5 text-sm text-text-primary"
        aria-label="Filter by department"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        value={selectedType ?? ""}
        onChange={(e) => onTypeChange(e.target.value || null)}
        className="rounded border border-border bg-surface-alt px-3 py-1.5 text-sm text-text-primary"
        aria-label="Filter by activity type"
      >
        <option value="">All types</option>
        {ACTIVITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {ACTIVITY_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}
