/**
 * Weekend derived tag — Batch S3.
 *
 * Replaces the legacy `weekend` event category (removed in migration 064).
 * Weekend is now a *derived* attribute computed from an event's date span,
 * never a stored category slug.
 *
 * Locked rule (see `.github/DECISIONS.md`):
 *   An event is a weekend event when its date span overlaps any of:
 *     • Saturday (any time)
 *     • Sunday (any time)
 *     • Friday from 17:00 onwards
 *
 * All calculations are performed in UTC to match how events are stored
 * (`date` and `end_time` are ISO datetime strings with `Z` suffix).
 * This keeps the rule deterministic across timezones / SSR / client.
 *
 * Events with no `end_time` are treated as point-in-time (single instant);
 * the start moment alone is evaluated against the rule.
 */

type WeekendEventInput = {
  date: string;
  end_time: string | null;
};

/** Day-of-week getUTCDay() values: 0=Sun, 5=Fri, 6=Sat. */
const SUNDAY = 0;
const FRIDAY = 5;
const SATURDAY = 6;

/** Friday 17:00 UTC — the earliest hour that counts as weekend. */
const FRIDAY_WEEKEND_HOUR = 17;

/**
 * Returns true when the event spans any portion of Sat, Sun, or Fri ≥17:00 UTC.
 *
 * @example
 *   isWeekendEvent({ date: "2026-04-18T10:00:00Z", end_time: null })   // Sat → true
 *   isWeekendEvent({ date: "2026-04-17T18:00:00Z", end_time: null })   // Fri 18:00 → true
 *   isWeekendEvent({ date: "2026-04-17T10:00:00Z", end_time: null })   // Fri 10:00 → false
 *   isWeekendEvent({ date: "2026-04-13T09:00:00Z", end_time: null })   // Mon → false
 */
export function isWeekendEvent(event: WeekendEventInput): boolean {
  const start = new Date(event.date);
  if (Number.isNaN(start.getTime())) return false;

  const end = event.end_time ? new Date(event.end_time) : start;
  if (Number.isNaN(end.getTime())) return false;

  // Walk each UTC calendar day in the span (inclusive on both ends).
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const finalDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  );

  // Hard cap to defend against malformed multi-decade spans.
  const MAX_DAYS = 366;
  let guard = 0;

  while (cursor.getTime() <= finalDay.getTime()) {
    if (guard++ > MAX_DAYS) return false;

    const dow = cursor.getUTCDay();
    if (dow === SATURDAY || dow === SUNDAY) return true;

    if (dow === FRIDAY) {
      const fri17 = Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
        FRIDAY_WEEKEND_HOUR,
        0,
        0
      );
      const friDayEnd = Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
        23,
        59,
        59,
        999
      );
      // Overlap test: span [start, end] intersects [fri17, friDayEnd].
      if (start.getTime() <= friDayEnd && end.getTime() >= fri17) return true;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return false;
}
