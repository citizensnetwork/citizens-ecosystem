// Read ONE listing source and turn what it publishes into suggestion items.
//
// In order, and nothing else (no language model, no guessing at free text):
//   (a) schema.org Events in the page's JSON-LD;
//   (b) the calendars and feeds the page itself advertises with <link rel="alternate">
//       (iCalendar gives events, RSS or Atom gives news), at most three, never a comment feed;
//   (c) a calendar or feed address given directly as the source is read the same way.
// YouTube is not read in this version: youtube.com's robots.txt disallows its video feeds for every
// crawler, and the Reader honours robots.txt. A YouTube source gets an honest status instead.
//
// Items use exactly the payload shapes of src/lib/automation/suggestions.ts. The server re-validates
// and scrubs every item (it is the one validator), so this module only has to be correct and
// conservative. Status lines are built from fixed phrases and numbers only: they are shown to the
// owner on their dashboard and printed in a public log.

import { discoverFeeds, isCommentFeed, scanHtml } from "./html.mjs";
import { eventsFromJsonLd } from "./jsonld.mjs";
import { parseIcs } from "./ics.mjs";
import { parseFeed, sniffFeed } from "./feed.mjs";
import { dayOf } from "./time.mjs";

export const LIMITS = {
  /** At most this many items per source per run. */
  maxItems: 20,
  /** Room kept for posts, so a busy calendar cannot crowd every post out. */
  reservedForNews: 5,
  /** A post older than this is not news. */
  newsDays: 14,
  /** A repeating event is offered this far ahead, at most this many times per series. */
  recurringDays: 14,
  maxPerSeries: 2,
  /** A one-off event further ahead than this is left for a later run. */
  singleDays: 365,
  /** Feeds and calendars followed from one page. */
  maxFeeds: 3,
};

/** The source kinds the Reader is given (GET /api/automation/sources). Facebook, Instagram and TikTok never arrive. */
export const READABLE_KINDS = new Set(["website", "youtube", "calendar"]);

export const STATUS = {
  youtube: "YouTube is not read yet",
  notReadable: "not a source the Reader reads",
  commentFeed: "comment feeds are not read",
  unreadable: "could not be read",
};

const DAY = 86_400_000;
const PAGE_ACCEPT = "text/html,application/xhtml+xml,text/calendar,application/rss+xml,application/atom+xml,application/xml;q=0.8,*/*;q=0.5";
const FEED_ACCEPT = "text/calendar,application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5";
const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];

function isYoutubeHost(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return YOUTUBE_HOSTS.some((d) => h === d || h.endsWith("." + d));
  } catch {
    return false;
  }
}

/** What kind of document is this, by its content (servers mislabel types)? */
export function classify(text) {
  const t = String(text ?? "").replace(/^\ufeff/, "").trimStart();
  if (t.slice(0, 15).toUpperCase().startsWith("BEGIN:VCALENDAR")) return "ics";
  if (sniffFeed(t)) return "feed";
  return "html";
}

function newAccumulator() {
  return { events: [], news: [], skippedNoTime: 0, skippedUnsupported: 0, skippedPrivate: 0, cancelled: 0, feedProblem: null, partial: false, refusedComments: false };
}

function addIcs(acc, text, url, nowMs) {
  const r = parseIcs(text, { nowMs, recurringDays: LIMITS.recurringDays, singleDays: LIMITS.singleDays, maxPerSeries: LIMITS.maxPerSeries });
  for (const e of r.events) acc.events.push({ ...e, sourceUrl: url });
  acc.skippedNoTime += r.skippedNoTime;
  acc.skippedUnsupported += r.skippedUnsupported;
  acc.skippedPrivate += r.skippedPrivate;
  acc.cancelled += r.cancelled;
}

function addFeed(acc, text, url, nowMs) {
  const feed = parseFeed(text, url);
  if (isCommentFeed(new URL(url), feed.title)) {
    acc.refusedComments = true;
    return;
  }
  for (const item of feed.items) {
    if (item.publishedMs === null) continue; // no date, so no way to say it is news
    if (item.publishedMs > nowMs + DAY || item.publishedMs < nowMs - LIMITS.newsDays * DAY) continue;
    acc.news.push({ ...item, sourceUrl: url });
  }
}

function addJsonLd(acc, blocks, url, nowMs) {
  const r = eventsFromJsonLd(blocks, url);
  for (const e of r.events) {
    if (e.startMs > nowMs && e.startMs <= nowMs + LIMITS.singleDays * DAY) acc.events.push({ ...e, sourceUrl: url });
  }
  acc.skippedNoTime += r.skippedNoTime;
  acc.cancelled += r.cancelled;
}

function addDocument(acc, r, nowMs) {
  if (r.truncated) acc.partial = true;
  const kind = classify(r.text);
  if (kind === "ics") addIcs(acc, r.text, r.url, nowMs);
  else if (kind === "feed") addFeed(acc, r.text, r.url, nowMs);
  return kind;
}

// ── mapping to the server's payload shapes ──────────────────────────────────

/**
 * One item for POST /api/automation/suggestions (src/lib/automation/suggestions.ts has the shapes).
 * @typedef {{ kind: "event" | "news", source_url: string, payload: Record<string, any> }} SuggestionItem
 */

const cut = (s, n) => String(s ?? "").trim().slice(0, n).trim();
const normKey = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sourceUrlFor = (url, fallback) => (url && url.length <= 500 ? url : fallback);

export function eventItem(e, fallbackUrl) {
  const title = cut(e.title, 120);
  if (title.length < 3) return null;
  return {
    kind: "event",
    source_url: sourceUrlFor(e.sourceUrl, fallbackUrl),
    payload: {
      title,
      description: cut(e.description, 2_000),
      start: new Date(e.startMs).toISOString(),
      end: e.endMs && e.endMs > e.startMs ? new Date(e.endMs).toISOString() : null,
      location: cut(e.location, 300),
      website_url: e.url && e.url.length <= 500 ? e.url : null,
    },
  };
}

export function newsItem(n, fallbackUrl) {
  const title = cut(n.title, 120);
  if (title.length < 3) return null;
  return {
    kind: "news",
    source_url: sourceUrlFor(n.sourceUrl, fallbackUrl),
    payload: { title, body: cut(n.body, 4_000) || title, link: n.link && n.link.length <= 500 ? n.link : null, post_date: dayOf(n.publishedMs) },
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The one-line status for the owner's dashboard and the public log. Fixed phrases and numbers only. */
export function statusLine(eventCount, postCount, acc) {
  const found = [];
  if (eventCount) found.push(plural(eventCount, "event", "events"));
  if (postCount) found.push(plural(postCount, "post", "posts"));
  const head = found.length ? `${found.join(" and ")} found` : "no upcoming events or recent posts found";
  const notes = [];
  if (acc.skippedNoTime) notes.push(`${acc.skippedNoTime} without a start time`);
  if (acc.skippedUnsupported) notes.push(`${acc.skippedUnsupported} could not be read exactly`);
  if (acc.skippedPrivate) notes.push(`${acc.skippedPrivate} private left out`);
  if (acc.refusedComments) notes.push(STATUS.commentFeed);
  if (acc.partial) notes.push("larger than 1 MB, read in part");
  if (acc.feedProblem && !eventCount && !postCount) notes.push(`a linked feed: ${acc.feedProblem}`);
  return (notes.length ? `${head} (${notes.join("; ")})` : head).slice(0, 190);
}

/**
 * @param {{ source_id: string, kind: string, url: string }} source
 * @param {{ fetcher: { get: Function }, nowMs: number }} ctx
 * @returns {Promise<{ items: SuggestionItem[], status: string, events: number, posts: number, outcome: "read" | "failed" | "skipped" }>}
 */
export async function readSource(source, ctx) {
  const done = (items, status, outcome) => ({
    items,
    status: String(status).slice(0, 190),
    events: items.filter((i) => i.kind === "event").length,
    posts: items.filter((i) => i.kind === "news").length,
    outcome,
  });
  try {
    if (!READABLE_KINDS.has(source.kind)) return done([], STATUS.notReadable, "skipped");
    if (source.kind === "youtube" || isYoutubeHost(source.url)) return done([], STATUS.youtube, "skipped");

    const acc = newAccumulator();
    const page = await ctx.fetcher.get(source.url, { accept: PAGE_ACCEPT });
    if (!page.ok) return done([], page.reason, "failed");
    if (classify(page.text) === "feed" && isCommentFeed(new URL(page.url))) return done([], STATUS.commentFeed, "skipped");

    if (addDocument(acc, page, ctx.nowMs) === "html") {
      const scan = scanHtml(page.text);
      addJsonLd(acc, scan.jsonld, page.url, ctx.nowMs);
      for (const feed of discoverFeeds(scan, page.url, LIMITS.maxFeeds)) {
        const f = await ctx.fetcher.get(feed.url, { accept: FEED_ACCEPT });
        if (!f.ok) {
          acc.feedProblem ??= f.reason;
          continue;
        }
        addDocument(acc, f, ctx.nowMs);
      }
    }

    // One item per event (same title, same South African day) even if a page and its calendar both list it.
    const seen = new Set();
    const events = acc.events
      .sort((a, b) => a.startMs - b.startMs)
      .filter((e) => {
        const key = `${normKey(e.title)}|${dayOf(e.startMs)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const seenNews = new Set();
    const news = acc.news
      .sort((a, b) => b.publishedMs - a.publishedMs)
      .filter((n) => {
        const key = n.link ?? normKey(n.title);
        if (seenNews.has(key)) return false;
        seenNews.add(key);
        return true;
      });

    const newsItems = news.map((n) => newsItem(n, source.url)).filter(Boolean);
    const eventItems = events.map((e) => eventItem(e, source.url)).filter(Boolean).slice(0, LIMITS.maxItems - Math.min(newsItems.length, LIMITS.reservedForNews));
    const items = [...eventItems, ...newsItems.slice(0, LIMITS.maxItems - eventItems.length)];
    const postCount = items.length - eventItems.length;
    return done(items, statusLine(eventItems.length, postCount, acc), "read");
  } catch {
    return done([], STATUS.unreadable, "failed");
  }
}
