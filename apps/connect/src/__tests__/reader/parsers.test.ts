import { describe, it, expect } from "vitest";
import { isAllowed, parseRobots, patternMatches } from "../../../scripts/reader/robots.mjs";
import { decodeEntities, discoverFeeds, htmlToText, scanHtml } from "../../../scripts/reader/html.mjs";
import { XmlRefused, parseXml } from "../../../scripts/reader/xml.mjs";
import { parseFeed, sniffFeed } from "../../../scripts/reader/feed.mjs";
import { eventsFromJsonLd, parseJsonLdBlock } from "../../../scripts/reader/jsonld.mjs";
import { parseDuration, parseIcs, parseIcsTime, parseLine, parseRrule, resolveTzid, unescapeText, unfold } from "../../../scripts/reader/ics.mjs";
import { dayOf, parseFeedDate, parseIsoDateTime, zonedToUtc } from "../../../scripts/reader/time.mjs";
import { NOW, fixture } from "./helpers";

const ICS_OPTS = { nowMs: NOW, recurringDays: 14, singleDays: 365, maxPerSeries: 2 };
const iso = (ms: number) => new Date(ms).toISOString();

/** Runs `fn` and fails if it takes longer than `ms` (hostile input must stay linear). */
function fast<T>(fn: () => T, ms = 1500): T {
  const t = performance.now();
  const out = fn();
  expect(performance.now() - t).toBeLessThan(ms);
  return out;
}

describe("time", () => {
  it("reads ISO date-times with an offset, in UTC, and floating ones as South African time", () => {
    expect(parseIsoDateTime("2026-11-08T09:00:00+02:00")).toEqual({ ms: Date.parse("2026-11-08T07:00:00Z") });
    expect(parseIsoDateTime("2026-11-08T07:00Z")).toEqual({ ms: Date.parse("2026-11-08T07:00:00Z") });
    expect(parseIsoDateTime("2026-11-08T09:00")).toEqual({ ms: Date.parse("2026-11-08T07:00:00Z") });
    expect(parseIsoDateTime("2026-11-08 09:00:00.123-0500")).toEqual({ ms: Date.parse("2026-11-08T14:00:00Z") });
    expect(parseIsoDateTime("2026-11-08")).toEqual({ dateOnly: true });
  });
  it("refuses impossible or malformed dates", () => {
    for (const v of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-11-08T24:00", "2026-11-08T09:60", "tomorrow", "", "2026-11-08T09:00+15:00", 42, null]) {
      expect(parseIsoDateTime(v as string), String(v)).toBeNull();
    }
  });
  it("reads RSS dates, including SAST, and refuses unknown zones", () => {
    expect(parseFeedDate("Fri, 30 Oct 2026 10:00:00 +0200")).toBe(Date.parse("2026-10-30T08:00:00Z"));
    expect(parseFeedDate("30 Oct 2026 10:00 GMT")).toBe(Date.parse("2026-10-30T10:00:00Z"));
    expect(parseFeedDate("Sat, 31 Oct 2026 09:00:00 SAST")).toBe(Date.parse("2026-10-31T07:00:00Z"));
    expect(parseFeedDate("Sat, 31 Oct 2026 09:00:00 XYZ")).toBeNull();
    expect(parseFeedDate("Sat, 31 Foo 2026 09:00:00 GMT")).toBeNull();
    expect(parseFeedDate("2026-10-28T08:00:00Z")).toBe(Date.parse("2026-10-28T08:00:00Z"));
    expect(parseFeedDate("garbage")).toBeNull();
  });
  it("converts wall clocks in zones with daylight saving exactly", () => {
    expect(iso(zonedToUtc({ y: 2026, mo: 7, d: 1, h: 9 }, "Europe/London"))).toBe("2026-07-01T08:00:00.000Z");
    expect(iso(zonedToUtc({ y: 2026, mo: 12, d: 1, h: 9 }, "Europe/London"))).toBe("2026-12-01T09:00:00.000Z");
    expect(dayOf(Date.parse("2026-10-31T23:30:00Z"))).toBe("2026-11-01"); // already Sunday in Pretoria
  });
});

describe("robots.txt", () => {
  const txt = `
User-agent: *
Disallow: /private
Allow: /private/open
Disallow: /*.pdf$

User-agent: OtherBot
Disallow: /

User-agent: CitizensConnectReader/2.0
User-agent: AnotherBot
Disallow: /drafts
`;
  it("our own group wins over *, and groups naming us merge", () => {
    const rules = parseRobots(txt);
    expect(isAllowed(rules, "/drafts/x")).toBe(false);
    expect(isAllowed(rules, "/private")).toBe(true); // the * group no longer applies to us
  });
  it("with no group of ours, the * group applies: longest match wins, Allow wins a tie, $ anchors", () => {
    const rules = parseRobots(txt.replace("CitizensConnectReader/2.0", "SomeoneElse"));
    expect(isAllowed(rules, "/private/x")).toBe(false);
    expect(isAllowed(rules, "/private/open/page")).toBe(true);
    expect(isAllowed(rules, "/files/a.pdf")).toBe(false);
    expect(isAllowed(rules, "/files/a.pdf?x=1")).toBe(true);
    expect(isAllowed(rules, "/")).toBe(true);
    expect(isAllowed(parseRobots("User-agent: *\nAllow: /a\nDisallow: /a"), "/a")).toBe(true);
  });
  it("a prefix of our name is NOT our group (exact product token only)", () => {
    expect(isAllowed(parseRobots("User-agent: Citizens\nDisallow: /\n"), "/x")).toBe(true);
    expect(isAllowed(parseRobots("User-agent: citizensconnectreader\nDisallow: /\n"), "/x")).toBe(false);
  });
  it("the YouTube case: a disallowed feed path is disallowed", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow: /feeds/videos.xml\n"), "/feeds/videos.xml?channel_id=UC1")).toBe(false);
  });
  it("an empty Disallow allows everything; junk lines are ignored", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:\nnonsense\n: x\n"), "/anything")).toBe(true);
    expect(isAllowed(parseRobots(""), "/")).toBe(true);
  });
  it("wildcards match in linear time, even when the file is hostile", () => {
    expect(patternMatches("/a*b*c", "/a-x-b-y-c")).toBe(true);
    expect(patternMatches("/a*b*c$", "/a-b-c-d")).toBe(false);
    const hostile = "User-agent: *\n" + Array.from({ length: 3000 }, () => "Disallow: /" + "*a".repeat(200) + "b").join("\n");
    const rules = fast(() => parseRobots(hostile));
    fast(() => isAllowed(rules, "/" + "a".repeat(5000)));
  });
});

describe("html", () => {
  it("decodes entities, refusing out-of-range code points", () => {
    expect(decodeEntities("A &amp; B &#39;x&#39; &#x2014;")).toBe("A & B 'x' —");
    expect(decodeEntities("&unknown; &nbsp;|")).toBe("&unknown;  |");
    expect(decodeEntities("&#0;|&#xD800;|&#1114112;")).toBe(" | | ");
  });
  it("finds JSON-LD and alternate links, but not inside scripts or comments", () => {
    const scan = scanHtml(fixture("church-page.html"));
    expect(scan.jsonld).toHaveLength(2);
    const feeds = discoverFeeds(scan, "https://www.church.example.org/events/");
    expect(feeds).toEqual([
      { url: "https://www.church.example.org/feed/", kind: "feed" },
      { url: "https://www.church.example.org/events.ics", kind: "ics" },
    ]);
  });
  it("never offers comment feeds, http feeds or more than the cap; respects <base>", () => {
    const html = `<base href="https://cdn.example.org/site/"><link rel="alternate" type="application/rss+xml" href="feed">
      <link rel="alternate" type="application/atom+xml" href="?feed=comments-atom"><link rel="alternate" type="text/calendar" href="cal.ics">
      <link rel="alternate" type="application/rss+xml" href="two"><link rel="alternate" type="application/rss+xml" href="three">`;
    expect(discoverFeeds(scanHtml(html), "https://www.church.example.org/", 3).map((f) => f.url)).toEqual([
      "https://cdn.example.org/site/feed",
      "https://cdn.example.org/site/cal.ics",
      "https://cdn.example.org/site/two",
    ]);
  });
  it("htmlToText drops tags, scripts and styles and keeps block breaks", () => {
    expect(htmlToText("<p>Hello <b>world</b></p><script>alert(1)</script><style>p{}</style><p>Second&nbsp;line</p>")).toBe("Hello world\nSecond line");
    expect(htmlToText("1 < 2 and <<b>bold</b>")).toBe("1 < 2 and <bold");
  });
  it("hostile markup stays fast: unclosed quotes, unclosed tags, deep nesting, many comments", () => {
    fast(() => scanHtml('<a href="' + "<a x='".repeat(50_000)));
    fast(() => scanHtml("<div ".repeat(100_000)));
    fast(() => scanHtml("<!--".repeat(100_000)));
    fast(() => scanHtml("<script>" + "x".repeat(900_000)));
    fast(() => htmlToText("<".repeat(200_000)));
    fast(() => htmlToText("<p".repeat(200_000)));
  });
});

describe("xml", () => {
  it("refuses entity declarations (no expansion, no external entities)", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><rss><channel><title>&lol2;</title></channel></rss>`;
    expect(() => parseXml(bomb)).toThrow(XmlRefused);
    expect(parseFeed(bomb, "https://feeds.example.org/")).toEqual({ title: "", items: [], refused: true });
    const external = `<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>`;
    expect(() => parseXml(external)).toThrow(XmlRefused);
  });
  it("caps depth and node count", () => {
    expect(() => parseXml("<a>".repeat(100))).toThrow(XmlRefused);
    expect(() => parseXml("<rss>" + "<i/>".repeat(30_000) + "</rss>")).toThrow(XmlRefused);
  });
  it("tolerates junk: stray end tags, unclosed tags, attributes with > in quotes", () => {
    const doc = parseXml(`</x><rss a="1>2"><channel><title>T</title></rss><unclosed`);
    expect(doc.children[0].attrs.a).toBe("1>2");
    fast(() => parseXml("<a b='".repeat(100_000)));
  });
});

describe("feeds", () => {
  it("sniffs feeds by their first element, not by the type a server claims", () => {
    expect(sniffFeed(fixture("blog.rss.xml"))).toBe(true);
    expect(sniffFeed(fixture("news.atom.xml"))).toBe(true);
    expect(sniffFeed("\ufeff<!-- c --><rdf:RDF>")).toBe(true);
    expect(sniffFeed(fixture("church-page.html"))).toBe(false);
    expect(sniffFeed("<html><rss>")).toBe(false);
  });
  it("reads RSS: text from HTML, links resolved and https only, dates or null", () => {
    const { title, items } = parseFeed(fixture("blog.rss.xml"), "https://www.church.example.org/feed/");
    expect(title).toBe("Grace Fellowship Feed");
    expect(items[0]).toEqual({ title: "Food parcels for 40 families", body: "Thank you to everyone who gave this month.", link: "https://www.church.example.org/news/food-parcels", publishedMs: Date.parse("2026-10-30T08:00:00Z") });
    expect(items[1]).toMatchObject({ link: "https://www.church.example.org/news/choir", body: "Rehearsals are now on Thursdays & start at 18:00.", publishedMs: Date.parse("2026-10-28T08:00:00Z") });
    expect(items[3].publishedMs).toBeNull();
    expect(items[4].link).toBeNull();
  });
  it("reads Atom: html titles, the alternate link against xml:base, published or updated", () => {
    const { items } = parseFeed(fixture("news.atom.xml"), "https://news.example.org/feed.atom");
    expect(items[0]).toEqual({ title: "Outreach update", body: "Twelve volunteers served at the shelter.", link: "https://news.example.org/posts/outreach", publishedMs: Date.parse("2026-10-31T10:00:00Z") });
    expect(items[1]).toMatchObject({ title: "Second entry", body: "Plain words.", publishedMs: Date.parse("2026-10-29T09:00:00Z") });
  });
  it("gives no items for something that is not a feed, and never throws", () => {
    for (const junk of ["", "not xml", "<html></html>", "<rss><channel><item><title>x", "\u0000\u0001"]) {
      expect(() => parseFeed(junk, "https://feeds.example.org/")).not.toThrow();
    }
    expect(parseFeed("<html></html>", "https://feeds.example.org/").items).toEqual([]);
  });
});

describe("JSON-LD events", () => {
  it("finds events in @graph and nested nodes; counts cancelled and date-only ones; resolves the url", () => {
    const scan = scanHtml(fixture("church-page.html"));
    const r = eventsFromJsonLd(scan.jsonld, "https://www.church.example.org/events/");
    expect(r.cancelled).toBe(1);
    expect(r.skippedNoTime).toBe(1);
    const byTitle = Object.fromEntries(r.events.map((e) => [e.title, e]));
    expect(byTitle["Sunday Celebration & Worship"]).toMatchObject({
      startMs: Date.parse("2026-11-08T07:00:00Z"),
      endMs: Date.parse("2026-11-08T08:30:00Z"),
      location: "Grace Hall, 12 Example Street, Pretoria",
      description: "Join us for worship.\nQuestions? Call 012 345 6789.",
      url: null,
    });
    expect(byTitle["Worship Night"]).toMatchObject({ startMs: Date.parse("2026-11-14T16:30:00Z"), location: "Online", url: "https://www.church.example.org/events/worship-night", endMs: null });
    expect(byTitle["Last Month's Outreach"]).toBeDefined(); // the date window is the caller's job
  });
  it("tolerates comment wrappers and junk; refuses non-https urls; never throws", () => {
    expect(parseJsonLdBlock("<!-- {\"a\":1} -->")).toEqual({ a: 1 });
    expect(parseJsonLdBlock("{oops")).toBeUndefined();
    const r = eventsFromJsonLd(['{"@type":"Event","name":"X Y Z","startDate":"2026-11-09T10:00:00Z","url":"javascript:alert(1)","location":["Hall A","Hall B"]}', "null", "[1,2,3]", '"str"'], "https://www.church.example.org/");
    expect(r.events).toEqual([{ title: "X Y Z", description: "", startMs: Date.parse("2026-11-09T10:00:00Z"), endMs: null, location: "Hall A", url: null }]);
  });
  it("an end before the start is dropped; a cycle-free deep or huge document stays within its budget", () => {
    const r = eventsFromJsonLd(['{"@type":"Event","name":"Backwards","startDate":"2026-11-09T10:00:00Z","endDate":"2026-11-09T09:00:00Z"}'], "https://a.example.org/");
    expect(r.events[0].endMs).toBeNull();
    let deep: unknown = { "@type": "Event", name: "Too deep", startDate: "2026-11-09T10:00:00Z" };
    for (let i = 0; i < 50; i++) deep = { child: deep };
    expect(eventsFromJsonLd([JSON.stringify(deep)], "https://a.example.org/").events).toEqual([]);
    const many = JSON.stringify(Array.from({ length: 20_000 }, (_, i) => ({ "@type": "Event", name: `Event ${i}`, startDate: "2026-11-09T10:00:00Z" })));
    expect(fast(() => eventsFromJsonLd([many], "https://a.example.org/")).events.length).toBeLessThan(5_000);
  });
});

describe("iCalendar", () => {
  it("unfolds lines, parses quoted params and unescapes text", () => {
    expect(unfold("A:1\r\n 2\r\n\t3\nB:x")).toEqual(["A:123", "B:x"]);
    expect(parseLine('DTSTART;TZID="Africa/Johannesburg";X=a:20261101T090000')).toEqual({ name: "DTSTART", params: { TZID: "Africa/Johannesburg", X: "a" }, value: "20261101T090000" });
    expect(parseLine('X;P="a:b;c":v')).toEqual({ name: "X", params: { P: "a:b;c" }, value: "v" });
    expect(parseLine("no colon here")).toBeNull();
    expect(parseLine('X;P="unclosed:v')).toBeNull();
    expect(unescapeText("a\\, b\\; c\\nd\\\\e")).toBe("a, b; c\nd\\e");
  });
  it("reads UTC, TZID (IANA, Windows, vendor-prefixed) and floating times; refuses unknown zones", () => {
    expect(parseIcsTime("20261101T070000Z")).toMatchObject({ ms: Date.parse("2026-11-01T07:00:00Z"), tz: "UTC" });
    expect(parseIcsTime("20261101T090000", { TZID: "South Africa Standard Time" })).toMatchObject({ ms: Date.parse("2026-11-01T07:00:00Z") });
    expect(resolveTzid("/mozilla.org/20070129_1/Africa/Johannesburg")).toBe("Africa/Johannesburg");
    expect(parseIcsTime("20261101T090000")).toMatchObject({ ms: Date.parse("2026-11-01T07:00:00Z") });
    expect(parseIcsTime("20261101T090000", { TZID: "Mars/Olympus_Mons" })).toEqual({ unsupported: true });
    expect(parseIcsTime("20261101", { VALUE: "DATE" })).toMatchObject({ allDay: true });
    expect(parseIcsTime("20261301T090000")).toEqual({ unsupported: true });
  });
  it("durations and rules: only what can be read exactly", () => {
    expect(parseDuration("PT1H30M")).toBe(90 * 60_000);
    expect(parseDuration("P1W")).toBe(7 * 86_400_000);
    for (const bad of ["-PT1H", "P", "PT", "1H", "PT0S"]) expect(parseDuration(bad), bad).toBeNull();
    expect(parseRrule("FREQ=WEEKLY;BYDAY=SU,WE;INTERVAL=2")).toMatchObject({ freq: "WEEKLY", interval: 2, byDay: [0, 3] });
    expect(parseRrule("FREQ=MONTHLY;BYDAY=-1FR")).toMatchObject({ nth: { n: -1, weekday: 5 } });
    for (const bad of ["FREQ=YEARLY", "FREQ=WEEKLY;BYSETPOS=1", "FREQ=DAILY;BYDAY=MO", "FREQ=MONTHLY;BYDAY=MO,TU", "FREQ=MONTHLY;BYDAY=5SU", "FREQ=WEEKLY;COUNT=2;UNTIL=20270101", "FREQ=WEEKLY;INTERVAL=0", "FREQ=WEEKLY;FREQ=DAILY", "garbage"]) {
      expect(parseRrule(bad), bad).toBeNull();
    }
  });
  it("the fixture calendar: overrides, EXDATE, cancelled, private, all-day and unreadable rules", () => {
    const r = parseIcs(fixture("events.ics"), ICS_OPTS);
    expect(r).toMatchObject({ skippedNoTime: 1, skippedUnsupported: 1, skippedPrivate: 1, cancelled: 1 });
    expect(r.events.map((e) => [e.title, iso(e.startMs)])).toEqual([
      ["Sunday Service (Communion)", "2026-11-01T08:00:00.000Z"],
      ["Youth Camp Info Evening", "2026-11-05T16:00:00.000Z"],
    ]);
    expect(r.events[1]).toMatchObject({ endMs: Date.parse("2026-11-05T17:30:00Z"), url: "https://www.church.example.org/camp" });
    expect(r.events.some((e) => e.title.includes("Alarm"))).toBe(false);
  });
  it("expands weekly rules on the zone's wall clock (DST-safe), up to the per-series cap", () => {
    const cal = (rule: string, start: string, tz = "Europe/London") =>
      `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nSUMMARY:Service\nDTSTART;TZID=${tz}:${start}\nRRULE:${rule}\nEND:VEVENT\nEND:VCALENDAR`;
    // A series that started in London summer time (09:00 = 08:00Z) is still at 09:00 local after
    // the clocks go back on 25 Oct 2026, which is 09:00Z. The 15th is past the 14-day window.
    const r = parseIcs(cal("FREQ=WEEKLY;BYDAY=SU", "20260705T090000"), { ...ICS_OPTS, maxPerSeries: 5 });
    expect(r.events.map((e) => iso(e.startMs))).toEqual(["2026-11-01T09:00:00.000Z", "2026-11-08T09:00:00.000Z"]);
    const capped = parseIcs(cal("FREQ=DAILY", "20200101T090000"), ICS_OPTS);
    expect(capped.events).toHaveLength(2);
    const counted = parseIcs(cal("FREQ=WEEKLY;COUNT=3", "20261018T090000"), { ...ICS_OPTS, maxPerSeries: 9 });
    expect(counted.events.map((e) => iso(e.startMs))).toEqual(["2026-11-01T09:00:00.000Z"]);
    const until = parseIcs(cal("FREQ=DAILY;UNTIL=20261103T235959Z", "20261025T090000"), { ...ICS_OPTS, maxPerSeries: 9 });
    expect(until.events).toHaveLength(3);
    const monthly = parseIcs(cal("FREQ=MONTHLY;BYDAY=1SU", "20260104T100000", "Africa/Johannesburg"), { ...ICS_OPTS, recurringDays: 40, maxPerSeries: 9 });
    expect(monthly.events.map((e) => iso(e.startMs))).toEqual(["2026-11-01T08:00:00.000Z", "2026-12-06T08:00:00.000Z"]);
    const day31 = parseIcs(cal("FREQ=MONTHLY", "20260131T100000", "Africa/Johannesburg"), { ...ICS_OPTS, recurringDays: 70, maxPerSeries: 9 });
    expect(day31.events.map((e) => iso(e.startMs))).toEqual(["2026-12-31T08:00:00.000Z"]);
  });
  it("hostile calendars stay bounded and never throw", () => {
    fast(() => parseIcs("BEGIN:VCALENDAR\n" + "BEGIN:VEVENT\nSUMMARY:x\nDTSTART:20261102T080000Z\nEND:VEVENT\n".repeat(5_000), ICS_OPTS));
    fast(() => parseIcs(`BEGIN:VEVENT\nDTSTART:19000101T000000Z\nRRULE:FREQ=DAILY;COUNT=10000\nSUMMARY:old\nEND:VEVENT`, ICS_OPTS));
    fast(() => parseIcs(" x".repeat(400_000), ICS_OPTS));
    for (const junk of ["", "BEGIN:VEVENT", "BEGIN:VEVENT\nDTSTART:nonsense\nEND:VEVENT", "\u0000"]) expect(() => parseIcs(junk, ICS_OPTS)).not.toThrow();
  });
});
