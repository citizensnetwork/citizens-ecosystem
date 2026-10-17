/**
 * The drift index, version 1 (docs/design/DRIFT_INDEX.md; Designer build, phase 2). The counter is frozen:
 * these tests pin its rules with fixtures whose counts are known by hand, so a quiet change to a set, an
 * exclusion, a counted kind, the gold band or the formula fails here and has to become a founder decision.
 * The fixture holds the gold values the platform really has (Map v2's, Connect's crown gold, Wear's and
 * Vision's), which is the case the first specification got wrong.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KINDS, REPO_ROOT, analyseFiles, analyseRepo, driftIndex, isFillGold, normalise, prepare, scan } from "../../../scripts/design/drift.mjs";

const file = (text: string, path = "fixture.css") => ({ path, text });

const CSS = [
  ":root {",
  "  --gold: #C9A84C;", // token lines: no distinct value, but two golds
  "  --crown: #D4AF37;",
  "}",
  ".a { color: #fff; background: #FFFFFF; font-size: 13px; border-radius: 8px;",
  "  box-shadow: 0 1px 3px rgba(0, 0, 0, .2); z-index: 5; }",
  ".b { color: var(--gold); font-size: 13px; border-radius: 12px; }",
  "/* .c { color: #123456; font-size: 99px } */",
].join("\n");

describe("normalise", () => {
  it("lower-cases, drops whitespace, expands 3-digit hex and writes .5 as 0.5", () => {
    expect(normalise("#FFF")).toBe("#ffffff");
    expect(normalise("rgba(0, 0, 0, .5)")).toBe("rgba(0,0,0,0.5)");
    expect(normalise("0_4px_14px")).toBe("04px14px");
    expect(normalise("  13px; ")).toBe("13px");
  });
});

describe("isFillGold", () => {
  it("accepts the fill golds the platform actually has", () => {
    for (const c of ["#c9a84c", "#d4af37", "#c9a24a", "#f2ba1b", "#f0c024"]) expect(isFillGold(c), c).toBe(true);
  });
  it("leaves out ink, tints, orange, neutrals, alpha forms and functions", () => {
    for (const c of ["#8b6914", "#e8d48b", "#f3c636", "#d97706", "#ffffff", "#0a0908", "#c9a84c80", "rgba(201,168,76,0.3)", "#fff"]) expect(isFillGold(c), c).toBe(false);
  });
});

describe("scan and analyseFiles", () => {
  it("counts the distinct values outside token lines, by kind, and ignores comments and var()", () => {
    const a = analyseFiles([file(CSS)]);
    expect([...a.outside.colours].sort()).toEqual(["#ffffff", "rgba(0,0,0,0.2)"]); // #fff and #FFFFFF are one value
    expect([...a.outside.fontSizes]).toEqual(["13px"]);
    expect([...a.outside.radii].sort()).toEqual(["12px", "8px"]);
    expect([...a.outside.shadows]).toEqual(["01px3pxrgba(0,0,0,0.2)"]);
    expect([...a.outside.zIndex]).toEqual(["5"]);
    expect(a.distinct).toBe(2 + 1 + 2 + 1 + 1);
  });

  it("counts golds over every colour literal, token lines included, and adds 5 per extra gold", () => {
    const a = analyseFiles([file(CSS)]);
    expect(a.golds).toEqual(["#c9a84c", "#d4af37"]);
    expect(a.di).toBeCloseTo((7 + 5) / (a.loc / 1000), 10);
  });

  it("finds three base golds when three are present (the case the first count missed)", () => {
    const jsx = "const s = { color: '#F2BA1B' };\nconst t = { color: '#C9A84C' };\nconst u = { color: '#D4AF37' };";
    expect(analyseFiles([file(jsx, "x.jsx")]).golds).toEqual(["#c9a84c", "#d4af37", "#f2ba1b"]);
  });

  it("reads inline JSX styles: bare numbers are px", () => {
    const jsx = "h('div', { style: { fontSize: 13, borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,.1)', zIndex: 30 } })";
    const a = analyseFiles([file(jsx, "x.jsx")]);
    expect([...a.outside.fontSizes]).toEqual(["13px"]);
    expect([...a.outside.radii]).toEqual(["10px"]);
    expect([...a.outside.shadows]).toEqual(["02px4pxrgba(0,0,0,0.1)"]);
    expect([...a.outside.zIndex]).toEqual(["30"]);
  });

  it("treats the Tailwind config block and custom-property lines as token lines", () => {
    const html = [
      "<script>",
      "  tailwind.config = {",
      "    theme: { extend: { colors: { gold: '#C9A84C', ink: '#0A0908' } } },",
      "  };",
      "</script>",
      "<style>",
      "  :root {",
      "    --a: #112233;",
      "  }",
      "  .x { color: #445566; }",
      "</style>",
    ].join("\n");
    const a = analyseFiles([file(html, "index.html")]);
    expect([...a.outside.colours]).toEqual(["#445566"]);
    expect(a.golds).toEqual(["#c9a84c"]);
  });

  it("frozen v1 rule: a declaration is a token line only when it starts the line", () => {
    const oneLine = scan(prepare(":root { --a: #112233; }"), false);
    expect([...oneLine.colours]).toEqual(["#112233"]); // written on the selector's line, so it is counted
    const ownLine = scan(prepare(":root {\n  --a: #112233;\n}"), false);
    expect([...ownLine.colours]).toEqual([]);
  });

  it("strips block, HTML and line comments but keeps a // that is part of an address", () => {
    const text = "<!-- #aaaaaa -->\n/* #bbbbbb */\n// #cccccc\nx = { color: '#dddddd' } // #eeeeee\nimg = 'https://host.test/a#ffffff'";
    const found = scan(prepare(text), false);
    expect([...found.colours]).toEqual(["#dddddd"]); // the address fragment is word-adjacent, not a colour
  });

  it("skips the Google sign-in mark, template-built values and none/0/inherit", () => {
    const jsx = "p({ fill: '#4285F4' }); q({ fill: '#FFC107' });\nr({ boxShadow: `0 3px 12px ${hex}55` });\n.a{ border-radius: 0; box-shadow: none; font-size: inherit; z-index: 0 }";
    const a = analyseFiles([file(jsx, "x.jsx")]);
    expect(a.distinct).toBe(0);
  });

  it("frozen v1 quirk: a shadow built by concatenation is counted by its leading literal", () => {
    const a = analyseFiles([file("box({ boxShadow: '0 0 2px '+fill+'73' });", "x.jsx")]);
    expect([...a.outside.shadows]).toEqual(["002px"]);
  });

  it("is the same for LF and CRLF files in the values it finds", () => {
    const lf = analyseFiles([file(CSS)]);
    const crlf = analyseFiles([file(CSS.replace(/\n/g, "\r\n"))]);
    expect(crlf.distinct).toBe(lf.distinct);
    expect(crlf.golds).toEqual(lf.golds);
  });
});

describe("driftIndex", () => {
  it("adds 5 for each fill gold beyond the first and divides by thousands of lines", () => {
    expect(driftIndex(100, 0, 1000)).toBe(100);
    expect(driftIndex(100, 1, 1000)).toBe(100);
    expect(driftIndex(100, 3, 1000)).toBe(110);
    expect(driftIndex(50, 2, 500)).toBe(110);
  });

  it("is 0, not NaN or Infinity, for an empty source set", () => {
    expect(driftIndex(0, 0, 0)).toBe(0);
    expect(driftIndex(5, 3, 0)).toBe(0);
  });
});

describe("analyseRepo", () => {
  const sources: Record<string, string> = {
    "apps/connect/src/frontend/a.css": ".a { color: #C9A84C; border-radius: 8px; font-size: 13px; }",
    "apps/vision/src/frontend/b.jsx": "x({ color: '#C9A84C', fontSize: 13, borderRadius: 10 }); y({ color: '#F0C024' });",
    "apps/vision/src/frontend/vendor/ignored.css": ".z { color: #123456 }",
    "apps/wear/src/frontend/c.html": "<style>.w { color: #F2BA1B; z-index: 30 }</style>",
    "packages/ui/src/tokens.ts": "export const gold = '#C9A24A';",
  };
  const list = (dirs: string[]) => Object.keys(sources).filter((p) => dirs.some((d) => p.startsWith(d + "/")) && !p.includes("/vendor/"));
  const r = analyseRepo({ list, read: (p: string) => sources[p] });

  it("reads each app's own set and never a vendor path", () => {
    expect(r.apps.connect.files).toBe(1);
    expect(r.apps.vision.files).toBe(1);
    expect(r.apps.wear.files).toBe(1);
    expect([...r.apps.vision.outside.colours].sort()).toEqual(["#c9a84c", "#f0c024"]);
  });

  it("counts a value shared by two apps once in the total and takes the union of golds", () => {
    expect(r.apps.connect.distinct + r.apps.vision.distinct + r.apps.wear.distinct).toBeGreaterThan(r.total.distinct);
    expect(r.total.golds).toEqual(["#c9a84c", "#f0c024", "#f2ba1b"]);
  });

  it("reads packages/ui for golds only and reports the platform's golds", () => {
    expect(r.ui.golds).toEqual(["#c9a24a"]);
    expect(r.platform).toEqual(["#c9a24a", "#c9a84c", "#f0c024", "#f2ba1b"]);
  });
});

describe("the real repository", () => {
  it("reads the three frontends and returns finite numbers (the baseline itself lives in DRIFT_INDEX.md and moves with the code)", () => {
    const r = analyseRepo(); // inside the test, so a missing git is a failing test and not a collection error
    for (const app of ["connect", "vision", "wear"] as const) {
      expect(r.apps[app].files, app).toBeGreaterThan(0);
      expect(Number.isFinite(r.apps[app].di), app).toBe(true);
    }
    for (const k of KINDS) expect(r.apps.connect.outside[k]).toBeInstanceOf(Set);
  });

  it("agrees with the Map v2 token test: the stylesheet itself has no raw value outside its token blocks", () => {
    const css = readFileSync(join(REPO_ROOT, "apps/connect/src/frontend/assets/map-v2.css"), "utf8");
    expect(analyseFiles([{ path: "map-v2.css", text: css }]).distinct).toBe(0);
  });
});
