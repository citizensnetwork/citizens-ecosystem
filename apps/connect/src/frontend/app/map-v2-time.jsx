// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 time and freshness labels (tracker P1-05)
//  ------------------------------------------------------------------
//  Pure functions, no DOM and no React; `now` is always passed in (epoch ms),
//  so they are unit-tested against fixed instants (src/__tests__/frontend/
//  mapV2Time.test.ts). Timezone is Africa/Johannesburg (UTC+2, no daylight
//  saving: a fixed offset, so there is no dependence on the browser's ICU data),
//  24-hour time, English (en-ZA) names. All wording comes from
//  window.MapV2Strings.time.
//
//  TRUTHFULNESS (tracker Q2): "open" is only ever said when the hours text was
//  understood completely. Places store hours as FREE TEXT, so openState reads a
//  small, strict grammar (days, times, "closed", "24 hours") and returns
//  { status: 'unknown' } for anything else; the UI then shows nothing. There is
//  no code path that prints "Open" without hours data.
// ════════════════════════════════════════════════════════════════════
(function () {
  const TZ = 'Africa/Johannesburg';
  const LOCALE = 'en-ZA';
  const OFFSET_MS = 2 * 3600 * 1000;
  const MIN = 60 * 1000, HOUR = 3600 * 1000, DAY = 86400 * 1000;

  const S = () => (window.MapV2Strings && window.MapV2Strings.time) || {};
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  // A Date whose UTC fields read as Johannesburg wall-clock time.
  const local = (ms) => new Date(ms + OFFSET_MS);
  const hhmm = (mins) => pad2(Math.floor(mins / 60) % 24) + ':' + pad2(mins % 60);
  const dayKey = (ms) => Math.floor((ms + OFFSET_MS) / DAY);
  const toMs = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v instanceof Date) { const t = v.getTime(); return Number.isNaN(t) ? null : t; }
    if (typeof v === 'string' && v) { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
    return null;
  };

  // ── Opening hours (free text) ────────────────────────────────────
  const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const DAYTOK = '(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
  const DAYRANGE = DAYTOK + '(?:\\s*(?:-|to)\\s*' + DAYTOK + ')?';
  const DAYSPEC_RE = new RegExp('^(?:' + DAYRANGE + '(?:\\s*(?:,|&|and)\\s*' + DAYRANGE + ')*|daily|every\\s*day|everyday|weekdays|weekends?)\\b');
  const TIME = '(\\d{1,2})(?:(?::|h|\\.)(\\d{2}))?\\s*(am|pm)?';
  const RANGE_RE = new RegExp('^' + TIME + '\\s*(?:-|to)\\s*' + TIME);
  const ALLDAY_RE = /^(?:open\s*)?(?:24\s*(?:hours|hrs|hr|h)|24\/7|all\s*day|always\s*open)\b/;
  const CLOSED_RE = /^closed\b/;
  const SKIP_RE = /^(?:[\s,;.&|]+|and\b|open\b|hours\b|:)+/;

  function dayIndexOf(tok) { return DAY_INDEX[tok.slice(0, 3)]; }

  function expandDays(spec) {
    if (/^daily|^every|^everyday/.test(spec)) return [0, 1, 2, 3, 4, 5, 6];
    if (/^weekdays/.test(spec)) return [1, 2, 3, 4, 5];
    if (/^weekend/.test(spec)) return [6, 0];
    const out = new Set();
    // "mon-fri, sun" -> split on , & and, then each part is a day or a range
    spec.split(/\s*(?:,|&|\band\b)\s*/).forEach((part) => {
      const m = new RegExp('^(' + DAYTOK + ')(?:\\s*(?:-|to)\\s*(' + DAYTOK + '))?$').exec(part.trim());
      if (!m) return;
      const a = dayIndexOf(m[1]);
      if (!m[2]) { out.add(a); return; }
      const b = dayIndexOf(m[2]);
      // a range walks forward and may wrap the week ("sat-mon")
      for (let d = a, guard = 0; guard < 8; guard++, d = (d + 1) % 7) { out.add(d); if (d === b) break; }
    });
    return Array.from(out);
  }

  // minutes since midnight, or null when the pieces are not a clean time
  function minutesOf(h, m, ap, strictColon) {
    let hour = parseInt(h, 10);
    const min = m === undefined ? 0 : parseInt(m, 10);
    if (Number.isNaN(hour) || min > 59) return null;
    if (ap) {
      if (hour < 1 || hour > 12) return null;
      if (ap === 'pm' && hour !== 12) hour += 12;
      if (ap === 'am' && hour === 12) hour = 0;
    } else {
      if (hour > 24 || (hour === 24 && min > 0)) return null;
      if (strictColon && m === undefined) return null;
    }
    return hour * 60 + min;
  }

  /**
   * Parse free-text opening hours into per-weekday intervals.
   * Returns { days: Array(7) of [startMin, endMin][] (end may exceed 1440 = past midnight) } or null when
   * any part of the text is not understood. "closed" days are simply empty.
   */
  function parseHours(text) {
    if (typeof text !== 'string') return null;
    let s = text.toLowerCase().replace(/[–—−]/g, '-').replace(/\ba\.m\./g, 'am').replace(/\bp\.m\./g, 'pm').trim();
    if (!s) return null;
    const days = [[], [], [], [], [], [], []];
    let pending = null;            // the days the next times belong to
    let sawAnything = false;
    while (s.length) {
      const skip = SKIP_RE.exec(s);
      if (skip) { s = s.slice(skip[0].length); continue; }
      let m = DAYSPEC_RE.exec(s);
      if (m) { pending = expandDays(m[0]); if (!pending.length) return null; s = s.slice(m[0].length); continue; }
      const target = pending || [0, 1, 2, 3, 4, 5, 6];
      m = ALLDAY_RE.exec(s);
      if (m) { target.forEach((d) => days[d].push([0, 1440])); sawAnything = true; s = s.slice(m[0].length); continue; }
      m = CLOSED_RE.exec(s);
      if (m) { sawAnything = true; s = s.slice(m[0].length); continue; }
      m = RANGE_RE.exec(s);
      if (m) {
        const colon = (x) => /[:h.]/.test(x);
        const raw = m[0];
        const bothColon = colon(raw.split(/-|\bto\b/)[0]) && colon(raw.split(/-|\bto\b/)[1] || '');
        const a = minutesOf(m[1], m[2], m[3], false), b = minutesOf(m[4], m[5], m[6], false);
        if (a === null || b === null) return null;
        let end = b;
        if (end <= a) {
          // an end before the start is a midnight crossing, but only when the text is explicit (24 h with
          // colons, or am/pm): "8-5" is ambiguous, so it is not understood.
          if (!(bothColon || (m[3] && m[6]))) return null;
          if (end === a) return null;
          end += 1440;
        }
        target.forEach((d) => days[d].push([a, end]));
        sawAnything = true;
        s = s.slice(m[0].length);
        continue;
      }
      return null; // an unknown word, a holiday rule, "by appointment": not understood
    }
    return sawAnything ? { days } : null;
  }

  /**
   * { status: 'open' | 'closed' | 'unknown', text } for free-text hours at `now` (epoch ms).
   * 'unknown' (and text '') for anything not fully understood: the UI shows no open state then.
   */
  function openState(hours, now, strings) {
    const T = strings || S();
    const unknown = { status: 'unknown', text: '' };
    const t = toMs(now);
    const parsed = parseHours(hours);
    if (t === null || !parsed) return unknown;
    const { days } = parsed;
    const wall = local(t);
    const dow = wall.getUTCDay();
    const mins = wall.getUTCHours() * 60 + wall.getUTCMinutes();

    // Open 24 hours on every day: say so plainly.
    if (days.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] === 1440)) return { status: 'open', text: T.open24 };

    // open now? today's intervals, or yesterday's that run past midnight
    for (const [a, b] of days[dow]) if (mins >= a && mins < b) return { status: 'open', text: T.closesAt(hhmm(b % 1440 === 0 ? 0 : b % 1440)) };
    for (const [, b] of days[(dow + 6) % 7]) if (b > 1440 && mins < b - 1440) return { status: 'open', text: T.closesAt(hhmm(b - 1440)) };

    // closed now: opens later today?
    const later = days[dow].filter(([a]) => a > mins).sort((x, y) => x[0] - y[0])[0];
    if (later) return { status: 'closed', text: T.opensAt(hhmm(later[0])) };
    // no hours today at all = a closed day
    if (!days[dow].length) return { status: 'closed', text: T.closedToday };
    // had hours today but they are over: the next day with hours
    for (let i = 1; i <= 7; i++) {
      const d = (dow + i) % 7;
      if (days[d].length) {
        const first = days[d].slice().sort((x, y) => x[0] - y[0])[0];
        return { status: 'closed', text: i === 1 ? T.opensTomorrow(hhmm(first[0])) : T.opensDay(T.dayShort[d], hhmm(first[0])) };
      }
    }
    return { status: 'closed', text: T.closed };
  }

  // ── Events: "Starts in 2 h" ──────────────────────────────────────
  function eventStartsIn(start, now, end, strings) {
    const T = strings || S();
    const s = toMs(start), t = toMs(now), e = toMs(end);
    if (s === null || t === null) return null;
    if (t >= s) return e !== null && t <= e ? T.happeningNow : null; // past events are not labelled
    const diff = s - t;
    if (diff < MIN) return T.startsNow;
    if (diff < HOUR) return T.startsInMin(Math.max(1, Math.floor(diff / MIN)));
    if (diff < DAY) return T.startsInHours(Math.floor(diff / HOUR));
    const w = local(s);
    const time = hhmm(w.getUTCHours() * 60 + w.getUTCMinutes());
    const days = dayKey(s) - dayKey(t);
    if (days === 1) return T.startsTomorrow(time);
    if (days < 7) return T.startsDay(T.dayShort[w.getUTCDay()], time);
    return T.startsDate(w.getUTCDate() + ' ' + T.monthShort[w.getUTCMonth()], time);
  }

  // ── Posts: "3 h ago" ─────────────────────────────────────────────
  function postedAgo(time, now, strings) {
    const T = strings || S();
    const p = toMs(time), t = toMs(now);
    if (p === null || t === null) return null;
    const diff = t - p;
    if (diff < -5 * MIN) return null; // a time in the future is not "posted"
    if (diff < MIN) return T.justNow;
    if (diff < HOUR) return T.minAgo(Math.floor(diff / MIN));
    if (diff < DAY) return T.hAgo(Math.floor(diff / HOUR));
    const days = dayKey(t) - dayKey(p);
    if (days === 1) return T.yesterday;
    if (days < 7) return T.daysAgo(days);
    const w = local(p);
    const sameYear = local(t).getUTCFullYear() === w.getUTCFullYear();
    return w.getUTCDate() + ' ' + T.monthShort[w.getUTCMonth()] + (sameYear ? '' : ' ' + w.getUTCFullYear());
  }

  window.MapV2Time = { TZ, LOCALE, openState, eventStartsIn, postedAgo, parseHours };
})();
