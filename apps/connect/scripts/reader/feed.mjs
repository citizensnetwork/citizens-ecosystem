// RSS 2.0, RSS 1.0 (RDF) and Atom feeds to news items. Pure.
//
// An item is { title, body, link, publishedMs }: plain text (HTML in a description is reduced to
// text), the item's own https link resolved against the feed address, and its date (null when it
// has none or it cannot be read, so the caller can leave it out rather than guess).

import { htmlToText } from "./html.mjs";
import { DEFAULT_TZ, parseFeedDate } from "./time.mjs";
import { XmlRefused, childrenNamed, firstChild, parseXml, textOf } from "./xml.mjs";

const MAX_ITEMS = 100;

/** Does this text look like a feed (its first element is rss, feed or rdf:RDF)? */
export function sniffFeed(text) {
  const head = String(text ?? "").slice(0, 4_000).replace(/^\ufeff/, "");
  let i = 0;
  for (;;) {
    while (i < head.length && /\s/.test(head[i])) i++;
    if (head.startsWith("<?", i)) {
      const e = head.indexOf("?>", i);
      if (e === -1) return false;
      i = e + 2;
    } else if (head.startsWith("<!--", i)) {
      const e = head.indexOf("-->", i);
      if (e === -1) return false;
      i = e + 3;
    } else if (head.startsWith("<!", i)) {
      const e = head.indexOf(">", i);
      if (e === -1) return false;
      i = e + 1;
    } else break;
  }
  const m = /^<([a-zA-Z_][\w.:-]{0,40})/.exec(head.slice(i, i + 50));
  if (!m) return false;
  const name = m[1].toLowerCase();
  return name === "rss" || name === "feed" || name === "rdf:rdf" || name.endsWith(":feed");
}

function httpsLink(raw, base) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Atom text constructs: type="html" holds escaped HTML, "xhtml" holds markup, "text" holds text. */
function atomText(node) {
  if (!node) return "";
  return htmlToText(textOf(node));
}

function atomLink(entry, base) {
  const links = childrenNamed(entry, "link");
  const chosen = links.find((l) => (l.attrs.rel ?? "alternate") === "alternate" && (!l.attrs.type || l.attrs.type.includes("html"))) ?? links.find((l) => !l.attrs.rel);
  return chosen ? httpsLink(chosen.attrs.href, base) : null;
}

/**
 * @returns {{ title: string, items: { title: string, body: string, link: string | null, publishedMs: number | null }[] }}
 * An unreadable or refused document gives no items (never a throw).
 */
export function parseFeed(text, feedUrl, tz = DEFAULT_TZ) {
  let doc;
  try {
    doc = parseXml(text);
  } catch (e) {
    if (e instanceof XmlRefused) return { title: "", items: [], refused: true };
    return { title: "", items: [] };
  }
  const rootEl = doc.children.find((c) => c.name === "rss" || c.name === "feed" || c.name.endsWith(":feed") || c.name === "rdf:rdf");
  if (!rootEl) return { title: "", items: [] };
  const items = [];

  if (rootEl.name === "rss" || rootEl.name === "rdf:rdf") {
    const channel = firstChild(rootEl, "channel");
    const title = channel ? htmlToText(textOf(firstChild(channel, "title")), 200) : "";
    // RSS 2.0 puts items in the channel; RSS 1.0 puts them beside it.
    const raw = [...(channel ? childrenNamed(channel, "item") : []), ...childrenNamed(rootEl, "item")].slice(0, MAX_ITEMS);
    for (const it of raw) {
      const body = textOf(firstChild(it, "content:encoded")) || textOf(firstChild(it, "description"));
      const date = textOf(firstChild(it, "pubdate")) || textOf(firstChild(it, "dc:date")) || textOf(firstChild(it, "date"));
      const guid = firstChild(it, "guid");
      const linkText = textOf(firstChild(it, "link")) || (guid && guid.attrs.ispermalink !== "false" ? textOf(guid) : "");
      items.push({
        title: htmlToText(textOf(firstChild(it, "title")), 400),
        body: htmlToText(body, 8_000),
        link: httpsLink(linkText, feedUrl),
        publishedMs: parseFeedDate(date, tz),
      });
    }
    return { title, items };
  }

  const base = httpsLink(rootEl.attrs["xml:base"], feedUrl) ?? feedUrl;
  const title = atomText(firstChild(rootEl, "title")).slice(0, 200);
  for (const entry of childrenNamed(rootEl, "entry").slice(0, MAX_ITEMS)) {
    const date = textOf(firstChild(entry, "published")) || textOf(firstChild(entry, "updated"));
    items.push({
      title: atomText(firstChild(entry, "title")).slice(0, 400),
      body: (atomText(firstChild(entry, "content")) || atomText(firstChild(entry, "summary"))).slice(0, 8_000),
      link: atomLink(entry, base),
      publishedMs: parseFeedDate(date, tz),
    });
  }
  return { title, items };
}
