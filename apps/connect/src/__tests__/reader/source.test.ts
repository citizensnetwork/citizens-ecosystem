import { describe, it, expect } from "vitest";
import { validateSuggestion } from "@/lib/automation/suggestions";
import { LIMITS, readSource } from "../../../scripts/reader/source.mjs";
import { NOW_MS, fakeFetcher, fixture } from "./helpers";

const SITE = "https://www.hope-fellowship.example/";
const ctx = (fetcher: ReturnType<typeof fakeFetcher>) => ({ fetcher, nowMs: NOW_MS });
const src = (kind: string, url: string) => ({
  source_id: "11111111-1111-4111-8111-111111111111",
  kind,
  url,
});

type Item = { kind: string; source_url: string; payload: Record<string, unknown> };

/** Every item the Reader produces must be one the SERVER accepts: that is the contract. */
function expectServerAccepts(items: Item[]) {
  for (const item of items) {
    const checked = validateSuggestion(item.kind, item.payload, item.source_url, new Date(NOW_MS));
    expect(checked.ok, JSON.stringify(item)).toBe(true);
    if (checked.ok) expect(checked.warnings, JSON.stringify(item)).toEqual([]);
  }
}

const website = {
  [SITE]: { text: fixture("church-page.html") },
  "https://www.hope-fellowship.example/events.ics": {
    text: fixture("events.ics"),
    contentType: "text/calendar",
  },
  "https://www.hope-fellowship.example/feed/": {
    text: fixture("blog.rss.xml"),
    contentType: "application/rss+xml",
  },
};

describe("readSource: a website", () => {
  it("combines JSON-LD events, the advertised calendar and the advertised feed, and the server accepts all of it", async () => {
    const f = fakeFetcher(website);
    const r = await readSource(src("website", SITE), ctx(f));
    const events = r.items.filter((i: Item) => i.kind === "event").map((i: Item) => i.payload.title);
    expect(events).toEqual([
      "Sunday Service, all welcome", // 25 Oct
      "First Saturday Prayer", // 7 Nov, 08:00 SAST
      "Family Fun Day & Braai", // 7 Nov, 10:00 SAST
      "Sunday Service, all welcome", // 8 Nov
      "Night of Worship", // 14 Nov
      "Sunday Service, all welcome", // 15 Nov
      "Leaders Conference", // 20 Nov
    ]);
    expect(r.items.filter((i: Item) => i.kind === "news").map((i: Item) => i.payload.title)).toEqual([
      "Insecure link",
      "Food parcels this month & how to help",
      "Escaped description",
    ]);
    expect(r.events).toBe(7);
    expect(r.posts).toBe(3);
    expect(r.status).toBe("7 events, 3 posts (2 events without a start time skipped; 2 events skipped, could not be read exactly)");
    expectServerAccepts(r.items);
    // It asked for exactly the page and the two feeds the page advertised on its own site.
    expect(f.calls).toEqual([SITE, "https://www.hope-fellowship.example/events.ics", "https://www.hope-fellowship.example/feed/"]);
  });

  it("maps to the exact payload shape: no category, an ISO start, scrubbed contact details, https links only", async () => {
    const r = await readSource(src("website", SITE), ctx(fakeFetcher(website)));
    const fun = r.items.find((i: Item) => i.payload.title === "Family Fun Day & Braai")!;
    expect(fun).toEqual({
      kind: "event",
      source_url: SITE,
      payload: {
        title: "Family Fun Day & Braai",
        description: "Bring the whole family.\n\nCall [removed] or mail [removed] to book.",
        start: "2026-11-07T08:00:00.000Z",
        end: "2026-11-07T12:00:00.000Z",
        location: "Hope Hall, 12 Example Road, Pretoria",
        website_url: "https://www.hope-fellowship.example/events/family-fun-day",
      },
    });
    const post = r.items.find((i: Item) => i.payload.title === "Food parcels this month & how to help")!;
    expect(post).toEqual({
      kind: "news",
      source_url: "https://www.hope-fellowship.example/feed/",
      payload: {
        title: "Food parcels this month & how to help",
        body: "We packed 120 parcels. Questions? Call [removed].",
        link: "https://www.hope-fellowship.example/news/food-parcels",
        post_date: "2026-10-20",
      },
    });
    const insecure = r.items.find((i: Item) => i.payload.title === "Insecure link")!;
    expect(insecure.payload.link).toBeNull();
    expect(JSON.stringify(r.items)).not.toMatch(/012 345 6789|info@hope-fellowship/);
  });

  it("includes only FUTURE events and RECENT posts: nothing from last month, last year or without a date", async () => {
    const r = await readSource(src("website", SITE), ctx(fakeFetcher(website)));
    const titles = r.items.map((i: Item) => i.payload.title);
    for (const t of [
      "Last Month's Thing",
      "Already Happened",
      "Old news from last year",
      "No date at all",
      "Cancelled Outing",
      "Cancelled Social",
      "All Day Retreat",
      "Fake Inside Script",
    ]) {
      expect(titles).not.toContain(t);
    }
    for (const i of r.items.filter((x: Item) => x.kind === "event")) expect(Date.parse(i.payload.start as string)).toBeGreaterThan(NOW_MS);
  });

  it("lists an event once when the page and its calendar both carry it", async () => {
    const dupIcs = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nSUMMARY:Family fun day & braai!\nDTSTART:20261107T080000Z\nEND:VEVENT\nEND:VCALENDAR\n";
    const r = await readSource(
      src("website", SITE),
      ctx(
        fakeFetcher({
          ...website,
          "https://www.hope-fellowship.example/events.ics": {
            text: dupIcs,
            contentType: "text/calendar",
          },
        }),
      ),
    );
    expect(r.items.filter((i: Item) => /family fun day/i.test(String(i.payload.title)))).toHaveLength(1);
  });

  it("reports a clear status when the page has nothing, and mentions a feed that could not be read", async () => {
    const page = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed/"></head><body>Nothing here</body></html>`;
    const f = fakeFetcher({ [SITE]: { text: page } }); // /feed/ is a 404
    const r = await readSource(src("website", SITE), ctx(f));
    expect(r.items).toEqual([]);
    expect(r.status).toBe("no events found (a linked feed: HTTP 404)");
    const plain = await readSource(src("website", SITE), ctx(fakeFetcher({ [SITE]: { text: "<html><body>hello</body></html>" } })));
    expect(plain.status).toBe("no events found");
  });

  it("returns the failure reason as the status when the page cannot be fetched, and never throws", async () => {
    expect((await readSource(src("website", SITE), ctx(fakeFetcher({ [SITE]: { reason: "blocked by robots.txt" } })))).status).toBe(
      "blocked by robots.txt",
    );
    expect((await readSource(src("website", SITE), ctx(fakeFetcher({})))).status).toBe("HTTP 404");
    const exploding = {
      get: () => Promise.reject(new Error("boom")),
      robotsAllows: () => Promise.reject(new Error("boom")),
    };
    const r = await readSource(src("website", SITE), {
      fetcher: exploding as never,
      nowMs: NOW_MS,
    });
    expect(r).toMatchObject({ items: [], status: "could not be read" });
  });

  it("keeps room for posts when a calendar is busy, and never exceeds 20 items", async () => {
    const events = Array.from(
      { length: 40 },
      (_, i) => `BEGIN:VEVENT\nUID:e${i}\nSUMMARY:Gathering number ${i + 1}\nDTSTART:2026110${(i % 9) + 1}T0${(i % 8) + 1}0000Z\nEND:VEVENT`,
    ).join("\n");
    const ics = `BEGIN:VCALENDAR\n${events}\nEND:VCALENDAR\n`;
    const items = Array.from(
      { length: 8 },
      (_, i) =>
        `<item><title>Post ${i + 1}</title><link>https://www.hope-fellowship.example/p/${i + 1}</link><pubDate>Tue, 20 Oct 2026 0${i}:00:00 +0200</pubDate><description>Body ${i + 1}</description></item>`,
    ).join("");
    const rss = `<rss><channel>${items}</channel></rss>`;
    const page = `<html><head><link rel="alternate" type="text/calendar" href="/c.ics"><link rel="alternate" type="application/rss+xml" href="/f.xml"></head></html>`;
    const r = await readSource(
      src("website", SITE),
      ctx(
        fakeFetcher({
          [SITE]: { text: page },
          "https://www.hope-fellowship.example/c.ics": { text: ics },
          "https://www.hope-fellowship.example/f.xml": { text: rss },
        }),
      ),
    );
    expect(r.items).toHaveLength(LIMITS.maxItems);
    expect(r.posts).toBe(LIMITS.reservedForNews);
    expect(r.events).toBe(LIMITS.maxItems - LIMITS.reservedForNews);
    expectServerAccepts(r.items);
  });
});

describe("readSource: a calendar given directly, or a feed given as a website", () => {
  it("reads an iCalendar address", async () => {
    const url = "https://calendar.hope-fellowship.example/events.ics";
    const r = await readSource(src("calendar", url), ctx(fakeFetcher({ [url]: { text: fixture("events.ics"), contentType: "text/calendar" } })));
    expect(r.events).toBe(5);
    expect(r.items[0]!.source_url).toBe(url);
    expectServerAccepts(r.items);
  });
  it("recognises a feed by its content even when it is listed as a website", async () => {
    const url = "https://www.hope-fellowship.example/feed/";
    const r = await readSource(src("website", url), ctx(fakeFetcher({ [url]: { text: fixture("blog.rss.xml"), contentType: "text/xml" } })));
    expect(r.posts).toBe(3);
    expect(r.status).toBe("3 posts");
  });
});

describe("readSource: YouTube", () => {
  const handle = "https://www.youtube.com/@hopefellowship";
  const feed = "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv";

  it("resolves an @handle to its channel id from the page's own metadata, then reads the public feed", async () => {
    const f = fakeFetcher({
      [handle]: { text: fixture("channel-page.html") },
      [feed]: { text: fixture("channel.atom.xml"), contentType: "application/atom+xml" },
    });
    const r = await readSource(src("youtube", handle), ctx(f));
    expect(f.calls).toEqual([handle, feed]);
    expect(r.items).toHaveLength(1); // the 2 Oct video is older than 14 days
    expect(r.items[0]).toEqual({
      kind: "news",
      source_url: feed,
      payload: {
        title: "Sunday message: Hope in hard seasons",
        body: "A short talk on holding on. Notes at https://www.hope-fellowship.example/notes",
        link: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
        post_date: "2026-10-18",
      },
    });
    expect(r.status).toBe("1 video");
    expectServerAccepts(r.items);
  });

  it("goes straight to the feed for a /channel/UC... address", async () => {
    const url = "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv";
    const f = fakeFetcher({ [feed]: { text: fixture("channel.atom.xml") } });
    const r = await readSource(src("youtube", url), ctx(f));
    expect(f.calls).toEqual([feed]);
    expect(r.posts).toBe(1);
  });

  it("uses the title when a video has no description", async () => {
    const atom = fixture("channel.atom.xml").replace("2026-10-02T09:30:00+00:00", "2026-10-19T09:30:00+00:00");
    const r = await readSource(
      src("youtube", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"),
      ctx(fakeFetcher({ [feed]: { text: atom } })),
    );
    const worship = r.items.find((i: Item) => i.payload.title === "Worship set")!;
    expect(worship.payload.body).toBe("Worship set");
  });

  it("honours robots.txt for the feed BEFORE fetching anything (YouTube disallows /feeds/videos.xml today)", async () => {
    const f = fakeFetcher({ [handle]: { text: fixture("channel-page.html") } }, { blocked: ["/feeds/videos.xml"] });
    const r = await readSource(src("youtube", handle), ctx(f));
    expect(r).toMatchObject({ items: [], status: "blocked by robots.txt" });
    expect(f.calls).toEqual([]); // not even the channel page
  });

  it("says so when the page names no channel, and refuses a non-YouTube address", async () => {
    const bare = fakeFetcher({ [handle]: { text: "<html><body>no metadata</body></html>" } });
    expect((await readSource(src("youtube", handle), ctx(bare))).status).toBe("channel not found");
    const other = fakeFetcher({});
    for (const url of [
      "https://www.youtube.com.evil.example/@x",
      "https://evil.example/www.youtube.com/@x",
      "http://www.youtube.com/@x",
      "not a url",
    ]) {
      expect((await readSource(src("youtube", url), ctx(other))).status, url).toBe("not a YouTube address");
    }
    expect(other.calls).toEqual([]);
  });
});

describe("readSource: platforms the Reader never reads", () => {
  it("does not fetch Facebook, Instagram or TikTok sources, whatever the address", async () => {
    const f = fakeFetcher({});
    for (const kind of ["facebook", "instagram", "tiktok", "twitter", ""]) {
      const r = await readSource(src(kind, "https://www.facebook.com/example"), ctx(f));
      expect(r).toMatchObject({ items: [], status: "not readable" });
    }
    expect(f.calls).toEqual([]);
    expect(f.probes).toEqual([]);
  });
});
