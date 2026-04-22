import type { EventStatus } from "@/types/db";

interface EventStatusBadgeProps {
  status: EventStatus;
  /** ISO string — the event's start time. */
  date: string;
  /** Optional ISO string for the end time. If absent, we assume +2h. */
  endTime?: string | null;
  /** Compact sizing for cards/popups. */
  size?: "sm" | "md";
  className?: string;
  /**
   * If true, the badge is rendered even for "upcoming" events.
   * By default we only badge cancelled / live / ended, since upcoming is
   * the implicit default state.
   */
  showUpcoming?: boolean;
}

const LIVE_FALLBACK_DURATION_MS = 2 * 60 * 60 * 1000; // 2h

type Derived =
  | { kind: "cancelled" }
  | { kind: "live" }
  | { kind: "ended" }
  | { kind: "upcoming" };

export function deriveEventStatus(
  status: EventStatus,
  date: string,
  endTime?: string | null,
  now: Date = new Date(),
): Derived {
  if (status === "cancelled") return { kind: "cancelled" };

  const start = new Date(date).getTime();
  if (!Number.isFinite(start)) return { kind: "upcoming" };

  const end = endTime
    ? new Date(endTime).getTime()
    : start + LIVE_FALLBACK_DURATION_MS;

  const t = now.getTime();
  if (t < start) return { kind: "upcoming" };
  if (t <= end) return { kind: "live" };
  return { kind: "ended" };
}

export default function EventStatusBadge({
  status,
  date,
  endTime,
  size = "md",
  className = "",
  showUpcoming = false,
}: EventStatusBadgeProps) {
  const derived = deriveEventStatus(status, date, endTime);

  if (derived.kind === "upcoming" && !showUpcoming) return null;

  const sizeCls =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  const base = `inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide ${sizeCls} ${className}`;

  if (derived.kind === "cancelled") {
    return (
      <span
        className={`${base} bg-red-500/10 text-red-700 ring-1 ring-red-500/30`}
        aria-label="Event cancelled"
      >
        Cancelled
      </span>
    );
  }
  if (derived.kind === "live") {
    return (
      <span
        className={`${base} bg-(--gold-soft) text-black ring-1 ring-(--gold)`}
        aria-label="Event live now"
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-(--gold) animate-pulse"
          aria-hidden
        />
        Live now
      </span>
    );
  }
  if (derived.kind === "ended") {
    return (
      <span
        className={`${base} bg-black/5 text-black/55 ring-1 ring-black/10`}
        aria-label="Event ended"
      >
        Ended
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-black/5 text-black/60 ring-1 ring-black/10`}
      aria-label="Upcoming event"
    >
      Upcoming
    </span>
  );
}
