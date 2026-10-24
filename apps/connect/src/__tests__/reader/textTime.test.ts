import { describe, it, expect } from "vitest";
import { scrubPersonalContact as serverScrub } from "@/lib/automation/suggestions";
import { decodeEntities, htmlToText, httpsUrl, multiLine, normKey, oneLine, scrubPersonalContact } from "../../../scripts/reader/text.mjs";
import { parseFeedDate, parseIcsDateTime, parseIsoDateTime, resolveZone, zonedToUtcMs } from "../../../scripts/reader/time.mjs";

describe("decodeEntities", () => {
  it("decodes the standard named and numeric references and leaves unknown ones alone", () => {
    expect(decodeEntities("Fish &amp; Chips &lt;3 &quot;hi&quot; &#39;a&#39; &#x2019; &nbsp;x &bogus;")).toBe(
      "Fish & Chips <3 \"hi\" 'a' ’  x &bogus;",
    );
  });
  it("drops invalid code points instead of throwing", () => {
    expect(decodeEntities("a&#0;b&#1114112;c&#xD800;d")).toBe("abcd");
  });
});

describe("htmlToText", () => {
  it("removes tags, scripts and styles, and turns block tags into line breaks", () => {
    const out = htmlToText("<p>Hello <b>there</b></p><script>var a = '<p>no</p>';</script><style>p{}</style><p>Second &amp; last</p>");
    expect(out.replace(/\n+/g, "|").replace(/^\||\|$/g, "")).toBe("Hello there|Second & last");
  });
  it("keeps a lone < as text and survives an unterminated tag or comment", () => {
    expect(htmlToText("1 < 2 and 3 > 2")).toBe("1 < 2 and 3 > 2");
    expect(() => htmlToText("<div class='x' <p>broken")).not.toThrow();
    expect(htmlToText("before<!-- never closed")).toBe("before");
  });
  it("is linear on a hostile page of unclosed tags", () => {
    const start = Date.now();
    htmlToText("<a ".repeat(50_000));
    htmlToText("<script>".repeat(5_000));
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe("oneLine / multiLine / httpsUrl / normKey", () => {
  it("collapses whitespace and strips control characters", () => {
    expect(oneLine("  a \n\t b\u0007c  ", 50)).toBe("a b c");
    expect(oneLine(42 as unknown as string, 5)).toBe("");
    expect(multiLine("a\r\n\r\n\r\n\r\nb  \t c\u0000d", 100)).toBe("a\n\nb c d");
    expect(oneLine("x".repeat(500), 10)).toHaveLength(10);
  });
  it("accepts only https, no credentials, a dotted host, within the length", () => {
    expect(httpsUrl("https://www.church.example/a#frag")).toBe("https://www.church.example/a");
    expect(httpsUrl("/events/1", "https://www.church.example/x")).toBe("https://www.church.example/events/1");
    for (const bad of [
      "http://church.example/",
      "https://u:p@church.example/",
      "javascript:alert(1)",
      "https://localhost/",
      "",
      "not a url",
      "ftp://church.example/",
    ]) {
      expect(httpsUrl(bad), bad).toBeNull();
    }
    expect(httpsUrl("https://church.example/" + "a".repeat(600))).toBeNull();
    expect(httpsUrl(undefined as unknown as string)).toBeNull();
  });
  it("normKey ignores case and punctuation", () => {
    expect(normKey("Sunday  Service!")).toBe(normKey("sunday service"));
  });
});

describe("scrubPersonalContact keeps step with the server's scrub", () => {
  const corpus = [
    "Call 012 345 6789 today",
    "WhatsApp +27 82 123 4567 now",
    "mail info@church.example or sales.team+x@mail.church.example",
    "Open 2026-10-25 18:00 - 20:00, R150 pp, 120 parcels, room 4B",
    "ref 0123456789012 and (012) 345-6789",
    "Nothing personal here at all.",
    "Born 1990-05-05. Phone 0821234567.",
  ];
  it.each(corpus)("matches the library on: %s", (text) => {
    expect(scrubPersonalContact(text)).toBe(serverScrub(text).text);
  });
  it("actually removes numbers and addresses", () => {
    expect(scrubPersonalContact("Ring 012 345 6789 or write to a@b.example")).toBe("Ring [removed] or write to [removed]");
  });
});

describe("time: ISO dates", () => {
  it("honours an explicit offset or Z", () => {
    expect(new Date(parseIsoDateTime("2026-11-07T10:00:00+02:00")!.ms!).toISOString()).toBe("2026-11-07T08:00:00.000Z");
    expect(new Date(parseIsoDateTime("2026-11-07T08:00:00Z")!.ms!).toISOString()).toBe("2026-11-07T08:00:00.000Z");
    expect(new Date(parseIsoDateTime("2026-11-07T10:00:00-0530")!.ms!).toISOString()).toBe("2026-11-07T15:30:00.000Z");
  });
  it("reads a time with no zone as South African time", () => {
    expect(new Date(parseIsoDateTime("2026-11-14T18:30")!.ms!).toISOString()).toBe("2026-11-14T16:30:00.000Z");
  });
  it("reports a date with no time as a date, never as midnight", () => {
    expect(parseIsoDateTime("2026-11-21")).toEqual({ kind: "date" });
  });
  it("refuses impossible or junk values", () => {
    for (const bad of [
      "2026-02-31T10:00:00Z",
      "2026-13-01T10:00:00Z",
      "2026-11-07T25:00:00Z",
      "junk",
      "",
      "2026-11-07T10:00:00+99:00",
      "x".repeat(100),
    ]) {
      expect(parseIsoDateTime(bad), bad).toBeNull();
    }
    expect(parseIsoDateTime(undefined as unknown as string)).toBeNull();
  });
});

describe("time: iCalendar and zones", () => {
  it("converts a zoned wall-clock time across a daylight-saving change", () => {
    // London leaves summer time on 25 Oct 2026: 10:00 that day is GMT, 10:00 a week earlier is BST.
    expect(new Date(parseIcsDateTime("20261025T100000", "Europe/London").ms!).toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(new Date(parseIcsDateTime("20261018T100000", "Europe/London").ms!).toISOString()).toBe("2026-10-18T09:00:00.000Z");
  });
  it("treats Z as UTC, floating as South African time, and knows the Microsoft name for it", () => {
    expect(new Date(parseIcsDateTime("20261107T080000Z").ms!).toISOString()).toBe("2026-11-07T08:00:00.000Z");
    expect(new Date(parseIcsDateTime("20261107T100000").ms!).toISOString()).toBe("2026-11-07T08:00:00.000Z");
    expect(new Date(parseIcsDateTime("20261107T100000", "South Africa Standard Time").ms!).toISOString()).toBe("2026-11-07T08:00:00.000Z");
  });
  it("flags a date-only value, an unknown zone and junk", () => {
    expect(parseIcsDateTime("20261121")).toEqual({ kind: "date" });
    expect(parseIcsDateTime("20261107T100000", "Nowhere/Land")).toEqual({ kind: "unreadable" });
    expect(parseIcsDateTime("tomorrow")).toEqual({ kind: "unreadable" });
    expect(resolveZone("Nowhere/Land")).toBeNull();
    expect(zonedToUtcMs({ y: 2026, mo: 2, d: 30 }, "UTC")).toBeNull();
  });
});

describe("time: feed dates", () => {
  it("reads RFC 822 and ISO 8601 dates and refuses junk", () => {
    expect(new Date(parseFeedDate("Tue, 20 Oct 2026 08:00:00 +0200")!).toISOString()).toBe("2026-10-20T06:00:00.000Z");
    expect(new Date(parseFeedDate("2026-10-18T09:30:00+00:00")!).toISOString()).toBe("2026-10-18T09:30:00.000Z");
    expect(new Date(parseFeedDate("2026-10-18")!).toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(parseFeedDate("2026-99-99")).toBeNull();
    expect(parseFeedDate("sometime soon")).toBeNull();
    expect(parseFeedDate("")).toBeNull();
  });
});
