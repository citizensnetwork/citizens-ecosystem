// iCalendar (RFC 5545) to events. Pure, and never throws.
//
// Read exactly or not at all:
//   - DTSTART in UTC, with a TZID the runtime knows (IANA, or a few Windows names), or floating
//     (read as South African time); an all-day event has no start time and is skipped;
//   - DTEND or DURATION; STATUS:CANCELLED is skipped; CLASS:PRIVATE / CONFIDENTIAL is skipped
//     (a calendar can hold private appointments, which are never published);
//   - a repeating event is expanded only for the rules read exactly: FREQ=DAILY, FREQ=WEEKLY
//     (optionally BYDAY=MO,WE,...), FREQ=MONTHLY (the same day of the month, or one BYDAY such as
//     1SU or -1FR), with INTERVAL, COUNT and UNTIL, minus EXDATEs, with RECURRENCE-ID overrides
//     applied. Any other rule is counted as "could not be read exactly" and skipped, never guessed.
// Recurrence is computed on the wall clock of the event's own zone, so a weekly 09:00 service stays
// at 09:00 across a daylight-saving change.

import { htmlToText } from "./html.mjs";
import { DEFAULT_TZ, isValidTimeZone, validFields, zonedToUtc } from "./time.mjs";

const MAX_LINES = 100_000;
const MAX_LINE = 20_000;
const MAX_EVENTS = 2_000;
const MAX_ITERATIONS = 3_000;
const DAY = 86_400_000;

const WINDOWS_ZONES = {
  "south africa standard time": "Africa/Johannesburg",
  "utc": "UTC",
  "coordinated universal time": "UTC",
  "gmt standard time": "Europe/London",
  "w. europe standard time": "Europe/Berlin",
  "e. africa standard time": "Africa/Nairobi",
  "w. central africa standard time": "Africa/Lagos",
};

/** RFC 5545 §3.1: a line that starts with a space or a tab continues the previous one. */
export function unfold(text) {
  const raw = String(text ?? "").replace(/^\ufeff/, "").split(/\r\n|\n|\r/, MAX_LINES);
  const lines = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      if (lines[lines.length - 1].length < MAX_LINE) lines[lines.length - 1] += line.slice(1);
    } else lines.push(line.slice(0, MAX_LINE));
  }
  return lines;
}

/** "DTSTART;TZID="Africa/Johannesburg":20261102T090000" -> { name, params, value }. Quoted params may hold ":" and ";". */
export function parseLine(line) {
  let i = 0;
  while (i < line.length && line[i] !== ";" && line[i] !== ":") i++;
  const name = line.slice(0, i).toUpperCase();
  if (!name || i >= line.length) return null;
  const params = {};
  while (line[i] === ";") {
    i++;
    const ks = i;
    while (i < line.length && line[i] !== "=" && line[i] !== ":" && line[i] !== ";") i++;
    const key = line.slice(ks, i).toUpperCase();
    let value = "";
    if (line[i] === "=") {
      i++;
      if (line[i] === '"') {
        const close = line.indexOf('"', i + 1);
        if (close === -1) return null;
        value = line.slice(i + 1, close);
        i = close + 1;
        while (i < line.length && line[i] !== ";" && line[i] !== ":") i++; // a quoted value list: keep the first
      } else {
        const vs = i;
        while (i < line.length && line[i] !== ";" && line[i] !== ":") i++;
        value = line.slice(vs, i);
      }
    }
    if (key && !(key in params)) params[key] = value;
  }
  if (line[i] !== ":") return null;
  return { name, params, value: line.slice(i + 1) };
}

/** TEXT values: "\n" is a line break, "\," "\;" "\\" are literals. */
export function unescapeText(value) {
  return String(value).replace(/\\([nN,;\\])/g, (_m, c) => (c === "n" || c === "N" ? "\n" : c));
}

/** A TZID to a zone the runtime knows, or null. Vendor prefixes ("/mozilla.org/.../Africa/Johannesburg") are tolerated. */
export function resolveTzid(tzid) {
  const t = String(tzid ?? "").trim().replace(/^"|"$/g, "");
  if (!t) return null;
  const win = WINDOWS_ZONES[t.toLowerCase()];
  if (win) return win;
  if (isValidTimeZone(t)) return t;
  const segments = t.split("/").filter(Boolean);
  for (const n of [3, 2]) {
    if (segments.length >= n) {
      const tail = segments.slice(-n).join("/");
      if (isValidTimeZone(tail)) return tail;
    }
  }
  return null;
}

const DT = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i;
const DATE = /^(\d{4})(\d{2})(\d{2})$/;

/**
 * A DATE-TIME or DATE value. Returns { allDay } | { unsupported } | { ms, fields, tz }.
 * `fields` are the wall-clock fields in `tz`, which recurrence steps through.
 */
export function parseIcsTime(value, params = {}, defaultTz = DEFAULT_TZ) {
  const v = String(value ?? "").trim();
  if ((params.VALUE ?? "").toUpperCase() === "DATE" || DATE.test(v)) {
    const d = DATE.exec(v);
    if (!d || !validFields({ y: +d[1], mo: +d[2], d: +d[3] })) return { unsupported: true };
    return { allDay: true, fields: { y: +d[1], mo: +d[2], d: +d[3], h: 0, mi: 0, s: 0 } };
  }
  const m = DT.exec(v);
  if (!m) return { unsupported: true };
  const fields = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +m[6] };
  if (!validFields(fields)) return { unsupported: true };
  if (m[7]) return { ms: Date.UTC(fields.y, fields.mo - 1, fields.d, fields.h, fields.mi, fields.s), fields, tz: "UTC" };
  const tz = params.TZID ? resolveTzid(params.TZID) : defaultTz;
  if (!tz) return { unsupported: true };
  return { ms: zonedToUtc(fields, tz), fields, tz };
}

const DURATION = /^(\+)?P(?:(\d{1,4})W)?(?:(\d{1,4})D)?(?:T(?:(\d{1,4})H)?(?:(\d{1,4})M)?(?:(\d{1,4})S)?)?$/;

/** A positive DURATION in ms, or null (negative and malformed durations are not used). */
export function parseDuration(value) {
  const m = DURATION.exec(String(value ?? "").trim().toUpperCase());
  if (!m || m[0] === "P" || m[0] === "+P" || m[0].endsWith("T")) return null;
  const [w, d, h, mi, s] = [m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0));
  const ms = (((w * 7 + d) * 24 + h) * 60 + mi) * 60_000 + s * 1000;
  return ms > 0 ? ms : null;
}

// ── recurrence ──────────────────────────────────────────────────────────────

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const SUPPORTED_KEYS = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "WKST"]);

/** Parse an RRULE into a rule this module can expand exactly, or null. */
export function parseRrule(value) {
  const rule = {};
  for (const part of String(value ?? "").split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const key = part.slice(0, eq).toUpperCase();
    if (!SUPPORTED_KEYS.has(key) || key in rule) return null;
    rule[key] = part.slice(eq + 1).toUpperCase();
  }
  const freq = rule.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  const interval = rule.INTERVAL === undefined ? 1 : Number(rule.INTERVAL);
  if (!Number.isInteger(interval) || interval < 1 || interval > 366) return null;
  const count = rule.COUNT === undefined ? null : Number(rule.COUNT);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 10_000)) return null;
  if (rule.COUNT !== undefined && rule.UNTIL !== undefined) return null; // RFC 5545: never both
  let byDay = null;
  let nth = null;
  if (rule.BYDAY !== undefined) {
    const days = rule.BYDAY.split(",");
    if (freq === "DAILY") return null;
    if (freq === "WEEKLY") {
      if (!days.every((d) => WEEKDAYS.includes(d))) return null;
      byDay = [...new Set(days.map((d) => WEEKDAYS.indexOf(d)))].sort((a, b) => a - b);
    } else {
      const m = days.length === 1 ? /^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/.exec(days[0]) : null;
      if (!m) return null;
      nth = { n: Number(m[1]), weekday: WEEKDAYS.indexOf(m[2]) };
    }
  }
  return { freq, interval, count, until: rule.UNTIL ?? null, byDay, nth };
}

const addDays = (f, n) => {
  const d = new Date(Date.UTC(f.y, f.mo - 1, f.d + n, f.h, f.mi, f.s));
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: f.h, mi: f.mi, s: f.s };
};
const weekday = (f) => new Date(Date.UTC(f.y, f.mo - 1, f.d)).getUTCDay();
const dayNumber = (f) => Math.floor(Date.UTC(f.y, f.mo - 1, f.d) / DAY);
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** The nth (1..4, or -1 for the last) `weekday` of a month, or null. */
function nthWeekday(y, mo, n, wd) {
  if (n > 0) {
    const firstWd = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
    const d = 1 + ((wd - firstWd + 7) % 7) + (n - 1) * 7;
    return d <= daysInMonth(y, mo) ? d : null;
  }
  const last = daysInMonth(y, mo);
  const lastWd = new Date(Date.UTC(y, mo - 1, last)).getUTCDay();
  return last - ((lastWd - wd + 7) % 7);
}

/**
 * Candidate wall-clock dates of a rule, in order, starting at (or just before) `fromDay` when the rule
 * has no COUNT (a COUNT has to be counted from DTSTART). A generator, so the caller decides when to stop.
 */
function* candidates(rule, start, fromDay) {
  const startDay = dayNumber(start);
  if (rule.freq === "DAILY") {
    const skip = rule.count === null ? Math.max(0, Math.floor((fromDay - startDay) / rule.interval) - 1) : 0;
    for (let k = skip; ; k++) yield addDays(start, k * rule.interval);
  }
  if (rule.freq === "WEEKLY") {
    const days = rule.byDay ?? [weekday(start)];
    const mondayOffset = (weekday(start) + 6) % 7; // days since that week's Monday
    const weekStart = addDays(start, -mondayOffset);
    const skip = rule.count === null ? Math.max(0, Math.floor((fromDay - dayNumber(weekStart)) / (7 * rule.interval)) - 1) : 0;
    for (let w = skip; ; w++) {
      const monday = addDays(weekStart, w * 7 * rule.interval);
      for (const wd of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) yield addDays(monday, (wd + 6) % 7);
    }
  }
  if (rule.freq === "MONTHLY") {
    const fromMonths = (() => {
      const d = new Date(fromDay * DAY);
      return (d.getUTCFullYear() - start.y) * 12 + (d.getUTCMonth() + 1 - start.mo);
    })();
    const skip = rule.count === null ? Math.max(0, Math.floor(fromMonths / rule.interval) - 1) : 0;
    for (let k = skip; ; k++) {
      const total = start.mo - 1 + k * rule.interval;
      const y = start.y + Math.floor(total / 12);
      const mo = (total % 12) + 1;
      const d = rule.nth ? nthWeekday(y, mo, rule.nth.n, rule.nth.weekday) : start.d <= daysInMonth(y, mo) ? start.d : null;
      if (d !== null) yield { y, mo, d, h: start.h, mi: start.mi, s: start.s };
      else yield null; // a month without that day still advances the loop
    }
  }
}

// ── the calendar ────────────────────────────────────────────────────────────

function collectEvents(lines) {
  const events = [];
  let current = null;
  let depth = 0; // nesting inside the VEVENT (VALARM ...)
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT" && !current) {
      if (events.length >= MAX_EVENTS) break;
      current = { props: {}, multi: { EXDATE: [] } };
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (upper.startsWith("BEGIN:")) {
      depth++;
      continue;
    }
    if (upper.startsWith("END:")) {
      if (depth > 0) depth--;
      else if (upper === "END:VEVENT") {
        events.push(current);
        current = null;
      }
      continue;
    }
    if (depth > 0) continue;
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "EXDATE") {
      if (current.multi.EXDATE.length < 500) current.multi.EXDATE.push(p);
    } else if (!(p.name in current.props)) current.props[p.name] = p;
  }
  return events;
}

/**
 * @param {string} text
 * @param {{ nowMs: number, tz?: string, recurringDays: number, singleDays: number, maxPerSeries: number }} opts
 * @returns {{ events: { title, description, startMs, endMs, location, url }[], skippedNoTime: number, skippedUnsupported: number, skippedPrivate: number, cancelled: number }}
 */
export function parseIcs(text, { nowMs, tz = DEFAULT_TZ, recurringDays, singleDays, maxPerSeries }) {
  const out = { events: [], skippedNoTime: 0, skippedUnsupported: 0, skippedPrivate: 0, cancelled: 0 };
  let raw;
  try {
    raw = collectEvents(unfold(text));
  } catch {
    return out;
  }

  const textProp = (ev, name, max) => {
    const p = ev.props[name];
    return p ? htmlToText(unescapeText(p.value), max) : "";
  };
  const url = (ev) => {
    const v = ev.props.URL?.value?.trim();
    if (!v) return null;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password ? ((u.hash = ""), u.toString()) : null;
    } catch {
      return null;
    }
  };
  const describe = (ev, startMs, endMs) => ({
    title: textProp(ev, "SUMMARY", 400),
    description: textProp(ev, "DESCRIPTION", 6_000),
    startMs,
    endMs,
    location: textProp(ev, "LOCATION", 300),
    url: url(ev),
  });

  // Overrides first: RECURRENCE-ID instances replace (or cancel) one occurrence of their series.
  const overridden = new Set();
  const masters = [];
  for (const ev of raw) {
    const cls = (ev.props.CLASS?.value ?? "").trim().toUpperCase();
    if (cls === "PRIVATE" || cls === "CONFIDENTIAL") {
      if (!ev.props["RECURRENCE-ID"]) out.skippedPrivate++;
      continue;
    }
    const rid = ev.props["RECURRENCE-ID"];
    if (rid) {
      const at = parseIcsTime(rid.value, rid.params, tz);
      if ("ms" in at) overridden.add(`${ev.props.UID?.value ?? ""}|${at.ms}`);
    }
    masters.push(ev);
  }

  for (const ev of masters) {
    const status = (ev.props.STATUS?.value ?? "").trim().toUpperCase();
    const isOverride = !!ev.props["RECURRENCE-ID"];
    if (status === "CANCELLED") {
      out.cancelled++;
      continue;
    }
    const dt = ev.props.DTSTART;
    const start = dt ? parseIcsTime(dt.value, dt.params, tz) : { unsupported: true };
    if (start.allDay) {
      out.skippedNoTime++;
      continue;
    }
    if (!("ms" in start)) {
      out.skippedUnsupported++;
      continue;
    }
    let durationMs = null;
    if (ev.props.DTEND) {
      const end = parseIcsTime(ev.props.DTEND.value, ev.props.DTEND.params, tz);
      if ("ms" in end && end.ms > start.ms) durationMs = end.ms - start.ms;
    } else if (ev.props.DURATION) {
      durationMs = parseDuration(ev.props.DURATION.value);
    }

    const rrule = ev.props.RRULE && !isOverride ? ev.props.RRULE.value : null;
    if (!rrule) {
      if (start.ms > nowMs && start.ms <= nowMs + singleDays * DAY) out.events.push(describe(ev, start.ms, durationMs ? start.ms + durationMs : null));
      continue;
    }

    const rule = parseRrule(rrule);
    if (!rule) {
      out.skippedUnsupported++;
      continue;
    }
    let untilMs = Infinity;
    if (rule.until) {
      const u = parseIcsTime(rule.until, {}, start.tz === "UTC" ? "UTC" : start.tz);
      if (u.allDay) untilMs = zonedToUtc({ ...u.fields, h: 23, mi: 59, s: 59 }, start.tz);
      else if ("ms" in u) untilMs = u.ms;
      else {
        out.skippedUnsupported++;
        continue;
      }
    }
    const excluded = new Set();
    for (const ex of ev.multi.EXDATE) {
      for (const one of ex.value.split(",")) {
        const t = parseIcsTime(one, ex.params, start.tz === "UTC" ? "UTC" : start.tz);
        if ("ms" in t) excluded.add(t.ms);
        else if (t.allDay) excluded.add(`day:${t.fields.y}-${t.fields.mo}-${t.fields.d}`);
      }
    }
    const uid = ev.props.UID?.value ?? "";
    const windowEnd = nowMs + recurringDays * DAY;
    const nowFields = (() => {
      const d = new Date(nowMs);
      return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() };
    })();
    let counted = 0;
    let taken = 0;
    let iterations = 0;
    for (const f of candidates(rule, start.fields, dayNumber(nowFields))) {
      if (++iterations > MAX_ITERATIONS) break;
      if (f === null) continue;
      const ms = start.tz === "UTC" ? Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) : zonedToUtc(f, start.tz);
      if (ms < start.ms) continue;
      counted++;
      if (rule.count !== null && counted > rule.count) break;
      if (ms > untilMs || ms > windowEnd) break;
      if (excluded.has(ms) || excluded.has(`day:${f.y}-${f.mo}-${f.d}`) || overridden.has(`${uid}|${ms}`)) continue;
      if (ms <= nowMs) continue;
      out.events.push(describe(ev, ms, durationMs ? ms + durationMs : null));
      if (++taken >= maxPerSeries) break;
    }
  }
  return out;
}
