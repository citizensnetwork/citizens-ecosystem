"use client";

import type { AlignmentMatrixEntry } from "@/types/metrics";
import { getAlignmentColour } from "@/lib/metrics/alignment";

interface AlignmentMatrixProps {
  data: AlignmentMatrixEntry[];
  goalTitles: Record<string, string>;
}

export function AlignmentMatrix({ data, goalTitles }: AlignmentMatrixProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        No department activity data for alignment matrix.
      </p>
    );
  }

  // Build unique departments and goals
  const departments = new Map<string, string>();
  const goals = new Map<string, string>();
  const matrix = new Map<string, number>();
  let maxCount = 1;

  for (const entry of data) {
    if (entry.department_id && entry.department_name) {
      departments.set(entry.department_id, entry.department_name);
    }
    goals.set(entry.goal_id, goalTitles[entry.goal_id] ?? entry.goal_id);
    const key = `${entry.goal_id}:${entry.department_id}`;
    matrix.set(key, entry.activity_count);
    if (entry.activity_count > maxCount) maxCount = entry.activity_count;
  }

  const deptEntries = Array.from(departments.entries());
  const goalEntries = Array.from(goals.entries());

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs" role="grid" aria-label="Goals × Departments alignment matrix">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-text-secondary">
              Goal ↓ / Dept →
            </th>
            {deptEntries.map(([id, name]) => (
              <th
                key={id}
                className="px-2 py-1.5 text-center font-medium text-text-secondary"
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goalEntries.map(([goalId, goalTitle]) => (
            <tr key={goalId}>
              <td className="max-w-32 truncate px-2 py-1.5 text-text-primary">
                {goalTitle}
              </td>
              {deptEntries.map(([deptId]) => {
                const count = matrix.get(`${goalId}:${deptId}`) ?? 0;
                const intensity = count / maxCount;
                const colour = count > 0 ? getAlignmentColour(intensity * 100) : "transparent";
                return (
                  <td
                    key={deptId}
                    className="px-2 py-1.5 text-center"
                    style={{
                      backgroundColor: count > 0 ? `${colour}30` : undefined,
                    }}
                  >
                    {count > 0 ? count : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
