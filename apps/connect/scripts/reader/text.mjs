// Text helpers for the Reader. Dependency-free and pure.
//
// Deliberately free of regular expressions that run over a whole page: pages are untrusted
// and up to 1 MB, so anything that must walk a document uses a plain index loop (the CodeQL
// "polynomial regular expression" lesson). The few regexes below only ever see short strings.

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
};

/** Decode the common named entities and numeric references. Unknown ones are left as typed. */
export function decodeEntities(input) {
  const s = String(input ?? "");
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

const BLOCK_TAGS = new Set([
  "br", "p", "div", "li", "ul", "ol", "tr", "table", "section", "article", "header", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr",
]);

/** Index just after the `>` that closes the tag starting at `start` (a `<`), honouring quoted values. */
export function tagEnd(html, start) {
  let quote = "";
  for (let i = start + 1; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i + 1;
    }
  }
  return -1;
}

/** Index of the next `</name` (any case) at or after `from`, or -1. No lower-cased copy of the page. */
export function indexOfCloseTag(html, name, from = 0) {
  const want = "</" + name.toLowerCase();
  for (let i = html.indexOf("</", from); i !== -1; i = html.indexOf("</", i + 2)) {
    if (html.slice(i, i + want.length).toLowerCase() === want) return i;
  }
  return -1;
}

function isLetter(c) {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

/** Plain text from an HTML fragment: tags removed, script/style dropped, block tags become line breaks. */
export function htmlToText(html, maxIn = 200_000) {
  const s = String(html ?? "").slice(0, maxIn);
  let out = "";
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, lt);
    const next = s[lt + 1] ?? "";
    if (s.startsWith("<!--", lt)) {
      const close = s.indexOf("-->", lt + 4);
      i = close === -1 ? s.length : close + 3;
      continue;
    }
    if (!isLetter(next) && next !== "/" && next !== "!" && next !== "?") {
      out += "<";
      i = lt + 1;
      continue;
    }
    const end = tagEnd(s, lt);
    if (end === -1) break;
    let nameStart = lt + 1;
    if (s[nameStart] === "/") nameStart++;
    let nameEnd = nameStart;
    while (nameEnd < end && (isLetter(s[nameEnd]) || (s[nameEnd] >= "0" && s[nameEnd] <= "9"))) nameEnd++;
    const name = s.slice(nameStart, nameEnd).toLowerCase();
    i = end;
    if ((name === "script" || name === "style") && s[lt + 1] !== "/") {
      const closeAt = indexOfCloseTag(s, name, i);
      if (closeAt === -1) break;
      const after = tagEnd(s, closeAt);
      i = after === -1 ? s.length : after;
      continue;
    }
    if (BLOCK_TAGS.has(name)) out += "\n";
  }
  return decodeEntities(out);
}

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** One line: control characters gone, whitespace collapsed, capped. */
export function oneLine(v, max) {
  if (typeof v !== "string") return "";
  return v.slice(0, max * 4).replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Several lines: control characters gone, blank-line runs collapsed, capped. */
export function multiLine(v, max) {
  if (typeof v !== "string") return "";
  return v
    .slice(0, max * 4)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

// The same two patterns as src/lib/automation/suggestions.ts (the server scrubs again, this is
// belt and braces). A test compares the two on a corpus so they cannot drift apart.
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,189}\.[A-Za-z]{2,24}/g;
const PHONE_IN_TEXT =
  /(?<![\w.])(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3}[\s.-]\d{3,4}(?![\w])|(?<![\w.])\+?\d{9,15}(?![\w])/g;

/** Replace email addresses and phone numbers in free text with "[removed]". */
export function scrubPersonalContact(text) {
  return String(text ?? "").replace(EMAIL_IN_TEXT, "[removed]").replace(PHONE_IN_TEXT, "[removed]");
}

/** An https URL with no credentials, at most `max` characters, or null. Fragments dropped. */
export function httpsUrl(value, base, max = 500) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.length > 2000) return null;
  let u;
  try {
    u = base ? new URL(t, base) : new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
  u.hash = "";
  const out = u.toString();
  return out.length > max ? null : out;
}

/** "Sunday  Service!" and "sunday service" match: for removing repeats inside one run. */
export function normKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
