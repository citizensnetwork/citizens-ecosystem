/**
 * The card validator (docs/routines/designer.md sections 2 and 5; Designer build, phase 3). A Designer card is one
 * inbox document; a card with a violation is never filed. Each rule has a planted case that must fail and a clean case
 * that must pass, and the CLI is run for real so the exit codes the task relies on are pinned.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BRIEF_MAX_CHARS,
  CARD_MAX_BYTES,
  DOCUMENT_LIMIT_BYTES,
  REF_IMAGE_LABEL,
  publisherKey,
  validateCard,
} from "../../../scripts/design/validate-card.mjs";
import { parseWebpDataUrl } from "../../../scripts/design/webp.mjs";

// --- fixtures -------------------------------------------------------------------------------------------------------

/** A WebP header (VP8X) padded with zeros to `n` bytes: a real container as far as the validator reads it. */
function webpBytes(n: number, width = 320, height = 200): Buffer {
  const b = Buffer.alloc(n);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(n - 8, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8X", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}
/** The `data:` string is 23 characters of prefix plus 4 characters of base64 for every 3 bytes. */
const webpUrl = (n: number) => "data:image/webp;base64," + webpBytes(n).toString("base64");
const IMAGE_OK = webpUrl(30000); // 40,023 characters
const IMAGE_AT_CAP = webpUrl(30702); // 40,959 characters, the largest that fits the 40,960 cap
const IMAGE_OVER = webpUrl(30703); // 40,963 characters

const MOCKUP =
  '<div style="background: var(--surface-1); color: var(--text-1); border-radius: var(--radius-md); padding: var(--space-4)">' +
  '<button style="background: var(--accent); color: var(--accent-contrast); min-height: var(--hit)">Connect</button></div>';

const BRIEF = [
  "Surface and files: discovery; app/discover.jsx",
  "Problem (measured): 100 of 123 tap targets are under 44 px at 375 px (capture manifest, 2026-10-17)",
  "Target: --accent fill with --accent-contrast label, --radius-md",
  "Do not: no new colour, font or dependency",
  "Acceptance: screenshots at 375, 768 and 1280 px in both looks",
  "Claim (hypothesis): easier to find because the action sits where the thumb already is",
].join("\n");

const OPTIONS = [
  { key: "yes", label: "Yes, queue it" },
  { key: "no", label: "No: not now" },
  { key: "no-style", label: "No: not our style" },
  { key: "later", label: "Later" },
];

function surfaceCard(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    area: "design",
    kind: "idea",
    lens: "consistency",
    surface: "discovery",
    priority: 3,
    status: "open",
    source: "Designer",
    createdAt: "2026-10-17T21:30:00Z",
    title: "Use the gold fill for the main action on Discovery",
    summary: "The main action on Discovery is a plain button; make it the gold fill with the near-black label.",
    why: "Litmus 6: the next step is found without help.",
    size: "S",
    risk: "Low: one screen, flag off is pixel-identical.",
    evidence: "Capture manifest 2026-10-17 (discovery, 375 px): 100 of 123 targets under 44 px.",
    links: [],
    recommendation: "Yes, queue it.",
    rollout: "direct: a small screen",
    options: OPTIONS,
    answer: { choice: "", note: "", at: "" },
    snoozeUntil: "",
    brief: BRIEF,
    mockup: MOCKUP,
    ...extra,
  };
}

const REFS = [
  { name: "Maps app", url: "https://example.org/maps-pattern", readAt: "2026-10-17", pattern: "a three-state sheet", verdict: "ADAPT: ours already" },
  { name: "Events app", url: "https://example.net/events", readAt: "2026-10-17", pattern: "a pinned filter row", verdict: "DEFER: later" },
  { name: "Community app", url: "https://example.com/groups", readAt: "2026-10-17", pattern: "a join button", verdict: "REJECT: pressure" },
  { name: "Giving app", url: "https://example.co.za/give", readAt: "2026-10-17", pattern: "one clear amount", verdict: "ADOPT: yes" },
];
const referenceCard = (extra: Record<string, unknown> = {}) => surfaceCard({ lens: "reference", refs: REFS.slice(0, 3), ...extra });

const ROW = {
  task: "find a place near me and open it",
  them: "not shown",
  us: "not measured",
  evidence: "https://example.org/maps-pattern, read 2026-10-17",
};

const source = (url: string, extra: Record<string, unknown> = {}) => ({ url, readAt: "2026-11-03", ...extra });
const TREND = {
  name: "Larger touch targets",
  what: "Controls are at least 48 px with space between them.",
  sources: [source("https://developer.example.org/guidelines"), source("https://design.example.net/research")],
  why: "Fewer missed taps on a mid-range phone.",
  fit: { verdict: "ADAPT", litmus: 6 },
  outcome: "adapt",
};
const trendCard = (trends: unknown[], extra: Record<string, unknown> = {}) =>
  surfaceCard({ kind: "direction", lens: "trend", surface: "all", rollout: "none: the digest builds nothing", trends, ...extra });

const rules = (card: unknown, options?: { refImages?: boolean }) => validateCard(card, options).violations.map((v) => v.rule);
const detail = (card: unknown, rule: string, options?: { refImages?: boolean }) =>
  validateCard(card, options).violations.find((v) => v.rule === rule)?.detail ?? "";

// --- the clean card and its shape -------------------------------------------------------------------------------------

describe("a clean card", () => {
  it("passes, and reports its size", () => {
    const r = validateCard(surfaceCard());
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.bytes).toBeGreaterThan(500);
  });

  it("passes with every optional field present and the switch on", () => {
    const card = referenceCard({
      before: IMAGE_OK,
      comparison: [ROW, ROW, ROW],
      refImage: [
        { ref: "Maps app", label: REF_IMAGE_LABEL, image: IMAGE_OK },
        { ref: "Events app", label: REF_IMAGE_LABEL, image: IMAGE_AT_CAP },
      ],
    });
    expect(validateCard(card, { refImages: true }).violations).toEqual([]);
  });

  it("passes without a mockup or a brief (the fields are optional)", () => {
    const card = surfaceCard();
    delete card.mockup;
    delete card.brief;
    expect(rules(card)).toEqual([]);
  });
});

describe("shape", () => {
  it("rejects a card that is not an object", () => {
    for (const bad of [null, "text", 7, [], undefined]) expect(rules(bad)).toEqual(["shape"]);
  });
  it.each([
    ["area", { area: "map" }],
    ["kind", { kind: "decision" }],
    ["lens", { lens: "style" }],
  ])("rejects a wrong %s", (_name, extra) => {
    expect(rules(surfaceCard(extra))).toContain("shape");
  });
  it("rejects a non-text brief and a non-text mockup", () => {
    expect(rules(surfaceCard({ brief: 12 }))).toContain("shape");
    expect(rules(surfaceCard({ mockup: ["<p>x</p>"] }))).toContain("shape");
  });
});

describe("a trend digest or a card for surface all must be a direction", () => {
  it("rejects a trend card that is an idea", () => {
    expect(rules(trendCard([TREND], { kind: "idea" }))).toContain("direction-only");
  });
  it("rejects a surface-all card (the style charter) that is an idea", () => {
    expect(rules(surfaceCard({ surface: "all", kind: "idea" }))).toContain("direction-only");
  });
  it("accepts the same cards as directions", () => {
    expect(rules(trendCard([TREND]))).toEqual([]);
    expect(rules(surfaceCard({ surface: "all", kind: "direction" }))).toEqual([]);
  });
});

// --- the brief and the public-repository rule -------------------------------------------------------------------------

describe("brief", () => {
  it("allows exactly 3,000 characters and rejects one more", () => {
    expect(rules(surfaceCard({ brief: "a".repeat(BRIEF_MAX_CHARS) }))).toEqual([]);
    expect(rules(surfaceCard({ brief: "a".repeat(BRIEF_MAX_CHARS + 1) }))).toEqual(["brief-length"]);
  });
  it("counts characters, not bytes", () => {
    expect(rules(surfaceCard({ brief: "é".repeat(BRIEF_MAX_CHARS) }))).toEqual([]);
  });

  it.each([
    ["an e-mail address", "Ask the owner at jane.doe@example.org about it"],
    ["an e-mail address with a plus tag", "write to a+b@mail.example.org"],
  ])("rejects %s", (_name, brief) => {
    expect(rules(surfaceCard({ brief }))).toContain("public-email");
  });
  it.each([
    ["an international number", "Call +27 82 000 0000 today"],
    ["a national number", "Phone 082 000 0000"],
    ["a national number without spaces", "Phone 0820000000"],
    ["a bracketed area code", "Office (012) 000 0000"],
    ["a long run of digits", "Account 12345678901"],
  ])("rejects %s", (_name, brief) => {
    expect(rules(surfaceCard({ brief }))).toContain("public-phone");
  });
  it("does not mistake dates, sizes, counts or the @handle style for contact details", () => {
    const brief = "Measured 2026-10-17T21:19:34Z; screenshots at 375, 768 and 1280 px; 100 of 123 targets; 3,000 characters; see @maintainers and +5 points";
    expect(rules(surfaceCard({ brief }))).toEqual([]);
  });
  it("rejects a claude.ai link and a data: URL, but not the words", () => {
    expect(rules(surfaceCard({ brief: "See https://claude.ai/artifact/abc for the picture" }))).toContain("public-private-link");
    expect(rules(surfaceCard({ brief: "Picture: data:image/png;base64,iVBORw0KGgo=" }))).toContain("public-data-url");
    expect(rules(surfaceCard({ brief: "Pictures are sent as a data: URL in the card, never here" }))).toEqual([]);
  });
  it("applies the same rule to the other text that becomes a public issue", () => {
    expect(detail(surfaceCard({ summary: "Mail jane@example.org" }), "public-email")).toContain("summary");
    expect(detail(surfaceCard({ why: "Call 082 000 0000" }), "public-phone")).toContain("why");
    expect(rules(surfaceCard({ evidence: ["capture 1", "see claude.ai/artifact/x"] }))).toContain("public-private-link");
    expect(rules(surfaceCard({ links: ["https://claude.ai/artifact/x"] }))).toContain("public-private-link");
    // the object form {label, url} that the inbox page reads: both parts are scanned
    expect(detail(surfaceCard({ links: [{ label: "the card", url: "https://claude.ai/artifact/x" }] }), "public-private-link")).toContain("links[0]");
    expect(rules(surfaceCard({ links: [{ label: "mail jane@example.org", url: "https://example.org/a" }] }))).toContain("public-email");
    expect(rules(surfaceCard({ links: [{ label: "Call 082 000 0000", url: "https://example.org/a" }] }))).toContain("public-phone");
    expect(rules(surfaceCard({ links: [{ label: "the pattern", url: "https://example.org/a" }, "https://example.org/b"] }))).toEqual([]);
    expect(rules(surfaceCard({ title: 42 }))).toEqual([]); // a non-text title is the page's problem, not a leak
  });
});

describe("appeal claims are hypotheses", () => {
  const withClaim = (line: string) => surfaceCard({ brief: BRIEF.replace(/Claim.*$/, line) });

  it("rejects a Claim without the word hypothesis, and one that sells engagement", () => {
    const bare = rules(withClaim("Claim: this will boost engagement"));
    expect(bare).toContain("claim-not-hypothesis");
    expect(bare).toContain("claim-engagement");
  });
  it("accepts a hypothesis framed as findability", () => {
    expect(rules(withClaim("Claim (hypothesis): easier to find because the action sits where the thumb already is"))).toEqual([]);
  });
  it("still rejects engagement wording when the word hypothesis is there", () => {
    for (const word of ["engagement", "addictive", "a streak", "urgency", "scarcity", "a countdown"]) {
      expect(rules(withClaim(`Claim (hypothesis): people will come back for ${word}`))).toEqual(["claim-engagement"]);
    }
  });
  it("reads the indented continuation of a Claim, and bullets and bold", () => {
    expect(rules(surfaceCard({ brief: "Claim (hypothesis): easier to find\n  and it raises engagement" }))).toEqual(["claim-engagement"]);
    expect(rules(surfaceCard({ brief: "- **Claim**: faster for everyone" }))).toContain("claim-not-hypothesis");
  });
  it("leaves the rest of the brief alone (the charter says what it never does)", () => {
    expect(rules(surfaceCard({ brief: "We never: streaks, urgency, endless feeds or rankings" }))).toEqual([]);
  });
});

// --- the mockup and the images ----------------------------------------------------------------------------------------

describe("mockup", () => {
  it.each([
    ["a script", "<div><script>alert(1)</script></div>", "mockup-forbidden-tag"],
    ["an onclick", '<button onclick="x()">Go</button>', "mockup-event-attribute"],
    ["an external URL", '<img src="https://example.org/a.png">', "mockup-external-url"],
    ["a 25 KB snippet", "<p>" + "x".repeat(25 * 1024) + "</p>", "mockup-size"],
  ])("rejects %s", (_name, mockup, rule) => {
    expect(rules(surfaceCard({ mockup }))).toContain(rule);
  });
});

describe("before", () => {
  it("accepts a WebP and rejects other formats, bigger images and a label that lies", () => {
    expect(rules(surfaceCard({ before: IMAGE_OK }))).toEqual([]);
    expect(rules(surfaceCard({ before: "data:image/png;base64,iVBORw0KGgo=" }))).toContain("before-not-webp");
    expect(rules(surfaceCard({ before: "https://example.org/a.webp" }))).toContain("before-not-webp");
    expect(rules(surfaceCard({ before: "data:image/webp;base64," + Buffer.from("this is not a webp file at all").toString("base64") }))).toContain("before-not-webp");
    expect(rules(surfaceCard({ before: webpUrl(46000) }))).toEqual([]); // 61,356 characters, just inside 60 KB
    expect(rules(surfaceCard({ before: webpUrl(46100) }))).toContain("before-size");
  });
});

describe("reference pictures", () => {
  const picture = (ref: string, image = IMAGE_OK, label = REF_IMAGE_LABEL) => ({ ref, label, image });

  it("are refused while the switch is off, and the field must simply be absent", () => {
    expect(rules(referenceCard({ refImage: [picture("Maps app")] }))).toEqual(["ref-image-switch-off"]);
    expect(rules(referenceCard({ refImage: [] }))).toEqual([]);
    expect(rules(referenceCard({ refImage: null }))).toEqual([]);
  });
  it("are accepted with the switch on", () => {
    expect(rules(referenceCard({ refImage: [picture("Maps app")] }), { refImages: true })).toEqual([]);
  });
  it("accept the largest image that fits 40 KB and reject one character more", () => {
    expect(parseWebpDataUrl(IMAGE_AT_CAP)).toMatchObject({ ok: true, chars: 40959 });
    expect(rules(referenceCard({ refImage: [picture("Maps app", IMAGE_AT_CAP)] }), { refImages: true })).toEqual([]);
    expect(rules(referenceCard({ refImage: [picture("Maps app", IMAGE_OVER)] }), { refImages: true })).toEqual(["ref-image-size"]);
    expect(detail(referenceCard({ refImage: [picture("Maps app", webpUrl(31000))] }), "ref-image-size", { refImages: true })).toContain("41");
  });
  it("allow three and reject a fourth", () => {
    const three = REFS.slice(0, 3).map((r) => picture(r.name));
    expect(rules(referenceCard({ refImage: three }), { refImages: true })).toEqual([]);
    const four = REFS.map((r) => picture(r.name));
    expect(rules(referenceCard({ refs: REFS, refImage: four }), { refImages: true })).toEqual(["ref-image-count"]);
  });
  it("must carry exactly the label, and be one per reference", () => {
    expect(rules(referenceCard({ refImage: [picture("Maps app", IMAGE_OK, "Reference, not ours")] }), { refImages: true })).toEqual(["ref-image-label"]);
    expect(rules(referenceCard({ refImage: [picture("Maps app", IMAGE_OK, "")] }), { refImages: true })).toEqual(["ref-image-label"]);
    expect(rules(referenceCard({ refImage: [picture("Maps app"), picture("Maps app")] }), { refImages: true })).toEqual(["ref-image-per-reference"]);
    expect(rules(referenceCard({ refImage: [picture("Some other app")] }), { refImages: true })).toEqual(["ref-image-ref"]);
  });
  it("must be WebP", () => {
    const png = picture("Maps app", "data:image/png;base64,iVBORw0KGgo=");
    expect(rules(referenceCard({ refImage: [png] }), { refImages: true })).toEqual(["ref-image-not-webp"]);
  });
});

// --- comparison and trends --------------------------------------------------------------------------------------------

describe("comparison", () => {
  it("allows three rows, including the words not shown and not measured", () => {
    expect(rules(referenceCard({ comparison: [ROW, ROW, ROW] }))).toEqual([]);
    expect(rules(referenceCard({ comparison: [{ ...ROW, them: "Opens a sheet from the pin", us: "3 taps (capture manifest, 2026-10-17)" }] }))).toEqual([]);
  });
  it("rejects four rows", () => {
    expect(rules(referenceCard({ comparison: [ROW, ROW, ROW, ROW] }))).toEqual(["comparison-rows"]);
  });
  it.each(["task", "them", "us", "evidence"])("rejects a row with an empty %s", (cell) => {
    expect(rules(referenceCard({ comparison: [{ ...ROW, [cell]: "  " }] }))).toContain("comparison-cell");
    const missing: Record<string, unknown> = { ...ROW };
    delete missing[cell];
    expect(rules(referenceCard({ comparison: [missing] }))).toContain("comparison-cell");
  });
  it("needs a public link and the date read as evidence", () => {
    expect(rules(referenceCard({ comparison: [{ ...ROW, evidence: "seen on their site" }] }))).toEqual(["comparison-evidence"]);
    expect(rules(referenceCard({ comparison: [{ ...ROW, evidence: "https://example.org/x" }] }))).toEqual(["comparison-evidence"]);
    expect(rules(referenceCard({ comparison: [{ ...ROW, evidence: { url: "https://example.org/x", readAt: "2026-10-17" } }] }))).toEqual([]);
    expect(rules(referenceCard({ comparison: [{ ...ROW, evidence: { url: "javascript:alert(1)", readAt: "2026-10-17" } }] }))).toEqual(["comparison-evidence"]);
  });
});

describe("trends and the evidence rule", () => {
  it("passes a digest with two independent publishers", () => {
    expect(rules(trendCard([TREND]))).toEqual([]);
  });
  it("rejects an adapt or watch item resting on one non-guideline source", () => {
    const one = { ...TREND, sources: [source("https://developer.example.org/guidelines")] };
    expect(rules(trendCard([one]))).toEqual(["trend-evidence"]);
    expect(rules(trendCard([{ ...one, outcome: "watch" }]))).toEqual(["trend-evidence"]);
    expect(rules(trendCard([{ ...one, sources: [] }]))).toEqual(["trend-evidence"]);
  });
  it("accepts a single source that is a platform's own guideline", () => {
    const one = { ...TREND, sources: [source("https://developer.example.org/guidelines", { guideline: true })] };
    expect(rules(trendCard([one]))).toEqual([]);
  });
  it("counts two sub-domains of one publisher once", () => {
    const same = { ...TREND, sources: [source("https://docs.example.org/a"), source("https://blog.example.org/b")] };
    expect(rules(trendCard([same]))).toEqual(["trend-evidence"]);
    const sameCoZa = { ...TREND, sources: [source("https://a.example.co.za/x"), source("https://b.example.co.za/y")] };
    expect(rules(trendCard([sameCoZa]))).toEqual(["trend-evidence"]);
    const other = { ...TREND, sources: [source("https://a.example.co.za/x"), source("https://a.other.co.za/y")] };
    expect(rules(trendCard([other]))).toEqual([]);
  });
  it("lets a dropped item rest on one source", () => {
    const dropped = { ...TREND, outcome: "dropped", fit: { verdict: "REJECT", litmus: 4 }, sources: [source("https://design.example.net/streaks")] };
    expect(rules(trendCard([dropped]))).toEqual([]);
  });
  it("does not count a source dated more than 24 months before it was read", () => {
    const stale = { ...TREND, sources: [source("https://developer.example.org/g", { publishedAt: "2024-10-01" }), source("https://design.example.net/r")] };
    expect(rules(trendCard([stale]))).toEqual(["trend-evidence"]);
    const fresh = { ...TREND, sources: [source("https://developer.example.org/g", { publishedAt: "2024-11-10" }), source("https://design.example.net/r")] };
    expect(rules(trendCard([fresh]))).toEqual([]);
  });
  it("allows five items and rejects six", () => {
    expect(rules(trendCard([TREND, TREND, TREND, TREND, TREND]))).toEqual([]);
    expect(rules(trendCard([TREND, TREND, TREND, TREND, TREND, TREND]))).toEqual(["trends-items"]);
  });
  it("rejects a source that is not a public http(s) address", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "https://10.0.0.1/x", "http://design.example.net/plain", "not a url"]) {
      const bad = { ...TREND, sources: [source(url), source("https://design.example.net/r")] };
      expect(rules(trendCard([bad]))).toContain("bad-url");
    }
  });
  it("rejects an item missing its verdict, litmus number, outcome or dates", () => {
    expect(rules(trendCard([{ ...TREND, fit: { verdict: "MAYBE", litmus: 6 } }]))).toContain("shape");
    expect(rules(trendCard([{ ...TREND, fit: { verdict: "ADAPT", litmus: 7 } }]))).toContain("shape");
    expect(rules(trendCard([{ ...TREND, outcome: "later" }]))).toContain("shape");
    expect(rules(trendCard([{ ...TREND, sources: [{ url: "https://developer.example.org/g" }, source("https://design.example.net/r")] }]))).toContain("shape");
  });
  it("belongs to the digest: a trends field elsewhere, or a digest without trends, fails", () => {
    expect(rules(surfaceCard({ trends: [TREND] }))).toContain("trends-wrong-lens");
    expect(rules(trendCard(undefined as unknown as unknown[]))).toContain("trends-missing");
    expect(rules(trendCard([]))).toEqual(["trends-missing"]); // nothing qualified means no card, not an empty digest
  });
  it("needs real calendar dates, not just the right shape", () => {
    const bad = (extra: Record<string, unknown>) => trendCard([{ ...TREND, sources: [source("https://developer.example.org/g", extra), source("https://design.example.net/r")] }]);
    expect(rules(bad({ readAt: "2026-13-45" }))).toContain("shape");
    expect(rules(bad({ publishedAt: "2026-02-30" }))).toContain("shape");
    expect(rules(bad({ readAt: "2026-11-03T11:20:00Z", publishedAt: "2026-05-01" }))).toEqual([]);
  });
});

describe("refs", () => {
  it("must be public http(s) sources", () => {
    expect(rules(referenceCard({ refs: [{ ...REFS[0], url: "javascript:alert(1)" }] }))).toEqual(["bad-url"]);
    expect(rules(referenceCard({ refs: [{ url: REFS[0].url }] }))).toEqual(["shape"]);
  });
});

// --- size and the worst case ------------------------------------------------------------------------------------------

describe("card size", () => {
  it("is held under the cap that leaves room in the inbox's document limit", () => {
    expect(CARD_MAX_BYTES).toBeLessThan(DOCUMENT_LIMIT_BYTES);
    const big = surfaceCard({ padding: "a".repeat(CARD_MAX_BYTES) });
    expect(rules(big)).toEqual(["card-size"]);
    expect(rules(surfaceCard({ padding: "a".repeat(100000) }))).toEqual([]);
  });

  it("holds a card with every field at its cap, with room to spare under the database's limit", () => {
    // 24 KB of quote-heavy mockup (the worst case for JSON escaping), 60 KB before, three 40 KB reference pictures,
    // a full brief, five trend items, three comparison rows and three refs.
    const piece = '<p style="color: var(--text-1)">x</p>';
    const mockup = piece.repeat(Math.floor((24 * 1024) / piece.length));
    const brief = (BRIEF + "\n").repeat(30).slice(0, BRIEF_MAX_CHARS);
    const card = trendCard([TREND, TREND, TREND, TREND, TREND], {
      mockup,
      brief,
      before: webpUrl(46000),
      refs: REFS.slice(0, 3),
      comparison: [ROW, ROW, ROW],
      refImage: REFS.slice(0, 3).map((r) => ({ ref: r.name, label: REF_IMAGE_LABEL, image: IMAGE_AT_CAP })),
    });
    const r = validateCard(card, { refImages: true });
    expect(r.violations).toEqual([]);
    expect(r.bytes).toBeGreaterThan(200 * 1024);
    expect(r.bytes).toBeLessThan(CARD_MAX_BYTES);
    expect(DOCUMENT_LIMIT_BYTES - r.bytes).toBeGreaterThan(20 * 1024);
  });
});

describe("publisherKey", () => {
  it.each([
    ["developer.android.com", "android.com"],
    ["m3.material.io", "material.io"],
    ["example.org", "example.org"],
    ["a.b.example.co.za", "example.co.za"],
    ["news.example.com.au", "example.com.au"],
    ["localhost", "localhost"],
  ])("%s -> %s", (host, key) => {
    expect(publisherKey(host)).toBe(key);
  });
});

// --- the command line ------------------------------------------------------------------------------------------------

describe("the command line", () => {
  const script = join(__dirname, "..", "..", "..", "scripts", "design", "validate-card.mjs");
  const run = (args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

  it("exits 0 for a clean card, 1 for a violation, 2 with no file, and honours --ref-images", () => {
    const dir = mkdtempSync(join(tmpdir(), "validate-card-"));
    try {
      const clean = join(dir, "clean.json");
      const bad = join(dir, "bad.json");
      const withPicture = join(dir, "picture.json");
      const broken = join(dir, "broken.json");
      writeFileSync(clean, JSON.stringify(surfaceCard()));
      writeFileSync(bad, JSON.stringify(surfaceCard({ mockup: "<script>alert(1)</script>" })));
      writeFileSync(withPicture, JSON.stringify(referenceCard({ refImage: [{ ref: "Maps app", label: REF_IMAGE_LABEL, image: IMAGE_OK }] })));
      writeFileSync(broken, "{ not json");

      const ok = run([clean]);
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain("ok");

      const fail = run([bad]);
      expect(fail.status).toBe(1);
      expect(fail.stdout).toContain("mockup-forbidden-tag");

      const off = run([withPicture]);
      expect(off.status).toBe(1);
      expect(off.stdout).toContain("ref-image-switch-off");
      expect(run(["--ref-images", withPicture]).status).toBe(0);

      const several = run([clean, broken, bad]); // every file is read; one bad file fails the run
      expect(several.status).toBe(1);
      expect(several.stdout).toContain("unreadable");
      expect(run([]).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // seven node start-ups: well over vitest's 5 s default on a busy machine
  }, 60_000);
});
