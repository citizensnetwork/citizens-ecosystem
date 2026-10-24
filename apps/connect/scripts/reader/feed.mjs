// RSS 2.0, RSS 1.0 and Atom (which includes YouTube's channel feed). A tolerant, dependency-free
// reader: it finds the entries and their title, link, date and summary, and nothing else. It
// never expands entities beyond the standard set, so a hostile "billion laughs" document is
// just text to it.

import { decodeEntities, htmlToText, httpsUrl, multiLine, oneLine, tagEnd } from "./text.mjs";
import { parseFeedDate } from "./time.mjs";

const MAX_ITEMS = 60;

/** Inner text of every `<tag ...>...</tag>` in `xml` (exact tag name, so `title` skips `media:title`). */
function blocks(xml, tag, max = MAX_ITEMS) {
  const open = "<" + tag;
  const close = "</" + tag + ">";
  const out = [];
  let i = 0;
  while (out.length < max) {
    i = xml.indexOf(open, i);
    if (i === -1) break;
    const c = xml[i + open.length];
    if (c !== ">" && c !== " " && c !== "\n" && c !== "\t" && c !== "\r" && c !== "/") {
      i += open.length;
      continue;
    }
    const gt = tagEnd(xml, i);
    if (gt === -1) break;
    if (xml[gt - 2] === "/") {
      i = gt;
      continue;
    }
    const end = xml.indexOf(close, gt);
    if (end === -1) break;
    out.push({ attrs: xml.slice(i + open.length, gt - 1), inner: xml.slice(gt, end) });
    i = end + close.length;
  }
  return out;
}

/** The text of the first of `names` in a block: CDATA kept as written, anything else entity-decoded. */
function childText(block, names) {
  for (const name of names) {
    const found = blocks(block, name, 1)[0];
    if (!found) continue;
    let t = found.inner.trim();
    if (t.startsWith("<![CDATA[")) {
      const end = t.lastIndexOf("]]>");
      t = t.slice(9, end === -1 ? undefined : end);
    } else {
      t = decodeEntities(t);
    }
    if (t.trim()) return t;
  }
  return "";
}

function attrOf(attrText, name) {
  const key = name + "=";
  let i = attrText.indexOf(key);
  while (i !== -1 && i > 0 && attrText[i - 1] > " ") i = attrText.indexOf(key, i + 1);
  if (i === -1) return "";
  const q = attrText[i + key.length];
  if (q !== '"' && q !== "'") return "";
  const end = attrText.indexOf(q, i + key.length + 1);
  return end === -1 ? "" : decodeEntities(attrText.slice(i + key.length + 1, end));
}

/** Atom `<link href="..." rel="alternate"/>`: the alternate (or the first without a rel). */
function atomLink(block) {
  let best = "";
  let from = 0;
  for (let n = 0; n < 20; n++) {
    const at = block.indexOf("<link", from);
    if (at === -1) break;
    const end = tagEnd(block, at);
    if (end === -1) break;
    const attrs = block.slice(at + 5, end - 1);
    const rel = attrOf(attrs, "rel");
    const href = attrOf(attrs, "href");
    if (href && (rel === "alternate" || rel === "")) {
      if (rel === "alternate") return href;
      best ||= href;
    }
    from = end;
  }
  return best;
}

/** How a document says it is a feed, or null: looks only at the start, before any <html>. */
export function sniffFeed(text) {
  const head = String(text ?? "").slice(0, 4096).toLowerCase();
  const html = head.indexOf("<html");
  for (const marker of ["<rss", "<feed", "<rdf:rdf"]) {
    const at = head.indexOf(marker);
    if (at !== -1 && (html === -1 || at < html)) return true;
  }
  return false;
}

/**
 * @param {string} xml
 * @param {string} feedUrl the feed's own address, to resolve relative links
 * @returns {{ items: {title:string, link:string|null, body:string, publishedMs:number|null}[] }}
 */
export function parseFeed(xml, feedUrl) {
  const s = String(xml ?? "");
  const rawItems = [...blocks(s, "item"), ...blocks(s, "entry")].slice(0, MAX_ITEMS);
  const items = [];
  for (const { inner } of rawItems) {
    const title = oneLine(htmlToText(childText(inner, ["title"])), 200);
    if (!title) continue;
    const link = httpsUrl(childText(inner, ["link"]).trim() || atomLink(inner) || childText(inner, ["guid"]).trim(), feedUrl);
    const body = multiLine(htmlToText(childText(inner, ["description", "summary", "content:encoded", "content", "media:description"])), 4000);
    const published = childText(inner, ["pubDate", "published", "dc:date", "updated"]);
    items.push({ title, link, body, publishedMs: parseFeedDate(published) });
  }
  return { items };
}
