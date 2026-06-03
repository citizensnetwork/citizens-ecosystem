/**
 * Small outline pill that marks an event as occurring over the weekend
 * (Sat, Sun, or Fri ≥17:00 UTC — see `src/lib/weekendTag.ts`).
 *
 * Renders alongside the category badge on `EventCard`, `EventDetailContent`,
 * and in calendar tooltips. The style is the locked S3 outline variant:
 * transparent background, gold border + gold text, CalendarDays Lucide icon.
 */
type Props = {
  /** Compact (default, used on cards) or larger detail variant. */
  size?: "sm" | "md";
  /** Optional className for layout-only overrides. */
  className?: string;
};

/** Inline CalendarDays icon (Lucide path data, kept in sync with the
 *  `calendar-days` / `weekend-tag` entry in `categoryIcons.ts`). Inlined as
 *  JSX rather than an SVG string so the chip avoids `dangerouslySetInnerHTML`. */
function CalendarDaysIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width={18} height={18} x={3} y={4} rx={2} />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" />
    </svg>
  );
}

export default function WeekendChip({ size = "sm", className = "" }: Props) {
  const isMd = size === "md";
  const textSize = isMd ? "text-xs" : "text-[10px]";
  const padding = isMd ? "px-2.5 py-1" : "px-2 py-0.5";
  const iconSize = isMd ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      title="Weekend event"
      aria-label="Weekend event"
      className={`inline-flex items-center gap-1 rounded-full border border-[#C9A84C]/55 bg-transparent ${padding} ${textSize} font-medium text-[#8B7500] ${className}`}
    >
      <CalendarDaysIcon className={iconSize} />
      Weekend
    </span>
  );
}
