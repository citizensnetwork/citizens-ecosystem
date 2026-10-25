// Just enough HTML for the Reader, with no dependency and no regex over the page: a linear scan
// for <script type="application/ld+json">, <link rel="alternate"> and <base href>, plus
// htmlToText for descriptions that arrive as HTML. Pure. Every loop is bounded by the input
// length or a fixed cap, so a hostile page cannot make it slow or large.

const MAX_JSONLD_BLOCKS = 30;
const MAX_JSONLD_CHARS = 300_000;
const MAX_LINKS = 200;

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·",
};

/** Decode HTML character references (named ones from a small table, numeric ones within Unicode). */
export function decodeEntities(text) {
  return String(text ?? "").replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (whole, ref) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return " ";
      return String.fromCodePoint(code);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ref.toLowerCase()) ? NAMED[ref.toLowerCase()] : whole;
  });
}

const isSpace = (c) => c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";
const isNameChar = (c) => c !== undefined && !isSpace(c) && c !== ">" && c !== "/" && c !== "=" && c !== "<";

/**
 * Parse the tag that starts at `lt` (the index of "<"). Returns { name, attrs, end } where `end`
 * is the index just past ">", null when this "<" does not open a tag, or { incomplete: true } when
 * the tag runs off the end of the input (an unclosed quote or no ">": no later tag can complete
 * either, so the caller stops instead of rescanning to the end from every "<").
 */
export function readTag(html, lt) {
  let i = lt + 1;
  if (html[i] === "/") return null;
  const start = i;
  while (i < html.length && isNameChar(html[i])) i++;
  const name = html.slice(start, i).toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) return null;
  const attrs = {};
  for (;;) {
    while (i < html.length && (isSpace(html[i]) || html[i] === "/")) i++;
    if (i >= html.length) return { incomplete: true };
    if (html[i] === ">") return { name, attrs, end: i + 1 };
    const ns = i;
    while (i < html.length && isNameChar(html[i])) i++;
    if (i === ns) {
      i++; // a stray "=" or "<": skip it
      continue;
    }
    const attr = html.slice(ns, i).toLowerCase();
    while (i < html.length && isSpace(html[i])) i++;
    let value = "";
    if (html[i] === "=") {
      i++;
      while (i < html.length && isSpace(html[i])) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1);
        if (close === -1) return { incomplete: true };
        value = html.slice(i + 1, close);
        i = close + 1;
      } else {
        const vs = i;
        while (i < html.length && !isSpace(html[i]) && html[i] !== ">") i++;
        value = html.slice(vs, i);
      }
    }
    if (!(attr in attrs) && Object.keys(attrs).length < 40) attrs[attr] = decodeEntities(value.slice(0, 2_000));
  }
}

/**
 * One pass over a page. Returns { jsonld: string[], links: { rel, type, href, title }[], base: string | null }.
 * Comments are skipped; the body of <script>, <style>, <template> and <textarea> is never scanned for tags.
 */
export function scanHtml(html) {
  const text = String(html ?? "");
  const lower = text.toLowerCase();
  const out = { jsonld: [], links: [], base: null };
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) break;
    if (text.startsWith("<!--", lt)) {
      const close = text.indexOf("-->", lt + 4);
      i = close === -1 ? text.length : close + 3;
      continue;
    }
    const tag = readTag(text, lt);
    if (tag?.incomplete) break;
    if (!tag) {
      i = lt + 1;
      continue;
    }
    i = tag.end;
    if (tag.name === "base" && out.base === null && tag.attrs.href) out.base = tag.attrs.href.trim();
    if (tag.name === "link" && out.links.length < MAX_LINKS) {
      out.links.push({ rel: (tag.attrs.rel ?? "").toLowerCase(), type: (tag.attrs.type ?? "").toLowerCase().trim(), href: (tag.attrs.href ?? "").trim(), title: tag.attrs.title ?? "" });
    }
    if (tag.name === "script" || tag.name === "style" || tag.name === "template" || tag.name === "textarea") {
      const close = lower.indexOf(`</${tag.name}`, tag.end);
      const bodyEnd = close === -1 ? text.length : close;
      if (tag.name === "script" && (tag.attrs.type ?? "").trim().toLowerCase() === "application/ld+json" && out.jsonld.length < MAX_JSONLD_BLOCKS) {
        const body = text.slice(tag.end, bodyEnd);
        if (body.length <= MAX_JSONLD_CHARS) out.jsonld.push(body);
      }
      const gt = close === -1 ? -1 : text.indexOf(">", close);
      i = gt === -1 ? text.length : gt + 1;
    }
  }
  return out;
}

const FEED_TYPES = { "application/rss+xml": "feed", "application/atom+xml": "feed", "application/rdf+xml": "feed", "text/calendar": "ics" };

/**
 * The feeds and calendars a page itself advertises with <link rel="alternate">, resolved against
 * <base> and the page address, https only, at most `max`. Comment feeds are never offered: they
 * hold individuals' words and names (POPIA), not the organisation's news.
 */
export function discoverFeeds(scan, pageUrl, max = 3) {
  let base = pageUrl;
  if (scan.base) {
    try {
      base = new URL(scan.base, pageUrl).toString();
    } catch {
      /* keep the page address */
    }
  }
  const found = [];
  const seen = new Set();
  for (const link of scan.links) {
    if (!link.rel.split(/\s+/).includes("alternate")) continue;
    const kind = FEED_TYPES[link.type.split(";")[0].trim()];
    if (!kind || !link.href) continue;
    let u;
    try {
      u = new URL(link.href, base);
    } catch {
      continue;
    }
    if (u.protocol !== "https:") continue;
    u.hash = "";
    if (isCommentFeed(u, link.title)) continue;
    const href = u.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    found.push({ url: href, kind });
    if (found.length >= max) break;
  }
  return found;
}

/** A feed of comments (WordPress "/comments/feed/", "?feed=comments-rss2", a title that says so). */
export function isCommentFeed(u, title = "") {
  const path = (u.pathname + u.search).toLowerCase();
  return path.includes("comment") || /comment/i.test(String(title));
}

const BLOCK_TAGS = new Set(["p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article", "blockquote", "hr", "table"]);
const SKIP_BODY = new Set(["script", "style", "template", "noscript", "iframe", "svg", "object"]);

/** HTML (or text that may hold tags and entities) to plain text: tags gone, blocks as line breaks. */
export function htmlToText(html, maxChars = 20_000) {
  const text = String(html ?? "").slice(0, maxChars * 4);
  const lower = text.toLowerCase();
  let out = "";
  let i = 0;
  while (i < text.length && out.length < maxChars * 2) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, lt);
    if (text.startsWith("<!--", lt)) {
      const close = text.indexOf("-->", lt + 4);
      i = close === -1 ? text.length : close + 3;
      continue;
    }
    let j = lt + 1;
    const closing = text[j] === "/";
    if (closing) j++;
    let k = j;
    while (k < text.length && /[a-zA-Z0-9]/.test(text[k])) k++;
    const name = lower.slice(j, k);
    if (!name) {
      out += "<";
      i = lt + 1;
      continue;
    }
    const gt = text.indexOf(">", k);
    if (gt === -1) break;
    i = gt + 1;
    if (!closing && SKIP_BODY.has(name)) {
      const close = lower.indexOf(`</${name}`, i);
      const end = close === -1 ? -1 : text.indexOf(">", close);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (BLOCK_TAGS.has(name)) out += "\n";
  }
  return decodeEntities(out)
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ ?\n[\n ]*/g, "\n")
    .trim()
    .slice(0, maxChars);
}
