import { describe, it, expect } from "vitest";
import { buildXlsx, columnLetter, type XlsxCell } from "@/lib/analytics/xlsx";

/** Decode the (uncompressed/stored) zip bytes to a latin1 string so we can
 *  assert on the cleartext OOXML parts without mangling the binary headers. */
function asText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

describe("columnLetter", () => {
  it("maps 0-based indices to spreadsheet column letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(52)).toBe("BA");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
  });
});

describe("buildXlsx", () => {
  const header = ["date", "metric", "value"];
  const rows: XlsxCell[][] = [["2026-01-01", "follows", 12]];

  it("produces a valid ZIP container (PK local + central + EOCD signatures)", () => {
    const out = buildXlsx("Analytics", header, rows);
    expect(out).toBeInstanceOf(Uint8Array);
    // Local file header signature.
    expect(out[0]).toBe(0x50);
    expect(out[1]).toBe(0x4b);
    expect(out[2]).toBe(0x03);
    expect(out[3]).toBe(0x04);
    const text = asText(out);
    // Central directory + end-of-central-directory signatures present.
    expect(text).toContain("PK\x01\x02");
    expect(text).toContain("PK\x05\x06");
  });

  it("includes the required OOXML parts", () => {
    const text = asText(buildXlsx("Analytics", header, rows));
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("_rels/.rels");
    expect(text).toContain("xl/workbook.xml");
    expect(text).toContain("xl/_rels/workbook.xml.rels");
    expect(text).toContain("xl/worksheets/sheet1.xml");
  });

  it("writes text as inline strings and numbers as numeric cells", () => {
    const text = asText(buildXlsx("Analytics", header, rows));
    // Header A1 is an inline string.
    expect(text).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">date</t></is></c>');
    // The numeric value 12 lands in C2 as a number cell, not an inline string.
    expect(text).toContain('<c r="C2"><v>12</v></c>');
    expect(text).not.toContain('<t xml:space="preserve">12</t>');
  });

  it("XML-escapes special characters", () => {
    const text = asText(
      buildXlsx("S", ["h"], [['a & b <c> "d"']]),
    );
    expect(text).toContain("a &amp; b &lt;c&gt; &quot;d&quot;");
  });

  it("does NOT prefix formula-like text with an apostrophe (inline strings are inert)", () => {
    const text = asText(buildXlsx("S", ["h"], [["=cmd|'/c calc'!A0"]]));
    // Real xlsx inline strings are never evaluated as formulas, so the value
    // must be stored verbatim (escaped) — no leading apostrophe corruption.
    expect(text).toContain("<t xml:space=\"preserve\">=cmd|'/c calc'!A0</t>");
    expect(text).not.toContain("'=cmd");
  });

  it("emits a blank (no cell) for null/undefined values", () => {
    const text = asText(buildXlsx("S", ["a", "b"], [[null, "x"]]));
    // Row 2 should have no A2 cell but should have B2.
    expect(text).not.toContain('r="A2"');
    expect(text).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">x</t></is></c>');
  });

  it("sanitises the sheet name (strips illegal chars, caps length)", () => {
    const text = asText(buildXlsx("My/Sheet:Name?[here]", ["h"], [["v"]]));
    // Illegal chars replaced with spaces, then trimmed; name in workbook.xml.
    expect(text).toContain('<sheet name="My Sheet Name  here" sheetId="1"');
  });

  it("handles an empty data set (header only)", () => {
    const out = buildXlsx("Empty", ["a", "b"], []);
    const text = asText(out);
    expect(text).toContain('<row r="1">');
    expect(text).not.toContain('<row r="2">');
  });
});
