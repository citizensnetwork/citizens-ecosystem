"use client";

import { useEffect, useMemo, useState } from "react";
import type { Event } from "@/types/db";
import { CATEGORY_HEX } from "@/lib/categories";

/**
 * FEAT-02 — Glass-overlay calendar.
 *
 * Lightweight month-grid replacement for the removed FullCalendar widget.
 * Renders on top of the map (parent supplies the blurred backdrop) and
 * drives the same event-detail selection flow the map uses.
 *
 * Intentionally dependency-free: a single CSS grid month view with
 * keyboard support and gold-tinted RSVP tiles. The parent owns event +
 * RSVP data, so this component never touches Supabase.
 */
type Props = {
  events: Event[];
  rsvpEventIds: Set<string>;
  onSelectEvent: (event: Event) => void;
  onClose: () => void;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Stable display formatter (en-ZA → "May 2026"). */
const MONTH_FMT = new Intl.DateTimeFormat("en-ZA", {
  month: "long",
  year: "numeric",
});

/** YYYY-MM-DD key for an event's local start date. Used to bucket events. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse an event's date string into a local Date safely. */
function parseEventDate(value: string): Date | null {
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

export default function GlassCalendar({
  events,
  rsvpEventIds,
  onSelectEvent,
  onClose,
}: Props) {
  // Anchor controls which month is visible. We snap to the 1st so the
  // grid math (firstWeekday + daysInMonth) stays trivial.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(1);
    return d;
  });

  // Bucket events by YYYY-MM-DD for O(1) lookup per cell.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of events) {
      const d = parseEventDate(ev.date);
      if (!d) continue;
      const key = dayKey(d);
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    }
    return map;
  }, [events]);

  // Compute the 6×7 grid for the anchor month.
  const grid = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date | null }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ date: null });
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(year, month, day) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [anchor]);

  // Keyboard shortcuts: ← / → month nav, Escape close. The parent also
  // handles Escape, but a local listener keeps focus-trapped users on the
  // calendar without falling through to the map.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Don't hijack arrow keys while the user is typing/editing.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
      } else if (e.key === "ArrowRight") {
        setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const monthLabel = MONTH_FMT.format(anchor);
  const todayKey = dayKey(today);

  return (
    <div
      className="absolute inset-0 z-1010 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      {/* Frosted-glass backdrop — blurs the map underneath. */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[10px]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Calendar"
        onClick={(e) => e.stopPropagation()}
        className="glass-panel relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden border-(--gold)/40"
        style={{ background: "rgba(255,255,255,0.78)" }}
      >
        {/* ── Header: month + nav arrows + close ───────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-black/8 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/70 transition hover:bg-black/5 hover:text-black active:scale-95"
              aria-label="Previous month"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 className="min-w-[10ch] text-center text-sm font-semibold tracking-wide text-black sm:text-base">
              {monthLabel}
            </h2>
            <button
              type="button"
              onClick={() =>
                setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/70 transition hover:bg-black/5 hover:text-black active:scale-95"
              aria-label="Next month"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const d = new Date(today);
                d.setDate(1);
                setAnchor(d);
              }}
              className="rounded-lg border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-black/70 transition hover:bg-white hover:text-black active:scale-95"
            >
              Today
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close calendar"
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/60 transition hover:bg-black/5 hover:text-black active:scale-95"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Weekday header row ───────────────────────────────── */}
        <div className="grid grid-cols-7 border-b border-black/8 bg-white/40 text-center text-[10px] font-semibold uppercase tracking-widest text-black/55">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        {/* ── Month grid ───────────────────────────────────────── */}
        <div className="grid flex-1 grid-cols-7 gap-px overflow-y-auto bg-black/8">
          {grid.map((cell, idx) => {
            if (!cell.date) {
              return <div key={`pad-${idx}`} className="min-h-[64px] bg-white/30 sm:min-h-[88px]" />;
            }
            const k = dayKey(cell.date);
            const dayEvents = eventsByDay.get(k) ?? [];
            const isToday = k === todayKey;
            return (
              <div
                key={k}
                className={`flex min-h-[64px] flex-col gap-1 bg-white/70 p-1.5 sm:min-h-[88px] sm:p-2 ${
                  isToday ? "ring-2 ring-(--gold)/70 ring-inset" : ""
                }`}
              >
                <div
                  className={`text-[10px] font-semibold ${
                    isToday ? "text-(--gold)" : "text-black/55"
                  }`}
                >
                  {cell.date.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const rsvped = rsvpEventIds.has(ev.id);
                    const hex = ev.category
                      ? CATEGORY_HEX[ev.category as keyof typeof CATEGORY_HEX]
                      : undefined;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onSelectEvent(ev)}
                        title={ev.title}
                        className={`truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium transition hover:brightness-110 active:scale-[0.98] ${
                          rsvped
                            ? "border border-(--gold)/60 bg-(--gold)/15 text-black"
                            : "border border-black/8 bg-white/85 text-black/75"
                        }`}
                        style={
                          rsvped || !hex
                            ? undefined
                            : { borderLeft: `3px solid ${hex}` }
                        }
                      >
                        {ev.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-[9px] font-medium text-black/45">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Legend footer ───────────────────────────────────── */}
        <div className="flex items-center gap-4 border-t border-black/8 bg-white/55 px-4 py-2 text-[10px] text-black/55 sm:px-6">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-(--gold)/60 bg-(--gold)/20" />
            Joined (RSVP)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-black/10 bg-white" />
            Other events
          </span>
          <span className="ml-auto hidden sm:inline">← → to change month</span>
        </div>
      </div>
    </div>
  );
}
