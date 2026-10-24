// Read ONE listing source and turn what it publishes into suggestion items.
//
// In order, and nothing else (no language model, no guessing at free text):
//   (a) schema.org Event in the page's JSON-LD;
//   (b) the calendar and feeds the page itself advertises with <link rel="alternate">
//       (iCalendar gives events, RSS or Atom gives news), from the owner's own site only;
//   (c) for a YouTube source, the channel's public video feed (news).
// A calendar or feed address given directly as the source is read the same way.
//
// The output uses exactly the payload shapes of src/lib/automation/suggestions.ts and the server
// re-validates every item, so this module only has to be correct and conservative, not the last
// line of defence.

import { channelIdFromPath, discoverFeeds, scanHtml, youtubeChannelIdFromPage } from "./html.mjs";
import { eventsFromJsonLd } from "./jsonld.mjs";
import { parseIcs } from "./ics.mjs";
import { parseFeed, sniffFeed } from "./feed.mjs";
import { multiLine, normKey, oneLine, scrubPersonalContact } from "./text.mjs";
import { utcToZoned } from "./time.mjs";

export const LIMITS = {
  /** At most this many items per source per run. */
  maxItems: 20,
  /** Always leave room for this many posts, so a busy calendar cannot crowd every post out. */
  reservedForNews: 5,
  /** A post older than this is not news. */
  newsDays: 14,
  /** A repeating event is expanded this far ahead, and at most this many times. */
  recurringDays: 28,
  maxPerSeries: 4,
  /** A single event further ahead than this is ignored. */
  singleDays: 365,
};

/** Kinds the Reader reads. Facebook, Instagram and TikTok are never read. */
export const READABLE_KINDS = new Set(["website", "youtube", "calendar"]);

const DAY_MS = 86_400_000;
const PAGE_ACCEPT = "text/html,application/xhtml+xml,text/calendar,application/rss+xml,application/atom+xml,application/xml;q=0.8,*/*;q=0.5";
const FEED_ACCEPT = "text/calendar,application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5";
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
/** What robots.txt is asked about before a YouTube channel page is fetched (the id is a placeholder). */
const YOUTUBE_FEED_PROBE = "https://www.youtube.com/feeds/videos.xml?channel_id=UC0000000000000000000000";

function newAccumulator() {
  return { events: [], news: [], skippedNoTime: 0, skippedUnsupported: 0, cancelled: 0, feedProblem: null };
}

/** What kind of document is this? */
function classify(r) {
  const t = r.text.replace(/^﻿/, "").trimStart();
  if (/^BEGIN:VCALENDAR/i.test(t.slice(0, 15))) return "ics";
  if (sniffFeed(t)) return "feed";
  return "html";
}

function addIcs(acc, text, url, nowMs) {
  const r = parseIcs(text, { nowMs, recurringDays: LIMITS.recurringDays, singleDays: LIMITS.singleDays, maxPerSeries: LIMITS.maxPerSeries });
  for (const e of r.events) acc.events.push({ ...e, sourceUrl: url });
  acc.skippedNoTime += r.skippedNoTime;
  acc.skippedUnsupported += r.skippedUnsupported;
  acc.cancelled += r.cancelled;
}

function addFeed(acc, text, url, nowMs) {
  const { items } = parseFeed(text, url);
  for (const item of items) {
    if (item.publishedMs === null) continue; // no date, no way to say it is recent
    if (item.publishedMs > nowMs + DAY_MS || item.publishedMs < nowMs - LIMITS.newsDays * DAY_MS) continue;
    acc.news.push({ ...item, sourceUrl: url });
  }
}

function addJsonLd(acc, blocks, url, nowMs) {
  const r = eventsFromJsonLd(blocks, url);
  for (const e of r.events) {
    if (e.startMs > nowMs && e.startMs <= nowMs + LIMITS.singleDays * DAY_MS) acc.events.push({ ...e, sourceUrl: url });
  }
  acc.skippedNoTime += r.skippedNoTime;
  acc.cancelled += r.cancelled;
}

/** Read one document at `url` (a page, a calendar or a feed) into `acc`. Returns a failure reason or null. */
async function readDocument(url, ctx, acc, { followFeeds }) {
  const r = await ctx.fetcher.get(url, { accept: PAGE_ACCEPT });
  if (!r.ok) return r.reason;
  const kind = classify(r);
  if (kind === "ics") {
    addIcs(acc, r.text, r.url, ctx.nowMs);
    return null;
  }
  if (kind === "feed") {
    addFeed(acc, r.text, r.url, ctx.nowMs);
    return null;
  }
  const scan = scanHtml(r.text);
  addJsonLd(acc, scan.jsonld, r.url, ctx.nowMs);
  if (followFeeds) {
    for (const feed of discoverFeeds(scan, r.url)) {
      const f = await ctx.fetcher.get(feed.url, { accept: FEED_ACCEPT });
      if (!f.ok) {
        acc.feedProblem ??= f.reason;
        continue;
      }
      const fk = classify(f);
      if (fk === "ics") addIcs(acc, f.text, f.url, ctx.nowMs);
      else if (fk === "feed") addFeed(acc, f.text, f.url, ctx.nowMs);
    }
  }
  return null;
}

async function readYoutube(source, ctx, acc) {
  let u;
  try {
    u = new URL(source.url);
  } catch {
    return "not a YouTube address";
  }
  if (u.protocol !== "https:" || !YOUTUBE_HOSTS.has(u.hostname.toLowerCase())) return "not a YouTube address";

  // Ask robots.txt about the feed first: if it is disallowed there is no point fetching the channel page.
  const allowed = await ctx.fetcher.robotsAllows(YOUTUBE_FEED_PROBE);
  if (!allowed.ok) return allowed.reason;

  let id = channelIdFromPath(source.url);
  if (!id) {
    const page = await ctx.fetcher.get(source.url, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" });
    if (!page.ok) return page.reason;
    id = youtubeChannelIdFromPage(scanHtml(page.text));
    if (!id) return "channel not found";
  }
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
  const feed = await ctx.fetcher.get(feedUrl, { accept: FEED_ACCEPT });
  if (!feed.ok) return feed.reason;
  addFeed(acc, feed.text, feed.url, ctx.nowMs);
  return null;
}

// ── mapping to the server's payload shapes ──────────────────────────────────

const sastDay = (ms) => {
  const z = utcToZoned(ms);
  return `${z.y}-${String(z.mo).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
};

function clean(text, max, { multi = false } = {}) {
  const shaped = multi ? multiLine(text, max) : oneLine(text, max);
  return scrubPersonalContact(shaped);
}

function eventItem(e, fallbackUrl) {
  const title = clean(e.title, 120);
  if (title.length < 3) return null;
  return {
    kind: "event",
    source_url: e.sourceUrl.length <= 500 ? e.sourceUrl : fallbackUrl,
    payload: {
      title,
      description: clean(e.description, 2000, { multi: true }),
      start: new Date(e.startMs).toISOString(),
      end: e.endMs ? new Date(e.endMs).toISOString() : null,
      location: clean(e.location, 300),
      website_url: e.url,
    },
  };
}

function newsItem(n, fallbackUrl) {
  const title = clean(n.title, 120);
  if (title.length < 3) return null;
  const body = clean(n.body, 4000, { multi: true }) || title;
  return {
    kind: "news",
    source_url: n.sourceUrl.length <= 500 ? n.sourceUrl : fallbackUrl,
    payload: { title, body, link: n.link, post_date: sastDay(n.publishedMs) },
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @param {{ source_id:string, kind:string, url:string }} source
 * @param {{ fetcher: { get: Function, robotsAllows: Function }, nowMs: number }} ctx
 * @returns {Promise<{ items: { kind: string, source_url: string, payload: Record<string, any> }[], status: string, events: number, posts: number }>}
 */
export async function readSource(source, ctx) {
  const done = (items, status) => ({
    items,
    status: status.slice(0, 190),
    events: items.filter((i) => i.kind === "event").length,
    posts: items.filter((i) => i.kind === "news").length,
  });
  try {
    if (!READABLE_KINDS.has(source.kind)) return done([], "not readable");

    const acc = newAccumulator();
    const failure = source.kind === "youtube" ? await readYoutube(source, ctx, acc) : await readDocument(source.url, ctx, acc, { followFeeds: true });
    if (failure) return done([], failure);

    // One item per event (same title, same day) even if a page and its calendar both list it.
    const seen = new Set();
    const events = acc.events
      .sort((a, b) => a.startMs - b.startMs)
      .filter((e) => {
        const key = `${normKey(e.title)}|${sastDay(e.startMs)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const news = [];
    const seenNews = new Set();
    for (const n of acc.news.sort((a, b) => b.publishedMs - a.publishedMs)) {
      const key = n.link ?? normKey(n.title);
      if (seenNews.has(key)) continue;
      seenNews.add(key);
      news.push(n);
    }

    const newsRoom = Math.min(news.length, LIMITS.reservedForNews);
    const eventItems = events.map((e) => eventItem(e, source.url)).filter(Boolean).slice(0, LIMITS.maxItems - newsRoom);
    const newsItems = news.map((n) => newsItem(n, source.url)).filter(Boolean).slice(0, LIMITS.maxItems - eventItems.length);
    const items = [...eventItems, ...newsItems];

    const notes = [];
    if (acc.skippedNoTime) notes.push(`${plural(acc.skippedNoTime, "event", "events")} without a start time skipped`);
    if (acc.skippedUnsupported) notes.push(`${plural(acc.skippedUnsupported, "event", "events")} skipped, could not be read exactly`);
    if (!items.length && acc.feedProblem) notes.push(`a linked feed: ${acc.feedProblem}`);

    const found = [];
    if (eventItems.length) found.push(plural(eventItems.length, "event", "events"));
    if (newsItems.length) found.push(plural(newsItems.length, source.kind === "youtube" ? "video" : "post", source.kind === "youtube" ? "videos" : "posts"));
    const head = found.length ? found.join(", ") : source.kind === "youtube" ? "no new videos found" : "no events found";
    return done(items, notes.length ? `${head} (${notes.join("; ")})` : head);
  } catch {
    return done([], "could not be read");
  }
}
