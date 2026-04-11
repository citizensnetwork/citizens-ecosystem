import { ADVISORY_SEVERITY_COLOURS } from "@/lib/constants";

interface AdvisorySummaryCardProps {
  summary: { info: number; warning: number; critical: number };
  orgSlug: string;
}

export function AdvisorySummaryCard({
  summary,
  orgSlug,
}: AdvisorySummaryCardProps) {
  const total = summary.info + summary.warning + summary.critical;

  return (
    <a
      href={`/${orgSlug}/advisory`}
      className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Advisories</h3>
        <span className="text-xs text-text-secondary">{total} active</span>
      </div>
      <div className="mt-3 flex items-center gap-4">
        {summary.critical > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ADVISORY_SEVERITY_COLOURS.critical}`} />
            <span className="text-sm font-medium text-red-400">
              {summary.critical}
            </span>
          </div>
        )}
        {summary.warning > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ADVISORY_SEVERITY_COLOURS.warning}`} />
            <span className="text-sm font-medium text-yellow-400">
              {summary.warning}
            </span>
          </div>
        )}
        {summary.info > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ADVISORY_SEVERITY_COLOURS.info}`} />
            <span className="text-sm font-medium text-blue-400">
              {summary.info}
            </span>
          </div>
        )}
        {total === 0 && (
          <span className="text-sm text-text-secondary">All clear</span>
        )}
      </div>
    </a>
  );
}
