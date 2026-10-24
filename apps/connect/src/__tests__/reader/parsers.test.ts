import { describe, it, expect } from "vitest";
import { channelIdFromPath, discoverFeeds, parseAttributes, sameSite, scanHtml, youtubeChannelIdFromPage } from "../../../scripts/reader/html.mjs";
import { eventsFromJsonLd } from "../../../scripts/reader/jsonld.mjs";
import { expandRule, parseContentLine, parseIcs, unescapeText, unfold } from "../../../scripts/reader/ics.mjs";
import { parseFeed, sniffFeed } from "../../../scripts/reader/feed.mjs";
import { isAllowed, parseRobots, patternMatches } from "../../../scripts/reader/robots.mjs";
import { NOW_MS, fixture } from "./helpers";

const PAGE = "https://www.hope-fellowship.example/";
const iso = (ms: number) => new Date(ms).toISOString();

describe("scanHtml", () => {
  const scan = scanHtml(fixture("church-page.html"));

  it("finds links, the base address and the JSON-LD blocks, and ignores commented-out and in-script markup", () => {
    expect(scan.base).toBe("https://www.hope-fellowship.example/");
    expect(scan.links.map((l) => l.href)).toContain("/events.ics");
    expect(scan.links.map((l) => l.href)).not.toContain("/commented-out.ics");
    expect(scan.jsonld).toHaveLength(2); // the real one and the broken one, not the one inside a script string
    expect(scan.jsonld.join("")).not.toContain("Fake Inside Script");
  });

  it("is total: junk, truncated and hostile input never throws", () => {
    for (const html of [
      "",
      "<",
      "<link",
      "<link rel=",
      '<script type="application/ld+json">',
      "<!--",
      "\u0000\u0001<<<>>>",
      "<meta ".repeat(10_000),
    ]) {
      expect(() => scanHtml(html), html.slice(0, 20)).not.toThrow();
    }
    expect(() => scanHtml(undefined as unknown as string)).not.toThrow();
  });

  it("parses quoted, unquoted and entity-encoded attributes", () => {
    expect(parseAttributes(` rel="alternate" type='text/calendar' href=/x.ics title="A &amp; B" disabled`)).toEqual({
      rel: "alternate",
      type: "text/calendar",
      href: "/x.ics",
      title: "A & B",
      disabled: "",
    });
  });
});

describe("discoverFeeds", () => {
  const scan = scanHtml(fixture("church-page.html"));

  it("returns the calendar first, then the feed; resolves relative links; drops comments feeds, other sites and http", () => {
    expect(discoverFeeds(scan, PAGE)).toEqual([
      { kind: "ics", url: "https://www.hope-fellowship.example/events.ics" },
      { kind: "feed", url: "https://www.hope-fellowship.example/feed/" },
    ]);
  });

  it("can be told to follow a feed on another site, and respects the maximum", () => {
    const wide = discoverFeeds(scan, PAGE, { sameSiteOnly: false });
    expect(wide.map((f) => f.url)).toContain("https://news.elsewhere.example/feed.xml");
    expect(discoverFeeds(scan, PAGE, { sameSiteOnly: false, max: 1 })).toHaveLength(1);
  });

  it("treats www and subdomains as the same site, and lookalikes as different", () => {
    expect(sameSite("https://hope-fellowship.example/", "https://www.hope-fellowship.example/")).toBe(true);
    expect(sameSite("https://calendar.hope-fellowship.example/", "https://www.hope-fellowship.example/")).toBe(true);
    expect(sameSite("https://nothope-fellowship.example/", "https://hope-fellowship.example/")).toBe(false);
    expect(sameSite("https://hope-fellowship.example.evil.example/", "https://hope-fellowship.example/")).toBe(false);
  });
});

describe("YouTube channel pages", () => {
  const scan = scanHtml(fixture("channel-page.html"));
  it("takes the channel id from the page's own metadata, never from embedded script data", () => {
    expect(youtubeChannelIdFromPage(scan)).toBe("UCabcdefghijklmnopqrstuv");
  });
  it("returns null when the metadata names no channel (even if a script mentions one)", () => {
    expect(youtubeChannelIdFromPage(scanHtml(`<script>{"channelId":"UCzzzzzzzzzzzzzzzzzzzzzz"}</script>`))).toBeNull();
  });
  it("reads /channel/UC... paths and nothing else", () => {
    expect(channelIdFromPath("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv")).toBe("UCabcdefghijklmnopqrstuv");
    expect(channelIdFromPath("/channel/UCabcdefghijklmnopqrstuv/videos")).toBe("UCabcdefghijklmnopqrstuv");
    expect(channelIdFromPath("https://www.youtube.com/@hopefellowship")).toBeNull();
    expect(channelIdFromPath("https://www.youtube.com/channel/short")).toBeNull();
  });
});

describe("eventsFromJsonLd", () => {
  const scan = scanHtml(fixture("church-page.html"));
  const r = eventsFromJsonLd(scan.jsonld, PAGE);

  it("reads Events and Event subtypes from an @graph, with the page's own fields", () => {
    expect(r.events.map((e) => e.title)).toEqual(["Family Fun Day & Braai", "Night of Worship", "Last Month's Thing"]);
    const first = r.events[0]!;
    expect(iso(first.startMs)).toBe("2026-11-07T08:00:00.000Z");
    expect(iso(first.endMs!)).toBe("2026-11-07T12:00:00.000Z");
    expect(first.location).toBe("Hope Hall, 12 Example Road, Pretoria");
    expect(first.url).toBe("https://www.hope-fellowship.example/events/family-fun-day");
    expect(first.description).toContain("Bring the whole family.");
  });
  it("reads a time with no zone as South African time", () => {
    expect(iso(r.events[1]!.startMs)).toBe("2026-11-14T16:30:00.000Z");
  });
  it("skips a cancelled event and counts it; skips a date-only event and counts it", () => {
    expect(r.cancelled).toBe(1);
    expect(r.skippedNoTime).toBe(1);
    expect(r.events.map((e) => e.title)).not.toContain("Cancelled Outing");
    expect(r.events.map((e) => e.title)).not.toContain("All Day Retreat");
  });
  it("one broken block does not hide the good one", () => {
    expect(r.events.length).toBeGreaterThan(0);
    expect(eventsFromJsonLd(["{ nope", "[1,2,3]", "null", '"text"'], PAGE).events).toEqual([]);
  });
  it("finds events on an Organization, in an ItemList, and in an array, and understands a virtual location", () => {
    const blocks = [
      JSON.stringify({
        "@type": "Organization",
        event: [
          {
            "@type": "Event",
            name: "Online Prayer",
            startDate: "2026-12-01T19:00:00+02:00",
            location: { "@type": "VirtualLocation", url: "https://x.example" },
          },
        ],
      }),
      JSON.stringify({
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            item: {
              "@type": "SocialEvent",
              name: "Games Night",
              startDate: "2026-12-02T19:00:00Z",
            },
          },
        ],
      }),
      JSON.stringify([{ "@type": ["Thing", "Event"], name: "Array Typed", startDate: "2026-12-03T19:00:00Z" }]),
    ];
    const out = eventsFromJsonLd(blocks, PAGE);
    expect(out.events.map((e) => e.title)).toEqual(["Online Prayer", "Games Night", "Array Typed"]);
    expect(out.events[0]!.location).toBe("Online");
  });
  it("tolerates comment and CDATA wrappers around the JSON", () => {
    const wrapped = `<!-- ${JSON.stringify({ "@type": "Event", name: "Wrapped", startDate: "2026-12-04T10:00:00Z" })} -->`;
    expect(eventsFromJsonLd([wrapped], PAGE).events).toHaveLength(1);
  });
  it("does not recurse forever on a deeply nested or self-similar document", () => {
    let deep: unknown = { "@type": "Event", name: "Deep", startDate: "2026-12-05T10:00:00Z" };
    for (let i = 0; i < 50; i++) deep = { "@graph": [deep] };
    expect(() => eventsFromJsonLd([JSON.stringify(deep)], PAGE)).not.toThrow();
  });
});

describe("iCalendar", () => {
  const text = fixture("events.ics");
  const r = parseIcs(text, { nowMs: NOW_MS });
  const byTitle = (t: string) => r.events.filter((e) => e.title === t);

  it("unfolds lines, splits parameters and unescapes text", () => {
    expect(unfold("SUMMARY:Leaders\r\n  Conference\r\nX:1")).toEqual(["SUMMARY:Leaders Conference", "X:1"]);
    expect(parseContentLine('DTSTART;TZID="Africa/Johannesburg";X=1:20261120T180000')).toEqual({
      name: "DTSTART",
      params: { TZID: "Africa/Johannesburg", X: "1" },
      value: "20261120T180000",
    });
    expect(parseContentLine("no colon here")).toBeNull();
    expect(unescapeText("a\\, b\\; c\\nd\\\\e")).toBe("a, b; c\nd\\e");
  });

  it("expands a weekly service from 2012 to its next occurrences at the same wall-clock time, minus the exception date", () => {
    const sundays = byTitle("Sunday Service, all welcome");
    expect(sundays.map((e) => iso(e.startMs))).toEqual(["2026-10-25T07:30:00.000Z", "2026-11-08T07:30:00.000Z", "2026-11-15T07:30:00.000Z"]);
    expect(iso(sundays[0]!.endMs!)).toBe("2026-10-25T09:00:00.000Z");
    expect(sundays[0]!.description).toContain("Children's church");
    expect(sundays[0]!.description).not.toContain("Reminder"); // the VALARM's text
    expect(sundays[0]!.location).toBe("Hope Hall, 12 Example Road, Pretoria");
    expect(sundays[0]!.url).toBe("https://www.hope-fellowship.example/sunday");
  });
  it("expands a monthly 'first Saturday' rule and applies a DURATION", () => {
    const prayer = byTitle("First Saturday Prayer");
    expect(prayer.map((e) => iso(e.startMs))).toEqual(["2026-11-07T06:00:00.000Z"]);
    expect(iso(prayer[0]!.endMs!)).toBe("2026-11-07T07:00:00.000Z");
  });
  it("reads a one-off event with a folded title", () => {
    expect(byTitle("Leaders Conference").map((e) => iso(e.startMs))).toEqual(["2026-11-20T16:00:00.000Z"]);
  });
  it("skips, and counts, all-day events, cancelled events, repeat rules it cannot expand and unknown zones", () => {
    expect(r.skippedNoTime).toBe(1);
    expect(r.cancelled).toBe(1);
    expect(r.skippedUnsupported).toBe(2); // BYSETPOS and Nowhere/Land
    const titles = r.events.map((e) => e.title);
    for (const t of ["All Day Retreat", "Cancelled Social", "Odd repeat", "Unknown zone", "Already Happened"]) expect(titles).not.toContain(t);
  });
  it("never throws on junk and returns nothing for it", () => {
    for (const junk of ["", "BEGIN:VEVENT", "BEGIN:VEVENT\nDTSTART:zzz\nEND:VEVENT", "\u0000\u0001", "BEGIN:VEVENT\n".repeat(100)]) {
      expect(() => parseIcs(junk, { nowMs: NOW_MS })).not.toThrow();
    }
    expect(parseIcs("not a calendar", { nowMs: NOW_MS }).events).toEqual([]);
  });

  describe("expandRule", () => {
    const start = {
      kind: "datetime",
      ms: Date.parse("2026-01-05T08:00:00Z"),
      local: { y: 2026, mo: 1, d: 5, h: 10, mi: 0, s: 0 },
      zone: "Africa/Johannesburg",
    };
    const limit = Date.parse("2026-12-31T00:00:00Z");
    const run = (rule: string, excluded: number[] = []) => expandRule(rule, start, Date.parse("2026-01-01T00:00:00Z"), limit, new Set(excluded));

    it("honours COUNT, INTERVAL and UNTIL", () => {
      expect(run("FREQ=DAILY;COUNT=3")!.map(iso)).toEqual(["2026-01-05T08:00:00.000Z", "2026-01-06T08:00:00.000Z", "2026-01-07T08:00:00.000Z"]);
      expect(run("FREQ=WEEKLY;INTERVAL=2;COUNT=3")!.map(iso)).toEqual([
        "2026-01-05T08:00:00.000Z",
        "2026-01-19T08:00:00.000Z",
        "2026-02-02T08:00:00.000Z",
      ]);
      expect(run("FREQ=WEEKLY;UNTIL=20260120T000000Z")!).toHaveLength(3);
      expect(run("FREQ=WEEKLY;UNTIL=20260119")!).toHaveLength(3); // a date UNTIL runs to the end of that day
    });
    it("handles BYDAY lists, last-weekday and BYMONTHDAY, skipping days a month does not have", () => {
      expect(run("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4")!.map((ms) => iso(ms).slice(0, 10))).toEqual([
        "2026-01-05",
        "2026-01-07",
        "2026-01-12",
        "2026-01-14",
      ]);
      expect(run("FREQ=MONTHLY;BYDAY=-1FR;COUNT=2")!.map((ms) => iso(ms).slice(0, 10))).toEqual(["2026-01-30", "2026-02-27"]);
      expect(run("FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3")!.map((ms) => iso(ms).slice(0, 10))).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
      expect(run("FREQ=YEARLY;COUNT=2")!.map((ms) => iso(ms).slice(0, 10))).toEqual(["2026-01-05"]); // 2027 is past the limit
    });
    it("leaves out excluded instances", () => {
      expect(run("FREQ=DAILY;COUNT=3", [Date.parse("2026-01-06T08:00:00Z")])!).toHaveLength(2);
    });
    it("returns null for rules it cannot expand exactly", () => {
      for (const rule of [
        "FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO",
        "FREQ=HOURLY",
        "FREQ=WEEKLY;BYMONTHDAY=3",
        "FREQ=YEARLY;BYDAY=MO",
        "FREQ=DAILY;COUNT=abc",
        "nonsense",
        "FREQ=DAILY;UNTIL=junk",
      ]) {
        expect(run(rule), rule).toBeNull();
      }
    });
    it("is bounded: a rule that never matches cannot hang", () => {
      const t0 = Date.now();
      expect(run("FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=30")).toEqual([]);
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });

  it("caps a repeating event at four upcoming instances so one series cannot flood the inbox", () => {
    const ics = "BEGIN:VEVENT\nUID:d1\nSUMMARY:Daily prayer\nDTSTART:20260101T060000Z\nRRULE:FREQ=DAILY\nEND:VEVENT";
    const out = parseIcs(ics, { nowMs: NOW_MS });
    expect(out.events.map((e) => iso(e.startMs).slice(0, 10))).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
  });

  it("treats a replaced instance (RECURRENCE-ID) as an override, not a duplicate", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:s1",
      "SUMMARY:Service",
      "DTSTART:20260104T073000Z",
      "RRULE:FREQ=WEEKLY;BYDAY=SU",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:s1",
      "SUMMARY:Service (special)",
      "RECURRENCE-ID:20261025T073000Z",
      "DTSTART:20261025T090000Z",
      "END:VEVENT",
    ].join("\n");
    const out = parseIcs(ics, { nowMs: NOW_MS });
    expect(out.events.map((e) => `${e.title} ${iso(e.startMs).slice(0, 16)}`)).toEqual([
      "Service 2026-11-01T07:30",
      "Service 2026-11-08T07:30",
      "Service 2026-11-15T07:30",
      "Service (special) 2026-10-25T09:00",
    ]);
  });
});

describe("feeds", () => {
  const rss = parseFeed(fixture("blog.rss.xml"), "https://www.hope-fellowship.example/feed/");
  it("reads RSS items: CDATA and escaped HTML become plain text, dates are parsed, an http link is dropped", () => {
    expect(rss.items.map((i) => i.title)).toEqual([
      "Food parcels this month & how to help",
      "Escaped description",
      "Old news from last year",
      "No date at all",
      "Insecure link",
    ]);
    expect(rss.items[0]!.body).toBe("We packed 120 parcels. Questions? Call 012 345 6789.");
    expect(rss.items[0]!.link).toBe("https://www.hope-fellowship.example/news/food-parcels");
    expect(iso(rss.items[0]!.publishedMs!)).toBe("2026-10-20T06:00:00.000Z");
    expect(rss.items[1]!.body).toBe("Thank you to everyone who came.");
    expect(rss.items[3]!.publishedMs).toBeNull();
    expect(rss.items[4]!.link).toBeNull();
  });
  it("reads an Atom/YouTube feed: alternate link, published date, media description", () => {
    const atom = parseFeed(fixture("channel.atom.xml"), "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv");
    expect(atom.items.map((i) => i.title)).toEqual(["Sunday message: Hope in hard seasons", "Worship set"]);
    expect(atom.items[0]!.link).toBe("https://www.youtube.com/watch?v=AAAAAAAAAAA");
    expect(atom.items[0]!.body).toContain("A short talk on holding on.");
    expect(iso(atom.items[0]!.publishedMs!)).toBe("2026-10-18T09:30:00.000Z");
    expect(atom.items[1]!.body).toBe("");
  });
  it("recognises a feed from its start and an HTML page as not a feed", () => {
    expect(sniffFeed(fixture("blog.rss.xml"))).toBe(true);
    expect(sniffFeed(fixture("channel.atom.xml"))).toBe(true);
    expect(sniffFeed(fixture("church-page.html"))).toBe(false);
    expect(sniffFeed("<html><body><rss-link></body></html>")).toBe(false);
  });
  it("is total on junk, and a billion-laughs document is just text", () => {
    for (const junk of ["", "<rss>", "<item><title>", "<item></item>", "\u0000", "<feed><entry><title>x"]) {
      expect(() => parseFeed(junk, "https://x.example/"), junk).not.toThrow();
    }
    const bomb = `<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><rss><channel><item><title>&b;</title><pubDate>Tue, 20 Oct 2026 08:00:00 +0200</pubDate></item></channel></rss>`;
    expect(parseFeed(bomb, "https://x.example/").items[0]!.title).toBe("&b;");
  });
});

describe("robots.txt", () => {
  const rules = (text: string) => parseRobots(text);

  it("allows everything when the file is empty or has no matching group", () => {
    expect(isAllowed(rules(""), "/anything")).toBe(true);
    expect(isAllowed(rules("User-agent: *\nDisallow:"), "/anything")).toBe(true);
    expect(isAllowed(rules("User-agent: Googlebot\nDisallow: /"), "/anything")).toBe(true);
  });
  it("uses the '*' group, and a group that names the Reader instead of it", () => {
    const text = "User-agent: *\nDisallow: /private\n\nUser-agent: CitizensConnectReader\nDisallow: /events\n";
    expect(isAllowed(rules(text), "/private/x")).toBe(true); // the named group replaces '*'
    expect(isAllowed(rules(text), "/events")).toBe(false);
    expect(isAllowed(rules("User-agent: *\nDisallow: /private"), "/private/x")).toBe(false);
  });
  it("lets the longest rule win, Allow beating Disallow on a tie, and an empty Disallow allow all", () => {
    const text = "User-agent: *\nDisallow: /events\nAllow: /events/public\nDisallow:\n";
    expect(isAllowed(rules(text), "/events/private")).toBe(false);
    expect(isAllowed(rules(text), "/events/public/1")).toBe(true);
    expect(isAllowed(rules("User-agent: *\nDisallow: /a\nAllow: /a"), "/a")).toBe(true);
  });
  it("supports * and $, comments, and a blocked-everything file", () => {
    expect(patternMatches("/*.pdf$", "/files/a.pdf")).toBe(true);
    expect(patternMatches("/*.pdf$", "/files/a.pdf?x=1")).toBe(false);
    expect(patternMatches("/a*b*c", "/aXXbYYc")).toBe(true);
    expect(patternMatches("/feeds/videos.xml", "/feeds/videos.xml?channel_id=UC1")).toBe(true);
    expect(isAllowed(rules("User-agent: * # everyone\nDisallow: / # all"), "/x")).toBe(false);
  });
  it("applies several User-agent lines to one group", () => {
    const text = "User-agent: bingbot\nUser-agent: CitizensConnectReader\nDisallow: /nope\n";
    expect(isAllowed(rules(text), "/nope")).toBe(false);
    expect(isAllowed(rules(text), "/yes")).toBe(true);
  });
  it("is bounded on hostile files and patterns", () => {
    const t0 = Date.now();
    isAllowed(rules(`User-agent: *\n${"Disallow: /a*a*a*a*a*a*a*a*a*b\n".repeat(2000)}`), "/" + "a".repeat(5000));
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
