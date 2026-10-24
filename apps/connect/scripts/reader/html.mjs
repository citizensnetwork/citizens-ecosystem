// A small, tolerant HTML scanner: just enough to find what the Reader looks for on a page
// (<link>, <meta>, <base>, and the text of JSON-LD <script> blocks). No DOM, no dependency.
//
// It walks the document once with index loops, never with a regex over the whole page, and it
// is total: any input, however broken, returns a result and never throws.

import { decodeEntities, indexOfCloseTag, tagEnd } from "./text.mjs";

const MAX_TAGS = 20_000;
const MAX_JSONLD_BLOCKS = 20;
const MAX_JSONLD_CHARS = 400_000;

function isNameChar(c) {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "-" || c === ":";
}

/** Attributes of one tag's text (everything between the tag name and `>`), lower-cased names. */
export function parseAttributes(text) {
  const attrs = {};
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && (text[i] <= " " || text[i] === "/")) i++;
    const nameStart = i;
    while (i < n && text[i] > " " && text[i] !== "=" && text[i] !== "/" && text[i] !== ">") i++;
    const name = text.slice(nameStart, i).toLowerCase();
    while (i < n && text[i] <= " ") i++;
    let value = "";
    if (text[i] === "=") {
      i++;
      while (i < n && text[i] <= " ") i++;
      const q = text[i];
      if (q === '"' || q === "'") {
        const close = text.indexOf(q, i + 1);
        value = close === -1 ? text.slice(i + 1) : text.slice(i + 1, close);
        i = close === -1 ? n : close + 1;
      } else {
        const vs = i;
        while (i < n && text[i] > " " && text[i] !== ">") i++;
        value = text.slice(vs, i);
      }
    }
    if (name && !(name in attrs)) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/**
 * Scan a page. Returns:
 *   links:  [{ rel, type, href, title }]   (from <link>)
 *   metas:  [{ name, property, itemprop, content }]
 *   jsonld: [string]                       (the raw text of <script type="application/ld+json">)
 *   base:   string | null                  (<base href>)
 */
export function scanHtml(html) {
  const s = String(html ?? "");
  const out = /** @type {{ links: {rel: string, type: string, href: string, title: string}[], metas: {name: string, property: string, itemprop: string, content: string}[], jsonld: string[], base: string | null }} */ ({ links: [], metas: [], jsonld: [], base: null });
  let jsonLdChars = 0;
  let tags = 0;
  let i = 0;
  while (i < s.length && tags < MAX_TAGS) {
    const lt = s.indexOf("<", i);
    if (lt === -1) break;
    if (s.startsWith("<!--", lt)) {
      const close = s.indexOf("-->", lt + 4);
      i = close === -1 ? s.length : close + 3;
      continue;
    }
    const first = s[lt + 1] ?? "";
    if (!((first >= "a" && first <= "z") || (first >= "A" && first <= "Z"))) {
      i = lt + 1;
      continue;
    }
    const end = tagEnd(s, lt);
    if (end === -1) break;
    tags++;
    let nameEnd = lt + 1;
    while (nameEnd < end && isNameChar(s[nameEnd])) nameEnd++;
    const name = s.slice(lt + 1, nameEnd).toLowerCase();
    i = end;

    if (name === "script" || name === "style" || name === "textarea" || name === "title") {
      const closeAt = indexOfCloseTag(s, name, end);
      const body = closeAt === -1 ? s.slice(end) : s.slice(end, closeAt);
      if (name === "script") {
        const attrs = parseAttributes(s.slice(nameEnd, end - 1));
        if (
          String(attrs.type ?? "")
            .toLowerCase()
            .includes("ld+json") &&
          out.jsonld.length < MAX_JSONLD_BLOCKS &&
          jsonLdChars + body.length <= MAX_JSONLD_CHARS
        ) {
          out.jsonld.push(body);
          jsonLdChars += body.length;
        }
      }
      if (closeAt === -1) break;
      const after = tagEnd(s, closeAt);
      i = after === -1 ? s.length : after;
      continue;
    }

    if (name === "link" || name === "meta" || name === "base") {
      const attrs = parseAttributes(s.slice(nameEnd, end - 1));
      if (name === "link") {
        out.links.push({
          rel: String(attrs.rel ?? "").toLowerCase(),
          type: String(attrs.type ?? "").toLowerCase(),
          href: attrs.href ?? "",
          title: attrs.title ?? "",
        });
      } else if (name === "meta") {
        out.metas.push({
          name: String(attrs.name ?? "").toLowerCase(),
          property: String(attrs.property ?? "").toLowerCase(),
          itemprop: String(attrs.itemprop ?? "").toLowerCase(),
          content: attrs.content ?? "",
        });
      } else if (out.base === null && attrs.href) {
        out.base = attrs.href;
      }
    }
  }
  return out;
}

const FEED_TYPES = new Map([
  ["text/calendar", "ics"],
  ["application/rss+xml", "feed"],
  ["application/atom+xml", "feed"],
  ["application/rdf+xml", "feed"],
]);

/** Two addresses belong to one site: the same host, or one is a subdomain of the other (ignoring "www."). */
export function sameSite(a, b) {
  let ha;
  let hb;
  try {
    ha = new URL(a).hostname.toLowerCase().replace(/^www\./, "");
    hb = new URL(b).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return ha === hb || ha.endsWith("." + hb) || hb.endsWith("." + ha);
}

/**
 * Feeds the page itself advertises with <link rel="alternate">: iCalendar first, then RSS/Atom
 * (not the comments feed). Resolved against the page address; https only; at most `max`.
 * `sameSiteOnly` keeps a calendar or feed hosted somewhere else from being pulled in just because a
 * page links to it: the Reader follows the owner's own site.
 */
export function discoverFeeds(scan, pageUrl, { sameSiteOnly = true, max = 3 } = {}) {
  const base = scan.base ? safeUrl(scan.base, pageUrl) ?? pageUrl : pageUrl;
  const found = [];
  for (const link of scan.links) {
    if (!link.rel.split(/\s+/).includes("alternate")) continue;
    const kind = FEED_TYPES.get(link.type.split(";")[0].trim());
    if (!kind || !link.href) continue;
    if (/comment/i.test(link.title)) continue;
    const url = safeUrl(link.href, base);
    if (!url || new URL(url).protocol !== "https:") continue;
    if (sameSiteOnly && !sameSite(url, pageUrl)) continue;
    if (!found.some((f) => f.url === url)) found.push({ kind, url });
  }
  found.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "ics" ? -1 : 1));
  return found.slice(0, max);
}

function safeUrl(href, base) {
  try {
    const u = new URL(href.trim(), base);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export function isChannelId(v) {
  return typeof v === "string" && CHANNEL_ID.test(v);
}

/**
 * A YouTube channel id from the channel page's own metadata (itemprop, canonical link, the advertised
 * feed link, og:url), or null. Never from the page's embedded script data: that can name other channels.
 */
export function youtubeChannelIdFromPage(scan) {
  for (const m of scan.metas) {
    if (m.itemprop === "channelid" && isChannelId(m.content.trim())) return m.content.trim();
  }
  for (const l of scan.links) {
    if (l.rel.split(/\s+/).includes("canonical")) {
      const id = channelIdFromPath(l.href);
      if (id) return id;
    }
    if (l.rel.split(/\s+/).includes("alternate") && l.href) {
      try {
        const u = new URL(l.href);
        const id = u.searchParams.get("channel_id");
        if (u.pathname === "/feeds/videos.xml" && isChannelId(id)) return id;
      } catch {
        /* not a URL */
      }
    }
  }
  for (const m of scan.metas) {
    if (m.property === "og:url") {
      const id = channelIdFromPath(m.content);
      if (id) return id;
    }
  }
  return null;
}

/** "/channel/UCxxxxxxxxxxxxxxxxxxxxxx" (a path or a full address) -> the id, else null. */
export function channelIdFromPath(hrefOrPath) {
  let path = String(hrefOrPath ?? "");
  try {
    path = new URL(path, "https://www.youtube.com/").pathname;
  } catch {
    return null;
  }
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "channel" && isChannelId(parts[1]) ? parts[1] : null;
}
