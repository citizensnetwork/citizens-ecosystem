/**
 * The mockup validator (docs/routines/designer.md section 2; Designer build, phase 2). A Designer card's mockup is
 * one sandboxed HTML snippet built from our tokens; a snippet with a violation is never filed. Each rule has a
 * planted case that must fail, and a clean snippet that must pass.
 */
import { describe, it, expect } from "vitest";
import { MAX_BYTES, MAX_DATA_IMAGE_BYTES, lintMockup } from "../../../scripts/design/lint-mockup.mjs";

const rules = (html: string) => lintMockup(html).violations.map((v) => v.rule);

const CLEAN = [
  '<div style="background: var(--surface-1); color: var(--text-1); border-radius: var(--radius-md); padding: var(--space-4)">',
  '  <a href="#top" style="color: var(--accent-ink)">Back to top</a>',
  '  <button style="background: var(--accent); color: var(--accent-contrast); min-height: var(--hit)">Connect</button>',
  '  <img alt="" src="data:image/png;base64,iVBORw0KGgo=" width="40" height="40">',
  "</div>",
].join("\n");

describe("a clean snippet", () => {
  it("passes", () => {
    const r = lintMockup(CLEAN);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("forbidden tags", () => {
  it.each([
    ["script", "<div><script>alert(1)</script></div>"],
    ["script in any case", "<div><SCRIPT SRC=x></SCRIPT></div>"],
    ["script inside an svg", "<svg><script>alert(1)</script></svg>"],
    ["iframe", '<iframe srcdoc="x"></iframe>'],
    ["object", "<object data=x></object>"],
    ["embed", "<embed src=x>"],
    ["link", '<link rel="stylesheet" href="#x">'],
  ])("rejects %s", (_name, html) => {
    expect(rules(html)).toContain("forbidden-tag");
  });
});

describe("event attributes", () => {
  it.each([
    ['<div onclick="x()">a</div>'],
    ["<img src=x onerror=alert(1)>"],
    ['<svg onload="x()"></svg>'],
    ['<a href="#a" ONMOUSEOVER="x()">a</a>'],
    ["<body\nonpageshow = 'x'>"],
  ])("rejects %s", (html) => {
    expect(rules(html)).toContain("event-attribute");
  });

  it("does not mistake ordinary words or style properties for handlers", () => {
    expect(rules('<p style="transition: opacity 120ms">on and on, one tone, python=3</p>')).toEqual([]);
  });
});

describe("javascript: URLs", () => {
  it.each([
    ['<a href="javascript:alert(1)">x</a>'],
    ['<a href="  JavaScript:alert(1)">x</a>'],
    ['<a href="java&#115;cript:alert(1)">x</a>'],
    ['<a href="jav&#x09;ascript:alert(1)">x</a>'],
    ['<a href="java\nscript:alert(1)">x</a>'],
    ['<a href="&#106;avascript&colon;alert(1)">x</a>'],
    ['<a href="vbscript:msgbox(1)">x</a>'],
  ])("rejects %s", (html) => {
    expect(rules(html)).toContain("javascript-url");
  });
});

describe("external URLs", () => {
  it.each([
    ["an image", '<img src="https://example.test/a.png">'],
    ["a protocol-relative src", '<img src="//cdn.test/a.png">'],
    ["an anchor", '<a href="http://example.test/">x</a>'],
    ["a scheme that is not data:", '<img src="blob:abc">'],
    ["srcset", '<img srcset="a.png 1x, https://example.test/b.png 2x">'],
    ["a style attribute url()", '<div style="background: url(https://example.test/a.png)"></div>'],
    ["a quoted url()", "<div style=\"background: url('//example.test/a.png')\"></div>"],
    ["a stylesheet url()", "<style>.a { background: url(https://example.test/a.png) }</style>"],
    ["an @import", '<style>@import "https://example.test/a.css";</style>'],
    ["a url() written with CSS escapes", "<style>.a { background: url(\\68ttps://example.test/a.png) }</style>"],
    ["an @import written with a CSS escape", '<style>@\\69mport "//example.test/a.css";</style>'],
    ["a url() quoted with character references", '<div style="background: url(&quot;//example.test/a.png&quot;)"></div>'],
    ["an address written in the text", "<p>see https://example.test/page for more</p>"],
    ["a websocket address", "<p>ws://example.test/socket</p>"],
  ])("rejects %s", (_name, html) => {
    expect(rules(html)).toContain("external-url");
  });

  it("allows a fragment link and a relative-free snippet", () => {
    expect(rules('<a href="#section">x</a><p>no addresses here, just a // slash pair in prose</p>')).toEqual([]);
  });
});

describe("data: URLs", () => {
  it("rejects a data: URL that is not an image", () => {
    expect(rules('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>')).toContain("data-url-not-image");
  });

  it("allows a data: image and counts it", () => {
    const r = lintMockup('<img src="data:image/svg+xml;utf8,<svg xmlns=%27x%27/>">');
    expect(r.violations).toEqual([]);
    expect(r.dataImageBytes).toBeGreaterThan(0);
  });

  it("counts a data: image in a style attribute once (a 40 KB one is within the 60 KB limit)", () => {
    const html = `<div style="background: url(data:image/png;base64,${"A".repeat(40 * 1024)})"></div>`;
    const r = lintMockup(html);
    expect(r.violations.map((v) => v.rule)).not.toContain("data-images-size");
    expect(r.dataImageBytes).toBeLessThan(45 * 1024);
    expect(r.dataImageBytes).toBeGreaterThan(40 * 1024);
  });

  it("rejects more than 60 KB of data: images in total, even when each one is small", () => {
    const one = `<img src="data:image/png;base64,${"A".repeat(20 * 1024)}">`;
    expect(rules(one + one + one)).toContain("data-images-size"); // 3 x 20 KB = 60 KB + markup
    expect(rules(one)).not.toContain("data-images-size");
  });
});

describe("size", () => {
  it("accepts a snippet of exactly 24 KB and rejects one byte more", () => {
    const pad = (n: number) => "<p>" + "x".repeat(n - "<p></p>".length) + "</p>";
    expect(MAX_BYTES).toBe(24 * 1024);
    expect(lintMockup(pad(MAX_BYTES)).bytes).toBe(MAX_BYTES);
    expect(rules(pad(MAX_BYTES))).not.toContain("size");
    expect(rules(pad(MAX_BYTES + 1))).toContain("size");
  });

  it("rejects a 25 KB snippet", () => {
    expect(rules("<p>" + "x".repeat(25 * 1024) + "</p>")).toContain("size");
  });

  it("measures bytes, not characters", () => {
    const wide = "<p>" + "é".repeat(MAX_BYTES / 2) + "</p>"; // 2 bytes each: over the limit in bytes
    expect(rules(wide)).toContain("size");
  });

  it("keeps the data: image limit at 60 KB", () => {
    expect(MAX_DATA_IMAGE_BYTES).toBe(60 * 1024);
  });
});

describe("worst-case input stays fast", () => {
  // A quadratic pattern turned the 24 KB size test into a 5 s timeout on CI: a long run of letters made the
  // attribute scan restart at every character. These inputs would take far longer than the 1 s allowed here.
  const timed = (html: string) => {
    const start = performance.now();
    lintMockup(html);
    return performance.now() - start;
  };
  it("lints 24 KB of one long word, of repeated words and of repeated url( in under a second each", () => {
    expect(timed("<p>" + "x".repeat(MAX_BYTES - 7) + "</p>")).toBeLessThan(1000);
    expect(timed("<p>" + "ab-cd ".repeat(MAX_BYTES / 6 - 2) + "</p>")).toBeLessThan(1000);
    expect(timed("<p>" + "url(".repeat(MAX_BYTES / 4 - 2) + "</p>")).toBeLessThan(1000);
  });

  it("stays fast when each url( is followed by a stray character or an unclosed quote, and still finds what follows", () => {
    expect(timed("<p>" + "url(".repeat(MAX_BYTES / 4 - 4) + " z)</p>")).toBeLessThan(1000);
    expect(timed("<p>" + 'url("'.repeat(MAX_BYTES / 5 - 2) + "</p>")).toBeLessThan(1000);
    // input too repetitive to check quickly fails closed instead of passing or hanging
    expect(rules("<p>" + "url(".repeat(MAX_BYTES / 4 - 4) + " z)</p>")).toContain("too-complex");
    expect(rules('<p>url("never closed</p><div style="background: url(//example.test/a.png)"></div>')).toContain("external-url");
    expect(rules("<p>url(</p><div style=\"background: url(javascript:x)\"></div>")).toContain("javascript-url");
  });
});

describe("reporting", () => {
  it("lists each distinct violation once, with the rule that caught it", () => {
    const r = lintMockup('<script>1</script><script>2</script><div onclick="x" onfocus="y"><img src="https://a.test/x.png"></div>');
    expect(r.ok).toBe(false);
    expect(new Set(r.violations.map((v) => `${v.rule}|${v.detail}`)).size).toBe(r.violations.length);
    expect(r.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(["forbidden-tag", "event-attribute", "external-url"]));
  });
});
