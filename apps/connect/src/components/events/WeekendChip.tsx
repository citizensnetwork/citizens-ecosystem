import { getIconSvg } from "@/lib/categoryIcons";

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

const SVG = getIconSvg("weekend-tag");

export default function WeekendChip({ size = "sm", className = "" }: Props) {
  const isMd = size === "md";
  const textSize = isMd ? "text-xs" : "text-[10px]";
  const padding = isMd ? "px-2.5 py-1" : "px-2 py-0.5";
  const iconSize = isMd ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      title="Weekend event"
      aria-label="Weekend event"
      className={`inline-flex items-center gap-1 rounded-full border border-[#D4AF37]/55 bg-transparent ${padding} ${textSize} font-medium text-[#8B7500] ${className}`}
    >
      <span
        aria-hidden="true"
        className={`flex items-center justify-center text-[#8B7500] ${iconSize}`}
        dangerouslySetInnerHTML={{ __html: SVG }}
      />
      Weekend
    </span>
  );
}
