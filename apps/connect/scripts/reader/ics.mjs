// iCalendar (RFC 5545) events, including the common repeating rules, for a calendar the owner
// publishes. Deterministic, dependency-free, and total: malformed input yields fewer events,
// never an exception.
//
// What it reads: VEVENT with SUMMARY, DESCRIPTION, LOCATION, URL, DTSTART, DTEND or DURATION,
// STATUS, RRULE (DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY,
// BYMONTH), EXDATE and RECURRENCE-ID overrides. What it deliberately does not do: all-day events
// (a date with no time is skipped and counted, never turned into midnight), repeat rules it
// cannot expand exactly (BYSETPOS and the like: skipped and counted), and time zones it does
// not recognise (skipped and counted).

import { httpsUrl } from "./text.mjs";
import { parseIcsDateTime, zonedToUtcMs } from "./time.mjs";

const MAX_LINES = 60_000;
const MAX_EVENTS_SCANNED = 2_000;
const MAX_PERIODS = 20_000;
const MAX_CANDIDATES = 6_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** RFC 5545 section 3.1: a line that starts with a space or tab continues the previous one. */
export function unfold(text) {
  const raw = String(text ?? "").split(/\r\n|\n|\r/, MAX_LINES);
  const lines = [];
  for (const line of raw) {
    if ((line[0] === " " || line[0] === "\t") && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

/** "SUMMARY;LANGUAGE=en:Hello" -> { name: "SUMMARY", params: { LANGUAGE: "en" }, value: "Hello" } */
export function parseContentLine(line) {
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ":" && !inQuote) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = [];
  let cur = "";
  inQuote = false;
  for (const c of head) {
    if (c === '"') inQuote = !inQuote;
    if (c === ";" && !inQuote) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: parts[0].toUpperCase(), params, value };
}

export function unescapeText(v) {
  return String(v ?? "").replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d{1,4})W)?(?:(\d{1,4})D)?(?:T(?:(\d{1,4})H)?(?:(\d{1,4})M)?(?:(\d{1,4})S)?)?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const [, sign, w = 0, d = 0, h = 0, mi = 0, s = 0] = m;
  const ms = ((Number(w) * 7 + Number(d)) * 86_400 + Number(h) * 3_600 + Number(mi) * 60 + Number(s)) * 1000;
  return sign === "-" ? -ms : ms;
}

function readEvents(text) {
  const events = [];
  let cur = null;
  let alarmDepth = 0;
  for (const line of unfold(text)) {
    const upper = line.slice(0, 16).toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      cur = { exdates: [] };
      alarmDepth = 0;
      continue;
    }
    if (!cur) continue;
    if (upper === "END:VEVENT") {
      events.push(cur);
      cur = null;
      if (events.length >= MAX_EVENTS_SCANNED) break;
      continue;
    }
    if (upper.startsWith("BEGIN:")) {
      alarmDepth++;
      continue;
    }
    if (upper.startsWith("END:")) {
      alarmDepth = Math.max(0, alarmDepth - 1);
      continue;
    }
    if (alarmDepth > 0) continue;
    const p = parseContentLine(line);
    if (!p) continue;
    switch (p.name) {
      case "UID": cur.uid = p.value.trim().slice(0, 200); break;
      case "SUMMARY": cur.summary = unescapeText(p.value); break;
      case "DESCRIPTION": cur.description = unescapeText(p.value); break;
      case "LOCATION": cur.location = unescapeText(p.value); break;
      case "URL": cur.url = p.value.trim(); break;
      case "STATUS": cur.status = p.value.trim().toUpperCase(); break;
      case "DTSTART": cur.dtstart = p; break;
      case "DTEND": cur.dtend = p; break;
      case "DURATION": cur.duration = parseDuration(p.value); break;
      case "RRULE": cur.rrule = p.value.trim().slice(0, 500); break;
      case "EXDATE": cur.exdates.push(p); break;
      case "RECURRENCE-ID": cur.recurrenceId = p; break;
      default: break;
    }
  }
  return events;
}

// ── repeat rules ────────────────────────────────────────────────────────────

function parseRule(text) {
  const rule = {};
  for (const part of text.split(";", 30)) {
    const eq = part.indexOf("=");
    if (eq > 0) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return rule;
}

const UNSUPPORTED_PARTS = ["BYSETPOS", "BYYEARDAY", "BYWEEKNO", "BYHOUR", "BYMINUTE", "BYSECOND"];

const dayNumber = (y, mo, d) => Date.UTC(y, mo - 1, d) / DAY_MS;
const fromDayNumber = (n) => {
  const t = new Date(n * DAY_MS);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const weekdayOf = (n) => (((n + 4) % 7) + 7) % 7; // day number 0 (1970-01-01) was a Thursday = 4
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

function parseByDay(list) {
  const out = [];
  for (const tok of String(list ?? "").split(",", 20)) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(tok.trim().toUpperCase());
    if (m) out.push({ n: m[1] === undefined ? 0 : Number(m[1]), wd: WEEKDAYS.indexOf(m[2]) });
  }
  return out;
}

const parseIntList = (list) =>
  String(list ?? "")
    .split(",", 40)
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x !== 0);

/** The n-th (1-based; negative counts from the end) weekday `wd` of a month, as a day number. */
function nthWeekday(y, mo, wd, n) {
  const first = dayNumber(y, mo, 1);
  const last = dayNumber(y, mo, daysInMonth(y, mo));
  if (n > 0) {
    const day = first + ((wd - weekdayOf(first) + 7) % 7) + (n - 1) * 7;
    return day <= last ? day : null;
  }
  const day = last - ((weekdayOf(last) - wd + 7) % 7) - (-n - 1) * 7;
  return day >= first ? day : null;
}

/**
 * Local dates (as day numbers) of repeat period `k`, or null when the rule is not one we can expand.
 */
function periodDays(rule, start, k, byDay, byMonthDay, byMonth) {
  const interval = Math.min(Math.max(Number(rule.INTERVAL) || 1, 1), 1000);
  const startDay = dayNumber(start.y, start.mo, start.d);
  switch (rule.FREQ) {
    case "DAILY": {
      const day = startDay + k * interval;
      if (byDay.length && !byDay.some((b) => b.wd === weekdayOf(day))) return [];
      return [day];
    }
    case "WEEKLY": {
      const monday = startDay - ((weekdayOf(startDay) + 6) % 7);
      const wds = byDay.length ? byDay.map((b) => b.wd) : [weekdayOf(startDay)];
      const base = monday + k * interval * 7;
      return [...new Set(wds)].map((wd) => base + ((wd + 6) % 7)).sort((a, b) => a - b);
    }
    case "MONTHLY": {
      const idx = start.y * 12 + (start.mo - 1) + k * interval;
      const y = Math.floor(idx / 12);
      const mo = (idx % 12) + 1;
      if (byMonth.length && !byMonth.includes(mo)) return [];
      const days = [];
      if (byMonthDay.length) {
        const dim = daysInMonth(y, mo);
        for (const d of byMonthDay) {
          const day = d > 0 ? d : dim + d + 1;
          if (day >= 1 && day <= dim) days.push(dayNumber(y, mo, day));
        }
      } else if (byDay.length) {
        for (const b of byDay) {
          if (b.n !== 0) {
            const day = nthWeekday(y, mo, b.wd, b.n);
            if (day !== null) days.push(day);
          } else {
            for (let n = 1; n <= 5; n++) {
              const day = nthWeekday(y, mo, b.wd, n);
              if (day !== null) days.push(day);
            }
          }
        }
      } else if (start.d <= daysInMonth(y, mo)) {
        days.push(dayNumber(y, mo, start.d));
      }
      return [...new Set(days)].sort((a, b) => a - b);
    }
    case "YEARLY": {
      const y = start.y + k * interval;
      const months = byMonth.length ? byMonth : [start.mo];
      const mds = byMonthDay.length ? byMonthDay : [start.d];
      const days = [];
      for (const mo of months) {
        const dim = daysInMonth(y, mo);
        for (const d of mds) {
          const day = d > 0 ? d : dim + d + 1;
          if (day >= 1 && day <= dim) days.push(dayNumber(y, mo, day));
        }
      }
      return days.sort((a, b) => a - b);
    }
    default:
      return null;
  }
}

/**
 * Occurrence start times (UTC ms) of a repeating event that fall after `nowMs` and not after
 * `limitMs`. Stepped in the event's own wall-clock time, so a 10:00 service stays at 10:00
 * across a daylight-saving change. Returns null when the rule uses parts we do not expand.
 */
export function expandRule(ruleText, start, nowMs, limitMs, excluded) {
  const rule = parseRule(ruleText);
  if (UNSUPPORTED_PARTS.some((p) => p in rule)) return null;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.FREQ)) return null;
  const byDay = parseByDay(rule.BYDAY);
  const byMonthDay = parseIntList(rule.BYMONTHDAY).filter((d) => Math.abs(d) <= 31);
  const byMonth = parseIntList(rule.BYMONTH).filter((m) => m >= 1 && m <= 12);
  if (rule.FREQ === "YEARLY" && byDay.length) return null;
  if (rule.FREQ === "DAILY" && (byMonthDay.length || byMonth.length)) return null;
  if (rule.FREQ === "WEEKLY" && (byMonthDay.length || byMonth.length)) return null;

  const count = rule.COUNT === undefined ? Infinity : Number(rule.COUNT);
  if (rule.COUNT !== undefined && !(Number.isInteger(count) && count > 0)) return null;
  let untilMs = Infinity;
  if (rule.UNTIL !== undefined) {
    const u = parseIcsDateTime(rule.UNTIL, start.zone);
    if (u.kind === "datetime") untilMs = u.ms;
    else if (u.kind === "date") {
      const d = rule.UNTIL.trim();
      untilMs = zonedToUtcMs({ y: Number(d.slice(0, 4)), mo: Number(d.slice(4, 6)), d: Number(d.slice(6, 8)), h: 23, mi: 59, s: 59 }, start.zone) ?? Infinity;
    } else return null;
  }

  const startDay = dayNumber(start.local.y, start.local.mo, start.local.d);
  const out = [];
  let produced = 0;
  let candidates = 0;
  // Without a COUNT nothing before today matters, so step straight to just before it (a weekly
  // service that began in 2012 must not use up the loop on old Sundays).
  const periodDaysLong = { DAILY: 1, WEEKLY: 7, MONTHLY: 28, YEARLY: 365 }[rule.FREQ];
  const interval = Math.min(Math.max(Number(rule.INTERVAL) || 1, 1), 1000);
  const skip = count === Infinity ? Math.max(0, Math.floor((nowMs / DAY_MS - startDay) / (interval * periodDaysLong)) - 2) : 0;
  for (let k = skip; k < skip + MAX_PERIODS; k++) {
    const days = periodDays(rule, start.local, k, byDay, byMonthDay, byMonth);
    if (days === null) return null;
    for (const day of days) {
      if (day < startDay) continue;
      if (++candidates > MAX_CANDIDATES) return out;
      const { y, mo, d } = fromDayNumber(day);
      const ms = zonedToUtcMs({ y, mo, d, h: start.local.h, mi: start.local.mi, s: start.local.s }, start.zone);
      if (ms === null) continue; // that wall-clock time does not exist (a clock change)
      if (ms > untilMs) return out;
      if (++produced > count) return out;
      if (ms > limitMs) return out;
      if (ms > nowMs && !excluded.has(ms)) out.push(ms);
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {{ nowMs: number, recurringDays?: number, singleDays?: number, maxPerSeries?: number }} opts
 * @returns {{ events: {title:string, description:string, location:string, url:string|null, startMs:number, endMs:number|null}[], skippedNoTime:number, skippedUnsupported:number, cancelled:number }}
 */
export function parseIcs(text, { nowMs, recurringDays = 28, singleDays = 365, maxPerSeries = 4 }) {
  const result = { events: [], skippedNoTime: 0, skippedUnsupported: 0, cancelled: 0 };
  const raw = readEvents(text);

  // Instances a calendar replaced or cancelled: UID + the original start.
  const replaced = new Set();
  for (const e of raw) {
    if (!e.recurrenceId || !e.uid) continue;
    const r = parseIcsDateTime(e.recurrenceId.value, e.recurrenceId.params.TZID);
    if (r.kind === "datetime") replaced.add(`${e.uid}|${r.ms}`);
  }

  const push = (e, startMs, endMs, base) => {
    const title = String(e.summary ?? "").trim();
    if (!title) return;
    result.events.push({
      title,
      description: String(e.description ?? ""),
      location: String(e.location ?? ""),
      url: httpsUrl(e.url, base),
      startMs,
      endMs,
    });
  };

  for (const e of raw) {
    if (!e.dtstart) continue;
    if (e.status === "CANCELLED") {
      result.cancelled++;
      continue;
    }
    const start = parseIcsDateTime(e.dtstart.value, e.dtstart.params.TZID);
    if (e.dtstart.params.VALUE === "DATE" || start.kind === "date") {
      result.skippedNoTime++;
      continue;
    }
    if (start.kind !== "datetime") {
      result.skippedUnsupported++;
      continue;
    }
    let durationMs = null;
    if (e.dtend) {
      const end = parseIcsDateTime(e.dtend.value, e.dtend.params.TZID);
      if (end.kind === "datetime" && end.ms > start.ms) durationMs = end.ms - start.ms;
    } else if (typeof e.duration === "number" && e.duration > 0) {
      durationMs = e.duration;
    }
    const endOf = (ms) => (durationMs === null ? null : ms + durationMs);

    if (!e.rrule || e.recurrenceId) {
      if (start.ms > nowMs && start.ms <= nowMs + singleDays * DAY_MS) push(e, start.ms, endOf(start.ms));
      continue;
    }

    const excluded = new Set();
    for (const x of e.exdates) {
      for (const v of x.value.split(",", 100)) {
        const parsed = parseIcsDateTime(v, x.params.TZID ?? e.dtstart.params.TZID);
        if (parsed.kind === "datetime") excluded.add(parsed.ms);
      }
    }
    if (e.uid) for (const key of replaced) if (key.startsWith(e.uid + "|")) excluded.add(Number(key.slice(e.uid.length + 1)));

    const occurrences = expandRule(e.rrule, start, nowMs, nowMs + recurringDays * DAY_MS, excluded);
    if (occurrences === null) {
      result.skippedUnsupported++;
      continue;
    }
    for (const ms of occurrences.slice(0, maxPerSeries)) push(e, ms, endOf(ms));
  }
  return result;
}
