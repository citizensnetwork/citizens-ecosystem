// Dates and time zones for the Reader. Pure; uses only the Intl database that ships with Node.
//
// Rule for a time with no zone on it ("2026-10-25T10:00", an iCalendar "floating" time): it is
// read as South African time. That is where Citizens Connect lists Contributors, and the owner
// approves every suggestion that is not an automatically published future event. A time with
// an explicit zone or offset always wins. A date with no time at all ("2026-10-25") is NOT
// turned into midnight: the caller skips it and says so, rather than inventing a start time.

export const DEFAULT_ZONE = "Africa/Johannesburg";

/** Microsoft zone names that calendar exports use, for the zone this platform is in. */
const ZONE_ALIASES = new Map([
  ["south africa standard time", "Africa/Johannesburg"],
  ["utc", "UTC"],
  ["gmt", "UTC"],
  ["etc/utc", "UTC"],
]);

const formatters = new Map();

function formatterFor(zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The IANA name for a calendar's TZID, or null if we do not recognise it. */
export function resolveZone(tzid) {
  if (!tzid) return DEFAULT_ZONE;
  const cleaned = String(tzid).trim().replace(/^"|"$/g, "").slice(0, 64);
  const alias = ZONE_ALIASES.get(cleaned.toLowerCase());
  const name = alias ?? cleaned;
  try {
    formatterFor(name);
    return name;
  } catch {
    return null;
  }
}

/** Offset of `zone` from UTC, in milliseconds, at the instant `utcMs`. */
function zoneOffsetMs(zone, utcMs) {
  const parts = {};
  for (const p of formatterFor(zone).formatToParts(new Date(utcMs))) parts[p.type] = Number(p.value);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The UTC instant (ms) of a wall-clock time in `zone`. `local` is { y, mo, d, h, mi, s }.
 * Returns null for a time that does not exist on the calendar (31 February) or a zone we cannot use.
 */
export function zonedToUtcMs(local, zone = DEFAULT_ZONE) {
  const { y, mo, d, h = 0, mi = 0, s = 0 } = local;
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d ||
    probe.getUTCHours() !== h ||
    probe.getUTCMinutes() !== mi ||
    probe.getUTCSeconds() !== s
  ) {
    return null;
  }
  const guess = probe.getTime();
  try {
    const first = guess - zoneOffsetMs(zone, guess);
    return guess - zoneOffsetMs(zone, first);
  } catch {
    return null;
  }
}

/** Wall-clock parts of a UTC instant as seen in `zone`. */
export function utcToZoned(utcMs, zone = DEFAULT_ZONE) {
  const asUtc = new Date(utcMs + zoneOffsetMs(zone, utcMs));
  return {
    y: asUtc.getUTCFullYear(),
    mo: asUtc.getUTCMonth() + 1,
    d: asUtc.getUTCDate(),
    h: asUtc.getUTCHours(),
    mi: asUtc.getUTCMinutes(),
    s: asUtc.getUTCSeconds(),
  };
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/**
 * schema.org / ISO 8601: "2026-10-25T10:00:00+02:00", "2026-10-25T08:00:00Z", "2026-10-25T10:00"
 * (no zone: South African time) or "2026-10-25" (a date only).
 * -> { kind: "datetime", ms } | { kind: "date" } | null
 */
export function parseIsoDateTime(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length < 10 || t.length > 40) return null;
  const m = ISO.exec(t);
  if (!m) return null;
  const [, ys, mos, ds, hs, mis, ss, zone] = m;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  if (hs === undefined) {
    return zonedToUtcMs({ y, mo, d }, "UTC") === null ? null : { kind: "date" };
  }
  const local = { y, mo, d, h: Number(hs), mi: Number(mis), s: ss === undefined ? 0 : Number(ss) };
  if (zone === undefined) {
    const ms = zonedToUtcMs(local, DEFAULT_ZONE);
    return ms === null ? null : { kind: "datetime", ms };
  }
  const asUtc = zonedToUtcMs(local, "UTC");
  if (asUtc === null) return null;
  if (zone === "Z") return { kind: "datetime", ms: asUtc };
  const sign = zone[0] === "-" ? -1 : 1;
  const digits = zone.slice(1).replace(":", "");
  const hh = Number(digits.slice(0, 2));
  const mm = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  if (hh > 14 || mm > 59) return null;
  return { kind: "datetime", ms: asUtc - sign * (hh * 60 + mm) * 60_000 };
}

const ICS_VALUE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/**
 * An iCalendar DTSTART / DTEND / EXDATE value with its TZID parameter.
 * -> { kind: "datetime", ms, local, zone } | { kind: "date" } | { kind: "unreadable" }
 * `local` and `zone` are kept so a repeating event can be stepped in wall-clock time.
 */
export function parseIcsDateTime(value, tzid) {
  const m = ICS_VALUE.exec(String(value ?? "").trim());
  if (!m) return { kind: "unreadable" };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (m[4] === undefined) return zonedToUtcMs({ y, mo, d }, "UTC") === null ? { kind: "unreadable" } : { kind: "date" };
  const local = { y, mo, d, h: Number(m[4]), mi: Number(m[5]), s: Number(m[6]) };
  if (m[7] === "Z") {
    const ms = zonedToUtcMs(local, "UTC");
    return ms === null ? { kind: "unreadable" } : { kind: "datetime", ms, local, zone: "UTC" };
  }
  const zone = resolveZone(tzid);
  if (zone === null) return { kind: "unreadable" };
  const ms = zonedToUtcMs(local, zone);
  return ms === null ? { kind: "unreadable" } : { kind: "datetime", ms, local, zone };
}

/** A feed date (RFC 822 "Tue, 20 Oct 2026 08:00:00 +0200" or ISO 8601) -> ms, or null. */
export function parseFeedDate(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.length > 64) return null;
  const iso = parseIsoDateTime(t);
  if (iso?.kind === "datetime") return iso.ms;
  if (iso?.kind === "date") return zonedToUtcMs(dateParts(t), "UTC");
  if (iso === null && /^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function dateParts(isoDate) {
  return { y: Number(isoDate.slice(0, 4)), mo: Number(isoDate.slice(5, 7)), d: Number(isoDate.slice(8, 10)) };
}
