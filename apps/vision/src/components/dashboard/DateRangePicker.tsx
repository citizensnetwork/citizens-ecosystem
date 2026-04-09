"use client";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Current date for preset calculation (ISO date string). Defaults to today. */
  today?: string;
}

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
] as const;

export function DateRangePicker({ from, to, onChange, today }: DateRangePickerProps) {
  const currentDate = today ?? new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {PRESETS.map((preset) => {
          const presetFrom = new Date(
            new Date(currentDate).getTime() - preset.days * 86400000
          )
            .toISOString()
            .split("T")[0];
          const presetTo = currentDate;
          const isActive = from === presetFrom && to === presetTo;

          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(presetFrom, presetTo)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-accent text-highlight"
                  : "bg-surface-alt text-text-secondary hover:bg-accent-muted hover:text-text-primary"
              }`}
              aria-pressed={isActive}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <input
          type="date"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="rounded border border-border bg-surface-alt px-2 py-1 text-xs text-text-primary"
          aria-label="Start date"
        />
        <span className="text-text-secondary">—</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="rounded border border-border bg-surface-alt px-2 py-1 text-xs text-text-primary"
          aria-label="End date"
        />
      </div>
    </div>
  );
}
