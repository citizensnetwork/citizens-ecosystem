// Time for the Reader: wall-clock times in a named zone to instants and back, with nothing but
// the Intl built into Node (no dependency). Pure.
//
// A time with no offset and no zone ("floating") is read as South African time: Connect lists
// South African organisations, and SAST has no daylight saving, so that reading is exact there.

export const DEFAULT_TZ = "Africa/Johannesburg";

const formatters = new Map();

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Is `tz` a time zone this Node knows? */
export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock fields of instant `ms` in `tz`. */
export function utcToZoned(ms, tz = DEFAULT_TZ) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) parts[p.type] = p.value;
  return { y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day), h: Number(parts.hour), mi: Number(parts.minute), s: Number(parts.second) };
}

function offsetMs(ms, tz) {
  const z = utcToZoned(ms, tz);
  return Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - Math.floor(ms / 1000) * 1000;
}

/** The instant at which the wall clock in `tz` shows these fields (a time skipped by DST lands just after the gap). */
export function zonedToUtc({ y, mo, d, h = 0, mi = 0, s = 0 }, tz = DEFAULT_TZ) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);
}

/** "YYYY-MM-DD" of instant `ms` in `tz`. */
export function dayOf(ms, tz = DEFAULT_TZ) {
  const z = utcToZoned(ms, tz);
  return `${String(z.y).padStart(4, "0")}-${String(z.mo).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
}

/** Are these real calendar fields (no 31 February, no hour 24)? */
export function validFields({ y, mo, d, h = 0, mi = 0, s = 0 }) {
  if (![y, mo, d, h, mi, s].every(Number.isInteger)) return false;
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59 || h < 0 || mi < 0 || s < 0) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;

/**
 * An ISO 8601 date or date-time as schema.org and Atom write it.
 * Returns { ms } for a date-time (floating ones read in `tz`), { dateOnly: true } for a bare
 * date (there is no start time to publish), or null for anything else.
 */
export function parseIsoDateTime(value, tz = DEFAULT_TZ) {
  if (typeof value !== "string") return null;
  const m = ISO.exec(value.trim().slice(0, 40));
  if (!m) return null;
  const f = { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), h: Number(m[4] ?? 0), mi: Number(m[5] ?? 0), s: Number(m[6] ?? 0) };
  if (!validFields(f)) return null;
  if (m[4] === undefined) return { dateOnly: true };
  const zone = m[7];
  if (!zone) return { ms: zonedToUtc(f, tz) };
  const base = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s);
  if (zone.toUpperCase() === "Z") return { ms: base };
  const sign = zone[0] === "-" ? -1 : 1;
  const digits = zone.slice(1).replace(":", "");
  const oh = Number(digits.slice(0, 2));
  const om = Number(digits.slice(2, 4) || "0");
  if (oh > 14 || om > 59) return null;
  return { ms: base - sign * (oh * 60 + om) * 60_000 };
}

// RFC 822 / 1123 as RSS writes it: "Sat, 25 Oct 2026 10:00:00 +0200" (the weekday is optional and ignored).
const RFC822 = /^(?:[A-Za-z]{3},?\s+)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([A-Za-z]{1,5}|[+-]\d{4})?$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ZONES = { ut: 0, utc: 0, gmt: 0, z: 0, sast: 120, est: -300, edt: -240, cst: -360, cdt: -300, mst: -420, mdt: -360, pst: -480, pdt: -420, bst: 60, cet: 60, cest: 120 };

/** An RSS date (RFC 822) or, failing that, an ISO date-time. Returns epoch ms or null. */
export function parseFeedDate(value, tz = DEFAULT_TZ) {
  if (typeof value !== "string") return null;
  const t = value.trim().slice(0, 60);
  const m = RFC822.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    let y = Number(m[3]);
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    const f = { y, mo, d: Number(m[1]), h: Number(m[4]), mi: Number(m[5]), s: Number(m[6] ?? 0) };
    if (mo === 0 || !validFields(f)) return null;
    const zone = (m[7] ?? "").toLowerCase();
    if (!zone) return zonedToUtc(f, tz);
    let minutes;
    if (zone[0] === "+" || zone[0] === "-") {
      minutes = (zone[0] === "-" ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5)));
    } else if (zone in ZONES) {
      minutes = ZONES[zone];
    } else {
      return null;
    }
    return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - minutes * 60_000;
  }
  const iso = parseIsoDateTime(t, tz);
  if (iso && "ms" in iso) return iso.ms;
  if (iso && iso.dateOnly) {
    const [y, mo, d] = t.slice(0, 10).split("-").map(Number);
    return zonedToUtc({ y, mo, d, h: 12 }, tz); // a post dated by day: midday, so its day never shifts
  }
  return null;
}
