import { describe, it, expect } from "vitest";
import { LIMITS, STATUS, classify, readSource, statusLine } from "../../../scripts/reader/source.mjs";
import { REASONS } from "../../../scripts/reader/net.mjs";
import { validateSuggestion } from "@/lib/automation/suggestions";
import { NOW, fakeFetcher, fixture } from "./helpers";

const PAGE = "https://www.church.example.org/events/";
const FEED = "https://www.church.example.org/feed/";
const ICS = "https://www.church.example.org/events.ics";
const src = (over: Record<string, string> = {}) => ({ source_id: "00000000-0000-4000-8000-000000000001", kind: "website", url: PAGE, ...over });
const ctx = (pages: Parameters<typeof fakeFetcher>[0]) => {
  const fetcher = fakeFetcher(pages);
  return { fetcher, nowMs: NOW };
};
const PII_WARNING = "Phone numbers or email addresses were removed from the text.";

describe("readSource: a website with JSON-LD, a feed and a calendar", () => {
  const pages = { [PAGE]: fixture("church-page.html"), [FEED]: fixture("blog.rss.xml"), [ICS]: fixture("events.ics") };

  it("reads only the page and the feeds it advertises (never the comment feed, an http feed, or links in scripts and comments)", async () => {
    const c = ctx(pages);
    await readSource(src(), c);
    expect(c.fetcher.requested).toEqual([PAGE, FEED, ICS]);
  });

  it("finds the upcoming events (oldest first) and the recent posts (newest first)", async () => {
    const r = await readSource(src(), ctx(pages));
    expect(r.outcome).toBe("read");
    const events = r.items.filter((i) => i.kind === "event").map((i) => [i.payload.title, i.payload.start]);
    expect(events).toEqual([
      ["Sunday Service (Communion)", "2026-11-01T08:00:00.000Z"],
      ["Youth Camp Info Evening", "2026-11-05T16:00:00.000Z"],
      ["Sunday Celebration & Worship", "2026-11-08T07:00:00.000Z"],
      ["Worship Night", "2026-11-14T16:30:00.000Z"],
    ]);
    const posts = r.items.filter((i) => i.kind === "news").map((i) => [i.payload.title, i.payload.post_date, i.payload.link]);
    expect(posts).toEqual([
      ["A post with a bad link", "2026-10-31", null],
      ["Food parcels for 40 families", "2026-10-30", "https://www.church.example.org/news/food-parcels"],
      ["Choir rehearsal moves to Thursdays", "2026-10-28", "https://www.church.example.org/news/choir"],
    ]);
    expect(r).toMatchObject({ events: 4, posts: 3 });
    expect(r.status).toBe("4 events and 3 posts found (2 without a start time; 1 could not be read exactly; 1 private left out)");
  });

  it("every item is exactly the shape the server accepts: validateSuggestion passes with no warning but the PII scrub", async () => {
    const r = await readSource(src(), ctx(pages));
    expect(r.items.length).toBeGreaterThan(0);
    for (const item of r.items) {
      const checked = validateSuggestion(item.kind, item.payload, item.source_url, new Date(NOW));
      expect(checked.ok, JSON.stringify(item)).toBe(true);
      if (checked.ok) expect(checked.warnings.filter((w) => w !== PII_WARNING), item.payload.title).toEqual([]);
      expect(Object.keys(item).sort()).toEqual(["kind", "payload", "source_url"]);
      expect(item.payload).not.toHaveProperty("image_url");
    }
    const celebration = r.items.find((i) => i.payload.title === "Sunday Celebration & Worship")!;
    expect(celebration.source_url).toBe(PAGE);
    expect(celebration.payload).toMatchObject({ location: "Grace Hall, 12 Example Street, Pretoria", end: "2026-11-08T08:30:00.000Z" });
    const communion = r.items.find((i) => i.payload.title === "Sunday Service (Communion)")!;
    expect(communion.source_url).toBe(ICS);
  });

  it("an event listed on the page and in its calendar on the same day is one item", async () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:w\nSUMMARY:WORSHIP night!\nDTSTART:20261114T163000Z\nEND:VEVENT\nEND:VCALENDAR";
    const r = await readSource(src(), ctx({ ...pages, [ICS]: ics }));
    expect(r.items.filter((i) => /worship night/i.test(i.payload.title))).toHaveLength(1);
  });
});

describe("readSource: what it will not read", () => {
  it("a YouTube source, or a website source that points at YouTube, is not fetched at all", async () => {
    for (const s of [src({ kind: "youtube", url: "https://www.youtube.com/@GraceFellowshipExample" }), src({ url: "https://youtu.be/abc" })]) {
      const c = ctx({});
      expect(await readSource(s, c)).toEqual({ items: [], status: STATUS.youtube, events: 0, posts: 0, outcome: "skipped" });
      expect(c.fetcher.requested).toEqual([]);
    }
  });
  it("an unreadable kind is skipped without a request", async () => {
    const c = ctx({});
    expect((await readSource(src({ kind: "facebook", url: "https://www.facebook.com/x" }), c)).status).toBe(STATUS.notReadable);
    expect(c.fetcher.requested).toEqual([]);
  });
  it("a comment feed given directly is not read", async () => {
    const url = "https://www.church.example.org/comments/feed/";
    expect((await readSource(src({ url }), ctx({ [url]: fixture("blog.rss.xml") }))).status).toBe(STATUS.commentFeed);
  });
  it("a fetch failure becomes the status line, with no items", async () => {
    const r = await readSource(src(), ctx({ [PAGE]: { ok: false, reason: REASONS.robotsBlocked } }));
    expect(r).toEqual({ items: [], status: REASONS.robotsBlocked, events: 0, posts: 0, outcome: "failed" });
  });
  it("never throws, even if the fetcher does", async () => {
    const r = await readSource(src(), { fetcher: { get: async () => { throw new Error("https://www.church.example.org/ secret detail"); } }, nowMs: NOW });
    expect(r).toEqual({ items: [], status: STATUS.unreadable, events: 0, posts: 0, outcome: "failed" });
  });
});

describe("readSource: calendars and feeds given directly", () => {
  it("a calendar source (.ics)", async () => {
    const r = await readSource(src({ kind: "calendar", url: ICS }), ctx({ [ICS]: fixture("events.ics") }));
    expect(r.items.map((i) => i.payload.title)).toEqual(["Sunday Service (Communion)", "Youth Camp Info Evening"]);
  });
  it("an Atom feed", async () => {
    const url = "https://news.example.org/feed.atom";
    const r = await readSource(src({ url }), ctx({ [url]: fixture("news.atom.xml") }));
    expect(r.items.map((i) => i.payload.title)).toEqual(["Outreach update", "Second entry"]);
  });
  it("a linked feed that fails is noted when nothing else was found", async () => {
    const page = '<link rel="alternate" type="application/rss+xml" href="/feed/">';
    const r = await readSource(src(), ctx({ [PAGE]: page, [FEED]: { ok: false, reason: REASONS.timeout } }));
    expect(r.status).toBe(`no upcoming events or recent posts found (a linked feed: ${REASONS.timeout})`);
  });
  it("classifies by content, not by the type a server claims", () => {
    expect(classify("\ufeffBEGIN:VCALENDAR\r\n")).toBe("ics");
    expect(classify("<?xml version='1.0'?><rss>")).toBe("feed");
    expect(classify("<!doctype html>")).toBe("html");
  });
});

describe("readSource: limits", () => {
  it(`at most ${LIMITS.maxItems} items, with room kept for ${LIMITS.reservedForNews} posts`, async () => {
    const events = Array.from({ length: 30 }, (_, i) => ({ "@type": "Event", name: `Event number ${i}`, startDate: new Date(NOW + (i + 1) * 86_400_000).toISOString() }));
    const items = Array.from({ length: 10 }, (_, i) => `<item><title>Post number ${i}</title><link>https://www.church.example.org/p/${i}</link><pubDate>${new Date(NOW - (i + 1) * 3_600_000).toUTCString()}</pubDate><description>Body ${i}</description></item>`).join("");
    const page = `<script type="application/ld+json">${JSON.stringify(events)}</script><link rel="alternate" type="application/rss+xml" href="/feed/">`;
    const r = await readSource(src(), ctx({ [PAGE]: page, [FEED]: `<rss><channel>${items}</channel></rss>` }));
    expect(r.items).toHaveLength(LIMITS.maxItems);
    expect(r).toMatchObject({ events: LIMITS.maxItems - LIMITS.reservedForNews, posts: LIMITS.reservedForNews });
  });
  it("status lines are fixed phrases with numbers: short, and free of anything a page said", async () => {
    const hostile = '<script type="application/ld+json">{"@type":"Event","name":"| `x` <b>","startDate":"2026-11-09T10:00:00Z"}</script>';
    const r = await readSource(src(), ctx({ [PAGE]: hostile }));
    expect(r.status).toBe("1 event found");
    const long = statusLine(1, 1, { skippedNoTime: 99999, skippedUnsupported: 99999, skippedPrivate: 99999, refusedComments: true, partial: true, feedProblem: null });
    expect(long.length).toBeLessThanOrEqual(190);
  });
});
